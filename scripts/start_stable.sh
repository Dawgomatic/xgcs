#!/bin/bash

# XGCS Stable Startup Script with Enhanced Reliability
# SWE100821: Comprehensive stability improvements for production use

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
echo "║   ✈️  XGCS - Stable Ground Control Station  ✈️            ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Configuration
MAX_RESTART_ATTEMPTS=5
RESTART_DELAY=10
HEALTH_CHECK_INTERVAL=30
LOG_DIR="$SCRIPT_DIR/logs"
PID_DIR="$SCRIPT_DIR/pids"

# Create necessary directories
mkdir -p "$LOG_DIR" "$PID_DIR"

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
        sleep 2
    fi
}

# Function to wait for a service with improved error checking
wait_for_service() {
    local name=$1
    local url=$2
    local max_attempts=60 # Increased timeout for stability
    local attempt=1
    
    echo -n -e "${BLUE}Waiting for $name at $url to start${NC}"
    while [ $attempt -le $max_attempts ]; do
        # Use curl with a timeout and silent-fail to check the service
        if curl -s --max-time 5 -f -o /dev/null "$url" 2>/dev/null; then
            echo -e " ${GREEN}✓ Online${NC}"
            return 0
        fi
        
        # Check for common HTTP status codes if curl succeeds but page isn't ready
        local http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null)
        if [[ "$http_code" == "200" || "$http_code" == "404" || "$http_code" == "400" ]]; then
             echo -e " ${GREEN}✓ Responding ($http_code)${NC}"
             return 0
        fi

        echo -n "."
        sleep 2
        ((attempt++))
    done
    echo -e " ${RED}✗ Failed to start after $max_attempts seconds${NC}"
    return 1
}

# Function to check service health
check_service_health() {
    local service_name=$1
    local health_url=$2
    local pid_file=$3
    
    if [ ! -f "$pid_file" ]; then
        return 1
    fi
    
    local pid=$(cat "$pid_file")
    if ! kill -0 "$pid" 2>/dev/null; then
        echo -e "${RED}Service $service_name (PID: $pid) is not running${NC}"
        return 1
    fi
    
    if ! curl -s --max-time 5 -f "$health_url" >/dev/null 2>&1; then
        echo -e "${YELLOW}Service $service_name is running but not responding to health checks${NC}"
        return 1
    fi
    
    return 0
}

# Function to restart a service
restart_service() {
    local service_name=$1
    local restart_func=$2
    local attempt=1
    
    echo -e "${YELLOW}Restarting $service_name...${NC}"
    
    while [ $attempt -le $MAX_RESTART_ATTEMPTS ]; do
        echo -e "${BLUE}Attempt $attempt/$MAX_RESTART_ATTEMPTS${NC}"
        
        # Stop the service first
        stop_service "$service_name"
        sleep 2
        
        # Start the service
        if $restart_func; then
            echo -e "${GREEN}$service_name restarted successfully${NC}"
            return 0
        fi
        
        echo -e "${RED}Failed to restart $service_name, attempt $attempt${NC}"
        sleep $RESTART_DELAY
        ((attempt++))
    done
    
    echo -e "${RED}Failed to restart $service_name after $MAX_RESTART_ATTEMPTS attempts${NC}"
    return 1
}

# Function to stop a service
stop_service() {
    local service_name=$1
    local pid_file="$PID_DIR/${service_name}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${YELLOW}Stopping $service_name (PID: $pid)...${NC}"
            kill "$pid" 2>/dev/null || true
            sleep 2
            if kill -0 "$pid" 2>/dev/null; then
                echo -e "${YELLOW}Force killing $service_name...${NC}"
                kill -9 "$pid" 2>/dev/null || true
            fi
        fi
        rm -f "$pid_file"
    fi
}

