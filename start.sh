#!/bin/bash

# XGCS Unified Startup Script
# Handles both Docker and Native modes with automatic detection

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ASCII Art Banner
echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║   ✈️  XGCS - Next Generation Ground Control Station  ✈️    ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if a port is in use
port_in_use() {
    lsof -i:$1 >/dev/null 2>&1
}

# Function to kill processes on a port
kill_port() {
    local port=$1
    if port_in_use $port; then
        echo -e "${YELLOW}Killing process on port $port...${NC}"
        lsof -ti:$port | xargs -r kill -9 2>/dev/null || true
        sleep 1
    fi
}

# Function to wait for a service with improved error checking
wait_for_service() {
    local name=$1
    local url=$2
    local max_attempts=45 # Increased timeout
    local attempt=1
    
    echo -n -e "${BLUE}Waiting for $name at $url to start${NC}"
    while [ $attempt -le $max_attempts ]; do
        # Use curl with a timeout and silent-fail to check the service
        if curl -s --max-time 2 -f -o /dev/null "$url"; then
            echo -e " ${GREEN}✓ Online${NC}"
            return 0
        fi
        
        # Check for common HTTP status codes if curl succeeds but page isn't ready
        local http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "$url")
        if [[ "$http_code" == "200" || "$http_code" == "404" || "$http_code" == "400" ]]; then
             echo -e " ${GREEN}✓ Responding ($http_code)${NC}"
             return 0
        fi

        echo -n "."
        sleep 1
        ((attempt++))
    done
    echo -e " ${RED}✗ Failed to start after $max_attempts seconds${NC}"
    return 1
}

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

# Check for Docker
DOCKER_AVAILABLE=false
if command_exists docker && command_exists docker-compose; then
    DOCKER_AVAILABLE=true
elif command_exists docker && docker compose version >/dev/null 2>&1; then
    DOCKER_AVAILABLE=true
fi

# Check for Node.js and Yarn
NODE_AVAILABLE=false
if command_exists node && command_exists yarn; then
    NODE_AVAILABLE=true
fi

# Determine startup mode
STARTUP_MODE=""
if [ "$1" = "--docker" ]; then
    if [ "$DOCKER_AVAILABLE" = true ]; then
        STARTUP_MODE="docker"
    else
        echo -e "${RED}Error: Docker mode requested but Docker is not available!${NC}"
        exit 1
    fi
elif [ "$1" = "--native" ]; then
    if [ "$NODE_AVAILABLE" = true ]; then
        STARTUP_MODE="native"
    else
        echo -e "${RED}Error: Native mode requested but Node.js/Yarn is not available!${NC}"
        exit 1
    fi
else
    # Auto-detect mode
    if [ "$DOCKER_AVAILABLE" = true ] && [ "$NODE_AVAILABLE" = true ]; then
        echo -e "${BLUE}Both Docker and Native modes are available.${NC}"
        echo "Select startup mode:"
        echo "  1) Docker mode (recommended for production)"
        echo "  2) Native mode (recommended for development)"
        echo ""
        read -p "Enter choice [1-2] (default: 1): " choice
        choice=${choice:-1}
        
        case $choice in
            1) STARTUP_MODE="docker" ;;
            2) STARTUP_MODE="native" ;;
            *) echo -e "${RED}Invalid choice!${NC}"; exit 1 ;;
        esac
    elif [ "$DOCKER_AVAILABLE" = true ]; then
        echo -e "${BLUE}Using Docker mode (Node.js/Yarn not available)${NC}"
        STARTUP_MODE="docker"
    elif [ "$NODE_AVAILABLE" = true ]; then
        echo -e "${BLUE}Using Native mode (Docker not available)${NC}"
        STARTUP_MODE="native"
    else
        echo -e "${RED}Error: Neither Docker nor Node.js/Yarn is available!${NC}"
        echo "Please install either:"
        echo "  - Docker and Docker Compose for Docker mode"
        echo "  - Node.js and Yarn for Native mode"
        exit 1
    fi
fi

echo -e "${GREEN}Starting XGCS in ${STARTUP_MODE^^} mode...${NC}"

# Clean up any existing processes
echo -e "${BLUE}Cleaning up existing processes...${NC}"
kill_port 3000  # Frontend
kill_port 3001  # Proxy
kill_port 5000  # Node.js backend
kill_port 8081  # C++ backend

# Create logs directory
mkdir -p logs

if [ "$STARTUP_MODE" = "docker" ]; then
    # Docker mode
    echo -e "${BLUE}Starting Docker services...${NC}"
    
    # Determine docker compose command
    if docker compose version >/dev/null 2>&1; then
        DOCKER_COMPOSE="docker compose"
    else
        DOCKER_COMPOSE="docker-compose"
    fi
    
    # Stop any running containers
    $DOCKER_COMPOSE down 2>/dev/null || true
    
    # Start all services
    $DOCKER_COMPOSE up -d
    
    # Wait for services
    wait_for_service "Frontend" "http://localhost:3000"
    wait_for_service "Backend" "http://localhost:5000/health"
    
    echo -e "${GREEN}✅ All Docker services started!${NC}"
    
