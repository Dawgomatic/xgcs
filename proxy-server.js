const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use(cors());

// Proxy all requests to the C++ backend
app.use('/', createProxyMiddleware({
  target: 'http://localhost:8081',
  changeOrigin: true,
  ws: true,  // Enable WebSocket proxying
  onProxyRes: function(proxyRes, req, res) {
    // Add CORS headers to the proxied response
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
}));

// Update the /connections endpoint to include model information
app.get('/connections', (req, res) => {
    try {
        const connections = [];
        // ... existing code to get connections
        
        // Make sure to include modelUrl and modelScale in the response
        connections.forEach(conn => {
            conn.modelUrl = conn.modelUrl || '';
            conn.modelScale = conn.modelScale || 1.0;
        });
        
        res.json({ connections });
    } catch (error) {
        console.error('Error getting connections:', error);
        res.status(500).json({ error: 'Failed to get connections' });
    }
});

// Update the /add-connection endpoint to accept model information
app.post('/add-connection', (req, res) => {
    const { id, type, port, baudRate, host, tcpPort, modelUrl, modelScale } = req.body;
    
    try {
        // Call the C++ function with the new parameters
        const result = addon.addConnection(id, type, port, baudRate, host, tcpPort, modelUrl, modelScale);
        // ... rest of the function
    } catch (error) {
        console.error('Error adding connection:', error);
        res.status(500).json({ error: 'Failed to add connection' });
    }
});

app.listen(PORT, () => {
  console.log(`CORS proxy server running on http://localhost:${PORT}`);
}); 