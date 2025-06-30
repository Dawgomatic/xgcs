const express = require('express');
const Docker = require('dockerode');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Initialize Docker client
const docker = new Docker();

// In-memory storage for simulations (in production, use a database)
let simulations = new Map();
let nextPort = 2220; // Start from 2220 for the first simulation

// Get next available port range (3 ports per simulation)
function getNextPortRange() {
  const basePort = nextPort;
  nextPort += 3; // Increment by 3 for next simulation
  return basePort;
}

let port = 2220;

// Get Docker image for vehicle type
function getDockerImage(vehicleType) {
  switch (vehicleType.toLowerCase()) {
    case 'arducopter':
    case 'arduplane':
    case 'ardurover':
    case 'ardusub':
      return 'custom-ardupilot-sitl:latest';
    case 'px4':
      return 'px4io/px4-dev-simulation-focal:latest';
    default:
      return 'custom-ardupilot-sitl:latest';
  }
}

// Build SITL command for vehicle type
function buildSITLCommand(config) {
  const { vehicleType, frameType, speedFactor, homeLocation, customParams } = config;
  
  let command = [];
  
  switch (vehicleType) {
    case 'arducopter':
      command = ['arducopter', '--model', frameType];
      break;
    case 'arduplane':
      command = ['arduplane', '--model', 'quadplane'];
      break;
    case 'ardurover':
      command = ['ardurover', '--model', 'rover'];
      break;
    case 'sub':
      command = ['ardusub', '--model', 'vectored'];
      break;
    default:
      command = ['arducopter', '--model', 'quad'];
  }
  
  // Add common parameters
  command.push(
    '--home', `${homeLocation.lat},${homeLocation.lng},${homeLocation.alt},0`,
    '--speedup', speedFactor.toString()
  );
  
  // Add custom parameters
  if (customParams) {
    const params = customParams.split('\n').filter(line => line.trim());
    params.forEach(param => {
      if (param.includes('=')) {
        const [key, value] = param.split('=');
        command.push('--param', `${key.trim()}=${value.trim()}`);
      }
    });
  }
  
  return command;
}

