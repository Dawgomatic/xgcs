import React, { useEffect, useRef, useState } from 'react';
import { Box, Paper, Typography, IconButton, Chip, Button, Switch, FormControlLabel, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { 
  MyLocation, 
  CenterFocusStrong, 
  ZoomIn, 
  ZoomOut,
  Layers,
  Satellite,
  Terrain,
  Visibility,
  VisibilityOff,
  Settings,
  ViewInAr,
  ViewModule,
  ViewComfy
} from '@mui/icons-material';
import * as Cesium from 'cesium';

const FlightMap = () => {
  const cesiumContainer = useRef(null);
  const viewerRef = useRef(null);
  const [mapType, setMapType] = useState('osm');
  const [showTerrain, setShowTerrain] = useState(false);
  const [showGlobe, setShowGlobe] = useState(true);
  const [showAtmosphere, setShowAtmosphere] = useState(true);
  const [showFog, setShowFog] = useState(true);
  const [showSkyBox, setShowSkyBox] = useState(true);
  const [showSun, setShowSun] = useState(true);
  const [showMoon, setShowMoon] = useState(true);
  const [showStars, setShowStars] = useState(true);
  const [sceneMode, setSceneMode] = useState('3D');

  useEffect(() => {
    if (!cesiumContainer.current) return;

    console.log('Starting Cesium initialization with full configuration...');

    // Create a comprehensive Cesium viewer with all options
      const viewer = new Cesium.Viewer(cesiumContainer.current, {
      baseLayerPicker: false, // We'll create our own
      geocoder: false,
      homeButton: false,
      sceneModePicker: false, // We'll create our own
        navigationHelpButton: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
      scene3DOnly: false, // Allow 2D and 2.5D modes
        shouldAnimate: true
      });

    console.log('Comprehensive viewer created');

    // Store viewer reference
      viewerRef.current = viewer;

    // Set up initial imagery
    setupImagery(viewer, mapType);

    // Set up terrain
    setupTerrain(viewer, showTerrain);

    // Configure globe settings
    configureGlobe(viewer);

      // Set initial camera position
      viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(0, 0, 10000000),
        orientation: {
          heading: 0.0,
          pitch: -Cesium.Math.PI_OVER_TWO,
          roll: 0.0
        }
      });

    console.log('Cesium viewer fully configured');

    // Cleanup
    return () => {
      if (viewer) {
        viewer.destroy();
      }
    };
  }, []);

  // Setup imagery based on map type
  const setupImagery = (viewer, type) => {
    try {
      console.log('Setting up imagery for type:', type);
      viewer.imageryLayers.removeAll();
      
      switch (type) {
        case 'osm':
          const osmImagery = new Cesium.OpenStreetMapImageryProvider({
            url: 'https://a.tile.openstreetmap.org/'
          });
          viewer.imageryLayers.addImageryProvider(osmImagery);
          console.log('OpenStreetMap imagery added');
          break;
          
        case 'bing':
          try {
            const bingImagery = new Cesium.BingMapsImageryProvider({
              url: 'https://dev.virtualearth.net',
              key: 'AqTGBsziZHIJYYxgivLBf0hVdrAk9mWO5cQcb8Yux8sW5M8c8opEC2lZqKR1ZZXf',
              subdomains: ['t0', 't1', 't2', 't3']
            });
            viewer.imageryLayers.addImageryProvider(bingImagery);
            console.log('Bing Maps imagery added');
          } catch (bingError) {
            console.log('Bing Maps failed, using fallback:', bingError.message);
            const fallbackImagery = new Cesium.OpenStreetMapImageryProvider({
              url: 'https://b.tile.openstreetmap.org/'
            });
            viewer.imageryLayers.addImageryProvider(fallbackImagery);
            console.log('Bing fallback imagery added');
          }
          break;
          
        case 'satellite':
          // Try Cesium World Imagery if token is available
          const hasToken = !!localStorage.getItem('cesiumIonKey');
          console.log('Satellite setup - hasToken:', hasToken);
          if (hasToken) {
            console.log('Token value for satellite:', localStorage.getItem('cesiumIonKey'));
                          try {
                console.log('Attempting to use Cesium World Imagery...');
                const ionImagery = new Cesium.IonImageryProvider({
                  assetId: 2 // Cesium World Imagery
                });
                viewer.imageryLayers.addImageryProvider(ionImagery);
                console.log('Cesium World Imagery added successfully');
              } catch (error) {
                console.log('Cesium World Imagery failed with error:', error.message);
                console.log('Falling back to OpenStreetMap satellite-style...');
                
                // Use a different OpenStreetMap subdomain for satellite-like appearance
                const satelliteImagery = new Cesium.OpenStreetMapImageryProvider({
                  url: 'https://c.tile.openstreetmap.org/'
                });
                const satelliteLayer = viewer.imageryLayers.addImageryProvider(satelliteImagery);
                console.log('OpenStreetMap satellite-style imagery added successfully');
                
                // Force the layer to be visible and opaque
                satelliteLayer.show = true;
                satelliteLayer.alpha = 1.0;
                console.log('Satellite layer visibility forced to true, alpha set to 1.0');
                
                // Debug imagery layer status
                setTimeout(() => {
                  console.log('=== IMAGERY LAYER DEBUG ===');
                  console.log('Number of imagery layers:', viewer.imageryLayers.length);
                  for (let i = 0; i < viewer.imageryLayers.length; i++) {
                    const layer = viewer.imageryLayers.get(i);
                    console.log(`Layer ${i}:`, {
                      visible: layer.show,
                      alpha: layer.alpha,
                      provider: layer.imageryProvider.constructor.name
                    });
                  }
                  console.log('=== END DEBUG ===');
                  
                  // Adjust camera to ensure we're looking at the globe properly
                  viewer.camera.setView({
                    destination: Cesium.Cartesian3.fromDegrees(-75.0, 40.0, 1000000),
                    orientation: {
                      heading: Cesium.Math.toRadians(0.0),
                      pitch: Cesium.Math.toRadians(-45.0),
                      roll: 0.0
                    }
                  });
                  console.log('Camera adjusted for satellite view');
                }, 1000);
              }
          } else {
            console.log('No token available, using OpenStreetMap satellite-style...');
            
            // Use a different OpenStreetMap subdomain for satellite-like appearance
            const satelliteImagery = new Cesium.OpenStreetMapImageryProvider({
              url: 'https://c.tile.openstreetmap.org/'
            });
            const satelliteLayer = viewer.imageryLayers.addImageryProvider(satelliteImagery);
            console.log('OpenStreetMap satellite-style imagery added successfully');
            
            // Force the layer to be visible and opaque
            satelliteLayer.show = true;
            satelliteLayer.alpha = 1.0;
            console.log('Satellite layer visibility forced to true, alpha set to 1.0');
          }
          break;
          
        case 'terrain':
          // Add terrain-focused imagery with different URL
          const terrainImagery = new Cesium.OpenStreetMapImageryProvider({
            url: 'https://d.tile.openstreetmap.org/'
          });
          viewer.imageryLayers.addImageryProvider(terrainImagery);
          
          // Add a simple color overlay to make it visually distinct
          try {
            const colorOverlay = new Cesium.SingleTileImageryProvider({
              url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
              rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
              tileWidth: 1,
              tileHeight: 1
            });
            const colorLayer = viewer.imageryLayers.addImageryProvider(colorOverlay);
            colorLayer.alpha = 0.3; // Make it semi-transparent
            console.log('Terrain-focused imagery with color overlay added');
          } catch (overlayError) {
            console.log('Color overlay failed, terrain imagery only');
          }
          break;
          
        default:
          const defaultImagery = new Cesium.OpenStreetMapImageryProvider({
            url: 'https://a.tile.openstreetmap.org/'
          });
          viewer.imageryLayers.addImageryProvider(defaultImagery);
          console.log('Default OpenStreetMap imagery added');
      }
    } catch (error) {
      console.error('Error setting up imagery:', error);
    }
  };

  // Setup terrain
  const setupTerrain = (viewer, enabled) => {
    try {
      console.log('Setting up terrain, enabled:', enabled);
      const hasToken = !!localStorage.getItem('cesiumIonKey');
      console.log('Has token:', hasToken);
      if (hasToken) {
        console.log('Token value:', localStorage.getItem('cesiumIonKey'));
      }
      
      if (enabled) {
        if (hasToken) {
          try {
            console.log('Attempting to use World Terrain with token...');
            viewer.terrainProvider = Cesium.Terrain.fromWorldTerrain();
            console.log('World Terrain enabled with token successfully');
          } catch (worldTerrainError) {
            console.log('World Terrain failed with error:', worldTerrainError.message);
            viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
            console.log('Falling back to ellipsoid terrain');
          }
        } else {
          console.log('No token available, using ellipsoid terrain');
          viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        }
      } else {
        console.log('Terrain disabled, using ellipsoid');
        viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      }
    } catch (error) {
      console.error('Error setting up terrain:', error);
      // Always fallback to ellipsoid terrain
      viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    }
  };

  // Configure globe settings
  const configureGlobe = (viewer) => {
    try {
      // Globe visibility
      viewer.scene.globe.show = showGlobe;
      
      // Ensure globe has proper material when terrain is enabled
      if (showTerrain) {
        // Use default material for terrain
        viewer.scene.globe.material = undefined;
        console.log('Globe material set to default for terrain');
      }
      
      // Atmosphere
      viewer.scene.skyAtmosphere.show = showAtmosphere;
      
      // Fog
      viewer.scene.fog.enabled = showFog;
      
      // Sky box
      viewer.scene.skyBox.show = showSkyBox;
      
      // Sun
      viewer.scene.sun.show = showSun;
      
      // Moon
      viewer.scene.moon.show = showMoon;
      
      // Stars
      viewer.scene.skyBox.show = showStars;
      
      console.log('Globe settings configured');
    } catch (error) {
      console.error('Error configuring globe:', error);
    }
  };

  // Update map type
  useEffect(() => {
    if (viewerRef.current) {
      setupImagery(viewerRef.current, mapType);
    }
  }, [mapType]);

  // Update terrain
  useEffect(() => {
    if (viewerRef.current) {
      console.log('Terrain state changed to:', showTerrain);
      setupTerrain(viewerRef.current, showTerrain);
      // Also reconfigure globe settings when terrain changes
      configureGlobe(viewerRef.current);
      
      // Add a test sphere when terrain is enabled to verify it's working
      if (showTerrain) {
        try {
          const testSphere = viewerRef.current.entities.add({
            position: Cesium.Cartesian3.fromDegrees(0, 0, 1000000),
            ellipsoid: {
              radii: new Cesium.Cartesian3(50000.0, 50000.0, 50000.0),
              material: Cesium.Color.YELLOW
            }
          });
          console.log('Added test sphere for terrain verification');
        } catch (sphereError) {
          console.log('Could not add test sphere:', sphereError.message);
        }
      }
    }
  }, [showTerrain]);

  // Update globe settings
  useEffect(() => {
    if (viewerRef.current) {
      configureGlobe(viewerRef.current);
    }
  }, [showGlobe, showAtmosphere, showFog, showSkyBox, showSun, showMoon, showStars]);

  // Update scene mode
  useEffect(() => {
    if (viewerRef.current) {
    const viewer = viewerRef.current;
      switch (sceneMode) {
        case '2D':
          viewer.scene.morphTo2D(0);
          break;
        case '2.5D':
          viewer.scene.morphToColumbusView(0);
          break;
        case '3D':
          viewer.scene.morphTo3D(0);
          break;
      }
      console.log('Scene mode changed to:', sceneMode);
    }
  }, [sceneMode]);

  // Camera controls
  const centerOnGlobe = () => {
    if (viewerRef.current) {
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(0, 0, 10000000),
      duration: 2.0
    });
    }
  };

  const zoomIn = () => {
    if (viewerRef.current) {
      viewerRef.current.camera.zoomIn(1000000.0);
    }
  };

  const zoomOut = () => {
    if (viewerRef.current) {
      viewerRef.current.camera.zoomOut(1000000.0);
    }
  };

  // Map controls overlay
  const MapControls = () => (
    <Box sx={{ 
      position: 'absolute', 
      top: 16, 
      right: 16, 
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      gap: 1
    }}>
      {/* Scene Mode Controls */}
      <Paper elevation={3} sx={{ p: 1 }}>
        <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
          View Mode
        </Typography>
        <ToggleButtonGroup
          value={sceneMode}
          exclusive
          onChange={(e, newMode) => newMode && setSceneMode(newMode)}
          size="small"
          orientation="vertical"
        >
          <ToggleButton value="2D" aria-label="2D">
            <ViewComfy />
          </ToggleButton>
          <ToggleButton value="2.5D" aria-label="2.5D">
            <ViewModule />
          </ToggleButton>
          <ToggleButton value="3D" aria-label="3D">
            <ViewInAr />
          </ToggleButton>
        </ToggleButtonGroup>
      </Paper>

      {/* Camera Controls */}
      <Paper elevation={3} sx={{ p: 1 }}>
        <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
          Camera
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <IconButton 
            size="small" 
            onClick={centerOnGlobe}
            title="Center on Globe"
          >
            <MyLocation />
          </IconButton>
          <IconButton 
            size="small" 
            onClick={zoomIn}
            title="Zoom In"
          >
            <ZoomIn />
          </IconButton>
          <IconButton 
            size="small" 
            onClick={zoomOut}
            title="Zoom Out"
          >
            <ZoomOut />
          </IconButton>
        </Box>
      </Paper>

      {/* Map Type Controls */}
      <Paper elevation={3} sx={{ p: 1 }}>
        <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
          Map Type (Current: {mapType})
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Chip
            icon={<Layers />}
            label="OpenStreetMap"
            size="small"
            onClick={() => setMapType('osm')}
            clickable
            color={mapType === 'osm' ? 'primary' : 'default'}
          />
          <Chip
            icon={<Satellite />}
            label="Satellite"
            size="small"
            onClick={() => setMapType('satellite')}
            clickable
            color={mapType === 'satellite' ? 'primary' : 'default'}
          />
          <Chip
            icon={<Layers />}
            label="Bing Maps"
            size="small"
            onClick={() => setMapType('bing')}
            clickable
            color={mapType === 'bing' ? 'primary' : 'default'}
          />
          <Chip
            icon={<Terrain />}
            label="Terrain"
            size="small"
            onClick={() => setMapType('terrain')}
            clickable
            color={mapType === 'terrain' ? 'primary' : 'default'}
          />
        </Box>
      </Paper>

      {/* Terrain Control */}
      <Paper elevation={3} sx={{ p: 1 }}>
        <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
          Terrain (Current: {showTerrain ? 'Enabled' : 'Disabled'})
        </Typography>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={showTerrain}
              onChange={(e) => setShowTerrain(e.target.checked)}
            />
          }
          label={<Typography variant="caption">3D Terrain</Typography>}
        />
      </Paper>

      {/* Globe Settings */}
      <Paper elevation={3} sx={{ p: 1 }}>
        <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
          Globe Settings
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showGlobe}
                onChange={(e) => setShowGlobe(e.target.checked)}
              />
            }
            label={<Typography variant="caption">Globe</Typography>}
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showAtmosphere}
                onChange={(e) => setShowAtmosphere(e.target.checked)}
              />
            }
            label={<Typography variant="caption">Atmosphere</Typography>}
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showFog}
                onChange={(e) => setShowFog(e.target.checked)}
              />
            }
            label={<Typography variant="caption">Fog</Typography>}
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showSkyBox}
                onChange={(e) => setShowSkyBox(e.target.checked)}
              />
            }
            label={<Typography variant="caption">Sky Box</Typography>}
          />
        </Box>
      </Paper>
    </Box>
  );

  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
          <div 
            ref={cesiumContainer} 
            style={{ width: '100%', height: '100%' }}
          />
          <MapControls />
    </Box>
  );
};

export default FlightMap; 