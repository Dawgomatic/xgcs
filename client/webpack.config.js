const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  // ... other webpack config ...
  plugins: [
    // ... other plugins ...
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'node_modules/cesium/Build/Cesium',
          to: 'cesium'
        }
      ]
    }),
    new webpack.DefinePlugin({
      CESIUM_BASE_URL: JSON.stringify('/cesium')
    })
  ]
}; 