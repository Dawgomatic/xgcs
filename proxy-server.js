const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

// Log file
const logFile = path.join(__dirname, 'logs', 'proxy.log');

// Ensure logs directory exists
if (!fs.existsSync(path.join(__dirname, 'logs'))) {
  fs.mkdirSync(path.join(__dirname, 'logs'));
}

// Function to write to log file
function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}\n`;
  fs.appendFileSync(logFile, logMessage);
  console.log(message);
}

// Enable CORS for all routes
app.use(cors());

// Add logging middleware
app.use((req, res, next) => {
  writeLog(`${req.method} ${req.url}`);
  next();
});

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

// Proxy simulation API requests to the Node.js backend (port 5000)
app.use('/api/simulation', createProxyMiddleware({
  target: 'http://localhost:5000/api/simulation',
  changeOrigin: true,
  ws: true,
  logLevel: 'debug',
  onProxyReq: function(proxyReq, req, res) {
    writeLog(`Proxying simulation request: ${req.method} ${req.url} -> http://localhost:5000/api/simulation${req.url}`);
  },
  onProxyRes: function(proxyRes, req, res) {
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, DELETE';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type';
    writeLog(`Simulation proxy response: ${proxyRes.statusCode}`);
  },
  onError: function(err, req, res) {
    writeLog(`Simulation proxy error: ${err.message}`);
    res.writeHead(502, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ 
      error: 'Proxy error', 
      message: 'Failed to connect to simulation backend',
      details: err.message,
      success: false 
    }));
  }
}));

// Proxy all other API requests to the C++ backend
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:8081',
  changeOrigin: true,
  ws: true,
  timeout: 60000,
  proxyTimeout: 60000,
  logLevel: 'debug',
  onProxyReq: function(proxyReq, req, res) {
    writeLog(`[onProxyReq] method=${req.method} url=${req.url}`);
    writeLog(`Proxying API request: ${req.method} ${req.url} -> http://localhost:8081${proxyReq.path}`);
    // Log headers for debugging
    writeLog(`ProxyReq headers: ${JSON.stringify(proxyReq.getHeaders())}`);
    // For POST, set Content-Length and remove Transfer-Encoding
    if (req.method === 'POST') {
      if (req.headers['content-length']) {
        proxyReq.setHeader('Content-Length', req.headers['content-length']);
      }
      proxyReq.removeHeader('Transfer-Encoding');
      writeLog('Patched Content-Length and removed Transfer-Encoding for POST');
    }
  },
  onProxyRes: function(proxyRes, req, res) {
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS, DELETE';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type';
    writeLog(`API proxy response: ${proxyRes.statusCode}`);
  },
  onError: function(err, req, res) {
    writeLog(`API proxy error: ${err.message}`);
    res.writeHead(502, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ 
      error: 'Proxy error', 
      message: 'Failed to connect to backend service at http://localhost:8081',
      details: err.message,
      success: false 
    }));
  }
}));

app.listen(PORT, () => {
  writeLog(`CORS proxy server running on http://localhost:${PORT}`);
  writeLog(`Proxying simulation requests to Node.js backend at http://localhost:5000`);
  writeLog(`Proxying other API requests to C++ backend at http://localhost:8081`);
});

// Catch-all logger for unhandled requests
app.use((req, res, next) => {
  writeLog(`[UNHANDLED] ${req.method} ${req.url}`);
  res.status(404).send('Not found');
}); 