# 3D Models Directory

This directory is for storing 3D models used in the application.

## Current Setup

The application currently uses a **fallback system**:
- **Primary**: Tries to load `/models/drone.glb` as a 3D model
- **Fallback**: If the model fails to load, it shows a simple colored box primitive
- **Icons**: Tries to load `/icons/active-vehicle.png` and `/icons/vehicle.png`
- **Icon Fallback**: If icons fail, shows colored circles instead

## Adding a Proper 3D Drone Model

To replace the placeholder with a real 3D drone model:

1. **Download a drone model** in glTF (.gltf) or Binary glTF (.glb) format
2. **Rename it to `drone.glb`** and place it in this directory
3. **Restart the application** - it will automatically use the new model

## Supported Formats

- glTF (.gltf)
- Binary glTF (.glb) - **Recommended**
- COLLADA (.dae)
- OBJ (.obj)

## Free 3D Model Resources

- [Sketchfab](https://sketchfab.com/3d-models?features=downloadable&sort_by=-likeCount&q=drone)
- [TurboSquid](https://www.turbosquid.com/Search/3D-Models/free/drone)
- [CGTrader](https://www.cgtrader.com/free-3d-models?keywords=drone)
- [Poly Pizza](https://poly.pizza/) - Search for "drone"

## Model Requirements

For best results, your drone model should:
- Be in glTF (.glb) format
- Have a reasonable size (not too large or small)
- Be oriented correctly (upward-facing)
- Have proper materials/textures

## Current Status

✅ **Fallback system working** - No more 404 errors  
⏳ **Waiting for 3D model** - Currently using box primitives  
⏳ **Waiting for icons** - Currently using colored circles

## Adding Models

1. Download a 3D model in one of the supported formats
2. Place it in this directory
3. Use the full URL path in the application:
   - For local development: `http://localhost:3000/models/your-model.glb`
   - For production: `/models/your-model.glb`

## Default Models

If you don't have a model, the application will use a default model from Cesium's asset server. 