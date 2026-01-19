# XGCS System Architecture

## Overview

XGCS is a modern, web-based ground control station built with a client-server architecture. The system enables real-time control and monitoring of UAVs through a browser-based interface.

---

## High-Level Architecture

```mermaid
graph TB
    subgraph "Client Browser"
        UI[React Frontend]
        Cesium[Cesium 3D Map]
        WS[WebSocket Client]
        Video[Video Player]
    end
    
    subgraph "XGCS Server"
        API[Crow HTTP Server]
        WSS[WebSocket Server]
        CM[Connection Manager]
        VM[Video Manager]
        LM[Log Manager]
    end
    
    subgraph "MAVLink Layer"
        MAVSDK[MAVSDK Library]
        Telem[Telemetry Plugin]
        Mission[Mission Plugin]
        Pass[Passthrough Plugin]
    end
    
    subgraph "Vehicle/SITL"
        AP[ArduPilot/PX4]
        MAV[MAVLink Protocol]
    end
    
    UI --> API
    UI --> WS
    UI --> Video
    Cesium --> UI
    
    API --> CM
    WSS --> CM
    CM --> VM
    CM --> LM
    
    CM --> MAVSDK
    MAVSDK --> Telem
    MAVSDK --> Mission
    MAVSDK --> Pass
    
    Telem --> MAV
    Mission --> MAV
    Pass --> MAV
    
    MAV --> AP
    
    VM -.Video Stream.-> Video
```

---

## Component Architecture

### 1. Frontend (React Application)

```mermaid
graph LR
    subgraph "Pages"
        FD[FlightDisplay]
        MP[MissionPlanning]
        VC[VehicleConnections]
        Settings[Settings]
    end
    
    subgraph "Components"
        FM[FlightMap]
        IP[InstrumentPanel]
        MS[MissionSidebar]
        WL[WaypointList]
        VP[VideoPanel]
    end
    
    subgraph "Context/State"
        TC[TelemetryContext]
        MC[MissionContext]
        VC2[VehicleContext]
    end
    
    subgraph "Utils"
        SP[SurveyPattern]
        CS[CorridorScan]
        SS[StructureScan]
        LA[LinkAnalysis]
    end
    
    FD --> FM
    FD --> IP
    FD --> VP
    MP --> MS
    MP --> WL
    
    FM --> TC
    IP --> TC
    MS --> MC
    
    SP --> MS
    CS --> MS
    SS --> MS
    LA --> MS
```

#### Key Frontend Components

**FlightDisplay.jsx**
- Main flight interface
- Integrates map, instruments, video, and controls
- Manages drawing modes and mission editing
- Handles vehicle selection

**FlightMap.jsx**
- Cesium-based 3D map rendering
- Vehicle position tracking
- Waypoint visualization
- Geofence and rally point display
- Drawing tools for mission planning

**InstrumentPanel.jsx**
- Real-time flight instruments
- Artificial horizon
- Compass rose
- Telemetry displays (altitude, speed, battery)
- Radio signal strength widget

**MissionSidebar.jsx**
- Mission planning controls
- Waypoint list management
- Survey/scan pattern generators
- Link budget analysis tool
- Geofence editor

---

### 2. Backend (C++ Server)

```mermaid
graph TB
    subgraph "HTTP Layer"
        Crow[Crow HTTP Server]
        Routes[REST API Routes]
    end
    
    subgraph "Core Managers"
        CM[Connection Manager]
        VM[Video Manager]
        LM[Log File Manager]
        TL[TLog Recorder]
    end
    
    subgraph "MAVSDK Integration"
        Sys[System Management]
        Tel[Telemetry Streaming]
        Mis[Mission Upload/Download]
        Geo[Geofence Management]
        MP[MAVLink Passthrough]
    end
    
    subgraph "Data Storage"
        Redis[(Redis Cache)]
        Files[(File System)]
        TLogs[(TLog Files)]
    end
    
    Crow --> Routes
    Routes --> CM
    Routes --> VM
    Routes --> LM
    
    CM --> Sys
    CM --> Tel
    CM --> Mis
    CM --> Geo
    CM --> MP
    CM --> TL
    
    Tel -.Cache.-> Redis
    TL --> TLogs
    LM --> Files
```

