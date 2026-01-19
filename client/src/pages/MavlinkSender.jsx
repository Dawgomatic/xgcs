import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Card,
  CardContent,
  Alert,
  Chip,
  Divider,
  Accordion,
  AccordionDetails,
  IconButton,
  Tooltip,
  Snackbar,
  CircularProgress
} from '@mui/material';
import {
  Send,
  ExpandMore,
  Save,
  Delete,
  Add,
  Code,
  History
} from '@mui/icons-material';
import { useVehicles } from '../context/VehicleContext';

// @hallucinated - React component for MAVLink message sending
// Maps from QGC custom MAVLink message sending but uses modern React patterns
const MavlinkSender = () => {
  const { activeVehicle } = useVehicles();
  const [selectedMessage, setSelectedMessage] = useState('');
  const [messageParams, setMessageParams] = useState({});
  const [savedMessages, setSavedMessages] = useState([]);
  const [messageHistory, setMessageHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'success' });

  const handleCloseNotification = () => setNotification({ ...notification, open: false });
  const showNotification = (message, severity = 'success') => {
    setNotification({ open: true, message, severity });
  };

  // Common MAVLink messages with their parameter descriptions
  const mavlinkMessages = {
    'HEARTBEAT': {
      description: 'Heartbeat message',
      params: {
        type: { label: 'Type', type: 'number', default: 1, description: 'MAV_TYPE' },
        autopilot: { label: 'Autopilot', type: 'number', default: 3, description: 'MAV_AUTOPILOT' },
        base_mode: { label: 'Base Mode', type: 'number', default: 0, description: 'System mode bitfield' },
        custom_mode: { label: 'Custom Mode', type: 'number', default: 0, description: 'Custom mode' },
        system_status: { label: 'System Status', type: 'number', default: 3, description: 'MAV_STATE' }
      }
    },
    'COMMAND_LONG': {
      description: 'Long command message',
      params: {
        target_system: { label: 'Target System', type: 'number', default: 1, description: 'System ID' },
        target_component: { label: 'Target Component', type: 'number', default: 1, description: 'Component ID' },
        command: { label: 'Command', type: 'number', default: 0, description: 'MAV_CMD' },
        confirmation: { label: 'Confirmation', type: 'number', default: 0, description: 'Confirmation' },
        param1: { label: 'Param 1', type: 'number', default: 0, description: 'Parameter 1' },
        param2: { label: 'Param 2', type: 'number', default: 0, description: 'Parameter 2' },
        param3: { label: 'Param 3', type: 'number', default: 0, description: 'Parameter 3' },
        param4: { label: 'Param 4', type: 'number', default: 0, description: 'Parameter 4' },
        param5: { label: 'Param 5', type: 'number', default: 0, description: 'Parameter 5' },
        param6: { label: 'Param 6', type: 'number', default: 0, description: 'Parameter 6' },
        param7: { label: 'Param 7', type: 'number', default: 0, description: 'Parameter 7' }
      }
    },
    'SET_MODE': {
      description: 'Set system mode',
      params: {
        target_system: { label: 'Target System', type: 'number', default: 1, description: 'System ID' },
        base_mode: { label: 'Base Mode', type: 'number', default: 0, description: 'System mode bitfield' },
        custom_mode: { label: 'Custom Mode', type: 'number', default: 0, description: 'Custom mode' }
      }
    },
    'PARAM_SET': {
      description: 'Set parameter value',
      params: {
        target_system: { label: 'Target System', type: 'number', default: 1, description: 'System ID' },
        target_component: { label: 'Target Component', type: 'number', default: 1, description: 'Component ID' },
        param_id: { label: 'Parameter ID', type: 'text', default: '', description: 'Parameter name' },
        param_value: { label: 'Parameter Value', type: 'number', default: 0, description: 'Parameter value' },
        param_type: { label: 'Parameter Type', type: 'number', default: 9, description: 'MAV_PARAM_TYPE' }
      }
    },
    'PARAM_REQUEST_READ': {
      description: 'Request parameter read',
      params: {
        target_system: { label: 'Target System', type: 'number', default: 1, description: 'System ID' },
        target_component: { label: 'Target Component', type: 'number', default: 1, description: 'Component ID' },
        param_id: { label: 'Parameter ID', type: 'text', default: '', description: 'Parameter name' },
        param_index: { label: 'Parameter Index', type: 'number', default: -1, description: 'Parameter index' }
      }
    },
    'COMMAND_ACK': {
      description: 'Command acknowledgment',
      params: {
        command: { label: 'Command', type: 'number', default: 0, description: 'MAV_CMD' },
        result: { label: 'Result', type: 'number', default: 0, description: 'MAV_RESULT' },
        progress: { label: 'Progress', type: 'number', default: 0, description: 'Progress' },
        result_param2: { label: 'Result Param 2', type: 'number', default: 0, description: 'Result parameter 2' },
        target_system: { label: 'Target System', type: 'number', default: 0, description: 'System ID' },
        target_component: { label: 'Target Component', type: 'number', default: 0, description: 'Component ID' }
      }
    },
    'STATUSTEXT': {
      description: 'Status text message',
      params: {
        severity: { label: 'Severity', type: 'number', default: 6, description: 'Severity level' },
        text: { label: 'Text', type: 'text', default: 'Test message', description: 'Status text' },
        id: { label: 'ID', type: 'number', default: 0, description: 'Message ID' },
        chunk_seq: { label: 'Chunk Sequence', type: 'number', default: 0, description: 'Chunk sequence' }
      }
    }
  };

  // Initialize parameters when message type changes
  useEffect(() => {
    if (selectedMessage && mavlinkMessages[selectedMessage]) {
      const params = {};
      Object.entries(mavlinkMessages[selectedMessage].params).forEach(([key, config]) => {
        params[key] = config.default;
      });
      setMessageParams(params);
    }
  }, [selectedMessage]);

  // Load saved messages from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('mavlink_saved_messages');
    if (saved) {
      try {
        setSavedMessages(JSON.parse(saved));
      } catch (error) {
        console.error('Error loading saved messages:', error);
      }
    }
  }, []);

  // Save message to localStorage
  const saveMessage = () => {
    if (!selectedMessage) return;

    const messageName = prompt('Enter a name for this message:');
    if (!messageName) return;

    const newSavedMessage = {
      name: messageName,
      type: selectedMessage,
      params: { ...messageParams },
      timestamp: new Date().toISOString()
    };

    const updated = [...savedMessages, newSavedMessage];
    setSavedMessages(updated);
    localStorage.setItem('mavlink_saved_messages', JSON.stringify(updated));
  };

  // Load saved message
  const loadSavedMessage = (savedMessage) => {
    setSelectedMessage(savedMessage.type);
    setMessageParams(savedMessage.params);
  };

  // Delete saved message
  const deleteSavedMessage = (index) => {
    const updated = savedMessages.filter((_, i) => i !== index);
    setSavedMessages(updated);
    localStorage.setItem('mavlink_saved_messages', JSON.stringify(updated));
  };

  // Send MAVLink message
  const sendMessage = async () => {
    if (!activeVehicle) {
      showNotification('No active vehicle connected', 'error');
      return;
    }
    if (!selectedMessage) {
      showNotification('Please select a message type', 'warning');
      return;
    }

    // Validation: Check if required numeric fields are valid numbers
    const currentParams = mavlinkMessages[selectedMessage].params;
    for (const [key, config] of Object.entries(currentParams)) {
      if (config.type === 'number') {
        const val = messageParams[key];
        if (val === '' || isNaN(Number(val))) {
          showNotification(`Invalid value for ${config.label}`, 'error');
          return;
        }
      }
    }

    setLoading(true);
    try {
      const response = await fetch('/api/mavlink/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: activeVehicle.id,
          messageType: selectedMessage,
          parameters: messageParams
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Add to history
        const historyEntry = {
          type: selectedMessage,
          params: { ...messageParams },
          timestamp: new Date().toISOString(),
          success: true
        };
        setMessageHistory(prev => [historyEntry, ...prev.slice(0, 49)]); // Keep last 50

        showNotification('Message sent successfully!', 'success');
      } else {
        showNotification('Failed to send: ' + (data.error || 'Unknown error'), 'error');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      showNotification('Network error: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Update parameter value
  const updateParam = (paramName, value) => {
    setMessageParams(prev => ({
      ...prev,
      [paramName]: value
    }));
  };

  if (!activeVehicle) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          No vehicle connected
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Connect to a vehicle to send MAVLink messages
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          MAVLink Message Sender - {activeVehicle.id}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<History />}
          onClick={() => setShowHistory(!showHistory)}
        >
          {showHistory ? 'Hide' : 'Show'} History
        </Button>
      </Box>

      <Grid container spacing={3}>
        {/* Message Configuration */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Message Configuration
              </Typography>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Message Type</InputLabel>
                <Select
                  value={selectedMessage}
                  onChange={(e) => setSelectedMessage(e.target.value)}
                  label="Message Type"
                >
                  {Object.entries(mavlinkMessages).map(([type, config]) => (
                    <MenuItem key={type} value={type}>
                      {type} - {config.description}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {selectedMessage && mavlinkMessages[selectedMessage] && (
                <>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {mavlinkMessages[selectedMessage].description}
                  </Typography>

                  <Grid container spacing={2}>
                    {Object.entries(mavlinkMessages[selectedMessage].params).map(([paramName, config]) => (
                      <Grid item xs={12} sm={6} key={paramName}>
                        <TextField
                          fullWidth
                          label={config.label}
                          type={config.type}
                          value={messageParams[paramName] || ''}
                          onChange={(e) => updateParam(paramName, e.target.value)}
                          helperText={config.description}
                          size="small"
                        />
                      </Grid>
                    ))}
                  </Grid>

                  <Box sx={{ mt: 3, display: 'flex', gap: 1 }}>
                    <Button
                      variant="contained"
                      startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Send />}
                      onClick={sendMessage}
                      color="primary"
                      disabled={loading}
                    >
                      {loading ? 'Sending...' : 'Send Message'}
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<Save />}
                      onClick={saveMessage}
                      disabled={loading}
                    >
                      Save Message
                    </Button>
                  </Box>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Saved Messages */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Saved Messages
              </Typography>

              {savedMessages.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No saved messages. Create and save messages for quick access.
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {savedMessages.map((saved, index) => (
                    <Paper key={index} variant="outlined" sx={{ p: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                          <Typography variant="body2" fontWeight="bold">
                            {saved.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {saved.type}
                          </Typography>
                        </Box>
                        <Box>
                          <Tooltip title="Load">
                            <IconButton
                              size="small"
                              onClick={() => loadSavedMessage(saved)}
                            >
                              <Code />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              onClick={() => deleteSavedMessage(index)}
                              color="error"
                            >
                              <Delete />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                    </Paper>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Message History */}
        {showHistory && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Message History
                </Typography>

                {messageHistory.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No message history. Send messages to see them here.
                  </Typography>
                ) : (
                  <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                    {messageHistory.map((entry, index) => (
                      <Paper key={index} variant="outlined" sx={{ p: 1, mb: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Box>
                            <Typography variant="body2" fontWeight="bold">
                              {entry.type}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(entry.timestamp).toLocaleString()}
                            </Typography>
                          </Box>
                          <Chip
                            label={entry.success ? 'Success' : 'Failed'}
                            color={entry.success ? 'success' : 'error'}
                            size="small"
                          />
                        </Box>
                      </Paper>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={handleCloseNotification} severity={notification.severity} sx={{ width: '100%' }}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MavlinkSender;