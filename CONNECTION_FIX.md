# XGCS Connection Issue - Fixed!

## Problem
When trying to connect to a simulation vehicle, you were getting the error:
> "Please run ./start.sh or ./build_cpp_backend.sh"

But running those scripts didn't resolve the issue.

## Root Cause
The problem was in the API routing between the frontend and C++ backend:

1. **Frontend** was trying to connect to `/api/connect` (port 3001)
2. **Proxy server** was incomplete and not properly forwarding requests
3. **C++ backend** only had `/connect` endpoint (port 8081)
4. Multiple confusing startup scripts existed

## Solution
I've fixed the following:

### 1. Fixed Proxy Server (`proxy-server.js`)
- Added proper API routing with `/api` prefix removal
- Added specific handlers for `/connect`, `/disconnect`, `/telemetry`, `/connections`
- Added proper error handling and CORS headers
- Installed `node-fetch@2` for HTTP requests

### 2. Created Unified Startup Script (`start.sh`)
- **One script to rule them all!** 🎉
- Automatically detects available dependencies (Docker vs Native)
- Handles both Docker and Native modes seamlessly
- Properly builds C++ backend if needed
- Starts all services in correct order
- Provides clear status and log information

### 3. Created Unified Stop Script (`stop.sh`)
- Stops all services regardless of startup mode
- Handles both Docker containers and native processes
- Cleans up processes properly

## How to Use

### Start XGCS (Unified):
```bash
./start.sh
```

The script will automatically:
- Detect if Docker or Node.js/Yarn is available
- Ask you to choose mode if both are available
- Start all services in the appropriate mode

### Force Specific Mode:
```bash
./start.sh --docker    # Force Docker mode
./start.sh --native    # Force Native mode
```

### Stop XGCS:
```bash
./stop.sh
```

## Service Architecture
```
Frontend (port 3000) 
    ↓ (API calls to /api/*)
Proxy Server (port 3001)
    ↓ (forwards to C++ backend)
C++ Backend (port 8081)
    ↓ (MAVSDK connections)
Vehicle/Simulation
```

## Testing Connection
1. Start XGCS: `./start.sh`
2. Go to http://localhost:3000
3. Create a simulation in the Simulation tab
4. Connect to it in the Connections tab

The connection should now work properly!

## Troubleshooting
- Check logs: `tail -f logs/*.log`
- Verify services: `netstat -tlnp | grep -E "(3000|3001|8081)"`
- Test API: `curl http://localhost:3001/health`

## What Changed
- ❌ Removed: `start_all.sh`, `start_native.sh`, `stop_native.sh`, `start`, `stop`
- ✅ Added: Unified `start.sh` and `stop.sh` scripts
- 🎯 Result: One simple way to start and stop XGCS! 