# XGCS Architecture Plan: Building a Scalable QGroundControl Replacement

## Overview

XGCS aims to be a modern, web-based ground control station that replaces QGroundControl (QGC) with improved scalability, modularity, and cross-platform support. This document outlines the architecture and implementation plan to achieve feature parity with QGC while maintaining clean separation of concerns.

## Core Architecture Principles

### 1. **Microservices Architecture**
- **Frontend**: React-based web application
- **Backend**: Node.js/Express API server with WebSocket support
- **MAVLink Service**: Dedicated service for MAVLink protocol handling
- **SITL Service**: Docker-based simulation management
- **Storage Service**: Configuration and mission persistence

### 2. **Protocol-First Design**
- All vehicle communication through standardized MAVLink 2.0
- WebSocket bridge for real-time telemetry streaming
- REST API for configuration and mission management
- gRPC for inter-service communication (future)

### 3. **Scalability Requirements**
- Support multiple simultaneous vehicle connections
- Handle both SITL simulations and real hardware
- Distributed architecture for fleet management
- Cloud-ready deployment options

## Implementation Phases

### Phase 1: MAVLink Integration (Current Priority)
**Goal**: Establish robust MAVLink communication layer

#### 1.1 MAVLink Service Architecture
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  React Frontend │────▶│ WebSocket Bridge │────▶│ MAVLink Service │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                           │
                                ┌──────────────────────────┴────────────┐
                                │                                       │
                          ┌─────▼─────┐                          ┌─────▼─────┐
                          │   SITL    │                          │   Real    │
                          │ Vehicles  │                          │ Hardware  │
                          └───────────┘                          └───────────┘
```

#### 1.2 Implementation Tasks
- [ ] Create dedicated MAVLink service using MAVSDK-JavaScript or node-mavlink
- [ ] Implement connection manager for UDP/TCP/Serial links
- [ ] Add MAVLink message routing and filtering
- [ ] Create WebSocket bridge for real-time telemetry
- [ ] Implement heartbeat management and connection monitoring

### Phase 2: Core Vehicle Management
**Goal**: Match QGC's vehicle management capabilities

#### 2.1 Vehicle State Management
```javascript
// Vehicle state structure
interface VehicleState {
  id: number;
  systemId: number;
  componentId: number;
  type: MAV_TYPE;
  autopilot: MAV_AUTOPILOT;
  
  // Connection
  links: LinkInterface[];
  primaryLink: LinkInterface;
  lastHeartbeat: Date;
  
  // Telemetry
  armed: boolean;
  flightMode: string;
  position: GeoPosition;
  attitude: Attitude;
  battery: BatteryState;
  
  // Mission
  missionManager: MissionManager;
  currentMissionIndex: number;
  
  // Parameters
  parameters: Map<string, Parameter>;
  
  // Logs
  logEntries: LogEntry[];
}
```

#### 2.2 Implementation Tasks
- [ ] Port Vehicle class architecture from QGC
- [ ] Implement multi-vehicle management
- [ ] Add telemetry streaming and recording
- [ ] Create parameter management system
- [ ] Implement flight mode handling

### Phase 3: Mission Planning
**Goal**: Full mission planning and execution capabilities

#### 3.1 Mission Architecture
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Mission Editor  │────▶│ Mission Manager  │────▶│ MAVLink Protocol│
│   (Frontend)    │     │    (Backend)     │     │   (PlanManager) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                         │
         │                       │                         │
    ┌────▼─────┐          ┌─────▼──────┐          ┌──────▼──────┐
    │   Map    │          │  Mission   │          │   Vehicle   │
    │ Display  │          │   Items    │          │  Execution  │
    └──────────┘          └────────────┘          └─────────────┘
```

#### 3.2 Implementation Tasks
- [ ] Create mission item data models
- [ ] Implement PlanManager for mission upload/download
- [ ] Add waypoint editing UI
- [ ] Support complex mission items (surveys, corridors)
- [ ] Implement geofence and rally point management

### Phase 4: Advanced Features
**Goal**: Achieve feature parity with QGC

#### 4.1 Feature Set
- **Video Streaming**: GStreamer integration for FPV
- **Joystick Support**: WebGamepad API integration
- **Log Analysis**: MAVLink log parsing and visualization
- **Firmware Updates**: ArduPilot/PX4 firmware management
- **Radio Configuration**: RC calibration and setup
- **Custom Widgets**: Extensible instrument panel

#### 4.2 Implementation Tasks
- [ ] Integrate video streaming pipeline
- [ ] Add joystick/gamepad support
- [ ] Create log analysis tools
- [ ] Implement firmware update system
- [ ] Add sensor calibration workflows

## Technical Implementation Details

### Backend Services Structure

