import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  Cartesian3,
  Math as CesiumMath,
  HeadingPitchRoll,
  Transforms,
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
  const setViewer = (viewer) => {
    viewerRef.current = viewer;
  };

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
          
          // If we have a viewer, update the entity
          if (viewerRef.current) {
            updateVehicleEntity(vehicleId, data);
          }
        }
      } catch (error) {
        console.error(`Error fetching telemetry for ${vehicleId}:`, error);
      }
    };
    
    // Fetch immediately
    fetchTelemetry();
    
    // Set up polling interval
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
    if (!viewerRef.current) return;
    
    const viewer = viewerRef.current;
    let entity = vehicleEntities[vehicleId];
    
    // If the entity doesn't exist, create it
    if (!entity) {
      // Find the vehicle config from connectedVehicles
      const vehicleConfig = connectedVehicles.find(v => v.id === vehicleId || v.name === vehicleId);
      
      if (!vehicleConfig) {
        console.warn(`Vehicle config not found for ${vehicleId}`);
        return;
      }
      
      // Create a new entity
      entity = viewer.entities.add({
        id: vehicleId,
        position: undefined,
        orientation: undefined,
        model: {
          uri: vehicleConfig.modelUrl || 'https://assets.ion.cesium.com/models/drone2/Scene/drone2.gltf',
          scale: vehicleConfig.modelScale || 5.0,
          minimumPixelSize: 128,
          maximumScale: 20000
        },
        path: {
          material: CesiumColor.fromRgba(0, 255, 255, 255),
          width: 2,
          leadTime: 0,
          trailTime: 60 * 60 // 1 hour trail
        },
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
      });
      
      // Update the state with the new entity
      setVehicleEntities(prev => ({
        ...prev,
        [vehicleId]: entity
      }));
    }
    
    // Now update the entity with the latest telemetry data
    if (data && data.position) {
      const position = {
        longitude: data.position.lng,
        latitude: data.position.lat,
        height: data.position.alt
      };
      
      entity.position = Cartesian3.fromDegrees(
        position.longitude,
        position.latitude,
        position.height
      );
      
      // Update orientation if available
      if (data.attitude) {
        const hpr = new HeadingPitchRoll(
          CesiumMath.toRadians(data.attitude.yaw),
          CesiumMath.toRadians(data.attitude.pitch),
          CesiumMath.toRadians(data.attitude.roll)
        );
        entity.orientation = Transforms.headingPitchRollQuaternion(
          entity.position._value,
          hpr
        );
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
