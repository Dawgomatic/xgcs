# XGCS User Guide

## Table of Contents
1. [Getting Started](#getting-started)
2. [Managing Simulations](#managing-simulations)
3. [Vehicle Connections](#vehicle-connections)
4. [Mission Planning](#mission-planning)
5. [Flight Display](#flight-display)
6. [Troubleshooting](#troubleshooting)

## Getting Started

### First Launch
1. Start XGCS using Docker:
   ```bash
   docker compose up -d
   ```
2. Open your browser and navigate to http://localhost:3000
3. You'll see the main flight display page

### Navigation
- **Top Bar**: Access different sections of the application
- **Flight Display**: Main view with 3D visualization
- **Vehicle Connections**: Manage vehicle connections
- **Mission Planning**: Create and edit missions
- **Simulation**: Manage SITL simulations

## Managing Simulations

### Creating a Simulation
1. Navigate to the **Simulation** page
2. Click **"Add Simulation"**
3. Configure your simulation:
   - **Name**: Give your simulation a friendly name
   - **Vehicle Type**: Choose ArduCopter, ArduPlane, ArduRover, or ArduSub
   - **Frame Type**: Select the vehicle frame (for copters)
   - **Home Location**: Set the starting GPS coordinates
   - **Speed Factor**: Simulation speed multiplier
4. Click **"Create Simulation"**

### Starting/Stopping Simulations
- **Green Play Button**: Start the simulation
- **Red Stop Button**: Stop the simulation
- **Status Indicator**: Shows current state (Created, Starting, Running, Stopped)

### Managing Multiple Simulations
- Create multiple simulations - each gets a unique port automatically
- Simulations persist across page navigation and backend restarts
- Running simulations continue even if you close the browser

### Viewing Simulation Details
Each simulation card shows:
- Vehicle type and frame
- Connection details (IP:Port)
- Current status
- Performance metrics (CPU/Memory usage when running)

## Vehicle Connections

### Connecting to a Simulation
1. Start a simulation from the Simulation page
2. Note the port number (e.g., 5760)
3. Use any MAVLink-compatible GCS to connect to `localhost:PORT`

### Connection Types
- **SITL Simulations**: Automatically managed through Docker
- **Hardware**: Connect real vehicles via serial/network (coming soon)

## Mission Planning

### Creating a Mission
1. Navigate to Mission Planning
2. Click on the map to add waypoints
3. Configure waypoint properties:
   - Altitude
   - Speed
   - Actions (takeoff, land, loiter, etc.)
4. Save or upload the mission to a vehicle

### Mission Tools
- **Draw**: Click to add waypoints
- **Edit**: Modify existing waypoints
- **Clear**: Remove all waypoints
- **Upload**: Send mission to connected vehicle
- **Download**: Get mission from vehicle

## Flight Display

### Main View
- **3D Globe**: Cesium-based world visualization
- **Vehicle Icons**: Show connected vehicles
- **Telemetry Panel**: Real-time vehicle data
- **Video Feed**: Camera stream (if available)

### Controls
- **Mouse**:
  - Left click + drag: Rotate view
  - Right click + drag: Zoom
  - Middle click + drag: Pan
- **Keyboard**:
  - Arrow keys: Move camera
  - +/-: Zoom in/out

### Telemetry Data
- Position (Lat/Lng/Alt)
- Attitude (Roll/Pitch/Yaw)
- Speed (Ground/Air)
- Battery status
- GPS quality
- Flight mode

## Troubleshooting

### Common Issues

#### "Could not proxy request" Error
- **Cause**: Backend not reachable
- **Solution**: 
  ```bash
  docker compose restart
  ```

#### Port Already in Use
- **Cause**: Previous simulation still using the port
- **Solution**: System automatically assigns next available port

#### Simulation Won't Start
- **Cause**: Docker issues or resource limits
- **Solutions**:
  1. Check Docker is running: `docker ps`
  2. Check logs: `docker compose logs backend`
  3. Ensure sufficient system resources

#### Lost Simulations After Restart
- **Cause**: This shouldn't happen with current version
- **Solution**: Check `server/simulations.json` exists

### Viewing Logs

#### Application Logs
```bash
# All services
docker compose logs

# Specific service
docker compose logs backend
docker compose logs frontend

# Follow logs
docker compose logs -f
```

#### Simulation Logs
```bash
# List running simulations
docker ps | grep sitl

# View specific simulation logs
docker logs sitl-XXXXXXXX
```

### Performance Tips
1. **Limit Active Simulations**: Each simulation uses CPU/memory
2. **Adjust Speed Factor**: Lower values use less CPU
3. **Close Unused Tabs**: Reduces browser memory usage
4. **Use Docker Resource Limits**: Configure in docker-compose.yml

## Advanced Features

### Custom ArduPilot Parameters
When creating a simulation, use the "Custom Parameters" field:
```
PARAM_NAME=value
ANOTHER_PARAM=value
```

### Batch Operations
Create multiple simulations quickly:
1. Create first simulation
2. Use browser DevTools to repeat API calls
3. Or use the API directly:
   ```bash
   curl -X POST http://localhost:5000/api/simulation/create \
     -H "Content-Type: application/json" \
     -d '{"vehicleType": "arducopter", ...}'
   ```

### Integration with External Tools
- **Mission Planner**: Connect to localhost:PORT
- **QGroundControl**: Use TCP connection to localhost:PORT
- **MAVProxy**: `mavproxy.py --master=tcp:localhost:PORT`

## Best Practices

1. **Name Your Simulations**: Use descriptive names for easy identification
2. **Clean Up**: Delete unused simulations to free resources
3. **Monitor Resources**: Check Docker stats: `docker stats`
4. **Regular Backups**: The `simulations.json` file contains all simulation data

## Getting Help

1. Check the debug logs in the Simulation page
2. View backend logs: `docker compose logs backend`
3. Check Docker container status: `docker ps`
4. Refer to [Architecture Guide](./ARCHITECTURE.md) for technical details 