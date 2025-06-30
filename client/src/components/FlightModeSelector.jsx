import React, { useState } from 'react';
import {
  Box,
  Button,
  Menu,
  MenuItem,
  Typography,
  Chip,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Flight,
  KeyboardArrowDown,
  Settings
} from '@mui/icons-material';

// @hallucinated - React component for flight mode selection
// Maps from QGC FlightModeDropdown.qml but uses modern React patterns
const FlightModeSelector = ({ 
  flightMode, 
  onFlightModeChange, 
  availableModes = [],
  disabled = false 
}) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleModeSelect = async (mode) => {
    if (typeof onFlightModeChange === 'function') {
      onFlightModeChange(mode);
    }
    // --- Jeremy: Send real API request to backend to set mode ---
    if (window.activeVehicleId) {
      try {
        const response = await fetch(`/api/command/set_mode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleId: window.activeVehicleId, mode })
        });
        const data = await response.json();
        if (data.success) {
          alert('Flight mode change command sent successfully!');
        } else {
          alert('Flight mode change failed: ' + data.message);
        }
      } catch (error) {
        alert('Flight mode change error: ' + error.message);
      }
    }
    handleClose();
  };
  // --- End Jeremy patch for real backend mode change ---

  // Default flight modes if none provided - maps from common QGC modes
  const defaultModes = [
    'MANUAL',
    'STABILIZED', 
    'ALTHOLD',
    'AUTO',
    'RTL',
    'LOITER',
    'GUIDED',
    'ACRO',
    'CIRCLE',
    'LAND'
  ];

  const modes = availableModes.length > 0 ? availableModes : defaultModes;

  // Mode descriptions - maps from QGC flight mode descriptions
  const modeDescriptions = {
    'MANUAL': 'Manual control',
    'STABILIZED': 'Stabilized flight',
    'ALTHOLD': 'Altitude hold',
    'AUTO': 'Autonomous mission',
    'RTL': 'Return to launch',
    'LOITER': 'Loiter around point',
    'GUIDED': 'Guided navigation',
    'ACRO': 'Acrobatic mode',
    'CIRCLE': 'Circle around point',
    'LAND': 'Landing mode'
  };

  // Mode colors - maps from QGC mode indicators
  const getModeColor = (mode) => {
    const colorMap = {
      'MANUAL': 'default',
      'STABILIZED': 'primary',
      'ALTHOLD': 'secondary',
      'AUTO': 'success',
      'RTL': 'warning',
      'LOITER': 'info',
      'GUIDED': 'primary',
      'ACRO': 'error',
      'CIRCLE': 'secondary',
      'LAND': 'warning'
    };
    return colorMap[mode] || 'default';
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {/* Flight mode display */}
      <Chip
        icon={<Flight />}
        label={flightMode || 'UNKNOWN'}
        color={getModeColor(flightMode)}
        variant="outlined"
        size="small"
        sx={{ minWidth: 120 }}
      />

      {/* Mode selector button */}
      <Tooltip title="Select flight mode">
        <IconButton
          size="small"
          onClick={handleClick}
          disabled={disabled}
          sx={{ 
            border: 1, 
            borderColor: 'divider',
            '&:hover': {
              borderColor: 'primary.main'
            }
          }}
        >
          <KeyboardArrowDown />
        </IconButton>
      </Tooltip>

      {/* Flight mode menu */}
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: {
            minWidth: 200,
            maxHeight: 400
          }
        }}
      >
        {modes.map((mode) => (
          <MenuItem
            key={mode}
            onClick={() => handleModeSelect(mode)}
            selected={mode === flightMode}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              py: 1
            }}
          >
            <Box>
              <Typography variant="body2" fontWeight={mode === flightMode ? 'bold' : 'normal'}>
                {mode}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {modeDescriptions[mode] || 'No description'}
              </Typography>
            </Box>
            {mode === flightMode && (
              <Chip 
                label="Current" 
                size="small" 
                color="primary" 
                variant="outlined"
              />
            )}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};

export default FlightModeSelector; 