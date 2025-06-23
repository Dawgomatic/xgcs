#!/bin/bash

echo "🚀 Quick Fix for XGCS"
echo "===================="
echo ""

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Error: Please run this script from the xgcs directory"
    exit 1
fi

# Make all scripts executable
chmod +x *.sh

echo "1. Installing Docker Compose..."
./install-docker-compose.sh

echo ""
echo "2. Detecting Docker Compose command..."
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
    echo "✅ Using: docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
    echo "✅ Using: docker compose"
else
    echo "❌ Docker Compose still not found. Trying manual installation..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    DOCKER_COMPOSE="docker-compose"
    echo "✅ Using: docker-compose (manually installed)"
fi

echo ""
echo "3. Testing Docker Compose..."
$DOCKER_COMPOSE version

echo ""
echo "4. Stopping everything..."
$DOCKER_COMPOSE down 2>/dev/null || true
docker stop $(docker ps -q) 2>/dev/null || true

echo ""
echo "5. Installing dependencies..."
cd server && npm install && cd ..
cd client && npm install && cd ..

echo ""
echo "6. Building and starting services..."
$DOCKER_COMPOSE build --no-cache
$DOCKER_COMPOSE up -d frontend backend

echo ""
echo "7. Waiting for services..."
sleep 20

echo ""
echo "8. Testing everything..."
if curl -s http://localhost:5000/health > /dev/null; then
    echo "✅ Backend is working"
else
    echo "❌ Backend not working, checking logs..."
    $DOCKER_COMPOSE logs backend
    echo ""
    echo "🔍 Container status:"
    $DOCKER_COMPOSE ps
    exit 1
fi

if curl -s http://localhost:5000/api/simulation/list > /dev/null; then
    echo "✅ Simulation API is working"
else
    echo "❌ Simulation API not working"
    exit 1
fi

echo ""
echo "🎉 Everything is working!"
echo ""
echo "📊 Status:"
$DOCKER_COMPOSE ps

echo ""
echo "🌐 XGCS is ready:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:5000"
echo ""
echo "🎮 Test the simulation:"
echo "1. Open http://localhost:3000"
echo "2. Go to Simulation tab"
echo "3. Add a simulation and click Start"
echo ""
echo "✅ Quick fix completed!" 