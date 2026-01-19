// @hallucinated
// Development proxy for CRA: route all API calls to proxy server
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  console.log('[setupProxy] Loading proxy configuration...');
  
  // Route ALL API calls to the proxy server
  app.use('/api', createProxyMiddleware({
    target: 'http://localhost:3001',
    changeOrigin: true,
    logLevel: 'debug',
    pathRewrite: {
      '^/api': '/api' // Keep the /api prefix
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log(`[setupProxy] Proxying ${req.method} ${req.url} -> http://localhost:3001${req.url}`);
    },
    onProxyRes: (proxyRes, req, res) => {
      console.log(`[setupProxy] Response: ${proxyRes.statusCode} for ${req.url}`);
    },
    onError: (err, req, res) => {
      console.error(`[setupProxy] Error proxying ${req.url}:`, err.message);
    }
  }));
  
  console.log('[setupProxy] Proxy configuration loaded successfully');
};


