import React, { useState } from 'react';
import { 
  AppBar, 
  Toolbar, 
  Typography, 
  IconButton, 
  Box,
  Chip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Switch,
  FormControlLabel
} from '@mui/material';
import {
  Menu as MenuIcon,
  Settings,
  Flight,
  Map,
  PlayArrow,
  Pause,
  Stop,
  Home,
  SignalCellular4Bar,
  GpsFixed,
  Replay,
  Memory,
  Code
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useVehicles } from '../context/VehicleContext';
import FlightModeSelector from './FlightModeSelector';

const TopBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState(null);
  const [isLive, setIsLive] = useState(true);
  const { activeVehicle, vehicles } = useVehicles();
  
  // Flight control states
  const [isFlying, setIsFlying] = useState(false);
  const [flightMode, setFlightMode] = useState('MANUAL');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  // Update flight states when active vehicle changes
  React.useEffect(() => {
    if (activeVehicle) {
      setConnectionStatus(activeVehicle.connectionStatus || 'disconnected');
      setFlightMode(activeVehicle.flightMode || 'MANUAL');
    }
  }, [activeVehicle]);

  const toggleMode = () => {
    setIsLive(!isLive);
  };

  const handleMenuClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleNavigation = (path) => {
    navigate(path);
    handleMenuClose();
  };

  // Flight control functions
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
          alert('Takeoff command sent successfully!');
          setIsFlying(true);
        } else {
          alert('Takeoff command failed: ' + data.message);
        }
      } catch (error) {
        alert('Takeoff command error: ' + error.message);
      }
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
          alert('Land command sent successfully!');
          setIsFlying(false);
        } else {
          alert('Land command failed: ' + data.message);
        }
      } catch (error) {
        alert('Land command error: ' + error.message);
      }
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
          alert('RTL command sent successfully!');
        } else {
          alert('RTL command failed: ' + data.message);
        }
      } catch (error) {
        alert('RTL command error: ' + error.message);
      }
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
          alert('Pause command sent successfully!');
        } else {
          alert('Pause command failed: ' + data.message);
        }
      } catch (error) {
        alert('Pause command error: ' + error.message);
      }
    }
  };

  const isFlightPage = location.pathname === '/flight-display';

  const menuItems = [
    { text: 'Home', icon: <Home />, path: '/' },
    { text: 'Flight Display', icon: <Flight />, path: '/flight-display' },
    { text: 'Vehicle Connections', icon: <GpsFixed />, path: '/vehicle-connections' },
    { text: 'Mission Planning', icon: <Map />, path: '/mission-planning' },
    { text: 'Simulation', icon: <Memory />, path: '/simulation' },
    { text: 'Parameters', icon: <Settings />, path: '/parameters' },
    { text: 'MAVLink Sender', icon: <Code />, path: '/mavlink-sender' },
    { text: 'Settings', icon: <Settings />, path: '/settings' },
  ];

  return (
    <AppBar position="static" color="primary" elevation={2}>
      <Toolbar>
        <IconButton
          edge="start"
          color="inherit"
          aria-label="menu"
          onClick={handleMenuClick}
          sx={{ mr: 2 }}
        >
          <MenuIcon />
        </IconButton>
        
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          XGCS - Modern Ground Control Station
        </Typography>

        {/* Connection Status - Show on all pages */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mr: 2 }}>
          <Chip 
            icon={<SignalCellular4Bar />}
            label={connectionStatus}
            color={connectionStatus === 'connected' ? 'success' : 'error'}
            size="small"
          />
        </Box>

        <FormControlLabel
          control={
            <Switch
              checked={isLive}
              onChange={toggleMode}
              color="inherit"
            />
          }
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {isLive ? <PlayArrow /> : <Replay />}
              {isLive ? 'Live' : 'Replay'}
            </Box>
          }
          sx={{ color: 'inherit' }}
        />

        {/* Flight Controls - Only show on flight pages */}
        {isFlightPage && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mr: 2 }}>
            {/* Flight Mode */}
            <FlightModeSelector 
              flightMode={flightMode}
              onFlightModeChange={setFlightMode}
              availableModes={activeVehicle?.flightModes || []}
            />

            {/* Flight Controls */}
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <IconButton 
                color="inherit" 
                onClick={handleTakeoff}
                disabled={!activeVehicle || isFlying}
                title="Takeoff"
                size="small"
              >
                <PlayArrow />
              </IconButton>
              <IconButton 
                color="inherit" 
                onClick={handlePause}
                disabled={!activeVehicle}
                title="Pause"
                size="small"
              >
                <Pause />
              </IconButton>
              <IconButton 
                color="inherit" 
                onClick={handleRTL}
                disabled={!activeVehicle}
                title="Return to Launch"
                size="small"
              >
                <Home />
              </IconButton>
              <IconButton 
                color="inherit" 
                onClick={handleLand}
                disabled={!activeVehicle || !isFlying}
                title="Land"
                size="small"
              >
                <Stop />
              </IconButton>
            </Box>
          </Box>
        )}

        {/* Settings Button */}
        <IconButton
          color="inherit"
          onClick={() => navigate('/settings')}
          title="Settings"
        >
          <Settings />
        </IconButton>

        {/* Navigation Menu */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'left',
          }}
        >
          {menuItems.map((item) => (
            <MenuItem 
              key={item.text}
              onClick={() => handleNavigation(item.path)}
              sx={{
                '&:hover': {
                  bgcolor: 'action.hover'
                }
              }}
            >
              <ListItemIcon>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.text} />
            </MenuItem>
          ))}
        </Menu>
      </Toolbar>
    </AppBar>
  );
};

export default TopBar; 