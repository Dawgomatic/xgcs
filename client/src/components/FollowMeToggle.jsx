import React, { useState, useEffect, useRef } from 'react';
import { Fab, Tooltip } from '@mui/material';
import { GpsMyLocation } from '@mui/icons-material';

const FollowMeToggle = ({ vehicleId, onStatusChange }) => {
    const [active, setActive] = useState(false);
    const watchIdRef = useRef(null);
    const lastUpdateRef = useRef(0);

    const stopFollow = () => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        setActive(false);
        if (onStatusChange) onStatusChange('Stopped');

        // Optionally switch to Loiter
        if (vehicleId) {
            fetch('/api/command/mode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vehicleId, mode: 'LOITER' })
            }).catch(e => console.error(e));
        }
    };

    const startFollow = () => {
        if (!vehicleId) return;

        // Switch to FOLLOW mode first
        fetch('/api/command/mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vehicleId, mode: 'FOLLOW' }) // MAVSDK/PX4 'FOLLOW' or 'GUIDED' dependent?
            // ArduPilot uses GUIDED usually for dynamic points, or FOLLOW mode.
            // Using 'FOLLOW_TARGET' message usually implies 'FOLLOW' mode.
            // Let's try 'FOLLOW_ME' or 'AG_FOLLOW'? 
            // MAVSDK::MissionRaw implies just sending commands?
            // Let's assume 'GUIDED' or 'FOLLOW'. 
            // If 'FOLLOW' fails, we might need 'GUIDED'.
        }).then(res => {
            if (res.ok) {
                setActive(true);
                if (onStatusChange) onStatusChange('Active');

                watchIdRef.current = navigator.geolocation.watchPosition(
                    (position) => {
                        const now = Date.now();
                        if (now - lastUpdateRef.current < 1000) return; // Limit to 1Hz

                        lastUpdateRef.current = now;

                        const payload = {
                            vehicleId,
                            lat: position.coords.latitude,
                            lon: position.coords.longitude,
                            alt: position.coords.altitude || 0, // This is often WGS84 or similar. MAVLink expects MSL usually.
                            vn: 0,
                            ve: 0,
                            vd: 0
                            // velocity calculation from previous point could be done here if needed
                        };

                        console.log('Sending Follow Me Target:', payload);

                        fetch('/api/command/follow_target', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        }).catch(e => console.error("Follow Target Error:", e));
                    },
                    (err) => {
                        console.error(err);
                        stopFollow();
                        if (onStatusChange) onStatusChange('GPS Error');
                    },
                    {
                        enableHighAccuracy: true,
                        maximumAge: 0,
                        timeout: 5000
                    }
                );
            } else {
                console.error("Failed to switch flight mode for Follow Me");
                if (onStatusChange) onStatusChange('Mode Switch Failed');
            }
        });
    };

    const toggle = () => {
        if (active) {
            stopFollow();
        } else {
            startFollow();
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
    }, []);

    // Cleanup if vehicle changes
    useEffect(() => {
        if (active && !vehicleId) {
            stopFollow();
        }
    }, [vehicleId]);

    return (
        <Tooltip title={active ? "Stop Follow Me" : "Start Follow Me"}>
            <Fab
                color={active ? "secondary" : "default"}
                onClick={toggle}
                size="medium"
                sx={{
                    position: 'absolute',
                    top: 20,
                    right: 20, // Adjust position as needed relative to map container
                    zIndex: 1000
                }}
            >
                <GpsMyLocation />
            </Fab>
        </Tooltip>
    );
};

export default FollowMeToggle;
