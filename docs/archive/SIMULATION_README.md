# XGCS Simulation System

The XGCS Simulation system allows you to run multiple ArduPilot SITL (Software In The Loop) simulations using Docker containers. This provides isolation, scalability, and easy management of multiple simulation instances.

## Features

- **Multiple Simulations**: Run multiple SITL instances simultaneously
- **Vehicle Types**: Support for ArduCopter, ArduPlane, ArduRover, and ArduSub
- **Docker-based**: Each simulation runs in its own isolated container
- **Port Management**: Automatic port assignment for MAVLink communication
- **Resource Monitoring**: Real-time CPU and memory usage tracking
- **Easy Management**: Start, stop, and delete simulations through the web interface

## Prerequisites

### 1. Docker Installation

Make sure Docker is installed and running on your system:

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker

# Add your user to the docker group
sudo usermod -aG docker $USER
# Log out and back in for changes to take effect
```

### 2. ArduPilot SITL Docker Image

The system uses the official ArduPilot SITL Docker image. It will be automatically pulled when you first start a simulation.

## Installation

### 1. Install Node.js Dependencies

```bash
cd xgcs/server
npm install
```

### 2. Start the Simulation Server

```bash
# Start the simulation server
npm start

# Or for development with auto-restart
npm run dev
```

The simulation server will run on port 5000 by default.

### 3. Start the Main XGCS Application

```bash
# From the xgcs directory
./start.sh
```

## Usage

### 1. Access the Simulation Tab

1. Open XGCS in your browser
2. Navigate to the "Simulation" tab in the top navigation
3. You'll see an empty simulation list initially

### 2. Create a New Simulation

1. Click "Add Simulation" button
2. Fill in the configuration:
   - **Name**: Optional friendly name for the simulation
   - **Vehicle Type**: Choose from ArduCopter, ArduPlane, ArduRover, or ArduSub
   - **Frame Type**: For ArduCopter, choose the frame type (Quad, Hexa, etc.)
   - **IP Address**: Connection IP (default: localhost)
   - **Port**: MAVLink port (auto-assigned, starting from 5760)
   - **Speed Factor**: Simulation speed multiplier (1.0 = real-time)
   - **Home Location**: Starting position (latitude, longitude, altitude)
   - **Enable Logging**: Enable container logging
   - **Enable Video**: Enable video feed (if supported)
   - **Custom Parameters**: Additional SITL parameters

3. Click "Create Simulation"

### 3. Start a Simulation

1. In the simulation list, click the "Start" button
2. The system will:
   - Pull the Docker image if needed
   - Create a container with the specified configuration
   - Start the SITL process
   - Map the MAVLink port to your host system

### 4. Connect to the Simulation

Once running, you can connect to the simulation using:
- **MAVLink Port**: The assigned port (e.g., 5760, 5761, etc.)
- **IP Address**: The configured IP (usually localhost)

### 5. Monitor and Control

- **Status**: See real-time status (created, starting, running, stopping, stopped, error)
- **Statistics**: View CPU usage, memory usage, and uptime
- **Stop**: Click "Stop" to gracefully shut down the simulation
- **Delete**: Remove the simulation configuration

## Configuration Examples

### Basic ArduCopter Quad
```json
{
  "name": "My Quad",
  "vehicleType": "arducopter",
  "frameType": "quad",
  "ipAddress": "localhost",
  "port": 5760,
  "speedFactor": 1.0,
  "homeLocation": {
    "lat": 37.7749,
    "lng": -122.4194,
    "alt": 0
  }
}
```

### Fast ArduPlane Simulation
```json
{
  "name": "Fast Plane",
  "vehicleType": "arduplane",
  "ipAddress": "localhost",
  "port": 5761,
  "speedFactor": 5.0,
  "homeLocation": {
    "lat": 37.7749,
    "lng": -122.4194,
    "alt": 100
  },
  "customParams": "SIM_ENABLE=1\nSIM_GPS_DISABLE=0"
}
```

## API Endpoints

The simulation server provides the following REST API endpoints:

- `GET /api/simulation/list` - List all simulations
- `POST /api/simulation/create` - Create a new simulation
- `POST /api/simulation/:id/start` - Start a simulation
- `POST /api/simulation/:id/stop` - Stop a simulation
- `DELETE /api/simulation/:id` - Delete a simulation
- `GET /api/simulation/:id/status` - Get simulation status
- `GET /api/simulation/:id/logs` - Get simulation logs

## Troubleshooting

### Docker Permission Issues
If you get permission errors with Docker:
```bash
sudo usermod -aG docker $USER
# Log out and back in
```

### Port Already in Use
If a port is already in use, the system will automatically assign the next available port.

### Container Won't Start
Check the simulation logs for error messages. Common issues:
- Docker not running
- Insufficient system resources
- Network connectivity issues

### Image Pull Failures
If the Docker image fails to pull:
```bash
# Pull manually
docker pull ardupilot/ardupilot-sitl:latest
```

## Integration with XGCS

The simulation system integrates with the main XGCS application:

1. **Vehicle Connections**: Simulations appear as available vehicles
2. **Flight Display**: Connect to simulations for flight control
3. **Mission Planning**: Plan missions for simulated vehicles
4. **Real-time Monitoring**: View telemetry and status

## Advanced Configuration

### Custom Docker Images
You can modify the `getDockerImage()` function in `src/routes/simulation.js` to use custom Docker images.

### Resource Limits
Container resource limits can be adjusted in the container configuration:
- Memory: 512MB per container
- CPU: 50% CPU limit
- Network: Standard Docker networking

### Persistent Storage
For persistent logs and data, you can add volume mounts to the container configuration.

## Security Considerations

- Containers run with limited privileges
- Network access is restricted to MAVLink ports
- Resource limits prevent system overload
- Containers are automatically cleaned up when stopped

## Performance Tips

- Use speed factors > 1.0 for faster simulation
- Limit the number of simultaneous simulations based on your system resources
- Monitor system resources when running multiple simulations
- Use SSD storage for better I/O performance

## Support

For issues and questions:
1. Check the simulation logs in the web interface
2. Check Docker logs: `docker logs <container-id>`
3. Verify Docker is running: `docker ps`
4. Check system resources: `docker stats` 