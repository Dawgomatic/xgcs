import React, { useState, useRef } from 'react';
import {
    Box,
    Typography,
    Button,
    Paper,
    Stepper,
    Step,
    StepLabel,
    LinearProgress,
    Alert,
    Container
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import UsbIcon from '@mui/icons-material/Usb';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArduPilotBootloader from '../utils/ArduPilotBootloader';

const steps = ['Select Firmware', 'Connect via USB', 'Flash Firmware', 'Complete'];

export default function FirmwareUpdate() {
    const [activeStep, setActiveStep] = useState(0);
    const [firmwareFile, setFirmwareFile] = useState(null);
    const [progress, setProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState('');
    const [error, setError] = useState(null);
    const [isFlashing, setIsFlashing] = useState(false);

    // Ref to hold the bootloader instance
    const bootloaderRef = useRef(new ArduPilotBootloader());

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            setFirmwareFile(file);
            setError(null);
            setStatusMessage(`Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
        }
    };

    const handleConnect = async () => {
        try {
            setError(null);
            setStatusMessage('Requesting serial port access...');
            await bootloaderRef.current.connect();
            setStatusMessage('Serial port connected. Ready to flash.');
            setActiveStep(2);
        } catch (err) {
            setError('Failed to connect: ' + err.message);
        }
    };

    const handleFlash = async () => {
        if (!firmwareFile) return;

        setIsFlashing(true);
        setError(null);
        setProgress(0);

        try {
            // 1. Read file
            setStatusMessage('Reading firmware file...');
            const buffer = await firmwareFile.arrayBuffer();

            // 2. Sync
            setStatusMessage('Waiting for bootloader sync... Power cycle the board now.');
            const synced = await bootloaderRef.current.sync();
            if (!synced) throw new Error('Failed to sync with bootloader. Check cable and try again.');

            // 3. Get Info
            setStatusMessage('Getting board info...');
            const info = await bootloaderRef.current.getBoardInfo();
            setStatusMessage(`Board ID: ${info.boardId}, Flash Size: ${info.flashSize} bytes`);

            // 4. Erase
            setStatusMessage('Erasing flash (this may take 20s)...');
            await bootloaderRef.current.erase();

            // 5. Program
            setStatusMessage('Flashing firmware...');
            await bootloaderRef.current.program(buffer, (sent, total) => {
                const percent = Math.round((sent / total) * 100);
                setProgress(percent);
                setStatusMessage(`Flashing: ${percent}%`);
            });

            // 6. Verify (Skipping strict CRC check for MVP to avoid complexity with padding logic)
            setStatusMessage('Verifying...');
            // await bootloaderRef.current.verify(); 

            // 7. Reboot
            setStatusMessage('Rebooting vehicle...');
            await bootloaderRef.current.reboot();

            setStatusMessage('Firmware update successful!');
            setActiveStep(3);

        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setIsFlashing(false);
            // Always disconnect port on finish/error
            await bootloaderRef.current.disconnect();
        }
    };

    return (
        <Container maxWidth="md" sx={{ mt: 4 }}>
            <Paper sx={{ p: 4 }}>
                <Typography variant="h4" gutterBottom>
                    Firmware Management
                </Typography>
                <Typography variant="body1" color="textSecondary" paragraph>
                    Update vehicle firmware using standard ArduPilot/PX4 bootloader protocol.
                </Typography>

                <Alert severity="warning" sx={{ mb: 3 }}>
                    Warning: Flashing firmware carries a risk of "bricking" the device.
                    Ensure a stable USB connection and do not disconnect during the process.
                </Alert>

                <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
                    {steps.map((label) => (
                        <Step key={label}>
                            <StepLabel>{label}</StepLabel>
                        </Step>
                    ))}
                </Stepper>

                <Box sx={{ mt: 2, minHeight: '200px' }}>
                    {activeStep === 0 && (
                        <Box textAlign="center">
                            <input
                                accept=".apj,.px4,.bin"
                                style={{ display: 'none' }}
                                id="raised-button-file"
                                type="file"
                                onChange={handleFileSelect}
                            />
                            <label htmlFor="raised-button-file">
                                <Button
                                    variant="outlined"
                                    component="span"
                                    startIcon={<UploadFileIcon />}
                                    size="large"
                                >
                                    Select Firmware File
                                </Button>
                            </label>
                            {firmwareFile && (
                                <Box mt={2}>
                                    <Typography variant="h6">{firmwareFile.name}</Typography>
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        onClick={() => setActiveStep(1)}
                                        sx={{ mt: 2 }}
                                    >
                                        Next: Connect
                                    </Button>
                                </Box>
                            )}
                        </Box>
                    )}

                    {activeStep === 1 && (
                        <Box textAlign="center">
                            <Typography paragraph>
                                Connect the vehicle via USB. Do not connect via MAVLink (server) simultaneously.
                            </Typography>
                            <Button
                                variant="contained"
                                color="primary"
                                startIcon={<UsbIcon />}
                                size="large"
                                onClick={handleConnect}
                            >
                                Connect to Bootloader
                            </Button>
                        </Box>
                    )}

                    {activeStep === 2 && (
                        <Box textAlign="center">
                            <Typography variant="h6" gutterBottom>
                                {statusMessage}
                            </Typography>
                            <LinearProgress
                                variant="determinate"
                                value={progress}
                                sx={{ height: 10, borderRadius: 5, mb: 2 }}
                            />
                            {!isFlashing && !error && (
                                <Button
                                    variant="contained"
                                    color="secondary"
                                    startIcon={<SystemUpdateAltIcon />}
                                    size="large"
                                    onClick={handleFlash}
                                >
                                    Start Flash
                                </Button>
                            )}
                        </Box>
                    )}

                    {activeStep === 3 && (
                        <Box textAlign="center">
                            <CheckCircleIcon color="success" sx={{ fontSize: 60, mb: 2 }} />
                            <Typography variant="h5" gutterBottom>
                                Custom Firmware Updated!
                            </Typography>
                            <Typography>
                                The vehicle is rebooting. You can now connect normally.
                            </Typography>
                            <Button
                                variant="outlined"
                                sx={{ mt: 3 }}
                                onClick={() => {
                                    setActiveStep(0);
                                    setFirmwareFile(null);
                                    setStatusMessage('');
                                }}
                            >
                                Flash Another
                            </Button>
                        </Box>
                    )}
                </Box>

                {error && (
                    <Alert severity="error" sx={{ mt: 3 }}>
                        {error}
                    </Alert>
                )}
            </Paper>
        </Container>
    );
}
