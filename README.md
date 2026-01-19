# XGCS - Modern Ground Control Station

**A next-generation, web-based ground control station for ArduPilot and PX4 vehicles.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()

> 🚀 **Built for the future**: Web-native architecture, real-time collaboration ready, AI-powered mission planning.

## ✨ Features

- **Web-Based**: Access from any device with a browser—no installation required
- **Multi-Vehicle Support**: Manage multiple drones simultaneously
- **Advanced Mission Planning**: Grid surveys, corridor scans, structure orbits
- **Real-Time Telemetry**: Live flight data with 3D Cesium maps
- **Video Streaming**: GStreamer pipeline with WebRTC support
- **Link Budget Analysis**: Calculate radio range and visualize coverage
- **Radio Simulation**: Test missions with realistic signal degradation
- **Geofencing & Safety**: Polygon/circular geofences, rally points, failsafes

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

### SITL (Simulated)
```bash
cd ardupilot/ArduCopter
sim_vehicle.py -v ArduCopter --console --map
```
Then connect XGCS to `localhost:14550`

### Real Vehicle
1. Connect vehicle via USB or telemetry radio
2. Note the connection port (e.g., `/dev/ttyUSB0` or `COM3`)
3. Use XGCS connection dialog to connect

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

- [ArduPilot](https://ardupilot.org/) - Open-source autopilot
- [MAVSDK](https://mavsdk.mavlink.io/) - MAVLink communication library
- [Cesium](https://cesium.com/) - 3D geospatial visualization
- [QGroundControl](http://qgroundcontrol.com/) - Inspiration and reference

## 🔗 Links

- [Documentation](docs/)
- [Issue Tracker](https://github.com/your-repo/issues)
- [ArduPilot Docs](https://ardupilot.org/copter/)
- [MAVLink Protocol](https://mavlink.io/)

---

**Made with ❤️ for the drone community**
