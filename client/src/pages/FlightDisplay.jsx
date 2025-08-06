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
  Home,
  Close
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
    <Box sx={{ height: '100vh', width: '100vw', position: 'relative', overflow: 'hidden' }}>
      {/* Full-screen Map */}
      <Box sx={{ 
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1
      }}>
        <FlightMap 
          vehicle={activeVehicle}
          vehicles={vehicles}
        />
      </Box>

      {/* Floating Right Panel - Collapsible */}
      <Box sx={{ 
        position: 'absolute',
        top: 16,
        right: 16,
        width: 320,
        maxHeight: 'calc(100vh - 80px)', // Account for status bar height
        zIndex: 10,
        bgcolor: 'background.paper',
        borderRadius: 2,
        boxShadow: 3,
        border: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Panel Header with Collapse Toggle */}
        <Box sx={{ 
          p: 1, 
          borderBottom: 1, 
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          bgcolor: 'background.default'
        }}>
          <Typography variant="subtitle2">Flight Instruments</Typography>
          <IconButton 
            size="small" 
            onClick={() => setInstrumentPanelVisible(!instrumentPanelVisible)}
            title={instrumentPanelVisible ? "Hide Panel" : "Show Panel"}
          >
            {instrumentPanelVisible ? <Close /> : <Settings />}
          </IconButton>
        </Box>

        {/* Panel Content */}
        {instrumentPanelVisible && (
          <>
            {/* Tabs for right panel */}
            <Tabs value={rightPanelTab} onChange={(_, v) => setRightPanelTab(v)} size="small">
              <Tab label="Instruments" />
              {activeVehicle && <Tab label="MAVLink Inspector" />}
            </Tabs>
            
            {/* Tab panels */}
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              {rightPanelTab === 0 && (
                <Box sx={{ height: '100%', overflow: 'auto' }}>
                  <InstrumentPanel vehicle={activeVehicle} />
                </Box>
              )}
              {rightPanelTab === 1 && activeVehicle && (
                <Box sx={{ height: '100%', overflow: 'auto' }}>
                  <MavlinkInspector vehicleId={activeVehicle.id} />
                </Box>
              )}
            </Box>

            {/* Video Panel - maps from QGC FlyViewVideo */}
            {videoVisible && (
              <Box sx={{ height: 240, p: 1, borderTop: 1, borderColor: 'divider' }}>
                <VideoPanel vehicle={activeVehicle} />
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Floating Status Bar */}
      <Box sx={{ 
        position: 'absolute',
        bottom: 16,
        left: 16,
        right: 352, // Leave space for the instrument panel (320px + 16px margin + 16px gap)
        zIndex: 10,
        bgcolor: 'background.paper',
        borderRadius: 2,
        boxShadow: 3,
        border: 1,
        borderColor: 'divider',
        p: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        flexWrap: 'wrap'
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