#!/bin/bash

echo "🚀 XGCS Simple Setup - One Command Solution"
echo "==========================================="
echo ""

# Make scripts executable
chmod +x *.sh

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Error: Please run this script from the xgcs directory"
    exit 1
fi

# Check which docker compose command to use
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    echo "❌ Error: docker-compose not found. Installing..."
    sudo apt-get update
    sudo apt-get install -y docker-compose-plugin
    DOCKER_COMPOSE="docker compose"
fi

echo "Using: $DOCKER_COMPOSE"

# Install Docker if needed
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    sudo apt-get update
    sudo apt-get install -y docker.io docker-compose-plugin
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker $USER
    echo "✅ Docker installed! Please log out and back in, then run this script again."
    exit 0
fi

# Start Docker if not running
if ! docker info &> /dev/null; then
    echo "🔧 Starting Docker..."
    sudo systemctl start docker
fi

# Fix Docker permissions
if ! docker ps &> /dev/null; then
    echo "🔧 Fixing Docker permissions..."
    sudo usermod -aG docker $USER
    newgrp docker
fi

echo "✅ Docker is ready!"

# Stop any existing containers
echo "🛑 Stopping existing containers..."
$DOCKER_COMPOSE down 2>/dev/null || true
docker stop $(docker ps -q) 2>/dev/null || true

# Clean up
echo "🧹 Cleaning up..."
docker system prune -f

# Install dependencies
echo "📦 Installing dependencies..."
cd server && npm install && cd ..
cd client && npm install && cd ..

# Pull images
echo "⬇️  Pulling Docker images..."
docker pull node:18-alpine
docker pull ubuntu:22.04

# Build containers
echo "🔨 Building containers..."
$DOCKER_COMPOSE build --no-cache

# Start services
echo "🚀 Starting XGCS services..."
$DOCKER_COMPOSE up -d frontend backend

# Wait for services
echo "⏳ Waiting for services to start..."
sleep 15

# Check status
echo ""
echo "📊 Service Status:"
$DOCKER_COMPOSE ps

echo ""
echo "🌐 XGCS is now running!"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:5000"
echo "   Health:   http://localhost:5000/health"

echo ""
echo "🎮 To test the simulation:"
echo "1. Open http://localhost:3000"
echo "2. Go to the Simulation tab"
echo "3. Add a new simulation:"
echo "   - Vehicle Type: ArduCopter"
echo "   - IP Address: localhost"
echo "   - Port: 5760"
echo "4. Click 'Start Simulation'"

echo ""
echo "📋 Useful commands:"
echo "   $DOCKER_COMPOSE logs frontend  # View frontend logs"
echo "   $DOCKER_COMPOSE logs backend   # View backend logs"
echo "   $DOCKER_COMPOSE restart        # Restart services"
echo "   $DOCKER_COMPOSE down           # Stop everything"

echo ""
echo "🎉 Setup complete! Happy flying! 🛩️" 