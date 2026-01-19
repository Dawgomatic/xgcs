# XGCS Quick Start Guide

## Running XGCS

### Option 1: Quick Start Script (Recommended)

The easiest way to run XGCS:

```bash
./scripts/start.sh
```

This will:
1. Build the C++ backend (if needed)
2. Start the backend server on port 8081
3. Start the React frontend on port 3000
4. Open your browser to http://localhost:3000

### Option 2: Manual Start

If you prefer to run components separately:

#### Terminal 1 - Backend Server
```bash
cd server/build
cmake ..
make -j4
./server
```

#### Terminal 2 - Frontend
```bash
cd client
npm start
```

Then open http://localhost:3000 in your browser.

### Option 3: Docker (Coming Soon)

```bash
docker-compose up
```

---

## Connecting to a Vehicle

### With SITL (Simulated Vehicle) - **Recommended for Testing**

**No need to manually start SITL!** XGCS has built-in simulation management:

#### In XGCS Web Interface:
1. Open http://localhost:3000
2. Click **"Simulation"** tab in the sidebar
3. Click **"Create New Simulation"**
4. Configure your simulation:
   - **Vehicle Type**: ArduCopter, ArduPlane, ArduRover, or ArduSub
   - **Vehicle ID**: 1 (or any unique number)
   - **Instance**: 0 (for first vehicle)
5. Click **"Start Simulation"**

The UI will:
- Spin up a Docker container with ArduPilot SITL
- Automatically configure MAVLink ports
- Show simulation status (Starting → Running)

6. Once status shows **"Running"**, go to **"Connections"** tab
7. Click **"Connect"** next to your simulation
8. Vehicle appears on map with live telemetry! ✅

**Multiple Vehicles**: Repeat steps 3-7 with different Vehicle IDs to simulate a fleet.

### Manual SITL (Alternative Method)

If you prefer to run SITL manually outside Docker:

#### Terminal - Start SITL
```bash
cd ardupilot/ArduCopter
sim_vehicle.py -v ArduCopter --console --map
```

#### In XGCS:
1. Click **"Connections"** tab
2. Click **"Add Connection"**
3. Enter: `udp://:14550`
4. Click **Connect**

### With Real Hardware

1. Connect your vehicle via:
   - USB cable
   - Telemetry radio (e.g., SiK radio)
   - WiFi/Network connection

2. Find your connection port:
   ```bash
   # Linux
   ls /dev/ttyUSB* /dev/ttyACM*
   
   # macOS
   ls /dev/tty.usb*
   ```

3. In XGCS, connect with:
   - **Serial**: `serial:///dev/ttyUSB0:57600`
   - **UDP**: `udp://:14550`
   - **TCP**: `tcp://192.168.1.100:5760`

---

## First Flight (SITL)

Once connected to SITL:

1. **Arm the Vehicle**
   - Click the **ARM** button
   - Wait for "Armed" status

2. **Takeoff**
   - Click **TAKEOFF** button
   - Vehicle will climb to default altitude (10m)

3. **Create a Mission**
   - Click **"Plan"** tab in sidebar
   - Click on map to add waypoints
   - Click **"Upload Mission"**
   - Click **"Start Mission"**

4. **Monitor Flight**
   - Watch vehicle on 3D map
   - Check instruments for altitude, speed, battery
   - View telemetry data

5. **Return to Launch**
   - Click **RTL** button
   - Vehicle returns to home position

6. **Land**
   - Click **LAND** button (or wait for auto-land)

---

## Troubleshooting

### Backend won't start
```bash
# Rebuild backend
cd server
rm -rf build
mkdir build && cd build
cmake ..
make -j4
./server
```

### Frontend won't start
```bash
# Clear cache and reinstall
cd client
rm -rf node_modules package-lock.json
npm install
npm start
```

### Can't connect to vehicle
- Check connection string format
- Verify vehicle is powered on
- Check firewall settings
- For SITL: ensure `sim_vehicle.py` is running
- Check backend logs for errors

### Video not working
```bash
# Start video stream manually
curl -X POST http://localhost:8081/api/video/start \
  -H "Content-Type: application/json" \
  -d '{"udp_port": 5600, "http_port": 8082}'
```

---

## Development Mode

### Hot Reload (Frontend)
The frontend automatically reloads when you edit files in `client/src/`

### Backend Development
After changing C++ code:
```bash
cd server/build
make -j4
./server  # Restart server
```

### Viewing Logs
```bash
# Backend logs
tail -f logs/backend.log

# Frontend logs
tail -f logs/frontend.log
```

---

## Stopping XGCS

### Using Script
```bash
./scripts/stop.sh
```

### Manual Stop
- Press `Ctrl+C` in each terminal running a component
- Or: `pkill -f "npm start"` and `pkill -f server`

---

## Next Steps

- **[User Guide](docs/USER_GUIDE.md)** - Learn all features
- **[Architecture](docs/ARCHITECTURE.md)** - Understand the system
- **[Development Guide](docs/DEVELOPMENT.md)** - Contribute to XGCS

---

## Common Connection Strings

| Type | Format | Example |
|------|--------|---------|
| **Serial** | `serial://PORT:BAUD` | `serial:///dev/ttyUSB0:57600` |
| **UDP** | `udp://[IP]:PORT` | `udp://:14550` |
| **TCP** | `tcp://IP:PORT` | `tcp://192.168.1.100:5760` |
| **SITL** | `udp://:14550` | `udp://:14550` |

---

**Happy Flying! 🚁**
