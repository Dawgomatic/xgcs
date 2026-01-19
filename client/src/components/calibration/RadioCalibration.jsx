import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Typography,
    Button,
    Paper,
    LinearProgress,
    Alert,
    Grid,
    Card,
    CardContent
} from '@mui/material';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useVehicles } from '../../context/VehicleContext';

const WS_URL = 'ws://localhost:8081/api/mavlink/stream'; // Adjust if needed
const API_URL = 'http://localhost:8081/api';

const ChannelBar = ({ label, value, min, max }) => {
    // Normalize value (1000-2000) to percentage (0-100)
    const percent = Math.max(0, Math.min(100, ((value - 1000) / 1000) * 100));
    const minPercent = Math.max(0, Math.min(100, ((min - 1000) / 1000) * 100));
    const maxPercent = Math.max(0, Math.min(100, ((max - 1000) / 1000) * 100));

    return (
        <Box sx={{ mb: 2 }}>
            <Box display="flex" justifyContent="space-between">
                <Typography variant="body2">{label}</Typography>
                <Typography variant="caption">{value} (Min: {min} Max: {max})</Typography>
            </Box>
            <Box sx={{ position: 'relative', height: 20, mt: 0.5, bgcolor: '#eee', borderRadius: 1 }}>
                {/* Active Bar */}
                <Box sx={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: '100%',
                    width: `${percent}%`,
                    bgcolor: 'primary.main',
                    transition: 'width 0.1s linear',
                    borderRadius: 1
                }} />
                {/* Min Marker */}
                <Box sx={{ position: 'absolute', left: `${minPercent}%`, top: -2, height: 24, width: 2, bgcolor: 'error.main' }} />
                {/* Max Marker */}
                <Box sx={{ position: 'absolute', left: `${maxPercent}%`, top: -2, height: 24, width: 2, bgcolor: 'success.main' }} />
            </Box>
        </Box>
    );
};