#### Key Backend Components

**ConnectionManager**
- Vehicle connection lifecycle management
- MAVSDK plugin initialization
- Telemetry data aggregation
- MAVLink message handling
- Radio status tracking and simulation

**VideoManager**
- GStreamer pipeline management
- UDP video reception
- WebRTC streaming to browser
- Multiple stream support

**LogFileManager**
- DataFlash log download from vehicle
- Log file organization
- Download progress tracking

**TLogRecorder**
- Real-time MAVLink message recording
- Session management
- TLog file generation

---

## Data Flow

### Telemetry Data Flow

```mermaid
sequenceDiagram
    participant V as Vehicle
    participant M as MAVSDK
    participant CM as Connection Manager
    participant WS as WebSocket
    participant UI as React UI
    
    V->>M: MAVLink Messages (UDP)
    M->>CM: Telemetry Callbacks
    CM->>CM: Aggregate Data
    CM->>WS: JSON Telemetry Stream
    WS->>UI: WebSocket Message
    UI->>UI: Update State
    UI->>UI: Render Components
```

### Mission Upload Flow

```mermaid
sequenceDiagram
    participant UI as React UI
    participant API as REST API
    participant CM as Connection Manager
    participant MR as Mission Raw Plugin
    participant V as Vehicle
    
    UI->>API: POST /mission/upload
    API->>CM: upload_mission()
    CM->>CM: Convert to MAVLink Items
    CM->>MR: upload_mission()
    MR->>V: MISSION_COUNT
    V->>MR: MISSION_REQUEST
    MR->>V: MISSION_ITEM_INT
    V->>MR: MISSION_ACK
    MR->>CM: Result
    CM->>API: Success/Failure
    API->>UI: HTTP Response
```

### Video Streaming Flow

```mermaid
sequenceDiagram
    participant V as Vehicle
    participant GS as GStreamer Pipeline
    participant VM as Video Manager
    participant WR as WebRTC
    participant UI as Browser
    
    V->>GS: H.264 Stream (UDP:5600)
    GS->>GS: Decode & Process
    GS->>VM: Video Frames
    VM->>WR: Encode for WebRTC
    WR->>UI: WebRTC Stream
    UI->>UI: Render Video
```

---

## Technology Stack

### Frontend Technologies

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Framework** | React 18 | UI framework |
| **UI Library** | Material-UI v5 | Component library |
| **3D Maps** | Cesium | Geospatial visualization |
| **State Management** | React Context | Global state |
| **HTTP Client** | Fetch API | REST API calls |
| **WebSocket** | Native WebSocket | Real-time data |
| **Build Tool** | Create React App | Development tooling |

### Backend Technologies

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Language** | C++17 | Core backend |
| **HTTP Server** | Crow | REST API server |
| **MAVLink** | MAVSDK | Vehicle communication |
| **Video** | GStreamer | Video processing |
| **JSON** | nlohmann/json | Data serialization |
| **Build System** | CMake | Build management |

---

## Communication Protocols

### REST API Endpoints

