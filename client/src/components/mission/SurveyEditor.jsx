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
    IconButton
} from '@mui/material';
import {
    GridOn,
    ExpandMore,
    ExpandLess,
    Check
} from '@mui/icons-material';
import { SurveyPattern } from '../../utils/SurveyPattern';

const SurveyEditor = ({ polygon, onGenerate, onCancel }) => {
    const [altitude, setAltitude] = useState(50);
    const [angle, setAngle] = useState(0);
    const [overlap, setOverlap] = useState(70);
    const [cameraFOV, setCameraFOV] = useState(60);
    const [expanded, setExpanded] = useState(true);

    const handleGenerate = () => {
        if (!polygon || polygon.length < 3) {
            alert("Please draw a polygon with at least 3 points first.");
            return;
        }

        const generator = new SurveyPattern(polygon, {
            altitude,
            angle,
            overlapSide: overlap,
            cameraFOV
        });

        const waypoints = generator.generate();
        onGenerate(waypoints);
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
                    <Typography variant="subtitle2">Survey Grid Generator</Typography>
                </Box>
                <IconButton size="small" sx={{ color: 'inherit' }}>
                    {expanded ? <ExpandLess /> : <ExpandMore />}
                </IconButton>
            </Box>

            <Collapse in={expanded}>
                <CardContent>
                    <Grid container spacing={2}>
                        <Grid item xs={12}>
                            <Typography variant="caption" color="text.secondary">Altitude ({altitude}m)</Typography>
                            <Slider
                                value={altitude}
                                min={10}
                                max={200}
                                onChange={(e, v) => setAltitude(v)}
                                valueLabelDisplay="auto"
                                size="small"
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <Typography variant="caption" color="text.secondary">Grid Angle ({angle}°)</Typography>
                            <Slider
                                value={angle}
                                min={0}
                                max={360}
                                onChange={(e, v) => setAngle(v)}
                                valueLabelDisplay="auto"
                                size="small"
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <Typography variant="caption" color="text.secondary">Side Overlap ({overlap}%)</Typography>
                            <Slider
                                value={overlap}
                                min={0}
                                max={90}
                                onChange={(e, v) => setOverlap(v)}
                                valueLabelDisplay="auto"
                                size="small"
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                label="Camera FOV"
                                type="number"
                                value={cameraFOV}
                                onChange={(e) => setCameraFOV(Number(e.target.value))}
                                size="small"
                                fullWidth
                                InputProps={{
                                    endAdornment: <InputAdornment position="end">°</InputAdornment>,
                                }}
                            />
                        </Grid>
                        <Grid item xs={12} sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                            <Button onClick={onCancel} size="small" color="inherit">
                                Cancel
                            </Button>
                            <Button
                                onClick={handleGenerate}
                                variant="contained"
                                size="small"
                                startIcon={<Check />}
                                disabled={!polygon || polygon.length < 3}
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

export default SurveyEditor;
