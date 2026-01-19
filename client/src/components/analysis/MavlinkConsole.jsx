import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Paper,
    Typography,
    TextField,
    IconButton,
    Divider,
} from '@mui/material';
import { Send, Delete } from '@mui/icons-material';

const MavlinkConsole = ({ vehicleId }) => {
    const [lines, setLines] = useState([]);
    const [input, setInput] = useState('');
    const endRef = useRef(null);

    useEffect(() => {
        if (!vehicleId) return;
        const ws = new WebSocket(`ws://${window.location.hostname}:8081/api/mavlink/stream`);

        ws.onopen = () => ws.send(vehicleId);

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.msgName === 'STATUSTEXT') {
                // STATUSTEXT fields: severity, text, id, chunk_seq
                const text = msg.fields.text || '';
                // Clean null bytes
                const cleanText = text.replace(/\0/g, '');

                setLines(prev => [...prev, {
                    timestamp: new Date().toLocaleTimeString(),
                    severity: msg.fields.severity,
                    text: cleanText
                }].slice(-500)); // Keep last 500 lines
            }
        };

        return () => ws.close();
    }, [vehicleId]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [lines]);

    const handleSend = () => {
        if (!input.trim()) return;
        // Logic to send shell command would go here
        // For now, local echo
        setLines(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString(),
            severity: -1, // Local echo
            text: `> ${input}`
        }]);
        setInput('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSend();
    };

    const getSeverityColor = (sev) => {
        switch (sev) {
            case 0: return '#d32f2f'; // EMERG - Red
            case 1: return '#d32f2f'; // ALERT
            case 2: return '#f57c00'; // CRIT - Orange
            case 3: return '#f57c00'; // ERR
            case 4: return '#fbc02d'; // WARN - Yellow
            case 6: return '#388e3c'; // INFO - Green
            case -1: return '#1976d2'; // Local Input - Blue
            default: return '#e0e0e0'; // DEBUG/Others
        }
    };

    return (
        <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#1e1e1e', color: '#fff' }}>
            <Box sx={{ p: 1, display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #333' }}>
                <Typography variant="subtitle2" sx={{ fontFamily: 'monospace' }}>MAVLink Console</Typography>
                <IconButton size="small" onClick={() => setLines([])} sx={{ color: '#aaa' }}>
                    <Delete fontSize="small" />
                </IconButton>
            </Box>

            <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 1, fontFamily: 'monospace', fontSize: '0.9rem' }}>
                {lines.map((l, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1, color: getSeverityColor(l.severity) }}>
                        <span>[{l.timestamp}]</span>
                        <span>{l.text}</span>
                    </Box>
                ))}
                <div ref={endRef} />
            </Box>

            <Divider sx={{ borderColor: '#333' }} />

            <Box sx={{ p: 1, display: 'flex', gap: 1 }}>
                <TextField
                    fullWidth
                    size="small"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter MAVLink command..."
                    sx={{
                        input: { color: '#fff', fontFamily: 'monospace' },
                        fieldset: { borderColor: '#555' }
                    }}
                />
                <IconButton onClick={handleSend} sx={{ color: '#fff' }}>
                    <Send />
                </IconButton>
            </Box>
        </Paper>
    );
};

export default MavlinkConsole;
