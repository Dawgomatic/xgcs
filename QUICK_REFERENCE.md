# XGCS Quick Reference

## Essential Commands

### Start/Stop Services
```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# Restart services
docker compose restart

# View logs
docker compose logs -f
```

### Simulation Management

#### Create Simulation (API)
```bash
curl -X POST http://localhost:5000/api/simulation/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Drone",
    "vehicleType": "arducopter",
    "frameType": "quad",
    "homeLocation": {"lat": 37.7749, "lng": -122.4194, "alt": 100}
  }'
```

#### List Simulations
```bash
curl http://localhost:5000/api/simulation/list
```

#### Start/Stop Simulation
```bash
# Start
curl -X POST http://localhost:5000/api/simulation/{ID}/start

# Stop
curl -X POST http://localhost:5000/api/simulation/{ID}/stop
```

### Docker Commands

#### Container Management
```bash
# List SITL containers
docker ps | grep sitl

# View container logs
docker logs sitl-XXXXXXXX

# Stop all SITL containers
docker stop $(docker ps -q --filter "name=sitl-")

# Remove all SITL containers
docker rm $(docker ps -aq --filter "name=sitl-")
```

#### Resource Monitoring
```bash
# View resource usage
docker stats

# Inspect container
docker inspect sitl-XXXXXXXX
```

### Troubleshooting

#### Backend Issues
```bash
# Check backend logs
docker compose logs backend --tail=50

# Restart backend
docker compose restart backend

# Check health
curl http://localhost:5000/health
```

#### Frontend Issues
```bash
# Check frontend logs
docker compose logs frontend

# Rebuild frontend
docker compose build frontend
docker compose up -d frontend
```

#### Port Issues
```bash
# Check used ports
netstat -tulpn | grep -E "576[0-9]|577[0-9]"

# Find process using port
lsof -i :5760
```

### Development

#### Native Mode
```bash
# Start frontend only
./start.sh --frontend-only

# Start with debugging
./start.sh --debug

# Start with logging
./start.sh --logging
```

#### Building Images
```bash
# Build SITL image
cd ardupilot
./build_sitl_docker.sh ArduPilot-4.6

# Build backend
cd server
docker build -t xgcs-backend:latest .

# Build frontend
cd client
docker build -t xgcs-frontend:latest .
```

### File Locations

| File | Purpose |
|------|---------|
| `server/simulations.json` | Persistent simulation data |
| `docker-compose.yml` | Service configuration |
| `server/src/routes/simulation_docker.js` | Simulation API logic |
| `client/src/pages/Simulation.jsx` | Simulation UI |

### Common Operations

#### Clean Everything
```bash
# Stop all services
docker compose down

# Remove all SITL containers
docker rm -f $(docker ps -aq --filter "name=sitl-")

# Clear simulation data
rm server/simulations.json

# Restart fresh
docker compose up -d
```

#### Backup Simulations
```bash
# Backup
cp server/simulations.json server/simulations.backup.json

# Restore
cp server/simulations.backup.json server/simulations.json
docker compose restart backend
```

#### Connect External GCS
```bash
# Mission Planner
Connection Type: TCP
Host: localhost
Port: [simulation port, e.g., 5760]

# MAVProxy
mavproxy.py --master=tcp:localhost:5760

# QGroundControl
Add TCP connection to localhost:[port]
```

### Environment Variables

```bash
# Frontend
REACT_APP_API_URL=http://localhost:5000

# Backend
NODE_ENV=development
PORT=5000

# SITL Container
SITL_INSTANCE=0
VEHICLE_TYPE=arducopter
FRAME_TYPE=quad
SPEEDUP=1.0
HOME_LOCATION=37.7749,-122.4194,100,0
```

### Useful Aliases

Add to your `.bashrc` or `.zshrc`:

```bash
alias xgcs-up='cd ~/Desktop/gcs_project/xgcs && docker compose up -d'
alias xgcs-down='cd ~/Desktop/gcs_project/xgcs && docker compose down'
alias xgcs-logs='cd ~/Desktop/gcs_project/xgcs && docker compose logs -f'
alias xgcs-status='cd ~/Desktop/gcs_project/xgcs && docker compose ps'
alias xgcs-clean='cd ~/Desktop/gcs_project/xgcs && docker rm -f $(docker ps -aq --filter "name=sitl-")'
``` 