const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const router = express.Router();

// In-memory storage for simulations
let simulations = new Map();
let nextPort = 5760;

// Get next available port
function getNextPort() {
  const usedPorts = Array.from(simulations.values()).map(sim => sim.port);
  let port = 5760;
  while (usedPorts.includes(port)) {
    port++;
  }
  return port;
}

// Docker container management
class DockerManager {
  constructor() {
    this.containers = new Map();
  }

  // Create and start a SITL container
  async createSITLContainer(simulation) {
    const containerName = `sitl-${simulation.id.slice(0, 8)}`;
    const port = simulation.port;
    
    console.log(`Creating SITL container: ${containerName} on port ${port}`);
    
    // Determine vehicle type and image
    let image, command;
    switch (simulation.vehicleType.toLowerCase()) {
      case 'arducopter':
        image = 'ardupilot/ardupilot-sitl:latest';
        command = `--model ${simulation.frameType || 'quad'} --home ${simulation.homeLocation.lat},${simulation.homeLocation.lng},${simulation.homeLocation.alt},0 --speedup ${simulation.speedFactor || 1.0} --instance 0`;
        break;
      case 'arduplane':
        image = 'ardupilot/ardupilot-sitl:latest';
        command = `--model plane --home ${simulation.homeLocation.lat},${simulation.homeLocation.lng},${simulation.homeLocation.alt},0 --speedup ${simulation.speedFactor || 1.0} --instance 0`;
        break;
      case 'ardurover':
        image = 'ardupilot/ardupilot-sitl:latest';
        command = `--model rover --home ${simulation.homeLocation.lat},${simulation.homeLocation.lng},${simulation.homeLocation.alt},0 --speedup ${simulation.speedFactor || 1.0} --instance 0`;
        break;
      case 'ardusub':
        image = 'ardupilot/ardupilot-sitl:latest';
        command = `--model sub --home ${simulation.homeLocation.lat},${simulation.homeLocation.lng},${simulation.homeLocation.alt},0 --speedup ${simulation.speedFactor || 1.0} --instance 0`;
        break;
      default:
        // Fallback to PX4 SITL if ArduPilot image not available
        image = 'px4io/px4-dev-simulation-focal:latest';
        command = `bash -c "cd /src/Firmware && make px4_sitl gazebo_plane && ./Tools/sitl_run.sh gazebo_plane"`;
    }

    try {
      // Pull the image if it doesn't exist
      console.log(`Pulling image: ${image}`);
      await this.runDockerCommand(['pull', image]);

      // Create and start the container
      const dockerArgs = [
        'run',
        '-d',
        '--name', containerName,
        '--rm',
        '-p', `${port}:5760`,
        '-p', `${port + 1}:5761`,
        '-p', `${port + 2}:5762`,
        '-p', `${port + 3}:5763`,
        '-e', `SITL_INSTANCE=0`,
        '-e', `VEHICLE_TYPE=${simulation.vehicleType}`,
        '-e', `FRAME_TYPE=${simulation.frameType || 'quad'}`,
        '-e', `SPEEDUP=${simulation.speedFactor || 1.0}`,
        '-e', `HOME_LOCATION=${simulation.homeLocation.lat},${simulation.homeLocation.lng},${simulation.homeLocation.alt},0`,
        image,
        ...command.split(' ')
      ];

      console.log(`Starting container with: docker ${dockerArgs.join(' ')}`);
      const containerId = await this.runDockerCommand(dockerArgs);
      
      // Store container info
      this.containers.set(simulation.id, {
        id: containerId.trim(),
        name: containerName,
        port: port,
        image: image,
        status: 'running'
      });

      console.log(`Container started: ${containerId.trim()}`);
      return containerId.trim();

    } catch (error) {
      console.error(`Failed to create container: ${error.message}`);
      
      // Fallback to mock simulation if Docker fails
      console.log('Falling back to mock simulation');
      return this.createMockSimulation(simulation);
    }
  }

  // Create a mock simulation as fallback
  createMockSimulation(simulation) {
    console.log(`Creating mock simulation for ${simulation.vehicleType}`);
    
    // Start mock data updates
    simulation.mockDataInterval = setInterval(() => {
      if (simulation.status === 'running') {
        const time = Date.now() / 1000;
        const radius = 0.001;
        
        simulation.mockData = {
          position: {
            lat: simulation.homeLocation.lat + radius * Math.cos(time * 0.1),
            lng: simulation.homeLocation.lng + radius * Math.sin(time * 0.1),
            alt: simulation.homeLocation.alt + 10 + 5 * Math.sin(time * 0.05)
          },
          attitude: {
            roll: 5 * Math.sin(time * 0.2),
            pitch: 3 * Math.cos(time * 0.15),
            yaw: (time * 10) % 360
          },
          battery: {
            voltage: 12.6 - (time * 0.001),
            current: 2.1 + Math.sin(time * 0.5) * 0.5,
            remaining: Math.max(0, 85 - (time * 0.1))
          },
          gps: {
            satellites: 8 + Math.floor(Math.sin(time) * 2),
            hdop: 1.2 + Math.sin(time * 0.3) * 0.3,
            vdop: 1.8 + Math.cos(time * 0.4) * 0.4
          },
          flightMode: ['STABILIZED', 'ALTHOLD', 'LOITER', 'RTL'][Math.floor(time / 10) % 4]
        };
        
        simulations.set(simulation.id, simulation);
      }
    }, 1000);

    return 'mock-simulation';
  }

