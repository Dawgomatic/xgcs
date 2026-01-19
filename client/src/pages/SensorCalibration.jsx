import React, { useState } from 'react';
import {
    Container,
    Tabs,
    Tab,
    Box,
    Alert,
    Paper
} from '@mui/material';
import CompassAccelWizard from '../components/calibration/CompassAccelWizard';
import RadioCalibration from '../components/calibration/RadioCalibration';
import MotorTest from '../components/calibration/MotorTest';
import PowerSetup from '../components/calibration/PowerSetup';
import JoystickConfig from '../components/calibration/JoystickConfig';
import { useVehicles } from '../context/VehicleContext';

export default function SensorCalibration() {
    const { activeVehicle } = useVehicles();
    const [tab, setTab] = useState(0);

    const handleChange = (event, newValue) => {
        setTab(newValue);
    };

    if (!activeVehicle) {
        return (
            <Container sx={{ mt: 4 }}>
                <Alert severity="info">Please connect a vehicle to perform calibration.</Alert>
            </Container>
        );
    }

    return (
        <Container maxWidth="lg" sx={{ mt: 4 }}>
            <Box mb={3}>
                <Paper square>
                    <Tabs
                        value={tab}
                        onChange={handleChange}
                        indicatorColor="primary"
                        textColor="primary"
                        visibleScrollbar
                        variant="scrollable"
                        scrollButtons="auto"
                    >
                        <Tab label="Sensors (Compass/Accel)" />
                        <Tab label="Radio Control" />
                        <Tab label="Power Setup" />
                        <Tab label="Motor Test" />
                        <Tab label="Joystick" />
                    </Tabs>
                </Paper>
            </Box>

            {tab === 0 && <CompassAccelWizard />}
            {tab === 1 && <RadioCalibration />}
            {tab === 2 && <PowerSetup />}
            {tab === 3 && <MotorTest />}
            {tab === 4 && <JoystickConfig />}
        </Container>
    );
}
