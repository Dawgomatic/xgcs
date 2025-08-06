import React, { useState, useEffect } from 'react';
import { Box, Paper, Typography, Chip } from '@mui/material';
import { useVehicles } from '../context/VehicleContext';
import FlightModeSelector from './FlightModeSelector';

const FlightInstruments = () => {
  const { vehicles } = useVehicles();
  const [currentVehicle, setCurrentVehicle] = useState(null);
  const [flightMode, setFlightMode] = useState('MANUAL');

  // Get the first connected vehicle for instrument data
  useEffect(() => {
    const connectedVehicle = vehicles.find(v => v.connected);
    setCurrentVehicle(connectedVehicle || null);
  }, [vehicles]);

  // Default values for demonstration
  const instrumentData = {
    heading: currentVehicle?.heading || 358,
    pitch: currentVehicle?.pitch || 0,
    roll: currentVehicle?.roll || 0,
    altitude: currentVehicle?.altitude || 0,
    airspeed: currentVehicle?.airspeed || 3.9,
    busVoltage: 12.2,
    baroPressure: 29.92,
    gLimit: currentVehicle?.gLimit || false, // Warning indicator
    verticalSpeed: currentVehicle?.verticalSpeed || 0.0,
    groundSpeed: currentVehicle?.groundSpeed || 0
  };

  // Convert degrees to radians
  const degToRad = (degrees) => (degrees * Math.PI) / 180;

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

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 2, 
      p: 2,
      height: '100%',
      backgroundColor: '#1a1a1a'
    }}>
      {/* Main Instrument Panel */}
      <Paper elevation={8} sx={{
        backgroundColor: '#000000',
        borderRadius: '12px',
        border: '2px solid #333333',
        overflow: 'hidden',
        position: 'relative',
        minHeight: '600px',
        width: '100%',
        maxWidth: '400px',
        margin: '0 auto'
      }}>
        {/* Instrument Bezel */}
        <Box sx={{
          position: 'relative',
          width: '100%',
          height: '100%',
          minHeight: '600px',
          backgroundColor: '#000000',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          {/* Corner Screws */}
          <Box sx={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: '#666666',
            border: '1px solid #444444'
          }} />
          <Box sx={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: '#666666',
            border: '1px solid #444444'
          }} />
          <Box sx={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: '#666666',
            border: '1px solid #444444'
          }} />
          <Box sx={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: '#666666',
            border: '1px solid #444444'
          }} />

          {/* Main Display Area */}
          <Box sx={{
            width: '280px',
            height: '280px',
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
              width: '260px',
              height: '260px',
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
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  border: '2px solid #ffffff',
                  backgroundColor: 'transparent'
                }} />
                <Box sx={{
                  width: '2px',
                  height: '30px',
                  backgroundColor: '#ffffff',
                  marginTop: '-15px'
                }} />
                <Box sx={{
                  width: '30px',
                  height: '2px',
                  backgroundColor: '#ffffff',
                  marginTop: '-16px'
                }} />
                <Box sx={{
                  width: 0,
                  height: 0,
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderTop: '8px solid #ffffff',
                  marginTop: '-8px'
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
                  top: '-60px',
                  left: '-20px',
                  width: '40px',
                  height: '2px',
                  backgroundColor: '#ffffff',
                  '&::after': {
                    content: '"10"',
                    position: 'absolute',
                    top: '-15px',
                    left: '15px',
                    color: '#ffffff',
                    fontSize: '10px'
                  }
                }} />
                <Box sx={{
                  position: 'absolute',
                  bottom: '-60px',
                  left: '-20px',
                  width: '40px',
                  height: '2px',
                  backgroundColor: '#ffffff',
                  '&::after': {
                    content: '"10"',
                    position: 'absolute',
                    bottom: '-15px',
                    left: '15px',
                    color: '#ffffff',
                    fontSize: '10px'
                  }
                }} />
                {/* 20 degree marks */}
                <Box sx={{
                  position: 'absolute',
                  top: '-80px',
                  left: '-30px',
                  width: '60px',
                  height: '2px',
                  backgroundColor: '#ffffff',
                  '&::after': {
                    content: '"20"',
                    position: 'absolute',
                    top: '-15px',
                    left: '25px',
                    color: '#ffffff',
                    fontSize: '10px'
                  }
                }} />
                <Box sx={{
                  position: 'absolute',
                  bottom: '-80px',
                  left: '-30px',
                  width: '60px',
                  height: '2px',
                  backgroundColor: '#ffffff',
                  '&::after': {
                    content: '"20"',
                    position: 'absolute',
                    bottom: '-15px',
                    left: '25px',
                    color: '#ffffff',
                    fontSize: '10px'
                  }
                }} />
              </Box>

              {/* Roll Indicator */}
              <Box sx={{
                position: 'absolute',
                top: '10px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 4
              }}>
                <Box sx={{
                  width: '60px',
                  height: '20px',
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
                    height: '8px',
                    backgroundColor: '#ffffff'
                  }} />
                  <Box sx={{
                    position: 'absolute',
                    left: '15px',
                    width: '2px',
                    height: '8px',
                    backgroundColor: '#ffffff'
                  }} />
                  <Box sx={{
                    position: 'absolute',
                    left: '30px',
                    width: '2px',
                    height: '12px',
                    backgroundColor: '#ffffff'
                  }} />
                  <Box sx={{
                    position: 'absolute',
                    left: '45px',
                    width: '2px',
                    height: '8px',
                    backgroundColor: '#ffffff'
                  }} />
                  <Box sx={{
                    position: 'absolute',
                    left: '60px',
                    width: '2px',
                    height: '8px',
                    backgroundColor: '#ffffff'
                  }} />
                </Box>
              </Box>

              {/* Slip/Skid Indicator */}
              <Box sx={{
                position: 'absolute',
                bottom: '10px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 4
              }}>
                <Box sx={{
                  width: '20px',
                  height: '8px',
                  backgroundColor: '#ffffff',
                  borderRadius: '2px'
                }} />
              </Box>
            </Box>
          </Box>

          {/* Flight Mode Selector */}
          <Box sx={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10
          }}>
            <FlightModeSelector 
              flightMode={flightMode}
              onFlightModeChange={setFlightMode}
              availableModes={currentVehicle?.flightModes || []}
            />
          </Box>

          {/* Compass Band */}
          <Box sx={{
            position: 'absolute',
            top: '70px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '220px',
            height: '35px',
            backgroundColor: '#000000',
            border: '1px solid #333333',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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
                fontSize: '16px',
                fontWeight: 'bold',
                zIndex: 1
              }}>
                N {formatHeading(instrumentData.heading)}°
              </Typography>
            </Box>
          </Box>

          {/* Digital Readouts */}
          <Box sx={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            right: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end'
          }}>
            {/* Left side - Airspeed & Bus Voltage */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ color: '#ffffff', fontSize: '12px' }}>IAS</Typography>
                <Typography sx={{ color: '#ffffff', fontSize: '16px', fontWeight: 'bold' }}>
                  {instrumentData.airspeed.toFixed(1)}
                </Typography>
                <Typography sx={{ color: '#ffffff', fontSize: '10px' }}>kts</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ color: '#ffffff', fontSize: '12px' }}>BUSV</Typography>
                <Typography sx={{ color: '#00ff00', fontSize: '14px' }}>
                  {instrumentData.busVoltage.toFixed(1)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ color: '#ffffff', fontSize: '12px' }}>VS</Typography>
                <Typography sx={{ 
                  color: instrumentData.verticalSpeed > 0 ? '#00ff00' : instrumentData.verticalSpeed < 0 ? '#ff0000' : '#ffffff', 
                  fontSize: '12px' 
                }}>
                  {instrumentData.verticalSpeed.toFixed(1)}
                </Typography>
              </Box>
              <Typography sx={{ color: '#ffffff', fontSize: '10px' }}>MENU</Typography>
            </Box>

            {/* Right side - Altitude & Baro */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-end' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ color: '#ffffff', fontSize: '12px' }}>ALT</Typography>
                <Typography sx={{ color: '#ffffff', fontSize: '16px', fontWeight: 'bold' }}>
                  {Math.round(instrumentData.altitude)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ color: '#ffffff', fontSize: '12px' }}>BARO</Typography>
                <Typography sx={{ color: '#00ff00', fontSize: '14px' }}>
                  {instrumentData.baroPressure.toFixed(2)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ color: '#ffffff', fontSize: '12px' }}>GS</Typography>
                <Typography sx={{ color: '#ffffff', fontSize: '12px' }}>
                  {instrumentData.groundSpeed.toFixed(1)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ color: '#ffffff', fontSize: '10px' }}>1:3</Typography>
                <Typography sx={{ color: '#ffffff', fontSize: '10px' }}>100%</Typography>
                <Box sx={{ width: '12px', height: '12px', backgroundColor: '#ffffff', borderRadius: '2px' }} />
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

        {/* Bottom Labels */}
        <Box sx={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '8px 16px',
          backgroundColor: '#000000',
          borderTop: '1px solid #333333'
        }}>
          <Typography sx={{ color: '#ffffff', fontSize: '12px' }}>AV-30</Typography>
          <Typography sx={{ color: '#ffffff', fontSize: '12px' }}>HLD BRT</Typography>
        </Box>
      </Paper>

      {/* Vehicle Status */}
      {currentVehicle && (
        <Paper elevation={3} sx={{
          backgroundColor: '#1a1a1a',
          color: '#ffffff',
          p: 2
        }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Active Vehicle</Typography>
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            Name: {currentVehicle.name || 'Unknown'}
          </Typography>
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            Connected: {currentVehicle.connected ? 'Yes' : 'No'}
          </Typography>
          <Typography variant="body2">
            Position: {currentVehicle.coordinate ? 
              `${currentVehicle.coordinate.lat.toFixed(6)}, ${currentVehicle.coordinate.lon.toFixed(6)}` : 
              'No GPS'
            }
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default FlightInstruments; 