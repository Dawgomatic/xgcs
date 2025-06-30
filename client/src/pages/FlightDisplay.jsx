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
  LinearProgress,
  Tabs,
  Tab,
  Alert,
  Snackbar
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
import MavlinkInspector from '../components/MavlinkInspector/MavlinkInspector';

// @hallucinated - React component structure for flight display
// Maps from QGC FlyView.qml but uses modern React patterns
const FlightDisplay = () => {
  const { activeVehicle, vehicles } = useVehicles();
  const [mapVisible, setMapVisible] = useState(true);
  const [videoVisible, setVideoVisible] = useState(false);
  const [instrumentPanelVisible, setInstrumentPanelVisible] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState(0);

  // Flight control states - maps from QGC guided actions
  const [isFlying, setIsFlying] = useState(false);
  const [flightMode, setFlightMode] = useState('MANUAL');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });

  useEffect(() => {
    if (activeVehicle) {
      setConnectionStatus(activeVehicle.connectionStatus);
      setFlightMode(activeVehicle.flightMode || 'MANUAL');
      // Update flying state based on vehicle telemetry
      setIsFlying(activeVehicle.inAir || false);
    }
  }, [activeVehicle]);

  // Flight control functions - maps from QGC guided controller
  const handleTakeoff = async () => {
    if (activeVehicle) {
      try {
        const response = await fetch(`/api/command/takeoff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleId: activeVehicle.id })
        });
        const data = await response.json();
        if (data.success) {
          setNotification({ open: true, message: 'Takeoff command sent successfully!', severity: 'success' });
          setIsFlying(true);
        } else {
          setNotification({ open: true, message: 'Takeoff command failed: ' + (data.message || 'Unknown error'), severity: 'error' });
        }
      } catch (error) {
        setNotification({ open: true, message: 'Takeoff command error: ' + error.message, severity: 'error' });
      }
    } else {
      setNotification({ open: true, message: 'No vehicle connected for takeoff command', severity: 'warning' });
    }
  };

  const handleLand = async () => {
    if (activeVehicle) {
      try {
        const response = await fetch(`/api/command/land`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleId: activeVehicle.id })
        });
        const data = await response.json();
        if (data.success) {
          setNotification({ open: true, message: 'Land command sent successfully!', severity: 'success' });
          setIsFlying(false);
        } else {
          setNotification({ open: true, message: 'Land command failed: ' + (data.message || 'Unknown error'), severity: 'error' });
        }
      } catch (error) {
        setNotification({ open: true, message: 'Land command error: ' + error.message, severity: 'error' });
      }
    } else {
      setNotification({ open: true, message: 'No vehicle connected for land command', severity: 'warning' });
    }
  };

  const handleRTL = async () => {
    if (activeVehicle) {
      try {
        const response = await fetch(`/api/command/rtl`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleId: activeVehicle.id })
        });
        const data = await response.json();
        if (data.success) {
          setNotification({ open: true, message: 'Return to launch command sent successfully!', severity: 'success' });
        } else {
          setNotification({ open: true, message: 'RTL command failed: ' + (data.message || 'Unknown error'), severity: 'error' });
        }
      } catch (error) {
        setNotification({ open: true, message: 'RTL command error: ' + error.message, severity: 'error' });
      }
    } else {
      setNotification({ open: true, message: 'No vehicle connected for RTL command', severity: 'warning' });
    }
  };

  const handlePause = async () => {
    if (activeVehicle) {
      try {
        const response = await fetch(`/api/command/pause`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleId: activeVehicle.id })
        });
        const data = await response.json();
        if (data.success) {
          setNotification({ open: true, message: 'Pause command sent successfully!', severity: 'success' });
        } else {
          setNotification({ open: true, message: 'Pause command failed: ' + (data.message || 'Unknown error'), severity: 'error' });
        }
      } catch (error) {
        setNotification({ open: true, message: 'Pause command error: ' + error.message, severity: 'error' });
      }
    } else {
      setNotification({ open: true, message: 'No vehicle connected for pause command', severity: 'warning' });
    }
  };

  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false });
  };

  // Main content layout - maps from QGC FlyView layout
  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      {/* Debug Info - Remove this in production */}
      {process.env.NODE_ENV === 'development' && (
        <Box sx={{ p: 1, bgcolor: 'grey.100', borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">
            Debug: Active Vehicle: {activeVehicle?.id || 'None'} | 
            Connected: {activeVehicle?.connected ? 'Yes' : 'No'} | 
            Telemetry: {activeVehicle ? 'Available' : 'None'} | 
            Flight Mode: {activeVehicle?.flight_mode || activeVehicle?.flightMode || 'Unknown'} |
            Altitude: {activeVehicle?.position?.alt || activeVehicle?.altitude || 0}m |
            Battery: {activeVehicle?.battery?.remaining || activeVehicle?.batteryLevel || 0}%
          </Typography>
          
          {/* Flight Control Buttons for Testing */}
          {activeVehicle && (
            <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                Flight Controls:
              </Typography>
              <IconButton 
                size="small" 
                onClick={handleTakeoff}
                disabled={!activeVehicle || isFlying}
                title="Takeoff"
                sx={{ bgcolor: 'success.light', color: 'white', '&:hover': { bgcolor: 'success.main' } }}
              >
                <PlayArrow />
              </IconButton>
              <IconButton 
                size="small" 
                onClick={handlePause}
                disabled={!activeVehicle}
                title="Pause"
                sx={{ bgcolor: 'warning.light', color: 'white', '&:hover': { bgcolor: 'warning.main' } }}
              >
                <Pause />
              </IconButton>
              <IconButton 
                size="small" 
                onClick={handleRTL}
                disabled={!activeVehicle}
                title="Return to Launch"
                sx={{ bgcolor: 'info.light', color: 'white', '&:hover': { bgcolor: 'info.main' } }}
              >
                <Home />
              </IconButton>
              <IconButton 
                size="small" 
                onClick={handleLand}
                disabled={!activeVehicle || !isFlying}
                title="Land"
                sx={{ bgcolor: 'error.light', color: 'white', '&:hover': { bgcolor: 'error.main' } }}
              >
                <Stop />
              </IconButton>
            </Box>
          )}
        </Box>
      )}
      
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
          {/* Tabs for right panel */}
          <Tabs value={rightPanelTab} onChange={(_, v) => setRightPanelTab(v)}>
            <Tab label="Instruments" />
            {activeVehicle && <Tab label="MAVLink Inspector" />}
          </Tabs>
          {/* Tab panels */}
          {rightPanelTab === 0 && instrumentPanelVisible && (
            <Box sx={{ flex: 1, p: 2 }}>
              <InstrumentPanel vehicle={activeVehicle} />
            </Box>
          )}
          {rightPanelTab === 1 && activeVehicle && (
            <Box sx={{ flex: 1, p: 2, overflow: 'auto' }}>
              <MavlinkInspector vehicleId={activeVehicle.id} />
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
              label={`${activeVehicle.battery?.remaining || activeVehicle.batteryLevel || 0}%`}
              size="small"
              color={(activeVehicle.battery?.remaining || activeVehicle.batteryLevel || 0) < 20 ? 'error' : 'default'}
            />
            <Chip 
              icon={<GpsFixed />}
              label={`${activeVehicle.gps?.satellites || activeVehicle.gpsSatellites || 0} sats`}
              size="small"
            />
            <Chip 
              icon={<Speed />}
              label={`${activeVehicle.velocity?.airspeed || activeVehicle.airspeed || 0} m/s`}
              size="small"
            />
            <Chip 
              icon={<Height />}
              label={`${activeVehicle.position?.alt || activeVehicle.altitude || 0} m`}
              size="small"
            />
          </>
        )}
      </Box>

      {/* Notification Snackbar */}
      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseNotification} severity={notification.severity} sx={{ width: '100%' }}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default FlightDisplay; 