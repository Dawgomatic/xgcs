import React, { useState } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Slider,
    TextField,
    Button,
    Grid,
    InputAdornment,
    Collapse,
    IconButton,
    Tabs,
    Tab
} from '@mui/material';
import {
    GridOn,
    Timeline,
    DonutLarge,
    ExpandMore,
    ExpandLess,
    Check,
    Edit
} from '@mui/icons-material';
import { SurveyPattern } from '../../utils/SurveyPattern';
import { CorridorScan } from '../../utils/CorridorScan';
import { StructureScan } from '../../utils/StructureScan';

const ScanEditor = ({ polygon, polyline, centerPoint, onGenerate, onCancel, onRequestDraw }) => {
    const [mode, setMode] = useState(0); // 0: Grid, 1: Corridor, 2: Structure
    const [expanded, setExpanded] = useState(true);

    // Common
    const [altitude, setAltitude] = useState(50);

    // Grid (Survey)
    const [angle, setAngle] = useState(0);
    const [overlap, setOverlap] = useState(70);
    const [cameraFOV, setCameraFOV] = useState(60);

    // Corridor
    const [width, setWidth] = useState(20);
    const [spacing, setSpacing] = useState(10);

    // Structure
    const [radius, setRadius] = useState(20);
    const [layers, setLayers] = useState(3);
    const [startAlt, setStartAlt] = useState(20);
    const [endAlt, setEndAlt] = useState(50);

    const handleGenerate = () => {
        let waypoints = [];
        try {
            if (mode === 0) {
                // Grid
                if (!polygon || polygon.length < 3) {
                    alert("Please define a polygon area first.");
                    return;
                }
                const generator = new SurveyPattern(polygon, {
                    altitude,
                    angle,
                    overlapSide: overlap,
                    cameraFOV
                });
                waypoints = generator.generate();

            } else if (mode === 1) {
                // Corridor
                if (!polyline || polyline.length < 2) {
                    alert("Please define a corridor path (polyline) first.");
                    return;
                }
                const generator = new CorridorScan(polyline, {
                    altitude,
                    width,
                    spacing
                });
                waypoints = generator.generate();

            } else if (mode === 2) {
                // Structure
                if (!centerPoint) {
                    alert("Please select a center point.");
                    return;
                }
                const generator = new StructureScan(centerPoint, {
                    startAltitude: startAlt,
                    endAltitude: endAlt,
                    layers,
                    radius,
                    steps: 20
                });
                waypoints = generator.generate(); // ROI + Orbits
                // Map ROI command to action if needed, or backend handles it
            }
            onGenerate(waypoints);
        } catch (e) {
            console.error("Generation error:", e);
            alert("Failed to generate pattern: " + e.message);
        }
    };

    const handleRequestDraw = () => {
        if (mode === 0) onRequestDraw('polygon');
        if (mode === 1) onRequestDraw('polyline');
        if (mode === 2) onRequestDraw('point');
    };

    return (
        <Card sx={{ mt: 2, border: '1px solid rgba(0,0,0,0.1)' }}>
            <Box sx={{
                p: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                bgcolor: 'primary.light',
                color: 'primary.contrastText'
            }}
                onClick={() => setExpanded(!expanded)}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <GridOn />
                    <Typography variant="subtitle2">Scan Pattern Generator</Typography>
                </Box>
                <IconButton size="small" sx={{ color: 'inherit' }}>
                    {expanded ? <ExpandLess /> : <ExpandMore />}
                </IconButton>
            </Box>

            <Collapse in={expanded}>
                <CardContent sx={{ pt: 0 }}>
                    <Tabs
                        value={mode}
                        onChange={(e, v) => setMode(v)}
                        variant="fullWidth"
                        size="small"
                        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
                    >
                        <Tab icon={<GridOn fontSize="small" />} label="Grid" />
                        <Tab icon={<Timeline fontSize="small" />} label="Corridor" />
                        <Tab icon={<DonutLarge fontSize="small" />} label="Orbit" />
                    </Tabs>

                    <Grid container spacing={2}>
                        {/* INPUTS FOR GRID */}
                        {mode === 0 && (
                            <>
                                <Grid item xs={12}>
                                    <Button
                                        variant="outlined"
                                        fullWidth
                                        size="small"
                                        startIcon={<Edit />}
                                        onClick={handleRequestDraw}
                                    >
                                        {(polygon && polygon.length >= 3) ? "Redefine Area" : "Draw Area"}
                                    </Button>
                                </Grid>
                                <Grid item xs={12}>
                                    <Typography variant="caption" color="text.secondary">Grid Angle ({angle}°)</Typography>
                                    <Slider value={angle} max={360} onChange={(e, v) => setAngle(v)} size="small" />
                                </Grid>
                                <Grid item xs={12}>
                                    <Typography variant="caption" color="text.secondary">Overlap ({overlap}%)</Typography>
                                    <Slider value={overlap} max={90} onChange={(e, v) => setOverlap(v)} size="small" />
                                </Grid>
                            </>
                        )}

                        {/* INPUTS FOR CORRIDOR */}
                        {mode === 1 && (
                            <>
                                <Grid item xs={12}>
                                    <Button
                                        variant="outlined"
                                        fullWidth
                                        size="small"
                                        startIcon={<Edit />}
                                        onClick={handleRequestDraw}
                                    >
                                        {(polyline && polyline.length >= 2) ? "Redefine Path" : "Draw Path"}
                                    </Button>
                                </Grid>
                                <Grid item xs={12}>
                                    <TextField label="Width (m)" type="number" fullWidth size="small" value={width} onChange={(e) => setWidth(Number(e.target.value))} />
                                </Grid>
                                <Grid item xs={12}>
                                    <TextField label="Leg Spacing (m)" type="number" fullWidth size="small" value={spacing} onChange={(e) => setSpacing(Number(e.target.value))} />
                                </Grid>
                            </>
                        )}

                        {/* INPUTS FOR STRUCTURE (ORBIT) */}
                        {mode === 2 && (
                            <>
                                <Grid item xs={12}>
                                    <Button
                                        variant="outlined"
                                        fullWidth
                                        size="small"
                                        startIcon={<Edit />}
                                        onClick={handleRequestDraw}
                                    >
                                        {centerPoint ? "Move Center" : "Set Center"}
                                    </Button>
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField label="Radius (m)" type="number" fullWidth size="small" value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField label="Layers" type="number" fullWidth size="small" value={layers} onChange={(e) => setLayers(Number(e.target.value))} />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField label="Start Alt (m)" type="number" fullWidth size="small" value={startAlt} onChange={(e) => setStartAlt(Number(e.target.value))} />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField label="End Alt (m)" type="number" fullWidth size="small" value={endAlt} onChange={(e) => setEndAlt(Number(e.target.value))} />
                                </Grid>
                            </>
                        )}

                        {/* COMMON INPUTS */}
                        <Grid item xs={12}>
                            <Typography variant="caption" color="text.secondary">Altitude ({altitude}m)</Typography>
                            <Slider
                                value={altitude}
                                min={10} max={200}
                                onChange={(e, v) => setAltitude(v)}
                                size="small"
                                disabled={mode === 2} // Structure uses Start/End Alt
                            />
                        </Grid>

                        <Grid item xs={12} sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
                            <Button onClick={onCancel} size="small" color="inherit">
                                Cancel
                            </Button>
                            <Button
                                onClick={handleGenerate}
                                variant="contained"
                                size="small"
                                startIcon={<Check />}
                            >
                                Generate
                            </Button>
                        </Grid>
                    </Grid>
                </CardContent>
            </Collapse>
        </Card>
    );
};

export default ScanEditor;
