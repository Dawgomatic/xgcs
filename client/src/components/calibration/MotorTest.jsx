import React, { useState } from 'react';
import {
    Box,
    Typography,
    Paper,
    Slider,
    Button,
    Grid,
    Alert,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TextField
} from '@mui/material';
import { Warning, PlayArrow, Stop } from '@mui/icons-material';
import { useVehicles } from '../../context/VehicleContext';

const MotorTest = () => {
    const { activeVehicle } = useVehicles();
    const [motorIndex, setMotorIndex] = useState(1);
    const [throttle, setThrottle] = useState(5);
    const [duration, setDuration] = useState(3);
    const [isTesting, setIsTesting] = useState(false);
    const [message, setMessage] = useState(null);

    const handleRunTest = async () => {
        if (!activeVehicle) return;

        setIsTesting(true);
        setMessage(null);

        try {
            const response = await fetch('/api/command/motor_test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vehicleId: activeVehicle.id,
                    motorIndex: motorIndex,
                    throttle: throttle,
                    timeout: duration
                })
            });
            const data = await response.json();

            if (data.success) {
                setMessage({ type: 'success', text: `Motor ${motorIndex} test command sent.` });
            } else {
                setMessage({ type: 'error', text: 'Command failed: ' + (data.error || 'Unknown error') });
            }
        } catch (e) {
            setMessage({ type: 'error', text: 'Network error: ' + e.message });
        }

        // Reset state after duration + buffer
        setTimeout(() => setIsTesting(false), (duration * 1000) + 500);
    };

    if (!activeVehicle) {
        return (
            <Alert severity="warning">Please connect a vehicle to perform motor tests.</Alert>
        );
    }

    return (
        <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
                Motor Test
            </Typography>
            <Alert severity="warning" sx={{ mb: 3 }}>
                <Typography variant="body2" fontWeight="bold">
                    DANGER: Propellers may spin at high speed!
                </Typography>
                Ensure propellers are removed or vehicle is secured before testing.
            </Alert>

            <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                    <FormControl fullWidth>
                        <InputLabel>Motor Index</InputLabel>
                        <Select
                            value={motorIndex}
                            label="Motor Index"
                            onChange={(e) => setMotorIndex(e.target.value)}
                        >
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                                <MenuItem key={i} value={i}>Motor {i}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Grid>
                <Grid item xs={12} md={4}>
                    <TextField
                        label="Duration (sec)"
                        type="number"
                        fullWidth
                        value={duration}
                        onChange={(e) => setDuration(parseInt(e.target.value))}
                        inputProps={{ min: 1, max: 10 }}
                    />
                </Grid>
                <Grid item xs={12}>
                    <Typography gutterBottom>Throttle ({throttle}%) - Limit 50%</Typography>
                    <Slider
                        value={throttle}
                        onChange={(e, v) => setThrottle(v)}
                        min={0}
                        max={50}
                        valueLabelDisplay="auto"
                        marks={[{ value: 0, label: '0%' }, { value: 50, label: '50%' }]}
                    />
                </Grid>
                <Grid item xs={12}>
                    <Button
                        variant="contained"
                        color={isTesting ? "warning" : "error"}
                        fullWidth
                        size="large"
                        startIcon={isTesting ? <Stop /> : <PlayArrow />}
                        onClick={handleRunTest}
                        disabled={isTesting}
                    >
                        {isTesting ? "Testing..." : "Run Test"}
                    </Button>
                </Grid>
            </Grid>

            {message && (
                <Alert severity={message.type} sx={{ mt: 2 }}>
                    {message.text}
                </Alert>
            )}
        </Paper>
    );
};

export default MotorTest;
