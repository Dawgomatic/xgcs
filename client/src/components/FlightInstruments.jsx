import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  Chip, 
  TextField, 
  IconButton,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Divider
} from '@mui/material';
import { Edit, Save, Cancel } from '@mui/icons-material';
import { useVehicles } from '../context/VehicleContext';
import FlightModeSelector from './FlightModeSelector';

// Individual Vehicle Instrument Card Component
const VehicleInstrumentCard = ({ vehicle, onNameChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(vehicle.name || `Vehicle ${vehicle.id}`);
  const [flightMode, setFlightMode] = useState(vehicle.flightMode || 'MANUAL');

  // Instrument data for this vehicle
  const instrumentData = {
    heading: vehicle.heading || 358,
    pitch: vehicle.pitch || 0,
    roll: vehicle.roll || 0,
    altitude: vehicle.altitude || 0,
    airspeed: vehicle.airspeed || 64,
    busVoltage: vehicle.battery?.voltage || 12.2,
    baroPressure: vehicle.baroPressure || 29.92,
    gLimit: vehicle.gLimit || false,
    verticalSpeed: vehicle.verticalSpeed || 0.0,
    groundSpeed: vehicle.groundSpeed || 0,
    batteryLevel: vehicle.battery?.remaining || vehicle.batteryLevel || 0,
    gpsSatellites: vehicle.gps?.satellites || vehicle.gpsSatellites || 0
  };

  // Format heading for compass display
  const formatHeading = (heading) => {
    const normalized = ((heading % 360) + 360) % 360;
    return Math.round(normalized);
  };

  // Get cardinal direction
  const getCardinalDirection = (heading) => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(heading / 22.5) % 16;
    return directions[index];
  };

  const handleSaveName = () => {
    onNameChange(vehicle.id, editedName);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedName(vehicle.name || `Vehicle ${vehicle.id}`);
    setIsEditing(false);
  };

  return (
    <Card sx={{ 
      minHeight: 300,
      backgroundColor: '#000000',
      border: vehicle.connected ? '2px solid #4caf50' : '2px solid #666666',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <CardHeader
        sx={{
          backgroundColor: '#1a1a1a',
          color: '#ffffff',
          '& .MuiCardHeader-content': {
            minWidth: 0
          }
        }}
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip 
              label={`SYS ${vehicle.systemId || vehicle.id}`}
              size="small"
              sx={{ 
                backgroundColor: vehicle.connected ? '#4caf50' : '#666666',
                color: '#ffffff',
                fontSize: '10px'
              }}
            />
            <IconButton 
              size="small" 
              onClick={() => setIsEditing(!isEditing)}
              sx={{ color: '#ffffff' }}
            >
              <Edit />
            </IconButton>
          </Box>
        }
        title={
          isEditing ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TextField
                size="small"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                sx={{ 
                  '& .MuiInputBase-root': {
                    color: '#ffffff',
                    '& fieldset': { borderColor: '#ffffff' },
                    '&:hover fieldset': { borderColor: '#ffffff' },
                    '&.Mui-focused fieldset': { borderColor: '#ffffff' }
                  },
                  '& .MuiInputBase-input': {
                    color: '#ffffff',
                    fontSize: '14px'
                  }
                }}
                autoFocus
              />
              <IconButton size="small" onClick={handleSaveName} sx={{ color: '#4caf50' }}>
                <Save />
              </IconButton>
              <IconButton size="small" onClick={handleCancelEdit} sx={{ color: '#ff5722' }}>
                <Cancel />
              </IconButton>
            </Box>
          ) : (
            <Typography variant="h6" sx={{ color: '#ffffff', fontSize: '14px' }}>
              {vehicle.name || `Vehicle ${vehicle.id}`}
            </Typography>
          )
        }
      />

      <CardContent sx={{ p: 0, backgroundColor: '#000000', height: 250 }}>
        <Box sx={{ 
          display: 'flex', 
          height: '100%',
          position: 'relative'
        }}>
          {/* Left Side - Airspeed and Bus Voltage */}
          <Box sx={{ 
            width: '120px', 
            p: 2, 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'space-between',
            borderRight: '1px solid #333333'
          }}>
            {/* Airspeed */}
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ color: '#ffffff', fontSize: '12px', mb: 1 }}>IAS</Typography>
              <Typography sx={{ color: '#ffffff', fontSize: '24px', fontWeight: 'bold' }}>
                {instrumentData.airspeed.toFixed(0)}
              </Typography>
              <Typography sx={{ color: '#ffffff', fontSize: '10px' }}>kts</Typography>
              {/* Speed indicator bar */}
              <Box sx={{ 
                width: '8px', 
                height: '60px', 
                backgroundColor: '#333333', 
                margin: '8px auto',
                position: 'relative',
                borderRadius: '4px'
              }}>
                <Box sx={{
                  position: 'absolute',
                  bottom: 0,
                  width: '100%',
                  height: `${Math.min((instrumentData.airspeed / 100) * 100, 100)}%`,
                  backgroundColor: '#4caf50',
                  borderRadius: '4px'
                }} />
              </Box>
            </Box>

            {/* Bus Voltage */}
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ color: '#ffffff', fontSize: '10px' }}>BUSV</Typography>
              <Typography sx={{ color: '#4caf50', fontSize: '16px', fontWeight: 'bold' }}>
                {instrumentData.busVoltage.toFixed(1)}
              </Typography>
            </Box>

            {/* Menu indicator */}
            <Typography sx={{ color: '#ffffff', fontSize: '10px', textAlign: 'center' }}>MENU</Typography>
          </Box>

          {/* Center - Artificial Horizon */}
          <Box sx={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column',
            position: 'relative'
          }}>
            {/* Compass Band */}
            <Box sx={{
              height: '35px',
              backgroundColor: '#000000',
              border: '1px solid #333333',
              borderRadius: '4px',
              margin: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* Compass markings */}
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                position: 'relative'
              }}>
                {/* Compass tick marks */}
                <Box sx={{
                  position: 'absolute',
                  left: '10px',
                  width: '2px',
                  height: '8px',
                  backgroundColor: '#ffffff'
                }} />
                <Box sx={{
                  position: 'absolute',
                  left: '30px',
                  width: '2px',
                  height: '8px',
                  backgroundColor: '#ffffff'
                }} />
                <Box sx={{
                  position: 'absolute',
                  left: '50px',
                  width: '2px',
                  height: '12px',
                  backgroundColor: '#ffffff'
                }} />
                <Box sx={{
                  position: 'absolute',
                  left: '70px',
                  width: '2px',
                  height: '8px',
                  backgroundColor: '#ffffff'
                }} />
                <Box sx={{
                  position: 'absolute',
                  left: '90px',
                  width: '2px',
                  height: '8px',
                  backgroundColor: '#ffffff'
                }} />
                <Box sx={{
                  position: 'absolute',
                  left: '110px',
                  width: '2px',
                  height: '12px',
                  backgroundColor: '#ffffff'
                }} />
                <Box sx={{
                  position: 'absolute',
                  left: '130px',
                  width: '2px',
                  height: '8px',
                  backgroundColor: '#ffffff'
                }} />
                <Box sx={{
                  position: 'absolute',
                  left: '150px',
                  width: '2px',
                  height: '8px',
                  backgroundColor: '#ffffff'
                }} />
                <Box sx={{
                  position: 'absolute',
                  left: '170px',
                  width: '2px',
                  height: '8px',
                  backgroundColor: '#ffffff'
                }} />
                
                {/* Current heading indicator */}
                <Box sx={{
                  position: 'absolute',
                  top: '0px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 0,
                  height: 0,
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderTop: '10px solid #ff00ff',
                  zIndex: 2
                }} />
                
                {/* Compass text */}
                <Typography sx={{
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  zIndex: 1
                }}>
                  {getCardinalDirection(instrumentData.heading)} {formatHeading(instrumentData.heading)}°
                </Typography>
              </Box>
            </Box>

            {/* Artificial Horizon */}
            <Box sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              margin: '8px'
            }}>
              <Box sx={{
                width: '200px',
                height: '200px',
                borderRadius: '50%',
                backgroundColor: '#000000',
                border: '3px solid #333333',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {/* Horizon Display */}
                <Box sx={{
                  width: '180px',
                  height: '180px',
                  borderRadius: '50%',
                  position: 'relative',
                  overflow: 'hidden',
                  transform: `rotate(${instrumentData.roll}deg)`,
                  transition: 'transform 0.1s ease-out'
                }}>
                  {/* Sky */}
                  <Box sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '50%',
                    backgroundColor: '#0066cc',
                    transform: `translateY(${instrumentData.pitch * 2}px)`,
                    transition: 'transform 0.1s ease-out'
                  }} />
                  
                  {/* Ground */}
                  <Box sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '50%',
                    backgroundColor: '#8B4513',
                    transform: `translateY(${instrumentData.pitch * 2}px)`,
                    transition: 'transform 0.1s ease-out'
                  }} />

                  {/* Horizon Line */}
                  <Box sx={{
                    position: 'absolute',
                    top: '50%',
                    left: 0,
                    right: 0,
                    height: '3px',
                    backgroundColor: '#ffffff',
                    transform: 'translateY(-50%)',
                    zIndex: 2
                  }} />

                  {/* Aircraft Symbol */}
                  <Box sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center'
                  }}>
                    <Box sx={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      border: '2px solid #ffffff',
                      backgroundColor: 'transparent'
                    }} />
                    <Box sx={{
                      width: '2px',
                      height: '24px',
                      backgroundColor: '#ffffff',
                      marginTop: '-12px'
                    }} />
                    <Box sx={{
                      width: '24px',
                      height: '2px',
                      backgroundColor: '#ffffff',
                      marginTop: '-13px'
                    }} />
                    <Box sx={{
                      width: 0,
                      height: 0,
                      borderLeft: '5px solid transparent',
                      borderRight: '5px solid transparent',
                      borderTop: '6px solid #ffffff',
                      marginTop: '-6px'
                    }} />
                  </Box>

                  {/* Pitch Scale */}
                  <Box sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 1
                  }}>
                    {/* 10 degree marks */}
                    <Box sx={{
                      position: 'absolute',
                      top: '-50px',
                      left: '-15px',
                      width: '30px',
                      height: '2px',
                      backgroundColor: '#ffffff',
                      '&::after': {
                        content: '"10"',
                        position: 'absolute',
                        top: '-12px',
                        left: '10px',
                        color: '#ffffff',
                        fontSize: '8px'
                      }
                    }} />
                    <Box sx={{
                      position: 'absolute',
                      bottom: '-50px',
                      left: '-15px',
                      width: '30px',
                      height: '2px',
                      backgroundColor: '#ffffff',
                      '&::after': {
                        content: '"10"',
                        position: 'absolute',
                        bottom: '-12px',
                        left: '10px',
                        color: '#ffffff',
                        fontSize: '8px'
                      }
                    }} />
                    {/* 20 degree marks */}
                    <Box sx={{
                      position: 'absolute',
                      top: '-65px',
                      left: '-20px',
                      width: '40px',
                      height: '2px',
                      backgroundColor: '#ffffff',
                      '&::after': {
                        content: '"20"',
                        position: 'absolute',
                        top: '-12px',
                        left: '15px',
                        color: '#ffffff',
                        fontSize: '8px'
                      }
                    }} />
                    <Box sx={{
                      position: 'absolute',
                      bottom: '-65px',
                      left: '-20px',
                      width: '40px',
                      height: '2px',
                      backgroundColor: '#ffffff',
                      '&::after': {
                        content: '"20"',
                        position: 'absolute',
                        bottom: '-12px',
                        left: '15px',
                        color: '#ffffff',
                        fontSize: '8px'
                      }
                    }} />
                  </Box>

                  {/* Roll Indicator */}
                  <Box sx={{
                    position: 'absolute',
                    top: '8px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 4
                  }}>
                    <Box sx={{
                      width: '50px',
                      height: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative'
                    }}>
                      {/* Roll tick marks */}
                      <Box sx={{
                        position: 'absolute',
                        left: '0px',
                        width: '2px',
                        height: '6px',
                        backgroundColor: '#ffffff'
                      }} />
                      <Box sx={{
                        position: 'absolute',
                        left: '12px',
                        width: '2px',
                        height: '6px',
                        backgroundColor: '#ffffff'
                      }} />
                      <Box sx={{
                        position: 'absolute',
                        left: '24px',
                        width: '2px',
                        height: '10px',
                        backgroundColor: '#ffffff'
                      }} />
                      <Box sx={{
                        position: 'absolute',
                        left: '36px',
                        width: '2px',
                        height: '6px',
                        backgroundColor: '#ffffff'
                      }} />
                      <Box sx={{
                        position: 'absolute',
                        left: '48px',
                        width: '2px',
                        height: '6px',
                        backgroundColor: '#ffffff'
                      }} />
                    </Box>
                  </Box>

                  {/* Slip/Skid Indicator */}
                  <Box sx={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 4
                  }}>
                    <Box sx={{
                      width: '16px',
                      height: '6px',
                      backgroundColor: '#ffffff',
                      borderRadius: '2px'
                    }} />
                  </Box>
                </Box>
              </Box>
            </Box>

            {/* Warning Message */}
            {instrumentData.gLimit && (
              <Box sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: '#ff6600',
                color: '#ffffff',
                padding: '4px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                zIndex: 5
              }}>
                G LIMIT
              </Box>
            )}
          </Box>

          {/* Right Side - Altitude and Baro */}
          <Box sx={{ 
            width: '120px', 
            p: 2, 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'space-between',
            borderLeft: '1px solid #333333'
          }}>
            {/* Altitude */}
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ color: '#ffffff', fontSize: '12px', mb: 1 }}>ALT</Typography>
              <Typography sx={{ color: '#ffffff', fontSize: '24px', fontWeight: 'bold' }}>
                {Math.round(instrumentData.altitude)}
              </Typography>
            </Box>

            {/* Barometric Pressure */}
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ color: '#ffffff', fontSize: '10px' }}>BARO</Typography>
              <Typography sx={{ color: '#4caf50', fontSize: '16px', fontWeight: 'bold' }}>
                {instrumentData.baroPressure.toFixed(2)}
              </Typography>
            </Box>

            {/* Status indicators */}
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ color: '#ffffff', fontSize: '10px' }}>1:3</Typography>
              <Typography sx={{ color: '#ffffff', fontSize: '10px' }}>100%</Typography>
              <Box sx={{ 
                width: '12px', 
                height: '12px', 
                backgroundColor: '#ffffff', 
                borderRadius: '2px',
                margin: '4px auto'
              }} />
            </Box>
          </Box>
        </Box>

        {/* Bottom Control Panel */}
        <Box sx={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '8px 16px',
          backgroundColor: '#000000',
          borderTop: '1px solid #333333'
        }}>
          <Typography sx={{ color: '#ffffff', fontSize: '12px' }}>AV-30</Typography>
          <Typography sx={{ color: '#ffffff', fontSize: '12px' }}>PUSH-SET</Typography>
          <Typography sx={{ color: '#ffffff', fontSize: '12px' }}>HLD BRT</Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

const FlightInstruments = () => {
  const { vehicles } = useVehicles();
  const [vehicleNames, setVehicleNames] = useState({});

  // Handle vehicle name changes
  const handleNameChange = (vehicleId, newName) => {
    setVehicleNames(prev => ({
      ...prev,
      [vehicleId]: newName
    }));
  };

  return (
    <Box sx={{ 
      height: '100%',
      overflow: 'auto',
      p: 2,
      backgroundColor: '#1a1a1a'
    }}>
      <Typography variant="h6" sx={{ color: '#ffffff', mb: 2 }}>
        Flight Instruments ({vehicles.length} vehicles)
      </Typography>
      
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {vehicles.map(vehicle => (
          <VehicleInstrumentCard 
            key={vehicle.id}
            vehicle={vehicle}
            onNameChange={handleNameChange}
          />
        ))}
      </Box>

      {vehicles.length === 0 && (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '200px',
          color: '#ffffff'
        }}>
          <Typography>No vehicles connected</Typography>
        </Box>
      )}
    </Box>
  );
};

export default FlightInstruments; 