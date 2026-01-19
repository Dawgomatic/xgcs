import React, { useState, useEffect } from 'react';
import { Paper, Typography, IconButton, Box, CircularProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';

// Simple draggable video player component
const VideoPlayer = ({ onClose }) => {
    const [streamUrl, setStreamUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const startStream = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetch('/api/video/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ udp_port: 5600, http_port: 8082 })
            });

            if (!response.ok) throw new Error("Failed to start stream");

            const data = await response.json();
            // Add timestamp to bypass browser cache issues on restart
            setStreamUrl(`${data.url}?t=${Date.now()}`);
            setLoading(false);
        } catch (err) {
            console.error("Video stream error:", err);
            setError("Stream failed. Is GStreamer installed?");
            setLoading(false);
        }
    };

    useEffect(() => {
        startStream();

        // Cleanup on unmount
        return () => {
            fetch('/api/video/stop', { method: 'POST' }).catch(e => console.error("Stop error:", e));
        };
    }, []);

    return (
        <Paper
            elevation={6}
            sx={{
                position: 'absolute',
                bottom: 20,
                left: 20,
                width: 320,
                height: 240,
                bgcolor: 'black',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                border: '1px solid #444'
            }}
        >
            {/* Header */}
            <Box sx={{
                p: 0.5,
                bgcolor: 'rgba(0,0,0,0.7)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 2
            }}>
                <Typography variant="caption" sx={{ color: 'white', ml: 1, fontWeight: 'bold' }}>
                    LIVE FEED (UDP:5600)
                </Typography>
                <Box>
                    <IconButton size="small" onClick={startStream} sx={{ color: 'white' }}>
                        <RefreshIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={onClose} sx={{ color: 'white' }}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Box>
            </Box>

            {/* Video Content */}
            <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                {loading && <CircularProgress size={30} />}
                {error && (
                    <Typography variant="caption" color="error" align="center" sx={{ px: 2 }}>
                        {error}
                    </Typography>
                )}
                {!loading && !error && streamUrl && (
                    <img
                        src={streamUrl}
                        alt="Live Stream"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={() => setError("Stream connection lost")}
                    />
                )}
            </Box>
        </Paper>
    );
};

export default VideoPlayer;
