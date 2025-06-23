import React, { useState, useContext } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Paper,
  Divider
} from '@mui/material';
import {
  Add,
  Delete,
  Edit,
  Upload,
  Download,
  PlayArrow,
  Stop,
  Save,
  Clear,
  Flight,
  LocationOn,
  Speed,
  Height
} from '@mui/icons-material';
import { useVehicles } from '../context/VehicleContext';

// @hallucinated - React component for mission planning
// Maps from QGC PlanView but uses modern React patterns
const MissionPlanning = () => {
  const { activeVehicle } = useVehicles();
  const [waypoints, setWaypoints] = useState([]);
  const [selectedWaypoint, setSelectedWaypoint] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [missionName, setMissionName] = useState('New Mission');
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Sample waypoint data - maps from QGC mission items
  const sampleWaypoints = [
    {
      id: 1,
      type: 'WAYPOINT',
      lat: 37.7749,
      lon: -122.4194,
      altitude: 100,
      speed: 10,
      action: 'NAV_WAYPOINT',
      description: 'Takeoff point'
    },
    {
      id: 2,
      type: 'WAYPOINT',
      lat: 37.7849,
      lon: -122.4094,
      altitude: 150,
      speed: 15,
      action: 'NAV_WAYPOINT',
      description: 'Survey point 1'
    },
    {
      id: 3,
      type: 'WAYPOINT',
      lat: 37.7949,
      lon: -122.3994,
      altitude: 200,
      speed: 12,
      action: 'NAV_WAYPOINT',
      description: 'Survey point 2'
    },
    {
      id: 4,
      type: 'RTL',
      lat: 37.7749,
      lon: -122.4194,
      altitude: 100,
      speed: 10,
      action: 'NAV_RETURN_TO_LAUNCH',
      description: 'Return to launch'
    }
  ];

  // Initialize with sample data
  React.useEffect(() => {
    if (waypoints.length === 0) {
      setWaypoints(sampleWaypoints);
    }
  }, [waypoints.length]);

  const handleAddWaypoint = () => {
    const newWaypoint = {
      id: Date.now(),
      type: 'WAYPOINT',
      lat: 37.7749,
      lon: -122.4194,
      altitude: 100,
      speed: 10,
      action: 'NAV_WAYPOINT',
      description: 'New waypoint'
    };
    setWaypoints([...waypoints, newWaypoint]);
  };

  const handleDeleteWaypoint = (id) => {
    setWaypoints(waypoints.filter(wp => wp.id !== id));
  };

  const handleEditWaypoint = (waypoint) => {
    setSelectedWaypoint(waypoint);
    setEditDialogOpen(true);
  };

  const handleSaveWaypoint = () => {
    if (selectedWaypoint) {
      setWaypoints(waypoints.map(wp => 
        wp.id === selectedWaypoint.id ? selectedWaypoint : wp
      ));
    }
    setEditDialogOpen(false);
    setSelectedWaypoint(null);
  };

  const handleUploadMission = () => {
    setIsUploading(true);
    // @hallucinated - Mission upload functionality
    setTimeout(() => {
      console.log('Mission uploaded to vehicle');
      setIsUploading(false);
    }, 2000);
  };

  const handleDownloadMission = () => {
    setIsDownloading(true);
    // @hallucinated - Mission download functionality
    setTimeout(() => {
      console.log('Mission downloaded from vehicle');
      setIsDownloading(false);
    }, 2000);
  };

  const handleClearMission = () => {
    setWaypoints([]);
  };

  // Waypoint edit dialog - maps from QGC waypoint editor
  const WaypointEditDialog = () => (
    <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Waypoint</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Description"
              value={selectedWaypoint?.description || ''}
              onChange={(e) => setSelectedWaypoint({
                ...selectedWaypoint,
                description: e.target.value
              })}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Latitude"
              type="number"
              value={selectedWaypoint?.lat || 0}
              onChange={(e) => setSelectedWaypoint({
                ...selectedWaypoint,
                lat: parseFloat(e.target.value)
              })}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Longitude"
              type="number"
              value={selectedWaypoint?.lon || 0}
              onChange={(e) => setSelectedWaypoint({
                ...selectedWaypoint,
                lon: parseFloat(e.target.value)
              })}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Altitude (m)"
              type="number"
              value={selectedWaypoint?.altitude || 0}
              onChange={(e) => setSelectedWaypoint({
                ...selectedWaypoint,
                altitude: parseFloat(e.target.value)
              })}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Speed (m/s)"
              type="number"
              value={selectedWaypoint?.speed || 0}
              onChange={(e) => setSelectedWaypoint({
                ...selectedWaypoint,
                speed: parseFloat(e.target.value)
              })}
            />
          </Grid>
          <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel>Action</InputLabel>
              <Select
                value={selectedWaypoint?.action || 'NAV_WAYPOINT'}
                onChange={(e) => setSelectedWaypoint({
                  ...selectedWaypoint,
                  action: e.target.value
                })}
              >
                <MenuItem value="NAV_WAYPOINT">Navigate to Waypoint</MenuItem>
                <MenuItem value="NAV_RETURN_TO_LAUNCH">Return to Launch</MenuItem>
                <MenuItem value="NAV_LAND">Land</MenuItem>
                <MenuItem value="NAV_TAKEOFF">Takeoff</MenuItem>
                <MenuItem value="NAV_LOITER">Loiter</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
        <Button onClick={handleSaveWaypoint} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );

  // Mission summary - maps from QGC mission summary
  const MissionSummary = () => {
    const totalDistance = waypoints.reduce((acc, wp, index) => {
      if (index === 0) return 0;
      const prev = waypoints[index - 1];
      const distance = Math.sqrt(
        Math.pow(wp.lat - prev.lat, 2) + Math.pow(wp.lon - prev.lon, 2)
      ) * 111000; // Rough conversion to meters
      return acc + distance;
    }, 0);

    const estimatedTime = totalDistance / 10; // Assuming 10 m/s average speed

    return (
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Mission Summary
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">
                Waypoints
              </Typography>
              <Typography variant="h6">
                {waypoints.length}
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">
                Total Distance
              </Typography>
              <Typography variant="h6">
                {totalDistance.toFixed(0)} m
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">
                Est. Time
              </Typography>
              <Typography variant="h6">
                {estimatedTime.toFixed(0)} s
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">
                Max Altitude
              </Typography>
              <Typography variant="h6">
                {Math.max(...waypoints.map(wp => wp.altitude))} m
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    );
  };

  // Waypoint list - maps from QGC waypoint list
  const WaypointList = () => (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Waypoints
          </Typography>
          <Button
            startIcon={<Add />}
            variant="contained"
            onClick={handleAddWaypoint}
          >
            Add Waypoint
          </Button>
        </Box>
        
        <List>
          {waypoints.map((waypoint, index) => (
            <React.Fragment key={waypoint.id}>
              <ListItem>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip 
                        label={`#${index + 1}`} 
                        size="small" 
                        color="primary"
                      />
                      <Typography variant="body1">
                        {waypoint.description}
                      </Typography>
                    </Box>
                  }
                  secondary={
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        {waypoint.lat.toFixed(6)}, {waypoint.lon.toFixed(6)} • 
                        Alt: {waypoint.altitude}m • Speed: {waypoint.speed}m/s
                      </Typography>
                      <Chip 
                        label={waypoint.action.replace('NAV_', '')} 
                        size="small" 
                        variant="outlined"
                        sx={{ mt: 0.5 }}
                      />
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton 
                    edge="end" 
                    onClick={() => handleEditWaypoint(waypoint)}
                    sx={{ mr: 1 }}
                  >
                    <Edit />
                  </IconButton>
                  <IconButton 
                    edge="end" 
                    onClick={() => handleDeleteWaypoint(waypoint.id)}
                  >
                    <Delete />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
              {index < waypoints.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </List>
      </CardContent>
    </Card>
  );

  // Mission controls - maps from QGC mission controls
  const MissionControls = () => (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Mission Controls
        </Typography>
        <Grid container spacing={2}>
          <Grid item>
            <Button
              startIcon={<Upload />}
              variant="contained"
              onClick={handleUploadMission}
              disabled={!activeVehicle || isUploading}
            >
              {isUploading ? 'Uploading...' : 'Upload to Vehicle'}
            </Button>
          </Grid>
          <Grid item>
            <Button
              startIcon={<Download />}
              variant="outlined"
              onClick={handleDownloadMission}
              disabled={!activeVehicle || isDownloading}
            >
              {isDownloading ? 'Downloading...' : 'Download from Vehicle'}
            </Button>
          </Grid>
          <Grid item>
            <Button
              startIcon={<Save />}
              variant="outlined"
            >
              Save Mission
            </Button>
          </Grid>
          <Grid item>
            <Button
              startIcon={<Clear />}
              variant="outlined"
              color="error"
              onClick={handleClearMission}
            >
              Clear Mission
            </Button>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Mission Planning
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <MissionSummary />
          <MissionControls />
          <WaypointList />
        </Grid>
        
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Mission Map
              </Typography>
              <Box sx={{ 
                height: 400, 
                bgcolor: 'grey.100', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                borderRadius: 1
              }}>
                <Typography variant="body2" color="text.secondary">
                  Map view coming soon...
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <WaypointEditDialog />
    </Box>
  );
};

export default MissionPlanning; 