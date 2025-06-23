#!/bin/bash

# Unified XGCS Startup Script
# Combines functionality from start.sh, debug_start.sh, simple_debug.sh, and restart_frontend.sh

# Function to display help
show_help() {
    echo "Usage: ./start.sh [options]"
    echo ""
    echo "Options:"
    echo "  -h, --help           Show this help message"
    echo "  -t, --terminal       Start each component in a new terminal window"
    echo "  -v, --verbose        Show verbose output"
    echo "  -l, --logging        Enable logging to files (default: logs/*.log)"
    echo "  -d, --debug          Enable debug mode with comprehensive logging"
    echo "  -f, --frontend-only  Start only the frontend (useful for development)"
    echo "  -r, --restart        Restart all components (kill existing first)"
    echo ""
    echo "Examples:"
    echo "  ./start.sh                    # Normal startup"
    echo "  ./start.sh --logging          # With file logging"
    echo "  ./start.sh --debug            # Debug mode with detailed logs"
    echo "  ./start.sh --frontend-only    # Start only frontend"
    echo "  ./start.sh --restart          # Restart all components"
    echo ""
    echo "This script starts the following components:"
    echo "  1. React frontend client (port 3000)"
    echo "  2. C++ backend server (port 8081)"
    echo "  3. Proxy server"
}

# Set default values
USE_TERMINAL=false
VERBOSE=false
ENABLE_LOGGING=false
DEBUG_MODE=false
FRONTEND_ONLY=false
RESTART_MODE=false

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
        -l|--logging)
            ENABLE_LOGGING=true
            shift
            ;;
        -d|--debug)
            DEBUG_MODE=true
            ENABLE_LOGGING=true
            VERBOSE=true
            shift
            ;;
        -f|--frontend-only)
            FRONTEND_ONLY=true
            shift
            ;;
        -r|--restart)
            RESTART_MODE=true
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
LOCK_FILE="$BASE_DIR/start.lock"

# Check if script is already running using lock file
if [ -f "$LOCK_FILE" ]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
        echo "Error: Another instance of start.sh is already running (PID: $LOCK_PID)"
        echo "Use --restart to kill existing processes and start fresh"
        exit 1
    else
        # Lock file exists but process is dead, remove it
        rm -f "$LOCK_FILE"
    fi
fi

# Create lock file
echo $$ > "$LOCK_FILE"

# Function to cleanup lock file
cleanup_lock() {
    rm -f "$LOCK_FILE"
}

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Function to log messages
log() {
    local timestamp="[$(date '+%Y-%m-%d %H:%M:%S')]"
    echo "$timestamp $1"
    
    if [ "$ENABLE_LOGGING" = true ]; then
        echo "$timestamp $1" >> "$LOG_DIR/startup.log"
    fi
}

# Function to kill existing processes
kill_existing_processes() {
    log "Killing existing processes..."
    
    # Kill by process names
    pkill -f 'node proxy-server.js' 2>/dev/null || true
    pkill -f 'yarn start' 2>/dev/null || true
    pkill -f 'react-app-rewired' 2>/dev/null || true
    pkill -f '/server/build/server' 2>/dev/null || true
    
    # Kill by port
    lsof -ti:3000 | xargs -r kill -9 2>/dev/null || true
    lsof -ti:8081 | xargs -r kill -9 2>/dev/null || true
    
    # Kill any existing browser windows opened by this script
    pkill -f "xdg-open.*localhost:3000" 2>/dev/null || true
    
    sleep 3
    log "Process cleanup complete"
}

# Function to check dependencies
check_dependencies() {
    log "Checking dependencies..."
    
    local missing_deps=()
    
    if ! command -v yarn >/dev/null 2>&1; then
        missing_deps+=("yarn")
    fi
    
    if ! command -v node >/dev/null 2>&1; then
        missing_deps+=("node")
    fi
    
    if [ "$FRONTEND_ONLY" = false ]; then
        if ! command -v cmake >/dev/null 2>&1; then
            missing_deps+=("cmake")
        fi
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        log "Error: Missing dependencies: ${missing_deps[*]}"
        log "Please install the missing dependencies and try again."
        exit 1
    fi
    
    log "All required dependencies found."
}

# Function to build the server
build_server() {
    if [ "$FRONTEND_ONLY" = true ]; then
        log "Skipping server build (frontend-only mode)"
        return
    fi
    
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

# Function to start a component
start_component() {
    local name="$1"
    local dir="$2"
    local cmd="$3"
    local log_file="$LOG_DIR/${name}.log"
    local debug_log_file="$LOG_DIR/${name}_debug.log"
    
    log "Starting $name..."
    
    # Choose log file based on mode
    local actual_log_file="$log_file"
    if [ "$DEBUG_MODE" = true ]; then
        actual_log_file="$debug_log_file"
    fi
    
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
            if [ "$ENABLE_LOGGING" = true ]; then
                cd "$dir" && $cmd > "$actual_log_file" 2>&1 &
            else
                cd "$dir" && $cmd > /dev/null 2>&1 &
            fi
        fi
    else
        # Run in background
        if [ "$ENABLE_LOGGING" = true ]; then
            cd "$dir" && $cmd > "$actual_log_file" 2>&1 &
        else
            cd "$dir" && $cmd > /dev/null 2>&1 &
        fi
        
        local pid=$!
        log "$name started with PID: $pid"
        
        if [ "$ENABLE_LOGGING" = true ]; then
            log "$name logs at $actual_log_file"
        fi
        
        # Store PID for cleanup
        case "$name" in
            "frontend")
                FRONTEND_PID=$pid
                ;;
            "backend")
                BACKEND_PID=$pid
                ;;
            "proxy")
                PROXY_PID=$pid
                ;;
        esac
    fi
}