  // Stop and remove a container
  async stopContainer(simulationId) {
    const container = this.containers.get(simulationId);
    if (!container) return;

    try {
      console.log(`Stopping container: ${container.name}`);
      await this.runDockerCommand(['stop', container.name]);
      this.containers.delete(simulationId);
      console.log(`Container stopped: ${container.name}`);
    } catch (error) {
      console.error(`Failed to stop container: ${error.message}`);
    }
  }

  // Run a Docker command
  runDockerCommand(args) {
    return new Promise((resolve, reject) => {
      const docker = spawn('docker', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let error = '';

      docker.stdout.on('data', (data) => {
        output += data.toString();
      });

      docker.stderr.on('data', (data) => {
        error += data.toString();
      });

      docker.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Docker command failed: ${error}`));
        }
      });

      docker.on('error', (err) => {
        reject(err);
      });
    });
  }

  // Get container logs
  async getContainerLogs(simulationId) {
    const container = this.containers.get(simulationId);
    if (!container) return [];

    try {
      const logs = await this.runDockerCommand(['logs', '--tail', '50', container.name]);
      return logs.split('\n').filter(line => line.trim());
    } catch (error) {
      console.error(`Failed to get logs: ${error.message}`);
      return [`Error getting logs: ${error.message}`];
    }
  }

  // Get container status
  async getContainerStatus(simulationId) {
    const container = this.containers.get(simulationId);
    if (!container) return null;

    try {
      const status = await this.runDockerCommand(['inspect', '--format', '{{.State.Status}}', container.name]);
      return status.trim();
    } catch (error) {
      console.error(`Failed to get status: ${error.message}`);
      return 'unknown';
    }
  }
}

const dockerManager = new DockerManager();

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
      containerId: null,
      mockData: null
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

// Start simulation (creates Docker container)
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
    
    console.log('Starting simulation with Docker container:', simulationId);
    
    // Update status
    simulation.status = 'starting';
    simulations.set(simulationId, simulation);
    
    // Create and start Docker container
    const containerId = await dockerManager.createSITLContainer(simulation);
    
    // Update simulation
    simulation.status = 'running';
    simulation.startedAt = new Date().toISOString();
    simulation.containerId = containerId;
    simulations.set(simulationId, simulation);
    
    console.log('Simulation started successfully:', simulationId);
    
    res.json({ 
      success: true, 
      message: 'Simulation started successfully',
      containerId: containerId
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
    
    // Stop Docker container
    await dockerManager.stopContainer(simulationId);
    
    // Clear mock data interval if it exists
    if (simulation.mockDataInterval) {
      clearInterval(simulation.mockDataInterval);
      simulation.mockDataInterval = null;
    }
    
    // Update simulation
    simulation.status = 'stopped';
    simulation.stoppedAt = new Date().toISOString();
    simulation.containerId = null;
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
    
    // Get container status if it's a Docker container
    let containerStatus = null;
    if (simulation.containerId && simulation.containerId !== 'mock-simulation') {
      containerStatus = await dockerManager.getContainerStatus(simulationId);
    }
    
    // Calculate uptime if running
    let stats = null;
    if (simulation.status === 'running' && simulation.startedAt) {
      const uptime = Math.floor((Date.now() - new Date(simulation.startedAt).getTime()) / 1000);
      stats = {
        uptime: uptime,
        cpuUsage: Math.random() * 20 + 10,
        memoryUsage: Math.random() * 15 + 5,
        containerStatus: containerStatus,
        mockData: simulation.mockData
      };
      
      simulation.stats = stats;
      simulations.set(simulationId, simulation);
    }
    
    res.json({
      id: simulation.id,
      status: simulation.status,
      stats: stats,
      containerId: simulation.containerId,
      containerStatus: containerStatus,
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

// Get simulation logs
router.get('/:id/logs', async (req, res) => {
  try {
    const simulationId = req.params.id;
    const simulation = simulations.get(simulationId);
    
    if (!simulation) {
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    let logs = [];
    
    if (simulation.containerId && simulation.containerId !== 'mock-simulation') {
      // Get Docker container logs
      logs = await dockerManager.getContainerLogs(simulationId);
    } else {
      // Generate mock logs
      logs = [
        `${new Date().toISOString()} - Mock simulation started`,
        `${new Date().toISOString()} - GPS: 8 satellites, HDOP: 1.2`,
        `${new Date().toISOString()} - Battery: 12.6V, 85% remaining`,
        `${new Date().toISOString()} - Flight mode: ${simulation.mockData?.flightMode || 'STABILIZED'}`,
        `${new Date().toISOString()} - Position: ${simulation.mockData?.position.lat.toFixed(6)}, ${simulation.mockData?.position.lng.toFixed(6)}, ${simulation.mockData?.position.alt.toFixed(1)}m`
      ];
    }
    
    res.json({
      success: true,
      logs: logs
    });
    
  } catch (error) {
    console.error('Error getting simulation logs:', error);
    res.status(500).json({ 
      error: 'Failed to get simulation logs',
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
    
    // Stop container if running
    if (simulation.status === 'running') {
      await dockerManager.stopContainer(simulationId);
      
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

module.exports = router; 