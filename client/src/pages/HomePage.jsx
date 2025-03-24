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
    const [viewer, setViewer] = useState(null);
    const [isLocked, setIsLocked] = useState(false);
    const [vehicleEntities, setVehicleEntities] = useState({});
    const [connectedVehicles, setConnectedVehicles] = useState([]);
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [telemetryData, setTelemetryData] = useState(null);
    const telemetryIntervalRef = useRef(null);
    const defaultEntityRef = useRef(null);

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

    // Function to start polling for telemetry data
    const startTelemetryPolling = (vehicleId) => {
        // Clear any existing interval
        if (telemetryIntervalRef.current) {
            clearInterval(telemetryIntervalRef.current);
        }
        
        // Find the vehicle config from connectedVehicles
        const vehicleConfig = connectedVehicles.find(v => v.id === vehicleId);
        
        // Function to fetch telemetry data
        const fetchTelemetry = async () => {
            try {
                const response = await fetch(`http://localhost:3001/telemetry?vehicleId=${vehicleId}`);
                if (response.ok) {
                    const data = await response.json();
                    setTelemetryData(data);
                    
                    // Update the entity position and orientation with vehicle config
                    updateVehicleEntity(vehicleId, data, vehicleConfig);
                }
            } catch (error) {
                console.error('Error fetching telemetry:', error);
            }
        };
        
        // Fetch immediately
        fetchTelemetry();
        
        // Set up polling interval
        telemetryIntervalRef.current = setInterval(fetchTelemetry, 100);
    };

    // Update or create a vehicle entity based on telemetry data
    const updateVehicleEntity = (vehicleId, data, vehicleConfig) => {
        if (!viewer) return;
        
        // If we have position data
        if (data.position) {
            const { lat, lng, alt } = data.position;
            const position = Cartesian3.fromDegrees(lng, lat, alt);
            
            // If we have attitude data
            let orientation;
            if (data.attitude) {
                const { roll, pitch, yaw } = data.attitude;
                const hpr = new HeadingPitchRoll(
                    degreesToRadians(yaw),
                    degreesToRadians(pitch),
                    degreesToRadians(roll)
                );
                orientation = Transforms.headingPitchRollQuaternion(position, hpr);
            }
            
            // Check if we already have an entity for this vehicle
            if (vehicleEntities[vehicleId]) {
                // Update existing entity
                const entity = vehicleEntities[vehicleId];
                entity.position = position;
                if (orientation) {
                    entity.orientation = orientation;
                }
                
                // If the vehicle has a 3D model configured, use it
                if (vehicleConfig && vehicleConfig.modelUrl) {
                    // Remove the point if it exists
                    if (entity.point) {
                        entity.point = undefined;
                    }
                    
                    // Add or update the model
                    if (!entity.model) {
                        entity.model = {
                            uri: vehicleConfig.modelUrl,
                            minimumPixelSize: 128,
                            maximumScale: 20000,
                            scale: vehicleConfig.modelScale || 1.0,
                            runAnimations: false,
                            heightReference: 0
                        };
                    } else {
                        entity.model.uri = vehicleConfig.modelUrl;
                        entity.model.scale = vehicleConfig.modelScale || 1.0;
                    }
                } else {
                    // Ensure the point is visible if no model is configured
                    if (!entity.point) {
                        entity.point = {
                            pixelSize: 15,
                            color: Color.RED,
                            outlineColor: Color.WHITE,
                            outlineWidth: 2,
                            heightReference: 0 // NONE
                        };
                    }
                }
                
                // Ensure the label is visible
                if (!entity.label) {
                    entity.label = {
                        text: vehicleId,
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
                    };
                }
            } else {
                // Create a new entity with a point
                const entity = viewer.entities.add({
                    name: vehicleId,
                    position: position,
                    orientation: orientation,
                    point: {
                        pixelSize: 15,
                        color: Color.RED,
                        outlineColor: Color.WHITE,
                        outlineWidth: 2,
                        heightReference: 0 // NONE
                    },
                    label: {
                        text: vehicleId,
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
                    },
                    path: {
                        show: true,
                        width: 3,
                        material: Color.RED,
                        leadTime: 0,
                        trailTime: 60,
                        resolution: 1
                    }
                });
                
                // Store the entity reference
                setVehicleEntities(prev => ({
                    ...prev,
                    [vehicleId]: entity
                }));
                
                // Hide the default entity if we have a real vehicle
                if (defaultEntityRef.current) {
                    defaultEntityRef.current.show = false;
                }
                
                // If the vehicle has a 3D model configured, use it
                if (vehicleConfig && vehicleConfig.modelUrl) {
                    entity.model = {
                        uri: vehicleConfig.modelUrl,
                        minimumPixelSize: 128,
                        maximumScale: 20000,
                        scale: vehicleConfig.modelScale || 1.0,
                        runAnimations: false,
                        heightReference: 0
                    };
                    entity.point = undefined; // Remove the point
                }
            }
        }
    };

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

        if (viewerContainer.current) {
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

            setViewer(cesiumViewer);

            // Add a default entity
            const entity = addDefaultEntity(cesiumViewer);
            defaultEntityRef.current = entity;

            // Clean up on unmount
            return () => {
                if (cesiumViewer && !cesiumViewer.isDestroyed()) {
                    cesiumViewer.destroy();
                }
            };
        }
    }, []);

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
        if (!viewer) return;
        
        let entityToSnap;
        
        if (selectedVehicle && vehicleEntities[selectedVehicle]) {
            entityToSnap = vehicleEntities[selectedVehicle];
        } else if (defaultEntityRef.current) {
            entityToSnap = defaultEntityRef.current;
        } else {
            console.warn("No entity to snap to");
            return; // No entity to snap to
        }
        
        // Just use zoomTo which is the most reliable method
        viewer.zoomTo(entityToSnap);
    };

    // Fetch connected vehicles
    useEffect(() => {
        const fetchConnectedVehicles = async () => {
            try {
                const response = await fetch('http://localhost:3001/connections');
                if (response.ok) {
                    const data = await response.json();
                    setConnectedVehicles(data.connections || []);
                }
            } catch (error) {
                console.error('Error fetching connections:', error);
            }
        };

        // Fetch initially
        fetchConnectedVehicles();

        // Set up polling
        const interval = setInterval(fetchConnectedVehicles, 5000);
        
        return () => clearInterval(interval);
    }, []);

    // Start telemetry polling when a vehicle is selected
    useEffect(() => {
        if (selectedVehicle) {
            startTelemetryPolling(selectedVehicle);
        }
        
        return () => {
            if (telemetryIntervalRef.current) {
                clearInterval(telemetryIntervalRef.current);
            }
        };
    }, [selectedVehicle]); // Include startTelemetryPolling in dependencies

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

    return (
        <HomeErrorBoundary>
            <div id="wrapper" style={{ 
                width: '100%', 
                height: '100%',
                position: 'relative',
                overflow: 'hidden',
                left: '20px',
                paddingtop: '-10px',
            }}>
                <div ref={viewerContainer} id="cesiumContainer" style={{ 
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    overflow: 'hidden'
                }}></div>
                
                {/* Control panel */}
                <div style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    zIndex: 1000,
                    background: 'rgba(255,255,255,0.8)',
                    padding: '10px',
                    borderRadius: '5px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                }}>
                    {/* Vehicle selection dropdown */}
                    {connectedVehicles.length > 0 && (
                        <div>
                            <label htmlFor="vehicle-select" style={{ display: 'block', marginBottom: '5px' }}>Select Vehicle:</label>
                            <select 
                                id="vehicle-select"
                                value={selectedVehicle || ''}
                                onChange={(e) => setSelectedVehicle(e.target.value)}
                                style={{ padding: '5px', width: '100%' }}
                            >
                                <option value="">Select Vehicle</option>
                                {connectedVehicles.map(vehicle => (
                                    <option key={vehicle.id} value={vehicle.id}>
                                        {vehicle.id}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    
                    {/* Snap to Vehicle button */}
                    <button 
                        onClick={snapToVehicle}
                        style={{ padding: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                    >
                        <FontAwesomeIcon icon={faCrosshairs} />
                        Snap to Vehicle
                    </button>
                </div>
                
                {/* Telemetry data display */}
                {telemetryData && (
                    <div
                        ref={boxRef}
                        style={{
                            position: 'absolute',
                            width: boxStyle.width,
                            height: boxStyle.height,
                            top: boxStyle.top,
                            left: boxStyle.left,
                            backgroundColor: 'rgba(173, 216, 230, 0.8)',
                            cursor: isLocked ? 'default' : 'move',
                            zIndex: 9999,
                            padding: '10px',
                            borderRadius: '5px',
                            overflow: 'auto'
                        }}
                        onMouseDown={handleMouseDown}
                    >
                        <FontAwesomeIcon
                            icon={isBoxLocked ? faLock : faUnlock}
                            style={{
                                position: 'absolute',
                                top: 5,
                                right: 5,
                                cursor: 'pointer',
                            }}
                            onClick={toggleBoxLock}
                        />
                        <h3 style={{ margin: '0 0 10px 0' }}>Telemetry: {selectedVehicle}</h3>
                        <div style={{ fontSize: '0.9em' }}>
                            <div><strong>Position:</strong> {telemetryData.position.lat.toFixed(6)}°, {telemetryData.position.lng.toFixed(6)}°, {telemetryData.position.alt.toFixed(1)}m</div>
                            <div><strong>Attitude:</strong> R: {telemetryData.attitude.roll.toFixed(1)}°, P: {telemetryData.attitude.pitch.toFixed(1)}°, Y: {telemetryData.attitude.yaw.toFixed(1)}°</div>
                            <div><strong>Battery:</strong> {telemetryData.battery.voltage.toFixed(1)}V, {telemetryData.battery.remaining.toFixed(0)}%</div>
                            <div><strong>Flight Mode:</strong> {telemetryData.flight_mode}</div>
                            <div><strong>Armed:</strong> {telemetryData.armed ? 'Yes' : 'No'}</div>
                            <div><strong>Health:</strong></div>
                            <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                                <li>Gyro: {telemetryData.health.gyro_ok ? 'OK' : 'NOT OK'}</li>
                                <li>Accel: {telemetryData.health.accel_ok ? 'OK' : 'NOT OK'}</li>
                                <li>Mag: {telemetryData.health.mag_ok ? 'OK' : 'NOT OK'}</li>
                                <li>GPS: {telemetryData.health.gps_ok ? 'OK' : 'NOT OK'}</li>
                            </ul>
                        </div>
                        <div
                            style={{
                                position: 'absolute',
                                width: 10,
                                height: 10,
                                bottom: 0,
                                right: 0,
                                backgroundColor: 'darkblue',
                                cursor: isLocked ? 'default' : 'nwse-resize',
                            }}
                            onMouseDown={handleResize}
                        />
                    </div>
                )}
            </div>
        </HomeErrorBoundary>
    );
}

export default HomePage; 