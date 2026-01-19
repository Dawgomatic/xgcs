import React from 'react';
import {
    FormControl,
    Select,
    MenuItem,
    Box,
    Typography,
    Chip
} from '@mui/material';
import { FlightTakeoff, FlightLand, ConnectedTv, SignalCellularOff } from '@mui/icons-material';
import { useVehicles } from '../context/VehicleContext';

const VehicleSelector = () => {
    const {
        vehicles,
        activeVehicle,
        setManualActiveVehicleId
    } = useVehicles();

    const handleChange = (event) => {
        setManualActiveVehicleId(event.target.value);
    };

    if (!vehicles || vehicles.length === 0) {
        return (
            <Chip
                label="No Vehicles"
                color="default"
                size="small"
                variant="outlined"
                sx={{ borderColor: 'rgba(255,255,255,0.5)', color: 'white' }}
            />
        );
    }

    return (
        <FormControl size="small" sx={{ minWidth: 200, m: 1 }}>
            <Select
                value={activeVehicle?.id || ''}
                onChange={handleChange}
                displayEmpty
                sx={{
                    color: 'white',
                    '.MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(255, 255, 255, 0.3)',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(255, 255, 255, 0.5)',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'white',
                    },
                    '.MuiSvgIcon-root': {
                        color: 'white',
                    },
                }}
                renderValue={(selected) => {
                    if (!selected) return <Typography>Select Vehicle</Typography>;
                    const vehicle = vehicles.find(v => v.id === selected);
                    return (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <FlightTakeoff fontSize="small" />
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                {vehicle?.name || selected}
                            </Typography>
                        </Box>
                    );
                }}
            >
                {vehicles.map((vehicle) => (
                    <MenuItem key={vehicle.id} value={vehicle.id}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {vehicle.in_air ? <FlightTakeoff color="primary" fontSize="small" /> : <FlightLand color="action" fontSize="small" />}
                                <Typography variant="body2">{vehicle.name || vehicle.id}</Typography>
                            </Box>
                            <Chip
                                label={vehicle.flightMode || 'UNKNOWN'}
                                size="small"
                                color={vehicle.armed ? "error" : "default"}
                                variant="outlined"
                                sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
                            />
                        </Box>
                    </MenuItem>
                ))}
            </Select>
        </FormControl>
    );
};

export default VehicleSelector;
