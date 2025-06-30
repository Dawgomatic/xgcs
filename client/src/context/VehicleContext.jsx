import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  Cartesian3,
  Math as CesiumMath,
  HeadingPitchRoll,
  Transforms,
  SampledPositionProperty,
  JulianDate,
  TimeIntervalCollection,
  TimeInterval,
  PolylineGlowMaterialProperty,
  ConstantPositionProperty
} from 'cesium';
import { Color as CesiumColor } from '@cesium/engine';

const VehicleContext = createContext(null);

export function VehicleProvider({ children }) {
  const [connectedVehicles, setConnectedVehicles] = useState([]);
  const [vehicleEntities, setVehicleEntities] = useState({});
  const [telemetryData, setTelemetryData] = useState({});
  const telemetryIntervals = useRef({});
  const viewerRef = useRef(null);
  const pathInitializedRef = useRef({});
  const previousPositionRef = useRef({});

  // Set Cesium viewer reference for use in entity creation
  const setViewer = useCallback((viewer) => {
    viewerRef.current = viewer;
  }, []);

  // Load saved connections from localStorage on mount
  useEffect(() => {
    const savedItems = localStorage.getItem('items');
    if (savedItems) {
      try {
        const items = JSON.parse(savedItems);
        // Convert saved items to connected vehicles format
        const vehicles = items.map(item => ({
          id: item.name,
          name: item.name,
          connected: false // Will be updated by fetchConnectedVehicles
        }));
        setConnectedVehicles(vehicles);
      } catch (error) {
        console.error('Error loading saved connections:', error);
      }
    }
  }, []);

  // Fetch connected vehicles 
  useEffect(() => {
    const fetchConnectedVehicles = async () => {
      try {
        const response = await fetch('/api/connections');
        if (response.ok) {
          const data = await response.json();
          const backendConnections = data.connections || [];
          
          // Merge with saved connections from localStorage
          const savedItems = localStorage.getItem('items');
          let savedConnections = [];
          if (savedItems) {
            try {
              const items = JSON.parse(savedItems);
              savedConnections = items.map(item => ({
                id: item.name,
                name: item.name,
                connectionDetails: item.connectionDetails
              }));
            } catch (error) {
              console.error('Error parsing saved connections:', error);
            }
          }
          
          // Update connection status based on backend
          const updatedConnections = savedConnections.map(saved => {
            const backendConnection = backendConnections.find(bc => 
              bc.id === saved.id || bc.id === `SITL: ${saved.name}` || bc.id === saved.name
            );
            return {
              ...saved,
              connected: !!backendConnection
            };
          });
          
          setConnectedVehicles(updatedConnections);
          
          // Start telemetry for newly connected vehicles
          backendConnections.forEach(connection => {
            if (connection.connected && !telemetryIntervals.current[connection.id]) {
              startTelemetryPolling(connection.id);
            }
          });
        }
      } catch (error) {
        console.error('Error fetching connections:', error);
      }
    };

    // Fetch initially
    fetchConnectedVehicles();

    // Set up polling
    const interval = setInterval(fetchConnectedVehicles, 5000);
    
    return () => clearInterval(interval);
  }, []);

  // Start telemetry polling for a vehicle
  const startTelemetryPolling = (vehicleId) => {
    // Clear any existing interval for this vehicle
    if (telemetryIntervals.current[vehicleId]) {
      clearInterval(telemetryIntervals.current[vehicleId]);
    }
    
    // Function to fetch telemetry data
    const fetchTelemetry = async () => {
      try {
        // Try different vehicle ID formats
        const vehicleIdVariations = [
          vehicleId,
          `SITL: ${vehicleId}`,
          vehicleId.replace('SITL: ', '')
        ];
        
        let telemetryData = null;
        for (const id of vehicleIdVariations) {
          try {
            const response = await fetch(`/api/telemetry?vehicleId=${encodeURIComponent(id)}`);
            if (response.ok) {
              const data = await response.json();
              if (data.success && data.position) {
                telemetryData = data;
                break;
              }
            }
          } catch (error) {
            console.error(`Error fetching telemetry for ${id}:`, error);
          }
        }
        
        if (telemetryData) {
          setTelemetryData(prev => ({
            ...prev,
            [vehicleId]: telemetryData
          }));
          
          if (viewerRef.current) {
            updateVehicleEntity(vehicleId, telemetryData);
          }
        }
      } catch (error) {
        console.error(`Error fetching telemetry for ${vehicleId}:`, error);
      }
    };
    
    fetchTelemetry();
    
    const intervalId = setInterval(fetchTelemetry, 100);
    telemetryIntervals.current[vehicleId] = intervalId;
    
    return intervalId;
  };

  // Stop telemetry polling for a vehicle
  const stopTelemetryPolling = (vehicleId) => {
    if (telemetryIntervals.current[vehicleId]) {
      clearInterval(telemetryIntervals.current[vehicleId]);
      delete telemetryIntervals.current[vehicleId];
    }
  };

  // Update or create a vehicle entity based on telemetry data
  const updateVehicleEntity = (vehicleId, data) => {
    if (!viewerRef.current) {
      console.warn("updateVehicleEntity called but viewerRef is not current.");
      return;
    }
    
    const viewer = viewerRef.current;
    const pathEntityId = `${vehicleId}_path`;

    let entity = viewer.entities.getById(vehicleId);

    // --- Entity Creation Block ---
    if (!entity) {
      console.warn(`Creating NEW Cesium entity for vehicleId: ${vehicleId}`);
      const vehicleConfig = connectedVehicles.find(v => v.id === vehicleId || v.name === vehicleId);
      
      if (!vehicleConfig) {
        console.warn(`Vehicle config not found for ${vehicleId}`);
        return;
      }
      
      // Create a new entity
      const entityProperties = {
        id: vehicleId,
        // Position and path will be added on first/second update
        orientation: undefined, 
        label: {
          text: vehicleId,
          font: '14pt sans-serif',
          style: 1, // LabelStyle.FILL_AND_OUTLINE
          outlineWidth: 2,
          verticalOrigin: 0, // VerticalOrigin.CENTER
          horizontalOrigin: 0, // HorizontalOrigin.CENTER
          pixelOffset: {
            x: 0,
            y: -50
          }
        } // Removed path from initial creation
      };

      // Conditionally add model or point
      if (vehicleConfig && vehicleConfig.modelUrl) {
        console.log(`Using model URL for ${vehicleId}: ${vehicleConfig.modelUrl}`);
        entityProperties.model = {
          uri: vehicleConfig.modelUrl,
          scale: vehicleConfig.modelScale || 5.0,
          minimumPixelSize: 128,
          maximumScale: 20000
        };
      } else {
        console.log(`No model URL for ${vehicleId}, using fallback point.`);
        entityProperties.point = {
          pixelSize: 15,
          color: CesiumColor.RED,
          outlineColor: CesiumColor.WHITE,
          outlineWidth: 2
        };
      }

      entity = viewer.entities.add(entityProperties);
      
      // Note: Position is NOT set here initially
      setVehicleEntities(prev => ({ ...prev, [vehicleId]: entity })); // Store main entity ref
      pathInitializedRef.current[vehicleId] = false; // Initial state
      delete previousPositionRef.current[vehicleId]; // Clear any stale previous position
      console.log(`[${new Date().toISOString()}] Created minimal entity for ${vehicleId}`);
    } // End of if(!entity)
    
    // --- Handle position and path updates ---
    if (entity && data && data.position) {
      const positionCartesian = Cartesian3.fromDegrees(
        data.position.lng,
        data.position.lat,
        data.position.alt
      );
      const time = JulianDate.now();

      // --- Update Main Entity Position ALWAYS ---
      // Keep the main entity's position as a simple Cartesian3/ConstantPositionProperty
      entity.position = positionCartesian;

      // --- Path Entity Logic ---
      const initState = pathInitializedRef.current[vehicleId];

      if (initState === true) {
        // Path fully initialized, add sample to path entity
        const pathEntity = viewer.entities.getById(pathEntityId);
        if (pathEntity && pathEntity.position instanceof SampledPositionProperty) {
          pathEntity.position.addSample(time, positionCartesian);
        } else if (pathEntity) {
          console.warn(`[${new Date().toISOString()}] Path entity found for ${vehicleId}, but its position is not SampledPositionProperty.`);
          // Attempt recovery? Or assume it will fix itself if init state was wrong?
        } else {
          console.warn(`[${new Date().toISOString()}] Path entity ${pathEntityId} not found even though init flag is true.`);
          // Reset flag?
          pathInitializedRef.current[vehicleId] = false;
        }

      } else if (initState === 'pending') {
        // Second update: Initialize SampledPositionProperty and create path entity
        const previousPosition = previousPositionRef.current[vehicleId];

        if (previousPosition) {
          console.log(`[${new Date().toISOString()}] Initializing path entity for ${vehicleId}`);
          const previousTime = JulianDate.addSeconds(time, -0.1, new JulianDate()); // Estimate previous time

          const pathSampledPosition = new SampledPositionProperty();
          pathSampledPosition.addSample(previousTime, previousPosition);
          pathSampledPosition.addSample(time, positionCartesian);

          // Create/Configure the path entity
          const pathEntity = viewer.entities.getOrCreateEntity(pathEntityId);
          pathEntity.position = pathSampledPosition; // Assign ONLY to path entity
          pathEntity.path = {
            resolution: 0.01,
            material: new PolylineGlowMaterialProperty({
              glowPower: 0.2,
              color: CesiumColor.YELLOW,
            }),
            width: 5,
            leadTime: 0,
            trailTime: 60,
          };
          console.log(`[${new Date().toISOString()}] Path entity ${pathEntityId} configured.`);

          // *** Set the flag to true ***
          pathInitializedRef.current[vehicleId] = true;
          delete previousPositionRef.current[vehicleId]; // Clean up stored position

        } else {
          console.error(`[${new Date().toISOString()}] Path init state is 'pending' but no previous position found for ${vehicleId}. Resetting.`);
          pathInitializedRef.current[vehicleId] = false; // Reset state
        }

      } else { // initState === false
        // First update: Store position and set flag to 'pending'
        console.log(`[${new Date().toISOString()}] Storing initial position for path generation for ${vehicleId}`);
        previousPositionRef.current[vehicleId] = positionCartesian.clone(); // Store a copy
        pathInitializedRef.current[vehicleId] = 'pending';
      }

      // --- Attitude Update (applies to main entity) ---
      if (data.attitude) {
        const hpr = new HeadingPitchRoll(
          CesiumMath.toRadians(data.attitude.yaw),
          CesiumMath.toRadians(data.attitude.pitch),
          CesiumMath.toRadians(data.attitude.roll)
        );
        entity.orientation = Transforms.headingPitchRollQuaternion(
          positionCartesian,
          hpr
        );
      } else {
        // Explicitly clear orientation if attitude data is missing?
        // entity.orientation = undefined; 
      }
    }
  };

  // Disconnect a vehicle
  const disconnectVehicle = async (vehicleId) => {
    try {
      const response = await fetch('/api/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          name: vehicleId
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // Stop polling for this vehicle
        stopTelemetryPolling(vehicleId);
        const pathEntityId = `${vehicleId}_path`; // Ensure ID is defined
        
        // Remove main entity
        if (vehicleEntities[vehicleId] && viewerRef.current) {
          viewerRef.current.entities.remove(vehicleEntities[vehicleId]);
          setVehicleEntities(prev => {
            const updated = {...prev};
            delete updated[vehicleId];
            return updated;
          });
          console.log(`Removed main entity ${vehicleId}`);
        }
        
        // Remove PATH entity using its ID
        if (viewerRef.current) {
          const pathEntityToRemove = viewerRef.current.entities.getById(pathEntityId);
          if (pathEntityToRemove) {
            viewerRef.current.entities.remove(pathEntityToRemove);
            console.log(`Removed path entity ${pathEntityId}`);
          } else {
            console.log(`Path entity ${pathEntityId} not found during disconnect.`);
          }
        }
        
        // *** Clear BOTH refs ***
        delete pathInitializedRef.current[vehicleId];
        delete previousPositionRef.current[vehicleId];
        
        // Remove telemetry data
        setTelemetryData(prev => {
          const updated = {...prev};
          delete updated[vehicleId];
          return updated;
        });
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error disconnecting vehicle:', error);
      return false;
    }
  };

  // Determine active vehicle (first connected vehicle with telemetry, fallback to any telemetry)
  let activeVehicle = null;
  
  // First, try to find a connected vehicle with telemetry
  activeVehicle = connectedVehicles
    .map(v => ({ ...v, telemetry: telemetryData[v.id] }))
    .find(v => v.connected && v.telemetry) || null;
  
  // Fallback: if no connected vehicle with telemetry, use the first telemetry entry
  if (!activeVehicle && Object.keys(telemetryData).length > 0) {
    const firstTelemetryId = Object.keys(telemetryData)[0];
    const telemetry = telemetryData[firstTelemetryId];
    // Create a vehicle object from the telemetry data
    activeVehicle = { 
      id: firstTelemetryId, 
      name: firstTelemetryId, 
      connected: true,
      connectionStatus: telemetry.connectionStatus || 'connected',
      flightMode: telemetry.flight_mode || 'UNKNOWN',
      batteryLevel: telemetry.battery?.remaining || 0,
      airspeed: telemetry.velocity?.airspeed || 0,
      groundspeed: telemetry.velocity?.groundspeed || 0,
      heading: telemetry.velocity?.heading || 0,
      altitude: telemetry.position?.alt || 0,
      gpsSatellites: telemetry.gps?.satellites || 0,
      gpsFixType: telemetry.gps?.fix_type || 0,
      coordinate: telemetry.position ? {
        lat: telemetry.position.lat,
        lon: telemetry.position.lng
      } : null,
      ...telemetry
    };
  }
  
  // Set the global activeVehicleId for the FlightModeSelector
  if (activeVehicle) {
    window.activeVehicleId = activeVehicle.id;
  }
  // This ensures the UI always shows the actual connected vehicle, even if the IDs don't match exactly (Jeremy requested this logic)

  // Create vehicles array with telemetry data for FlightDisplay
  const vehicles = connectedVehicles.map(v => {
    const telemetry = telemetryData[v.id];
    return {
      id: v.id,
      name: v.name,
      connected: v.connected,
      connectionStatus: telemetry?.connectionStatus || (v.connected ? 'connected' : 'disconnected'),
      flightMode: telemetry?.flight_mode || 'UNKNOWN',
      batteryLevel: telemetry?.battery?.remaining || 0,
      airspeed: telemetry?.velocity?.airspeed || 0,
      groundspeed: telemetry?.velocity?.groundspeed || 0,
      heading: telemetry?.velocity?.heading || 0,
      altitude: telemetry?.position?.alt || 0,
      gpsSatellites: telemetry?.gps?.satellites || 0,
      gpsFixType: telemetry?.gps?.fix_type || 0,
      coordinate: telemetry?.position ? {
        lat: telemetry.position.lat,
        lon: telemetry.position.lng
      } : null,
      ...telemetry
    };
  });
  
  // Also add any telemetry data that doesn't have a corresponding connected vehicle
  Object.keys(telemetryData).forEach(telemetryId => {
    const existingVehicle = vehicles.find(v => v.id === telemetryId);
    if (!existingVehicle) {
      const telemetry = telemetryData[telemetryId];
      vehicles.push({
        id: telemetryId,
        name: telemetryId,
        connected: true,
        connectionStatus: telemetry.connectionStatus || 'connected',
        flightMode: telemetry.flight_mode || 'UNKNOWN',
        batteryLevel: telemetry.battery?.remaining || 0,
        airspeed: telemetry.velocity?.airspeed || 0,
        groundspeed: telemetry.velocity?.groundspeed || 0,
        heading: telemetry.velocity?.heading || 0,
        altitude: telemetry.position?.alt || 0,
        gpsSatellites: telemetry.gps?.satellites || 0,
        gpsFixType: telemetry.gps?.fix_type || 0,
        coordinate: telemetry.position ? {
          lat: telemetry.position.lat,
          lon: telemetry.position.lng
        } : null,
        ...telemetry
      });
    }
  });

  return (
    <VehicleContext.Provider value={{
      connectedVehicles,
      vehicleEntities,
      telemetryData,
      activeVehicle,
      vehicles,
      setViewer,
      startTelemetryPolling,
      stopTelemetryPolling,
      disconnectVehicle
    }}>
      {children}
    </VehicleContext.Provider>
  );
}

export function useVehicles() {
  const context = useContext(VehicleContext);
  if (!context) {
    throw new Error('useVehicles must be used within a VehicleProvider');
  }
  return context;
}
