import React, { useContext } from 'react';
import { 
  Box, 
  Card, 
  CardContent, 
  Typography, 
  LinearProgress,
  Grid,
  Paper,
  Chip
} from '@mui/material';
import {
  Battery90,
  Speed,
  GpsFixed,
  SignalCellular4Bar,
  CompassCalibration,
  Flight,
  Height,
  SatelliteAlt
} from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { VehicleContext } from '../context/VehicleContext';

// @hallucinated - React component for instrument panel
// Maps from QGC FlyViewInstrumentPanel.qml but uses modern React patterns
const InstrumentPanel = ({ vehicle }) => {
  if (!vehicle) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No vehicle connected
        </Typography>
      </Box>
    );
  }

  // Artificial horizon component - maps from QGC QGCArtificialHorizon
  const ArtificialHorizon = () => {
    const roll = vehicle.roll || 0;
    const pitch = vehicle.pitch || 0;
    
    return (
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Artificial Horizon
          </Typography>
          <Box sx={{ 
            width: '100%', 
            height: 120, 
            bgcolor: 'primary.main',
            borderRadius: 1,
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Horizon line */}
            <Box sx={{
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              height: 2,
              bgcolor: 'white',
              transform: `translateY(-50%) rotate(${roll}deg) translateY(${pitch * 2}px)`,
              transition: 'transform 0.1s ease-out'
            }} />
            
            {/* Center indicator */}
            <Box sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 20,
              height: 20,
              border: '2px solid white',
              borderRadius: '50%',
              transform: 'translate(-50%, -50%)'
            }} />
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
            <Typography variant="caption">Roll: {roll.toFixed(1)}°</Typography>
            <Typography variant="caption">Pitch: {pitch.toFixed(1)}°</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  };

  // Compass component - maps from QGC QGCCompassWidget
  const Compass = () => {
    const heading = vehicle.heading || 0;
    
    return (
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Compass
          </Typography>
          <Box sx={{ 
            width: '100%', 
            height: 100, 
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Box sx={{
              width: 80,
              height: 80,
              border: '3px solid #ccc',
              borderRadius: '50%',
              position: 'relative',
              transform: `rotate(${-heading}deg)`,
              transition: 'transform 0.1s ease-out'
            }}>
              {/* North indicator */}
              <Box sx={{
                position: 'absolute',
                top: 0,
                left: '50%',
                width: 0,
                height: 0,
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderBottom: '20px solid red',
                transform: 'translateX(-50%)'
              }} />
              
              {/* Cardinal directions */}
              <Typography sx={{
                position: 'absolute',
                top: 5,
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '12px',
                color: 'red',
                fontWeight: 'bold'
              }}>
                N
              </Typography>
              
              <Typography sx={{
                position: 'absolute',
                bottom: 5,
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '12px'
              }}>
                S
              </Typography>
              
              <Typography sx={{
                position: 'absolute',
                left: 5,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '12px'
              }}>
                W
              </Typography>
              
              <Typography sx={{
                position: 'absolute',
                right: 5,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '12px'
              }}>
                E
              </Typography>
            </Box>
          </Box>
          <Typography variant="body2" align="center">
            {heading.toFixed(1)}°
          </Typography>
        </CardContent>
      </Card>
    );
  };

  // Telemetry values - maps from QGC TelemetryValuesBar
  const TelemetryValues = () => {
    const telemetryData = [
      {
        label: 'Altitude',
        value: vehicle.altitude || 0,
        unit: 'm',
        icon: <Height />,
        color: 'primary'
      },
      {
        label: 'Speed',
        value: vehicle.airspeed || 0,
        unit: 'm/s',
        icon: <Speed />,
        color: 'secondary'
      },
      {
        label: 'Battery',
        value: vehicle.batteryLevel || 0,
        unit: '%',
        icon: <Battery90 />,
        color: vehicle.batteryLevel < 20 ? 'error' : 'success'
      },
      {
        label: 'GPS',
        value: vehicle.gpsSatellites || 0,
        unit: 'sats',
        icon: <GpsFixed />,
        color: 'info'
      }
    ];

    return (
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Telemetry
          </Typography>
          <Grid container spacing={2}>
            {telemetryData.map((item, index) => (
              <Grid item xs={6} key={index}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {item.icon}
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {item.label}
                    </Typography>
                    <Typography variant="body2" color={`${item.color}.main`}>
                      {item.value.toFixed(1)} {item.unit}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
    );
  };

  // Flight mode display - maps from QGC FlightModeIndicator
  const FlightModeDisplay = () => (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Flight />
          <Typography variant="h6">
            Flight Mode
          </Typography>
        </Box>
        <Typography variant="h4" color="primary" gutterBottom>
          {vehicle.flightMode || 'UNKNOWN'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {vehicle.flightModeDescription || 'No description available'}
        </Typography>
      </CardContent>
    </Card>
  );

  // Connection status - maps from QGC connection indicators
  const ConnectionStatus = () => (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <SignalCellular4Bar />
          <Typography variant="h6">
            Connection
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            bgcolor: vehicle.connectionStatus === 'connected' ? 'success.main' : 'error.main'
          }} />
          <Typography variant="body2">
            {vehicle.connectionStatus || 'disconnected'}
          </Typography>
        </Box>
        {vehicle.connectionStatus === 'connected' && (
          <Typography variant="caption" color="text.secondary">
            Signal strength: {vehicle.signalStrength || 'N/A'}
          </Typography>
        )}
      </CardContent>
    </Card>
  );

  // Altitude chart - maps from QGC altitude tracking
  const AltitudeChart = () => {
    // @hallucinated - Sample altitude data
    const altitudeData = [
      { time: '0s', altitude: 0 },
      { time: '10s', altitude: 25 },
      { time: '20s', altitude: 50 },
      { time: '30s', altitude: 75 },
      { time: '40s', altitude: 100 },
      { time: '50s', altitude: vehicle.altitude || 100 }
    ];

    return (
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Altitude History
          </Typography>
          <Box sx={{ height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={altitudeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="altitude" 
                  stroke="#8884d8" 
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <FlightModeDisplay />
      <ConnectionStatus />
      <ArtificialHorizon />
      <Compass />
      <TelemetryValues />
      <AltitudeChart />
    </Box>
  );
};

export default InstrumentPanel; 