```
Vehicle Management:
  POST   /connect              - Connect to vehicle
  POST   /disconnect           - Disconnect from vehicle
  GET    /vehicles             - List connected vehicles
  GET    /telemetry            - Get telemetry snapshot
  GET    /telemetry/all        - Get all vehicles telemetry

Mission Management:
  POST   /mission/upload       - Upload mission to vehicle
  GET    /api/mission/download/:id - Download mission from vehicle
  POST   /mission/start        - Start mission execution
  POST   /mission/clear        - Clear mission

Flight Control:
  POST   /api/command/takeoff  - Takeoff command
  POST   /api/command/land     - Land command
  POST   /api/command/rtl      - Return to launch
  POST   /api/command/arm      - Arm motors
  POST   /api/command/disarm   - Disarm motors
  POST   /api/command/set_mode - Change flight mode

Geofencing:
  POST   /api/geofence/upload  - Upload geofence
  POST   /api/geofence/clear   - Clear geofence

Rally Points:
  POST   /api/rally/upload     - Upload rally points

Calibration:
  POST   /api/calibration/compass/start
  POST   /api/calibration/compass/cancel
  POST   /api/calibration/accelerometer/start
  GET    /api/calibration/:id/status

Logs:
  GET    /api/logs/list        - List available logs
  POST   /api/logs/download/:id - Download log file
  GET    /api/sessions         - List TLog sessions
  GET    /api/sessions/download/:id - Download TLog

Video:
  POST   /api/video/start      - Start video stream
  POST   /api/video/stop       - Stop video stream
  GET    /api/video/status     - Video stream status

Simulation:
  POST   /api/simulation/radio - Configure radio simulation
```

### WebSocket Protocol

**Connection**: `ws://localhost:8081/api/mavlink/stream/:vehicleId`

**Message Format**:
```json
{
  "msgName": "ATTITUDE",
  "msgId": 30,
  "timestamp": 1642534567890,
  "system_id": 1,
  "component_id": 1,
  "fields": {
    "roll": 0.05,
    "pitch": -0.02,
    "yaw": 1.57
  }
}
```

---

## Deployment Architecture

### Development Environment

```mermaid
graph TB
    subgraph "Developer Machine"
        subgraph "Terminal 1"
            React[npm start<br/>Port 3000]
        end
        
        subgraph "Terminal 2"
            Server[./server<br/>Port 8081]
        end
        
        subgraph "Terminal 3"
            SITL[sim_vehicle.py<br/>Port 14550]
        end
        
        Browser[Browser<br/>localhost:3000]
    end
    
    Browser --> React
    React --> Server
    Server --> SITL
```

### Docker Deployment

```mermaid
graph TB
    subgraph "Docker Compose"
        subgraph "Frontend Container"
            React[React Dev Server<br/>Port 3000]
        end
        
        subgraph "Backend Container"
            Server[C++ Server<br/>Port 8081]
        end
        
        subgraph "SITL Container"
            ArduPilot[ArduPilot SITL<br/>Port 14550]
        end
    end
    
    Client[Web Browser] --> React
    React --> Server
    Server --> ArduPilot
```

### Production Deployment

```mermaid
graph TB
    subgraph "Cloud Infrastructure"
        LB[Load Balancer<br/>HTTPS]
        
        subgraph "Web Tier"
            Nginx[Nginx<br/>Static Files]
        end
        
        subgraph "Application Tier"
            App1[XGCS Server 1]
            App2[XGCS Server 2]
        end
        
        subgraph "Data Tier"
            Redis[(Redis Cache)]
            Storage[(File Storage)]
        end
    end
    
    Users[Users] --> LB
    LB --> Nginx
    LB --> App1
    LB --> App2
    
    App1 --> Redis
    App2 --> Redis
    App1 --> Storage
    App2 --> Storage
```

---

## Security Architecture

### Authentication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant A as Auth Service
    participant B as Backend
    
    U->>F: Login Request
    F->>A: Authenticate
    A->>F: JWT Token
    F->>F: Store Token
    F->>B: API Request + JWT
    B->>B: Validate Token
    B->>F: Response
