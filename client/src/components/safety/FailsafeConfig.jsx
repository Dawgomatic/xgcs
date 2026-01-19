import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    IconButton,
    Button,
    CircularProgress,
    Tooltip
} from '@mui/material';
import {
    Check,
    Close,
    Edit,
    Refresh,
    Warning
} from '@mui/icons-material';
import { useVehicles } from '../../context/VehicleContext';

const FailsafeConfig = () => {
    const { activeVehicle } = useVehicles();
    const [parameters, setParameters] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editingParam, setEditingParam] = useState(null);
    const [editValue, setEditValue] = useState('');

    const fetchParameters = async () => {
        if (!activeVehicle) return;
        setLoading(true);
        try {
            const response = await fetch(`/api/parameters?vehicleId=${encodeURIComponent(activeVehicle.id)}`);
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    // Filter for Failsafe related parameters
                    const fsParams = data.parameters.filter(p =>
                        p.name.includes('FS_') ||
                        p.name.includes('BATT_FS') ||
                        p.name.includes('FAILSAFE') ||
                        p.name.includes('BATT_LOW') ||
                        p.name.includes('BATT_CRT')
                    );
                    setParameters(fsParams);
                }
            }
        } catch (error) {
            console.error('Error fetching parameters:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchParameters();
    }, [activeVehicle]);

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
                setParameters(prev => prev.map(p =>
                    p.name === paramName ? { ...p, value: parseFloat(value) } : p
                ));
                setEditingParam(null);
            }
        } catch (error) {
            console.error('Error saving parameter:', error);
        }
    };

    const startEdit = (param) => {
        setEditingParam(param.name);
        setEditValue(param.value.toString());
    };

    const cancelEdit = () => {
        setEditingParam(null);
        setEditValue('');
    };

    if (!activeVehicle) return <Typography>No vehicle connected.</Typography>;

    // Grouping
    const groups = {
        'Battery Failsafe': parameters.filter(p => p.name.includes('BATT')),
        'Radio/Throttle': parameters.filter(p => p.name.includes('THR') || p.name.includes('RADIO')),
        'GCS Failsafe': parameters.filter(p => p.name.includes('GCS')),
        'Other': parameters.filter(p => !p.name.includes('BATT') && !p.name.includes('THR') && !p.name.includes('RADIO') && !p.name.includes('GCS'))
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Failsafe Parameters</Typography>
                <Button startIcon={<Refresh />} size="small" onClick={fetchParameters} disabled={loading}>Refresh</Button>
            </Box>

            {loading ? <CircularProgress size={24} /> : (
                Object.entries(groups).map(([group, params]) => (
                    params.length > 0 && (
                        <Paper key={group} variant="outlined" sx={{ mb: 2, p: 1 }}>
                            <Typography variant="subtitle2" sx={{ bgcolor: 'action.hover', p: 0.5, mb: 1 }}>{group}</Typography>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Parameter</TableCell>
                                            <TableCell>Value</TableCell>
                                            <TableCell>Action</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {params.map(param => (
                                            <TableRow key={param.name}>
                                                <TableCell component="th" scope="row">
                                                    <Tooltip title={param.description || ''}>
                                                        <Typography variant="body2" sx={{ cursor: 'help', textDecoration: 'underline dotted' }}>
                                                            {param.name}
                                                        </Typography>
                                                    </Tooltip>
                                                </TableCell>
                                                <TableCell>
                                                    {editingParam === param.name ? (
                                                        <TextField
                                                            size="small"
                                                            value={editValue}
                                                            onChange={(e) => setEditValue(e.target.value)}
                                                            type="number"
                                                            sx={{ width: 100 }}
                                                        />
                                                    ) : (
                                                        param.value
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {editingParam === param.name ? (
                                                        <Box>
                                                            <IconButton size="small" color="primary" onClick={() => saveParameter(param.name, editValue)}><Check /></IconButton>
                                                            <IconButton size="small" color="error" onClick={cancelEdit}><Close /></IconButton>
                                                        </Box>
                                                    ) : (
                                                        <IconButton size="small" onClick={() => startEdit(param)}><Edit /></IconButton>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    )
                ))
            )}

            {parameters.length === 0 && !loading && (
                <Typography color="text.secondary">No Failsafe parameters found matching filter.</Typography>
            )}
        </Box>
    );
};

export default FailsafeConfig;
