const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 3010;

app.use('/api', createProxyMiddleware({
  target: 'http://localhost:8081',
  changeOrigin: true,
  ws: true,
  logLevel: 'debug',
}));

app.listen(PORT, () => {
  console.log(`Mini proxy running on http://localhost:${PORT}`);
}); 