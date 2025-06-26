import React from 'react';
import { 
  Box, 
  Grid, 
  Paper, 
  Typography, 
  Button,
  Card,
  CardContent,
  CardActions,
  Container
} from '@mui/material';
import {
  Flight,
  Map,
  Videocam,
  Settings,
  GpsFixed,
  Memory
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useVehicles } from '../context/VehicleContext';

const HomePage = () => {
  const navigate = useNavigate();
  const { activeVehicle, vehicles } = useVehicles();

  const menuItems = [
    {
      title: 'Flight Display',
      description: 'Real-time flight monitoring and control',
      icon: <Flight sx={{ fontSize: 40 }} />,
      path: '/flight-display',
      color: 'primary'
    },
    {
      title: 'Vehicle Connections',
      description: 'Manage vehicle connections and settings',
      icon: <GpsFixed sx={{ fontSize: 40 }} />,
      path: '/vehicle-connections',
      color: 'secondary'
    },
    {
      title: 'Mission Planning',
      description: 'Plan and upload flight missions',
      icon: <Map sx={{ fontSize: 40 }} />,
      path: '/mission-planning',
      color: 'success'
    },
    {
      title: 'Simulation',
      description: 'Create and manage SITL simulations',
      icon: <Memory sx={{ fontSize: 40 }} />,
      path: '/simulation',
      color: 'info'
    },
    {
      title: 'Video Feed',
      description: 'View vehicle video streams',
      icon: <Videocam sx={{ fontSize: 40 }} />,
      path: '/video',
      color: 'warning'
    },
    {
      title: 'Settings',
      description: 'Configure system settings',
      icon: <Settings sx={{ fontSize: 40 }} />,
      path: '/settings',
      color: 'primary'
    }
  ];

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Typography variant="h3" component="h1" gutterBottom>
          XGCS - Modern Ground Control Station
        </Typography>
        <Typography variant="h6" color="text.secondary" paragraph>
          Professional-grade ground control station for autonomous vehicles
        </Typography>
        
        {/* Connection Status */}
        {activeVehicle && (
          <Paper sx={{ p: 2, mb: 3, bgcolor: 'success.light', color: 'success.contrastText' }}>
            <Typography variant="h6">
              Connected to: {activeVehicle.id}
            </Typography>
            <Typography variant="body2">
              Status: {activeVehicle.connectionStatus} | 
              Flight Mode: {activeVehicle.flightMode || 'UNKNOWN'} |
              Vehicles: {vehicles.length}
            </Typography>
          </Paper>
        )}
      </Box>

      <Grid container spacing={3}>
        {menuItems.map((item) => (
          <Grid item xs={12} sm={6} md={4} key={item.title}>
            <Card 
              sx={{ 
                height: '100%', 
                display: 'flex', 
                flexDirection: 'column',
                transition: 'transform 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 4
                }
              }}
            >
              <CardContent sx={{ flexGrow: 1, textAlign: 'center' }}>
                <Box sx={{ mb: 2, color: `${item.color}.main` }}>
                  {item.icon}
                </Box>
                <Typography variant="h6" component="h2" gutterBottom>
                  {item.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {item.description}
                </Typography>
              </CardContent>
              <CardActions sx={{ justifyContent: 'center', pb: 2 }}>
                <Button 
                  variant="contained" 
                  color={item.color}
                  onClick={() => navigate(item.path)}
                  fullWidth
                >
                  Open {item.title}
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Quick Actions */}
      {activeVehicle && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>
            Quick Actions
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button 
              variant="contained" 
              color="primary"
              onClick={() => navigate('/flight-display')}
              startIcon={<Flight />}
            >
              Go to Flight Display
            </Button>
            <Button 
              variant="outlined" 
              onClick={() => navigate('/vehicle-connections')}
              startIcon={<GpsFixed />}
            >
              Manage Connections
            </Button>
            <Button 
              variant="outlined" 
              onClick={() => navigate('/mission-planning')}
              startIcon={<Map />}
            >
              Plan Mission
            </Button>
          </Box>
        </Box>
      )}
    </Container>
  );
};

export default HomePage; 