```

### Security Layers

1. **Transport Security**
   - HTTPS/WSS for all communications
   - TLS 1.3 encryption

2. **Authentication**
   - JWT token-based authentication
   - Session management
   - Token refresh mechanism

3. **Authorization**
   - Role-based access control (RBAC)
   - Vehicle-level permissions
   - Operation-level permissions

4. **Input Validation**
   - Server-side validation
   - SQL injection prevention
   - XSS protection

---

## Scalability Considerations

### Horizontal Scaling

- **Stateless Backend**: Each server instance is independent
- **Load Balancing**: Distribute requests across multiple servers
- **Session Affinity**: WebSocket connections sticky to server instance

### Vertical Scaling

- **Multi-threading**: Parallel telemetry processing
- **Connection Pooling**: Efficient resource utilization
- **Caching**: Redis for frequently accessed data

### Performance Targets

| Metric | Target |
|--------|--------|
| Telemetry Latency | < 100ms |
| API Response Time | < 50ms |
| WebSocket Throughput | 1000+ msg/sec |
| Concurrent Vehicles | 100+ per server |
| Concurrent Users | 1000+ per server |

---

## Data Models

### Telemetry Data Structure

```json
{
  "vehicle_id": "1",
  "timestamp": 1642534567890,
  "position": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "altitude_msl": 150.5,
    "altitude_rel": 50.0
  },
  "attitude": {
    "roll": 0.05,
    "pitch": -0.02,
    "yaw": 1.57
  },
  "velocity": {
    "north": 5.2,
    "east": -1.3,
    "down": -0.5
  },
  "battery": {
    "voltage": 12.6,
    "current": 15.3,
    "remaining": 75
  },
  "gps": {
    "fix_type": 3,
    "satellites": 12
  },
  "flight_mode": "AUTO",
  "armed": true,
  "radio": {
    "rssi": -65,
    "remrssi": -68,
    "noise": -95,
    "snr": 30
  }
}
```

### Mission Item Structure

```json
{
  "seq": 0,
  "frame": 3,
  "command": 16,
  "current": 0,
  "autocontinue": 1,
  "param1": 0,
  "param2": 0,
  "param3": 0,
  "param4": 0,
  "x": 37.7749,
  "y": -122.4194,
  "z": 50.0,
  "mission_type": 0
}
```

---

## Error Handling

### Error Propagation

```mermaid
graph LR
    V[Vehicle Error] --> M[MAVSDK]
    M --> CM[Connection Manager]
    CM --> API[REST API]
    API --> UI[Frontend]
    UI --> User[User Notification]
```

### Error Categories

1. **Connection Errors**
   - Vehicle unreachable
   - Network timeout
   - Protocol mismatch

2. **Command Errors**
   - Command rejected
   - Invalid parameters
   - Vehicle not ready

3. **Mission Errors**
   - Upload failed
   - Invalid waypoints
   - Mission too large

4. **System Errors**
   - Out of memory
   - Disk full
   - Service unavailable

---

## Monitoring & Logging

### Logging Architecture

```mermaid
graph LR
    subgraph "Application"
        Frontend[Frontend Logs]
        Backend[Backend Logs]
        MAVSDK[MAVSDK Logs]
    end
    
    subgraph "Aggregation"
        Collector[Log Collector]
    end
    
    subgraph "Storage"
        Files[(Log Files)]
        DB[(Log Database)]
    end
    
    Frontend --> Collector
    Backend --> Collector
    MAVSDK --> Collector
    
    Collector --> Files
    Collector --> DB
```

### Metrics Collection

- **Telemetry Metrics**: Message rate, latency
- **API Metrics**: Request count, response time
- **System Metrics**: CPU, memory, disk usage
- **Business Metrics**: Active vehicles, missions executed

---

## Future Architecture Enhancements

### Planned Improvements

1. **Microservices Architecture**
   - Separate services for telemetry, mission, video
   - Independent scaling
   - Service mesh integration

2. **Event-Driven Architecture**
   - Message queue (RabbitMQ/Kafka)
   - Asynchronous processing
   - Event sourcing

3. **Cloud-Native Features**
   - Kubernetes deployment
   - Auto-scaling
   - Service discovery
   - Health checks

4. **Advanced Analytics**
   - Real-time analytics pipeline
   - Machine learning integration
   - Predictive maintenance

---

## Conclusion

XGCS is built on a modern, scalable architecture that separates concerns between presentation (React), business logic (C++ backend), and vehicle communication (MAVSDK). This design enables:

- **Flexibility**: Easy to add new features
- **Scalability**: Support for multiple vehicles and users
- **Maintainability**: Clear separation of concerns
- **Performance**: Optimized for real-time operations
- **Reliability**: Robust error handling and recovery