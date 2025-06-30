const express = require('express');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// In-memory storage for simulations
let simulations = new Map();
let nextPort = 5761;

// Get next available port
function getNextPort() {
  return nextPort++;
}

let port = 5761;

// Find ArduPilot SITL executable
function findSITLExecutable(vehicleType) {
  const possiblePaths = [
    // Your existing ArduPilot installation
    path.join(process.cwd(), '../ardupilot/ArduCopter/arducopter'),
    path.join(process.cwd(), '../ardupilot/ArduPlane/arduplane'),
    path.join(process.cwd(), '../ardupilot/ArduRover/ardurover'),
    path.join(process.cwd(), '../ardupilot/ArduSub/ardusub'),
    
    // System-wide installations
    '/usr/bin/arducopter',
    '/usr/local/bin/arducopter',
    '/usr/bin/arduplane',
    '/usr/local/bin/arduplane',
    
    // Build directories
    path.join(process.cwd(), '../ardupilot/build/sitl/bin/arducopter'),
    path.join(process.cwd(), '../ardupilot/build/sitl/bin/arduplane'),
    path.join(process.cwd(), '../ardupilot/build/sitl/bin/ardurover'),
    path.join(process.cwd(), '../ardupilot/build/sitl/bin/ardusub'),
  ];

  // Find the appropriate executable for the vehicle type
  for (const sitlPath of possiblePaths) {
    if (fs.existsSync(sitlPath)) {
      const basename = path.basename(sitlPath);
      if (basename === vehicleType || basename === 'arducopter') {
        return sitlPath;
      }
    }
  }

  return null;
}

// Build SITL command arguments
function buildSITLArgs(config) {
  const { vehicleType, frameType, speedFactor, homeLocation, customParams } = config;
  
  const args = [
    '--model', frameType || 'quad',
    '--home', `${homeLocation.lat},${homeLocation.lng},${homeLocation.alt},0`,
    '--speedup', speedFactor.toString(),
    '--instance', '0'
  ];

  // Add custom parameters
  if (customParams) {
    const params = customParams.split('\n').filter(line => line.trim());
    params.forEach(param => {
      if (param.includes('=')) {
        const [key, value] = param.split('=');
        args.push('--param', `${key.trim()}=${value.trim()}`);
      }
    });
  }

  return args;
}

// Create simulation
router.post('/create', async (req, res) => {
  try {
    const config = req.body;
    const simulationId = uuidv4();
    const port = config.port || getNextPort();
    
    const simulation = {
      id: simulationId,
      name: config.name || `${config.vehicleType} ${simulationId.slice(0, 8)}`,
      vehicleType: config.vehicleType,
      frameType: config.frameType,
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
      stats: null
    };
    
    simulations.set(simulationId, simulation);
    
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
    
    // Update status
    simulation.status = 'starting';
    simulations.set(simulationId, simulation);
    
    // Find SITL executable
    const sitlPath = findSITLExecutable(simulation.vehicleType);
    if (!sitlPath) {
      simulation.status = 'error';
      simulation.error = `SITL executable not found for ${simulation.vehicleType}`;
      simulations.set(simulationId, simulation);
      return res.status(500).json({ 
        error: 'SITL executable not found',
        details: `Could not find ${simulation.vehicleType} executable`,
        suggestion: 'Please ensure ArduPilot is built and installed correctly'
      });
    }
    
    // Build command arguments
    const args = buildSITLArgs(simulation);
    
    console.log(`Starting SITL: ${sitlPath} ${args.join(' ')}`);
    
    // Start SITL process
    const sitlProcess = spawn(sitlPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    });
    
    // Update simulation with process info
    simulation.processId = sitlProcess.pid;
    simulation.status = 'running';
    simulation.startedAt = new Date().toISOString();
    simulation.process = sitlProcess;
    simulations.set(simulationId, simulation);
    
    // Handle process output
    sitlProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log(`[SITL ${simulationId}] ${output}`);
      }
    });
    
    sitlProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log(`[SITL ${simulationId} ERROR] ${output}`);
      }
    });
    
    // Handle process exit
    sitlProcess.on('close', (code) => {
      console.log(`SITL process ${simulationId} exited with code ${code}`);
      simulation.status = 'stopped';
      simulation.processId = null;
      simulation.process = null;
      simulation.stoppedAt = new Date().toISOString();
      simulations.set(simulationId, simulation);
    });
    
    // Handle process errors
    sitlProcess.on('error', (error) => {
      console.error(`SITL process ${simulationId} error:`, error);
      simulation.status = 'error';
      simulation.error = error.message;
      simulation.processId = null;
      simulation.process = null;
      simulations.set(simulationId, simulation);
    });
    
    console.log(`Started SITL process: ${sitlProcess.pid}`);
    
    res.json({ 
      success: true, 
      message: 'Simulation started successfully',
      processId: sitlProcess.pid
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
    
    // Update status
    simulation.status = 'stopping';
    simulations.set(simulationId, simulation);
    
    if (simulation.process) {
      try {
        // Send SIGTERM first
        simulation.process.kill('SIGTERM');
        
        // Wait a bit, then force kill if needed
        setTimeout(() => {
          if (simulation.process && simulation.status === 'stopping') {
            console.log(`Force killing SITL process ${simulationId}`);
            simulation.process.kill('SIGKILL');
          }
        }, 5000);
      } catch (error) {
        console.error('Error stopping process:', error);
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Simulation stop command sent' 
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
        memoryUsage: Math.random() * 15 + 5 // Mock memory usage
      };
      
      simulation.stats = stats;
      simulations.set(simulationId, simulation);
    }
    
    res.json({
      id: simulation.id,
      status: simulation.status,
      stats: stats,
      processId: simulation.processId
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
    
    // Stop process if running
    if (simulation.process) {
      try {
        simulation.process.kill('SIGTERM');
        setTimeout(() => {
          if (simulation.process) {
            simulation.process.kill('SIGKILL');
          }
        }, 2000);
      } catch (error) {
        console.error('Error stopping process:', error);
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

module.exports = router; 