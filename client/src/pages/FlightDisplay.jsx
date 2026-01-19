import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Grid, Paper, IconButton, Drawer, Typography, Snackbar, Alert, Tabs, Tab
} from '@mui/material';
import {
  Settings, Videocam, VideocamOff, Close, Menu, ChevronLeft
} from '@mui/icons-material';
import { useVehicles } from '../context/VehicleContext';
import FlightMap from '../components/FlightMap';
import InstrumentPanel from '../components/InstrumentPanel';
import VideoPanel from '../components/VideoPanel';
import MavlinkInspector from '../components/MavlinkInspector/MavlinkInspector';
import FollowMeToggle from '../components/FollowMeToggle';
import MissionSidebar from '../components/mission/MissionSidebar';
import MapContextMenu from '../components/MapContextMenu';
import ScanEditor from '../components/mission/ScanEditor';

const FlightDisplay = () => {
  const { activeVehicle, vehicles } = useVehicles();
  const [videoVisible, setVideoVisible] = useState(false);
  const [showVideoOverlay, setShowVideoOverlay] = useState(false);
  const [instrumentPanelVisible, setInstrumentPanelVisible] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState(0);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });

  // Unified Side Panel State
  const [missionDrawerOpen, setMissionDrawerOpen] = useState(true); // Open by default
  const [leftPanelTab, setLeftPanelTab] = useState(0);

  // Mission State
  const [waypoints, setWaypoints] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const fileInputRef = useRef(null);

  // Fleet State
  const [selectedFleetIds, setSelectedFleetIds] = useState([]);

  // Scan / Draw State
  // editMode: 'none', 'waypoint', 'polygon', 'polyline', 'point'
  const [editMode, setEditMode] = useState('none');
  const [showScanEditor, setShowScanEditor] = useState(false);

  // Geometry Data
  const [scanPolygon, setScanPolygon] = useState([]);
  const [scanPolyline, setScanPolyline] = useState([]);
  const [scanCenter, setScanCenter] = useState(null);

  // Safety State
  const [safetyTabValue, setSafetyTabValue] = useState(0);
  const [fencePoints, setFencePoints] = useState([]);
  const [rallyPoints, setRallyPoints] = useState([]);

  // Link Analysis State
  const [rangeRing, setRangeRing] = useState(null); // { radius: number, color: string }

  // Context Menu State
  const [contextMenu, setContextMenu] = useState(null); // { mouseX, mouseY }
  const [contextGeo, setContextGeo] = useState(null);

  // --- Handlers ---

  const handleMapClick = (coordinate) => {
    if (editMode === 'waypoint') {
      const newWp = {
        id: Date.now(),
        type: 'WAYPOINT',
        lat: coordinate.lat,
        lon: coordinate.lon,
        altitude: 50,
        speed: 10,
        action: 'NAV_WAYPOINT',
        description: `Waypoint ${waypoints.length + 1}`
      };
      setWaypoints([...waypoints, newWp]);
      return;
    }

    if (editMode === 'polygon') {
      setScanPolygon([...scanPolygon, coordinate]);
      return;
    }

    if (editMode === 'polyline') {
      setScanPolyline([...scanPolyline, coordinate]);
      return;
    }

    if (editMode === 'point') {
      setScanCenter(coordinate);
      // Usually point selection is single shot, switch back to none or keep editing?
      // Keep editing to allow adjustment
      return;
    }

    // Default: View mode (handled by map internally for selection etc)
  };

  const handleContextMenu = (event, coordinate) => {
    setContextGeo(coordinate);
    setContextMenu(event ? { mouseX: event.clientX, mouseY: event.clientY } : null);
  };

  const handleContextAction = (action, coordinate) => {
    switch (action) {
      case 'fly_to':
        if (activeVehicle) {
          fetch('/api/command/goto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vehicleId: activeVehicle.id, lat: coordinate.lat, lon: coordinate.lon, alt: 20 })
          });
          setNotification({ open: true, message: 'Flying to location...', severity: 'info' });
        }
        break;
      case 'add_waypoint':
        const newWp = {
          id: Date.now(),
          type: 'WAYPOINT',
          lat: coordinate.lat,
          lon: coordinate.lon,
          altitude: 50,
          speed: 10,
          action: 'NAV_WAYPOINT',
          description: `Waypoint ${waypoints.length + 1}`
        };
        setWaypoints([...waypoints, newWp]);
        setMissionDrawerOpen(true);
        setLeftPanelTab(0);
        break;
      case 'set_home': break;
      case 'add_rally':
        setMissionDrawerOpen(true);
        setLeftPanelTab(2);
        setSafetyTabValue(1);
        break;
      case 'mission_upload': handleUploadMission(); break;
      case 'mission_download': handleDownloadMission(); break;
      case 'mission_save':
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ fileType: "Plan", mission: { items: waypoints } }));
        const dn = document.createElement('a');
        dn.setAttribute("href", dataStr);
        dn.setAttribute("download", activeVehicle ? `mission_${activeVehicle.id}.plan` : "mission.plan");
        document.body.appendChild(dn); dn.click(); dn.remove();
        break;
      case 'mission_load': fileInputRef.current?.click(); break;
      case 'mission_draw_toggle':
        setEditMode(editMode === 'waypoint' ? 'none' : 'waypoint');
        break;
      case 'mission_survey_toggle': // Reused for Scans
        setShowScanEditor(!showScanEditor);
        break;
      case 'mission_clear':
        setWaypoints([]);
        setScanPolygon([]);
        setScanPolyline([]);
        setScanCenter(null);
        break;
    }
  };

  // --- Mission Handlers ---
  const handleUploadMission = async () => {
    setIsUploading(true);
    let targets = selectedFleetIds.length > 0 ? selectedFleetIds : (activeVehicle ? [activeVehicle.id] : []);
    if (targets.length === 0) {
      alert("No vehicles selected!");
      setIsUploading(false);
      return;
    }
    let successCount = 0;
    for (const vehicleId of targets) {
      try {
        const res = await fetch('/api/mission/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleId, mission: { items: waypoints } })
        });
        const data = await res.json();
        if (data.success) successCount++;
      } catch (e) { console.error(e); }
    }
    setIsUploading(false);
    setNotification({ open: true, message: `Mission uploaded to ${successCount} vehicles`, severity: 'success' });
  };

  const handleDownloadMission = () => {
    if (!activeVehicle) return;
    setIsDownloading(true);
    fetch(`/api/mission/download/${activeVehicle.id}`)
      .then(res => res.json())
      .then(data => {
        setIsDownloading(false);
        if (data.success) {
          const downloaded = data.items.map((item, idx) => ({
            id: Date.now() + idx,
            type: 'WAYPOINT',
            lat: item.lat,
            lon: item.lng,
            altitude: item.alt,
            speed: item.speed || 10,
            action: item.action || 'NAV_WAYPOINT',
            param1: item.param1,
            description: `Downloaded ${idx + 1}`
          }));
          setWaypoints(downloaded);
        }
      })
      .catch(e => setIsDownloading(false));
  };

  const handleImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        if (json.fileType === "Plan" && json.mission?.items) {
          const newWaypoints = json.mission.items.map((item, index) => ({
            id: Date.now() + index,
            type: 'WAYPOINT',
            lat: item.params ? item.params[4] : 0,
            lon: item.params ? item.params[5] : 0,
            altitude: item.params ? item.params[6] : 0,
            speed: 10,
            action: 'NAV_WAYPOINT',
            description: `Imported ${index + 1}`
          }));
          setWaypoints(newWaypoints);
        }
      } catch (e) { alert("Parse Error"); }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // --- Scan Handlers ---
  const handleScanGenerate = (newWps) => {
    const converted = newWps.map((wp, idx) => ({
      id: Date.now() + idx,
      type: 'WAYPOINT',
      lat: wp.lat,
      lon: wp.lng,
      altitude: wp.alt,
      speed: 10,
      action: wp.action || 'NAV_WAYPOINT',
      description: `Scan WP ${idx + 1}`
    }));
    setWaypoints([...waypoints, ...converted]);
    setEditMode('none');
    // Don't close editor automatically, maybe user wants to adjust?
    // setShowScanEditor(false); 
  };

  const handleRequestDraw = (mode) => {
    // mode: 'polygon', 'polyline', 'point'
    setEditMode(mode);
    // Clear existing geometry depending on mode? No, allow editing.
    if (mode === 'polygon') setScanPolygon([]);
    if (mode === 'polyline') setScanPolyline([]);
    // setScanCenter(null);
  };

  // --- Safety Handlers (pass-through) ---
  const handleFenceUpload = async () => { /* ... existing ... */
    if (!activeVehicle) return;
    await fetch('/api/geofence/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicle_id: activeVehicle.id, points: fencePoints })
    });
    setNotification({ open: true, message: 'Geofence Uploaded', severity: 'success' });
  };
  const handleFenceClear = async () => { /* ... existing ... */
    if (!activeVehicle) return;
    await fetch('/api/geofence/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicle_id: activeVehicle.id })
    });
    setNotification({ open: true, message: 'Geofence Cleared', severity: 'warning' });
  };
  const handleRallyUpload = async () => { /* ... existing ... */
    if (!activeVehicle) return;
    await fetch('/api/rally/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicle_id: activeVehicle.id, points: rallyPoints })
    });
    setNotification({ open: true, message: 'Rally Points Uploaded', severity: 'success' });
  };

  return (
    <Box sx={{
      position: 'fixed', top: 60, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: 1
    }}>
      <Grid container sx={{ height: '100%' }}>
        {/* Left Drawer / Panel */}
        <Grid item
          sx={{
            width: missionDrawerOpen ? 350 : 0,
            transition: 'width 0.3s',
            overflow: 'hidden',
            borderRight: 1, borderColor: 'divider',
            display: 'flex', flexDirection: 'column',
            bgcolor: 'background.paper'
          }}
        >
          {missionDrawerOpen && (
            <MissionSidebar
              activeVehicle={activeVehicle}
              leftPanelTab={leftPanelTab}
              setLeftPanelTab={setLeftPanelTab}

              waypoints={waypoints}
              setWaypoints={setWaypoints}
              onUpload={handleUploadMission}
              onDownload={handleDownloadMission}
              onClear={() => { setWaypoints([]); setScanPolygon([]); setScanPolyline([]); setScanCenter(null); }}
              onSave={() => { }}
              onImport={handleImport}
              fileInputRef={fileInputRef}
              isUploading={isUploading}
              isDownloading={isDownloading}

              surveyMode={showScanEditor} // Reused prop name for backward compat or update sidebar
              setSurveyMode={setShowScanEditor}

              drawMode={editMode === 'waypoint'}
              setDrawMode={(val) => setEditMode(val ? 'waypoint' : 'none')}

              selectedFleetIds={selectedFleetIds}
              setSelectedFleetIds={setSelectedFleetIds}

              safetyTabValue={safetyTabValue}
              setSafetyTabValue={setSafetyTabValue}
              fencePoints={fencePoints}
              onUploadFence={handleFenceUpload}
              onClearFence={handleFenceClear}
              rallyPoints={rallyPoints}
              onUploadRally={handleRallyUpload}

              onUpdateRangeRing={setRangeRing}
            />
          )}
        </Grid>

        {/* Toggle Button for Left Drawer */}
        <Paper elevation={2} sx={{ position: 'absolute', top: 10, left: missionDrawerOpen ? 360 : 10, zIndex: 1000, transition: 'left 0.3s', bgcolor: 'rgba(255,255,255,0.9)' }}>
          <IconButton onClick={() => setMissionDrawerOpen(!missionDrawerOpen)}> {missionDrawerOpen ? <ChevronLeft /> : <Menu />} </IconButton>
        </Paper>

        {/* Map Area */}
        <Grid item xs sx={{ height: '100%', position: 'relative' }}>
          <FlightMap
            externalWaypoints={waypoints}

            // Pass geometries for visualization
            externalPolygons={[{ points: scanPolygon, color: '#2196f3' }]}
            externalPolylines={[{ points: scanPolyline, color: '#f50057' }]}
            externalPoints={scanCenter ? [{ ...scanCenter, color: '#ff9800' }] : []}

            // Radio Range Ring
            radioRangeRing={rangeRing}

            onMapClick={handleMapClick}
            mode={leftPanelTab === 2 ? 'safety' : 'mission'}
            onFenceChange={setFencePoints}
            onRallyChange={setRallyPoints}
            onContextMenu={handleContextMenu}
            vehicles={vehicles}
          />

          {activeVehicle && (
            <FollowMeToggle
              vehicleId={activeVehicle.id}
              onStatusChange={(status) => setNotification({ open: true, message: `Follow Me: ${status}`, severity: 'info' })}
            />
          )}

          {/* Video Overlay Toggle */}
          <Paper elevation={2} sx={{ position: 'absolute', top: 10, right: instrumentPanelVisible ? 360 : 10, zIndex: 1000, bgcolor: 'rgba(255,255,255,0.9)', transition: 'right 0.3s' }}>
            <IconButton onClick={() => setShowVideoOverlay(!showVideoOverlay)}> {showVideoOverlay ? <Videocam /> : <VideocamOff />} </IconButton>
          </Paper>

          {/* Scan Editor Overlay */}
          {showScanEditor && (
            <Box sx={{ position: 'absolute', top: 60, left: missionDrawerOpen ? 370 : 60, zIndex: 1100 }}>
              <ScanEditor
                polygon={scanPolygon}
                polyline={scanPolyline}
                centerPoint={scanCenter}
                onGenerate={handleScanGenerate}
                onCancel={() => { setShowScanEditor(false); setEditMode('none'); }}
                onRequestDraw={handleRequestDraw}
              />
            </Box>
          )}
        </Grid>

        {/* Right Panel (Instruments) */}
        <Grid item sx={{ width: instrumentPanelVisible ? 350 : 0, transition: 'width 0.3s', overflow: 'hidden', borderLeft: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
          {instrumentPanelVisible && (
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="subtitle2">Instruments</Typography>
                <IconButton size="small" onClick={() => setInstrumentPanelVisible(false)}><Close /></IconButton>
              </Box>
              <Tabs value={rightPanelTab} onChange={(_, v) => setRightPanelTab(v)} size="small" variant="fullWidth">
                <Tab label="Instruments" />
                <Tab label="Inspector" />
              </Tabs>
              <Box sx={{ flex: 1, overflow: 'auto' }}>
                {rightPanelTab === 0 && <InstrumentPanel vehicle={activeVehicle} />}
                {rightPanelTab === 1 && <MavlinkInspector vehicleId={activeVehicle?.id} />}
              </Box>
              {videoVisible && <Box sx={{ height: 240 }}><VideoPanel vehicle={activeVehicle} /></Box>}
            </Box>
          )}
        </Grid>

        {!instrumentPanelVisible && (
          <Paper elevation={2} sx={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}>
            <IconButton onClick={() => setInstrumentPanelVisible(true)}><Settings /></IconButton>
          </Paper>
        )}

      </Grid>

      {/* Context Menu */}
      <MapContextMenu
        open={contextMenu !== null}
        onClose={() => setContextMenu(null)}
        anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
        coordinate={contextGeo}
        onAction={handleContextAction}
        drawMode={editMode !== 'none'}
        surveyMode={showScanEditor}
      />

      <Snackbar open={notification.open} autoHideDuration={4000} onClose={() => setNotification({ ...notification, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={notification.severity}>{notification.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default FlightDisplay;