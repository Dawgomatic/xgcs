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
  ViewComfy,
  Menu,
  Close
} from '@mui/icons-material';
import * as Cesium from 'cesium';
import { useVehicles } from '../context/VehicleContext';

const FlightMap = () => {
  const cesiumContainer = useRef(null);
  const viewerRef = useRef(null);
  const buttonRef = useRef(null);
  const [mapType, setMapType] = useState('osm');
  const [buttonPressed, setButtonPressed] = useState(false);
  const [showTerrain, setShowTerrain] = useState(false);
  const [showGlobe, setShowGlobe] = useState(true);
  const [showAtmosphere, setShowAtmosphere] = useState(true);
  const [showFog, setShowFog] = useState(true);
  const [showSkyBox, setShowSkyBox] = useState(true);
  const [showSun, setShowSun] = useState(true);
  const [showMoon, setShowMoon] = useState(true);
  const [showStars, setShowStars] = useState(true);
  const [sceneMode, setSceneMode] = useState('3D');
  const [showDrones, setShowDrones] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // Get vehicle data from context
  const { vehicles } = useVehicles();



  // Create drone entity on the map
  const createDroneEntity = (viewer, vehicle) => {
    if (!vehicle.coordinate || !vehicle.coordinate.lat || !vehicle.coordinate.lon) {
      return null;
    }

    const position = Cesium.Cartesian3.fromDegrees(
      vehicle.coordinate.lon,
      vehicle.coordinate.lat,
      vehicle.altitude || 0
    );

    // Create a 3D model or simple shape for the drone
    const entity = viewer.entities.add({
      id: `drone-${vehicle.id}`,
      position: position,
      name: vehicle.name || `Drone ${vehicle.id}`,
      // Use a simple ellipsoid for now - can be replaced with 3D model later
      ellipsoid: {
        radii: new Cesium.Cartesian3(10.0, 10.0, 5.0),
        material: Cesium.Color.BLUE.withAlpha(0.8),
        outline: true,
        outlineColor: Cesium.Color.WHITE
      },
      // Add label with drone info
      label: {
        text: `${vehicle.name || 'Drone'}\n${vehicle.altitude?.toFixed(1) || 0}m`,
        font: '12pt sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -40),
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.7),
        backgroundPadding: new Cesium.Cartesian2(7, 5)
      },
      // Add orientation indicator
      billboard: {
        image: 'data:image/svg+xml;base64,' + btoa(`
          <svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="14" fill="none" stroke="white" stroke-width="2"/>
            <line x1="16" y1="2" x2="16" y2="30" stroke="white" stroke-width="2"/>
            <line x1="2" y1="16" x2="30" y2="16" stroke="white" stroke-width="2"/>
            <polygon points="16,4 12,12 20,12" fill="white"/>
          </svg>
        `),
        alignedAxis: Cesium.Cartesian3.UNIT_Z,
        scale: 0.5
      }
    });

    return entity;
  };

  // Update drone position
  const updateDronePosition = (viewer, vehicle) => {
    if (!vehicle.coordinate || !vehicle.coordinate.lat || !vehicle.coordinate.lon) {
      return;
    }

    const entityId = `drone-${vehicle.id}`;
    const entity = viewer.entities.getById(entityId);

    if (entity) {
      const position = Cesium.Cartesian3.fromDegrees(
        vehicle.coordinate.lon,
        vehicle.coordinate.lat,
        vehicle.altitude || 0
      );

      // Update position smoothly
      entity.position = position;

      // Update label text only if altitude changed significantly
      if (entity.label) {
        const currentText = entity.label.text;
        const newText = `${vehicle.name || 'Drone'}\n${vehicle.altitude?.toFixed(1) || 0}m`;
        if (currentText !== newText) {
          entity.label.text = newText;
        }
      }

      // Update orientation if heading is available and changed
      if (vehicle.heading !== undefined && entity.billboard) {
        const currentRotation = entity.billboard.rotation;
        const newRotation = Cesium.Math.toRadians(vehicle.heading);
        if (Math.abs(currentRotation - newRotation) > 0.01) { // Small threshold to prevent jitter
          entity.billboard.rotation = newRotation;
        }
      }
    }
  };

  // Remove drone entity
  const removeDroneEntity = (viewer, vehicleId) => {
    const entityId = `drone-${vehicleId}`;
    const entity = viewer.entities.getById(entityId);
    if (entity) {
      viewer.entities.remove(entity);
    }
  };



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

  // Update drones when vehicle data changes
  useEffect(() => {
    // Only update if we have a viewer and drones should be shown
    if (!viewerRef.current || !showDrones) return;
    
    const viewer = viewerRef.current;
    const currentDroneIds = new Set();
    const connectedVehicles = vehicles.filter(v => v.connected && v.coordinate);

    // Update or create drone entities
    connectedVehicles.forEach(vehicle => {
      currentDroneIds.add(vehicle.id);
      
      const entityId = `drone-${vehicle.id}`;
      const existingEntity = viewer.entities.getById(entityId);

      if (existingEntity) {
        // Only update position if coordinates actually changed
        const currentPos = existingEntity.position.getValue(Cesium.JulianDate.now());
        const newPos = Cesium.Cartesian3.fromDegrees(
          vehicle.coordinate.lon,
          vehicle.coordinate.lat,
          vehicle.altitude || 0
        );
        
        // Check if position actually changed (with some tolerance)
        if (!currentPos || Cesium.Cartesian3.distance(currentPos, newPos) > 1.0) {
          updateDronePosition(viewer, vehicle);
        }
      } else {
        createDroneEntity(viewer, vehicle);
      }
    });

    // Remove entities for disconnected drones
    viewer.entities.values.forEach(entity => {
      if (entity.id && entity.id.startsWith('drone-')) {
        const droneId = entity.id.replace('drone-', '');
        if (!currentDroneIds.has(droneId)) {
          viewer.entities.remove(entity);
        }
      }
    });
  }, [vehicles, showDrones]);

  // Center camera on first connected drone
  const centerOnDrone = () => {
    if (viewerRef.current && vehicles.length > 0) {
      const connectedVehicle = vehicles.find(v => v.connected && v.coordinate);
      if (connectedVehicle) {
        const position = Cesium.Cartesian3.fromDegrees(
          connectedVehicle.coordinate.lon,
          connectedVehicle.coordinate.lat,
          connectedVehicle.altitude || 0
        );
        
        viewerRef.current.camera.flyTo({
          destination: position,
          duration: 2.0,
          offset: new Cesium.HeadingPitchRange(0, -Math.PI / 4, 1000)
        });
      }
    }
  };

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
    <>
      {/* Menu Toggle Button */}
      <button
        ref={buttonRef}
        style={{
          position: 'absolute',
          top: 16,
          left: 16, // Move to top-left
          zIndex: 10001,
          backgroundColor: buttonPressed ? 'rgba(200, 200, 200, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          borderRadius: '8px',
          boxShadow: buttonPressed ? '0 2px 8px rgba(0, 0, 0, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          width: 56,
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          userSelect: 'none',
          outline: 'none',
          pointerEvents: 'auto',
          transform: buttonPressed ? 'scale(0.95)' : 'scale(1)',
          transition: 'all 0.1s ease',
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setButtonPressed(true);
        }}
        onMouseUp={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (buttonPressed) {
            console.log('Menu button released, toggling menu. Current state:', menuOpen);
            setMenuOpen(!menuOpen);
            setButtonPressed(false);
          }
        }}
        onMouseLeave={() => {
          setButtonPressed(false);
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('Menu button clicked (fallback), current state:', menuOpen);
          setMenuOpen(!menuOpen);
        }}
        title={menuOpen ? "Close Menu" : "Open Menu"}
      >
        {menuOpen ? <Close /> : <Menu />}
      </button>

      {/* Menu Panel */}
      {menuOpen && (
        <Box sx={{ 
          position: 'absolute', 
          top: 16, 
          left: 80, // Position to the right of the toggle button
          zIndex: 9998,
          maxHeight: 'calc(100vh - 32px)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 280, // Ensure consistent width
          pointerEvents: 'auto',
        }}
        >
          <Box sx={{
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            pr: 1,
            '&::-webkit-scrollbar': {
              width: '8px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'rgba(0, 0, 0, 0.1)',
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '4px',
              '&:hover': {
                background: 'rgba(0, 0, 0, 0.5)',
              },
            },
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
                  onClick={centerOnDrone}
                  title="Center on Drone"
                >
                  <CenterFocusStrong />
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

            {/* Drone Controls */}
            <Paper elevation={3} sx={{ p: 1 }}>
              <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
                Drones ({vehicles.filter(v => v.connected).length} connected)
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={showDrones}
                      onChange={(e) => setShowDrones(e.target.checked)}
                    />
                  }
                  label={<Typography variant="caption">Show Drones</Typography>}
                />
                {vehicles.filter(v => v.connected).map(vehicle => (
                  <Chip
                    key={vehicle.id}
                    label={`${vehicle.name || vehicle.id} - ${vehicle.altitude?.toFixed(1) || 0}m`}
                    size="small"
                    color={vehicle.coordinate ? "primary" : "default"}
                    variant={vehicle.coordinate ? "filled" : "outlined"}
                  />
                ))}
              </Box>
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
        </Box>
      )}
    </>
  );

  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
          <div 
            ref={cesiumContainer} 
            style={{ width: '100%', height: '100%' }}
          />
          
          {/* UI Layer - Completely separate from Cesium */}
          <Box sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
            zIndex: 9999,
          }}
          >
            <Box sx={{
              position: 'absolute',
              top: 0,
              left: 0, // Move to top-left instead of top-right
              pointerEvents: 'auto',
              zIndex: 100000, // Higher than instrument panel (10) and status bar (10)
            }}>
              <MapControls />
            </Box>
          </Box>
    </Box>
  );
};

export default FlightMap; 