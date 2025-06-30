import React, { useState, useEffect, useContext } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
  Alert,
  CircularProgress,
  InputAdornment,
  Tooltip
} from '@mui/material';
import {
  Search,
  Refresh,
  Save,
  ExpandMore,
  Edit,
  Check,
  Close,
  Download,
  Upload
} from '@mui/icons-material';
import { useVehicles } from '../context/VehicleContext';

// @hallucinated - React component for parameter management
// Maps from QGC ParameterEditor.qml but uses modern React patterns
const Parameters = () => {
  const { activeVehicle } = useVehicles();
  const [parameters, setParameters] = useState([]);
  const [filteredParameters, setFilteredParameters] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingParam, setEditingParam] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [categories, setCategories] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});

  // Fetch parameters from backend
  const fetchParameters = async () => {
    if (!activeVehicle) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/parameters?vehicleId=${encodeURIComponent(activeVehicle.id)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setParameters(data.parameters || []);
          
          // Group parameters by category
          const grouped = {};
          data.parameters.forEach(param => {
            const category = param.category || 'General';
            if (!grouped[category]) {
              grouped[category] = [];
            }
            grouped[category].push(param);
          });
          setCategories(grouped);
        }
      }
    } catch (error) {
      console.error('Error fetching parameters:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter parameters based on search text
  useEffect(() => {
    if (!searchText.trim()) {
      setFilteredParameters(parameters);
      return;
    }
    
    const filtered = parameters.filter(param =>
      param.name.toLowerCase().includes(searchText.toLowerCase()) ||
      param.description.toLowerCase().includes(searchText.toLowerCase())
    );
    setFilteredParameters(filtered);
  }, [parameters, searchText]);

  // Fetch parameters when vehicle changes
  useEffect(() => {
    fetchParameters();
  }, [activeVehicle]);

  // Save parameter value
  const saveParameter = async (paramName, value) => {
    if (!activeVehicle) return;
    
    try {
      const response = await fetch('/api/parameters/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: activeVehicle.id,
          name: paramName,
          value: parseFloat(value)
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Update local parameter value
          setParameters(prev => prev.map(p => 
            p.name === paramName ? { ...p, value: parseFloat(value) } : p
          ));
          setEditingParam(null);
        }
      }
    } catch (error) {
      console.error('Error saving parameter:', error);
    }
  };

  // Start editing a parameter
  const startEdit = (param) => {
    setEditingParam(param.name);
    setEditValue(param.value.toString());
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingParam(null);
    setEditValue('');
  };

  // Toggle category expansion
  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Export parameters to file
  const exportParameters = () => {
    const dataStr = JSON.stringify(parameters, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `parameters_${activeVehicle?.id || 'vehicle'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!activeVehicle) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          No vehicle connected
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Connect to a vehicle to view and edit parameters
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Parameters - {activeVehicle.id}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<Download />}
            onClick={exportParameters}
            disabled={parameters.length === 0}
          >
            Export
          </Button>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={fetchParameters}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Search Bar */}
      <TextField
        fullWidth
        variant="outlined"
        placeholder="Search parameters..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 3 }}
      />

      {/* Loading State */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Parameters by Category */}
      {!loading && Object.keys(categories).length > 0 && (
        <Box>
          {Object.entries(categories).map(([category, categoryParams]) => {
            const filteredCategoryParams = categoryParams.filter(param =>
              filteredParameters.some(fp => fp.name === param.name)
            );
            
            if (filteredCategoryParams.length === 0) return null;
            
            return (
              <Accordion
                key={category}
                expanded={expandedCategories[category] !== false}
                onChange={() => toggleCategory(category)}
              >
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Typography variant="h6">
                    {category} ({filteredCategoryParams.length})
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell><strong>Parameter</strong></TableCell>
                          <TableCell><strong>Value</strong></TableCell>
                          <TableCell><strong>Units</strong></TableCell>
                          <TableCell><strong>Description</strong></TableCell>
                          <TableCell><strong>Actions</strong></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredCategoryParams.map((param) => (
                          <TableRow key={param.name}>
                            <TableCell>
                              <Typography variant="body2" fontFamily="monospace">
                                {param.name}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              {editingParam === param.name ? (
                                <TextField
                                  size="small"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                      saveParameter(param.name, editValue);
                                    }
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <Typography variant="body2">
                                  {param.value} {param.units}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">
                                {param.units || '-'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">
                                {param.description || 'No description'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              {editingParam === param.name ? (
                                <Box sx={{ display: 'flex', gap: 0.5 }}>
                                  <Tooltip title="Save">
                                    <IconButton
                                      size="small"
                                      onClick={() => saveParameter(param.name, editValue)}
                                      color="primary"
                                    >
                                      <Check />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Cancel">
                                    <IconButton
                                      size="small"
                                      onClick={cancelEdit}
                                      color="error"
                                    >
                                      <Close />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              ) : (
                                <Tooltip title="Edit">
                                  <IconButton
                                    size="small"
                                    onClick={() => startEdit(param)}
                                  >
                                    <Edit />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Box>
      )}

      {/* No Parameters State */}
      {!loading && parameters.length === 0 && (
        <Alert severity="info">
          No parameters found. Make sure the vehicle is connected and supports parameter access.
        </Alert>
      )}
    </Box>
  );
};

export default Parameters; 