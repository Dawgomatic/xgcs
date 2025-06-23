import React, { useEffect, useState, useRef } from 'react';
import { 
    Ion, 
    Viewer,
    createWorldTerrainAsync,
    ImageryLayer,
    IonImageryProvider,
    Color,
    createDefaultImageryProviderViewModels,
    Cartesian3,
    HeadingPitchRoll,
    Transforms,
    VerticalOrigin,
    HorizontalOrigin,
    LabelStyle,
    HeadingPitchRange,
    KeyboardEventModifier,
    CameraEventType
} from 'cesium';
import "cesium/Build/Cesium/Widgets/widgets.css";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faUnlock, faPlus, faEye, faEyeSlash, faCrosshairs } from '@fortawesome/free-solid-svg-icons';
import { useVehicles } from '../context/VehicleContext'; // Import the context hook
import { 
  Box, 
  Grid, 
  Paper, 
  Typography, 
  IconButton, 
  Chip,
  Card,
  CardContent,
  LinearProgress
} from '@mui/material';
import {
  Flight,
  Map,
  Videocam,
  Speed,
  Height,
  Battery90,
  SignalCellular4Bar,
  GpsFixed,
  CompassCalibration
} from '@mui/icons-material';
import FlightMap from '../components/FlightMap';
import InstrumentPanel from '../components/InstrumentPanel';
import FlightModeSelector from '../components/FlightModeSelector';
import VideoPanel from '../components/VideoPanel';

const defaultToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2MmM0MDgzZC00OGVkLTRjZTItOWI2MS1jMGVhYTM2MmMzODYiLCJpZCI6MjczNywiaWF0IjoxNjYyMTI4MjkxfQ.fPqhawtYLhwyZirKCi8fEjPEIn1CjYqETvA0bYYhWRA';

// Default position (San Francisco)
const DEFAULT_POSITION = {
    lat: 37.7749,
    lng: -122.4194,
    alt: 100
};

// Default attitude
const DEFAULT_ATTITUDE = {
    roll: 0,
    pitch: 0,
    yaw: 0
};

// Add this function to convert degrees to radians
function degreesToRadians(degrees) {
    return degrees * Math.PI / 180.0;
}

class HomeErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error) {
        console.error('Error boundary caught error:', error);
        return { hasError: true };
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="error-container">
                    <h2>Something went wrong in the home page.</h2>
                    <button onClick={() => this.setState({ hasError: false })}>Try again</button>
                </div>
            );
        }
        return this.props.children;
    }
}

