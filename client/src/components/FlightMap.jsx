import React, { useEffect, useRef, useState } from 'react';
import { Box, Paper, Typography, IconButton, Chip, Button } from '@mui/material';
import { 
  MyLocation, 
  CenterFocusStrong, 
  ZoomIn, 
  ZoomOut,
  Layers,
  Satellite
} from '@mui/icons-material';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

// @hallucinated - React component for 3D map display
// Maps from QGC FlyViewMap.qml but uses Cesium instead of QtLocation
const FlightMap = ({ vehicle, vehicles = [] }) => {
  const cesiumContainer = useRef(null);
  const viewerRef = useRef(null);
  const [mapType, setMapType] = useState('satellite');
  const [vehicleEntities, setVehicleEntities] = useState(new Map());
  const [cesiumError, setCesiumError] = useState(false);

  useEffect(() => {
    if (!cesiumContainer.current) return;

    try {
      // Initialize Cesium viewer - maps from QGC FlightMap
      const viewer = new Cesium.Viewer(cesiumContainer.current, {
        terrainProvider: Cesium.Terrain.fromWorldTerrain(),
        baseLayerPicker: false,
        navigationHelpButton: false,
        homeButton: false,
        sceneModePicker: false,
        geocoder: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        scene3DOnly: true,
        shouldAnimate: true
      });

      viewerRef.current = viewer;
      setCesiumError(false);

      // Set initial camera position
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(-122.4194, 37.7749, 1000),
        orientation: {
          heading: 0.0,
          pitch: -Cesium.Math.PI_OVER_TWO,
          roll: 0.0
        }
      });

      console.log('Cesium viewer initialized successfully');
    } catch (error) {
      console.error('Error initializing Cesium viewer:', error);
      setCesiumError(true);
    }

    return () => {
      if (viewerRef.current) {
        try {
          viewerRef.current.destroy();
          console.log('Cesium viewer destroyed');
        } catch (error) {
          console.error('Error destroying Cesium viewer:', error);
        }
      }
    };
  }, []);

  // Update map type
  useEffect(() => {
    if (!viewerRef.current) return;

    const viewer = viewerRef.current;
    
    try {
      viewer.imageryLayers.removeAll();
      
      // Use OpenStreetMap for both map types since Ion requires token setup
      const imageryProvider = new Cesium.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/'
      });
      
      viewer.imageryLayers.addImageryProvider(imageryProvider);
    } catch (error) {
      console.error('Error setting imagery provider:', error);
    }
  }, [mapType]);

  // Update vehicle positions - maps from QGC vehicle tracking
  useEffect(() => {
    if (!viewerRef.current) return;

    const viewer = viewerRef.current;
    const entities = viewer.entities;

    // Remove old vehicle entities
    vehicleEntities.forEach((entity) => {
      entities.remove(entity);
    });

    const newVehicleEntities = new Map();

    // Add vehicle entities
    vehicles.forEach((v) => {
      if (v.coordinate && v.coordinate.lat && v.coordinate.lon) {
        const entity = entities.add({
          position: Cesium.Cartesian3.fromDegrees(v.coordinate.lon, v.coordinate.lat, v.altitude || 0),
          // Try 3D model first, fall back to box primitive if model fails
          model: {
            uri: '/models/drone.glb',
            minimumPixelSize: 64,
            maximumScale: 20000,
            // Fallback to box if model fails to load
            failSilently: true
          },
          // Fallback box primitive (will only show if model fails)
          box: {
            dimensions: new Cesium.Cartesian3(2.0, 2.0, 0.5),
            material: v.id === vehicle?.id ? Cesium.Color.YELLOW : Cesium.Color.BLUE,
            outline: true,
            outlineColor: Cesium.Color.WHITE,
            // Only show box if model is not available
            show: false
          },
          label: {
            text: v.id || 'Vehicle',
            font: '14pt monospace',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 2,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -9),
            fillColor: v.id === vehicle?.id ? Cesium.Color.YELLOW : Cesium.Color.WHITE
          },
          billboard: {
            // Use a simple colored circle as fallback if icon fails
            image: v.id === vehicle?.id ? '/icons/active-vehicle.png' : '/icons/vehicle.png',
            scale: 0.5,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            // Fallback to colored circle if image fails
            failSilently: true
          }
        });

        // Handle model loading failure by showing the box primitive
        if (entity.model && entity.model.readyPromise) {
          entity.model.readyPromise.catch(() => {
            if (entity.box) {
              entity.box.show = true;
            }
            if (entity.model) {
              entity.model.show = false;
            }
          });
        } else {
          // If model failed to load immediately, show box instead
          if (entity.box) {
            entity.box.show = true;
          }
          if (entity.model) {
            entity.model.show = false;
          }
        }

        // Handle billboard image loading failure
        if (entity.billboard && entity.billboard.readyPromise) {
          entity.billboard.readyPromise.catch(() => {
            // Replace with a simple colored circle
            if (entity.billboard) {
              entity.billboard.image = undefined;
              entity.billboard.color = v.id === vehicle?.id ? Cesium.Color.YELLOW : Cesium.Color.BLUE;
              entity.billboard.scale = 0.3;
            }
          });
        } else {
          // If billboard failed to load immediately, use colored circle
          if (entity.billboard) {
            entity.billboard.image = undefined;
            entity.billboard.color = v.id === vehicle?.id ? Cesium.Color.YELLOW : Cesium.Color.BLUE;
            entity.billboard.scale = 0.3;
          }
        }

        newVehicleEntities.set(v.id, entity);
      }
    });

    setVehicleEntities(newVehicleEntities);
  }, [vehicles, vehicle]);

  // Center on active vehicle
  const centerOnVehicle = () => {
    if (!viewerRef.current || !vehicle || !vehicle.coordinate) return;

    const viewer = viewerRef.current;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        vehicle.coordinate.lon, 
        vehicle.coordinate.lat, 
        vehicle.altitude + 100
      ),
      duration: 2.0
    });
  };

  // Zoom controls
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

  // Map controls overlay - maps from QGC map controls
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
      <Paper elevation={3} sx={{ p: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <IconButton 
            size="small" 
            onClick={centerOnVehicle}
            disabled={!vehicle}
            title="Center on Vehicle"
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

      <Paper elevation={3} sx={{ p: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Chip
            icon={<Layers />}
            label="OpenStreetMap"
            size="small"
            onClick={() => setMapType(mapType === 'satellite' ? 'street' : 'satellite')}
            clickable
          />
        </Box>
      </Paper>
    </Box>
  );

  // Vehicle info overlay - maps from QGC vehicle info display
  const VehicleInfo = () => {
    if (!vehicle) return null;

    return (
      <Box sx={{ 
        position: 'absolute', 
        bottom: 16, 
        left: 16, 
        zIndex: 1000 
      }}>
        <Paper elevation={3} sx={{ p: 2, minWidth: 200 }}>
          <Typography variant="h6" gutterBottom>
            {vehicle.id}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2">Flight Mode:</Typography>
              <Chip 
                label={vehicle.flightMode || 'UNKNOWN'} 
                size="small" 
                color="primary"
              />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2">Altitude:</Typography>
              <Typography variant="body2">
                {vehicle.altitude ? `${vehicle.altitude.toFixed(1)} m` : 'N/A'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2">Speed:</Typography>
              <Typography variant="body2">
                {vehicle.airspeed ? `${vehicle.airspeed.toFixed(1)} m/s` : 'N/A'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2">Battery:</Typography>
              <Typography variant="body2">
                {vehicle.batteryLevel ? `${vehicle.batteryLevel}%` : 'N/A'}
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Box>
    );
  };

  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
      {cesiumError ? (
        // Fallback when Cesium fails to load
        <Box sx={{ 
          width: '100%', 
          height: '100%', 
          bgcolor: 'grey.100',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3
        }}>
          <Typography variant="h6" color="error" gutterBottom>
            Map Loading Error
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mb: 2 }}>
            Cesium 3D map failed to load. This could be due to:
          </Typography>
          <Box component="ul" sx={{ textAlign: 'left', mb: 2 }}>
            <Typography component="li" variant="body2" color="text.secondary">
              Network connectivity issues
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              Cesium assets not loading properly
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              Browser compatibility issues
            </Typography>
          </Box>
          <Button 
            variant="outlined" 
            onClick={() => window.location.reload()}
            sx={{ mt: 2 }}
          >
            Reload Page
          </Button>
        </Box>
      ) : (
        <>
          <div 
            ref={cesiumContainer} 
            style={{ width: '100%', height: '100%' }}
          />
          <MapControls />
          <VehicleInfo />
        </>
      )}
    </Box>
  );
};

export default FlightMap; 