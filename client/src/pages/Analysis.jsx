import React, { useState } from 'react';
import { Container, Box, Tabs, Tab, Alert } from '@mui/material';
import RealTimePlotter from '../components/analysis/RealTimePlotter';
import MavlinkConsole from '../components/analysis/MavlinkConsole';
import LogBrowser from '../components/Analysis/LogBrowser';
import DebriefPage from './DebriefPage';
import { useVehicles } from '../context/VehicleContext';

const Analysis = () => {
    const { activeVehicle } = useVehicles();
    const [tab, setTab] = useState(0);

    return (
        <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
                <Container maxWidth="xl">
                    <Tabs value={tab} onChange={(e, v) => setTab(v)}>
                        <Tab label="Real-Time Plotter" />
                        <Tab label="MAVLink Console" />
                        <Tab label="Log Browser" />
                        <Tab label="Debrief / Replay" />
                    </Tabs>
                </Container>
            </Box>

            <Container maxWidth="xl" sx={{ flexGrow: 1, py: 2, overflow: 'hidden' }}>
                {!activeVehicle && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        No vehicle connected. Connect a vehicle to analyze live data.
                    </Alert>
                )}

                {tab === 0 && (
                    <Box sx={{ height: '100%' }}>
                        <RealTimePlotter vehicleId={activeVehicle?.id} />
                    </Box>
                )}

                {tab === 1 && (
                    <Box sx={{ height: '100%' }}>
                        <MavlinkConsole vehicleId={activeVehicle?.id} />
                    </Box>
                )}

                {tab === 2 && (
                    <Box sx={{ height: '100%' }}>
                        <LogBrowser />
                    </Box>
                )}

                {tab === 2 && (
                    <Box sx={{ height: '100%' }}>
                        <LogBrowser />
                    </Box>
                )}

                {tab === 3 && (
                    <Box sx={{ height: '100%' }}>
                        <DebriefPage />
                    </Box>
                )}
            </Container>
        </Box>
    );
};

export default Analysis;
