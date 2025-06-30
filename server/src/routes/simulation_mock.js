const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// In-memory storage for simulations
let simulations = new Map();
let nextPort = 5761;

// Get next available port
function getNextPort() {
  const usedPorts = Array.from(simulations.values()).map(sim => sim.port);
  let port = 5761;
  while (usedPorts.includes(port)) {
    port++;
  }
  return port;
}

// Create simulation
router.post('/create', async (req, res) => {
  try {
    console.log('Creating simulation with config:', req.body);
    
    const config = req.body;
    const simulationId = uuidv4();
    const port = config.port || getNextPort();
    
    const simulation = {
      id: simulationId,
      name: config.name || `${config.vehicleType || 'Vehicle'} ${simulationId.slice(0, 8)}`,
      vehicleType: config.vehicleType || 'ArduCopter',
      frameType: config.frameType || 'quad',
      ipAddress: config.ipAddress || 'localhost',
      port: port,
      speedFactor: config.speedFactor || 1.0,
      enableLogging: config.enableLogging !== false,
      enableVideo: config.enableVideo || false,
      customParams: config.customParams || '',
      homeLocation: config.homeLocation || { lat: 37.7749, lng: -122.4194, alt: 0 },
      status: 'created',
      createdAt: new Date().toISOString(),
      processId: null,
      stats: null,
      mockData: {
        position: { lat: 37.7749, lng: -122.4194, alt: 0 },
        attitude: { roll: 0, pitch: 0, yaw: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        battery: { voltage: 12.6, current: 2.1, remaining: 85 },
        gps: { satellites: 8, hdop: 1.2, vdop: 1.8 },
        flightMode: 'STABILIZED'
      }
    };
    
    simulations.set(simulationId, simulation);
    
    console.log('Simulation created successfully:', simulationId);
    
    res.json({ 
      success: true, 
      simulation: simulation 
    });
    
  } catch (error) {
    console.error('Error creating simulation:', error);
    res.status(500).json({ 
      error: 'Failed to create simulation',
      details: error.message 
    });
  }
});

// List simulations
router.get('/list', (req, res) => {
  try {
    const simulationList = Array.from(simulations.values());
    console.log('Listing simulations:', simulationList.length);
    res.json({ 
      success: true, 
      simulations: simulationList 
    });
  } catch (error) {
    console.error('Error listing simulations:', error);
    res.status(500).json({ 
      error: 'Failed to list simulations',
      details: error.message 
    });
  }
});

// Start simulation
router.post('/:id/start', async (req, res) => {
  try {
    const simulationId = req.params.id;
    const simulation = simulations.get(simulationId);
    
    if (!simulation) {
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    if (simulation.status === 'running' || simulation.status === 'starting') {
      return res.status(400).json({ error: 'Simulation is already running' });
    }
    
    console.log('Starting simulation:', simulationId);
    
    // Update status
    simulation.status = 'running';
    simulation.startedAt = new Date().toISOString();
    simulation.processId = Math.floor(Math.random() * 10000) + 1000; // Mock PID
    simulations.set(simulationId, simulation);
    
    // Start mock data updates
    simulation.mockDataInterval = setInterval(() => {
      if (simulation.status === 'running') {
        // Update mock position (simple circular flight)
        const time = Date.now() / 1000;
        const radius = 0.001; // Small circle
        simulation.mockData.position.lat = 37.7749 + radius * Math.cos(time * 0.1);
        simulation.mockData.position.lng = -122.4194 + radius * Math.sin(time * 0.1);
        simulation.mockData.position.alt = 10 + 5 * Math.sin(time * 0.05);
        
        // Update attitude
        simulation.mockData.attitude.roll = 5 * Math.sin(time * 0.2);
        simulation.mockData.attitude.pitch = 3 * Math.cos(time * 0.15);
        simulation.mockData.attitude.yaw = (time * 10) % 360;
        
        // Update battery
        simulation.mockData.battery.remaining = Math.max(0, 85 - (time * 0.1));
        simulation.mockData.battery.voltage = 12.6 - (time * 0.001);
        
        // Update flight mode
        const modes = ['STABILIZED', 'ALTHOLD', 'LOITER', 'RTL'];
        simulation.mockData.flightMode = modes[Math.floor(time / 10) % modes.length];
        
        simulations.set(simulationId, simulation);
      }
    }, 1000);
    
    console.log('Simulation started successfully:', simulationId);
    
    res.json({ 
      success: true, 
      message: 'Simulation started successfully',
      processId: simulation.processId
    });
    
  } catch (error) {
    console.error('Error starting simulation:', error);
    
    // Update simulation status to error
    const simulationId = req.params.id;
    const simulation = simulations.get(simulationId);
    if (simulation) {
      simulation.status = 'error';
      simulation.error = error.message;
      simulations.set(simulationId, simulation);
    }
    
    res.status(500).json({ 
      error: 'Failed to start simulation',
      details: error.message 
    });
  }
});

// Stop simulation
router.post('/:id/stop', async (req, res) => {
  try {
    const simulationId = req.params.id;
    const simulation = simulations.get(simulationId);
    
    if (!simulation) {
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    if (simulation.status === 'stopped' || simulation.status === 'stopping') {
      return res.status(400).json({ error: 'Simulation is not running' });
    }
    
    console.log('Stopping simulation:', simulationId);
    
    // Update status
    simulation.status = 'stopped';
    simulation.stoppedAt = new Date().toISOString();
    simulation.processId = null;
    
    // Clear mock data interval
    if (simulation.mockDataInterval) {
      clearInterval(simulation.mockDataInterval);
      simulation.mockDataInterval = null;
    }
    
    simulations.set(simulationId, simulation);
    
    res.json({ 
      success: true, 
      message: 'Simulation stopped successfully' 
    });
    
  } catch (error) {
    console.error('Error stopping simulation:', error);
    res.status(500).json({ 
      error: 'Failed to stop simulation',
      details: error.message 
    });
  }
});

// Get simulation status
router.get('/:id/status', async (req, res) => {
  try {
    const simulationId = req.params.id;
    const simulation = simulations.get(simulationId);
    
    if (!simulation) {
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    // Calculate uptime if running
    let stats = null;
    if (simulation.status === 'running' && simulation.startedAt) {
      const uptime = Math.floor((Date.now() - new Date(simulation.startedAt).getTime()) / 1000);
      stats = {
        uptime: uptime,
        cpuUsage: Math.random() * 20 + 10, // Mock CPU usage
        memoryUsage: Math.random() * 15 + 5, // Mock memory usage
        mockData: simulation.mockData
      };
      
      simulation.stats = stats;
      simulations.set(simulationId, simulation);
    }
    
    res.json({
      id: simulation.id,
      status: simulation.status,
      stats: stats,
      processId: simulation.processId,
      mockData: simulation.mockData
    });
    
  } catch (error) {
    console.error('Error getting simulation status:', error);
    res.status(500).json({ 
      error: 'Failed to get simulation status',
      details: error.message 
    });
  }
});

// Delete simulation
router.delete('/:id', async (req, res) => {
  try {
    const simulationId = req.params.id;
    const simulation = simulations.get(simulationId);
    
    if (!simulation) {
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    console.log('Deleting simulation:', simulationId);
    
    // Stop if running
    if (simulation.status === 'running') {
      if (simulation.mockDataInterval) {
        clearInterval(simulation.mockDataInterval);
      }
    }
    
    // Remove from simulations map
    simulations.delete(simulationId);
    
    res.json({ 
      success: true, 
      message: 'Simulation deleted successfully' 
    });
    
  } catch (error) {
    console.error('Error deleting simulation:', error);
    res.status(500).json({ 
      error: 'Failed to delete simulation',
      details: error.message 
    });
  }
});

// Get simulation logs (mock)
router.get('/:id/logs', (req, res) => {
  try {
    const simulationId = req.params.id;
    const simulation = simulations.get(simulationId);
    
    if (!simulation) {
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    // Generate mock logs
    const mockLogs = [
      `${new Date().toISOString()} - Simulation started`,
      `${new Date().toISOString()} - GPS: 8 satellites, HDOP: 1.2`,
      `${new Date().toISOString()} - Battery: 12.6V, 85% remaining`,
      `${new Date().toISOString()} - Flight mode: ${simulation.mockData?.flightMode || 'STABILIZED'}`,
      `${new Date().toISOString()} - Position: ${simulation.mockData?.position.lat.toFixed(6)}, ${simulation.mockData?.position.lng.toFixed(6)}, ${simulation.mockData?.position.alt.toFixed(1)}m`
    ];
    
    res.json({
      success: true,
      logs: mockLogs
    });
    
  } catch (error) {
    console.error('Error getting simulation logs:', error);
    res.status(500).json({ 
      error: 'Failed to get simulation logs',
      details: error.message 
    });
  }
});

module.exports = router; 