function HomePage() {
    const viewerContainer = useRef(null);
    const viewerRef = useRef(null); // Use a ref for the viewer instance
    const [isLocked, setIsLocked] = useState(false);
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const defaultEntityRef = useRef(null);
    
    // Get data and functions from context
    const { 
        connectedVehicles, 
        vehicleEntities, // Use entities from context for snapToVehicle
        telemetryData, 
        setViewer, // Function to pass viewer to context
        startTelemetryPolling, // Use context's polling start
        stopTelemetryPolling // Use context's polling stop
    } = useVehicles();

    // Initialize state with values from localStorage if available
    const initialBoxStyle = JSON.parse(localStorage.getItem('boxStyle')) || {
        width: 300,
        height: 300,
        top: 100,
        left: 100,
    };
    const [boxStyle, setBoxStyle] = useState(initialBoxStyle);

    const initialIsBoxLocked = JSON.parse(localStorage.getItem('isBoxLocked')) || false;
    const [isBoxLocked, setIsBoxLocked] = useState(initialIsBoxLocked);

    const boxRef = useRef(null);

    // Save box style and lock state to localStorage
    useEffect(() => {
        localStorage.setItem('boxStyle', JSON.stringify(boxStyle));
        localStorage.setItem('isBoxLocked', JSON.stringify(isBoxLocked));
    }, [boxStyle, isBoxLocked]);

    // Initialize Cesium viewer
    useEffect(() => {
        const savedToken = localStorage.getItem('cesiumIonKey') || defaultToken;
        Ion.defaultAccessToken = savedToken;
        window.CESIUM_BASE_URL = '/cesium';

        let isMounted = true; // Flag to prevent state updates on unmounted component

        if (viewerContainer.current && !viewerRef.current) {
            console.log("Attempting to initialize Cesium Viewer...");
            const cesiumViewer = new Viewer(viewerContainer.current, {
                homeButton: false,
                timeline: true,
                animation: true,
                requestRenderMode: true,
                shouldAnimate: true,
                scene3DOnly: false,
                selectionIndicator: false,
                shadows: true,
                baseLayer: new ImageryLayer.fromProviderAsync(
                    IonImageryProvider.fromAssetId(3954)
                )
            });

            viewerRef.current = cesiumViewer;
            setViewer(cesiumViewer); // Pass viewer instance to context
            console.log("Cesium viewer instance created and passed to context.");

            // Add a default entity 
            const defaultEntity = addDefaultEntity(cesiumViewer);
            if (defaultEntity) {
                defaultEntityRef.current = defaultEntity;
                console.log("Default entity added.");
            } else {
                console.warn("Failed to add default entity.");
            }
        } else {
            // Log if the effect runs but doesn't initialize (e.g., viewer already exists)
            if (viewerRef.current) {
                console.log("Viewer initialization effect ran, but viewer already exists.");
            } else {
                console.log("Viewer initialization effect ran, but viewerContainer is not ready.");
            }
        }

        // Clean up on unmount
        return () => {
            isMounted = false;
            console.log("HomePage unmounting - cleaning up viewer...");
            // Check if viewerRef.current exists and is not already destroyed
            const viewerInstance = viewerRef.current;
            if (viewerInstance && !viewerInstance.isDestroyed()) {
                console.log("Destroying Cesium viewer instance...");
                viewerInstance.destroy();
                console.log("Cesium viewer instance destroyed.");
            }
            // Always clear the ref and context on cleanup
            viewerRef.current = null;
            // Check if setViewer is still valid before calling
            if (typeof setViewer === 'function') {
                setViewer(null); 
            }
            console.log("Viewer ref and context viewer cleared.");
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // <<<< Use Empty dependency array to run only ONCE on mount

    // Add this function to create a default entity with a point
    const addDefaultEntity = (cesiumViewer) => {
        if (!cesiumViewer) return null;

        console.log('Adding default entity...');

        // Convert lat/lng to Cartesian3
        const position = Cartesian3.fromDegrees(
            DEFAULT_POSITION.lng,
            DEFAULT_POSITION.lat,
            DEFAULT_POSITION.alt
        );

        // Create a default entity with a point
        const entity = cesiumViewer.entities.add({
            name: 'Default Vehicle',
            position: position,
            point: {
                pixelSize: 15,
                color: Color.RED,
                outlineColor: Color.WHITE,
                outlineWidth: 2,
                heightReference: 0 // NONE
            },
            label: {
                text: 'Default Vehicle',
                font: '14pt sans-serif',
                style: LabelStyle.FILL_AND_OUTLINE,
                outlineWidth: 2,
                verticalOrigin: VerticalOrigin.BOTTOM,
                pixelOffset: new Cartesian3(0, -15, 0),
                fillColor: Color.WHITE,
                outlineColor: Color.BLACK,
                showBackground: true,
                backgroundColor: new Color(0.165, 0.165, 0.165, 0.8),
                backgroundPadding: new Cartesian3(7, 5, 0),
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
        });

        console.log('Entity created:', entity);
        
        // Fly to the entity with a better view
        cesiumViewer.camera.flyTo({
            destination: Cartesian3.fromDegrees(
                DEFAULT_POSITION.lng,
                DEFAULT_POSITION.lat - 0.01,
                DEFAULT_POSITION.alt + 500
            ),
            orientation: {
                heading: 0.0,
                pitch: -Math.PI/6,
                roll: 0.0
            }
        });
        
        return entity;
    };

    // Ultra-simple version of snapToVehicle
    const snapToVehicle = () => {
        const viewer = viewerRef.current;
        if (!viewer) return;
        
        let entityToSnap;
        
        if (selectedVehicle && vehicleEntities[selectedVehicle]) {
            entityToSnap = vehicleEntities[selectedVehicle];
        } else if (defaultEntityRef.current && defaultEntityRef.current.show) {
            entityToSnap = defaultEntityRef.current;
        } else {
            const firstVehicleId = Object.keys(vehicleEntities)[0];
            if (firstVehicleId) {
                entityToSnap = vehicleEntities[firstVehicleId];
            } else {
                console.warn("No entity to snap to");
                return;
            }
        }
        
        if (entityToSnap) {
            viewer.zoomTo(entityToSnap);
        }
    };

    // Start/Stop telemetry polling when selectedVehicle changes
    useEffect(() => {
        if (selectedVehicle) {
            startTelemetryPolling(selectedVehicle);
        }
        
        return () => {
            if (selectedVehicle) {
                // Consider if stopping polling here is right,
                // maybe only stop on unmount or disconnect?
                // Context handles stop on disconnect, so maybe do nothing here?
            }
        };
    }, [selectedVehicle, startTelemetryPolling, stopTelemetryPolling]);

    // Handle mouse down for dragging the telemetry box
    const handleMouseDown = (e) => {
        if (isLocked || e.target !== boxRef.current) return;
        
        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = boxStyle.left;
        const startTop = boxStyle.top;
        
        const handleMouseMove = (e) => {
            const newLeft = startLeft + (e.clientX - startX);
            const newTop = startTop + (e.clientY - startY);
            setBoxStyle((prevStyle) => ({
                ...prevStyle,
                left: newLeft,
                top: newTop,
            }));
        };
        
        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };
    
    // Handle resize for the telemetry box
    const handleResize = (e) => {
        if (isLocked) return;
        e.stopPropagation();
        
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = boxStyle.width;
        const startHeight = boxStyle.height;
        
        const handleMouseMove = (e) => {
            const newWidth = startWidth + (e.clientX - startX);
            const newHeight = startHeight + (e.clientY - startY);
            setBoxStyle((prevStyle) => ({
                ...prevStyle,
                width: newWidth,
                height: newHeight,
            }));
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const toggleBoxLock = () => {
        setIsBoxLocked(!isBoxLocked);
        setIsLocked(!isLocked);
    };

    // Get telemetry for the selected vehicle from context data
    const currentTelemetry = telemetryData[selectedVehicle];

    // Flight display states
    const [mapVisible, setMapVisible] = useState(true);
    const [videoVisible, setVideoVisible] = useState(false);
    const [instrumentPanelVisible, setInstrumentPanelVisible] = useState(true);

    return (
        <HomeErrorBoundary>
            <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Main content area */}
                <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    {/* Main Map Area */}
                    <Box sx={{ 
                        flex: 1, 
                        position: 'relative',
                        display: mapVisible ? 'block' : 'none'
                    }}>
                        <FlightMap 
                            vehicle={selectedVehicle ? { id: selectedVehicle, ...currentTelemetry } : null}
                            vehicles={connectedVehicles.map(v => ({ 
                                id: v.id || v.name, 
                                coordinate: currentTelemetry?.position ? {
                                    lat: currentTelemetry.position.lat,
                                    lon: currentTelemetry.position.lng
                                } : null,
                                altitude: currentTelemetry?.position?.alt || 0,
                                flightMode: currentTelemetry?.flight_mode || 'UNKNOWN',
                                batteryLevel: currentTelemetry?.battery?.remaining || 0,
                                airspeed: currentTelemetry?.velocity?.airspeed || 0
                            }))}
                        />
                    </Box>

                    {/* Side Panel */}
                    <Box sx={{ 
                        width: 350, 
                        display: 'flex', 
                        flexDirection: 'column',
                        borderLeft: 1,
                        borderColor: 'divider',
                        bgcolor: 'background.paper'
                    }}>
                        {/* Instrument Panel */}
                        {instrumentPanelVisible && (
                            <Box sx={{ flex: 1, p: 2, borderBottom: 1, borderColor: 'divider' }}>
                                <Typography variant="h6" gutterBottom>
                                    Instrument Panel
                                </Typography>
                                <InstrumentPanel 
                                    vehicle={selectedVehicle ? { id: selectedVehicle, ...currentTelemetry } : null}
                                />
                            </Box>
                        )}

                        {/* Video Panel */}
                        {videoVisible && (
                            <Box sx={{ flex: 1, p: 2 }}>
                                <Typography variant="h6" gutterBottom>
                                    Video Feed
                                </Typography>
                                <VideoPanel vehicle={selectedVehicle} />
                            </Box>
                        )}

                        {/* Vehicle Info */}
                        {currentTelemetry && (
                            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
                                <Typography variant="h6" gutterBottom>
                                    Vehicle: {selectedVehicle}
                                </Typography>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2">Flight Mode:</Typography>
                                        <Chip 
                                            label={currentTelemetry.flight_mode || 'UNKNOWN'} 
                                            size="small" 
                                            color="primary"
                                        />
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2">Altitude:</Typography>
                                        <Typography variant="body2">
                                            {currentTelemetry.position?.alt ? `${currentTelemetry.position.alt.toFixed(1)} m` : 'N/A'}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2">Battery:</Typography>
                                        <Typography variant="body2">
                                            {currentTelemetry.battery?.remaining ? `${currentTelemetry.battery.remaining.toFixed(0)}%` : 'N/A'}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2">Armed:</Typography>
                                        <Typography variant="body2">
                                            {currentTelemetry.armed !== undefined ? (currentTelemetry.armed ? 'Yes' : 'No') : 'N/A'}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Box>
                        )}
                    </Box>
                </Box>

                {/* Legacy Cesium viewer (hidden but kept for compatibility) */}
                <div ref={viewerContainer} id="cesiumContainer" style={{ 
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    overflow: 'hidden',
                    display: 'none' // Hide the old viewer
                }}></div>
            </Box>
        </HomeErrorBoundary>
    );
}

export default HomePage; 