# Function to start frontend with debug logging
start_frontend_debug() {
    log "Starting frontend with debug logging..."
    cd "$BASE_DIR/client"
    
    # Create a temporary script for verbose logging
    cat > temp_start.js << 'EOF'
const { spawn } = require('child_process');
const fs = require('fs');

const logFile = fs.createWriteStream('../logs/frontend_debug.log', { flags: 'a' });

const child = spawn('yarn', ['start'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CI: 'false', GENERATE_SOURCEMAP: 'true' }
});

child.stdout.on('data', (data) => {
    const output = data.toString();
    logFile.write(`[STDOUT] ${output}`);
    process.stdout.write(output);
});

child.stderr.on('data', (data) => {
    const output = data.toString();
    logFile.write(`[STDERR] ${output}`);
    process.stderr.write(output);
});

child.on('close', (code) => {
    logFile.write(`[EXIT] Process exited with code ${code}\n`);
    process.exit(code);
});

process.on('SIGINT', () => {
    child.kill('SIGINT');
    process.exit(0);
});
EOF

    nohup node temp_start.js > "$LOG_DIR/frontend_debug.log" 2>&1 &
    FRONTEND_PID=$!
    log "Frontend started with PID: $FRONTEND_PID"
}

# Function to clear frontend cache
clear_frontend_cache() {
    log "Clearing frontend cache..."
    cd "$BASE_DIR/client"
    rm -rf node_modules/.cache
    log "Frontend cache cleared"
}

# Function to start all components
start_all() {
    # Start frontend
    if [ "$DEBUG_MODE" = true ]; then
        start_frontend_debug
    else
        start_component "frontend" "$BASE_DIR/client" "yarn start"
    fi
    
    # Give the frontend a moment to start
    sleep 3
    
    if [ "$FRONTEND_ONLY" = false ]; then
        # Start backend
        start_component "backend" "$BASE_DIR/server/build" "./server"
        
        # Give the backend a moment to start
        sleep 3
        
        # Start proxy server
        start_component "proxy" "$BASE_DIR" "node proxy-server.js"
    fi
    
    log "All components started successfully!"
}

# Function to display status
show_status() {
    echo ""
    echo "=== XGCS Status ==="
    echo "Frontend: http://localhost:3000"
    if [ "$FRONTEND_ONLY" = false ]; then
        echo "Backend:  http://localhost:8081"
    fi
    echo ""
    
    if [ "$ENABLE_LOGGING" = true ]; then
        echo "=== Log Files ==="
        if [ "$DEBUG_MODE" = true ]; then
            echo "Frontend: $LOG_DIR/frontend_debug.log"
            echo "Backend:  $LOG_DIR/backend_debug.log"
            echo "Proxy:    $LOG_DIR/proxy_debug.log"
        else
            echo "Frontend: $LOG_DIR/frontend.log"
            echo "Backend:  $LOG_DIR/backend.log"
            echo "Proxy:    $LOG_DIR/proxy.log"
        fi
        echo ""
        echo "=== View logs ==="
        echo "tail -f $LOG_DIR/frontend.log"
        echo "tail -f $LOG_DIR/backend.log"
        echo ""
    fi
    
    if [ "$DEBUG_MODE" = true ]; then
        echo "=== Process IDs ==="
        echo "Frontend PID: $FRONTEND_PID"
        if [ "$FRONTEND_ONLY" = false ]; then
            echo "Backend PID:  $BACKEND_PID"
            echo "Proxy PID:    $PROXY_PID"
        fi
        echo ""
    fi
}

# Function to cleanup on exit
cleanup() {
    echo ""
    log "Shutting down all components..."
    
    if [ -n "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    if [ -n "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    if [ -n "$PROXY_PID" ]; then
        kill $PROXY_PID 2>/dev/null || true
    fi
    
    # Clean up temporary files
    rm -f "$BASE_DIR/client/temp_start.js"
    
    # Kill by process names as backup
    pkill -f 'node proxy-server.js' 2>/dev/null || true
    pkill -f 'yarn start' 2>/dev/null || true
    pkill -f 'react-app-rewired' 2>/dev/null || true
    pkill -f '/server/build/server' 2>/dev/null || true
    
    # Clean up lock file
    cleanup_lock
    
    log "Cleanup complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM
trap cleanup_lock EXIT

# Main execution
log "=== XGCS Unified Startup Script ==="

if [ "$DEBUG_MODE" = true ]; then
    log "Running in DEBUG mode"
elif [ "$ENABLE_LOGGING" = true ]; then
    log "Running with LOGGING enabled"
fi

if [ "$FRONTEND_ONLY" = true ]; then
    log "Running in FRONTEND-ONLY mode"
fi

if [ "$RESTART_MODE" = true ]; then
    log "Running in RESTART mode"
fi

check_dependencies

if [ "$RESTART_MODE" = true ]; then
    kill_existing_processes
fi

if [ "$FRONTEND_ONLY" = false ]; then
    build_server
fi

if [ "$RESTART_MODE" = true ] || [ "$FRONTEND_ONLY" = true ]; then
    clear_frontend_cache
fi

start_all
show_status

# Optionally open the browser
if [ "$USE_TERMINAL" = false ]; then
    # Only open browser if not already running
    if ! pgrep -f "react-app-rewired" > /dev/null; then
        log "Opening browser..."
        xdg-open http://localhost:3000 2>/dev/null &
    else
        log "Frontend already running, skipping browser open"
    fi
fi

log "Startup complete! Press Ctrl+C to stop all components"

# If not using terminals, keep the script running to make it easy to Ctrl+C
if [ "$USE_TERMINAL" = false ]; then
    wait
fi 