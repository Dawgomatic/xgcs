import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Paper,
    Grid,
    TextField,
    Button,
    Alert,
    CircularProgress,
    Divider
} from '@mui/material';
import { Save, Refresh, BatteryStd } from '@mui/icons-material';
import { useVehicles } from '../../context/VehicleContext';

const PowerSetup = () => {
    const { activeVehicle } = useVehicles();
    const [loading, setLoading] = useState(false);
    const [params, setParams] = useState({
        BATT_MONITOR: 0,
        BATT_VOLT_MULT: 0,
        BATT_AMP_PERVLT: 0,
        BATT_CAPACITY: 0,
        BATT_LOW_VOLT: 0
    });
    const [message, setMessage] = useState(null);

    // Fetch existing battery parameters
    const fetchParams = async () => {
        if (!activeVehicle) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/parameters?vehicleId=${activeVehicle.id}`);
            const data = await res.json();

            // Extract battery params from full list
            // Note: Parameter names might vary slightly by firmware (PX4 vs ArduPilot)
            // This implementation targets common ArduPilot names
            const newParams = { ...params };
            if (data.success && data.parameters) {
                // Find params in the list
                const findParam = (name) => data.parameters.find(p => p.name === name)?.value || 0;

                newParams.BATT_MONITOR = findParam('BATT_MONITOR');
                newParams.BATT_VOLT_MULT = findParam('BATT_VOLT_MULT');
                newParams.BATT_AMP_PERVLT = findParam('BATT_AMP_PERVLT');
                newParams.BATT_CAPACITY = findParam('BATT_CAPACITY');
                newParams.BATT_LOW_VOLT = findParam('BATT_LOW_VOLT');

                setParams(newParams);
            }
        } catch (e) {
            console.error(e);
            setMessage({ type: 'error', text: 'Failed to load parameters' });
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchParams();
    }, [activeVehicle]);

    const handleSave = async (paramName, value) => {
        if (!activeVehicle) return;
        try {
            const res = await fetch('/api/parameters/set', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vehicleId: activeVehicle.id,
                    name: paramName,
                    value: parseFloat(value)
                })
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: 'success', text: `Saved ${paramName}` });
                // Update local state
                setParams(prev => ({ ...prev, [paramName]: parseFloat(value) }));
            } else {
                throw new Error(data.message);
            }
        } catch (e) {
            setMessage({ type: 'error', text: `Failed to save ${paramName}: ${e.message}` });
        }
    };

    const DividerCalculator = () => {
        const [measured, setMeasured] = useState(0);
        const [current, setCurrent] = useState(0); // vehicle reported

        const calculate = () => {
            // New Divider = Old Divider * (Measured / Reported)
            if (current === 0) return;
            const newDivider = params.BATT_VOLT_MULT * (measured / current);
            return newDivider.toFixed(4);
        };

        return (
            <Box sx={{ mt: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                <Typography variant="subtitle2">Voltage Divider Calculator</Typography>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={6}>
                        <TextField
                            label="Measured Voltage"
                            type="number"
                            size="small"
                            fullWidth
                            value={measured}
                            onChange={(e) => setMeasured(e.target.value)}
                        />
                    </Grid>
                    <Grid item xs={6}>
                        <TextField
                            label="Reported Voltage"
                            type="number"
                            size="small"
                            fullWidth
                            value={current}
                            onChange={(e) => setCurrent(e.target.value)}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <Button variant="outlined" size="small" onClick={() => {
                            const newVal = calculate();
                            if (newVal) handleSave('BATT_VOLT_MULT', newVal);
                        }}>
                            Apply Calculated Divider
                        </Button>
                    </Grid>
                </Grid>
            </Box>
        );
    };

    if (!activeVehicle) return <Alert severity="info">Connect vehicle to configure power.</Alert>;

    return (
        <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <BatteryStd sx={{ mr: 1 }} />
                <Typography variant="h6">Power Configuration</Typography>
                <Box sx={{ flexGrow: 1 }} />
                <Button startIcon={<Refresh />} onClick={fetchParams}>Refresh</Button>
            </Box>

            {loading && <LinearProgress sx={{ mb: 2 }} />}

            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <TextField
                        fullWidth
                        label="Battery Capacity (mAh)"
                        type="number"
                        value={params.BATT_CAPACITY}
                        onChange={(e) => setParams({ ...params, BATT_CAPACITY: e.target.value })}
                        onBlur={(e) => handleSave('BATT_CAPACITY', e.target.value)}
                        helperText="Total capacity of the battery"
                    />
                </Grid>
                <Grid item xs={12} md={6}>
                    <TextField
                        fullWidth
                        label="Low Voltage Warning (V)"
                        type="number"
                        value={params.BATT_LOW_VOLT}
                        onChange={(e) => setParams({ ...params, BATT_LOW_VOLT: e.target.value })}
                        onBlur={(e) => handleSave('BATT_LOW_VOLT', e.target.value)}
                        helperText="Failsafe/Warning trigger voltage"
                    />
                </Grid>

                <Grid item xs={12}>
                    <Divider sx={{ my: 1 }}>Sensor Calibration</Divider>
                </Grid>

                <Grid item xs={12} md={6}>
                    <TextField
                        fullWidth
                        label="Voltage Divider (BATT_VOLT_MULT)"
                        type="number"
                        value={params.BATT_VOLT_MULT}
                        onChange={(e) => setParams({ ...params, BATT_VOLT_MULT: e.target.value })}
                        onBlur={(e) => handleSave('BATT_VOLT_MULT', e.target.value)}
                        inputProps={{ step: 0.1 }}
                    />
                    <DividerCalculator />
                </Grid>

                <Grid item xs={12} md={6}>
                    <TextField
                        fullWidth
                        label="Amps per Volt (BATT_AMP_PERVLT)"
                        type="number"
                        value={params.BATT_AMP_PERVLT}
                        onChange={(e) => setParams({ ...params, BATT_AMP_PERVLT: e.target.value })}
                        onBlur={(e) => handleSave('BATT_AMP_PERVLT', e.target.value)}
                        inputProps={{ step: 0.1 }}
                    />
                </Grid>
            </Grid>

            {message && (
                <Alert severity={message.type} sx={{ mt: 2 }} onClose={() => setMessage(null)}>
                    {message.text}
                </Alert>
            )}
        </Paper>
    );
};

export default PowerSetup;
