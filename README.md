# XGCS - Modern Ground Control Station

A modern, React-based ground control station that recreates QGroundControl functionality with a contemporary web interface.

## Overview

XGCS (eXtended Ground Control Station) is a complete rewrite of QGroundControl using modern web technologies:

- **Frontend**: React with Material-UI
- **Backend**: C++ with MAVSDK and Crow framework
- **Map Engine**: Cesium for 3D visualization
- **Communication**: MAVLink via MAVSDK

## Architecture

### Frontend (React)
- **FlightDisplay**: Main flight interface with 3D map, instrument panel, and vehicle controls
- **MissionPlanning**: Waypoint management and mission planning
- **VehicleConnections**: Vehicle connection management
- **Settings**: Application configuration

### Backend (C++)
- **MAVSDK Integration**: Vehicle communication and control
- **REST API**: Frontend-backend communication
- **Video Streaming**: Real-time video feed handling

## Key Features

### Flight Display
- 3D map with Cesium integration
- Real-time vehicle tracking
- Artificial horizon and compass
- Flight mode selection
- Video streaming panel
- Telemetry display

### Mission Planning
- Waypoint creation and editing
- Mission upload/download
- Distance and time calculations
- Mission validation

### Vehicle Management
- Multiple vehicle support
- Connection status monitoring
- Parameter management
- Firmware updates

## Migration from QGroundControl

This project maintains functional parity with QGroundControl while modernizing the architecture:

| QGC Component | XGCS Equivalent | Technology |
|---------------|-----------------|------------|
| FlyView.qml | FlightDisplay.jsx | React + Material-UI |
| FlyViewMap.qml | FlightMap.jsx | Cesium 3D |
| FlyViewInstrumentPanel.qml | InstrumentPanel.jsx | React + Recharts |
| FlightModeDropdown.qml | FlightModeSelector.jsx | Material-UI |
| FlyViewVideo.qml | VideoPanel.jsx | HTML5 Video |
| PlanView | MissionPlanning.jsx | React + Material-UI |

## Getting Started

### Prerequisites
- Node.js 16+
- C++17 compiler
- MAVSDK
- CMake 3.10+

### Installation

1. **Frontend Setup**
```bash
cd client
npm install
npm start
```

2. **Backend Setup**
```bash
cd server
mkdir build && cd build
cmake ..
make
./server
```

3. **Access the Application**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8081

## Development

### Project Structure
```
xgcs/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── pages/         # Main application pages
│   │   ├── context/       # React context providers
│   │   └── utils/         # Utility functions
├── server/                # C++ backend
│   ├── src/              # Source files
│   ├── include/          # Header files
│   └── CMakeLists.txt    # Build configuration
└── MAVSDK/               # MAVSDK integration
```

### Key Components

#### FlightDisplay.jsx
Main flight interface that maps from QGC's FlyView.qml:
- 3D map integration
- Flight controls (takeoff, land, RTL)
- Instrument panel
- Video streaming

#### FlightMap.jsx
3D map component using Cesium:
- Vehicle position tracking
- Mission waypoint display
- Map controls (zoom, center, layers)

#### InstrumentPanel.jsx
Real-time vehicle instrumentation:
- Artificial horizon
- Compass
- Telemetry values
- Flight mode display

#### MissionPlanning.jsx
Mission planning interface:
- Waypoint management
- Mission upload/download
- Distance calculations
- Mission validation

## API Endpoints

### Vehicle Management
- `GET /api/vehicles` - List connected vehicles
- `POST /api/vehicles/connect` - Connect to vehicle
- `GET /api/vehicles/{id}/status` - Vehicle status

### Mission Management
- `GET /api/missions` - List missions
- `POST /api/missions` - Upload mission
- `GET /api/missions/{id}` - Download mission

### Flight Control
- `POST /api/vehicles/{id}/takeoff` - Takeoff command
- `POST /api/vehicles/{id}/land` - Land command
- `POST /api/vehicles/{id}/rtl` - Return to launch

## Contributing

1. Follow the migration patterns established in the codebase
2. Maintain functional parity with QGroundControl
3. Use Material-UI for consistent styling
4. Document any hallucinated constructs in `hallucinations_log.md`

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- QGroundControl team for the original implementation
- MAVSDK for vehicle communication
- Cesium for 3D mapping
- Material-UI for the component library

