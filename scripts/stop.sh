#!/bin/bash

# XGCS Unified Stop Script
# Stops all components regardless of startup mode

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Help function
show_help() {
    echo -e "${BLUE}XGCS Stop Script${NC}"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help           Show this help message"
    echo "  --docker_clear       Remove all Docker containers with 'sitl' in the image name"
    echo ""
    echo "Examples:"
    echo "  $0                   Stop all XGCS services normally"
    echo "  $0 --docker_clear    Stop services and remove SITL Docker containers"
    echo ""
    exit 0
}

# Parse arguments
DOCKER_CLEAR=false
for arg in "$@"; do
  case $arg in
    -h|--help)
      show_help
      ;;
    --docker_clear)
      DOCKER_CLEAR=true
      ;;
    *)
      echo -e "${RED}Unknown option: $arg${NC}"
      echo "Use -h or --help for usage information"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}Stopping XGCS services...${NC}"

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to kill processes on a port
kill_port() {
    local port=$1
    local service_name=$2
    if lsof -i:$port >/dev/null 2>&1; then
        echo -e "${YELLOW}Stopping $service_name on port $port...${NC}"
        lsof -ti:$port | xargs -r kill -9 2>/dev/null || true
        sleep 1
        echo -e "${GREEN}✓ $service_name stopped${NC}"
    else
        echo -e "${BLUE}$service_name not running on port $port${NC}"
    fi
}

# Check if Docker containers are running
if command_exists docker; then
    if docker ps --format "table {{.Names}}" | grep -q "xgcs"; then
        echo -e "${YELLOW}Stopping Docker containers...${NC}"
        if docker compose version >/dev/null 2>&1; then
            docker compose down
        else
            docker-compose down
        fi
        echo -e "${GREEN}✓ Docker containers stopped${NC}"
    fi
    # Docker clear for SITL containers
    if [ "$DOCKER_CLEAR" = true ]; then
        echo -e "${YELLOW}Removing all Docker containers with 'sitl' in the image name...${NC}"
        docker ps -a --format '{{.ID}} {{.Image}}' | awk '$2 ~ /sitl/ {print $1}' | xargs -r docker rm -f
        echo -e "${GREEN}✓ SITL Docker containers removed${NC}"
    fi
fi

# Kill all XGCS services (native mode)
kill_port 3000 "Frontend"
kill_port 3001 "Proxy"
kill_port 5000 "Node.js Backend"
kill_port 8081 "C++ Backend"

# Also kill any related processes
echo -e "${YELLOW}Cleaning up any remaining XGCS processes by name...${NC}"
pkill -f 'yarn start' 2>/dev/null || true
pkill -f 'node proxy-server.js' 2>/dev/null || true
pkill -f 'node server.js' 2>/dev/null || true
pkill -f 'server/build/server' 2>/dev/null || true # More specific path
pkill -f 'react-scripts' 2>/dev/null || true # For create-react-app

# Final check for any remaining node processes related to the project
pgrep -f "node .*xgcs" | xargs -r kill -9 2>/dev/null || true

echo -e "${GREEN}✅ All XGCS services have been instructed to stop!${NC}" 