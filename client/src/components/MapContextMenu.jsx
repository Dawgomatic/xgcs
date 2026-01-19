import React from 'react';
import { Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import {
    AddLocation,
    Flag,
    Fence,
    FlightTakeoff,
    FlightLand,
    Home,
    Clear,
    Upload,
    Download,
    Save,
    Edit,
    GridOn
} from '@mui/icons-material';

const MapContextMenu = ({
    anchorPosition,
    open,
    onClose,
    coordinate,
    onAction,
    drawMode,
    surveyMode
}) => {
    if (!coordinate) return null;

    const handleAction = (action) => {
        onAction(action, coordinate);
        onClose();
    };

    return (
        <Menu
            open={open}
            onClose={onClose}
            anchorReference="anchorPosition"
            anchorPosition={anchorPosition}
            PaperProps={{
                sx: { width: 220, maxWidth: '100%' }
            }}
        >
            <MenuItem disabled>
                <ListItemText
                    primary="Map Action"
                    secondary={`${coordinate.lat.toFixed(6)}, ${coordinate.lon.toFixed(6)}`}
                    primaryTypographyProps={{ variant: 'subtitle2' }}
                    secondaryTypographyProps={{ variant: 'caption', fontSize: '0.7rem' }}
                />
            </MenuItem>
            <Divider />

            {/* Flight Control Actions */}
            <MenuItem onClick={() => handleAction('fly_to')}>
                <ListItemIcon><FlightTakeoff fontSize="small" /></ListItemIcon>
                <ListItemText>Fly Here</ListItemText>
            </MenuItem>

            <Divider />

            {/* Mission Planning Actions */}
            <MenuItem onClick={() => handleAction('mission_upload')}>
                <ListItemIcon><Upload fontSize="small" /></ListItemIcon>
                <ListItemText>Upload Mission</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleAction('mission_download')}>
                <ListItemIcon><Download fontSize="small" /></ListItemIcon>
                <ListItemText>Download Mission</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleAction('mission_draw_toggle')}>
                <ListItemIcon><Edit fontSize="small" color={drawMode ? "secondary" : "inherit"} /></ListItemIcon>
                <ListItemText>{drawMode ? "Stop Drawing" : "Draw Waypoints"}</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleAction('add_waypoint')}>
                <ListItemIcon><AddLocation fontSize="small" /></ListItemIcon>
                <ListItemText>Add Waypoint Here</ListItemText>
            </MenuItem>

            <Divider />

            <MenuItem onClick={() => handleAction('mission_load')}>
                <ListItemIcon><Upload fontSize="small" /></ListItemIcon>
                <ListItemText>Load File</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleAction('mission_save')}>
                <ListItemIcon><Save fontSize="small" /></ListItemIcon>
                <ListItemText>Save File</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleAction('mission_survey_toggle')}>
                <ListItemIcon><GridOn fontSize="small" color={surveyMode ? "secondary" : "inherit"} /></ListItemIcon>
                <ListItemText>{surveyMode ? "Cancel Survey" : "Survey Grid"}</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleAction('mission_clear')}>
                <ListItemIcon><Clear fontSize="small" color="error" /></ListItemIcon>
                <ListItemText>Clear Mission</ListItemText>
            </MenuItem>

            <Divider />

            <MenuItem onClick={() => handleAction('set_home')}>
                <ListItemIcon><Home fontSize="small" /></ListItemIcon>
                <ListItemText>Set Home</ListItemText>
            </MenuItem>

            <Divider />

            {/* Safety Actions */}
            <MenuItem onClick={() => handleAction('add_rally')}>
                <ListItemIcon><Flag fontSize="small" /></ListItemIcon>
                <ListItemText>Rally Point</ListItemText>
            </MenuItem>

            <MenuItem onClick={() => handleAction('fence_vertex')}>
                <ListItemIcon><Fence fontSize="small" /></ListItemIcon>
                <ListItemText>Fence Vertex</ListItemText>
            </MenuItem>

        </Menu>
    );
};

export default MapContextMenu;
