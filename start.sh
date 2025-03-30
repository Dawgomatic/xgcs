#!/bin/bash

# Start script for XGCS
# This script starts the client, server, and proxy server components

# Function to display help
show_help() {
    echo "Usage: ./start.sh [options]"
    echo ""
    echo "Options:"
    echo "  -h, --help           Show this help message"
    echo "  -t, --terminal       Start each component in a new terminal window (default is background)"
    echo "  -v, --verbose        Show verbose output"
    echo ""
    echo "This script starts the following components:"
    echo "  1. React frontend client"
    echo "  2. C++ backend server"
    echo "  3. Proxy server"
}

# Set default values
USE_TERMINAL=false
VERBOSE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            show_help
            exit 0
            ;;
        -t|--terminal)
            USE_TERMINAL=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Get the base directory (where this script is located)
BASE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOG_DIR="$BASE_DIR/logs"

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Function to log messages
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    if [ "$VERBOSE" = true ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    fi
}

# Function to start a component
start_component() {
    local name="$1"
    local dir="$2"
    local cmd="$3"
    local log_file="$LOG_DIR/${name}.log"
    
    log "Starting $name..."
    
    if [ "$USE_TERMINAL" = true ]; then
        # Try different terminal emulators
        if command -v gnome-terminal >/dev/null 2>&1; then
            gnome-terminal -- bash -c "cd '$dir' && echo 'Starting $name...' && $cmd; read -p 'Press Enter to close...'"
        elif command -v xterm >/dev/null 2>&1; then
            xterm -title "$name" -e "cd '$dir' && echo 'Starting $name...' && $cmd; read -p 'Press Enter to close...'" &
        elif command -v konsole >/dev/null 2>&1; then
            konsole --noclose -e bash -c "cd '$dir' && echo 'Starting $name...' && $cmd; read -p 'Press Enter to close...'" &
        else
            log "No terminal emulator found. Running $name in background."
            cd "$dir" && $cmd > "$log_file" 2>&1 &
        fi
    else
        # Run in background
        cd "$dir" && $cmd > "$log_file" 2>&1 &
        log "$name started in background. Logs at $log_file"
    fi
}

# Check if necessary tools are installed
check_dependencies() {
    log "Checking dependencies..."
    
    if ! command -v yarn >/dev/null 2>&1; then
        log "Error: yarn is not installed. Please install yarn first."
        exit 1
    fi
    
    if ! command -v cmake >/dev/null 2>&1; then
        log "Error: cmake is not installed. Please install cmake first."
        exit 1
    fi
    
    if ! command -v node >/dev/null 2>&1; then
        log "Error: node is not installed. Please install node first."
        exit 1
    fi
    
    log "All required dependencies found."
}

# Build the server if needed
build_server() {
    log "Checking if server needs to be built..."
    
    local server_dir="$BASE_DIR/server"
    local build_dir="$server_dir/build"
    local server_binary="$build_dir/server"
    
    if [ ! -d "$build_dir" ]; then
        log "Creating build directory..."
        mkdir -p "$build_dir"
    fi
    
    if [ ! -f "$server_binary" ]; then
        log "Building server..."
        cd "$build_dir" && cmake .. && make
        if [ $? -ne 0 ]; then
            log "Error: Failed to build server."
            exit 1
        fi
        log "Server built successfully."
    else
        log "Server binary exists, skipping build."
    fi
}

# Start all components
start_all() {
    # Start client
    start_component "client" "$BASE_DIR/client" "yarn start"
    
    # Give the client a moment to start
    sleep 2
    
    # Start server
    start_component "server" "$BASE_DIR/server/build" "./server"
    
    # Give the server a moment to start
    sleep 2
    
    # Start proxy server
    start_component "proxy" "$BASE_DIR" "node proxy-server.js"
    
    log "All components started. The application should be accessible at http://localhost:3000"
    log "To view logs, check the files in $LOG_DIR"
    log "To stop all components, run: pkill -f 'node|server'"
}

# Main execution
log "Starting XGCS..."
check_dependencies
build_server
start_all
log "Startup complete!"

# If not using terminals, keep the script running to make it easy to Ctrl+C
if [ "$USE_TERMINAL" = false ]; then
    log "Press Ctrl+C to stop all components"
    wait
fi
