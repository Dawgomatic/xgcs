import React, { useState, useEffect, useContext } from 'react';
import { 
  Box, 
  Grid, 
  Paper, 
  Typography, 
  IconButton, 
  Toolbar,
  AppBar,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Chip,
  Card,
  CardContent,
  LinearProgress
} from '@mui/material';
import {
  Flight,
  Map,
  Settings,
  Videocam,
  Speed,
  Height,
  Battery90,
  SignalCellular4Bar,
  GpsFixed,
  CompassCalibration,
  PlayArrow,
  Pause,
  Stop,
  Home
} from '@mui/icons-material';
import { useVehicles } from '../context/VehicleContext';
import FlightMap from '../components/FlightMap';
import InstrumentPanel from '../components/InstrumentPanel';
import FlightModeSelector from '../components/FlightModeSelector';
import VideoPanel from '../components/VideoPanel';

// @hallucinated - React component structure for flight display
// Maps from QGC FlyView.qml but uses modern React patterns
const FlightDisplay = () => {
  const { activeVehicle, vehicles } = useVehicles();
  const [mapVisible, setMapVisible] = useState(true);
  const [videoVisible, setVideoVisible] = useState(false);
  const [instrumentPanelVisible, setInstrumentPanelVisible] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Flight control states - maps from QGC guided actions
  const [isFlying, setIsFlying] = useState(false);
  const [flightMode, setFlightMode] = useState('MANUAL');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  useEffect(() => {
    if (activeVehicle) {
      setConnectionStatus(activeVehicle.connectionStatus);
      setFlightMode(activeVehicle.flightMode || 'MANUAL');
    }
  }, [activeVehicle]);

  // Flight control functions - maps from QGC guided controller
  const handleTakeoff = () => {
    if (activeVehicle) {
      // @hallucinated - API call to backend for takeoff command
      console.log('Takeoff command sent');
      setIsFlying(true);
    }
  };

  const handleLand = () => {
    if (activeVehicle) {
      // @hallucinated - API call to backend for land command
      console.log('Land command sent');
      setIsFlying(false);
    }
  };

  const handleRTL = () => {
    if (activeVehicle) {
      // @hallucinated - API call to backend for RTL command
      console.log('Return to launch command sent');
    }
  };

  const handlePause = () => {
    if (activeVehicle) {
      // @hallucinated - API call to backend for pause command
      console.log('Pause command sent');
    }
  };

  // Main content layout - maps from QGC FlyView layout
  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Main Map Area - maps from QGC FlyViewMap */}
        <Box sx={{ 
          flex: 1, 
          position: 'relative',
          display: mapVisible ? 'block' : 'none'
        }}>
          <FlightMap 
            vehicle={activeVehicle}
            vehicles={vehicles}
          />
        </Box>

        {/* Right Panel - maps from QGC FlyViewWidgetLayer */}
        <Box sx={{ 
          width: 320, 
          display: 'flex', 
          flexDirection: 'column',
          borderLeft: 1,
          borderColor: 'divider'
        }}>
          {/* Instrument Panel - maps from QGC FlyViewInstrumentPanel */}
          {instrumentPanelVisible && (
            <Box sx={{ flex: 1, p: 2 }}>
              <InstrumentPanel vehicle={activeVehicle} />
            </Box>
          )}

          {/* Video Panel - maps from QGC FlyViewVideo */}
          {videoVisible && (
            <Box sx={{ height: 240, p: 1 }}>
              <VideoPanel vehicle={activeVehicle} />
            </Box>
          )}
        </Box>
      </Box>

      {/* Status Bar - maps from QGC status indicators */}
      <Box sx={{ 
        height: 40, 
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        px: 2,
        gap: 2
      }}>
        <Typography variant="caption" color="text.secondary">
          {activeVehicle ? `Vehicle: ${activeVehicle.id}` : 'No vehicle connected'}
        </Typography>
        
        {activeVehicle && (
          <>
            <Chip 
              icon={<Battery90 />}
              label={`${activeVehicle.batteryLevel || 0}%`}
              size="small"
              color={activeVehicle.batteryLevel < 20 ? 'error' : 'default'}
            />
            <Chip 
              icon={<GpsFixed />}
              label={`${activeVehicle.gpsSatellites || 0} sats`}
              size="small"
            />
            <Chip 
              icon={<Speed />}
              label={`${activeVehicle.airspeed || 0} m/s`}
              size="small"
            />
            <Chip 
              icon={<Height />}
              label={`${activeVehicle.altitude || 0} m`}
              size="small"
            />
          </>
        )}
      </Box>
    </Box>
  );
};

export default FlightDisplay; 