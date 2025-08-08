// @hallucinated
// Development proxy for CRA: split API traffic between control API (8081) and simulation API (3001)
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  // Simulation service (Docker-only per Jeremy's preference)
  app.use(
    ['/api/simulation', '/api/sim', '/simulation'],
    createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,
      logLevel: 'warn',
      ws: true,
    })
  );

  // Main control API served by C++ backend (Crow) on 8081
  app.use(
    ['/api', '/connect', '/disconnect', '/telemetry', '/vehicles', '/connections'],
    createProxyMiddleware({
      target: 'http://localhost:8081',
      changeOrigin: true,
      logLevel: 'warn',
      ws: true,
    })
  );
};


