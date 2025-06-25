const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

// File path for persistence
const SIMULATIONS_FILE = path.join(__dirname, '../../simulations.json');

// Enhanced logging function
const log = (message, level = 'info') => {
  const timestamp = new Date().toISOString();
  const levelStr = typeof level === 'string' ? level.toUpperCase() : 'INFO';
  const logMessage = `[Simulation-Docker] ${timestamp} [${levelStr}] ${message}`;
  console.log(logMessage);
};

// In-memory storage for simulations
let simulations = new Map();
let nextPort = 5760;

// Save simulations to file
async function saveSimulations() {
  try {
    const simulationsArray = Array.from(simulations.values());
    await fs.writeFile(SIMULATIONS_FILE, JSON.stringify(simulationsArray, null, 2));
    log(`Saved ${simulationsArray.length} simulations to file`);
  } catch (error) {
    log(`Error saving simulations to file: ${error.message}`, 'error');
  }
}

// Load simulations from file
async function loadSimulations() {
  try {
    const data = await fs.readFile(SIMULATIONS_FILE, 'utf8');
    const simulationsArray = JSON.parse(data);
    simulations.clear();
    simulationsArray.forEach(sim => {
      simulations.set(sim.id, sim);
    });
    log(`Loaded ${simulationsArray.length} simulations from file`);
    return simulationsArray;
  } catch (error) {
    if (error.code === 'ENOENT') {
      log('No simulations file found, starting fresh');
      return [];
    }
    log(`Error loading simulations from file: ${error.message}`, 'error');
    return [];
  }
}

// Scan Docker containers for SITL instances
async function scanDockerContainers() {
  try {
    const dockerManager = new DockerManager();
    
    // Get all containers (running and stopped)
    const psOutput = await dockerManager.runDockerCommand(['ps', '-a', '--format', '{{.Names}}|{{.ID}}|{{.Status}}|{{.Ports}}']);
    const containers = psOutput.split('\n').filter(line => line.trim());
    
    const sitlContainers = [];
    for (const container of containers) {
      const [name, id, status, ports] = container.split('|');
      
      // Check if it's a SITL container (starts with 'sitl-')
      if (name && name.startsWith('sitl-')) {
        const simulationId = name.substring(5); // Remove 'sitl-' prefix
        
        // Extract port from port mapping
        const portMatch = ports.match(/:(\d+)-/);
        const port = portMatch ? parseInt(portMatch[1]) : null;
        
        sitlContainers.push({
          name,
          containerId: id,
          status: status.includes('Up') ? 'running' : 'stopped',
          port,
          simulationIdPrefix: simulationId
        });
      }
    }
    
    log(`Found ${sitlContainers.length} SITL containers`);
    return sitlContainers;
  } catch (error) {
    log(`Error scanning Docker containers: ${error.message}`, 'error');
    return [];
  }
}

// Reconcile simulations with Docker containers
async function reconcileSimulations() {
  log('Reconciling simulations with Docker containers...');
  
  // Load saved simulations
  const savedSimulations = await loadSimulations();
  
  // Scan for Docker containers
  const dockerContainers = await scanDockerContainers();
  
  // Update simulation states based on container status
  for (const sim of savedSimulations) {
    const container = dockerContainers.find(c => 
      sim.id.startsWith(c.simulationIdPrefix) || 
      c.containerId === sim.containerId
    );
    
    if (container) {
      // Update simulation with current container state
      sim.containerId = container.containerId;
      sim.status = container.status;
      if (container.port && sim.port !== container.port) {
        log(`Port mismatch for ${sim.id}: saved=${sim.port}, container=${container.port}`);
      }
      simulations.set(sim.id, sim);
      
      // Update dockerManager's container map
      dockerManager.containers.set(sim.id, {
        id: container.containerId,
        name: container.name,
        port: sim.port,
        image: 'xgcs-ardupilot-sitl:latest',
        status: container.status
      });
    } else if (sim.status === 'running') {
      // Simulation was running but container not found
      log(`Container not found for running simulation ${sim.id}, marking as stopped`);
      sim.status = 'stopped';
      sim.containerId = null;
      simulations.set(sim.id, sim);
    }
  }
  
  // Check for orphaned containers (containers without matching simulations)
  for (const container of dockerContainers) {
    const hasMatchingSim = Array.from(simulations.values()).some(sim => 
      sim.id.startsWith(container.simulationIdPrefix) || 
      sim.containerId === container.containerId
    );
    
    if (!hasMatchingSim && container.status === 'running') {
      log(`Found orphaned container: ${container.name}, consider cleanup`);
      // Optionally: await dockerManager.runDockerCommand(['stop', container.name]);
    }
  }
  
  // Save updated state
  await saveSimulations();
  log(`Reconciliation complete. Active simulations: ${simulations.size}`);
}