```
xgcs/
├── server/
│   ├── src/
│   │   ├── services/
│   │   │   ├── mavlink/
│   │   │   │   ├── MavlinkService.js
│   │   │   │   ├── ConnectionManager.js
│   │   │   │   ├── MessageRouter.js
│   │   │   │   └── ProtocolHandler.js
│   │   │   ├── vehicle/
│   │   │   │   ├── VehicleManager.js
│   │   │   │   ├── TelemetryStream.js
│   │   │   │   └── ParameterManager.js
│   │   │   ├── mission/
│   │   │   │   ├── MissionManager.js
│   │   │   │   ├── PlanManager.js
│   │   │   │   └── MissionItems.js
│   │   │   └── simulation/
│   │   │       └── SimulationManager.js
│   │   ├── routes/
│   │   │   ├── connection.js
│   │   │   ├── vehicle.js
│   │   │   ├── mission.js
│   │   │   └── telemetry.js
│   │   └── server.js
│   └── package.json
```

### Frontend Component Structure

```
client/
├── src/
│   ├── components/
│   │   ├── vehicle/
│   │   │   ├── VehicleList.jsx
│   │   │   ├── VehicleStatus.jsx
│   │   │   └── TelemetryDisplay.jsx
│   │   ├── mission/
│   │   │   ├── MissionEditor.jsx
│   │   │   ├── WaypointList.jsx
│   │   │   └── MissionMap.jsx
│   │   ├── flight/
│   │   │   ├── PrimaryFlightDisplay.jsx
│   │   │   ├── AttitudeIndicator.jsx
│   │   │   └── CompassRose.jsx
│   │   └── common/
│   │       ├── Map.jsx
│   │       └── VideoStream.jsx
│   ├── services/
│   │   ├── MAVLinkService.js
│   │   ├── VehicleService.js
│   │   └── MissionService.js
│   └── App.jsx
```

## Migration Strategy from QGC

### 1. Core Systems to Port
1. **LinkManager**: Connection management
2. **MAVLinkProtocol**: Message handling
3. **Vehicle**: State and control
4. **MissionManager**: Mission planning
5. **ParameterManager**: Configuration

### 2. Code Adaptation Pattern
```javascript
// QGC C++ Pattern
class LinkManager : public QGCTool {
    Q_OBJECT
public:
    void createConnectedLink(SharedLinkConfigurationPtr& config);
    // ...
};

// XGCS JavaScript Pattern
class LinkManager {
  constructor() {
    this.links = new Map();
    this.eventEmitter = new EventEmitter();
  }
  
  async createConnectedLink(config) {
    const link = await this.createLink(config);
    await link.connect();
    this.links.set(config.id, link);
    this.emit('linkConnected', link);
    return link;
  }
}
```

### 3. Data Flow Architecture

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│   Browser   │ ────▶│   Backend    │ ────▶│   MAVLink    │
│  (React)    │ WS   │  (Node.js)   │ UDP  │  (Vehicle)   │
└─────────────┘      └──────────────┘      └──────────────┘
      │                     │                      │
      │                     │                      │
   State               REST API              Binary Protocol
   Management          WebSocket             MAVLink 2.0
```

## Development Priorities

### Immediate (Week 1-2)
1. Implement MAVLink service with MAVSDK integration
2. Create connection manager for real vehicles
3. Add telemetry streaming over WebSocket
4. Update connections tab to show real telemetry

### Short Term (Week 3-4)
1. Port mission management from QGC
2. Add parameter read/write capabilities
3. Implement flight mode changes
4. Create basic flight instruments

### Medium Term (Month 2)
1. Add video streaming support
2. Implement joystick control
3. Create mission planning UI
4. Add multi-vehicle support

### Long Term (Month 3+)
1. Log analysis tools
2. Firmware management
3. Advanced mission planning
4. Cloud deployment options

## Testing Strategy

### 1. Unit Tests
- MAVLink message parsing
- Connection management
- Mission item validation

### 2. Integration Tests
- SITL vehicle connections
- Mission upload/download
- Parameter synchronization

### 3. End-to-End Tests
- Complete mission workflow
- Multi-vehicle scenarios
- Failover handling

## Performance Considerations

### 1. Message Throughput
- Target: 1000+ messages/second per vehicle
- WebSocket compression for telemetry
- Message filtering and decimation

### 2. Scalability
- Horizontal scaling for multiple vehicles
- Redis for session management
- Message queue for async operations

### 3. Resource Usage
- Lazy loading of UI components
- Telemetry data pagination
- Efficient map tile caching

## Security Considerations

### 1. Authentication
- JWT-based authentication
- Role-based access control
- Vehicle-specific permissions

### 2. Communication
- TLS for web connections
- MAVLink signing support
- Encrypted parameter storage

## Conclusion

This architecture plan provides a roadmap for transforming XGCS into a production-ready QGroundControl replacement. The modular design allows incremental development while maintaining compatibility with existing MAVLink ecosystems.

The key to success is maintaining clean separation between:
- Protocol handling (MAVLink)
- Business logic (Vehicle/Mission management)
- User interface (React components)
- Persistence (Configuration/Logs)

By following this architecture, XGCS can scale from single-vehicle hobbyist use to enterprise fleet management while maintaining code quality and performance. 