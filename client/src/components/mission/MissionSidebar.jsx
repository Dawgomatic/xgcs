import React, { useState } from 'react';
import {
    Box, Paper, Tabs, Tab, Typography, Grid, Button, IconButton,
    List, ListItem, ListItemText, ListItemSecondaryAction, Divider, Chip,
    Card, CardContent, Dialog, DialogTitle, DialogContent, TextField,
    FormControl, InputLabel, Select, MenuItem, DialogActions
} from '@mui/material';
import {
    Map as MapIcon,
    ViewList,
    SafetyCheck,
    Add,
    Delete,
    Edit,
    Upload,
    Download,
    Save,
    Clear,
    GridOn,
    Fence,
    Flag,
    Warning
} from '@mui/icons-material';
import FleetSidebar from '../FleetSidebar';
import FailsafeConfig from '../safety/FailsafeConfig';
import LinkAnalysisTool from './LinkAnalysisTool';

const MissionSidebar = ({
    // Core Props
    activeVehicle,
    leftPanelTab,
    setLeftPanelTab,

    // Mission Props
    waypoints,
    setWaypoints,
    onUpload,
    onDownload,
    onClear,
    onSave,
    onImport,
    fileInputRef,
    isUploading,
    isDownloading,

    // Survey Props
    surveyMode,
    setSurveyMode,

    // Draw Mode Props
    drawMode,
    setDrawMode,

    // Fleet Props
    selectedFleetIds,
    setSelectedFleetIds,

    // Safety Props
    safetyTabValue,
    setSafetyTabValue,
    fencePoints,
    onUploadFence,
    onClearFence,
    rallyPoints,
    onUploadFence,
    onClearFence,
    rallyPoints,
    onUploadRally,

    // Analysis Props
    onUpdateRangeRing
}) => {

    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [selectedWaypoint, setSelectedWaypoint] = useState(null);

    // --- Internal Components (Extracted from old MissionPlanning.jsx) ---

    const handleEditWaypoint = (wp) => {
        setSelectedWaypoint(wp);
        setEditDialogOpen(true);
    };

    const handleSaveWaypoint = () => {
        if (selectedWaypoint) {
            setWaypoints(waypoints.map(wp =>
                wp.id === selectedWaypoint.id ? selectedWaypoint : wp
            ));
        }
        setEditDialogOpen(false);
        setSelectedWaypoint(null);
    };

    const WaypointEditDialog = () => (
        <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>Edit Waypoint</DialogTitle>
            <DialogContent>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            label="Description"
                            value={selectedWaypoint?.description || ''}
                            onChange={(e) => setSelectedWaypoint({ ...selectedWaypoint, description: e.target.value })}
                        />
                    </Grid>

                    {/* Action Selector */}
                    <Grid item xs={12}>
                        <FormControl fullWidth>
                            <InputLabel>Action</InputLabel>
                            <Select
                                value={selectedWaypoint?.action || 'NAV_WAYPOINT'}
                                onChange={(e) => {
                                    const act = e.target.value;
                                    // Reset params if switching types? For now keep simple.
                                    setSelectedWaypoint({ ...selectedWaypoint, action: act });
                                }}
                            >
                                <MenuItem value="NAV_WAYPOINT">Navigate (Standard)</MenuItem>
                                <MenuItem value="NAV_RETURN_TO_LAUNCH">Return to Launch (RTL)</MenuItem>
                                <MenuItem value="NAV_LAND">Land</MenuItem>
                                <MenuItem value="NAV_TAKEOFF">Takeoff</MenuItem>
                                <Divider />
                                <MenuItem value="CMD_DO_SET_CAM_TRIGG_DIST">Camera Trigger (Distance)</MenuItem>
                                <MenuItem value="CMD_DO_DIGICAM_CONTROL">Camera Trigger (Instant)</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>

                    {/* Conditional Fields based on Action */}
                    {selectedWaypoint?.action === 'CMD_DO_SET_CAM_TRIGG_DIST' ? (
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Trigger Distance (meters)"
                                helperText="0 to stop triggering"
                                type="number"
                                value={selectedWaypoint?.param1 || 0}
                                onChange={(e) => setSelectedWaypoint({ ...selectedWaypoint, param1: parseFloat(e.target.value) })}
                            />
                        </Grid>
                    ) : (
                        <>
                            <Grid item xs={6}>
                                <TextField
                                    fullWidth
                                    label="Latitude"
                                    type="number"
                                    value={selectedWaypoint?.lat || 0}
                                    onChange={(e) => setSelectedWaypoint({ ...selectedWaypoint, lat: parseFloat(e.target.value) })}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField
                                    fullWidth
                                    label="Longitude"
                                    type="number"
                                    value={selectedWaypoint?.lon || 0}
                                    onChange={(e) => setSelectedWaypoint({ ...selectedWaypoint, lon: parseFloat(e.target.value) })}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField
                                    fullWidth
                                    label="Altitude (m)"
                                    type="number"
                                    value={selectedWaypoint?.altitude || 0}
                                    onChange={(e) => setSelectedWaypoint({ ...selectedWaypoint, altitude: parseFloat(e.target.value) })}
                                />
                            </Grid>
                            {selectedWaypoint?.action === 'NAV_WAYPOINT' && (
                                <Grid item xs={6}>
                                    <TextField
                                        fullWidth
                                        label="Speed (m/s)"
                                        type="number"
                                        value={selectedWaypoint?.speed || 0}
                                        onChange={(e) => setSelectedWaypoint({ ...selectedWaypoint, speed: parseFloat(e.target.value) })}
                                    />
                                </Grid>
                            )}
                        </>
                    )}
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveWaypoint} variant="contained">Save</Button>
            </DialogActions>
        </Dialog>
    );

    const MissionControls = () => (
        <Card sx={{ mb: 2 }}>
            <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept=".plan,.json"
                    onChange={onImport}
                />
                <Grid container spacing={1}>
                    <Grid item xs={6}>
                        <Button
                            fullWidth size="small"
                            startIcon={<Upload />}
                            variant="contained"
                            onClick={onUpload}
                            disabled={(!activeVehicle && selectedFleetIds.length === 0) || isUploading}
                        >
                            Upload
                        </Button>
                    </Grid>
                    <Grid item xs={6}>
                        <Button
                            fullWidth size="small"
                            startIcon={<Download />}
                            variant="outlined"
                            onClick={onDownload}
                            disabled={!activeVehicle || isDownloading}
                        >
                            Download
                        </Button>
                    </Grid>
                    <Grid item xs={6}>
                        <Button
                            fullWidth size="small"
                            startIcon={<Save />}
                            variant="outlined"
                            onClick={onSave}
                        >
                            Save File
                        </Button>
                    </Grid>
                    <Grid item xs={6}>
                        <Button
                            fullWidth size="small"
                            startIcon={<Upload />}
                            variant="outlined"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            Load File
                        </Button>
                    </Grid>
                    <Grid item xs={6}>
                        <Button
                            fullWidth size="small"
                            startIcon={<Edit />}
                            variant={drawMode ? "contained" : "outlined"}
                            color={drawMode ? "secondary" : "primary"}
                            onClick={() => setDrawMode(!drawMode)}
                        >
                            Draw WPs
                        </Button>
                    </Grid>
                    <Grid item xs={6}>
                        <Button
                            fullWidth size="small"
                            startIcon={<GridOn />}
                            variant={surveyMode ? "contained" : "outlined"}
                            color={surveyMode ? "secondary" : "primary"}
                            onClick={() => setSurveyMode(!surveyMode)}
                        >
                            Scans
                        </Button>
                    </Grid>
                    <Grid item xs={6}>
                        <Button
                            fullWidth size="small"
                            startIcon={<Clear />}
                            variant="outlined"
                            color="error"
                            onClick={onClear}
                        >
                            Clear
                        </Button>
                    </Grid>
                </Grid>
            </CardContent>
        </Card>
    );

    const WaypointList = () => (
        <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
            <List dense>
                {waypoints.map((waypoint, index) => (
                    <React.Fragment key={waypoint.id}>
                        <ListItem>
                            <ListItemText
                                primary={`#${index + 1} ${waypoint.action.replace('NAV_', '')}`}
                                secondary={`${waypoint.lat.toFixed(5)}, ${waypoint.lon.toFixed(5)} | ${waypoint.altitude}m`}
                            />
                            <ListItemSecondaryAction>
                                <IconButton edge="end" size="small" onClick={() => handleEditWaypoint(waypoint)}>
                                    <Edit fontSize="small" />
                                </IconButton>
                                <IconButton edge="end" size="small" onClick={() => setWaypoints(waypoints.filter(wp => wp.id !== waypoint.id))}>
                                    <Delete fontSize="small" />
                                </IconButton>
                            </ListItemSecondaryAction>
                        </ListItem>
                        <Divider />
                    </React.Fragment>
                ))}
            </List>
            {waypoints.length === 0 && (
                <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 4 }}>
                    No waypoints. Click map or "Load File".
                </Typography>
            )}
        </Box>
    );

    const SafetyPanel = () => (
        <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 1 }}>
            <Tabs value={safetyTabValue} onChange={(e, v) => setSafetyTabValue(v)} variant="fullWidth" sx={{ mb: 2 }}>
                <Tab icon={<Fence fontSize="small" />} label="Fence" />
                <Tab icon={<Flag fontSize="small" />} label="Rally" />
                <Tab icon={<Warning fontSize="small" />} label="Failsafe" />
            </Tabs>

            {safetyTabValue === 0 && (
                <Box>
                    <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
                        Fence Points: {fencePoints.length}
                    </Typography>
                    <Button fullWidth variant="contained" size="small" onClick={onUploadFence} disabled={!activeVehicle || fencePoints.length < 3}>
                        Upload Fence
                    </Button>
                    <Button fullWidth variant="outlined" color="error" size="small" onClick={onClearFence} disabled={!activeVehicle} sx={{ mt: 1 }}>
                        Clear Fence
                    </Button>
                </Box>
            )}

            {safetyTabValue === 1 && (
                <Box>
                    <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
                        Rally Points: {rallyPoints.length}
                    </Typography>
                    <Button fullWidth variant="contained" color="warning" size="small" onClick={onUploadRally} disabled={!activeVehicle || rallyPoints.length === 0}>
                        Upload Rally Points
                    </Button>
                </Box>
            )}

            {safetyTabValue === 2 && <FailsafeConfig />}
        </Box>
    );

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Paper sx={{ mb: 1 }}>
                <Tabs
                    value={leftPanelTab}
                    onChange={(e, v) => setLeftPanelTab(v)}
                    variant="fullWidth"
                    indicatorColor="primary"
                    textColor="primary"
                    size="small"
                >
                    <Tab icon={<MapIcon fontSize="small" />} label="Plan" />
                    <Tab icon={<ViewList fontSize="small" />} label="Fleet" />
                    <Tab icon={<SafetyCheck fontSize="small" />} label="Safety" />
                </Tabs>
            </Paper>

            {leftPanelTab === 0 && (
                <>
                    <MissionControls />
                    <LinkAnalysisTool
                        missionItems={waypoints}
                        onUpdateRangeRing={onUpdateRangeRing}
                    />
                    <WaypointList />
                </>
            )}

            {leftPanelTab === 1 && (
                <FleetSidebar
                    selectedIds={selectedFleetIds}
                    onSelectionChange={setSelectedFleetIds}
                />
            )}

            {leftPanelTab === 2 && <SafetyPanel />}

            <WaypointEditDialog />
        </Box>
    );
};

export default MissionSidebar;
