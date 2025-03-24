# xgcs

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


