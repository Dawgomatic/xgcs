# XGCS Simulation Troubleshooting Guide

## Quick Fixes

### 1. **Most Common Error: "Simulation Failed"**
This usually means one of these issues:

#### **A. ArduPilot SITL Not Found**
**Error:** `SITL executable not found for arducopter`

**Solution:**
```bash
# Check if you have ArduPilot built
ls -la ~/Desktop/New\ Folder/ardupilot/ArduCopter/arducopter

# If not found, build ArduPilot SITL
cd ~/Desktop/New\ Folder/ardupilot
./waf configure --board sitl
./waf copter
```

#### **B. Node.js Dependencies Missing**
**Error:** `Cannot find module 'uuid'` or similar

**Solution:**
```bash
cd xgcs/server
npm install
```

#### **C. Port Already in Use**
**Error:** `EADDRINUSE` or port conflicts

**Solution:**
```bash
# Kill processes using port 5760
sudo netstat -tulpn | grep 5760
sudo kill -9 <PID>

# Or restart the system
sudo reboot
```

### 2. **Docker-Based Simulation Issues**

If you prefer Docker (optional):

#### **A. Docker Not Installed**
```bash
sudo apt-get update
sudo apt-get install docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
# Log out and back in
```

#### **B. Docker Permission Issues**
```bash
# Check if user is in docker group
groups $USER

# If not, add to docker group
sudo usermod -aG docker $USER
newgrp docker
```

#### **C. ArduPilot Docker Image Issues**
```bash
# Pull the image manually
docker pull ardupilot/ardupilot-sitl:latest

# Check if image exists
docker images | grep ardupilot
```

## Step-by-Step Debugging

### **Step 1: Run the Debug Script**
```bash
cd xgcs
chmod +x debug_simulation.sh
./debug_simulation.sh
```

### **Step 2: Check Server Logs**
```bash
# Start the server manually to see errors
cd xgcs/server
npm start
```

### **Step 3: Check Browser Console**
1. Open browser developer tools (F12)
2. Go to Console tab
3. Look for red error messages
4. Share the exact error text

### **Step 4: Test SITL Manually**
```bash
# Test if SITL works from command line
cd ~/Desktop/New\ Folder/ardupilot
./ArduCopter/arducopter --model quad --home 37.7749,-122.4194,0,0 --speedup 1
```

## Common Error Messages and Solutions

### **"Cannot find module 'uuid'"**
```bash
cd xgcs/server
npm install uuid
```

### **"SITL executable not found"**
```bash
# Build ArduPilot SITL
cd ~/Desktop/New\ Folder/ardupilot
./waf configure --board sitl
./waf copter
```

### **"EADDRINUSE"**
```bash
# Find and kill the process
sudo netstat -tulpn | grep 5760
sudo kill -9 <PID>
```

### **"Permission denied"**
```bash
# Fix file permissions
chmod +x ~/Desktop/New\ Folder/ardupilot/ArduCopter/arducopter
```

### **"Docker daemon not running"**
```bash
sudo systemctl start docker
sudo systemctl enable docker
```

## Fallback System (Recommended)

The system now uses a **fallback simulation system** that doesn't require Docker:

1. **Uses your existing ArduPilot installation**
2. **No Docker dependencies**
3. **Direct process management**
4. **Better error reporting**

### **To use the fallback system:**
1. Ensure ArduPilot is built: `./waf copter` in ardupilot directory
2. Start the server: `cd xgcs/server && npm start`
3. The system will automatically find your SITL executables

## Getting Help

### **What to share when asking for help:**

1. **Exact error message** from browser console
2. **Server logs** from terminal
3. **Output of debug script**: `./debug_simulation.sh`
4. **ArduPilot build status**: `ls -la ~/Desktop/New\ Folder/ardupilot/ArduCopter/arducopter`

### **Example of good error report:**
```
Error: SITL executable not found for arducopter
Server logs: [SITL abc123] Error: ENOENT: no such file or directory
ArduPilot status: File not found
Debug script output: ❌ ArduPilot SITL image not found
```

## Quick Commands Reference

```bash
# Build ArduPilot SITL
cd ~/Desktop/New\ Folder/ardupilot
./waf configure --board sitl
./waf copter

# Install server dependencies
cd xgcs/server
npm install

# Start server
npm start

# Run debug script
cd xgcs
./debug_simulation.sh

# Check SITL executable
ls -la ~/Desktop/New\ Folder/ardupilot/ArduCopter/arducopter

# Kill processes on port 5760
sudo netstat -tulpn | grep 5760
sudo kill -9 <PID>
```

## Still Having Issues?

If none of the above solutions work:

1. **Share the complete error message**
2. **Run the debug script and share output**
3. **Check if ArduPilot builds successfully**
4. **Verify Node.js and npm versions**

The fallback system should work with your existing ArduPilot installation without requiring Docker. 