// Docker container management
class DockerManager {
  constructor() {
    this.containers = new Map();
    log('DockerManager initialized');
  }

  // Run Docker command and return output
  async runDockerCommand(args) {
    return new Promise((resolve, reject) => {
      log(`Running Docker command: docker ${args.join(' ')}`);
      
      const dockerProcess = spawn('docker', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      dockerProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        log(`Docker stdout: ${data.toString().trim()}`);
      });

      dockerProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        log(`Docker stderr: ${data.toString().trim()}`, 'warn');
      });

      dockerProcess.on('close', (code) => {
        if (code === 0) {
          log(`Docker command completed successfully: docker ${args.join(' ')}`);
          resolve(stdout.trim());
        } else {
          const error = `Docker command failed with code ${code}: docker ${args.join(' ')}\nStderr: ${stderr}`;
          log(error, 'error');
          reject(new Error(error));
        }
      });

      dockerProcess.on('error', (error) => {
        const errorMsg = `Docker process error: ${error.message}`;
        log(errorMsg, 'error');
        reject(new Error(errorMsg));
      });
    });
  }

  // Create and start a SITL container
  async createSITLContainer(simulation) {
    const containerName = `sitl-${simulation.id.slice(0, 8)}`;
    const port = simulation.port;
    
    log(`Creating SITL container: ${containerName} on port ${port}`);
    log(`Simulation config: ${JSON.stringify(simulation, null, 2)}`);
    
    // Determine vehicle type and image
    let image, command;
    switch (simulation.vehicleType.toLowerCase()) {
      case 'arducopter':
        image = 'xgcs-ardupilot-sitl:latest';
        command = `/ardupilot/build/sitl/bin/arducopter --model ${simulation.frameType || 'quad'} --home ${simulation.homeLocation.lat},${simulation.homeLocation.lng},${simulation.homeLocation.alt},0 --speedup ${simulation.speedFactor || 1.0} --instance 0`;
        break;
      case 'arduplane':
        image = 'xgcs-ardupilot-sitl:latest';
        command = `/ardupilot/build/sitl/bin/arduplane --model plane --home ${simulation.homeLocation.lat},${simulation.homeLocation.lng},${simulation.homeLocation.alt},0 --speedup ${simulation.speedFactor || 1.0} --instance 0`;
        break;
      case 'ardurover':
        image = 'xgcs-ardupilot-sitl:latest';
        command = `/ardupilot/build/sitl/bin/ardurover --model rover --home ${simulation.homeLocation.lat},${simulation.homeLocation.lng},${simulation.homeLocation.alt},0 --speedup ${simulation.speedFactor || 1.0} --instance 0`;
        break;
      case 'ardusub':
        image = 'xgcs-ardupilot-sitl:latest';
        command = `/ardupilot/build/sitl/bin/ardusub --model sub --home ${simulation.homeLocation.lat},${simulation.homeLocation.lng},${simulation.homeLocation.alt},0 --speedup ${simulation.speedFactor || 1.0} --instance 0`;
        break;
      default:
        // Fallback to PX4 SITL if ArduPilot image not available
        image = 'px4io/px4-dev-simulation-focal:latest';
        command = `bash -c "cd /src/Firmware && make px4_sitl gazebo_plane && ./Tools/sitl_run.sh gazebo_plane"`;
    }

    log(`Selected image: ${image}`);
    log(`Selected command: ${command}`);

    try {
      // Check if Docker is available
      log('Checking Docker availability...');
      await this.runDockerCommand(['version']);
      log('Docker is available');

      // Pull the image if it doesn't exist
      log(`Pulling image: ${image}`);
      try {
        await this.runDockerCommand(['pull', image]);
        log(`Image pulled successfully: ${image}`);
      } catch (pullError) {
        log(`Failed to pull image ${image}: ${pullError.message}`, 'warn');
        log('Will try to use existing image or fallback to mock simulation');
      }

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

      log(`Starting container with: docker ${dockerArgs.join(' ')}`);
      const containerId = await this.runDockerCommand(dockerArgs);
      
      log(`Container started successfully: ${containerId.trim()}`);
      
      // Store container info
      this.containers.set(simulation.id, {
        id: containerId.trim(),
        name: containerName,
        port: port,
        image: image,
        status: 'running'
      });

      log(`Container info stored for simulation ${simulation.id}`);
      return containerId.trim();

    } catch (error) {
      log(`Failed to create container: ${error.message}`, 'error');
      
      // Fallback to mock simulation if Docker fails
      log('Falling back to mock simulation');
      return this.createMockSimulation(simulation);
    }
  }

  // Stop and remove a container
  async stopContainer(simulationId) {
    const container = this.containers.get(simulationId);
    if (!container) {
      log(`No container found for simulation: ${simulationId}`, 'warn');
      return;
    }

    log(`Stopping container: ${container.name} (${container.id})`);

    try {
      await this.runDockerCommand(['stop', container.name]);
      this.containers.delete(simulationId);
      log(`Container stopped successfully: ${container.name}`);
    } catch (error) {
      log(`Failed to stop container: ${error.message}`, 'error');
    }
  }

  // Get container status
  async getContainerStatus(simulationId) {
    const container = this.containers.get(simulationId);
    if (!container) {
      log(`No container found for simulation: ${simulationId}`, 'warn');
      return null;
    }

    try {
      log(`Getting status for container: ${container.name}`);
      const status = await this.runDockerCommand(['inspect', '--format', '{{.State.Status}}', container.name]);
      log(`Container status: ${status.trim()}`);
      return status.trim();
    } catch (error) {
      log(`Failed to get status: ${error.message}`, 'error');
      return 'unknown';
    }
  }

  // Get container logs
  async getContainerLogs(simulationId) {
    const container = this.containers.get(simulationId);
    if (!container) {
      log(`No container found for simulation: ${simulationId}`, 'warn');
      return [];
    }

    try {
      log(`Getting logs for container: ${container.name}`);
      const logs = await this.runDockerCommand(['logs', '--tail', '50', container.name]);
      const logLines = logs.split('\n').filter(line => line.trim());
      log(`Retrieved ${logLines.length} log lines from container: ${container.name}`);
      return logLines;
    } catch (error) {
      log(`Failed to get container logs: ${error.message}`, 'error');
      return [`Error getting logs: ${error.message}`];
    }
  }

  // Create a mock simulation as fallback
  createMockSimulation(simulation) {
    log(`Creating mock simulation for ${simulation.vehicleType}`);
    
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

    log(`Mock simulation created for ${simulation.vehicleType} with ID: ${simulation.id}`);
    return 'mock-simulation';
  }
}