# Function to start C++ backend
start_cpp_backend() {
    echo -e "${BLUE}Starting C++ MAVSDK backend...${NC}"
    
    # Check if binary exists
    if [ ! -f "server/build/server" ]; then
        echo -e "${YELLOW}C++ backend not built. Building now...${NC}"
        if [ -f "build_cpp_backend.sh" ]; then
            ./build_cpp_backend.sh
            if [ $? -ne 0 ]; then
                echo -e "${RED}Failed to build C++ backend!${NC}"
                return 1
            fi
        else
            echo -e "${RED}Build script not found!${NC}"
            return 1
        fi
    fi
    
    # Kill any existing process on port 8081
    kill_port 8081
    
    # Start the backend
    cd server/build
    nohup ./server > ../../logs/cpp_backend.log 2>&1 &
    local pid=$!
    cd ../..
    
    # Save PID
    echo "$pid" > "$PID_DIR/cpp_backend.pid"
    
    # Wait for startup
    sleep 3
    
    # Check if process is running
    if ! kill -0 "$pid" 2>/dev/null; then
        echo -e "${RED}C++ backend failed to start${NC}"
        return 1
    fi
    
    echo -e "${GREEN}C++ backend started (PID: $pid)${NC}"
    return 0
}

# Function to start Node.js backend
start_node_backend() {
    echo -e "${BLUE}Starting Node.js simulation backend...${NC}"
    
    # Kill any existing process on port 5000
    kill_port 5000
    
    # Start the backend
    cd server/src
    nohup node server.js > ../../logs/node_backend.log 2>&1 &
    local pid=$!
    cd ../..
    
    # Save PID
    echo "$pid" > "$PID_DIR/node_backend.pid"
    
    # Wait for startup
    sleep 3
    
    # Check if process is running
    if ! kill -0 "$pid" 2>/dev/null; then
        echo -e "${RED}Node.js backend failed to start${NC}"
        return 1
    fi
    
    echo -e "${GREEN}Node.js backend started (PID: $pid)${NC}"
    return 0
}

# Function to start proxy server
start_proxy() {
    echo -e "${BLUE}Starting proxy server...${NC}"
    
    # Kill any existing process on port 3001
    kill_port 3001
    
    # Start the proxy
    nohup node proxy-server.js > logs/proxy.log 2>&1 &
    local pid=$!
    
    # Save PID
    echo "$pid" > "$PID_DIR/proxy.pid"
    
    # Wait for startup
    sleep 3
    
    # Check if process is running
    if ! kill -0 "$pid" 2>/dev/null; then
        echo -e "${RED}Proxy server failed to start${NC}"
        return 1
    fi
    
    echo -e "${GREEN}Proxy server started (PID: $pid)${NC}"
    return 0
}

# Function to start frontend
start_frontend() {
    echo -e "${BLUE}Starting React frontend...${NC}"
    
    # Kill any existing process on port 3000
    kill_port 3000
    
    # Start the frontend
    cd client
    nohup yarn start > ../logs/frontend.log 2>&1 &
    local pid=$!
    cd ..
    
    # Save PID
    echo "$pid" > "$PID_DIR/frontend.pid"
    
    # Wait for startup
    sleep 5
    
    # Check if process is running
    if ! kill -0 "$pid" 2>/dev/null; then
        echo -e "${RED}Frontend failed to start${NC}"
        return 1
    fi
    
    echo -e "${GREEN}Frontend started (PID: $pid)${NC}"
    return 0
}

# Function to monitor services
monitor_services() {
    echo -e "${BLUE}Starting service monitoring...${NC}"
    
    while true; do
        sleep $HEALTH_CHECK_INTERVAL
        
        # Check C++ backend
        if [ -f "$PID_DIR/cpp_backend.pid" ]; then
            if ! check_service_health "C++ Backend" "http://localhost:8081/health" "$PID_DIR/cpp_backend.pid"; then
                echo -e "${YELLOW}C++ backend health check failed, restarting...${NC}"
                restart_service "cpp_backend" start_cpp_backend
            fi
        fi
        
        # Check Node.js backend
        if [ -f "$PID_DIR/node_backend.pid" ]; then
            if ! check_service_health "Node.js Backend" "http://localhost:5000/health" "$PID_DIR/node_backend.pid"; then
                echo -e "${YELLOW}Node.js backend health check failed, restarting...${NC}"
                restart_service "node_backend" start_node_backend
            fi
        fi
        
        # Check proxy
        if [ -f "$PID_DIR/proxy.pid" ]; then
            if ! check_service_health "Proxy" "http://localhost:3001/health" "$PID_DIR/proxy.pid"; then
                echo -e "${YELLOW}Proxy health check failed, restarting...${NC}"
                restart_service "proxy" start_proxy
            fi
        fi
        
        # Check frontend
        if [ -f "$PID_DIR/frontend.pid" ]; then
            if ! check_service_health "Frontend" "http://localhost:3000" "$PID_DIR/frontend.pid"; then
                echo -e "${YELLOW}Frontend health check failed, restarting...${NC}"
                restart_service "frontend" start_frontend
            fi
        fi
        
        echo -e "${GREEN}All services healthy${NC}"
    done
}

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down all services...${NC}"
    
    stop_service "cpp_backend"
    stop_service "node_backend"
    stop_service "proxy"
    stop_service "frontend"
    
    # Kill any remaining processes on our ports
    kill_port 3000
    kill_port 3001
    kill_port 5000
    kill_port 8081
    
    echo -e "${GREEN}Cleanup complete${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup INT TERM

