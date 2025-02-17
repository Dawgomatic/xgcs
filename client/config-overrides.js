const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  webpack: (config) => {
    // Set CESIUM_BASE_URL to the correct path
    config.plugins = config.plugins || [];
    config.plugins.push(
      new webpack.DefinePlugin({
        CESIUM_BASE_URL: JSON.stringify('/cesium')
      })
    );

    // Copy Cesium Assets
    config.plugins.push(
      new CopyWebpackPlugin({
        patterns: [
          {
            from: 'node_modules/cesium/Build/Cesium/Workers',
            to: 'public/cesium/Workers'
          },
          {
            from: 'node_modules/cesium/Build/Cesium/ThirdParty',
            to: 'public/cesium/ThirdParty'
          },
          {
            from: 'node_modules/cesium/Build/Cesium/Assets',
            to: 'public/cesium/Assets'
          },
          {
            from: 'node_modules/cesium/Build/Cesium/Widgets',
            to: 'public/cesium/Widgets'
          }
        ]
      })
    );

    // Configure loaders for Cesium
    config.module.rules.push({
      test: /\.js$/,
      enforce: 'pre',
      include: path.resolve(__dirname, 'node_modules/cesium/Source'),
      use: [{
        loader: 'strip-pragma-loader',
        options: {
          pragmas: {
            debug: false
          }
        }
      }]
    });

    // Configure webpack to handle Cesium assets
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "url": require.resolve("url"),
      "zlib": require.resolve("browserify-zlib"),
      "http": require.resolve("stream-http"),
      "https": require.resolve("https-browserify"),
      "stream": require.resolve("stream-browserify"),
    };

    return config;
  }
}; 