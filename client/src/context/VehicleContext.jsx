import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  Cartesian3,
  Math as CesiumMath,
  HeadingPitchRoll,
  Transforms,
  // Remove SampledPositionProperty & JulianDate if no longer needed here
  // SampledPositionProperty, 
  // JulianDate
} from 'cesium';
import { Color as CesiumColor } from '@cesium/engine';

const VehicleContext = createContext(null);

export function VehicleProvider({ children }) {
  const [connectedVehicles, setConnectedVehicles] = useState([]);
  const [vehicleEntities, setVehicleEntities] = useState({});
  const [telemetryData, setTelemetryData] = useState({});
  const telemetryIntervals = useRef({});
  const viewerRef = useRef(null);

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

    // --- Add detailed logging before the check ---
    console.log(`[${new Date().toISOString()}] updateVehicleEntity called with vehicleId:`, vehicleId);
    try {
      const currentEntityIds = viewer.entities.values.map(e => e.id);
      console.log(`[${new Date().toISOString()}] Cesium known entity IDs before getById:`, currentEntityIds);
    } catch (e) {
      console.error("Error getting entity IDs:", e)
    }
    const foundEntity = viewer.entities.getById(vehicleId);
    console.log(`[${new Date().toISOString()}] Result of viewer.entities.getById('${vehicleId}'):`, foundEntity);
    // --- End detailed logging ---

    let entity = foundEntity; // Use the variable we just checked
    
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
        position: undefined, // Position will be updated shortly
        orientation: undefined, // Orientation will be updated shortly
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
        }
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
      
      setVehicleEntities(prev => ({
        ...prev,
        [vehicleId]: entity
      }));
    }
    
    if (entity && data && data.position) {
      const positionCartesian = Cartesian3.fromDegrees(
        data.position.lng,
        data.position.lat,
        data.position.alt
      );
      
      entity.position = positionCartesian;
      
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
        
        // If we have an entity for this vehicle, remove it
        if (vehicleEntities[vehicleId] && viewerRef.current) {
          viewerRef.current.entities.remove(vehicleEntities[vehicleId]);
          setVehicleEntities(prev => {
            const updated = {...prev};
            delete updated[vehicleId];
            return updated;
          });
        }
        
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
