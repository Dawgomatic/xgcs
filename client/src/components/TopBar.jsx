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
  ListItemText
} from '@mui/material';
import {
  Menu as MenuIcon,
  Settings,
  Flight,
  Map,
  SignalCellular4Bar,
  GpsFixed,
  Memory,
  Code
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useVehicles } from '../context/VehicleContext';


const TopBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState(null);
  const { activeVehicle, vehicles } = useVehicles();
  
  // Flight control states
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  // Update flight states when active vehicle changes
  React.useEffect(() => {
    if (activeVehicle) {
      setConnectionStatus(activeVehicle.connectionStatus || 'disconnected');
    }
  }, [activeVehicle]);

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





  const isFlightPage = location.pathname === '/flight-display' || location.pathname === '/';

  const menuItems = [
    { text: 'Flight Display', icon: <Flight />, path: '/' },
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