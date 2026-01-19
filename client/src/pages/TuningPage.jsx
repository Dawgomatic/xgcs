import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Typography,
    Grid,
    Paper,
    Slider,
    TextField,
    Button,
    Tabs,
    Tab,
    Alert
} from '@mui/material';
import { useVehicles } from '../context/VehicleContext';
import RealTimePlotter from '../components/analysis/RealTimePlotter';
import { debounce } from 'lodash';

// Mapping of Common ArduCopter Tuning Parameters
const TUNING_PARAMS = {
    ROLL: {
        P: 'ATC_RAT_RLL_P',
        I: 'ATC_RAT_RLL_I',
        D: 'ATC_RAT_RLL_D',
        plot: { actual: 'ATTITUDE.roll', target: 'ATTITUDE_TARGET.body_roll' }
    },
    PITCH: {
        P: 'ATC_RAT_PIT_P',
        I: 'ATC_RAT_PIT_I',
        D: 'ATC_RAT_PIT_D',
        plot: { actual: 'ATTITUDE.pitch', target: 'ATTITUDE_TARGET.body_pitch' }
    },
    YAW: {
        P: 'ATC_RAT_YAW_P',
        I: 'ATC_RAT_YAW_I',
        D: 'ATC_RAT_YAW_D',
        plot: { actual: 'ATTITUDE.yaw', target: 'ATTITUDE_TARGET.body_yaw' }
    }
};

const TuningPage = () => {
    const { activeVehicle } = useVehicles();
    const [axis, setAxis] = useState('ROLL');
    const [params, setParams] = useState({ P: 0, I: 0, D: 0 });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [unsavedChanges, setUnsavedChanges] = useState(false);

    // Fetch current parameters when axis changes
    useEffect(() => {
        if (!activeVehicle) return;

        const fetchParams = async () => {
            setLoading(true);
            setError('');
            try {
                const mapping = TUNING_PARAMS[axis];
                const newParams = { ...params };

                // Parallel fetch for P, I, D
                await Promise.all(['P', 'I', 'D'].map(async (term) => {
                    const paramId = mapping[term];
                    const res = await fetch(`/api/parameters/read?vehicleId=${activeVehicle.id}&name=${paramId}`);
                    const data = await res.json();
                    if (data.success && data.parameter) {
                        newParams[term] = data.parameter.value;
                    }
                }));

                setParams(newParams);
                setUnsavedChanges(false);
            } catch (err) {
                console.error("Param fetch error:", err);
                setError("Failed to load parameters. Is vehicle connected?");
            } finally {
                setLoading(false);
            }
        };

        fetchParams();
    }, [axis, activeVehicle]);

    // Debounced Write Function
    const debouncedWrite = useCallback(
        debounce(async (term, value) => {
            if (!activeVehicle) return;
            const paramId = TUNING_PARAMS[axis][term];
            try {
                await fetch('/api/parameters/set', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vehicleId: activeVehicle.id,
                        name: paramId,
                        value: Number(value)
                    })
                });
                console.log(`Updated ${paramId} to ${value}`);
            } catch (err) {
                console.error(`Failed to update ${paramId}`, err);
                setError(`Failed to write ${paramId}`);
            }
        }, 500),
        [axis, activeVehicle]
    );

    const handleSliderChange = (term) => (event, newValue) => {
        setParams(prev => ({ ...prev, [term]: newValue }));
        setUnsavedChanges(true); // Visual indicator only, we write immediately via debounce
        debouncedWrite(term, newValue);
    };

    const handleInputChange = (term) => (event) => {
        const val = event.target.value === '' ? '' : Number(event.target.value);
        setParams(prev => ({ ...prev, [term]: val }));
        debouncedWrite(term, val);
    };

    if (!activeVehicle) {
        return <Alert severity="warning">Please connect a vehicle to access Tuning.</Alert>;
    }

    return (
        <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h5" gutterBottom>PID Tuning</Typography>

            {/* Axis Selection */}
            <Tabs value={axis} onChange={(_, v) => setAxis(v)} sx={{ mb: 2 }}>
                <Tab value="ROLL" label="Roll Rate" />
                <Tab value="PITCH" label="Pitch Rate" />
                <Tab value="YAW" label="Yaw Rate" />
            </Tabs>

            <Grid container spacing={2} sx={{ flex: 1, minHeight: 0 }}>

                {/* Sliders Panel */}
                <Grid item xs={12} md={4} sx={{ overflowY: 'auto' }}>
                    <Paper sx={{ p: 2 }}>
                        {['P', 'I', 'D'].map((term) => (
                            <Box key={term} sx={{ mb: 4 }}>
                                <Grid container justifyContent="space-between" alignItems="center">
                                    <Typography variant="subtitle1" fontWeight="bold">
                                        {term} Gain ({TUNING_PARAMS[axis][term]})
                                    </Typography>
                                    <TextField
                                        size="small"
                                        value={params[term]}
                                        onChange={handleInputChange(term)}
                                        type="number"
                                        inputProps={{ step: 0.001, min: 0, max: 2 }}
                                        sx={{ width: 80 }}
                                    />
                                </Grid>
                                <Slider
                                    value={Number(params[term]) || 0}
                                    onChange={handleSliderChange(term)}
                                    min={0}
                                    max={term === 'D' ? 0.1 : 1.0} // D gain usually lower range
                                    step={0.001}
                                    valueLabelDisplay="auto"
                                />
                            </Box>
                        ))}

                        <Alert severity="info" sx={{ mt: 2 }}>
                            Values are written automatically (debounced 500ms).
                        </Alert>
                    </Paper>
                </Grid>

                {/* Real-time Plotter Panel */}
                <Grid item xs={12} md={8} sx={{ height: '100%' }}>
                    <Paper sx={{ p: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="subtitle2" gutterBottom>Step Response (Desired vs Actual)</Typography>
                        <Box sx={{ flex: 1, minHeight: 0 }}>
                            <RealTimePlotter
                                fields={[
                                    { path: TUNING_PARAMS[axis].plot.actual, color: '#8884d8', name: 'Actual' },
                                    { path: TUNING_PARAMS[axis].plot.target, color: '#82ca9d', name: 'Desired' }
                                ]}
                                height="100%"
                            />
                        </Box>
                    </Paper>
                </Grid>

            </Grid>
        </Box>
    );
};

export default TuningPage;
