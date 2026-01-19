import React, { useState } from 'react';
import {
    Box, List, ListItem, ListItemButton, ListItemText, Checkbox,
    Typography, Chip, IconButton, TextField, InputAdornment,
    Tooltip, Badge, Paper, Divider, Button
} from '@mui/material';
import {
    Search, BatteryFull, BatteryAlert, BatteryStd,
    SignalCellular4Bar, SignalCellularOff,
    FlightTakeoff, CheckBox, CheckBoxOutlineBlank
} from '@mui/icons-material';
import { useVehicles } from '../context/VehicleContext';

const FleetSidebar = ({ selectedIds, onSelectionChange }) => {
    const { vehicles, activeVehicle, setManualActiveVehicleId } = useVehicles();
    const [searchTerm, setSearchTerm] = useState('');

    // Filter vehicles
    // Sort by ID to keep order stable
    const sortedVehicles = [...vehicles].sort((a, b) => a.id.localeCompare(b.id));

    const filteredVehicles = sortedVehicles.filter(v =>
        v.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.name && v.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const handleToggle = (id) => {
        const newSelected = selectedIds.includes(id)
            ? selectedIds.filter(sid => sid !== id)
            : [...selectedIds, id];
        onSelectionChange(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedIds.length === filteredVehicles.length) {
            onSelectionChange([]);
        } else {
            onSelectionChange(filteredVehicles.map(v => v.id));
        }
    };

    const handleSetActive = (id, e) => {
        // Prevent triggering active selection when clicking checkbox
        e.stopPropagation();
        setManualActiveVehicleId(id);
    };

    // Helper for battery icon
    const getBatteryIcon = (level) => {
        if (level < 20) return <BatteryAlert fontSize="small" color="error" />;
        if (level < 50) return <BatteryStd fontSize="small" color="warning" />;
        return <BatteryFull fontSize="small" color="success" />;
    };

    return (
        <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="h6" gutterBottom>
                    Fleet ({vehicles.length})
                </Typography>
                <TextField
                    fullWidth
                    size="small"
                    placeholder="Search agents..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <Search />
                            </InputAdornment>
                        ),
                    }}
                />
                <Box sx={{ mt: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Button size="small" onClick={handleSelectAll}>
                        {selectedIds.length === filteredVehicles.length ? "Deselect All" : "Select All"}
                    </Button>
                    <Typography variant="caption" color="text.secondary">
                        {selectedIds.length} selected
                    </Typography>
                </Box>
            </Box>

            <List sx={{ flexGrow: 1, overflowY: 'auto', p: 0 }}>
                {filteredVehicles.map((vehicle) => {
                    const isActive = activeVehicle && activeVehicle.id === vehicle.id;
                    const isSelected = selectedIds.includes(vehicle.id);

                    return (
                        <React.Fragment key={vehicle.id}>
                            <ListItem
                                disablePadding
                                secondaryAction={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Tooltip title={`Battery: ${vehicle.batteryLevel}%`}>
                                            {getBatteryIcon(vehicle.batteryLevel)}
                                        </Tooltip>
                                        <Tooltip title={vehicle.connected ? "Connected" : "Disconnected"}>
                                            {vehicle.connected ?
                                                <SignalCellular4Bar fontSize="small" color="success" /> :
                                                <SignalCellularOff fontSize="small" color="disabled" />
                                            }
                                        </Tooltip>
                                    </Box>
                                }
                            >
                                <ListItemButton
                                    selected={isActive}
                                    onClick={(e) => handleSetActive(vehicle.id, e)}
                                    dense
                                >
                                    <Checkbox
                                        edge="start"
                                        checked={isSelected}
                                        tabIndex={-1}
                                        disableRipple
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggle(vehicle.id);
                                        }}
                                    />
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Typography variant="body2" fontWeight={isActive ? 'bold' : 'normal'}>
                                                    {vehicle.id}
                                                </Typography>
                                                {vehicle.flightMode && (
                                                    <Chip
                                                        label={vehicle.flightMode}
                                                        size="small"
                                                        color={vehicle.armed ? "error" : "default"}
                                                        variant="outlined"
                                                        sx={{ height: 20, fontSize: '0.6rem' }}
                                                    />
                                                )}
                                            </Box>
                                        }
                                    />
                                </ListItemButton>
                            </ListItem>
                            <Divider component="li" />
                        </React.Fragment>
                    );
                })}
            </List>
        </Paper>
    );
};

export default FleetSidebar;
