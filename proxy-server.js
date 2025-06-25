const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Add logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Proxy simulation API requests to the Node.js backend (port 5000)
app.use('/api/simulation', createProxyMiddleware({
  target: 'http://localhost:5000',
  changeOrigin: true,
  ws: true,  // Enable WebSocket proxying
  onProxyReq: function(proxyReq, req, res) {
    console.log(`Proxying simulation request: ${req.method} ${req.url} -> http://localhost:5000${proxyReq.path}`);
  },
  onProxyRes: function(proxyRes, req, res) {
    // Add CORS headers to the proxied response
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, DELETE';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type';
    console.log(`Simulation proxy response: ${proxyRes.statusCode}`);
  },
  onError: function(err, req, res) {
    console.error(`Simulation proxy error: ${err.message}`);
    res.status(500).json({ error: 'Proxy error', details: err.message });
  }
}));

// Proxy all other API requests to the C++ backend (remove /api prefix)
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:8081',
  changeOrigin: true,
  pathRewrite: {
    '^/api': '', // Remove /api prefix when forwarding to C++ backend
  },
  ws: true,  // Enable WebSocket proxying
  onProxyReq: function(proxyReq, req, res) {
    console.log(`Proxying API request: ${req.method} ${req.url} -> http://localhost:8081${proxyReq.path}`);
  },
  onProxyRes: function(proxyRes, req, res) {
    // Add CORS headers to the proxied response
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type';
    console.log(`API proxy response: ${proxyRes.statusCode}`);
  },
  onError: function(err, req, res) {
    console.error(`API proxy error: ${err.message}`);
    res.status(500).json({ error: 'Proxy error', details: err.message });
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        services: {
            frontend: 'http://localhost:3000',
            proxy: `http://localhost:${PORT}`,
            cpp_backend: 'http://localhost:8081',
            node_backend: 'http://localhost:5000'
        }
    });
});

app.listen(PORT, () => {
  console.log(`CORS proxy server running on http://localhost:${PORT}`);
  console.log(`Proxying simulation requests to Node.js backend at http://localhost:5000`);
  console.log(`Proxying other API requests to C++ backend at http://localhost:8081`);
}); 