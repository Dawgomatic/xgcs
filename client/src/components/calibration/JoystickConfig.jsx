import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Typography,
    Paper,
    Grid,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Slider,
    Button,
    Alert,
    Switch,
    FormControlLabel
} from '@mui/material';
import { Gamepad, SportsEsports } from '@mui/icons-material';
import { useVehicles } from '../../context/VehicleContext';

const JoystickConfig = () => {
    const { activeVehicle } = useVehicles();
    const [gamepads, setGamepads] = useState([]);
    const [selectedGamepadIndex, setSelectedGamepadIndex] = useState('');
    const [active, setActive] = useState(false);
    const [lastSendTime, setLastSendTime] = useState(0);

    // Mappings: Axis index -> Channel (x,y,z,r)
    const [mapping, setMapping] = useState({
        x: 1, // Pitch
        y: 0, // Roll
        z: 3, // Throttle
        r: 2  // Yaw
    });
    const [inversions, setInversions] = useState({
        x: false, y: false, z: false, r: false
    });

    const requestRef = useRef();

    useEffect(() => {
        const handleGamepadConnected = () => {
            const gps = navigator.getGamepads();
            const gpList = [];
            for (let i = 0; i < gps.length; i++) {
                if (gps[i]) gpList.push({ index: i, id: gps[i].id });
            }
            setGamepads(gpList);
            if (gpList.length > 0 && selectedGamepadIndex === '') {
                setSelectedGamepadIndex(gpList[0].index);
            }
        };

        window.addEventListener("gamepadconnected", handleGamepadConnected);
        window.addEventListener("gamepaddisconnected", handleGamepadConnected);
        // Initial check
        handleGamepadConnected();

        return () => {
            window.removeEventListener("gamepadconnected", handleGamepadConnected);
            window.removeEventListener("gamepaddisconnected", handleGamepadConnected);
            cancelAnimationFrame(requestRef.current);
        };
    }, []);

    const updateLoop = () => {
        if (!active || selectedGamepadIndex === '' || !activeVehicle) {
            requestRef.current = requestAnimationFrame(updateLoop);
            return;
        }

        const now = Date.now();
        // Limit to 20Hz (50ms) to avoid flooding network/backend
        if (now - lastSendTime < 50) {
            requestRef.current = requestAnimationFrame(updateLoop);
            return;
        }

        const gp = navigator.getGamepads()[selectedGamepadIndex];
        if (gp) {
            // Read axes
            const getAxis = (idx, inv) => {
                let val = gp.axes[idx] || 0;
                // Deadzone
                if (Math.abs(val) < 0.05) val = 0;
                return inv ? -val : val;
            };

            const x = getAxis(mapping.x, inversions.x);
            const y = getAxis(mapping.y, inversions.y);
            const z = ((-1 * getAxis(mapping.z, inversions.z)) + 1) / 2; // Convert -1..1 to 0..1 for throttle usually
            const r = getAxis(mapping.r, inversions.r);

            // Send to backend
            fetch('/api/command/manual_control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vehicleId: activeVehicle.id,
                    x, y, z, r,
                    buttons: 0 // TODO: Map buttons
                })
            }).catch(e => console.error(e)); // Fire and forget

            setLastSendTime(now);
        }

        requestRef.current = requestAnimationFrame(updateLoop);
    };

    useEffect(() => {
        if (active) {
            requestRef.current = requestAnimationFrame(updateLoop);
        } else {
            cancelAnimationFrame(requestRef.current);
        }
        return () => cancelAnimationFrame(requestRef.current);
    }, [active, selectedGamepadIndex, activeVehicle, mapping, inversions]);

    return (
        <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <SportsEsports sx={{ mr: 1 }} />
                <Typography variant="h6">Joystick Configuration</Typography>
            </Box>

            {!activeVehicle && <Alert severity="warning" sx={{ mb: 2 }}>Connect vehicle to enable control</Alert>}

            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                        <InputLabel>Select Gamepad</InputLabel>
                        <Select
                            value={selectedGamepadIndex}
                            label="Select Gamepad"
                            onChange={(e) => setSelectedGamepadIndex(e.target.value)}
                        >
                            {gamepads.map(gp => (
                                <MenuItem key={gp.index} value={gp.index}>
                                    {gp.id}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Grid>
                <Grid item xs={12} md={6} sx={{ display: 'flex', alignItems: 'center' }}>
                    <FormControlLabel
                        control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} disabled={!activeVehicle || selectedGamepadIndex === ''} />}
                        label="Enable Active Control"
                    />
                    {active && <Typography color="error" variant="caption" sx={{ ml: 1 }}>TRANSMITTING</Typography>}
                </Grid>

                <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>Axis Mapping</Typography>
                    <Grid container spacing={2}>
                        {['x', 'y', 'z', 'r'].map(axis => (
                            <Grid item xs={6} md={3} key={axis}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>{axis.toUpperCase()} ({axis === 'z' ? 'Thrust' : axis === 'x' ? 'Pitch' : axis === 'y' ? 'Roll' : 'Yaw'})</InputLabel>
                                    <Select
                                        value={mapping[axis]}
                                        label={axis.toUpperCase()}
                                        onChange={(e) => setMapping({ ...mapping, [axis]: e.target.value })}
                                    >
                                        {[0, 1, 2, 3, 4, 5].map(i => <MenuItem key={i} value={i}>Axis {i}</MenuItem>)}
                                    </Select>
                                </FormControl>
                                <FormControlLabel
                                    control={<Switch size="small" checked={inversions[axis]} onChange={(e) => setInversions({ ...inversions, [axis]: e.target.checked })} />}
                                    label="Invert"
                                />
                            </Grid>
                        ))}
                    </Grid>
                </Grid>
            </Grid>
        </Paper>
    );
};

export default JoystickConfig;
