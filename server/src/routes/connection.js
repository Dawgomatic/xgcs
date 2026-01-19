const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Store active connections
const activeConnections = new Map();

// MAVLink proxy instances for connections
const mavProxies = new Map();

// Connection health monitoring
const connectionMonitors = new Map();

// Start monitoring connection health
function startConnectionMonitor(vehicleId) {
  // Clear any existing monitor
  if (connectionMonitors.has(vehicleId)) {
    clearInterval(connectionMonitors.get(vehicleId));
  }

  // Check connection health every 5 seconds
  const monitor = setInterval(async () => {
    try {
      // Check C++ backend directly for vehicle status
      const cppResponse = await fetch(`http://localhost:8081/vehicles`);
      if (cppResponse.ok) {
        const cppData = await cppResponse.json();
        const cppVehicles = cppData.vehicles || [];
        const vehicleExists = cppVehicles.some(v => v.id === vehicleId);

        if (!vehicleExists) {
          console.log(`[Connection] Vehicle ${vehicleId} no longer exists in C++ backend`);
          stopConnectionMonitor(vehicleId);
          activeConnections.delete(vehicleId);
        }
      } else {
        console.warn(`[Connection] C++ backend health check failed for ${vehicleId}: ${cppResponse.status}`);
      }
    } catch (error) {
      console.error(`[Connection] Health check failed for ${vehicleId}:`, error);
      // Don't immediately disconnect on network errors, just log them
    }
  }, 5000);

  connectionMonitors.set(vehicleId, monitor);
}

// Stop monitoring connection health
function stopConnectionMonitor(vehicleId) {
  if (connectionMonitors.has(vehicleId)) {
    clearInterval(connectionMonitors.get(vehicleId));
    connectionMonitors.delete(vehicleId);
  }
}

