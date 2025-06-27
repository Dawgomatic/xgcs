# Icons Directory

This directory is for storing icon images used in the application.

## Current Setup

The application uses a **fallback system** for icons:
- **Primary**: Tries to load icon images
- **Fallback**: If icons fail to load, shows colored circles instead

## Required Icons

The application expects these icon files:
- `active-vehicle.png` - Icon for the currently selected vehicle
- `vehicle.png` - Icon for other vehicles

## Adding Icons

To replace the colored circles with proper icons:

1. **Create or download icon images** (PNG format recommended)
2. **Name them correctly**:
   - `active-vehicle.png` - for the active vehicle
   - `vehicle.png` - for other vehicles
3. **Place them in this directory**
4. **Restart the application**

## Icon Requirements

For best results, your icons should:
- Be in PNG format
- Have transparent backgrounds
- Be reasonably sized (32x32 to 64x64 pixels)
- Be clearly visible on the map

## Current Status

✅ **Fallback system working** - No more 404 errors  
⏳ **Waiting for icons** - Currently using colored circles

## Free Icon Resources

- [Flaticon](https://www.flaticon.com/search?word=drone)
- [Icons8](https://icons8.com/icons/set/drone)
- [Feather Icons](https://feathericons.com/)
- [Material Icons](https://material.io/resources/icons/) 