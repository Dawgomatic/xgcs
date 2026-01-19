import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  Cartesian3,
  Math as CesiumMath,
  HeadingPitchRoll,
  Transforms,
  SampledPositionProperty,
  JulianDate,
  PolylineGlowMaterialProperty
} from 'cesium';
import { Color as CesiumColor } from '@cesium/engine';

const VehicleContext = createContext(null);

export function VehicleProvider({ children }) {
  const [connectedVehicles, setConnectedVehicles] = useState([]);
  const [vehicleEntities, setVehicleEntities] = useState({});
  const [telemetryData, setTelemetryData] = useState({});
  const [connectionStates, setConnectionStates] = useState({}); // @hallucinated - Track connection states
  const telemetryIntervals = useRef({});
  const viewerRef = useRef(null);
  const pathInitializedRef = useRef({});
  const previousPositionRef = useRef({});

  // @hallucinated - Normalize backend-reported flight mode strings to ArduPilot-style tokens
  // Maps MAVSDK/PX4-style names to ArduPilot tokens used in UI and commands
  const normalizeFlightMode = useCallback((mode) => {
    const raw = (mode || 'UNKNOWN').toString().trim().toUpperCase();
    const aliasMap = {
      'STABILIZED': 'STABILIZE',
      'HOLD': 'LOITER',
      'RETURN TO LAUNCH': 'RTL',
      'ALTITUDE CONTROL': 'ALTHOLD',
      'POSITION CONTROL': 'POSHOLD',
      'MISSION': 'AUTO'
    };
    return aliasMap[raw] || raw;
  }, []);

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

          console.log('Backend connections:', backendConnections);
          console.log('Current connection states:', connectionStates);
          console.log('Current telemetry intervals:', Object.keys(telemetryIntervals.current));

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

          // Create vehicles from backend connections, with or without saved connections
          let allVehicles = [];

          // First, add any saved connections that have backend matches
          const updatedSavedConnections = savedConnections.map(saved => {
            // More robust ID matching - check multiple variations
            const backendConnection = backendConnections.find(bc => {
              const bcId = bc.id || '';
              const savedId = saved.id || '';
              const savedName = saved.name || '';

              return bcId === savedId ||
                bcId === savedName ||
                bcId === `SITL: ${savedName}` ||
                bcId === `SITL: ${savedId}` ||
                savedName === bcId.replace('SITL: ', '') ||
                savedId === bcId.replace('SITL: ', '');
            });

            const isConnected = !!backendConnection;

            // Update connection state if it changed
            if (isConnected && !connectionStates[saved.id]) {
              console.log(`[DEBUG] Setting ${saved.id} as connected (backend match found)`);
              updateConnectionState(saved.id, true);
            } else if (!isConnected && connectionStates[saved.id]) {
              // Only disconnect if we're sure there's no telemetry
              if (!telemetryIntervals.current[saved.id]) {
                console.log(`[DEBUG] Setting ${saved.id} as disconnected (no backend match and no telemetry)`);
                updateConnectionState(saved.id, false);
              } else {
                console.log(`[DEBUG] Keeping ${saved.id} as connected (telemetry still working)`);
              }
            }

            return {
              ...saved,
              connected: isConnected,
              systemId: backendConnection?.id || saved.id
            };
          });

          allVehicles.push(...updatedSavedConnections);

          // Then add any backend connections that don't have saved counterparts
          backendConnections.forEach(backendConn => {
            const hasSavedCounterpart = savedConnections.some(saved => {
              const bcId = backendConn.id || '';
              const savedId = saved.id || '';
              const savedName = saved.name || '';

              return bcId === savedId ||
                bcId === savedName ||
                bcId === `SITL: ${savedName}` ||
                bcId === `SITL: ${savedId}` ||
                savedName === bcId.replace('SITL: ', '') ||
                savedId === bcId.replace('SITL: ', '');
            });

            if (!hasSavedCounterpart) {
              // Create a new vehicle entry from backend connection
              const newVehicle = {
                id: backendConn.id,
                name: backendConn.name,
                connected: true,
                connectionStatus: 'connected',
                systemId: backendConn.id,
                connectionDetails: {
                  ip: backendConn.ip,
                  port: backendConn.port,
                  type: backendConn.type,
                  connectionUrl: backendConn.connectionUrl
                }
              };

              allVehicles.push(newVehicle);

              // Start telemetry for this new vehicle - DISABLED for swarm scalability
              // if (backendConn.id && !telemetryIntervals.current[backendConn.id]) {
              //   console.log(`Starting telemetry for new backend vehicle: ${backendConn.id}`);
              //   startTelemetryPolling(backendConn.id);
              // }
            }
          });

          setConnectedVehicles(allVehicles);

          // Start telemetry for all connected vehicles - DISABLED for swarm scalability
          // allVehicles.forEach(vehicle => {
          //   if (vehicle.connected && vehicle.id && !telemetryIntervals.current[vehicle.id]) {
          //     console.log(`Starting telemetry for connected vehicle: ${vehicle.id}`);
          //     startTelemetryPolling(vehicle.id);
          //   }
          // });
        }
      } catch (error) {
        console.error('Error fetching connected vehicles:', error);
      }
    };

    fetchConnectedVehicles();

    // Set up polling for connection list
    const interval = setInterval(fetchConnectedVehicles, 5000);

    return () => clearInterval(interval);
  }, [connectionStates]);

  // Bulk Telemetry Polling (Global Swarm State)
  useEffect(() => {
    const fetchBulkTelemetry = async () => {
      try {
        const response = await fetch('/api/telemetry/all');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.vehicles) {
            const newTelemetryMap = {};

            data.vehicles.forEach(v => {
              // Transform compact backend format to UI format
              const uiData = {
                ...v, // id, connected, armed, flight_mode, battery_pct
                position: { lat: v.lat, lng: v.lng, alt: v.alt },
                heading: v.heading,
                battery: { remaining: v.battery_pct },
                gps: { satellites: v.gps_sats, fix_type: v.gps_fix },
                // Add defaults for missing fields in bulk data
                attitude: { roll: 0, pitch: 0, yaw: v.heading }, // Detailed attitude missing
                groundSpeed: 0,
                verticalSpeed: 0
              };

              newTelemetryMap[v.id] = uiData;

              // 1. Auto-connect if not connected
              if (!connectionStates[v.id]) {
                updateConnectionState(v.id, true);
              }

              // 2. Update Map Entity
              if (viewerRef.current) {
                updateVehicleEntity(v.id, uiData);
              }
            });

            // Update Telemetry State
            // Note: We merge with existing to preserve 'Detailed' data from active vehicle polling
            setTelemetryData(prev => {
              const fused = { ...prev };
              Object.keys(newTelemetryMap).forEach(id => {
                // Only overwrite if this vehicle is NOT the active one (to avoid overwriting detailed data with sparse data)
                // OR if we don't have detailed data yet
                // Actually, safest is to merge selectively? 
                // No, simpler: "Active" polling runs faster and will overwrite this anyway.
                // But if Bulk runs AFTER Active, it might flicker.
                // Ideally: Don't update Active Vehicle from Bulk if Active Poll is running.
                if (id !== window.activeVehicleId) { // Check global or ref?
                  fused[id] = newTelemetryMap[id];
                }
              });
              return fused;
            });
          }
        }
      } catch (error) {
        console.error("Bulk telemetry error:", error);
      }
    };

    // Poll Swarm at 2Hz (500ms)
    const bulkInterval = setInterval(fetchBulkTelemetry, 500);
    return () => clearInterval(bulkInterval);
  }, [connectionStates]); // Re-bind if connection states change? No, generic.


  // Start telemetry polling for a vehicle
  const startTelemetryPolling = (vehicleId) => {
    // Safety check: don't start polling for invalid vehicle IDs
    if (!vehicleId || vehicleId === 'undefined' || vehicleId === 'null') {
      console.warn(`Skipping telemetry start for invalid vehicle ID: ${vehicleId}`);
      return;
    }

    // Clear any existing interval for this vehicle
    if (telemetryIntervals.current[vehicleId]) {
      clearInterval(telemetryIntervals.current[vehicleId]);
    }

    // Function to fetch telemetry data
    const fetchTelemetry = async () => {
      try {
        // Safety check: don't fetch telemetry for invalid vehicle IDs
        if (!vehicleId || vehicleId === 'undefined' || vehicleId === 'null') {
          console.warn(`Skipping telemetry fetch for invalid vehicle ID: ${vehicleId}`);
          return;
        }

        // Use the exact vehicle ID that was used during connection
        // The backend stores vehicles with the exact ID from the connection request
        const response = await fetch(`/api/telemetry?vehicleId=${encodeURIComponent(vehicleId)}`);

        if (response.ok) {
          const data = await response.json();
          console.log(`Raw telemetry response for ${vehicleId}:`, data);

          if (data.success) {
            console.log(`Received telemetry for ${vehicleId}:`, data.position);
            console.log(`Full telemetry data:`, {
              armed: data.armed,
              flight_mode: data.flight_mode,
              battery: data.battery,
              gps: data.gps,
              in_air: data.in_air
            });

            // Always store telemetry data for UI components
            setTelemetryData(prev => ({
              ...prev,
              [vehicleId]: data
            }));

            // Auto-mark vehicle as connected when telemetry starts working
            if (!getConnectionState(vehicleId)) {
              console.log(`Auto-marking ${vehicleId} as connected (telemetry working)`);
              updateConnectionState(vehicleId, true);
            }

            // Check if we have valid position data for 3D visualization
            const hasValidPosition = data.position &&
              data.position.lat !== null &&
              data.position.lng !== null &&
              data.position.alt !== null &&
              !isNaN(data.position.lat) &&
              !isNaN(data.position.lng) &&
              !isNaN(data.position.alt);

            if (hasValidPosition) {
              if (viewerRef.current) {
                updateVehicleEntity(vehicleId, data);
              }
            } else {
              console.warn(`Skipping position update for ${vehicleId} - invalid position data:`, data.position);

              // Create or update placeholder entity if we don't have one yet
              if (viewerRef.current) {
                const existingEntity = viewerRef.current.entities.getById(vehicleId);
                if (!existingEntity) {
                  console.log(`Creating placeholder entity for ${vehicleId} (waiting for GPS)`);
                  const placeholderEntity = viewerRef.current.entities.add({
                    id: vehicleId,
                    position: Cartesian3.fromDegrees(0, 0, 0), // Position at origin for now
                    label: {
                      text: `${vehicleId} (Waiting for GPS)`,
                      font: '12pt sans-serif',
                      style: 1,
                      outlineWidth: 2,
                      verticalOrigin: 0,
                      horizontalOrigin: 0,
                      pixelOffset: { x: 0, y: -50 }
                    },
                    point: {
                      pixelSize: 10,
                      color: CesiumColor.YELLOW,
                      outlineColor: CesiumColor.ORANGE,
                      outlineWidth: 2
                    }
                  });
                  setVehicleEntities(prev => ({ ...prev, [vehicleId]: placeholderEntity }));
                  console.log(`Placeholder entity created for ${vehicleId}`);
                } else {
                  // Update existing placeholder with status info
                  existingEntity.label.text.setValue(`${vehicleId} (GPS: ${data.gps?.satellites || 0} sats)`);
                }
              }
            }
          } else {
            console.warn(`Telemetry request failed for ${vehicleId}:`, data.error || 'Unknown error');
          }
        } else {
          console.error(`HTTP error fetching telemetry for ${vehicleId}:`, response.status, response.statusText);
        }
      } catch (error) {
        console.error(`Error fetching telemetry for ${vehicleId}:`, error);
      }
    };

    // Fetch immediately
    fetchTelemetry();

    // Set up interval with reasonable frequency
    const intervalId = setInterval(fetchTelemetry, 200);
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
      console.log(`Creating NEW Cesium entity for vehicleId: ${vehicleId}`);
      const vehicleConfig = connectedVehicles.find(v => v.id === vehicleId || v.name === vehicleId);

      // Create a new entity with default properties
      const entityProperties = {
        id: vehicleId,
        // Position will be set when we have telemetry data
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
        },
        point: {
          pixelSize: 15,
          color: CesiumColor.RED,
          outlineColor: CesiumColor.WHITE,
          outlineWidth: 2
        }
      };

      // Conditionally add model if available
      if (vehicleConfig && vehicleConfig.modelUrl) {
        console.log(`Using model URL for ${vehicleId}: ${vehicleConfig.modelUrl}`);
        entityProperties.model = {
          uri: vehicleConfig.modelUrl,
          scale: vehicleConfig.modelScale || 5.0,
          minimumPixelSize: 128,
          maximumScale: 20000
        };
        // Remove point if using model
        delete entityProperties.point;
      }

      entity = viewer.entities.add(entityProperties);
      setVehicleEntities(prev => ({ ...prev, [vehicleId]: entity }));
      pathInitializedRef.current[vehicleId] = false;
      delete previousPositionRef.current[vehicleId];
      console.log(`[${new Date().toISOString()}] Created entity for ${vehicleId}`);
    }

    // --- Handle position and path updates ---
    if (entity && data && data.position) {
      // Check if position data is valid (not null and not NaN)
      const position = data.position;
      if (position.lat === null || position.lng === null || position.alt === null ||
        isNaN(position.lat) || isNaN(position.lng) || isNaN(position.alt)) {
        console.warn(`Invalid position data for ${vehicleId}:`, position);
        return; // Skip this update if position data is invalid
      }

      const positionCartesian = Cartesian3.fromDegrees(
        position.lng,
        position.lat,
        position.alt
      );
      const time = JulianDate.now();

      // --- Update Main Entity Position ALWAYS ---
      entity.position = positionCartesian;

      // --- Path Entity Logic ---
      if (!pathInitializedRef.current[vehicleId]) {
        // First time seeing this vehicle - initialize path
        console.log(`Initializing path for ${vehicleId}`);
        pathInitializedRef.current[vehicleId] = true;
        previousPositionRef.current[vehicleId] = positionCartesian;

        // Create path entity
        const pathEntity = viewer.entities.add({
          id: pathEntityId,
          path: {
            positions: new SampledPositionProperty(),
            width: 3,
            material: new PolylineGlowMaterialProperty({
              glowPower: 0.2,
              color: CesiumColor.CYAN
            }),
            show: true
          }
        });

        // Add first position to path
        const pathPositions = pathEntity.path.positions;
        pathPositions.addSample(time, positionCartesian);

      } else {
        // Update existing path
        const previousPosition = previousPositionRef.current[vehicleId];
        if (previousPosition) {
          const distance = Cartesian3.distance(previousPosition, positionCartesian);

          // Only add to path if vehicle has moved significantly (>1 meter)
          if (distance > 1.0) {
            const pathEntity = viewer.entities.getById(pathEntityId);
            if (pathEntity && pathEntity.path) {
              const pathPositions = pathEntity.path.positions;
              pathPositions.addSample(time, positionCartesian);

              // Keep path length reasonable (last 1000 points)
              const samples = pathPositions.getValue(time);
              if (samples && samples.length > 1000) {
                // Remove old samples to prevent memory issues
                const newSamples = samples.slice(-1000);
                pathPositions.setValue(time, newSamples);
              }
            }
            previousPositionRef.current[vehicleId] = positionCartesian;
          }
        }
      }

      // --- Update entity properties based on telemetry ---
      if (data.flight_mode) {
        entity.label.text.setValue(`${vehicleId} (${data.flight_mode})`);
      }

      // Update color based on armed status
      if (data.armed !== undefined) {
        const point = entity.point;
        if (point) {
          point.color.setValue(data.armed ? CesiumColor.GREEN : CesiumColor.RED);
        }
      }

      console.log(`[${new Date().toISOString()}] Updated entity for ${vehicleId} at position:`, {
        lat: position.lat,
        lng: position.lng,
        alt: position.alt
      });
    }
  };

  // @hallucinated - Update connection state
  const updateConnectionState = (vehicleId, isConnected) => {
    console.log(`Updating connection state for ${vehicleId}: ${isConnected}`);
    setConnectionStates(prev => {
      const newState = {
        ...prev,
        [vehicleId]: isConnected
      };
      console.log('New connection states:', newState);
      return newState;
    });
  };

  // @hallucinated - Get connection state for a vehicle
  const getConnectionState = (vehicleId) => {
    return connectionStates[vehicleId] || false;
  };

  // @hallucinated - Connect a vehicle
  const connectVehicle = async (vehicleConfig) => {
    try {
      const response = await fetch('/api/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          ip: vehicleConfig.connectionDetails.ip,
          port: parseInt(vehicleConfig.connectionDetails.port, 10),
          name: vehicleConfig.name,
          type: vehicleConfig.connectionDetails.vehicleType || 'unknown',
          modelUrl: vehicleConfig.modelUrl || '',
          modelScale: vehicleConfig.modelScale || 1.0
        })
      });

      const data = await response.json();

      if (data.success) {
        console.log(`Connection successful for ${vehicleConfig.name}`);
        updateConnectionState(vehicleConfig.name, true);
        startTelemetryPolling(vehicleConfig.name);
        return true;
      } else {
        console.error('Connection failed:', data.message);
        return false;
      }
    } catch (error) {
      console.error('Error connecting vehicle:', error);
      return false;
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
        // Update connection state
        updateConnectionState(vehicleId, false);

        // Stop polling for this vehicle
        stopTelemetryPolling(vehicleId);
        const pathEntityId = `${vehicleId}_path`; // Ensure ID is defined

        // Remove main entity
        if (vehicleEntities[vehicleId] && viewerRef.current) {
          viewerRef.current.entities.remove(vehicleEntities[vehicleId]);
          setVehicleEntities(prev => {
            const updated = { ...prev };
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
          const updated = { ...prev };
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

  // Manual active vehicle override
  const [manualActiveVehicleId, setManualActiveVehicleId] = useState(null);

  // Determine active vehicle
  let activeVehicle = null;

  // 1. Try manual selection first
  if (manualActiveVehicleId) {
    // Find in vehicles array (which includes both connected and telemetry-only)
    activeVehicle = vehicles.find(v => v.id === manualActiveVehicleId);

    // If manually selected vehicle is not found (e.g. disconnected), fall back
    if (!activeVehicle) {
      console.warn(`Manually selected vehicle ${manualActiveVehicleId} not found, falling back to auto-selection`);
    }
  }

  // 2. Fallback: First connected vehicle with telemetry
  if (!activeVehicle) {
    activeVehicle = connectedVehicles
      .map(v => ({ ...v, telemetry: telemetryData[v.id] }))
      .find(v => v.connected && v.telemetry) || null;
  }

  // 3. Fallback: First telemetry entry
  if (!activeVehicle && Object.keys(telemetryData).length > 0) {
    const firstTelemetryId = Object.keys(telemetryData)[0];
    const telemetry = telemetryData[firstTelemetryId];
    // Create a vehicle object from the telemetry data
    activeVehicle = {
      id: firstTelemetryId,
      name: firstTelemetryId,
      connected: true,
      connectionStatus: telemetry.connectionStatus || 'connected',
      flightMode: normalizeFlightMode(telemetry.flight_mode),
      // Map telemetry data to expected UI fields
      batteryLevel: telemetry?.battery?.remaining || 0,
      battery: telemetry?.battery || { remaining: 0, voltage: 0 },
      airspeed: telemetry?.attitude?.groundSpeed || telemetry?.groundSpeed || 0,
      groundspeed: telemetry?.attitude?.groundSpeed || telemetry?.groundSpeed || 0,
      heading: telemetry?.attitude?.yaw || telemetry?.heading || 0,
      altitude: telemetry?.position?.alt || 0,
      gpsSatellites: telemetry?.gps?.satellites || 0,
      gpsFixType: telemetry?.gps?.fix_type || 0,
      gps: telemetry?.gps || { satellites: 0, fix_type: 0 },
      coordinate: telemetry?.position ? {
        lat: telemetry.position.lat,
        lon: telemetry.position.lng
      } : null,
      // Additional fields for UI components
      armed: telemetry?.armed || false,
      in_air: telemetry?.in_air || false,
      roll: telemetry?.attitude?.roll || 0,
      pitch: telemetry?.attitude?.pitch || 0,
      yaw: telemetry?.attitude?.yaw || 0,
      verticalSpeed: telemetry?.verticalSpeed || 0,
      // Include the full telemetry data for components that need it
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

    // SWE100821: Added debugging for vehicle ID issues
    if (!v.id) {
      console.error('Vehicle missing ID:', v);
    }

    return {
      id: v.id,
      name: v.name,
      connected: v.connected,
      connectionStatus: telemetry?.connectionStatus || (v.connected ? 'connected' : 'disconnected'),
      flightMode: normalizeFlightMode(telemetry?.flight_mode),
      // Map telemetry data to expected UI fields
      batteryLevel: telemetry?.battery?.remaining || 0,
      battery: telemetry?.battery || { remaining: 0, voltage: 0 },
      airspeed: telemetry?.attitude?.groundSpeed || telemetry?.groundSpeed || 0,
      groundspeed: telemetry?.attitude?.groundSpeed || telemetry?.groundSpeed || 0,
      heading: telemetry?.attitude?.yaw || telemetry?.heading || 0,
      altitude: telemetry?.position?.alt || 0,
      gpsSatellites: telemetry?.gps?.satellites || 0,
      gpsFixType: telemetry?.gps?.fix_type || 0,
      gps: telemetry?.gps || { satellites: 0, fix_type: 0 },
      coordinate: telemetry?.position ? {
        lat: telemetry.position.lat,
        lon: telemetry.position.lng
      } : null,
      // Additional fields for UI components
      armed: telemetry?.armed || false,
      in_air: telemetry?.in_air || false,
      roll: telemetry?.attitude?.roll || 0,
      pitch: telemetry?.attitude?.pitch || 0,
      yaw: telemetry?.attitude?.yaw || 0,
      verticalSpeed: telemetry?.verticalSpeed || 0,
      // Include the full telemetry data for components that need it
      ...telemetry
    };
  });

  // SWE100821: Added debugging for vehicles array
  console.log('[DEBUG] Vehicles array for FlightInstruments:', vehicles.map(v => ({ id: v.id, name: v.name, connected: v.connected })));

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
        flightMode: normalizeFlightMode(telemetry.flight_mode),
        // Map telemetry data to expected UI fields
        batteryLevel: telemetry?.battery?.remaining || 0,
        battery: telemetry?.battery || { remaining: 0, voltage: 0 },
        airspeed: telemetry?.attitude?.groundSpeed || telemetry?.groundSpeed || 0,
        groundspeed: telemetry?.attitude?.groundSpeed || telemetry?.groundSpeed || 0,
        heading: telemetry?.attitude?.yaw || telemetry?.heading || 0,
        altitude: telemetry?.position?.alt || 0,
        gpsSatellites: telemetry?.gps?.satellites || 0,
        gpsFixType: telemetry?.gps?.fix_type || 0,
        gps: telemetry?.gps || { satellites: 0, fix_type: 0 },
        coordinate: telemetry?.position ? {
          lat: telemetry.position.lat,
          lon: telemetry.position.lng
        } : null,
        // Additional fields for UI components
        armed: telemetry?.armed || false,
        in_air: telemetry?.in_air || false,
        roll: telemetry?.attitude?.roll || 0,
        pitch: telemetry?.attitude?.pitch || 0,
        yaw: telemetry?.attitude?.yaw || 0,
        verticalSpeed: telemetry?.verticalSpeed || 0,
        // Include the full telemetry data for components that need it
        ...telemetry
      });
    }
  });


  // Active Vehicle High-Rate Polling (Hybrid Strategy)
  useEffect(() => {
    const currentId = activeVehicle?.id;
    if (!currentId) return;

    // Only start if connected?
    // startTelemetryPolling checks this anyway or tries to fetch?
    // It tries to fetch. If not connected, it might fail or 404.
    // But we want to try.

    console.log(`[VehicleContext] Starting high-rate polling for active vehicle: ${currentId}`);
    startTelemetryPolling(currentId);

    return () => {
      console.log(`[VehicleContext] Stopping high-rate polling for inactive vehicle: ${currentId}`);
      stopTelemetryPolling(currentId);
    };
  }, [activeVehicle?.id]);

  return (
    <VehicleContext.Provider value={{
      connectedVehicles,
      vehicleEntities,
      telemetryData,
      activeVehicle,
      vehicles,
      connectionStates,
      setViewer,
      startTelemetryPolling,
      stopTelemetryPolling,
      connectVehicle,
      disconnectVehicle,
      updateConnectionState,
      updateConnectionState,
      getConnectionState,
      setManualActiveVehicleId
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
