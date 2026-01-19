# XGCS - Modern Ground Control Station

**A next-generation, web-based ground control station for ArduPilot and PX4 vehicles.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()

> 🚀 **Built for the future**: Web-native architecture, real-time collaboration ready, AI-powered mission planning.

## ✨ Features

### 🎮 Flight Operations
- **Multi-Vehicle Support**: Manage unlimited drones simultaneously with independent control
- **Real-Time Telemetry**: Live flight data streaming (position, attitude, velocity, battery, GPS)
- **Flight Modes**: All ArduPilot/PX4 modes (Stabilize, Loiter, Auto, RTL, Land, etc.)
- **Arm/Disarm Control**: Safe motor arming with pre-flight checks
- **Emergency Controls**: Instant RTL, emergency land, kill switch
- **Takeoff/Land**: Automated takeoff and precision landing
- **Guided Mode**: Click-to-fly waypoint navigation

### 🗺️ Mission Planning
- **Visual Waypoint Editor**: Click-to-add waypoints on 3D Cesium map
- **Mission Upload/Download**: Sync missions with vehicle
- **Grid Survey Pattern**: Camera-aware area coverage with adjustable overlap
- **Corridor Scan**: Linear infrastructure inspection (roads, pipelines, power lines)
- **Structure Scan**: 360° orbital inspection of buildings/towers
- **Terrain Following**: Maintain AGL altitude over varying terrain
- **Camera Triggers**: Distance-based and servo-controlled triggering
- **Mission Validation**: Pre-flight checks for altitude, battery, airspace

### 🛡️ Safety Features
- **Geofencing**: Polygon and circular fences with breach actions
- **Rally Points**: Safe return locations for failsafe events
- **Failsafe Configuration**: Battery, GPS, radio link failsafes
- **Pre-Flight Checklist**: Automated safety verification
- **Risk Assessment**: Mission risk scoring

### 📡 Radio & Communication
- **MAVLink Protocol**: Full ArduPilot and PX4 support
- **Multiple Connections**: Serial, UDP, TCP
- **Radio Status Monitoring**: Real-time RSSI, SNR, packet loss
- **Link Budget Analysis**: Calculate theoretical max range with FSPL model
- **Radio Simulation**: Test missions with realistic signal degradation
- **Message Inspector**: View raw MAVLink messages

### 🎥 Video & Data
- **Real-Time Video**: GStreamer → WebRTC pipeline
- **Video Recording**: Record streams to cloud
- **Flight Logs**: TLog recording and DataFlash log download
- **Fleet Analytics**: Multi-vehicle performance tracking
- **Automated Reporting**: PDF generation with maps and telemetry

### 🔧 Vehicle Configuration
- **Parameter Management**: Read/write all vehicle parameters
- **Sensor Calibration**: Compass, accelerometer, radio, ESC
- **Motor Testing**: Individual motor spin tests
- **Firmware Updates**: Upload ArduPilot/PX4 firmware (planned)

### 🖥️ User Interface
- **3D Cesium Maps**: True 3D geospatial visualization with terrain
- **Flight Instruments**: Artificial horizon, compass, altimeter, VSI, airspeed
- **Dark Mode**: Eye-friendly interface for night operations
- **Responsive Design**: Works on desktop, tablet, and mobile

### 🐳 Simulation & Testing
- **Built-in SITL Management**: Create simulations from UI (no terminal needed!)
- **Multi-Vehicle SITL**: Run 100+ simulations simultaneously
- **Swarm Simulation**: Create fleets instantly with grid positioning
- **Docker Isolation**: Each vehicle in its own container
- **Automatic Port Management**: Scalable port allocation (2220+)
- **Persistent Simulations**: Survive server restarts
- **Speed Control**: Fast-forward simulations
- **All Vehicle Types**: ArduCopter, ArduPlane, ArduRover, ArduSub

### 🚀 Performance & Scalability
- **Web-Based**: No installation, access from any browser
- **Cloud-Ready**: Deploy on servers, access anywhere
- **100+ Vehicles**: Designed for fleet operations
- **Low Latency**: <100ms telemetry updates
- **REST API**: Full programmatic control

## 🚀 Quick Start

### Option 1: Docker (Recommended)
```bash
docker-compose up
```
Access at: http://localhost:3000

