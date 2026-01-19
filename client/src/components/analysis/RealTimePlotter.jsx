import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Paper,
    Typography,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Grid,
    Button,
    Chip
} from '@mui/material';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import { PlayArrow, Pause, Delete } from '@mui/icons-material';

const MAX_POINTS = 100;
const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#ff0000'];

const RealTimePlotter = ({ vehicleId }) => {
    const [paused, setPaused] = useState(false);
    const [availableSchemas, setAvailableSchemas] = useState({}); // { MSG_NAME: ['field1', 'field2'] }
    const [selectedPlots, setSelectedPlots] = useState([]); // [{ msgName, field, color }]
    const [data, setData] = useState([]); // Array of { timestamp, "MSG.field": value, ... }

    // Buffer for high-frequency updates, flushed to state periodically
    const dataBuffer = useRef([]);
    const schemasRef = useRef({});

    useEffect(() => {
        if (!vehicleId) return;
        const ws = new WebSocket(`ws://${window.location.hostname}:8081/api/mavlink/stream`);

        ws.onopen = () => ws.send(vehicleId);

        ws.onmessage = (event) => {
            if (paused) return;
            try {
                const msg = JSON.parse(event.data);
                const { msgName, fields, timestamp } = msg;

                // Discover schema
                if (!schemasRef.current[msgName]) {
                    const numberFields = Object.keys(fields).filter(k => typeof fields[k] === 'number');
                    if (numberFields.length > 0) {
                        schemasRef.current[msgName] = numberFields;
                        // Debounce state update for schema to avoid re-renders
                        // Actually setAvailableSchemas is effectively the debounce if we only do it when new
                        setAvailableSchemas({ ...schemasRef.current });
                    }
                }

                // Add to buffer
                // We create a single datapoint object. 
                // Note: Charts usually expect 1 point per timestamp X. 
                // But different messages arrive at different times.
                // We'll trust Recharts to handle sparse data or we align it?
                // Recharts requires a single array key.
                // Approach: We push a new object for EVERY message. This might be too noisy.
                // Better approach: Sample at 10Hz.
                // Current approach: Push object with current timestamp and the NEW value.
                // Recharts Line 'connectNulls' helps.

                const point = {
                    timestamp: timestamp || Date.now(),
                    timeLabel: new Date().toLocaleTimeString(),
                };

                // Add value uniquely identified
                Object.keys(fields).forEach(f => {
                    if (typeof fields[f] === 'number') {
                        point[`${msgName}.${f}`] = fields[f];
                    }
                });

                dataBuffer.current.push(point);
                if (dataBuffer.current.length > MAX_POINTS * 2) {
                    dataBuffer.current.shift(); // Keep buffer smallish
                }

            } catch (e) {
                console.error(e);
            }
        };

        const interval = setInterval(() => {
            if (paused) return;

            setData(prev => {
                // Merge buffer into main data
                // We take the last N points
                const newData = [...prev, ...dataBuffer.current];
                // Flatten/Clean
                // To prevent infinite growth
                if (newData.length > MAX_POINTS) {
                    return newData.slice(newData.length - MAX_POINTS);
                }
                return newData;
            });
            dataBuffer.current = []; // Clear buffer
        }, 100); // 10Hz refresh

        return () => {
            ws.close();
            clearInterval(interval);
        };
    }, [vehicleId, paused]);

    const handleAddPlot = (msgName, field) => {
        const key = `${msgName}.${field}`;
        if (!selectedPlots.find(p => `${p.msgName}.${p.field}` === key)) {
            setSelectedPlots([...selectedPlots, {
                msgName,
                field,
                color: COLORS[selectedPlots.length % COLORS.length]
            }]);
        }
    };

    const handleRemovePlot = (index) => {
        const newPlots = [...selectedPlots];
        newPlots.splice(index, 1);
        setSelectedPlots(newPlots);
    };

    return (
        <Paper sx={{ p: 2, height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">Real-time Plotter</Typography>
                <Box>
                    <Button onClick={() => setPaused(!paused)} startIcon={paused ? <PlayArrow /> : <Pause />}>
                        {paused ? "Resume" : "Pause"}
                    </Button>
                    <Button onClick={() => setData([])} startIcon={<Delete />}>
                        Clear
                    </Button>
                </Box>
            </Box>

            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} md={4}>
                    <FormControl fullWidth size="small">
                        <InputLabel>Add Data Series</InputLabel>
                        <Select
                            label="Add Data Series"
                            value=""
                            onChange={(e) => {
                                const [msg, field] = e.target.value.split(':');
                                handleAddPlot(msg, field);
                            }}
                        >
                            {Object.keys(availableSchemas).sort().map(msg => [
                                <Typography key={`hdr-${msg}`} variant="overline" sx={{ px: 2, display: 'block', bgcolor: '#f5f5f5' }}>{msg}</Typography>,
                                ...availableSchemas[msg].map(f => (
                                    <MenuItem key={`${msg}:${f}`} value={`${msg}:${f}`}>
                                        {f}
                                    </MenuItem>
                                ))
                            ])}
                        </Select>
                    </FormControl>
                </Grid>
                <Grid item xs={12} md={8} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {selectedPlots.map((p, i) => (
                        <Chip
                            key={i}
                            label={`${p.msgName}.${p.field}`}
                            onDelete={() => handleRemovePlot(i)}
                            sx={{ borderColor: p.color, border: 1, bgcolor: 'background.paper' }}
                        />
                    ))}
                </Grid>
            </Grid>

            <Box sx={{ height: 400 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="timeLabel" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        {selectedPlots.map((p, i) => (
                            <Line
                                key={i}
                                type="monotone"
                                dataKey={`${p.msgName}.${p.field}`}
                                stroke={p.color}
                                dot={false}
                                isAnimationActive={false} // Performance
                                connectNulls
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </Box>
        </Paper>
    );
};

export default RealTimePlotter;
