
import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    TextField,
    Switch,
    FormControlLabel,
    Slider,
    Card,
    CardContent,
    Grid,
    Divider,
    Button
} from '@mui/material';
import { SignalWifi4Bar, SignalWifiOff } from '@mui/icons-material';

// Free Space Path Loss Model
// FSPL(dB) = 20log10(d) + 20log10(f) + 20log10(4pi/c) - Gtx - Grx
// Simplified for frequency in MHz and distance in km:
// FSPL(dB) = 20log10(d_km) + 20log10(f_MHz) + 32.44
const calculateFSPL = (distKm, freqMHz) => {
    if (distKm <= 0) return 0;
    return 20 * Math.log10(distKm) + 20 * Math.log10(freqMHz) + 32.44;
};

const LinkAnalysisTool = ({ missionItems, onUpdateRangeRing }) => {
    const [enabled, setEnabled] = useState(false);

    // Radio Parameters
    const [frequency, setFrequency] = useState(915); // MHz
    const [txPower, setTxPower] = useState(30); // dBm (1W)
    const [txGain, setTxGain] = useState(3); // dBi
    const [rxGain, setRxGain] = useState(3); // dBi
    const [sensitivity, setSensitivity] = useState(-100); // dBm (Receiver sensitivity)
    const [fadeMargin, setFadeMargin] = useState(10); // dB (Safety margin)

    const [maxRange, setMaxRange] = useState(0);

    // Calculate Max Range
    useEffect(() => {
        if (!enabled) {
            if (onUpdateRangeRing) onUpdateRangeRing(null);
            return;
        }

        // Link Budget = TxPower + TxGain + RxGain - Sensitivity - FadeMargin
        // Max Path Loss = Link Budget
        // FSPL = 20log(d) + 20log(f) + 32.44
        // 20log(d) = MaxPathLoss - 20log(f) - 32.44
        // log(d) = (MaxPathLoss - 20log(f) - 32.44) / 20
        // d = 10 ^ (...)

        const linkBudget = txPower + txGain + rxGain - sensitivity - fadeMargin;
        const constant = 20 * Math.log10(frequency) + 32.44;
        const logDist = (linkBudget - constant) / 20;
        const distKm = Math.pow(10, logDist);

        setMaxRange(distKm * 1000); // Convert to meters

        if (onUpdateRangeRing) {
            onUpdateRangeRing({
                radius: distKm * 1000,
                color: distKm < 1 ? '#ff4444' : '#4caf50', // Red if very short range
                opacity: 0.2
            });
        }

    }, [enabled, frequency, txPower, txGain, rxGain, sensitivity, fadeMargin, onUpdateRangeRing]);

    // Send Params to Backend for Simulation
    useEffect(() => {
        // Debounce update to avoid spamming API
        const timer = setTimeout(() => {
            fetch('/api/simulation/radio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vehicleId: '1', // Hardcoded for single vehicle MVP, or pass prop
                    enabled: enabled,
                    frequency: frequency,
                    txPower: txPower,
                    txGain: txGain,
                    rxGain: rxGain
                })
            }).catch(err => console.error("Sim error:", err));
        }, 500);

        return () => clearTimeout(timer);
    }, [enabled, frequency, txPower, txGain, rxGain]);


    // Analyze Waypoints
    const analyzeWaypoints = () => {
        if (!missionItems || missionItems.length === 0) return [];

        // Assume Home is at (0,0,0) relative for simple calc, or we need real distance
        // For now, let's just use the max range check against a mock distance 
        // functionality if we don't have vehicle position.
        // Ideally, we calculate distance from Home (first WP usually or vehicle position).

        // This part requires calculating distance of each WP from Home.
        // If missionItems contains lat/lon, we can do it.
        return [];
    };

    return (
        <Card sx={{ mt: 2, backgroundColor: '#1e1e1e', color: 'white' }}>
            <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SignalWifi4Bar color={enabled ? "success" : "disabled"} />
                        <Typography variant="h6" fontSize="16px">
                            Link Budget Analysis
                        </Typography>
                    </Box>
                    <Switch
                        checked={enabled}
                        onChange={(e) => setEnabled(e.target.checked)}
                        color="success"
                    />
                </Box>

                {enabled && (
                    <Box>
                        <Typography variant="caption" color="text.secondary">
                            Calculate theoretical maximum range based on radio parameters.
                        </Typography>

                        <Grid container spacing={2} sx={{ mt: 1 }}>
                            <Grid item xs={6}>
                                <TextField
                                    label="Freq (MHz)"
                                    type="number"
                                    value={frequency}
                                    onChange={(e) => setFrequency(Number(e.target.value))}
                                    size="small"
                                    fullWidth
                                    InputLabelProps={{ style: { color: '#aaa' } }}
                                    inputProps={{ style: { color: 'white' } }}
                                    variant="outlined"
                                    sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#444' } } }}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField
                                    label="Tx Power (dBm)"
                                    type="number"
                                    value={txPower}
                                    onChange={(e) => setTxPower(Number(e.target.value))}
                                    size="small"
                                    fullWidth
                                    InputLabelProps={{ style: { color: '#aaa' } }}
                                    inputProps={{ style: { color: 'white' } }}
                                    variant="outlined"
                                    sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#444' } } }}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField
                                    label="Tx Gain (dBi)"
                                    type="number"
                                    value={txGain}
                                    onChange={(e) => setTxGain(Number(e.target.value))}
                                    size="small"
                                    fullWidth
                                    InputLabelProps={{ style: { color: '#aaa' } }}
                                    inputProps={{ style: { color: 'white' } }}
                                    variant="outlined"
                                    sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#444' } } }}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField
                                    label="Rx Gain (dBi)"
                                    type="number"
                                    value={rxGain}
                                    onChange={(e) => setRxGain(Number(e.target.value))}
                                    size="small"
                                    fullWidth
                                    InputLabelProps={{ style: { color: '#aaa' } }}
                                    inputProps={{ style: { color: 'white' } }}
                                    variant="outlined"
                                    sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#444' } } }}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField
                                    label="Sens. (dBm)"
                                    type="number"
                                    value={sensitivity}
                                    onChange={(e) => setSensitivity(Number(e.target.value))}
                                    size="small"
                                    fullWidth
                                    InputLabelProps={{ style: { color: '#aaa' } }}
                                    inputProps={{ style: { color: 'white' } }}
                                    variant="outlined"
                                    sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#444' } } }}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField
                                    label="Fade Margin (dB)"
                                    type="number"
                                    value={fadeMargin}
                                    onChange={(e) => setFadeMargin(Number(e.target.value))}
                                    size="small"
                                    fullWidth
                                    InputLabelProps={{ style: { color: '#aaa' } }}
                                    inputProps={{ style: { color: 'white' } }}
                                    variant="outlined"
                                    sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#444' } } }}
                                />
                            </Grid>
                        </Grid>

                        <Divider sx={{ my: 2, borderColor: '#444' }} />

                        <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="body2" color="#aaa">Estimated Max Range</Typography>
                            <Typography variant="h4" color="#4caf50">
                                {(maxRange / 1000).toFixed(2)} <span style={{ fontSize: '16px' }}>km</span>
                            </Typography>
                        </Box>
                    </Box>
                )}
            </CardContent>
        </Card>
    );
};

export default LinkAnalysisTool;
