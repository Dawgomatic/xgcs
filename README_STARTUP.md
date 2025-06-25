# XGCS - Quick Start Guide

## 🚀 Start XGCS

Simply run:
```bash
./start.sh
```

The script will automatically:
- Detect your available dependencies (Docker or Node.js/Yarn)
- Ask you to choose a mode if both are available
- Start all services in the appropriate mode
- Open your browser to http://localhost:3000

## 🛑 Stop XGCS

Simply run:
```bash
./stop.sh
```

This stops all services regardless of how they were started.

## 🔧 Available Modes

### Docker Mode (Recommended for Production)
- Uses Docker containers
- Requires: Docker and Docker Compose
- Command: `./start.sh --docker`

### Native Mode (Recommended for Development)
- Runs services directly on your system
- Requires: Node.js and Yarn
- Command: `./start.sh --native`

## 📋 Prerequisites

### For Docker Mode:
- Docker
- Docker Compose

### For Native Mode:
- Node.js (v16+)
- Yarn
- CMake (for C++ backend)

## 🔍 Troubleshooting

### Check if services are running:
```bash
netstat -tlnp | grep -E "(3000|3001|8081)"
```

### View logs:
```bash
tail -f logs/*.log
```

### Test API:
```bash
curl http://localhost:3001/health
```

## 🎯 Next Steps

1. Go to http://localhost:3000
2. Create a simulation in the Simulation tab
3. Connect to it in the Connections tab

That's it! 🎉 