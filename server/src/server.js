const express = require('express');
const cors = require('cors');
const storageRoutes = require('./routes/storage');
const simulationRoutes = require('./routes/simulation_docker');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json()); // To parse JSON bodies

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    services: {
      frontend: 'http://localhost:3000',
      backend: `http://localhost:${PORT}`,
      simulation: 'docker_auto_spinup'
    }
  });
});

// Register the routes
app.use('/api', storageRoutes);
app.use('/api/simulation', simulationRoutes);

app.listen(PORT, () => {
  console.log(`🚀 XGCS Backend Server running on http://localhost:${PORT}`);
  console.log(`🐳 Using Docker auto-spinup simulation system`);
  console.log(`🔧 Health check: http://localhost:${PORT}/health`);
  console.log(`🎮 Simulation API: http://localhost:${PORT}/api/simulation`);
  console.log(`📦 Containers will be created automatically when starting simulations`);
}); 