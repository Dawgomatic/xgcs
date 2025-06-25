# XGCS Architecture Overview

## System Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web Browser   │────▶│  React Frontend │────▶│  Backend API    │
│                 │     │   (Port 3000)   │     │  (Port 5000)    │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                          │
                                ┌─────────────────────────┼─────────────────────────┐
                                │                         │                         │
                        ┌───────▼────────┐     ┌─────────▼────────┐     ┌─────────▼────────┐
                        │ SITL Container │     │ SITL Container   │     │ SITL Container   │
                        │ (ArduCopter)   │     │ (ArduPlane)      │     │ (ArduRover)      │
                        │ Port: 5760     │     │ Port: 5764       │     │ Port: 5768       │
                        └────────────────┘     └──────────────────┘     └──────────────────┘
```

## Components

### Frontend (React)
- **Technology**: React 18, Material-UI, Cesium
- **Location**: `/client`
- **Purpose**: User interface and visualization
- **Key Features**:
  - Real-time telemetry display
  - 3D world visualization
  - Mission planning interface
  - Simulation management UI

### Backend API (Node.js)
- **Technology**: Node.js, Express
- **Location**: `/server`
- **Port**: 5000
- **Purpose**: API server and simulation orchestration
- **Key Features**:
  - RESTful API endpoints
  - Docker container management
  - Simulation persistence
  - Port allocation

### SITL Containers (Docker)
- **Technology**: Docker, ArduPilot SITL
- **Image**: `xgcs-ardupilot-sitl:latest`
- **Purpose**: Isolated simulation environments
- **Features**:
  - Multiple vehicle types
  - Automatic port assignment
  - Resource isolation

## Data Flow

### Simulation Creation
```
User → Frontend → POST /api/simulation/create → Backend
                                                   ↓
                                              Create Record
                                                   ↓
                                              Save to JSON
                                                   ↓
                                              Return Response
```

### Simulation Start
```
User → Frontend → POST /api/simulation/{id}/start → Backend
                                                      ↓
                                                 Docker Create
                                                      ↓
                                                 Port Allocation
                                                      ↓
                                                 Container Start
                                                      ↓
                                                 Update State
```

## Key Design Decisions

### 1. File-Based Persistence
- **File**: `server/simulations.json`
- **Why**: Simple, portable, no database required
- **Trade-offs**: Limited concurrent access, size limitations
- **Future**: Can migrate to PostgreSQL/MongoDB

### 2. Docker Container Per Simulation
- **Benefits**:
  - Complete isolation
  - Easy cleanup
  - Resource limits
  - Consistent environment
- **Costs**: Higher resource usage than native processes

### 3. Automatic Port Management
- **Algorithm**: 
  1. Check in-memory simulations
  2. Scan Docker containers
  3. Find next available port
- **Range**: Starting from 5760, increment by 4

### 4. State Reconciliation
- **On Startup**:
  1. Load simulations from file
  2. Scan Docker containers
  3. Match and update states
  4. Detect orphaned containers

## API Endpoints

### Simulation Management
- `POST /api/simulation/create` - Create new simulation
- `GET /api/simulation/list` - List all simulations
- `POST /api/simulation/:id/start` - Start simulation
- `POST /api/simulation/:id/stop` - Stop simulation
- `GET /api/simulation/:id/status` - Get status
- `GET /api/simulation/:id/logs` - Get logs
- `DELETE /api/simulation/:id` - Delete simulation

### Response Format
```json
{
  "success": true,
  "simulation": {
    "id": "uuid",
    "name": "string",
    "vehicleType": "arducopter|arduplane|ardurover|ardusub",
    "port": 5760,
    "status": "created|starting|running|stopping|stopped|error",
    "containerId": "docker-container-id"
  }
}
```

## Docker Configuration

### Network
- **Name**: `xgcs_xgcs-network`
- **Type**: Bridge
- **Purpose**: Container communication

### Container Naming
- **Format**: `sitl-{simulation-id-prefix}`
- **Example**: `sitl-5d8a3702`

### Port Mapping
```
Host Port → Container Port
5760      → 5760 (MAVLink)
5761      → 5761 (MAVLink2)
5762      → 5762 (MAVLink3)
5763      → 5763 (MAVLink4)
```

## Scalability Considerations

### Current Limits
- **Simulations**: ~100s (file-based storage)
- **Concurrent**: ~20-50 (depends on hardware)
- **Port Range**: 5760-6000 (60 simulations)

### Scaling Path
1. **Phase 1** (Current): File-based, single server
2. **Phase 2**: Add Redis cache, increase port range
3. **Phase 3**: PostgreSQL, distributed backends
4. **Phase 4**: Kubernetes orchestration

## Development Modes

### Docker Mode (Production)
```bash
docker compose up -d
```
- Frontend container → Backend container → SITL containers
- Persistent across restarts
- Isolated environment

### Native Mode (Development)
```bash
./start.sh
```
- Frontend (yarn) → C++ Backend → No SITL
- Faster iteration
- Direct debugging

## Security Considerations

### Current State
- No authentication
- Local access only
- Docker socket exposure

### Production Recommendations
1. Add authentication layer
2. Use HTTPS/TLS
3. Restrict Docker socket access
4. Network isolation
5. Resource quotas

## Monitoring and Debugging

### Logs
- **Application**: `docker compose logs`
- **Simulations**: `docker logs sitl-XXXX`
- **Persistence**: `server/simulations.json`

### Health Checks
- **Backend**: `GET /health`
- **Docker**: `docker ps`
- **Ports**: `netstat -tulpn | grep 57`

### Debug Tools
- Frontend: React DevTools
- Backend: Node.js debugger
- Docker: `docker stats`, `docker inspect`

## Future Enhancements

### Planned Features
1. **WebSocket Support**: Real-time telemetry
2. **Multi-user**: User accounts and permissions
3. **Cloud Deployment**: AWS/GCP support
4. **Hardware Support**: Serial/UDP connections
5. **Recording**: Flight data recording/playback

### Architecture Evolution
1. **Microservices**: Split monolithic backend
2. **Message Queue**: RabbitMQ/Kafka for events
3. **Time Series DB**: InfluxDB for telemetry
4. **Container Orchestration**: Kubernetes 