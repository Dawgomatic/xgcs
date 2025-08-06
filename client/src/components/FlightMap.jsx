import React, { useEffect, useRef, useState } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  IconButton, 
  Chip, 
  Button, 
  Switch, 
  FormControlLabel, 
  ToggleButton, 
  ToggleButtonGroup,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Fab,
  Tooltip,
  Menu,
  MenuItem,
  Select,
  FormControl,
  InputLabel
} from '@mui/material';
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
  Menu as MenuIcon,
  Close,
  Add,
  Delete,
  Edit,
  Save,
  Clear,
  Upload,
  Download,
  Flag,
  Fence,
  Route,
  LocationOn,
  Navigation,
  PlayArrow,
  Pause,
  Stop
} from '@mui/icons-material';
import * as Cesium from 'cesium';
import { useVehicles } from '../context/VehicleContext';

const FlightMap = () => {
  const { setViewer } = useVehicles();
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

  // Mission Planning States
  const [missionMode, setMissionMode] = useState('view'); // 'view', 'waypoint', 'fence', 'rally'
  const [waypoints, setWaypoints] = useState([]);
  const [fencePolygon, setFencePolygon] = useState([]);
  const [fenceCircle, setFenceCircle] = useState(null);
  const [rallyPoints, setRallyPoints] = useState([]);
  const [selectedWaypoint, setSelectedWaypoint] = useState(null);
  const [waypointDialogOpen, setWaypointDialogOpen] = useState(false);
  const [fenceDialogOpen, setFenceDialogOpen] = useState(false);
  const [missionMenuAnchor, setMissionMenuAnchor] = useState(null);
  const [isDrawingFence, setIsDrawingFence] = useState(false);
  const [isDrawingRally, setIsDrawingRally] = useState(false);
  const [missionDirty, setMissionDirty] = useState(false);

  // UI State for separate overlays
  const [mapSettingsOpen, setMapSettingsOpen] = useState(false);
  const [missionPlanningOpen, setMissionPlanningOpen] = useState(false);
  const [mapSettingsButtonPressed, setMapSettingsButtonPressed] = useState(false);
  const [missionPlanningButtonPressed, setMissionPlanningButtonPressed] = useState(false);

  // Get vehicle data from context
  const { vehicles } = useVehicles();

  // Mission Planning Functions
  const addWaypoint = (coordinate, altitude = 100) => {
    const newWaypoint = {
      id: Date.now(),
      coordinate: coordinate,
      altitude: altitude,
      command: 'NAV_WAYPOINT',
      sequence: waypoints.length + 1,
      name: `Waypoint ${waypoints.length + 1}`
    };
    setWaypoints([...waypoints, newWaypoint]);
    setMissionDirty(true);
    addWaypointToMap(newWaypoint);
  };

  const removeWaypoint = (waypointId) => {
    setWaypoints(waypoints.filter(wp => wp.id !== waypointId));
    removeWaypointFromMap(waypointId);
    setMissionDirty(true);
  };

  const updateWaypoint = (waypointId, updates) => {
    setWaypoints(waypoints.map(wp => 
      wp.id === waypointId ? { ...wp, ...updates } : wp
    ));
    updateWaypointOnMap(waypointId, updates);
    setMissionDirty(true);
  };

  const addWaypointToMap = (waypoint) => {
    if (!viewerRef.current) return;
    
    const position = Cesium.Cartesian3.fromDegrees(
      waypoint.coordinate.lon,
      waypoint.coordinate.lat,
      waypoint.altitude
    );

    const entity = viewerRef.current.entities.add({
      id: `waypoint-${waypoint.id}`,
      position: position,
      name: waypoint.name,
      point: {
        pixelSize: 12,
        color: Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      },
      label: {
        text: `${waypoint.sequence}`,
        font: '12pt sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.7),
        backgroundPadding: new Cesium.Cartesian2(7, 5)
      }
    });
  };

  const removeWaypointFromMap = (waypointId) => {
    if (!viewerRef.current) return;
    const entity = viewerRef.current.entities.getById(`waypoint-${waypointId}`);
    if (entity) {
      viewerRef.current.entities.remove(entity);
    }
  };

  const updateWaypointOnMap = (waypointId, updates) => {
    if (!viewerRef.current) return;
    const entity = viewerRef.current.entities.getById(`waypoint-${waypointId}`);
    if (entity) {
      if (updates.coordinate) {
        entity.position = Cesium.Cartesian3.fromDegrees(
          updates.coordinate.lon,
          updates.coordinate.lat,
          updates.altitude || entity.position.getValue(Cesium.JulianDate.now()).z
        );
      }
      if (updates.name) {
        entity.name = updates.name;
      }
    }
  };

  const addFencePolygon = (coordinates) => {
    if (!viewerRef.current || coordinates.length < 3) return;
    
    const positions = coordinates.map(coord => 
      Cesium.Cartesian3.fromDegrees(coord.lon, coord.lat)
    );

    const entity = viewerRef.current.entities.add({
      id: 'fence-polygon',
      polygon: {
        hierarchy: positions,
        material: Cesium.Color.RED.withAlpha(0.3),
        outline: true,
        outlineColor: Cesium.Color.RED
      }
    });
  };

  const addFenceCircle = (center, radius) => {
    if (!viewerRef.current) return;
    
    const entity = viewerRef.current.entities.add({
      id: 'fence-circle',
      position: Cesium.Cartesian3.fromDegrees(center.lon, center.lat),
      ellipse: {
        semiMinorAxis: radius,
        semiMajorAxis: radius,
        material: Cesium.Color.RED.withAlpha(0.3),
        outline: true,
        outlineColor: Cesium.Color.RED
      }
    });
  };

  const addRallyPoint = (coordinate, altitude = 50) => {
    const newRallyPoint = {
      id: Date.now(),
      coordinate: coordinate,
      altitude: altitude
    };
    setRallyPoints([...rallyPoints, newRallyPoint]);
    addRallyPointToMap(newRallyPoint);
    setMissionDirty(true);
  };

  const addRallyPointToMap = (rallyPoint) => {
    if (!viewerRef.current) return;
    
    const position = Cesium.Cartesian3.fromDegrees(
      rallyPoint.coordinate.lon,
      rallyPoint.coordinate.lat,
      rallyPoint.altitude
    );

    const entity = viewerRef.current.entities.add({
      id: `rally-${rallyPoint.id}`,
      position: position,
      point: {
        pixelSize: 10,
        color: Cesium.Color.ORANGE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      },
      label: {
        text: 'R',
        font: '10pt sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -15),
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.7),
        backgroundPadding: new Cesium.Cartesian2(5, 3)
      }
    });
  };

  const handleMapClick = (event) => {
    if (!viewerRef.current) return;
    
    const pickedPosition = viewerRef.current.camera.pickEllipsoid(
      new Cesium.Cartesian2(event.clientX, event.clientY),
      viewerRef.current.scene.globe.ellipsoid
    );
    
    if (pickedPosition) {
      const cartographic = Cesium.Cartographic.fromCartesian(pickedPosition);
      const coordinate = {
        lat: Cesium.Math.toDegrees(cartographic.latitude),
        lon: Cesium.Math.toDegrees(cartographic.longitude)
      };

      switch (missionMode) {
        case 'waypoint':
          addWaypoint(coordinate);
          break;
        case 'fence':
          if (isDrawingFence) {
            setFencePolygon([...fencePolygon, coordinate]);
            if (fencePolygon.length >= 2) {
              addFencePolygon([...fencePolygon, coordinate]);
            }
          }
          break;
        case 'rally':
          addRallyPoint(coordinate);
          break;
        default:
          break;
      }
    }
  };

  const clearMission = () => {
    setWaypoints([]);
    setFencePolygon([]);
    setFenceCircle(null);
    setRallyPoints([]);
    setMissionDirty(false);
    
    // Clear map entities
    if (viewerRef.current) {
      viewerRef.current.entities.removeAll();
    }
  };

  const uploadMission = async () => {
    if (!vehicles.length) return;
    
    const mission = {
      waypoints: waypoints,
      fence: {
        polygon: fencePolygon,
        circle: fenceCircle
      },
      rallyPoints: rallyPoints
    };

    try {
      const response = await fetch('/api/mission/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          vehicleId: vehicles[0].id,
          mission: mission 
        })
      });
      
      if (response.ok) {
        setMissionDirty(false);
        console.log('Mission uploaded successfully');
      }
    } catch (error) {
      console.error('Failed to upload mission:', error);
    }
  };

  const downloadMission = async () => {
    const mission = {
      waypoints: waypoints,
      fence: {
        polygon: fencePolygon,
        circle: fenceCircle
      },
      rallyPoints: rallyPoints
    };

    const blob = new Blob([JSON.stringify(mission, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mission.json';
    a.click();
    URL.revokeObjectURL(url);
  };

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
    
    // Register viewer with VehicleContext for telemetry updates
    setViewer(viewer);

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

    // Add map click handler for mission planning
    const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandler.setInputAction(handleMapClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    console.log('Cesium viewer fully configured');

    // Cleanup
    return () => {
      if (clickHandler) {
        clickHandler.destroy();
      }
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
      {/* Map Settings Button */}
      <button
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 10001,
          backgroundColor: mapSettingsButtonPressed ? 'rgba(200, 200, 200, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          borderRadius: '8px',
          boxShadow: mapSettingsButtonPressed ? '0 2px 8px rgba(0, 0, 0, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.3)',
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
          transform: mapSettingsButtonPressed ? 'scale(0.95)' : 'scale(1)',
          transition: 'all 0.1s ease',
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMapSettingsButtonPressed(true);
        }}
        onMouseUp={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (mapSettingsButtonPressed) {
            setMapSettingsOpen(!mapSettingsOpen);
            setMapSettingsButtonPressed(false);
          }
        }}
        onMouseLeave={() => {
          setMapSettingsButtonPressed(false);
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMapSettingsOpen(!mapSettingsOpen);
        }}
        title={mapSettingsOpen ? "Close Map Settings" : "Open Map Settings"}
      >
        <Settings />
      </button>

      {/* Mission Planning Button */}
      <button
        style={{
          position: 'absolute',
          top: 16,
          left: 80,
          zIndex: 10001,
          backgroundColor: missionPlanningButtonPressed ? 'rgba(200, 200, 200, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          borderRadius: '8px',
          boxShadow: missionPlanningButtonPressed ? '0 2px 8px rgba(0, 0, 0, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.3)',
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
          transform: missionPlanningButtonPressed ? 'scale(0.95)' : 'scale(1)',
          transition: 'all 0.1s ease',
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMissionPlanningButtonPressed(true);
        }}
        onMouseUp={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (missionPlanningButtonPressed) {
            setMissionPlanningOpen(!missionPlanningOpen);
            setMissionPlanningButtonPressed(false);
          }
        }}
        onMouseLeave={() => {
          setMissionPlanningButtonPressed(false);
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMissionPlanningOpen(!missionPlanningOpen);
        }}
        title={missionPlanningOpen ? "Close Mission Planning" : "Open Mission Planning"}
      >
        <Route />
      </button>
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
            left: 0,
            pointerEvents: 'auto',
            zIndex: 100000,
          }}>
            <MapControls />
          </Box>

          {/* Map Settings Overlay */}
          {mapSettingsOpen && (
            <Box sx={{
              position: 'absolute',
              top: 16,
              left: 144,
              zIndex: 9998,
              maxHeight: 'calc(100vh - 32px)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              minWidth: 280,
              pointerEvents: 'auto',
            }}>
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

          {/* Mission Planning Overlay */}
          {missionPlanningOpen && (
            <Box sx={{
              position: 'absolute',
              top: 16,
              left: 144,
              zIndex: 9998,
              maxHeight: 'calc(100vh - 32px)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              minWidth: 320,
              pointerEvents: 'auto',
            }}>
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
                {/* Mission Mode Selector */}
                <Paper elevation={3} sx={{ p: 1 }}>
                  <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
                    Mission Mode
                  </Typography>
                  <ToggleButtonGroup
                    value={missionMode}
                    exclusive
                    onChange={(e, newMode) => newMode && setMissionMode(newMode)}
                    size="small"
                    orientation="vertical"
                    sx={{ mb: 1 }}
                  >
                    <ToggleButton value="view" aria-label="View">
                      <Navigation />
                    </ToggleButton>
                    <ToggleButton value="waypoint" aria-label="Waypoint">
                      <LocationOn />
                    </ToggleButton>
                    <ToggleButton value="fence" aria-label="Fence">
                      <Fence />
                    </ToggleButton>
                    <ToggleButton value="rally" aria-label="Rally">
                      <Flag />
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Paper>

                {/* Mission Actions */}
                <Paper elevation={3} sx={{ p: 1 }}>
                  <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
                    Mission Actions
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Upload />}
                      onClick={uploadMission}
                      disabled={!missionDirty || !vehicles.length}
                      sx={{ fontSize: '10px' }}
                    >
                      Upload Mission
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Download />}
                      onClick={downloadMission}
                      sx={{ fontSize: '10px' }}
                    >
                      Download Mission
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Clear />}
                      onClick={clearMission}
                      sx={{ fontSize: '10px' }}
                    >
                      Clear Mission
                    </Button>
                  </Box>
                </Paper>

                {/* Mission Status */}
                <Paper elevation={3} sx={{ p: 1 }}>
                  <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
                    Mission Status
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Chip
                      label={`${waypoints.length} Waypoints`}
                      size="small"
                      color="primary"
                      sx={{ fontSize: '10px' }}
                    />
                    <Chip
                      label={`${fencePolygon.length} Fence Points`}
                      size="small"
                      color="secondary"
                      sx={{ fontSize: '10px' }}
                    />
                    <Chip
                      label={`${rallyPoints.length} Rally Points`}
                      size="small"
                      color="warning"
                      sx={{ fontSize: '10px' }}
                    />
                    {missionDirty && (
                      <Chip
                        label="Unsaved Changes"
                        size="small"
                        color="error"
                        sx={{ fontSize: '10px' }}
                      />
                    )}
                  </Box>
                </Paper>

                {/* Waypoints List */}
                {waypoints.length > 0 && (
                  <Paper elevation={3} sx={{ p: 1 }}>
                    <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
                      Waypoints
                    </Typography>
                    <List dense sx={{ maxHeight: 200, overflow: 'auto' }}>
                      {waypoints.map((waypoint, index) => (
                        <ListItem key={waypoint.id} sx={{ py: 0.5 }}>
                          <ListItemText
                            primary={`${waypoint.sequence}. ${waypoint.name}`}
                            secondary={`${waypoint.coordinate.lat.toFixed(6)}, ${waypoint.coordinate.lon.toFixed(6)} - ${waypoint.altitude}m`}
                            sx={{ '& .MuiListItemText-primary': { fontSize: '12px' }, '& .MuiListItemText-secondary': { fontSize: '10px' } }}
                          />
                          <ListItemSecondaryAction>
                            <IconButton
                              size="small"
                              onClick={() => { setSelectedWaypoint(waypoint); setWaypointDialogOpen(true); }}
                            >
                              <Edit />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => removeWaypoint(waypoint.id)}
                            >
                              <Delete />
                            </IconButton>
                          </ListItemSecondaryAction>
                        </ListItem>
                      ))}
                    </List>
                  </Paper>
                )}
              </Box>
            </Box>
          )}

          {/* Mission Planning FAB */}
          <Box sx={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            pointerEvents: 'auto',
            zIndex: 100000,
          }}>
            <Fab
              color="primary"
              size="medium"
              onClick={(e) => setMissionMenuAnchor(e.currentTarget)}
              sx={{ mb: 1 }}
            >
              <Add />
            </Fab>
            
            {/* Mission Menu */}
            <Menu
              anchorEl={missionMenuAnchor}
              open={Boolean(missionMenuAnchor)}
              onClose={() => setMissionMenuAnchor(null)}
            >
              <MenuItem onClick={() => { setMissionMode('waypoint'); setMissionMenuAnchor(null); }}>
                <LocationOn sx={{ mr: 1 }} />
                Add Waypoint
              </MenuItem>
              <MenuItem onClick={() => { setMissionMode('fence'); setIsDrawingFence(true); setMissionMenuAnchor(null); }}>
                <Fence sx={{ mr: 1 }} />
                Draw Fence
              </MenuItem>
              <MenuItem onClick={() => { setMissionMode('rally'); setMissionMenuAnchor(null); }}>
                <Flag sx={{ mr: 1 }} />
                Add Rally Point
              </MenuItem>
              <Divider />
              <MenuItem onClick={() => { uploadMission(); setMissionMenuAnchor(null); }}>
                <Upload sx={{ mr: 1 }} />
                Upload Mission
              </MenuItem>
              <MenuItem onClick={() => { downloadMission(); setMissionMenuAnchor(null); }}>
                <Download sx={{ mr: 1 }} />
                Download Mission
              </MenuItem>
              <MenuItem onClick={() => { clearMission(); setMissionMenuAnchor(null); }}>
                <Clear sx={{ mr: 1 }} />
                Clear Mission
              </MenuItem>
            </Menu>
          </Box>

          {/* Waypoint Dialog */}
          <Dialog open={waypointDialogOpen} onClose={() => setWaypointDialogOpen(false)}>
            <DialogTitle>Edit Waypoint</DialogTitle>
            <DialogContent>
              {selectedWaypoint && (
                <Box sx={{ pt: 1 }}>
                  <TextField
                    fullWidth
                    label="Name"
                    value={selectedWaypoint.name}
                    onChange={(e) => updateWaypoint(selectedWaypoint.id, { name: e.target.value })}
                    sx={{ mb: 2 }}
                  />
                  <TextField
                    fullWidth
                    label="Altitude (m)"
                    type="number"
                    value={selectedWaypoint.altitude}
                    onChange={(e) => updateWaypoint(selectedWaypoint.id, { altitude: parseFloat(e.target.value) })}
                    sx={{ mb: 2 }}
                  />
                  <TextField
                    fullWidth
                    label="Latitude"
                    type="number"
                    value={selectedWaypoint.coordinate.lat}
                    onChange={(e) => updateWaypoint(selectedWaypoint.id, { 
                      coordinate: { 
                        ...selectedWaypoint.coordinate, 
                        lat: parseFloat(e.target.value) 
                      } 
                    })}
                    sx={{ mb: 2 }}
                  />
                  <TextField
                    fullWidth
                    label="Longitude"
                    type="number"
                    value={selectedWaypoint.coordinate.lon}
                    onChange={(e) => updateWaypoint(selectedWaypoint.id, { 
                      coordinate: { 
                        ...selectedWaypoint.coordinate, 
                        lon: parseFloat(e.target.value) 
                      } 
                    })}
                  />
                </Box>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setWaypointDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => setWaypointDialogOpen(false)} variant="contained">Save</Button>
            </DialogActions>
          </Dialog>
          </Box>
    </Box>
  );
};

export default FlightMap; 