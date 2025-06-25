const EventEmitter = require('events');

/**
 * MissionService - Handles mission planning and execution
 * Provides QGroundControl-compatible mission management
 */
class MissionService extends EventEmitter {
  constructor() {
    super();
    this.missions = new Map(); // vehicleId -> mission
    this.missionItems = new Map(); // vehicleId -> array of mission items
    this.currentIndex = new Map(); // vehicleId -> current mission item index
    this.missionState = new Map(); // vehicleId -> mission state
  }

  /**
   * Load mission from vehicle
   * @param {string} vehicleId - Vehicle identifier
   */
  async loadFromVehicle(vehicleId) {
    try {
      // Call C++ backend to download mission
      const response = await fetch(`http://localhost:8081/api/mission/download/${vehicleId}`);
      if (!response.ok) {
        throw new Error(`Failed to download mission from vehicle: ${response.statusText}`);
      }

      const data = await response.json();
      const missionItems = data.mission_items || [];
      
      // Store mission items
      this.missionItems.set(vehicleId, missionItems);
      this.emit('missionLoaded', { vehicleId, items: missionItems });
      
      return { success: true, items: missionItems };
    } catch (error) {
      console.error(`[MissionService] Error loading mission from ${vehicleId}:`, error);
      return { success: false, error: error.message, requiresBackend: true };
    }
  }

