import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Button,
    LinearProgress,
    IconButton,
    Alert,
    Chip
} from '@mui/material';
import { CloudDownload, Refresh } from '@mui/icons-material';
import { useVehicles } from '../../context/VehicleContext';

const LogBrowser = () => {
    const { activeVehicle } = useVehicles();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [downloading, setDownloading] = useState({}); // Map of logId -> { progress, status, error }

    const fetchLogs = async () => {
        if (!activeVehicle) return;
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/logs/list?vehicleId=${activeVehicle.id}`);
            const data = await res.json();
            // Sort by date desc
            data.sort((a, b) => new Date(b.date) - new Date(a.date));
            setLogs(data);
        } catch (err) {
            console.error("Log fetch error:", err);
            setError("Failed to fetch log list.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [activeVehicle]);

    const handleDownload = async (logId) => {
        try {
            setDownloading(prev => ({ ...prev, [logId]: { progress: 0, status: 'starting' } }));

            const res = await fetch(`/api/logs/download/${logId}`, { method: 'POST' });
            if (!res.ok) throw new Error("Start failed");

            // Poll status
            const interval = setInterval(async () => {
                try {
                    const statusRes = await fetch(`/api/logs/download/${logId}/status`);
                    const statusData = await statusRes.json();

                    setDownloading(prev => ({
                        ...prev,
                        [logId]: {
                            progress: statusData.progress * 100,
                            status: statusData.status
                        }
                    }));

                    if (statusData.status === 'success' || statusData.status === 'error') {
                        clearInterval(interval);
                        if (statusData.status === 'success') {
                            // Trigger file download to browser? 
                            // Currently the backend downloads to server/logs.
                            // Ideally we would then serve it. For MVP, we just confirm it's on the server.
                            // Future: stream binary to browser.
                        }
                    }
                } catch (e) {
                    clearInterval(interval);
                }
            }, 1000);

        } catch (err) {
            setDownloading(prev => ({ ...prev, [logId]: { progress: 0, status: 'error', error: err.message } }));
        }
    };

    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Flight Logs</Typography>
                <Button startIcon={<Refresh />} onClick={fetchLogs} disabled={loading || !activeVehicle}>
                    Refresh
                </Button>
            </Box>

            {!activeVehicle && <Alert severity="warning">Connect vehicle to view logs</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
            {loading && <LinearProgress />}

            <TableContainer component={Paper} sx={{ flex: 1, overflow: 'auto' }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Log ID</TableCell>
                            <TableCell>Date</TableCell>
                            <TableCell>Size</TableCell>
                            <TableCell align="right">Action</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {logs.map((log) => {
                            const dl = downloading[log.id];
                            return (
                                <TableRow key={log.id}>
                                    <TableCell>{log.id}</TableCell>
                                    <TableCell>{log.date}</TableCell>
                                    <TableCell>{formatBytes(log.size_bytes)}</TableCell>
                                    <TableCell align="right" sx={{ width: 200 }}>
                                        {dl && dl.status === 'downloading' ? (
                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                <LinearProgress variant="determinate" value={dl.progress} sx={{ width: 100, mr: 1 }} />
                                                <Typography variant="caption">{Math.round(dl.progress)}%</Typography>
                                            </Box>
                                        ) : dl && dl.status === 'success' ? (
                                            <Chip label="Saved on Server" color="success" size="small" />
                                        ) : (
                                            <IconButton color="primary" onClick={() => handleDownload(log.id)}>
                                                <CloudDownload />
                                            </IconButton>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {!loading && logs.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} align="center">No logs found</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
};

export default LogBrowser;
