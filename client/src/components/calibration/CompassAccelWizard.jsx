import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Typography,
    Button,
    Paper,
    Stepper,
    Step,
    StepLabel,
    LinearProgress,
    Alert,
    Card,
    CardContent,
    ToggleButton,
    ToggleButtonGroup
} from '@mui/material';
import ExploreIcon from '@mui/icons-material/Explore';
import SpeedIcon from '@mui/icons-material/Speed';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CircularProgress from '@mui/material/CircularProgress';
import { useVehicles } from '../../context/VehicleContext';

const API_URL = 'http://localhost:8081/api';

export default function CompassAccelWizard() {
    const { activeVehicle } = useVehicles();
    const [activeStep, setActiveStep] = useState(0);
    const [calType, setCalType] = useState('compass'); // 'compass' or 'accelerometer'
    const [calStatus, setCalStatus] = useState({
        active: false,
        progress: 0,
        status_text: 'Ready',
        success: false
    });
    const [error, setError] = useState(null);
    const pollInterval = useRef(null);

    const steps = ['Start', 'Calibrate', 'Complete'];

    // Poll status when calibration is active
    useEffect(() => {
        if (activeVehicle && (activeStep === 1 || calStatus.active)) {
            pollInterval.current = setInterval(async () => {
                try {
                    const response = await fetch(`${API_URL}/calibration/${activeVehicle.id}/status`);
                    const data = await response.json();
                    setCalStatus(data);

                    if (data.success && activeStep === 1) {
                        setActiveStep(2); // Complete
                        clearInterval(pollInterval.current);
                    } else if (data.active && activeStep < 1) {
                        setActiveStep(1); // In progress
                    } else if (!data.active && !data.success && activeStep === 1) {
                        // Failed or cancelled
                        clearInterval(pollInterval.current);
                    }
                } catch (e) {
                    console.error("Polling error", e);
                }
            }, 500);
        } else {
            if (pollInterval.current) clearInterval(pollInterval.current);
        }
        return () => { if (pollInterval.current) clearInterval(pollInterval.current); };
    }, [activeVehicle, activeStep, calStatus.active]);

    const handleStart = async () => {
        if (!activeVehicle) return;
        try {
            setError(null);
            const endpoint = calType === 'compass'
                ? `${API_URL}/calibration/compass/start`
                : `${API_URL}/calibration/accelerometer/start`;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vehicleId: activeVehicle.id })
            });
            const data = await response.json();
            if (data.success) {
                setActiveStep(1);
                setCalStatus(prev => ({ ...prev, active: true, status_text: 'Starting...' }));
            } else {
                setError("Failed to start calibration");
            }
        } catch (e) {
            setError(e.message);
        }
    };

    const handleCancel = async () => {
        if (!activeVehicle) return;
        try {
            const endpoint = calType === 'compass'
                ? `${API_URL}/calibration/compass/cancel`
                : `${API_URL}/calibration/accelerometer/cancel`;

            await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vehicleId: activeVehicle.id })
            });
            setCalStatus(prev => ({ ...prev, active: false, status_text: 'Cancelled' }));
            setActiveStep(0);
        } catch (e) {
            setError(e.message);
        }
    };

    const handleTypeChange = (event, newType) => {
        if (newType !== null && !calStatus.active) {
            setCalType(newType);
        }
    };

    return (
        <Paper sx={{ p: 4 }}>
            <Box display="flex" alignItems="center" mb={3} justifyContent="space-between">
                <Box display="flex" alignItems="center">
                    {calType === 'compass' ?
                        <ExploreIcon color="primary" sx={{ fontSize: 40, mr: 2 }} /> :
                        <SpeedIcon color="secondary" sx={{ fontSize: 40, mr: 2 }} />
                    }
                    <Typography variant="h5">
                        {calType === 'compass' ? 'Compass Calibration' : 'Accelerometer Calibration'}
                    </Typography>
                </Box>
                <ToggleButtonGroup
                    value={calType}
                    exclusive
                    onChange={handleTypeChange}
                    disabled={calStatus.active}
                    size="small"
                >
                    <ToggleButton value="compass">Compass</ToggleButton>
                    <ToggleButton value="accelerometer">Accel</ToggleButton>
                </ToggleButtonGroup>
            </Box>

            <Typography variant="body2" color="textSecondary" paragraph>
                {calType === 'compass'
                    ? "Rotate the vehicle around all axes."
                    : "Place the vehicle in 6 orientations (Level, Left, Right, Nose Down, Nose Up, Back)."
                }
            </Typography>

            <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
                {steps.map((label) => (
                    <Step key={label}>
                        <StepLabel>{label}</StepLabel>
                    </Step>
                ))}
            </Stepper>

            <Card variant="outlined" sx={{ minHeight: '250px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <CardContent>
                    {activeStep === 0 && (
                        <Box textAlign="center">
                            <Button
                                variant="contained"
                                color={calType === 'compass' ? "primary" : "secondary"}
                                size="large"
                                startIcon={<PlayArrowIcon />}
                                onClick={handleStart}
                            >
                                Start
                            </Button>
                        </Box>
                    )}

                    {activeStep === 1 && (
                        <Box textAlign="center">
                            <Box sx={{ position: 'relative', display: 'inline-flex', mb: 2 }}>
                                <CircularProgress
                                    variant={calStatus.progress > 0 ? "determinate" : "indeterminate"}
                                    value={calStatus.progress}
                                    size={60}
                                    color={calType === 'compass' ? "primary" : "secondary"}
                                />
                                <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Typography variant="caption" color="text.secondary">
                                        {calStatus.progress > 0 ? `${Math.round(calStatus.progress)}%` : ''}
                                    </Typography>
                                </Box>
                            </Box>
                            <Typography variant="h6" gutterBottom>
                                {calStatus.status_text || "In Progress..."}
                            </Typography>

                            <Button
                                variant="outlined"
                                color="error"
                                startIcon={<StopIcon />}
                                onClick={handleCancel}
                                sx={{ mt: 2 }}
                            >
                                Cancel
                            </Button>
                        </Box>
                    )}

                    {activeStep === 2 && (
                        <Box textAlign="center">
                            <CheckCircleIcon color="success" sx={{ fontSize: 60, mb: 1 }} />
                            <Typography variant="h5" gutterBottom>Success</Typography>
                            <Typography paragraph variant="body2">Reboot required.</Typography>
                            <Button variant="contained" onClick={() => { setActiveStep(0); setCalStatus({ active: false, progress: 0, status_text: 'Ready' }); }}>
                                Done
                            </Button>
                        </Box>
                    )}

                    {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
                </CardContent>
            </Card>
        </Paper>
    );
}
