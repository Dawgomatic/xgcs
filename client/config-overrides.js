const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = function override(config, env) {
  // Add plugins
  if (!config.plugins) {
    config.plugins = [];
  }

  config.plugins.push(
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'node_modules/cesium/Build/Cesium/Workers'),
          to: 'cesium/Workers'
        },
        {
          from: path.resolve(__dirname, 'node_modules/cesium/Build/Cesium/ThirdParty'),
          to: 'cesium/ThirdParty'
        },
        {
          from: path.resolve(__dirname, 'node_modules/cesium/Build/Cesium/Assets'),
          to: 'cesium/Assets'
        },
        {
          from: path.resolve(__dirname, 'node_modules/cesium/Build/Cesium/Widgets'),
          to: 'cesium/Widgets'
        }
      ]
    }),
    new webpack.DefinePlugin({
      CESIUM_BASE_URL: JSON.stringify('/cesium')
    })
  );

  // SWE100821: Add proxy configuration for API calls
  if (env === 'development') {
    config.devServer = {
      ...config.devServer,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          logLevel: 'debug',
          onProxyReq: (proxyReq, req, res) => {
            console.log(`[config-overrides] Proxying ${req.method} ${req.url} -> http://localhost:3001${req.url}`);
          },
          onProxyRes: (proxyRes, req, res) => {
            console.log(`[config-overrides] Response: ${proxyRes.statusCode} for ${req.url}`);
          },
          onError: (err, req, res) => {
            console.error(`[config-overrides] Error proxying ${req.url}:`, err.message);
          }
        }
      }
    };
  }

  return config;
}; 