# Main startup sequence
echo -e "${BLUE}Starting XGCS with enhanced stability...${NC}"

# Clean up any existing processes
echo -e "${BLUE}Cleaning up existing processes...${NC}"
# Don't call cleanup here as it exits - just stop services
stop_service "cpp_backend"
stop_service "node_backend"
stop_service "proxy"
stop_service "frontend"

# Kill any remaining processes on our ports
kill_port 3000
kill_port 3001
kill_port 5000
kill_port 8081

# Start services in order
echo -e "${BLUE}Starting all services...${NC}"

# Start C++ backend first
if ! start_cpp_backend; then
    echo -e "${RED}Failed to start C++ backend${NC}"
    exit 1
fi

# Start Node.js backend
if ! start_node_backend; then
    echo -e "${RED}Failed to start Node.js backend${NC}"
    cleanup
    exit 1
fi

# Start proxy
if ! start_proxy; then
    echo -e "${RED}Failed to start proxy${NC}"
    cleanup
    exit 1
fi

# Start frontend
if ! start_frontend; then
    echo -e "${RED}Failed to start frontend${NC}"
    cleanup
    exit 1
fi

# Wait for all services to be ready
echo -e "${BLUE}Waiting for all services to come online...${NC}"
wait_for_service "Node.js Backend" "http://localhost:5000/health"
wait_for_service "Proxy" "http://localhost:3001/health"
wait_for_service "C++ Backend" "http://localhost:8081/health"
wait_for_service "Frontend" "http://localhost:3000"

echo -e "${GREEN}✅ All services started successfully!${NC}"

# Display status
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🚀 XGCS is running with enhanced stability!${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Access points:${NC}"
echo -e "  Frontend:    ${GREEN}http://localhost:3000${NC}"
echo -e "  Proxy:       ${GREEN}http://localhost:3001${NC}"
echo -e "  C++ Backend: ${GREEN}http://localhost:8081${NC}"
echo -e "  Node.js Backend: ${GREEN}http://localhost:5000${NC}"
echo ""
echo -e "${BLUE}Process IDs:${NC}"
echo -e "  Frontend:    ${YELLOW}$(cat "$PID_DIR/frontend.pid" 2>/dev/null || echo "N/A")${NC}"
echo -e "  Proxy:       ${YELLOW}$(cat "$PID_DIR/proxy.pid" 2>/dev/null || echo "N/A")${NC}"
echo -e "  Node.js Backend: ${YELLOW}$(cat "$PID_DIR/node_backend.pid" 2>/dev/null || echo "N/A")${NC}"
echo -e "  C++ Backend: ${YELLOW}$(cat "$PID_DIR/cpp_backend.pid" 2>/dev/null || echo "N/A")${NC}"
echo ""
echo -e "${BLUE}Log files:${NC}"
echo -e "  Frontend:    ${YELLOW}logs/frontend.log${NC}"
echo -e "  Proxy:       ${YELLOW}logs/proxy.log${NC}"
echo -e "  Node.js Backend: ${YELLOW}logs/node_backend.log${NC}"
echo -e "  C++ Backend: ${YELLOW}logs/cpp_backend.log${NC}"
echo ""
echo -e "${BLUE}Monitoring:${NC}"
echo -e "  Health checks every ${YELLOW}${HEALTH_CHECK_INTERVAL}s${NC}"
echo -e "  Auto-restart on failures"
echo -e "  Process monitoring active"
echo ""

# Start monitoring in background
monitor_services &
MONITOR_PID=$!

echo -e "${BLUE}Service monitoring started (PID: $MONITOR_PID)${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"

# Wait for user interrupt
wait