// Create simulation
router.post('/create', async (req, res) => {
  try {
    const config = req.body;
    const simulationId = uuidv4();
    const port = config.port || getNextPortRange();
    
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
      containerId: null,
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
    const simulationList = Array.from(simulations.values()).map(sim => ({
      id: sim.id,
      name: sim.name,
      vehicleType: sim.vehicleType,
      frameType: sim.frameType,
      ipAddress: sim.ipAddress,
      port: sim.port,
      speedFactor: sim.speedFactor,
      enableLogging: sim.enableLogging,
      enableVideo: sim.enableVideo,
      customParams: sim.customParams,
      homeLocation: sim.homeLocation,
      status: sim.status,
      createdAt: sim.createdAt,
      startedAt: sim.startedAt,
      stoppedAt: sim.stoppedAt,
      error: sim.error,
      stats: sim.stats
    }));
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
    
    // Check if Docker image exists, pull if not
    const imageName = getDockerImage(simulation.vehicleType);
    try {
      await docker.getImage(imageName).inspect();
    } catch (error) {
      console.log(`Pulling Docker image: ${imageName}`);
      await docker.pull(imageName);
    }
    
    // Build container configuration
    const containerName = `sitl-${simulation.vehicleType}-${simulationId.slice(0, 8)}`;
    const command = buildSITLCommand(simulation);
    
    const containerConfig = {
      Image: imageName,
      name: containerName,
      Cmd: command,
      HostConfig: {
        PortBindings: {
          '5760/tcp': [{ HostPort: simulation.port.toString() }],      // SERIAL0 -> host port (e.g., 2220)
          '5762/tcp': [{ HostPort: (simulation.port + 1).toString() }], // SERIAL1 -> host port (e.g., 2221)
          '5763/tcp': [{ HostPort: (simulation.port + 2).toString() }]  // SERIAL2 -> host port (e.g., 2222)
        },
        Memory: 512 * 1024 * 1024, // 512MB
        MemorySwap: 0,
        CpuShares: 512,
        RestartPolicy: {
          Name: 'no'
        }
      },
      Env: [
        `SIM_SPEEDUP=${simulation.speedFactor}`,
        `HOME_LOCATION=${simulation.homeLocation.lat},${simulation.homeLocation.lng},${simulation.homeLocation.alt},0`
      ],
      ExposedPorts: {
        '5760/tcp': {},
        '5762/tcp': {},
        '5763/tcp': {}
      }
    };
    
    // Create and start container
    const container = await docker.createContainer(containerConfig);
    await container.start();
    
    // Update simulation with container info
    simulation.containerId = container.id;
    simulation.status = 'running';
    simulation.startedAt = new Date().toISOString();
    simulations.set(simulationId, simulation);
    
    console.log(`Started SITL container: ${containerName} (${container.id})`);
    
    res.json({ 
      success: true, 
      message: 'Simulation started successfully',
      containerId: container.id
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
    
    if (simulation.containerId) {
      try {
        const container = docker.getContainer(simulation.containerId);
        await container.stop({ t: 10 }); // 10 second timeout
        await container.remove();
        console.log(`Stopped and removed container: ${simulation.containerId}`);
      } catch (error) {
        console.error('Error stopping container:', error);
        // Try to force remove if stop fails
        try {
          const container = docker.getContainer(simulation.containerId);
          await container.remove({ force: true });
        } catch (removeError) {
          console.error('Error force removing container:', removeError);
        }
      }
    }
    
    // Update simulation status
    simulation.status = 'stopped';
    simulation.containerId = null;
    simulation.stoppedAt = new Date().toISOString();
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
    
    // Get container stats if running
    let stats = null;
    if (simulation.containerId && simulation.status === 'running') {
      try {
        const container = docker.getContainer(simulation.containerId);
        const containerStats = await container.stats({ stream: false });
        
        // Calculate CPU and memory usage
        const cpuDelta = containerStats.cpu_stats.cpu_usage.total_usage - containerStats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = containerStats.cpu_stats.system_cpu_usage - containerStats.precpu_stats.system_cpu_usage;
        const cpuUsage = (cpuDelta / systemDelta) * 100;
        
        const memoryUsage = (containerStats.memory_stats.usage / containerStats.memory_stats.limit) * 100;
        
        stats = {
          cpuUsage: Math.round(cpuUsage * 100) / 100,
          memoryUsage: Math.round(memoryUsage * 100) / 100,
          uptime: Math.floor((Date.now() - new Date(simulation.startedAt).getTime()) / 1000)
        };
        
        simulation.stats = stats;
        simulations.set(simulationId, simulation);
      } catch (error) {
        console.error('Error getting container stats:', error);
      }
    }
    
    res.json({
      id: simulation.id,
      status: simulation.status,
      stats: stats,
      containerId: simulation.containerId
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
    
    // Stop and remove container if running
    if (simulation.containerId) {
      try {
        const container = docker.getContainer(simulation.containerId);
        await container.stop({ t: 5 });
        await container.remove();
      } catch (error) {
        console.error('Error removing container:', error);
        // Try force remove
        try {
          const container = docker.getContainer(simulation.containerId);
          await container.remove({ force: true });
        } catch (removeError) {
          console.error('Error force removing container:', removeError);
        }
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

// Get simulation logs
router.get('/:id/logs', async (req, res) => {
  try {
    const simulationId = req.params.id;
    const simulation = simulations.get(simulationId);
    
    if (!simulation) {
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    if (!simulation.containerId) {
      return res.json({ logs: [] });
    }
    
    const container = docker.getContainer(simulation.containerId);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: 100
    });
    
    const logLines = logs.toString().split('\n').filter(line => line.trim());
    
    res.json({ logs: logLines });
    
  } catch (error) {
    console.error('Error getting simulation logs:', error);
    res.status(500).json({ 
      error: 'Failed to get simulation logs',
      details: error.message 
    });
  }
});

module.exports = router; 