### Option 2: Native Development
```bash
# Start all services
./scripts/start.sh
```

See [Development Guide](docs/DEVELOPMENT.md) for detailed setup instructions.

## 🏗️ Architecture

XGCS uses a modern client-server architecture:

- **Frontend**: React 18 + Material-UI + Cesium 3D maps
- **Backend**: C++ server with MAVSDK for MAVLink communication
- **Real-time**: WebSocket streaming for telemetry
- **Video**: GStreamer → WebRTC pipeline

```
┌─────────────┐      HTTP/WS      ┌──────────────┐     MAVLink    ┌─────────┐
│   Browser   │ ◄───────────────► │ C++ Backend  │ ◄────────────► │ Vehicle │
│  (React UI) │                   │   (MAVSDK)   │                │  (APM)  │
└─────────────┘                   └──────────────┘                └─────────┘
```

**[📖 Full Architecture Documentation](docs/ARCHITECTURE.md)** - Detailed diagrams, data flows, and component descriptions.

## 📖 Documentation

- **[User Guide](docs/USER_GUIDE.md)** - How to use XGCS
- **[Architecture](docs/ARCHITECTURE.md)** - System design and structure
- **[Development Guide](docs/DEVELOPMENT.md)** - Setup and contribution guide

## 🎯 Connecting to a Vehicle

### Built-in SITL Simulations (Recommended)

**No terminal commands needed!** Create and manage simulations entirely from the UI:

1. **Start XGCS**: `./scripts/start.sh`
2. **Open Browser**: http://localhost:3000
3. **Go to Simulation Tab**: Click "Simulation" in sidebar
4. **Create New Simulation**:
   - Vehicle Type: ArduCopter, ArduPlane, ArduRover, or ArduSub
   - Frame Type: X, +, Hexa, Octa, Y6, etc.
   - Home Location: Click map or enter coordinates
   - Speed Factor: 1.0 (real-time) or higher for fast-forward
5. **Start Simulation**: Click "Start" button
6. **Connect**: Go to "Connections" tab, click "Connect"

**That's it!** The system automatically:
- Spins up Docker container with ArduPilot SITL
- Allocates unique ports (2220, 2221, 2222 for first vehicle)
- Configures MAVLink connections
- Monitors container health

**Multiple Vehicles**: Repeat steps 4-6 with different vehicle IDs. Each gets its own isolated container and port range.

**Swarm Mode**: Create 10, 50, or 100+ vehicles instantly with grid positioning!

### Manual SITL (Alternative)

If you prefer traditional terminal-based SITL:

```bash
cd ardupilot/ArduCopter
sim_vehicle.py -v ArduCopter --console --map
```

Then connect XGCS to `udp://:14550`

### Real Hardware

1. Connect vehicle via USB or telemetry radio
2. Note connection port (e.g., `/dev/ttyUSB0` or `COM3`)
3. In XGCS Connections tab, add connection:
   - **Serial**: `serial:///dev/ttyUSB0:57600`
   - **UDP**: `udp://:14550`
   - **TCP**: `tcp://192.168.1.100:5760`

## 🛠️ Tech Stack

- **Frontend**: React 18, Material-UI, Cesium 3D
- **Backend**: C++ with MAVSDK, Crow HTTP server
- **Communication**: MAVLink protocol, WebSocket streaming
- **Video**: GStreamer → WebRTC pipeline

## 📋 Requirements

- **Docker** (for containerized deployment)
- **Node.js 16+** (for native development)
- **C++17 compiler** (g++ 11+)
- **CMake 3.16+**

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [Development Guide](docs/DEVELOPMENT.md) for more details.

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- [ArduPilot](https://ardupilot.org/) - Open-source autopilot platform
- [MAVSDK](https://mavsdk.mavlink.io/) - MAVLink communication library
- [Cesium](https://cesium.com/) - 3D geospatial visualization platform
- [Material-UI](https://mui.com/) - React component library
- [Docker](https://www.docker.com/) - Container platform for SITL simulations

## 🔗 Links

- [Documentation](docs/)
- [Issue Tracker](https://github.com/your-repo/issues)
- [ArduPilot Docs](https://ardupilot.org/copter/)
- [MAVLink Protocol](https://mavlink.io/)

---

**Made with ❤️ for the drone community**
