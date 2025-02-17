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

  return config;
}; 