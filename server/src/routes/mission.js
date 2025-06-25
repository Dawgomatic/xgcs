const express = require('express');
const router = express.Router();
const MissionService = require('../services/MissionService');

// Create mission service instance
const missionService = new MissionService();

// Download mission from vehicle
router.get('/download/:vehicleId', async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const result = await missionService.loadFromVehicle(vehicleId);
    
    if (result.success) {
      res.json({
        success: true,
        items: result.items,
        count: result.items.length
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[Mission Route] Download error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Upload mission to vehicle
router.post('/upload/:vehicleId', async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const { items, waypoints } = req.body;
    
    let missionItems = items;
    
    // If waypoints are provided instead of full mission items, create mission
    if (!items && waypoints) {
      const home = waypoints[0] || { lat: 0, lng: 0, alt: 0 };
      missionItems = missionService.createSimpleMission(vehicleId, home, waypoints.slice(1));
    }
    
    const result = await missionService.uploadToVehicle(vehicleId, missionItems);
    
    if (result.success) {
      res.json({
        success: true,
        itemCount: result.itemCount
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[Mission Route] Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Clear mission
router.post('/clear/:vehicleId', async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const result = await missionService.clearMission(vehicleId);
    
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[Mission Route] Clear error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start mission
router.post('/start/:vehicleId', async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const result = await missionService.startMission(vehicleId);
    
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[Mission Route] Start error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Pause mission
router.post('/pause/:vehicleId', async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const result = await missionService.pauseMission(vehicleId);
    
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[Mission Route] Pause error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Set current mission item
router.post('/set-current/:vehicleId', async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const { index } = req.body;
    
    const result = await missionService.setCurrentItem(vehicleId, index);
    
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[Mission Route] Set current error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get mission progress
router.get('/progress/:vehicleId', async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const progress = missionService.getMissionProgress(vehicleId);
    
    res.json({
      success: true,
      ...progress
    });
  } catch (error) {
    console.error('[Mission Route] Progress error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create test mission
router.post('/create-test/:vehicleId', async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const { home, radius = 100, altitude = 50 } = req.body;
    
    const homePos = home || { lat: 37.7749, lng: -122.4194, alt: 0 };
    
    // Create a square pattern around home
    const waypoints = [
      { lat: homePos.lat + 0.001, lng: homePos.lng + 0.001, alt: altitude },
      { lat: homePos.lat + 0.001, lng: homePos.lng - 0.001, alt: altitude },
      { lat: homePos.lat - 0.001, lng: homePos.lng - 0.001, alt: altitude },
      { lat: homePos.lat - 0.001, lng: homePos.lng + 0.001, alt: altitude }
    ];
    
    const missionItems = missionService.createSimpleMission(vehicleId, homePos, waypoints);
    
    res.json({
      success: true,
      items: missionItems,
      count: missionItems.length
    });
  } catch (error) {
    console.error('[Mission Route] Create test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router; 