## Prerequisites

- Node.js (v20 or higher)
- Yarn package manager
- CMake (v3.10 or higher)
- C++ compiler with C++17 support
- Crow HTTP library
- nlohmann-json library
- python 3.10.12
## Installation

after cloning the repo, run
```bash
git submodule update --init --recursive
```

### Node.js & npm

# First, update your package list
```bash
sudo apt update
```

# Install required packages
```bash
sudo apt install -y curl
```

# Remove any existing Node.js installation
```bash
sudo apt remove nodejs npm
sudo apt autoremove
```

# Add NodeSource repository for Node.js 20 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
```

# Install Node.js and npm
```bash 
sudo apt install -y nodejs
```
# Verify the installation (should show v20.x.x)
```bash
node --version
npm --version
```

### Yarn

# if yarn is already installed
```bash
sudo apt remove yarn
sudo apt purge yarn
sudo rm -rf /usr/local/bin/yarn
sudo rm -rf /usr/local/bin/yarnpkg
sudo rm -rf ~/.yarn
sudo rm -rf ~/.config/yarn
sudo rm -f /usr/bin/yarn
sudo npm uninstall -g corepack
```
# else

```bash
sudo npm install -g corepack
sudo corepack enable
corepack prepare yarn@1.22.19 --activate
```

### Frontend (Client)

1. Navigate to the client directory:
```bash
cd client
```

2. Install dependencies using Yarn:
```bash
yarn install
```

### Cesium
if public/cesium is not present, with the directories Assets,ThirdParty,Widgets,and Workers, run
```bash
npm run build
```
and copy the contents of build/cesium intoto public/cesium

### Backend Dependencies

1. Install required system packages:
```bash
sudo apt update
sudo apt install -y build-essential cmake libboost-all-dev
```

2. Install Crow:
```bash
# Clone the Crow repository
git clone https://github.com/CrowCpp/Crow.git
cd Crow

# Create and enter build directory
mkdir build
cd build

# Build and install Crow
cmake .. -DCROW_BUILD_EXAMPLES=OFF -DCROW_BUILD_TESTS=OFF
sudo cmake --build . --target install
```
3. Install nlohmann-json:
```bash
sudo apt install -y nlohmann-json3-dev
```

### MAVSDK
```bash

# build from source
git clone https://github.com/mavlink/MAVSDK.git
cd MAVSDK
mkdir build && cd build
cmake ..
make
sudo make install

# Navigate to MAVSDK directory
cd ~/xgcs/server/MAVSDK

# Create and enter build directory
mkdir -p build && cd build

# Configure MAVSDK build
cmake .. -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=ON

# Build MAVSDK
cmake --build . -j$(nproc)

# Navigate to MAVSDK build directory
cd ~/xgcs/server/MAVSDK/build

# Install MAVSDK to the local install directory
cmake --install . --prefix install

# Check if the MAVSDK installation files exist
ls ~/xgcs/server/MAVSDK/build/install/lib/cmake/
```
### Backend (Server)

1. Create a build directory and navigate into it:
```bash
cd server
mkdir build
cd build
```

2. Generate build files with CMake:
```bash
cmake ..
```

3. Build the project:
```bash
cmake --build .
```

## Running the Application

### Frontend
Start the development server:
```bash
cd client
yarn start
```
The application will be available at `http://localhost:3000`

### Backend
Run the server:
```bash
cd server/build
./server
```
The backend API will be available at `http://localhost:3001`

## Development

- Frontend is built with React and uses modern JavaScript features
- Backend is implemented in C++ using the Crow framework
- API communication is handled through HTTP endpoints

## Project Structure

```
.
├── client/                 # React frontend
│   ├── public/            # Static files
│   ├── src/              # Source files
│   └── package.json      # Frontend dependencies
│
└── server/               # C++ backend
    ├── src/             # Source files
    ├── include/         # Header files
    └── CMakeLists.txt   # CMake build configuration
```
### Run ardupilot sim
Pull from ardupilot master(what is masters current version?)
```bash
cd ardupilot/Tools/autotest
python3 sim_vehicle.py -v ArduPlane --console --map
```

### Run xgcs
```bash
cd xgcs/client
yarn start

cd xgcs/server
mkdir build
cd build
cmake ..
make
./server

cd xgcs
node proxy-server.js
```