// Connect to a vehicle (SITL or real)
router.post('/connect', async (req, res) => {
  try {
    const { ip, port, name, type, modelUrl, modelScale } = req.body;

    console.log(`[Connection] Attempting to connect to ${name} at ${ip}:${port}`);

    // Check if already connected
    if (activeConnections.has(name)) {
      return res.json({
        success: false,
        message: 'Already connected to this vehicle'
      });
    }

    // Build connection URL based on connection type
    let connectionUrl = '';
    if (ip && port) {
      // For TCP connections (most common for SITL and real vehicles)
      connectionUrl = `tcp://${ip}:${port}`;

      // Special case for ArduPilot SITL (SERIAL0=5760, SERIAL1=5762, SERIAL2=5763)
      if (port === '5760' || port === 5760 || port === '5762' || port === 5762 || port === '5763' || port === 5763) {
        connectionUrl = `tcp://${ip}:${port}`;
      }
      // For UDP connections (QGroundControl style)
      else if (port === '14550' || port === 14550) {
        connectionUrl = `udp://:${port}`;
      }
    }

    console.log(`[Connection] Using connection URL: ${connectionUrl}`);

    // Call the C++ backend to establish MAVSDK connection
    try {
      const backendResponse = await fetch('http://localhost:8081/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ip: ip,
          port: parseInt(port),
          name: name,
          type: type || 'generic'
        })
      });

      if (!backendResponse.ok) {
        throw new Error('Failed to connect via MAVSDK backend');
      }

      const backendData = await backendResponse.json();
      console.log('[Connection] MAVSDK backend response:', backendData);

      // Register the connection
      const connection = {
        name,
        ip,
        port,
        type,
        modelUrl,
        modelScale,
        connectionUrl,
        connectedAt: new Date().toISOString(),
        status: 'connected',
        backend: 'mavsdk'
      };

      activeConnections.set(name, connection);

      // Start monitoring connection health
      startConnectionMonitor(name);

      res.json({
        success: true,
        message: `Connected to ${name} via MAVSDK`,
        connection
      });

    } catch (backendError) {
      console.error('[Connection] MAVSDK backend error:', backendError);

      // No mock fallback - real connections only
      res.status(500).json({
        success: false,
        message: `Failed to connect to ${name}: MAVSDK backend not available. Please ensure the C++ backend is running.`,
        error: backendError.message
      });
    }
  } catch (error) {
    console.error('[Connection] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Disconnect from a vehicle
router.post('/disconnect', async (req, res) => {
  try {
    const { name } = req.body;

    console.log(`[Connection] Disconnecting from ${name}`);

    if (!activeConnections.has(name)) {
      return res.json({
        success: false,
        message: 'Not connected to this vehicle'
      });
    }

    const connection = activeConnections.get(name);

    // Stop connection monitoring
    stopConnectionMonitor(name);

    // If using MAVSDK backend, disconnect there too
    if (connection.backend === 'mavsdk') {
      try {
        await fetch(`http://localhost:8081/disconnect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: name })
        });
        console.log(`[Connection] Removed ${name} from MAVSDK backend`);
      } catch (backendError) {
        console.error('[Connection] MAVSDK disconnect error:', backendError);
      }
    }

    // Remove connection
    activeConnections.delete(name);

    // Stop any MAVProxy instances
    if (mavProxies.has(name)) {
      const proxy = mavProxies.get(name);
      // TODO: Properly stop MAVProxy process
      mavProxies.delete(name);
    }

    res.json({
      success: true,
      message: `Disconnected from ${name}`
    });
  } catch (error) {
    console.error('[Connection] Disconnect error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get bulk telemetry data
router.get('/telemetry/all', async (req, res) => {
  try {
    // Proxy directly to C++ backend
    const response = await fetch('http://localhost:8081/telemetry/all');

    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    } else {
      console.warn(`[Connection] Bulk telemetry request failed: ${response.status}`);
      return res.status(response.status).json({
        success: false,
        message: 'Bulk telemetry request failed',
        status: response.status
      });
    }
  } catch (error) {
    console.error('[Connection] Bulk telemetry error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to access C++ backend',
      error: error.message
    });
  }
});

// Get telemetry data
router.get('/telemetry', async (req, res) => {
  try {
    const { vehicleId } = req.query;

    if (!vehicleId) {
      return res.status(400).json({
        success: false,
        message: 'vehicleId parameter is required'
      });
    }

    // First check if we have this connection locally
    const localConnection = activeConnections.get(vehicleId);

    // Always try to get telemetry from MAVSDK backend if we have a local connection
    if (localConnection && localConnection.backend === 'mavsdk') {
      try {
        const telemetryResponse = await fetch(`http://localhost:8081/telemetry?vehicleId=${encodeURIComponent(vehicleId)}`);
        if (telemetryResponse.ok) {
          const telemetryData = await telemetryResponse.json();

          // Transform MAVSDK telemetry to our format
          const position = {
            lat: telemetryData.position?.lat || null,
            lng: telemetryData.position?.lng || null,
            alt: telemetryData.position?.alt || null,
            heading: telemetryData.attitude?.yaw || 0,
            groundSpeed: telemetryData.ground_speed || 0,
            verticalSpeed: telemetryData.vertical_speed || 0
          };

          const result = {
            success: true,
            position,
            armed: telemetryData.armed || false,
            flight_mode: telemetryData.flight_mode || 'UNKNOWN',
            in_air: telemetryData.in_air || false,
            battery: {
              remaining: telemetryData.battery?.remaining || 0,
              voltage: telemetryData.battery?.voltage || 0
            },
            gps: {
              satellites: telemetryData.gps?.satellites || 0,
              fix_type: telemetryData.gps?.fix_type || 0
            },
            attitude: {
              roll: telemetryData.attitude?.roll || 0,
              pitch: telemetryData.attitude?.pitch || 0,
              yaw: telemetryData.attitude?.yaw || 0
            },
            timestamp: new Date().toISOString(),
            source: 'mavsdk'
          };

          return res.json(result);
        } else {
          console.warn(`[Connection] MAVSDK telemetry request failed for ${vehicleId}: ${telemetryResponse.status}`);
          // Return error but don't fail completely
          return res.json({
            success: false,
            message: 'Telemetry request failed',
            error: `HTTP ${telemetryResponse.status}`
          });
        }
      } catch (backendError) {
        console.error('[Connection] MAVSDK telemetry error:', backendError);
        return res.json({
          success: false,
          message: 'Failed to get telemetry from MAVSDK backend',
          error: backendError.message
        });
      }
    }

    // If no local connection or not using MAVSDK, check if vehicle exists in C++ backend
    try {
      const cppResponse = await fetch(`http://localhost:8081/vehicles`);
      if (cppResponse.ok) {
        const cppData = await cppResponse.json();
        const cppVehicles = cppData.vehicles || [];
        const vehicleExists = cppVehicles.some(v => v.id === vehicleId);

        if (vehicleExists) {
          // Vehicle exists in C++ backend, try to get telemetry directly
          try {
            const telemetryResponse = await fetch(`http://localhost:8081/telemetry?vehicleId=${encodeURIComponent(vehicleId)}`);
            if (telemetryResponse.ok) {
              const telemetryData = await telemetryResponse.json();

              // Transform MAVSDK telemetry to our format
              const position = {
                lat: telemetryData.position?.lat || null,
                lng: telemetryData.position?.lng || null,
                alt: telemetryData.position?.alt || null,
                heading: telemetryData.attitude?.yaw || 0,
                groundSpeed: telemetryData.ground_speed || 0,
                verticalSpeed: telemetryData.vertical_speed || 0
              };

              const result = {
                success: true,
                position,
                armed: telemetryData.armed || false,
                flight_mode: telemetryData.flight_mode || 'UNKNOWN',
                in_air: telemetryData.in_air || false,
                battery: {
                  remaining: telemetryData.battery?.remaining || 0,
                  voltage: telemetryData.battery?.voltage || 0
                },
                gps: {
                  satellites: telemetryData.gps?.satellites || 0,
                  fix_type: telemetryData.gps?.fix_type || 0
                },
                attitude: {
                  roll: telemetryData.attitude?.roll || 0,
                  pitch: telemetryData.attitude?.pitch || 0,
                  yaw: telemetryData.attitude?.yaw || 0
                },
                timestamp: new Date().toISOString(),
                source: 'mavsdk_direct'
              };

              return res.json(result);
            }
          } catch (directError) {
            console.error('[Connection] Direct MAVSDK telemetry error:', directError);
          }
        }
      }
    } catch (cppError) {
      console.error('[Connection] C++ backend check error:', cppError);
    }

    // No telemetry available
    return res.json({
      success: false,
      message: 'Vehicle not connected or no telemetry available',
      vehicleId
    });
  } catch (error) {
    console.error('[Connection] Telemetry error:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// List active connections - SWE100821: Commented out to avoid conflict with C++ backend
/*
router.get('/connections', async (req, res) => {
  try {
    // Get local connections
    const localConnections = Array.from(activeConnections.values());
    
    // Also check C++ backend for actual vehicle connections
    let cppVehicles = [];
    try {
      const cppResponse = await fetch('http://localhost:8081/vehicles');
      if (cppResponse.ok) {
        const cppData = await cppResponse.json();
        cppVehicles = cppData.vehicles || [];
      }
    } catch (cppError) {
      console.error('[Connection] C++ backend check error:', cppError);
    }
    
    // Merge local and C++ backend connections
    const allConnections = [...localConnections];
    
    // Add C++ backend vehicles that aren't in local connections
    for (const cppVehicle of cppVehicles) {
      const exists = localConnections.some(local => local.name === cppVehicle.id);
      if (!exists) {
        // Create a connection entry for C++ backend vehicles
        allConnections.push({
          name: cppVehicle.id,
          id: cppVehicle.id,
          ip: 'localhost',
          port: '8081',
          type: 'mavsdk',
          connectionUrl: 'mavsdk://localhost:8081',
          connectedAt: new Date().toISOString(),
          status: 'connected',
          backend: 'mavsdk',
          source: 'cpp_backend'
        });
      }
    }
    
    res.json({ 
      success: true,
      connections: allConnections,
      localCount: localConnections.length,
      cppCount: cppVehicles.length,
      totalCount: allConnections.length
    });
  } catch (error) {
    console.error('[Connection] List error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});
*/

module.exports = router; 