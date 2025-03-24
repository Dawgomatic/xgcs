# 3D Models Directory

This directory is for storing 3D models used in the application.

## Supported Formats

- glTF (.gltf)
- Binary glTF (.glb)
- COLLADA (.dae)
- OBJ (.obj)

## Free 3D Model Resources

- [Sketchfab](https://sketchfab.com/3d-models?features=downloadable&sort_by=-likeCount)
- [TurboSquid](https://www.turbosquid.com/Search/3D-Models/free)
- [CGTrader](https://www.cgtrader.com/free-3d-models)
- [Poly Pizza](https://poly.pizza/)

## Adding Models

1. Download a 3D model in one of the supported formats
2. Place it in this directory
3. Use the full URL path in the application:
   - For local development: `http://localhost:3000/models/your-model.glb`
   - For production: `/models/your-model.glb`

## Default Models

If you don't have a model, the application will use a default model from Cesium's asset server. 