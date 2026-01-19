import React, { useState, useEffect, useRef } from 'react';
import {
    Box, Typography, Paper, Slider, IconButton,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Select, MenuItem, InputLabel, FormControl,
    TextField, Grid
} from '@mui/material';
import { PlayArrow, Pause, FastForward, FastRewind, Refresh } from '@mui/icons-material';
import FlightMap from '../components/FlightMap';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const DebriefPage = () => {
    const [sessions, setSessions] = useState([]);
    const [selectedSessionId, setSelectedSessionId] = useState('');
    const [logData, setLogData] = useState([]); // Array of {timestamp_us, msgid, data}
    const [loading, setLoading] = useState(false);

    // Playback State
    const [currentTime, setCurrentTime] = useState(0); // in microseconds relative to start
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [duration, setDuration] = useState(0);
    const [startTime, setStartTime] = useState(0);

    // View State
    const [messages, setMessages] = useState([]); // Messages at current time window
    const [filteredMessages, setFilteredMessages] = useState([]);
    const [filterText, setFilterText] = useState('');

    // Plotting State
    const [graphData, setGraphData] = useState([]); // Subsampled data for graph

    // Map State
    const [flightPath, setFlightPath] = useState([]); // [{lat, lon, alt}, ...]
    const [currentPos, setCurrentPos] = useState(null); // {lat, lon, alt, heading}

    const animationRef = useRef();
    const lastTickRef = useRef();

    useEffect(() => {
        fetchSessions();
    }, []);

    const fetchSessions = async () => {
        try {
            const res = await fetch('/api/sessions');
            const data = await res.json();
            setSessions(data);
        } catch (e) {
            console.error(e);
        }
    };

    const loadSession = async (id) => {
        setLoading(true);
        setSelectedSessionId(id);
        setIsPlaying(false);
        try {
            const res = await fetch(`/api/sessions/data/${id}`);
            const data = await res.json();

            if (data.length > 0) {
                // Sort by timestamp
                data.sort((a, b) => a.timestamp_us - b.timestamp_us);

                const start = data[0].timestamp_us;
                const end = data[data.length - 1].timestamp_us;
                const dur = end - start;

                setLogData(data);
                setStartTime(start);
                setDuration(dur);
                setCurrentTime(0);

                // Pre-process Graph Data (subsample to 500 points)
                const step = Math.ceil(data.length / 500);
                const gData = [];
                const path = [];

                data.forEach((msg, idx) => {
                    if (msg.msgid === 33 && msg.data.lat && msg.data.lon) {
                        path.push({
                            lat: msg.data.lat / 1e7,
                            lon: msg.data.lon / 1e7,
                            alt: msg.data.relative_alt / 1000.0
                        });
                    }

                    if (idx % step === 0) {
                        let val = null;
                        if (msg.msgid === 33) val = msg.data.relative_alt / 1000.0;
                        if (msg.msgid === 30) val = (msg.data.roll * 180 / Math.PI);
                        if (msg.msgid === 74) val = msg.data.airspeed;

                        if (val !== null) {
                            gData.push({ time: (msg.timestamp_us - start) / 1000000.0, value: val });
                        }
                    }
                });

                setGraphData(gData);
                setFlightPath(path);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // Playback Loop
    useEffect(() => {
        if (isPlaying) {
            lastTickRef.current = Date.now();
            animationRef.current = requestAnimationFrame(animate);
        } else {
            cancelAnimationFrame(animationRef.current);
        }
        return () => cancelAnimationFrame(animationRef.current);
    }, [isPlaying, playbackSpeed]);

    const animate = () => {
        const now = Date.now();
        const delta = now - lastTickRef.current;
        lastTickRef.current = now;

        setCurrentTime(prev => {
            let next = prev + (delta * 1000 * playbackSpeed);
            if (next >= duration) {
                setIsPlaying(false);
                return duration;
            }
            return next;
        });

        animationRef.current = requestAnimationFrame(animate);
    };

    // Sync State with Current Time
    useEffect(() => {
        if (!logData.length) return;

        const currentUs = startTime + currentTime;
        const targetIdx = logData.findIndex(m => m.timestamp_us >= currentUs);

        if (targetIdx !== -1) {
            setMessages(logData.slice(Math.max(0, targetIdx - 10), Math.min(logData.length, targetIdx + 10)));

            // Scan backward for position
            for (let i = targetIdx; i >= 0; i--) {
                const m = logData[i];
                if (m.msgid === 33) {
                    setCurrentPos({
                        lat: m.data.lat / 1e7,
                        lon: m.data.lon / 1e7,
                        altitude: m.data.relative_alt / 1000.0,
                        heading: m.data.hdg / 100.0 // Assuming heading is available here or in ATTITUDE
                    });
                    // Look for ATTITUDE/VFR_HUD for better heading if possible, but 33 often has hdg
                    break;
                }
            }
        }

    }, [currentTime, startTime, logData]);

    // Filtering
    useEffect(() => {
        if (!filterText) {
            setFilteredMessages(messages);
        } else {
            setFilteredMessages(messages.filter(m =>
                JSON.stringify(m).toLowerCase().includes(filterText.toLowerCase())
            ));
        }
    }, [messages, filterText]);

    // Construct vehicle list for FlightMap
    const replayVehicles = currentPos ? [{
        id: 'replay',
        name: 'Replay',
        connected: true,
        coordinate: { lat: currentPos.lat, lon: currentPos.lon },
        altitude: currentPos.altitude,
        heading: currentPos.heading
    }] : [];

    return (
        <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', p: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <FormControl sx={{ minWidth: 200 }}>
                    <InputLabel>Session</InputLabel>
                    <Select
                        value={selectedSessionId}
                        label="Session"
                        onChange={(e) => loadSession(e.target.value)}
                    >
                        {sessions.map(s => (
                            <MenuItem key={s.filename} value={s.filename}>
                                {s.filename} ({(s.size / 1024).toFixed(1)} KB)
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <Button variant="outlined" startIcon={<Refresh />} onClick={fetchSessions}>Refresh</Button>
            </Box>

            {!selectedSessionId ? (
                <Typography variant="h5" sx={{ mt: 10, textAlign: 'center', color: 'text.secondary' }}>
                    Select a Flight Log to Debrief 🎬
                </Typography>
            ) : (
                <Grid container spacing={2} sx={{ flex: 1, overflow: 'hidden' }}>

                    {/* LEFT: Map & Plot */}
                    <Grid item xs={8} sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Paper sx={{ flex: 1, minHeight: 300, position: 'relative' }}>
                            <FlightMap
                                vehicles={replayVehicles}
                                externalPolylines={[{ points: flightPath, color: 'cyan' }]}
                                readOnly={true}
                            />
                        </Paper>

                        <Paper sx={{ height: 250, p: 1 }}>
                            <Typography variant="subtitle2">Altitude Profile (Relative)</Typography>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={graphData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} label={{ value: 'Time (s)', position: 'bottom' }} />
                                    <YAxis />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="value" stroke="#8884d8" dot={false} isAnimationActive={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </Paper>
                    </Grid>

                    {/* RIGHT: Controls & Inspector */}
                    <Grid item xs={4} sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>

                        {/* Control Deck */}
                        <Paper sx={{ p: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
                                <IconButton onClick={() => setPlaybackSpeed(Math.max(0.1, playbackSpeed / 2))}><FastRewind /></IconButton>
                                <IconButton onClick={() => setIsPlaying(!isPlaying)} size="large">
                                    {isPlaying ? <Pause /> : <PlayArrow />}
                                </IconButton>
                                <IconButton onClick={() => setPlaybackSpeed(Math.min(10, playbackSpeed * 2))}><FastForward /></IconButton>
                            </Box>
                            <Typography align="center" variant="caption">Speed: {playbackSpeed}x</Typography>

                            <Slider
                                value={currentTime}
                                min={0}
                                max={duration}
                                onChange={(e, v) => { setIsPlaying(false); setCurrentTime(v); }}
                                valueLabelDisplay="auto"
                                valueLabelFormat={v => (v / 1000000).toFixed(1) + 's'}
                            />

                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="caption">{(currentTime / 1000000).toFixed(1)}s</Typography>
                                <Typography variant="caption">{(duration / 1000000).toFixed(1)}s</Typography>
                            </Box>
                        </Paper>

                        {/* Inspector */}
                        <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder="Filter messages..."
                                    value={filterText}
                                    onChange={(e) => setFilterText(e.target.value)}
                                />
                            </Box>
                            <TableContainer sx={{ flex: 1 }}>
                                <Table size="small" stickyHeader>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>ID</TableCell>
                                            <TableCell>Data</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {filteredMessages.map((m, i) => (
                                            <TableRow key={i} hover selected={m.timestamp_us > startTime + currentTime}>
                                                <TableCell>{m.msgid}</TableCell>
                                                <TableCell>
                                                    <pre style={{ margin: 0, fontSize: '0.7rem' }}>
                                                        {JSON.stringify(m.data, null, 2)}
                                                    </pre>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>

                    </Grid>
                </Grid>
            )}
        </Box>
    );
};

export default DebriefPage;