// Create singleton instance
const dockerManager = new DockerManager();

// Initialize on module load
(async function initialize() {
  log('Initializing simulation manager...');
  await reconcileSimulations();
  log('Simulation manager ready');
})();

// Create simulation
router.post('/create', async (req, res) => {
  try {
    log('Creating simulation with config:', req.body);
    
    const config = req.body;
    const simulationId = uuidv4();
    const port = await getNextPort(); // Always get next available port
    
    log(`Generated simulation ID: ${simulationId}`);
    log(`Assigned port: ${port}`);
    
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
    
    // Save to file
    await saveSimulations();
    
    log(`Simulation created successfully: ${simulationId}`);
    log(`Total simulations: ${simulations.size}`);
    
    res.json({ 
      success: true, 
      simulation: simulation 
    });
    
  } catch (error) {
    log(`Error creating simulation: ${error.message}`, 'error');
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
    log(`Listing ${simulationList.length} simulations`);
    res.json({ 
      success: true, 
      simulations: simulationList 
    });
  } catch (error) {
    log(`Error listing simulations: ${error.message}`, 'error');
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
    log(`Starting simulation: ${simulationId}`);
    
    const simulation = simulations.get(simulationId);
    
    if (!simulation) {
      log(`Simulation not found: ${simulationId}`, 'error');
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    if (simulation.status === 'running' || simulation.status === 'starting') {
      log(`Simulation already running/starting: ${simulationId}`, 'warn');
      return res.status(400).json({ error: 'Simulation is already running' });
    }
    
    log('Starting simulation with Docker container:', simulationId);
    log(`Simulation config: ${JSON.stringify(simulation, null, 2)}`);
    
    // Update status
    simulation.status = 'starting';
    simulations.set(simulationId, simulation);
    
    // Create and start Docker container
    log(`Creating Docker container for simulation: ${simulationId}`);
    const containerId = await dockerManager.createSITLContainer(simulation);
    
    log(`Docker container created: ${containerId}`);
    
    // Update simulation
    simulation.status = 'running';
    simulation.startedAt = new Date().toISOString();
    simulation.containerId = containerId;
    simulations.set(simulationId, simulation);
    
    // Save to file
    await saveSimulations();
    
    log(`Simulation started successfully: ${simulationId}`);
    log(`Container ID: ${containerId}`);
    
    res.json({ 
      success: true, 
      message: 'Simulation started successfully',
      containerId: containerId
    });
    
  } catch (error) {
    log(`Error starting simulation: ${error.message}`, 'error');
    
    // Update simulation status to error
    const simulationId = req.params.id;
    const simulation = simulations.get(simulationId);
    if (simulation) {
      simulation.status = 'error';
      simulation.error = error.message;
      simulations.set(simulationId, simulation);
      log(`Updated simulation ${simulationId} status to error`);
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
    log(`Stopping simulation: ${simulationId}`);
    
    const simulation = simulations.get(simulationId);
    
    if (!simulation) {
      log(`Simulation not found: ${simulationId}`, 'error');
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    if (simulation.status === 'stopped' || simulation.status === 'stopping') {
      log(`Simulation already stopped/stopping: ${simulationId}`, 'warn');
      return res.status(400).json({ error: 'Simulation is not running' });
    }
    
    log('Stopping simulation:', simulationId);
    log(`Current status: ${simulation.status}`);
    log(`Container ID: ${simulation.containerId}`);
    
    // Stop Docker container
    await dockerManager.stopContainer(simulationId);
    
    // Clear mock data interval if it exists
    if (simulation.mockDataInterval) {
      clearInterval(simulation.mockDataInterval);
      simulation.mockDataInterval = null;
      log(`Cleared mock data interval for simulation: ${simulationId}`);
    }
    
    // Update simulation
    simulation.status = 'stopped';
    simulation.stoppedAt = new Date().toISOString();
    simulation.containerId = null;
    simulations.set(simulationId, simulation);
    
    // Save to file
    await saveSimulations();
    
    log(`Simulation stopped successfully: ${simulationId}`);
    
    res.json({ 
      success: true, 
      message: 'Simulation stopped successfully' 
    });
    
  } catch (error) {
    log(`Error stopping simulation: ${error.message}`, 'error');
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
    log(`Getting status for simulation: ${simulationId}`);
    
    const simulation = simulations.get(simulationId);
    
    if (!simulation) {
      log(`Simulation not found: ${simulationId}`, 'error');
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    log(`Simulation status: ${simulation.status}`);
    log(`Container ID: ${simulation.containerId}`);
    
    // Get container status if it's a Docker container
    let containerStatus = null;
    if (simulation.containerId && simulation.containerId !== 'mock-simulation') {
      containerStatus = await dockerManager.getContainerStatus(simulationId);
      log(`Container status: ${containerStatus}`);
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
      log(`Updated stats for simulation: ${simulationId}`);
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
    log(`Error getting simulation status: ${error.message}`, 'error');
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
    log(`Getting logs for simulation: ${simulationId}`);
    
    const simulation = simulations.get(simulationId);
    
    if (!simulation) {
      log(`Simulation not found: ${simulationId}`, 'error');
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    let logs = [];
    
    if (simulation.containerId && simulation.containerId !== 'mock-simulation') {
      // Get Docker container logs
      log(`Fetching Docker container logs for: ${simulation.containerId}`);
      logs = await dockerManager.getContainerLogs(simulationId);
      log(`Retrieved ${logs.length} log entries from Docker container`);
    } else {
      // Generate mock logs
      log(`Generating mock logs for simulation: ${simulationId}`);
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
    log(`Error getting simulation logs: ${error.message}`, 'error');
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
    log(`Deleting simulation: ${simulationId}`);
    
    const simulation = simulations.get(simulationId);
    
    if (!simulation) {
      log(`Simulation not found: ${simulationId}`, 'error');
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    log(`Simulation status: ${simulation.status}`);
    log(`Container ID: ${simulation.containerId}`);
    
    // Stop container if running
    if (simulation.status === 'running') {
      log(`Stopping running container before deletion: ${simulationId}`);
      await dockerManager.stopContainer(simulationId);
      
      if (simulation.mockDataInterval) {
        clearInterval(simulation.mockDataInterval);
        log(`Cleared mock data interval for simulation: ${simulationId}`);
      }
    }
    
    // Remove from simulations map
    simulations.delete(simulationId);
    log(`Removed simulation from storage: ${simulationId}`);
    log(`Total simulations remaining: ${simulations.size}`);
    
    // Save to file
    await saveSimulations();
    
    res.json({ 
      success: true, 
      message: 'Simulation deleted successfully' 
    });
    
  } catch (error) {
    log(`Error deleting simulation: ${error.message}`, 'error');
    res.status(500).json({ 
      error: 'Failed to delete simulation',
      details: error.message 
    });
  }
});

// Get next available port
async function getNextPort() {
  const usedPorts = Array.from(simulations.values()).map(sim => sim.port);
  
  // Also check for ports used by Docker containers
  try {
    const dockerManager = new DockerManager();
    const containers = await dockerManager.runDockerCommand(['ps', '--format', '{{.Ports}}']);
    const containerPorts = containers.split('\n')
      .filter(line => line.trim())
      .flatMap(line => {
        // Example: "0.0.0.0:5760-5763->5760-5763/tcp, ..."
        // Extract all host port ranges
        const portSpecs = line.split(',').map(s => s.trim());
        let ports = [];
        for (const spec of portSpecs) {
          // Match host port or range before the colon
          // e.g., 0.0.0.0:5760-5763->5760-5763/tcp
          const match = spec.match(/:(\d+)(-(\d+))?/);
          if (match) {
            const start = parseInt(match[1]);
            const end = match[3] ? parseInt(match[3]) : start;
            for (let p = start; p <= end; p++) {
              ports.push(p);
            }
          }
        }
        return ports;
      });
    log(`Detected Docker container ports: ${containerPorts.join(', ')}`);
    usedPorts.push(...containerPorts);
  } catch (error) {
    log(`Warning: Could not check Docker container ports: ${error.message}`, 'warn');
  }
  log(`All used ports: ${usedPorts.join(', ')}`);
  let port = 5760;
  while (usedPorts.includes(port)) {
    port++;
  }
  log(`Selected available port: ${port}`);
  return port;
}

module.exports = router; 