# XGCS Scripts Guide

This directory contains the essential scripts for running XGCS (X Ground Control Station).

## 🚀 Main Scripts

### `start.sh` - Unified Startup Script
**Main script for starting XGCS with all features.**

```bash
./start.sh                    # Normal startup
./start.sh --help            # Show all options
./start.sh --debug           # Debug mode with detailed logs
./start.sh --logging         # Enable file logging
./start.sh --frontend-only   # Start only frontend
./start.sh --restart         # Restart all components
```

**Features:**
- Starts React frontend (port 3000)
- Starts C++ backend server (port 8081)
- Starts proxy server
- Process management and cleanup
- Lock file protection
- Comprehensive logging options

### `run-simple.sh` - Simple Docker Setup
**One-command Docker-based setup for quick testing.**

```bash
./run-simple.sh
```

**Features:**
- Installs dependencies automatically
- Pulls Docker images
- Starts frontend and backend containers
- Perfect for testing and development

### `quick-fix.sh` - Emergency Fixes
**Fixes common issues with one command.**

```bash
./quick-fix.sh
```

**Fixes:**
- Docker Compose installation issues
- Permission problems
- Port conflicts
- Missing dependencies
- YAML syntax errors

## 🧹 Maintenance

### `cleanup-scripts.sh` - Script Cleanup
**Removes unnecessary scripts and organizes the directory.**

```bash
./cleanup-scripts.sh
```

## 📚 Documentation

- `README.md` - Main project documentation
- `DOCKER_README.md` - Docker setup guide
- `DOCKER_AUTO_SPINUP.md` - Docker simulation system
- `SIMPLE_SETUP.md` - Quick setup guide
- `STARTUP_GUIDE.md` - Detailed startup instructions
- `SIMULATION_README.md` - Simulation system guide
- `SIMULATION_TROUBLESHOOTING.md` - Common simulation issues

## 🎯 Quick Start

1. **First time setup:**
   ```bash
   ./quick-fix.sh
   ```

2. **Normal startup:**
   ```bash
   ./start.sh
   ```

3. **Simple Docker setup:**
   ```bash
   ./run-simple.sh
   ```

4. **Debug mode:**
   ```bash
   ./start.sh --debug
   ```

## 🔧 Troubleshooting

If you encounter issues:

1. Run `./quick-fix.sh` to fix common problems
2. Check logs in the `logs/` directory
3. Use `./start.sh --debug` for detailed logging
4. Consult the troubleshooting documentation

## 📁 Directory Structure

```
xgcs/
├── start.sh              # Main startup script
├── run-simple.sh         # Simple Docker setup
├── quick-fix.sh          # Emergency fixes
├── cleanup-scripts.sh    # Script cleanup
├── docker-compose.yml    # Docker configuration
├── client/               # React frontend
├── server/               # Node.js backend
├── logs/                 # Log files
└── docs/                 # Documentation
```

## 🎉 Happy Flying!

Your XGCS directory is now clean and organized with only the essential scripts you need! 