  /**
   * Upload mission to vehicle
   * @param {string} vehicleId - Vehicle identifier
   * @param {Array} missionItems - Array of mission items
   */
  async uploadToVehicle(vehicleId, missionItems) {
    try {
      // Validate mission items
      const validatedItems = this.validateMissionItems(missionItems);
      
      // Call C++ backend to upload mission
      const response = await fetch(`http://localhost:8081/api/mission/upload/${vehicleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mission_items: validatedItems })
      });

      if (!response.ok) {
        throw new Error('Failed to upload mission to vehicle');
      }

      // Store mission items locally
      this.missionItems.set(vehicleId, validatedItems);
      this.emit('missionUploaded', { vehicleId, items: validatedItems });
      
      return { success: true, itemCount: validatedItems.length };
    } catch (error) {
      console.error(`[MissionService] Error uploading mission to ${vehicleId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear all mission items from vehicle
   * @param {string} vehicleId - Vehicle identifier
   */
  async clearMission(vehicleId) {
    try {
      const response = await fetch(`http://localhost:8081/api/mission/clear/${vehicleId}`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to clear mission');
      }

      this.missionItems.delete(vehicleId);
      this.currentIndex.delete(vehicleId);
      this.emit('missionCleared', { vehicleId });
      
      return { success: true };
    } catch (error) {
      console.error(`[MissionService] Error clearing mission for ${vehicleId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Start mission execution
   * @param {string} vehicleId - Vehicle identifier
   */
  async startMission(vehicleId) {
    try {
      const response = await fetch(`http://localhost:8081/api/mission/start/${vehicleId}`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to start mission');
      }

      this.missionState.set(vehicleId, 'active');
      this.emit('missionStarted', { vehicleId });
      
      return { success: true };
    } catch (error) {
      console.error(`[MissionService] Error starting mission for ${vehicleId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Pause mission execution
   * @param {string} vehicleId - Vehicle identifier
   */
  async pauseMission(vehicleId) {
    try {
      const response = await fetch(`http://localhost:8081/api/mission/pause/${vehicleId}`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to pause mission');
      }

      this.missionState.set(vehicleId, 'paused');
      this.emit('missionPaused', { vehicleId });
      
      return { success: true };
    } catch (error) {
      console.error(`[MissionService] Error pausing mission for ${vehicleId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set current mission item
   * @param {string} vehicleId - Vehicle identifier
   * @param {number} index - Mission item index
   */
  async setCurrentItem(vehicleId, index) {
    try {
      const response = await fetch(`http://localhost:8081/api/mission/set_current/${vehicleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index })
      });

      if (!response.ok) {
        throw new Error('Failed to set current mission item');
      }

      this.currentIndex.set(vehicleId, index);
      this.emit('currentItemChanged', { vehicleId, index });
      
      return { success: true };
    } catch (error) {
      console.error(`[MissionService] Error setting current item for ${vehicleId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate mission items
   * @param {Array} items - Mission items to validate
   * @returns {Array} Validated mission items
   */
  validateMissionItems(items) {
    const validated = [];
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Ensure required fields
      const validatedItem = {
        seq: i,
        frame: item.frame || 3, // MAV_FRAME_GLOBAL_RELATIVE_ALT
        command: item.command || 16, // MAV_CMD_NAV_WAYPOINT
        current: i === 0 ? 1 : 0,
        autocontinue: item.autocontinue !== undefined ? item.autocontinue : 1,
        param1: item.param1 || 0,
        param2: item.param2 || 0,
        param3: item.param3 || 0,
        param4: item.param4 || 0,
        x: item.lat || item.x || 0,
        y: item.lng || item.lon || item.y || 0,
        z: item.alt || item.z || 0,
        mission_type: 0 // MAV_MISSION_TYPE_MISSION
      };
      
      // Special handling for different command types
      switch (validatedItem.command) {
        case 16: // NAV_WAYPOINT
          validatedItem.param1 = item.holdTime || 0;
          validatedItem.param2 = item.acceptRadius || 5;
          break;
        case 21: // NAV_LAND
          validatedItem.param1 = item.abortAlt || 0;
          validatedItem.param4 = item.yaw || 0;
          break;
        case 22: // NAV_TAKEOFF
          validatedItem.param1 = item.pitch || 15;
          validatedItem.param4 = item.yaw || 0;
          break;
        case 20: // NAV_RETURN_TO_LAUNCH
          // No special params needed
          break;
      }
      
      validated.push(validatedItem);
    }
    
    return validated;
  }

  /**
   * Create a simple mission (for testing)
   * @param {string} vehicleId - Vehicle identifier
   * @param {Object} home - Home position {lat, lng, alt}
   * @param {Array} waypoints - Array of waypoints [{lat, lng, alt}, ...]
   */
  createSimpleMission(vehicleId, home, waypoints) {
    const items = [];
    
    // Home position (not uploaded but used as reference)
    items.push({
      seq: 0,
      frame: 0, // MAV_FRAME_GLOBAL
      command: 16, // NAV_WAYPOINT
      current: 1,
      autocontinue: 1,
      param1: 0,
      param2: 0,
      param3: 0,
      param4: 0,
      x: home.lat,
      y: home.lng,
      z: home.alt,
      mission_type: 0
    });
    
    // Takeoff
    items.push({
      seq: 1,
      frame: 3, // MAV_FRAME_GLOBAL_RELATIVE_ALT
      command: 22, // NAV_TAKEOFF
      current: 0,
      autocontinue: 1,
      param1: 15, // pitch
      param2: 0,
      param3: 0,
      param4: 0, // yaw
      x: home.lat,
      y: home.lng,
      z: waypoints[0]?.alt || 50,
      mission_type: 0
    });
    
    // Waypoints
    waypoints.forEach((wp, index) => {
      items.push({
        seq: index + 2,
        frame: 3, // MAV_FRAME_GLOBAL_RELATIVE_ALT
        command: 16, // NAV_WAYPOINT
        current: 0,
        autocontinue: 1,
        param1: 0, // hold time
        param2: 5, // accept radius
        param3: 0, // pass radius
        param4: 0, // yaw
        x: wp.lat,
        y: wp.lng,
        z: wp.alt,
        mission_type: 0
      });
    });
    
    // Return to launch
    items.push({
      seq: items.length,
      frame: 0,
      command: 20, // NAV_RETURN_TO_LAUNCH
      current: 0,
      autocontinue: 1,
      param1: 0,
      param2: 0,
      param3: 0,
      param4: 0,
      x: 0,
      y: 0,
      z: 0,
      mission_type: 0
    });
    
    return items;
  }

  /**
   * Get mission progress
   * @param {string} vehicleId - Vehicle identifier
   */
  getMissionProgress(vehicleId) {
    const items = this.missionItems.get(vehicleId) || [];
    const currentIdx = this.currentIndex.get(vehicleId) || 0;
    const state = this.missionState.get(vehicleId) || 'idle';
    
    return {
      totalItems: items.length,
      currentIndex: currentIdx,
      progress: items.length > 0 ? (currentIdx / items.length) * 100 : 0,
      state: state,
      currentItem: items[currentIdx] || null
    };
  }
}

module.exports = MissionService; 