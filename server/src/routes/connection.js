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
  
  // Check connection health every 2 seconds
  const monitor = setInterval(async () => {
    try {
      const response = await fetch(`http://localhost:8081/telemetry?vehicleId=${vehicleId}`);
      if (!response.ok) {
        console.log(`[Connection] Vehicle ${vehicleId} disconnected`);
        stopConnectionMonitor(vehicleId);
        activeConnections.delete(vehicleId);
      }
    } catch (error) {
      console.error(`[Connection] Health check failed for ${vehicleId}:`, error);
    }
  }, 2000);
  
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
      
      // Special case for default ArduPilot SITL
      if (port === '5760' || port === 5760) {
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

// Get telemetry data
router.get('/telemetry', async (req, res) => {
  try {
    const { vehicleId } = req.query;
    
    if (!activeConnections.has(vehicleId)) {
      return res.json({ 
        success: false, 
        message: 'Not connected to this vehicle' 
      });
    }
    
    const connection = activeConnections.get(vehicleId);
    
    // If using MAVSDK backend, get real telemetry
    if (connection.backend === 'mavsdk') {
      try {
        const telemetryResponse = await fetch(`http://localhost:8081/telemetry?vehicleId=${vehicleId}`);
        if (telemetryResponse.ok) {
          const telemetryData = await telemetryResponse.json();
          
          // Transform MAVSDK telemetry to our format
          const position = {
            lat: telemetryData.position?.lat || 0,
            lng: telemetryData.position?.lng || 0,
            alt: telemetryData.position?.alt || 0,
            heading: telemetryData.attitude?.yaw || 0,
            groundSpeed: telemetryData.ground_speed || 0,
            verticalSpeed: telemetryData.vertical_speed || 0,
            battery: telemetryData.battery?.remaining || 0,
            mode: telemetryData.flight_mode || 'UNKNOWN',
            armed: telemetryData.armed || false,
            inAir: telemetryData.in_air || false,
            // Additional telemetry
            roll: telemetryData.attitude?.roll || 0,
            pitch: telemetryData.attitude?.pitch || 0,
            batteryVoltage: telemetryData.battery?.voltage || 0,
            health: telemetryData.health || {}
          };
          
          return res.json({ 
            success: true,
            position,
            timestamp: new Date().toISOString(),
            source: 'mavsdk'
          });
        }
      } catch (backendError) {
        console.error('[Connection] MAVSDK telemetry error:', backendError);
        return res.status(500).json({
          success: false,
          message: 'Failed to get telemetry from MAVSDK backend',
          error: backendError.message
        });
      }
    }
    
    // No telemetry available
    res.status(500).json({
      success: false,
      message: 'No telemetry available for this vehicle'
    });
  } catch (error) {
    console.error('[Connection] Telemetry error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// List active connections
router.get('/connections', async (req, res) => {
  try {
    const connections = Array.from(activeConnections.values());
    res.json({ 
      success: true,
      connections 
    });
  } catch (error) {
    console.error('[Connection] List error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router; 