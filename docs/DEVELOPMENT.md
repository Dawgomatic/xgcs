# XGCS Development Guide

## Prerequisites

- **Node.js** 16+ and npm
- **C++ Compiler** (g++ 11+)
- **CMake** 3.16+
- **MAVSDK** (included as submodule)
- **Docker** (optional, for SITL)

## Quick Start

### 1. Clone Repository
```bash
git clone <repository-url>
cd xgcs
git submodule update --init --recursive
```

### 2. Build C++ Backend
```bash
cd server
mkdir build && cd build
cmake ..
make -j4
```

### 3. Install Frontend Dependencies
```bash
cd client
npm install
```

### 4. Run Development Servers

**Terminal 1 - Backend:**
```bash
cd server/build
./server
```

**Terminal 2 - Frontend:**
```bash
cd client
npm start
```

**Access**: http://localhost:3000

## Using Scripts

All build and deployment scripts are in the `scripts/` directory:

```bash
# Build C++ backend
./scripts/build_cpp_backend.sh

# Build SITL Docker container
./scripts/build_sitl_docker.sh

# Start all services
./scripts/start.sh

# Stop all services
./scripts/stop.sh

# Test arm/disarm functionality
./scripts/test_arm_disarm.sh
```

## Docker Deployment

### Simple Deployment
```bash
docker-compose -f docker-compose-simple.yml up
```

### Full Deployment (with SITL)
```bash
docker-compose up
```

## Project Structure

```
xgcs/
├── client/          # React frontend
├── server/          # C++ backend
├── docs/            # Documentation
├── scripts/         # Build/deployment scripts
└── ardupilot/       # SITL submodule
```

## Development Workflow

1. **Make Changes** to client or server code
2. **Backend**: Rebuild with `cmake` and `make`
3. **Frontend**: Hot reload automatically
4. **Test** with SITL or real vehicle
5. **Commit** changes

## Testing

### With SITL (Simulated Vehicle)
```bash
# Start SITL
cd ardupilot/ArduCopter
sim_vehicle.py -v ArduCopter --console --map

# Connect XGCS to localhost:14550
```

### With Real Vehicle
1. Connect vehicle to computer (USB/telemetry)
2. Note connection port (e.g., `/dev/ttyUSB0`)
3. Start backend with appropriate connection string
4. Connect via XGCS UI

## Common Issues

### Backend Won't Compile
- Ensure MAVSDK submodule is initialized
- Check C++ compiler version (needs C++17)
- Verify CMake version

### Frontend Won't Start
- Delete `node_modules` and reinstall
- Clear npm cache: `npm cache clean --force`
- Check Node.js version

### Can't Connect to Vehicle
- Verify connection string format
- Check firewall settings
- Ensure vehicle is powered and transmitting

## Documentation

- **Architecture**: `docs/ARCHITECTURE.md`
- **User Guide**: `docs/USER_GUIDE.md`
- **API Reference**: See backend code comments

## Contributing

1. Create feature branch
2. Make changes
3. Test thoroughly
4. Submit pull request

## License

[Your License Here]
