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

  // Fetch connected vehicles 
  useEffect(() => {
    const fetchConnectedVehicles = async () => {
      try {
        const response = await fetch('http://localhost:3001/connections');
        if (response.ok) {
          const data = await response.json();
          setConnectedVehicles(data.connections || []);
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
        const response = await fetch(`http://localhost:3001/telemetry?vehicleId=${vehicleId}`);
        if (response.ok) {
          const data = await response.json();
          setTelemetryData(prev => ({
            ...prev,
            [vehicleId]: data
          }));
          
          if (viewerRef.current) {
            updateVehicleEntity(vehicleId, data);
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
            resolution: 1,
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
      const response = await fetch('http://localhost:3001/disconnect', {
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

  return (
    <VehicleContext.Provider value={{
      connectedVehicles,
      vehicleEntities,
      telemetryData,
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
