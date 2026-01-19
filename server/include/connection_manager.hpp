#pragma once

#include <mavsdk/mavsdk.h>
#include <mavsdk/plugins/mission_raw/mission_raw.h> // Switch to MissionRaw for full control
#include <mavsdk/plugins/telemetry/telemetry.h>
#include <mavsdk/plugins/mavlink_passthrough/mavlink_passthrough.h>
#include <mavsdk/plugins/geofence/geofence.h> // Added Geofence support
#include <nlohmann/json.hpp>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>
#include <queue>
#include <condition_variable>

using json = nlohmann::json;

class ConnectionManager {
public:
    static ConnectionManager& instance();
    
    // Helper to access system pointer for other managers
    std::shared_ptr<mavsdk::System> get_system_ptr(const std::string& vehicle_id);

    ConnectionManager(const ConnectionManager&) = delete;
    void operator=(const ConnectionManager&) = delete;

    bool add_vehicle(const std::string& vehicle_id, const std::string& connection_url);
    void remove_vehicle(const std::string& vehicle_id);
    bool is_vehicle_connected(const std::string& vehicle_id) const;
    std::vector<std::string> get_connected_vehicles() const;
    std::string get_telemetry_data_json(const std::string& vehicle_id);

    // MAVLink Message Streaming
    void start_mavlink_streaming(const std::string& vehicle_id);
    void stop_mavlink_streaming(const std::string& vehicle_id);
    std::vector<json> get_mavlink_messages(const std::string& vehicle_id);

    // Mission Management
    bool upload_mission(const std::string& vehicle_id, const json& mission_json);
    std::string download_mission(const std::string& vehicle_id);  // NEW: Download mission from vehicle
    void start_mission(const std::string& vehicle_id);
    void clear_mission(const std::string& vehicle_id);
    std::string get_vehicle_status(const std::string& vehicle_id);  // NEW: Get comprehensive vehicle status
    std::string get_all_vehicle_statuses(); // NEW: Bulk vehicle status retrieval
    
    
    // --- Jeremy: Add command methods for flight control ---
    bool send_takeoff_command(const std::string& vehicle_id);
    bool send_land_command(const std::string& vehicle_id);
    bool send_rtl_command(const std::string& vehicle_id);
    bool send_pause_command(const std::string& vehicle_id);
    bool send_set_mode_command(const std::string& vehicle_id, const std::string& mode);
    bool send_arm_command(const std::string& vehicle_id);
    bool send_disarm_command(const std::string& vehicle_id);
    // --- End Jeremy patch for command methods ---

    // --- Jeremy: Add parameter management methods ---
    std::string get_all_parameters(const std::string& vehicle_id);
    bool set_parameter(const std::string& vehicle_id, const std::string& name, double value);
    // --- End Jeremy patch for parameter methods ---

    // --- Jeremy: Add flight modes method ---
    std::string get_flight_modes(const std::string& vehicle_id);
    // --- End Jeremy patch for flight modes method ---

    // Compass Calibration
    bool start_compass_calibration(const std::string& vehicle_id);
    bool cancel_compass_calibration(const std::string& vehicle_id);
    std::string get_calibration_status(const std::string& vehicle_id);

    // Accelerometer Calibration
    bool start_accelerometer_calibration(const std::string& vehicle_id);
    bool cancel_accelerometer_calibration(const std::string& vehicle_id);
    // Note: get_calibration_status will be reused/extended
    // ---------------------------

    // Geofence Management
    // For MVP, we pass a list of points (Polygon) and type.
    bool upload_geofence(const std::string& vehicle_id, const std::vector<std::pair<double, double>>& points);
    bool clear_geofence(const std::string& vehicle_id);

    // Rally Points
    bool upload_rally_points(const std::string& vehicle_id, const std::vector<std::tuple<double, double, float>>& points);
    
    // Rally Points (Raw MAVLink)
    // Upload a single Rally Point (simplified for MVP - typically logic handles a list)
    // Actually, Rally support is minimal in MAVSDK. We'll implement a basic "Upload Rally" via Passthrough if needed, 
    // or just skip if too complex for now. 

