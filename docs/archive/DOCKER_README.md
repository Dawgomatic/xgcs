# XGCS Docker Setup

This Docker setup provides a complete containerized environment for running XGCS (X Ground Control Station) with ArduPilot SITL simulation.

## 🚀 Quick Start

### **One-Command Setup and Run**
```bash
cd xgcs
chmod +x docker-run.sh
./docker-run.sh setup    # First time setup
./docker-run.sh start full  # Start everything with SITL
```

### **What This Does:**
1. ✅ Installs Docker if needed
2. ✅ Pulls all required images
3. ✅ Builds custom containers
4. ✅ Starts frontend, backend, and SITL simulation
5. ✅ Opens browser automatically

## 📋 Prerequisites

- **Linux/Ubuntu** (recommended)
- **4GB RAM** minimum (8GB recommended)
- **10GB free disk space**
- **Internet connection** for downloading images

## 🛠️ Available Commands

### **Setup Commands**
```bash
./docker-run.sh setup     # Full setup (check, pull, build)
./docker-run.sh start basic   # Start frontend + backend only
./docker-run.sh start full    # Start everything + SITL simulation
```

### **Management Commands**
```bash
./docker-run.sh status    # Show all service status
./docker-run.sh logs      # Show all logs
./docker-run.sh logs frontend  # Show frontend logs only
./docker-run.sh restart   # Restart all services
./docker-run.sh stop      # Stop all services
./docker-run.sh cleanup   # Clean up Docker resources
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │   MAVSDK        │
│   (React)       │◄──►│   (Node.js)     │◄──►│   Server        │
│   Port: 3000    │    │   Port: 5000    │    │   Port: 5001    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   SITL          │
                       │   Simulation    │
                       │   Ports: 5760+  │
                       └─────────────────┘
```

## 🐳 Services Overview

### **Frontend (React)**
- **Port:** 3000
- **URL:** http://localhost:3000
- **Purpose:** Web-based ground control interface
- **Features:** Flight display, mission planning, simulation control

### **Backend (Node.js)**
- **Port:** 5000
- **URL:** http://localhost:5000
- **Purpose:** API server for frontend
- **Features:** Simulation management, vehicle communication

### **MAVSDK Server (C++)**
- **Port:** 5001
- **Purpose:** MAVLink communication with vehicles
- **Features:** Telemetry, mission control, vehicle actions

### **SITL Simulation**
- **ArduCopter:** Ports 5760-5763, 5501-5504
- **ArduPlane:** Ports 5770-5771, 5505-5506
- **ArduRover:** Ports 5780-5781, 5507-5508
- **Purpose:** Software-in-the-loop simulation
- **Features:** Multiple vehicle types, configurable parameters

## 🔧 Configuration

### **Environment Variables**
```bash
# Frontend
REACT_APP_API_URL=http://localhost:5000
CHOKIDAR_USEPOLLING=true

# Backend
NODE_ENV=development
PORT=5000

# SITL
SITL_INSTANCE=0
VEHICLE_TYPE=ArduCopter
FRAME_TYPE=quad
SPEEDUP=1.0
HOME_LOCATION=37.7749,-122.4194,0,0
```

### **Custom SITL Parameters**
You can modify SITL parameters in `docker-compose.yml`:

```yaml
sitl-arducopter:
  environment:
    - FRAME_TYPE=quad        # quad, hexa, octa, etc.
    - SPEEDUP=1.0           # Simulation speed
    - HOME_LOCATION=37.7749,-122.4194,0,0  # Lat,Lon,Alt,Heading
  command: >
    --model quad
    --home 37.7749,-122.4194,0,0
    --speedup 1.0
    --instance 0
    --param SIM_GPS_TYPE=1
    --param SIM_GPS_DISABLE=0
```

## 🐛 Troubleshooting

### **Common Issues**

#### **1. Port Already in Use**
```bash
# Check what's using the port
sudo netstat -tulpn | grep 3000

# Kill the process
sudo kill -9 <PID>

# Or restart the system
sudo reboot
```

#### **2. Docker Permission Issues**
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Log out and back in, or run:
newgrp docker
```

#### **3. Out of Memory**
```bash
# Check available memory
free -h

# Increase Docker memory limit
# Edit /etc/docker/daemon.json
{
  "default-shm-size": "2G"
}
```

#### **4. SITL Not Starting**
```bash
# Check SITL logs
./docker-run.sh logs sitl-arducopter

# Check if ArduPilot image is available
docker images | grep ardupilot

# Pull the image manually
docker pull ardupilot/ardupilot-sitl:latest
```

### **Debug Commands**
```bash
# Check all container status
docker-compose ps

# Check specific service logs
docker-compose logs -f frontend
docker-compose logs -f backend
docker-compose logs -f sitl-arducopter

# Check network connectivity
docker network ls
docker network inspect xgcs_xgcs-network

# Check resource usage
docker stats
```

## 🔄 Development Workflow

### **1. Start Development Environment**
```bash
./docker-run.sh start basic  # Frontend + backend only
```

### **2. Make Code Changes**
- Edit files in `client/` for frontend changes
- Edit files in `server/` for backend changes
- Changes are automatically reflected (hot reload)

### **3. Test with SITL**
```bash
./docker-run.sh start full  # Start with SITL simulation
```

### **4. View Logs**
```bash
./docker-run.sh logs        # All logs
./docker-run.sh logs frontend  # Frontend only
```

### **5. Stop Everything**
```bash
./docker-run.sh stop
```

## 📊 Monitoring

### **Service Health Check**
```bash
./docker-run.sh status
```

### **Resource Monitoring**
```bash
# CPU and memory usage
docker stats

# Disk usage
docker system df
```

### **Network Connectivity**
```bash
# Test frontend
curl http://localhost:3000

# Test backend
curl http://localhost:5000/api/health

# Test SITL
netstat -tulpn | grep 5760
```

## 🧹 Maintenance

### **Regular Cleanup**
```bash
# Clean up unused resources
./docker-run.sh cleanup

# Update images
docker-compose pull

# Rebuild containers
docker-compose build --no-cache
```

### **Backup and Restore**
```bash
# Backup configuration
docker-compose config > backup.yml

# Restore from backup
docker-compose -f backup.yml up -d
```

## 🚀 Production Deployment

For production deployment, modify the configuration:

1. **Change ports** in `docker-compose.yml`
2. **Set environment variables** for production
3. **Configure reverse proxy** (nginx, traefik)
4. **Set up SSL certificates**
5. **Configure monitoring** and logging

## 📚 Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [ArduPilot SITL Documentation](https://ardupilot.org/dev/docs/sitl-simulator-software-in-the-loop.html)
- [MAVSDK Documentation](https://mavsdk.mavlink.io/)

## 🤝 Support

If you encounter issues:

1. **Check the logs:** `./docker-run.sh logs`
2. **Verify prerequisites:** Docker, ports, memory
3. **Try cleanup:** `./docker-run.sh cleanup`
4. **Check troubleshooting section** above
5. **Share error messages** and logs for help

---

**Happy Flying! 🛩️** 