export default function RadioCalibration() {
    const { activeVehicle } = useVehicles();
    const [channels, setChannels] = useState({});
    const [calibration, setCalibration] = useState({});
    const [calibrating, setCalibrating] = useState(false);
    const [notification, setNotification] = useState(null);
    const ws = useRef(null);

    // Initial setup of calibration state
    useEffect(() => {
        const initialCal = {};
        for (let i = 1; i <= 8; i++) {
            initialCal[i] = { min: 1500, max: 1500 };
        }
        setCalibration(initialCal);
    }, []);

    // WebSocket connection
    useEffect(() => {
        if (!activeVehicle) return;

        ws.current = new WebSocket(WS_URL);

        ws.current.onopen = () => {
            ws.current.send(JSON.stringify({
                type: 'subscribe',
                vehicleId: activeVehicle.id
            }));
        };

        ws.current.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                // MAVLINK_MSG_ID_RC_CHANNELS = 65
                if (msg.msgId === 65 && msg.fields) {
                    const newChannels = {};
                    // Assuming fields like chan1_raw, chan2_raw...
                    for (let i = 1; i <= 16; i++) { // Up to 16 channels usually
                        const key = `chan${i}_raw`;
                        if (msg.fields[key] !== undefined) {
                            newChannels[i] = msg.fields[key];
                        }
                    }
                    setChannels(newChannels);

                    // Update calibration if active
                    if (calibrating) {
                        setCalibration(prev => {
                            const next = { ...prev };
                            Object.keys(newChannels).forEach(ch => {
                                const val = newChannels[ch];
                                if (!next[ch]) next[ch] = { min: val, max: val };
                                next[ch].min = Math.min(next[ch].min, val);
                                next[ch].max = Math.max(next[ch].max, val);
                            });
                            return next;
                        });
                    }
                }
            } catch (e) {
                console.error("WS Parse error", e);
            }
        };

        return () => {
            if (ws.current) ws.current.close();
        };
    }, [activeVehicle, calibrating]); // Re-connect if vehicle changes, or keep connected. 
    // Effect dependency 'calibrating' inside onmessage is tricky with closures if not using ref or functional update. 
    // Used functional update for setCalibration so it's safe.

    const handleStart = () => {
        setCalibrating(true);
        // Reset min/max to current values
        const currentRec = {};
        Object.keys(channels).forEach(ch => {
            currentRec[ch] = { min: channels[ch], max: channels[ch] };
        });
        setCalibration(prev => ({ ...prev, ...currentRec }));
        setNotification({ type: 'info', message: 'Move all sticks and switches to their limits!' });
    };

    const handleSave = async () => {
        setCalibrating(false);
        if (!activeVehicle) return;

        try {
            // Save parameters
            // RCn_MIN, RCn_MAX, RCn_TRIM
            const updates = [];
            for (let i = 1; i <= 4; i++) { // Only save first 4 for MVP safety
                if (calibration[i]) {
                    const min = calibration[i].min;
                    const max = calibration[i].max;
                    const trim = Math.round((min + max) / 2); // Center trim

                    updates.push(saveParam(`RC${i}_MIN`, min));
                    updates.push(saveParam(`RC${i}_MAX`, max));
                    if (i !== 3) { // Usually don't trim throttle (ch 3) automatically like this for multirotor, but for generic it's okay-ish. 
                        // Actually standard is to leave trim 1500 unless specifically subtrimming.
                        updates.push(saveParam(`RC${i}_TRIM`, trim));
                    }
                }
            }
            await Promise.all(updates);
            setNotification({ type: 'success', message: 'Calibration saved successfully!' });
        } catch (e) {
            setNotification({ type: 'error', message: 'Failed to save parameters: ' + e.message });
        }
    };

    const saveParam = async (name, value) => {
        const response = await fetch(`${API_URL}/parameters/set`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vehicleId: activeVehicle.id,
                name: name,
                value: value
            })
        });
        if (!response.ok) throw new Error(`Failed to set ${name}`);
    };

    if (!activeVehicle) return <Alert severity="warning">No vehicle connected</Alert>;

    return (
        <Paper sx={{ p: 4 }}>
            <Box display="flex" alignItems="center" mb={3}>
                <SettingsInputAntennaIcon color="action" sx={{ fontSize: 40, mr: 2 }} />
                <Typography variant="h5">Radio Calibration</Typography>
            </Box>

            <Typography paragraph>
                Monitor RC channels and calibrate endpoints. Click "Calibrate" and move all sticks to their extremes.
            </Typography>

            <Grid container spacing={4}>
                <Grid item xs={12} md={8}>
                    {[1, 2, 3, 4].map(ch => (
                        <ChannelBar
                            key={ch}
                            label={`Channel ${ch} (${['Roll', 'Pitch', 'Throttle', 'Yaw'][ch - 1]})`}
                            value={channels[ch] || 0}
                            min={calibration[ch]?.min || 1000}
                            max={calibration[ch]?.max || 2000}
                        />
                    ))}
                    {/* Aux channels simplified */}
                    <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        {[5, 6, 7, 8].map(ch => (
                            <Box key={ch} sx={{ p: 1, border: '1px solid #ddd', borderRadius: 1, minWidth: 80, textAlign: 'center' }}>
                                <Typography variant="caption">CH {ch}</Typography>
                                <Typography variant="body1">{channels[ch] || 0}</Typography>
                            </Box>
                        ))}
                    </Box>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Card variant="outlined">
                        <CardContent>
                            <Box display="flex" flexDirection="column" gap={2}>
                                {!calibrating ? (
                                    <Button
                                        variant="contained"
                                        startIcon={<RefreshIcon />}
                                        onClick={handleStart}
                                    >
                                        Calibrate
                                    </Button>
                                ) : (
                                    <Button
                                        variant="contained"
                                        color="success"
                                        startIcon={<SaveIcon />}
                                        onClick={handleSave}
                                    >
                                        Save
                                    </Button>
                                )}
                            </Box>
                            {notification && (
                                <Alert severity={notification.type} sx={{ mt: 2 }}>
                                    {notification.message}
                                </Alert>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Paper>
    );
}
