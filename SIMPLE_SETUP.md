# XGCS Simple Setup Guide

## 🚀 One-Command Setup

**Just run this one command:**

```bash
cd xgcs
chmod +x run-simple.sh
./run-simple.sh
```

That's it! This will:
- ✅ Install Docker if needed
- ✅ Set up all dependencies
- ✅ Start the frontend and backend
- ✅ Give you a working simulation system

## 🌐 What You Get

After running the script, you'll have:

- **Frontend:** http://localhost:3000 (React GCS interface)
- **Backend:** http://localhost:5000 (API server)
- **Health Check:** http://localhost:5000/health

## 🎮 Testing the Simulation

1. **Open your browser** to http://localhost:3000
2. **Go to the Simulation tab**
3. **Add a new simulation:**
   - Vehicle Type: `ArduCopter`
   - IP Address: `localhost`
   - Port: `5760`
4. **Click "Start Simulation"**

## 🔧 Troubleshooting

### **If the script fails:**

1. **Check Docker:**
   ```bash
   docker --version
   docker ps
   ```

2. **Restart Docker:**
   ```bash
   sudo systemctl restart docker
   ```

3. **Fix permissions:**
   ```bash
   sudo usermod -aG docker $USER
   newgrp docker
   ```

4. **Run the script again:**
   ```bash
   ./run-simple.sh
   ```

### **If services don't start:**

1. **Check logs:**
   ```bash
   docker-compose logs frontend
   docker-compose logs backend
   ```

2. **Restart services:**
   ```bash
   docker-compose restart
   ```

3. **Rebuild containers:**
   ```bash
   docker-compose build --no-cache
   docker-compose up -d
   ```

## 📋 Useful Commands

```bash
# Check status
docker-compose ps

# View logs
docker-compose logs frontend
docker-compose logs backend

# Restart everything
docker-compose restart

# Stop everything
docker-compose down

# Start everything
docker-compose up -d
```

## 🎯 What This Setup Uses

- **Frontend:** React with Material-UI
- **Backend:** Node.js with Express
- **Simulation:** Fallback system (no complex SITL required)
- **Containers:** Docker for isolation and portability

## 🚨 Important Notes

- **No ArduPilot SITL required** - uses a simpler simulation system
- **Works on any Linux system** with Docker
- **No complex dependencies** - everything is containerized
- **Easy to modify** - all code is in the `client/` and `server/` directories

## 🆘 Still Having Issues?

If you're still getting errors:

1. **Share the exact error message**
2. **Run:** `docker-compose logs` and share the output
3. **Check:** `docker ps` to see if containers are running
4. **Verify:** `curl http://localhost:5000/health` to test the backend

The simulation system is designed to work without complex SITL setups, so it should work reliably on any system with Docker! 