# 🐳 Docker Auto-Spinup Simulation System

## 🚀 Overview

The XGCS simulation system now automatically creates and manages Docker containers when you start simulations. This gives you **real SITL (Software-in-the-Loop) simulation** with actual ArduPilot or PX4 firmware running in isolated containers.

## ✨ Features

### **🔄 Automatic Container Management**
- **Auto-create**: Containers are created when you start a simulation
- **Auto-start**: SITL instances start automatically with proper configuration
- **Auto-cleanup**: Containers are removed when you stop/delete simulations
- **Port management**: Automatic port assignment (5760, 5761, 5762, etc.)

### **🚁 Multiple Vehicle Types**
- **ArduCopter**: Quadcopters, hexacopters, octocopters
- **ArduPlane**: Fixed-wing aircraft
- **ArduRover**: Ground vehicles
- **ArduSub**: Underwater vehicles
- **PX4**: Fallback to PX4 SITL if ArduPilot not available

### **🛡️ Fallback System**
- **Graceful degradation**: Falls back to mock simulation if Docker fails
- **No data loss**: Your simulation data is preserved
- **Seamless experience**: You won't notice if Docker isn't available

## 🎮 How to Use

### **1. Update to the New System**
```bash
cd xgcs
chmod +x update-docker-simulation.sh
./update-docker-simulation.sh
```

### **2. Create and Start a Simulation**
1. Open http://localhost:3000
2. Go to the **Simulation** tab
3. Click **"Add Simulation"**
4. Fill in the details:
   - **Vehicle Type**: ArduCopter, ArduPlane, ArduRover, ArduSub
   - **Frame Type**: quad, hexa, octa, plane, rover, sub
   - **IP Address**: localhost (default)
   - **Port**: Auto-assigned (5760, 5761, etc.)
   - **Speed Factor**: 1.0 (real-time) or higher for faster simulation
5. Click **"Start Simulation"**

### **3. What Happens Automatically**
- ✅ Docker container is created with the specified vehicle type
- ✅ SITL simulation starts with proper configuration
- ✅ MAVLink communication is established on the assigned port
- ✅ Real-time telemetry data flows to the GCS
- ✅ Container logs are available for debugging

## 🐳 Docker Container Details

### **Container Naming**
```
sitl-{simulation-id}  # e.g., sitl-a1b2c3d4
```

### **Port Mapping**
- **MAVLink**: `{port}:5760` (e.g., 5760:5760)
- **MAVLink2**: `{port+1}:5761` (e.g., 5761:5761)
- **MAVLink3**: `{port+2}:5762` (e.g., 5762:5762)
- **MAVLink4**: `{port+3}:5763` (e.g., 5763:5763)

### **Environment Variables**
```bash
SITL_INSTANCE=0
VEHICLE_TYPE=ArduCopter
FRAME_TYPE=quad
SPEEDUP=1.0
HOME_LOCATION=37.7749,-122.4194,0,0
```

### **Docker Images Used**
- **ArduPilot**: `ardupilot/ardupilot-sitl:latest`
- **PX4**: `px4io/px4-dev-simulation-focal:latest`

## 🔧 Configuration Options

### **Vehicle Types and Commands**

#### **ArduCopter**
```bash
--model quad --home 37.7749,-122.4194,0,0 --speedup 1.0 --instance 0
```

#### **ArduPlane**
```bash
--model plane --home 37.7749,-122.4194,0,0 --speedup 1.0 --instance 0
```

#### **ArduRover**
```bash
--model rover --home 37.7749,-122.4194,0,0 --speedup 1.0 --instance 0
```

#### **ArduSub**
```bash
--model sub --home 37.7749,-122.4194,0,0 --speedup 1.0 --instance 0
```

### **Custom Parameters**
You can add custom SITL parameters in the simulation configuration:
```json
{
  "vehicleType": "ArduCopter",
  "frameType": "quad",
  "customParams": "SIM_GPS_TYPE=1\nSIM_GPS_DISABLE=0\nSIM_BARO_DISABLE=0"
}
```

## 📊 Monitoring and Debugging

### **Container Status**
```bash
# Check all containers
docker ps

# Check specific simulation container
docker ps | grep sitl-{simulation-id}
```

### **Container Logs**
```bash
# Get logs for a specific simulation
curl http://localhost:5000/api/simulation/{simulation-id}/logs

# Or directly from Docker
docker logs sitl-{simulation-id}
```

### **Container Status**
```bash
# Get simulation status including container info
curl http://localhost:5000/api/simulation/{simulation-id}/status
```

## 🛠️ Troubleshooting

### **Container Won't Start**
1. **Check Docker logs**:
   ```bash
   docker logs sitl-{simulation-id}
   ```

2. **Check if image exists**:
   ```bash
   docker images | grep ardupilot
   ```

3. **Pull the image manually**:
   ```bash
   docker pull ardupilot/ardupilot-sitl:latest
   ```

### **Port Conflicts**
1. **Check what's using the port**:
   ```bash
   sudo netstat -tulpn | grep 5760
   ```

2. **Kill conflicting processes**:
   ```bash
   sudo kill -9 {PID}
   ```

### **Fallback to Mock Simulation**
If Docker containers fail to start, the system automatically falls back to mock simulation. You'll see:
- Container ID: `mock-simulation`
- Realistic mock data (position, battery, GPS, etc.)
- No Docker dependencies required

## 🔄 API Endpoints

### **Create Simulation**
```bash
POST /api/simulation/create
{
  "vehicleType": "ArduCopter",
  "frameType": "quad",
  "ipAddress": "localhost",
  "port": 5760,
  "speedFactor": 1.0
}
```

### **Start Simulation (Creates Container)**
```bash
POST /api/simulation/{id}/start
```

### **Get Simulation Status**
```bash
GET /api/simulation/{id}/status
```

### **Get Container Logs**
```bash
GET /api/simulation/{id}/logs
```

### **Stop Simulation (Removes Container)**
```bash
POST /api/simulation/{id}/stop
```

## 🎯 Benefits

### **🚀 Realistic Simulation**
- **Actual firmware**: Real ArduPilot/PX4 code running
- **Real physics**: Proper flight dynamics and sensor simulation
- **MAVLink communication**: Standard protocol for vehicle communication
- **Hardware compatibility**: Same code that runs on real vehicles

### **🔒 Isolation and Security**
- **Container isolation**: Each simulation runs in its own environment
- **Resource limits**: Docker manages CPU and memory usage
- **Clean environment**: No conflicts between different simulations
- **Easy cleanup**: Containers are automatically removed

### **📈 Scalability**
- **Multiple instances**: Run multiple simulations simultaneously
- **Port management**: Automatic port assignment prevents conflicts
- **Resource efficiency**: Containers share the base image
- **Easy deployment**: Works on any system with Docker

## 🎉 Getting Started

1. **Update the system**:
   ```bash
   cd xgcs
   ./update-docker-simulation.sh
   ```

2. **Test the system**:
   ```bash
   ./test-simulation.sh
   ```

3. **Start flying**:
   - Open http://localhost:3000
   - Go to Simulation tab
   - Create and start your first Docker-powered simulation!

---

**Happy Flying with Real SITL Simulation! 🛩️** 