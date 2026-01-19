#!/bin/bash

echo "Building XGCS C++ MAVSDK Backend..."

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if MAVSDK is installed
if ! pkg-config --exists mavsdk; then
    echo -e "${RED}Error: MAVSDK not found!${NC}"
    echo "Please install MAVSDK first:"
    echo "  sudo apt-get update"
    echo "  sudo apt-get install -y libmavsdk-dev"
    echo ""
    echo "Or build from source:"
    echo "  git clone https://github.com/mavlink/MAVSDK.git"
    echo "  cd MAVSDK"
    echo "  cmake -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=ON -B build"
    echo "  cmake --build build -j4"
    echo "  sudo cmake --install build"
    exit 1
fi

# Check for other dependencies
echo "Checking dependencies..."
MISSING_DEPS=()

if ! pkg-config --exists nlohmann_json; then
    MISSING_DEPS+=("nlohmann-json3-dev")
fi

if ! ldconfig -p | grep -q libboost_system; then
    MISSING_DEPS+=("libboost-all-dev")
fi

if [ ${#MISSING_DEPS[@]} -ne 0 ]; then
    echo -e "${RED}Missing dependencies:${NC}"
    echo "Please install: sudo apt-get install -y ${MISSING_DEPS[@]}"
    exit 1
fi

# Create build directory
mkdir -p server/build
cd server/build

# Configure with CMake
echo "Configuring with CMake..."
cmake .. -DCMAKE_BUILD_TYPE=Release

if [ $? -ne 0 ]; then
    echo -e "${RED}CMake configuration failed!${NC}"
    exit 1
fi

# Build
echo "Building..."
make -j$(nproc)

if [ $? -ne 0 ]; then
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}Build successful!${NC}"
echo "C++ backend binary is at: server/build/server"
echo ""
echo "To run the complete XGCS system, use: ./start.sh"
echo "To run just the C++ backend: ./server/build/server"

# Make the script executable for next time
chmod +x "$SCRIPT_DIR/build_cpp_backend.sh" 