elif [ "$STARTUP_MODE" = "native" ]; then
    # Native mode
    echo -e "${BLUE}Starting Native services...${NC}"
    
    # Check if C++ backend exists and build if necessary
    if [ ! -f "server/build/server" ]; then
        echo -e "${YELLOW}C++ backend not built. Building now...${NC}"
        if [ -f "build_cpp_backend.sh" ]; then
            ./build_cpp_backend.sh
            if [ $? -ne 0 ]; then
                echo -e "${RED}Failed to build C++ backend!${NC}"
                echo "Continuing without C++ backend (limited functionality)"
            fi
        fi
    fi
    
    # Start Node.js simulation backend
    echo -e "${BLUE}Starting Node.js simulation backend...${NC}"
    cd server/src
    node server.js > ../../logs/node_backend.log 2>&1 &
    NODE_PID=$!
    cd ../..
    echo -e "${GREEN}Node.js backend started (PID: $NODE_PID)${NC}"
    
    # Start C++ backend
    echo -e "${BLUE}Starting C++ MAVSDK backend...${NC}"
    if [ -f "server/build/server" ]; then
        cd server/build
        ./server > ../../logs/cpp_backend.log 2>&1 &
        CPP_PID=$!
        cd ../..
        echo -e "${GREEN}C++ backend started (PID: $CPP_PID)${NC}"
    else
        echo -e "${YELLOW}C++ backend not available, skipping...${NC}"
    fi
    
    # Start proxy server
    echo -e "${BLUE}Starting proxy server...${NC}"
    node proxy-server.js > logs/proxy.log 2>&1 &
    PROXY_PID=$!
    echo -e "${GREEN}Proxy server started (PID: $PROXY_PID)${NC}"
    
    # Start frontend
    echo -e "${BLUE}Starting React frontend...${NC}"
    cd client
    yarn start > ../logs/frontend.log 2>&1 &
    FRONTEND_PID=$!
    cd ..
    echo -e "${GREEN}Frontend started (PID: $FRONTEND_PID)${NC}"
    
    # Wait for services to start
    echo -e "${BLUE}Waiting for all services to come online...${NC}"
    wait_for_service "Node.js Backend" "http://localhost:5000/health"
    wait_for_service "Proxy" "http://localhost:3001/health"
    
    if [ -f "server/build/server" ]; then
        wait_for_service "C++ Backend" "http://localhost:8081/connections"
    fi
    
    wait_for_service "Frontend" "http://localhost:3000"
    
    echo -e "${GREEN}✅ All Native services seem to be running!${NC}"
fi

# Display status and URLs
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🚀 XGCS is running!${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Access points:${NC}"
echo -e "  Frontend:    ${GREEN}http://localhost:3000${NC}"

if [ "$STARTUP_MODE" = "docker" ]; then
    echo -e "  Backend API: ${GREEN}http://localhost:5000${NC}"
    echo ""
    echo -e "${BLUE}Quick actions:${NC}"
    echo -e "  • View logs:        ${YELLOW}docker compose logs -f${NC}"
    echo -e "  • Stop everything:  ${YELLOW}docker compose down${NC}"
    echo -e "  • Restart backend:  ${YELLOW}docker compose restart backend${NC}"
else
    echo -e "  Proxy:       ${GREEN}http://localhost:3001${NC}"
    echo -e "  C++ Backend: ${GREEN}http://localhost:8081${NC} (if available)"
    echo -e "  Node.js Backend: ${GREEN}http://localhost:5000${NC}"
    echo ""
    if [ -f "server/build/server" ]; then
        echo -e "${BLUE}Process IDs:${NC}"
        echo -e "  Frontend:    ${YELLOW}$FRONTEND_PID${NC}"
        echo -e "  Proxy:       ${YELLOW}$PROXY_PID${NC}"
        echo -e "  Node.js Backend: ${YELLOW}$NODE_PID${NC}"
        echo -e "  C++ Backend: ${YELLOW}$CPP_PID${NC}"
        echo ""
    else
        echo -e "${BLUE}Process IDs:${NC}"
        echo -e "  Frontend:    ${YELLOW}$FRONTEND_PID${NC}"
        echo -e "  Proxy:       ${YELLOW}$PROXY_PID${NC}"
        echo -e "  Node.js Backend: ${YELLOW}$NODE_PID${NC}"
        echo ""
    fi
    echo -e "${BLUE}Log files:${NC}"
    echo -e "  Frontend:    ${YELLOW}logs/frontend.log${NC}"
    echo -e "  Proxy:       ${YELLOW}logs/proxy.log${NC}"
    echo -e "  Node.js Backend: ${YELLOW}logs/node_backend.log${NC}"
    if [ -f "server/build/server" ]; then
        echo -e "  C++ Backend: ${YELLOW}logs/cpp_backend.log${NC}"
    fi
    echo ""
    echo -e "${BLUE}Quick actions:${NC}"
    echo -e "  • View logs:        ${YELLOW}tail -f logs/*.log${NC}"
    echo -e "  • Stop everything:  ${YELLOW}./stop.sh${NC}"
    echo -e "  • Restart:          ${YELLOW}./start.sh${NC}"
fi

echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Go to ${GREEN}http://localhost:3000${NC}"
echo -e "  2. Create a SITL simulation in the Simulation tab"
echo -e "  3. Connect to it in the Connections tab"
echo ""

# Optional: Open browser
if command_exists xdg-open; then
    read -p "Open XGCS in browser? [Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        xdg-open http://localhost:3000 2>/dev/null &
    fi
elif command_exists open; then
    read -p "Open XGCS in browser? [Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        open http://localhost:3000 2>/dev/null &
    fi
fi

# Keep script running if in native mode
if [ "$STARTUP_MODE" = "native" ]; then
    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
    
    # Trap Ctrl+C to cleanup
    trap 'echo -e "\n${YELLOW}Stopping services...${NC}"; kill_port 3000; kill_port 3001; kill_port 5000; kill_port 8081; exit' INT
    
    # Wait indefinitely
    while true; do
        sleep 1
    done
fi 