    // --- Jeremy: Add MAVLink message sending method ---
    bool send_mavlink_message(const std::string& vehicle_id, const std::string& message_type, const json& parameters);
    // --- End Jeremy patch for MAVLink message sending method ---

    // Motor Test
    bool send_motor_test(const std::string& vehicle_id, int motor_index, int throttle_pct, int timeout_sec);

    // Manual Control (Joystick)
    bool send_manual_control(const std::string& vehicle_id, float x, float y, float z, float r, uint16_t buttons);

    // Follow Me
    bool send_follow_target(const std::string& vehicle_id, double lat, double lon, float alt, float vn, float ve, float vd);

private:

    ConnectionManager();
    ~ConnectionManager() = default;

    mavsdk::Mavsdk _mavsdk;
    mutable std::mutex _mutex;

    std::unordered_map<std::string, std::shared_ptr<mavsdk::System>> _systems;
    std::unordered_map<std::string, std::shared_ptr<mavsdk::Telemetry>> _telemetry_plugins;
    std::unordered_map<std::string, std::shared_ptr<mavsdk::MissionRaw>> _mission_raw_plugins; // NEW: Raw mission control
    std::unordered_map<std::string, std::shared_ptr<mavsdk::Geofence>> _geofence_plugins;
    std::unordered_map<std::string, std::shared_ptr<mavsdk::MavlinkPassthrough>> _mavlink_passthrough_plugins;
    
    // MAVLink message storage
    std::unordered_map<std::string, std::queue<json>> _mavlink_messages;
    std::unordered_map<std::string, bool> _streaming_active;
    
    // MAVLink message handlers
    void handle_mavlink_message(const std::string& vehicle_id, const mavlink_message_t& message);
    void setup_mavlink_subscriptions(const std::string& vehicle_id);
    std::string get_mavlink_message_name(uint16_t msgid);
    json decode_mavlink_message(const mavlink_message_t& message);

    // --- Mode/state tracking for QGC-like behavior ---
    // Stores last-known mode bits and MAV type to enable correct mode mapping and base_mode preservation
    std::unordered_map<std::string, uint8_t>  _last_base_mode;     // from HEARTBEAT.base_mode
    std::unordered_map<std::string, uint32_t> _last_custom_mode;   // from HEARTBEAT.custom_mode
    std::unordered_map<std::string, uint8_t>  _last_mav_type;      // from HEARTBEAT.type (MAV_TYPE_*)
    std::unordered_map<std::string, uint8_t>  _last_autopilot;     // from HEARTBEAT.autopilot (MAV_AUTOPILOT_*)

    struct CalibrationStatus {
        bool active = false;
        float progress = 0.0f;
        std::string status_text;
        bool success = false;
        std::vector<float> compass_progress = {0, 0, 0};
        std::vector<bool> compass_complete = {false, false, false};
    };
    std::unordered_map<std::string, CalibrationStatus> _calibration_status;


    // Radio Status Storage
    struct RadioStatus {
        int rssi = 0;
        int remrssi = 0;
        int noise = 0;
        int remnoise = 0;
        int txbuf = 0;
        int rxerrors = 0;
        int fixed = 0;
    };
    std::unordered_map<std::string, RadioStatus> _radio_status;

    // COMMAND_ACK synchronization
    std::condition_variable _ack_cv;
    // Last ack seen per vehicle
    std::unordered_map<std::string, uint16_t> _last_ack_command;   // MAV_CMD_*
    std::unordered_map<std::string, uint8_t>  _last_ack_result;    // MAV_RESULT_*

    // Simulation Parameters
    struct RadioSimulationParams {
        bool enabled = false;
        double frequency_mhz = 915.0;
        double tx_power_dbm = 30.0;
        double tx_gain_dbi = 3.0;
        double rx_gain_dbi = 3.0;
        double noise_floor_dbm = -100.0;
    };
    std::unordered_map<std::string, RadioSimulationParams> _radio_sim_params;

    // Simulation Methods
public:
    void set_radio_simulation(const std::string& vehicle_id, bool enabled, double freq, double tx_pwr, double tx_gain, double rx_gain);

private:
    // Helper to calculate synthetic RSSI
    void update_radio_simulation(const std::string& vehicle_id);
}; 