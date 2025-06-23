# XGCS Unified Startup Script

The `start.sh` script has been unified to combine all previous shell scripts (`start.sh`, `debug_start.sh`, `simple_debug.sh`, `restart_frontend.sh`) into a single, feature-rich startup script.

## Usage

```bash
./start.sh [options]
```

## Options

| Flag | Long Flag | Description |
|------|-----------|-------------|
| `-h` | `--help` | Show help message |
| `-t` | `--terminal` | Start each component in a new terminal window |
| `-v` | `--verbose` | Show verbose output |
| `-l` | `--logging` | Enable logging to files (default: `logs/*.log`) |
| `-d` | `--debug` | Enable debug mode with comprehensive logging |
| `-f` | `--frontend-only` | Start only the frontend (useful for development) |
| `-r` | `--restart` | Restart all components (kill existing first) |

## Examples

### Normal startup
```bash
./start.sh
```

### With file logging
```bash
./start.sh --logging
```

### Debug mode with detailed logs
```bash
./start.sh --debug
```

### Start only frontend (for development)
```bash
./start.sh --frontend-only
```

### Restart all components
```bash
./start.sh --restart
```

### Combine flags
```bash
./start.sh --debug --restart
./start.sh -d -r -f  # Debug, restart, frontend-only
```

## Components Started

1. **React Frontend Client** (port 3000)
2. **C++ Backend Server** (port 8081) - unless `--frontend-only` is used
3. **Proxy Server** - unless `--frontend-only` is used

## Log Files

When using `--logging` or `--debug`:

- **Normal logging**: `logs/frontend.log`, `logs/backend.log`, `logs/proxy.log`
- **Debug logging**: `logs/frontend_debug.log`, `logs/backend_debug.log`, `logs/proxy_debug.log`
- **Startup log**: `logs/startup.log`

## Features

- **Process Management**: Automatically kills existing processes before starting
- **Dependency Checking**: Verifies required tools (yarn, node, cmake) are installed
- **Server Building**: Automatically builds the C++ server if needed
- **Cache Clearing**: Clears React cache when restarting or in frontend-only mode
- **Terminal Support**: Can start components in separate terminal windows
- **Signal Handling**: Proper cleanup on Ctrl+C
- **Browser Opening**: Automatically opens browser to frontend URL

## Migration from Old Scripts

| Old Script | New Command |
|------------|-------------|
| `./start.sh` | `./start.sh` |
| `./debug_start.sh` | `./start.sh --debug` |
| `./simple_debug.sh` | `./start.sh --logging` |
| `./restart_frontend.sh` | `./start.sh --frontend-only --restart` |

## Troubleshooting

### Port conflicts
The script automatically kills processes on ports 3000 and 8081. If you still have issues:
```bash
./start.sh --restart
```

### Frontend compilation errors
Clear cache and restart:
```bash
./start.sh --frontend-only --restart
```

### Debug compilation issues
Use debug mode for detailed logs:
```bash
./start.sh --debug --restart
```

### View logs in real-time
```bash
tail -f logs/frontend.log
tail -f logs/backend.log
tail -f logs/proxy.log
``` 