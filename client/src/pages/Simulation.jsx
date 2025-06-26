import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Grid,
  Chip,
  LinearProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Switch,
  FormControlLabel,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Fab,
  ListItemSecondaryAction
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  Refresh,
  Settings,
  Flight,
  Memory,
  Storage,
  Speed,
  CheckCircle,
  Error,
  Warning,
  Info,
  Delete,
  Download,
  Upload,
  Add,
  Computer,
  NetworkCheck,
  Visibility,
  VisibilityOff
} from '@mui/icons-material';

// @hallucinated - React component for simulation management
// Maps from QGC simulation features but uses modern React patterns
const Simulation = () => {
  const [simulations, setSimulations] = useState([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [newSimulation, setNewSimulation] = useState({
    name: '',
    vehicleType: 'arducopter',
    frameType: 'quad',
    ipAddress: 'localhost',
    port: 5760,
    systemId: 1,
    speedFactor: 1.0,
    enableLogging: true,
    enableVideo: false,
    customParams: '',
    homeLocation: {
      lat: 37.7749,
      lng: -122.4194,
      alt: 0
    }
  });

  // Add logging function
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, message, type };
    console.log(`[Simulation] ${message}`);
    setLogs(prev => [...prev, logEntry]);
  };

  // Vehicle type options
  const vehicleTypes = [
    { value: 'arducopter', label: 'ArduCopter', description: 'Multi-rotor vehicle simulation' },
    { value: 'arduplane', label: 'ArduPlane', description: 'Fixed-wing vehicle simulation' },
    { value: 'ardurover', label: 'ArduRover', description: 'Ground vehicle simulation' },
    { value: 'sub', label: 'ArduSub', description: 'Underwater vehicle simulation' }
  ];

  // Frame type options for ArduCopter
  const frameTypes = [
    { value: 'quad', label: 'Quadcopter (X)' },
    { value: 'hexa', label: 'Hexacopter' },
    { value: 'octa', label: 'Octocopter' },
    { value: 'tri', label: 'Tricopter' },
    { value: 'y6', label: 'Y6' },
    { value: 'firefly', label: 'Firefly' }
  ];

  // Load existing simulations on component mount
  useEffect(() => {
    addLog('Component mounted, loading simulations...');
    loadSimulations();
  }, []);

  // Load simulations from backend
  const loadSimulations = async () => {
    addLog('Fetching simulations from backend...');
    try {
      const response = await fetch('/api/simulation/list');
      addLog(`Backend response status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        addLog(`Loaded ${data.simulations?.length || 0} simulations`);
        setSimulations(data.simulations || []);
      } else {
        const errorText = await response.text();
        addLog(`Failed to load simulations: ${response.status} - ${errorText}`, 'error');
      }
    } catch (error) {
      addLog(`Error loading simulations: ${error.message}`, 'error');
      console.error('Error loading simulations:', error);
    }
  };

  // Add new simulation
  const handleAddSimulation = async () => {
    addLog('Creating new simulation...');
    addLog(`Simulation config: ${JSON.stringify(newSimulation, null, 2)}`);
    
    try {
      const response = await fetch('/api/simulation/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSimulation),
      });

      addLog(`Create simulation response status: ${response.status}`);

      if (response.ok) {
        const data = await response.json();
        addLog(`Simulation created successfully: ${data.simulation?.id}`);
        setSimulations(prev => [...prev, data.simulation]);
        setAddDialogOpen(false);
        resetNewSimulation();
      } else {
        const error = await response.json();
        addLog(`Failed to create simulation: ${error.error}`, 'error');
        alert(`Failed to create simulation: ${error.error}`);
      }
    } catch (error) {
      addLog(`Error creating simulation: ${error.message}`, 'error');
      console.error('Error creating simulation:', error);
      alert('Failed to create simulation');
    }
  };

  // Start simulation
  const startSimulation = async (simulationId) => {
    addLog(`Starting simulation: ${simulationId}`);
    
    try {
      const response = await fetch(`/api/simulation/${simulationId}/start`, {
        method: 'POST',
      });

      addLog(`Start simulation response status: ${response.status}`);

      if (response.ok) {
        const data = await response.json();
        addLog(`Simulation start initiated: ${data.message}`);
        
        // Update local state
        setSimulations(prev => prev.map(sim => 
          sim.id === simulationId 
            ? { ...sim, status: 'starting' }
            : sim
        ));
        
        // Poll for status updates
        pollSimulationStatus(simulationId);
      } else {
        const error = await response.json();
        addLog(`Failed to start simulation: ${error.error}`, 'error');
        alert(`Failed to start simulation: ${error.error}`);
      }
    } catch (error) {
      addLog(`Error starting simulation: ${error.message}`, 'error');
      console.error('Error starting simulation:', error);
      alert('Failed to start simulation');
    }
  };

  // Stop simulation
  const stopSimulation = async (simulationId) => {
    addLog(`Stopping simulation: ${simulationId}`);
    
    try {
      const response = await fetch(`/api/simulation/${simulationId}/stop`, {
        method: 'POST',
      });

      addLog(`Stop simulation response status: ${response.status}`);

      if (response.ok) {
        const data = await response.json();
        addLog(`Simulation stop initiated: ${data.message}`);
        setSimulations(prev => prev.map(sim => 
          sim.id === simulationId 
            ? { ...sim, status: 'stopping' }
            : sim
        ));
      } else {
        const error = await response.json();
        addLog(`Failed to stop simulation: ${error.error}`, 'error');
        alert(`Failed to stop simulation: ${error.error}`);
      }
    } catch (error) {
      addLog(`Error stopping simulation: ${error.message}`, 'error');
      console.error('Error stopping simulation:', error);
      alert('Failed to stop simulation');
    }
  };

  // Delete simulation
  const deleteSimulation = async (simulationId) => {
    if (!window.confirm('Are you sure you want to delete this simulation?')) {
      return;
    }

    addLog(`Deleting simulation: ${simulationId}`);

    try {
      const response = await fetch(`/api/simulation/${simulationId}`, {
        method: 'DELETE',
      });

      addLog(`Delete simulation response status: ${response.status}`);

      if (response.ok) {
        const data = await response.json();
        addLog(`Simulation deleted: ${data.message}`);
        setSimulations(prev => prev.filter(sim => sim.id !== simulationId));
      } else {
        const error = await response.json();
        addLog(`Failed to delete simulation: ${error.error}`, 'error');
        alert(`Failed to delete simulation: ${error.error}`);
      }
    } catch (error) {
      addLog(`Error deleting simulation: ${error.message}`, 'error');
      console.error('Error deleting simulation:', error);
      alert('Failed to delete simulation');
    }
  };

  // Poll simulation status
  const pollSimulationStatus = (simulationId) => {
    addLog(`Starting status polling for simulation: ${simulationId}`);
    
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/simulation/${simulationId}/status`);
        
        if (response.ok) {
          const status = await response.json();
          addLog(`Status update for ${simulationId}: ${status.status} (container: ${status.containerId})`);
          
          setSimulations(prev => prev.map(sim => 
            sim.id === simulationId 
              ? { ...sim, ...status }
              : sim
          ));
          
          if (status.status === 'running' || status.status === 'stopped' || status.status === 'error') {
            addLog(`Stopping status polling for ${simulationId} - final status: ${status.status}`);
            clearInterval(interval);
          }
        } else {
          addLog(`Failed to get status for ${simulationId}: ${response.status}`, 'error');
        }
      } catch (error) {
        addLog(`Error polling simulation status: ${error.message}`, 'error');
        console.error('Error polling simulation status:', error);
        clearInterval(interval);
      }
    }, 2000);
  };

  // Get simulation logs
  const getSimulationLogs = async (simulationId) => {
    addLog(`Fetching logs for simulation: ${simulationId}`);
    
    try {
      const response = await fetch(`/api/simulation/${simulationId}/logs`);
      
      if (response.ok) {
        const data = await response.json();
        addLog(`Retrieved ${data.logs?.length || 0} log entries for ${simulationId}`);
        return data.logs || [];
      } else {
        addLog(`Failed to get logs for ${simulationId}: ${response.status}`, 'error');
        return [];
      }
    } catch (error) {
      addLog(`Error getting logs for ${simulationId}: ${error.message}`, 'error');
      return [];
    }
  };

  // Reset new simulation form
  const resetNewSimulation = () => {
    setNewSimulation({
      name: '',
      vehicleType: 'arducopter',
      frameType: 'quad',
      ipAddress: 'localhost',
      port: 5760,
      systemId: 1,
      speedFactor: 1.0,
      enableLogging: true,
      enableVideo: false,
      customParams: '',
      homeLocation: {
        lat: 37.7749,
        lng: -122.4194,
        alt: 0
      }
    });
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return 'success';
      case 'starting': return 'warning';
      case 'stopping': return 'warning';
      case 'error': return 'error';
      default: return 'default';
    }
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'running': return <CheckCircle />;
      case 'starting': return <Refresh />;
      case 'stopping': return <Refresh />;
      case 'error': return <Error />;
      default: return <Info />;
    }
  };

  // Auto-generate port based on existing simulations
  const getNextPort = () => {
    const usedPorts = simulations.map(sim => sim.port);
    let nextPort = 5760;
    while (usedPorts.includes(nextPort)) {
      nextPort++;
    }
    return nextPort;
  };

  return (
    <Box sx={{ p: 3, height: '100vh', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">
          Simulation Management
        </Typography>
        <Box>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={() => {
              addLog('Manual refresh triggered');
              loadSimulations();
            }}
            sx={{ mr: 1 }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => {
              setNewSimulation(prev => ({ ...prev, port: getNextPort() }));
              setAddDialogOpen(true);
            }}
          >
            Add Simulation
          </Button>
        </Box>
      </Box>

      {/* Logs Section */}
      <Paper sx={{ p: 2, mb: 3, maxHeight: 200, overflow: 'auto' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6">Debug Logs</Typography>
          <Button
            size="small"
            onClick={() => setLogs([])}
            disabled={logs.length === 0}
          >
            Clear Logs
          </Button>
        </Box>
        <Box sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
          {logs.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No logs yet. Create or start a simulation to see activity.
            </Typography>
          ) : (
            logs.slice(-20).map((log, index) => (
              <Box
                key={index}
                sx={{
                  color: log.type === 'error' ? 'error.main' : 
                         log.type === 'warning' ? 'warning.main' : 'text.primary',
                  mb: 0.5
                }}
              >
                <span style={{ color: 'text.secondary' }}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                {' '}
                {log.message}
              </Box>
            ))
          )}
        </Box>
      </Paper>

      {/* Simulations List */}
      <Grid container spacing={3}>
        {simulations.length === 0 ? (
          <Grid item xs={12}>
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No Simulations Created
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Click "Add Simulation" to create your first SITL instance
              </Typography>
              <Button
                variant="outlined"
                startIcon={<Add />}
                onClick={() => {
                  setNewSimulation(prev => ({ ...prev, port: getNextPort() }));
                  setAddDialogOpen(true);
                }}
              >
                Create First Simulation
              </Button>
            </Paper>
          </Grid>
        ) : (
          simulations.map((simulation) => (
            <Grid item xs={12} md={6} lg={4} key={simulation.id}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        {simulation.name || `${simulation.vehicleType} ${simulation.id}`}
                      </Typography>
                      <Chip
                        icon={getStatusIcon(simulation.status)}
                        label={simulation.status?.toUpperCase() || 'UNKNOWN'}
                        color={getStatusColor(simulation.status)}
                        size="small"
                      />
                    </Box>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => deleteSimulation(simulation.id)}
                      title="Delete Simulation"
                    >
                      <Delete />
                    </IconButton>
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Type:</strong> {vehicleTypes.find(v => v.value === simulation.vehicleType)?.label}
                    </Typography>
                    {simulation.vehicleType === 'arducopter' && (
                      <Typography variant="body2" color="text.secondary">
                        <strong>Frame:</strong> {frameTypes.find(f => f.value === simulation.frameType)?.label}
                      </Typography>
                    )}
                    <Typography variant="body2" color="text.secondary">
                      <strong>Connection:</strong> {simulation.ipAddress}:{simulation.port}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Speed:</strong> {simulation.speedFactor}x
                    </Typography>
                  </Box>

                  {simulation.status === 'starting' && (
                    <Box sx={{ width: '100%', mb: 2 }}>
                      <LinearProgress />
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        Starting SITL container...
                      </Typography>
                    </Box>
                  )}

                  {simulation.status === 'running' && simulation.stats && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        <strong>Uptime:</strong> {Math.floor(simulation.stats.uptime / 60)}:{(simulation.stats.uptime % 60).toString().padStart(2, '0')}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        <strong>CPU:</strong> {simulation.stats.cpuUsage?.toFixed(1)}% | <strong>Memory:</strong> {simulation.stats.memoryUsage?.toFixed(1)}%
                      </Typography>
                    </Box>
                  )}

                  {simulation.status === 'error' && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                      Simulation encountered an error
                    </Alert>
                  )}
                </CardContent>

                <CardActions>
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    startIcon={<PlayArrow />}
                    onClick={() => startSimulation(simulation.id)}
                    disabled={simulation.status === 'running' || simulation.status === 'starting'}
                    fullWidth
                  >
                    Start
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    color="error"
                    startIcon={<Stop />}
                    onClick={() => stopSimulation(simulation.id)}
                    disabled={simulation.status === 'stopped' || simulation.status === 'stopping'}
                    fullWidth
                  >
                    Stop
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))
        )}
      </Grid>

      {/* Add Simulation Dialog */}
      <Dialog 
        open={addDialogOpen} 
        onClose={() => setAddDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Add New Simulation</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Simulation Name"
                value={newSimulation.name}
                onChange={(e) => setNewSimulation(prev => ({ ...prev, name: e.target.value }))}
                fullWidth
                helperText="Optional: Give your simulation a friendly name"
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Vehicle Type</InputLabel>
                <Select
                  value={newSimulation.vehicleType}
                  onChange={(e) => setNewSimulation(prev => ({
                    ...prev,
                    vehicleType: e.target.value
                  }))}
                  label="Vehicle Type"
                >
                  {vehicleTypes.map(type => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {newSimulation.vehicleType === 'arducopter' && (
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Frame Type</InputLabel>
                  <Select
                    value={newSimulation.frameType}
                    onChange={(e) => setNewSimulation(prev => ({
                      ...prev,
                      frameType: e.target.value
                    }))}
                    label="Frame Type"
                  >
                    {frameTypes.map(type => (
                      <MenuItem key={type.value} value={type.value}>
                        {type.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}

            <Grid item xs={12} md={6}>
              <TextField
                label="IP Address"
                value={newSimulation.ipAddress}
                onChange={(e) => setNewSimulation(prev => ({ ...prev, ipAddress: e.target.value }))}
                fullWidth
                helperText="IP address for MAVLink connection (default: localhost)"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                label="Port"
                type="number"
                value={newSimulation.port}
                onChange={(e) => setNewSimulation(prev => ({ ...prev, port: parseInt(e.target.value) }))}
                fullWidth
                helperText="MAVLink port (default: 5760)"
                inputProps={{ min: 5760, max: 5800 }}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                label="System ID"
                type="number"
                value={newSimulation.systemId}
                onChange={(e) => setNewSimulation(prev => ({ ...prev, systemId: parseInt(e.target.value) }))}
                fullWidth
                helperText="MAVLink system ID (default: 1)"
                inputProps={{ min: 1, max: 255 }}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                label="Speed Factor"
                type="number"
                value={newSimulation.speedFactor}
                onChange={(e) => setNewSimulation(prev => ({ ...prev, speedFactor: parseFloat(e.target.value) }))}
                fullWidth
                helperText="Simulation speed multiplier"
                inputProps={{ min: 0.1, max: 10, step: 0.1 }}
              />
            </Grid>

            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Home Location
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <TextField
                    label="Latitude"
                    type="number"
                    value={newSimulation.homeLocation.lat}
                    onChange={(e) => setNewSimulation(prev => ({
                      ...prev,
                      homeLocation: {
                        ...prev.homeLocation,
                        lat: parseFloat(e.target.value)
                      }
                    }))}
                    size="small"
                    fullWidth
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label="Longitude"
                    type="number"
                    value={newSimulation.homeLocation.lng}
                    onChange={(e) => setNewSimulation(prev => ({
                      ...prev,
                      homeLocation: {
                        ...prev.homeLocation,
                        lng: parseFloat(e.target.value)
                      }
                    }))}
                    size="small"
                    fullWidth
                  />
                </Grid>
              </Grid>
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={newSimulation.enableLogging}
                    onChange={(e) => setNewSimulation(prev => ({
                      ...prev,
                      enableLogging: e.target.checked
                    }))}
                  />
                }
                label="Enable Logging"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={newSimulation.enableVideo}
                    onChange={(e) => setNewSimulation(prev => ({
                      ...prev,
                      enableVideo: e.target.checked
                    }))}
                  />
                }
                label="Enable Video Feed"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Custom Parameters"
                multiline
                rows={3}
                value={newSimulation.customParams}
                onChange={(e) => setNewSimulation(prev => ({
                  ...prev,
                  customParams: e.target.value
                }))}
                fullWidth
                helperText="Additional SITL parameters (one per line, e.g., SIM_ENABLE=1)"
                placeholder="SIM_ENABLE=1&#10;SIM_GPS_DISABLE=0"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleAddSimulation}
            variant="contained"
            disabled={!newSimulation.vehicleType}
          >
            Create Simulation
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Simulation; 