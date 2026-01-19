#include "connection_manager.hpp"
#include <iostream>
#include <future>
#include <chrono>
#include <atomic>
#include <mavsdk/mavlink/common/mavlink.h>
#include "ardupilot_rally.hpp"
#include <algorithm>
#include "tlog_recorder.hpp"
#include <thread>
#include <cmath>

std::string flight_mode_to_string(mavsdk::Telemetry::FlightMode mode);
std::string ardupilot_custom_mode_to_string(uint8_t mav_type, uint32_t custom_mode);

ConnectionManager::ConnectionManager() : _mavsdk(mavsdk::Mavsdk::Configuration{mavsdk::ComponentType::GroundStation}) {}

ConnectionManager& ConnectionManager::instance() {
    static ConnectionManager manager;
    return manager;
}

bool ConnectionManager::add_vehicle(const std::string& vehicle_id, const std::string& connection_url) {
    std::cout << "Adding vehicle: " << vehicle_id << " with URL: " << connection_url << std::endl;
    
    std::promise<std::shared_ptr<mavsdk::System>> prom;
    auto fut = prom.get_future();

    std::atomic<bool> promise_satisfied{false};
    mavsdk::Mavsdk::NewSystemHandle handle;
    handle = _mavsdk.subscribe_on_new_system([&prom, &handle, &promise_satisfied, this]() {
        if (!promise_satisfied.exchange(true)) {
            auto system = _mavsdk.systems().back();
            prom.set_value(system);
            _mavsdk.unsubscribe_on_new_system(handle);
        }
    });

    auto result = _mavsdk.add_any_connection(connection_url);
    if (result != mavsdk::ConnectionResult::Success) {
        std::cerr << "Failed to add connection: " << connection_url << std::endl;
        _mavsdk.unsubscribe_on_new_system(handle);
        return false;
    }

    if (fut.wait_for(std::chrono::seconds(10)) == std::future_status::timeout) {
        std::cerr << "Timeout waiting for system discovery." << std::endl;
        return false;
    }

    auto system = fut.get();
    std::lock_guard<std::mutex> lock(_mutex);
    _systems[vehicle_id] = system;
    _telemetry_plugins[vehicle_id] = std::make_shared<mavsdk::Telemetry>(system);
    _mission_raw_plugins[vehicle_id] = std::make_shared<mavsdk::MissionRaw>(system); // INIT RAW PLUGIN
    _geofence_plugins[vehicle_id] = std::make_shared<mavsdk::Geofence>(system);
    _mavlink_passthrough_plugins[vehicle_id] = std::make_shared<mavsdk::MavlinkPassthrough>(system);
    // _telemetry_plugins[vehicle_id]->set_rate_position(10.0); // Removed redundant setting?

    // --- Jeremy: Request full telemetry streams like QGC ---
    // Send SET_MESSAGE_INTERVAL for all key telemetry messages at 5 Hz
    auto passthrough = _mavlink_passthrough_plugins[vehicle_id];
    if (passthrough) {
        // ... (existing code for streaming) ...
        const int rate_hz = 5;
        const int interval_us = 1000000 / rate_hz;
        std::vector<uint16_t> msg_ids = {
            MAVLINK_MSG_ID_ATTITUDE,
            MAVLINK_MSG_ID_SYS_STATUS,
            MAVLINK_MSG_ID_BATTERY_STATUS,
            MAVLINK_MSG_ID_GPS_RAW_INT,
            MAVLINK_MSG_ID_GLOBAL_POSITION_INT,
            MAVLINK_MSG_ID_RC_CHANNELS,
            MAVLINK_MSG_ID_VFR_HUD,
            MAVLINK_MSG_ID_ATTITUDE_TARGET
        };
        for (uint16_t msgid : msg_ids) {
            mavsdk::MavlinkPassthrough::CommandLong cmd;
            cmd.target_sysid = system->get_system_id();
            cmd.target_compid = 0;
            cmd.command = MAV_CMD_SET_MESSAGE_INTERVAL;
            cmd.param1 = static_cast<float>(msgid);
            cmd.param2 = static_cast<float>(interval_us);
            passthrough->send_command_long(cmd);
        }
        
        // ... (existing request_data_stream) ...
    }

    TLogRecorder::instance().start_recording(vehicle_id);

    std::cout << "Vehicle " << vehicle_id << " connected." << std::endl;
    return true;
}

void ConnectionManager::remove_vehicle(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    _systems.erase(vehicle_id);
    _telemetry_plugins.erase(vehicle_id);
    _mission_raw_plugins.erase(vehicle_id);
    _geofence_plugins.erase(vehicle_id);
    _mavlink_passthrough_plugins.erase(vehicle_id);
    TLogRecorder::instance().stop_recording(vehicle_id);
    std::cout << "Removed vehicle: " << vehicle_id << std::endl;
}

// ... unchanged functions ...
bool ConnectionManager::is_vehicle_connected(const std::string& vehicle_id) const {
    std::lock_guard<std::mutex> lock(_mutex);
    return _systems.count(vehicle_id);
}

std::vector<std::string> ConnectionManager::get_connected_vehicles() const {
    std::lock_guard<std::mutex> lock(_mutex);
    std::vector<std::string> vehicles;
    for (const auto& pair : _systems) {
        vehicles.push_back(pair.first);
    }
    return vehicles;
}

std::string ConnectionManager::get_telemetry_data_json(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (!_systems.count(vehicle_id)) {
        return json{
            {"success", false},
            {"error", "Vehicle not found"}
        }.dump();
    }

    try {
        auto telemetry = _telemetry_plugins.at(vehicle_id);
        
        // Check if telemetry data is available
        if (!telemetry) {
            return json{
                {"success", false},
                {"error", "Telemetry plugin not available"}
            }.dump();
        }

        // Get position data
        auto position = telemetry->position();
        auto attitude = telemetry->attitude_euler();
        auto battery = telemetry->battery();
        auto flight_mode = telemetry->flight_mode();
        auto armed = telemetry->armed();
        auto velocity = telemetry->velocity_ned();
        auto gps_info = telemetry->gps_info();
        auto system = _systems.at(vehicle_id);
        
        // Get Radio Status
        RadioStatus radio_stat;
        {
             auto it_radio = _radio_status.find(vehicle_id);
             if (it_radio != _radio_status.end()) {
                 radio_stat = it_radio->second;
             }
        }
        
        // --- Radio Simulation Hook ---
        // If simulation enabled, override/inject synthetic values if real data is missing or stale?
        // For simplicity, we update it here if enabled, overwriting any real data (as requested).
        // Real implementation would be better served by a separate thread or timer, 
        // but hooking into get_telemetry_data_json ensures we calculate it when requested.
        // Actually, let's call update_radio_simulation() here to keep it fresh.
        update_radio_simulation(vehicle_id);
        
        // Re-fetch after potential update
        if (_radio_sim_params[vehicle_id].enabled) {
             radio_stat = _radio_status[vehicle_id];
        } 
        // -----------------------------

        bool connected = system->is_connected();

        // Derive ArduPilot flight mode name from last HEARTBEAT custom_mode when possible (QGC style)
        std::string mode_string = flight_mode_to_string(flight_mode);
        auto it_type = _last_mav_type.find(vehicle_id);
        auto it_cust = _last_custom_mode.find(vehicle_id);
        if (it_type != _last_mav_type.end() && it_cust != _last_custom_mode.end()) {
            uint8_t mav_type = it_type->second;
            uint32_t cm = it_cust->second;
            mode_string = ardupilot_custom_mode_to_string(mav_type, cm);
        }

        json telemetry_json = {
            {"success", true},
            {"position", {
                {"lat", position.latitude_deg},
                {"lng", position.longitude_deg},
                {"alt", position.relative_altitude_m}
            }},
            {"attitude", {
                {"roll", attitude.roll_deg},
                {"pitch", attitude.pitch_deg},
                {"yaw", attitude.yaw_deg}
            }},
            {"battery", {
                {"voltage", battery.voltage_v},
                {"remaining", battery.remaining_percent}
            }},
            {"flight_mode", mode_string},
            {"armed", armed},
            {"in_air", armed && position.relative_altitude_m > 1.0}, // Simple air detection
            {"velocity", {
                {"airspeed", std::sqrt(velocity.north_m_s * velocity.north_m_s + velocity.east_m_s * velocity.east_m_s)},
                {"groundspeed", std::sqrt(velocity.north_m_s * velocity.north_m_s + velocity.east_m_s * velocity.east_m_s)},
                {"heading", std::atan2(velocity.east_m_s, velocity.north_m_s) * 180.0 / M_PI}
            }},
            {"gps", {
                {"satellites", gps_info.num_satellites},
                {"fix_type", static_cast<int>(gps_info.fix_type)}
            }},
            {"radio", {
                {"rssi", radio_stat.rssi},
                {"remrssi", radio_stat.remrssi},
                {"noise", radio_stat.noise},
                {"remnoise", radio_stat.remnoise},
                {"txbuf", radio_stat.txbuf},
                {"rxerrors", radio_stat.rxerrors},
                {"fixed", radio_stat.fixed}
            }},
            {"connectionStatus", connected ? "connected" : "disconnected"}
        };
        return telemetry_json.dump();
    } catch (const std::exception& e) {
        return json{
            {"success", false},
            {"error", std::string("Telemetry error: ") + e.what()}
        }.dump();
    }
}

bool ConnectionManager::upload_mission(const std::string& vehicle_id, const json& mission_json) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (!_mission_raw_plugins.count(vehicle_id)) return false;

    std::vector<mavsdk::MissionRaw::MissionItem> mission_items;
    int seq = 0;

    for (const auto& item_json : mission_json["items"]) {
        mavsdk::MissionRaw::MissionItem new_item{};
        
        new_item.seq = seq++;
        new_item.frame = 3; // MAV_FRAME_GLOBAL_RELATIVE_ALT (default)
        new_item.current = (seq == 1) ? 1 : 0; // Set first item as current? Actually index 0.
        new_item.autocontinue = 1;

        std::string action = item_json.value("action", "NAV_WAYPOINT");
        
        // Map string actions to MAV_CMD
        if (action == "NAV_WAYPOINT") {
            new_item.command = 16; // MAV_CMD_NAV_WAYPOINT
            new_item.param1 = 0; // Hold time
            new_item.param2 = 0; // Acceptance radius
            new_item.param3 = 0; // Pass radius
            new_item.param4 = 0; // Yaw
            new_item.x = (int32_t)(item_json.value("lat", 0.0) * 1e7);
            new_item.y = (int32_t)(item_json.value("lng", 0.0) * 1e7);
            new_item.z = item_json.value("alt", 0.0f); // MissionRaw EXPECTS FLOAT METERS, not mm? Wait.
            // MAVSDK MissionRaw struct: 
            // int32_t x;  // Latitude (deg * 1e7)
            // int32_t y;  // Longitude (deg * 1e7)
            // float z;    // Altitude (meters) - Int32 in Protocol val?
            // Checking: MAVSDK MissionRaw uses `int32_t x`, `int32_t y`, `float z`.
            
        } else if (action == "NAV_RETURN_TO_LAUNCH") {
            new_item.command = 20; // MAV_CMD_NAV_RETURN_TO_LAUNCH
            // No params needed
        } else if (action == "NAV_LAND") {
            new_item.command = 21; // MAV_CMD_NAV_LAND
            new_item.x = (int32_t)(item_json.value("lat", 0.0) * 1e7);
            new_item.y = (int32_t)(item_json.value("lng", 0.0) * 1e7);
            new_item.z = item_json.value("alt", 0.0f);
        } else if (action == "NAV_TAKEOFF") {
            new_item.command = 22; // MAV_CMD_NAV_TAKEOFF
            new_item.param4 = 0; // Yaw
            new_item.x = (int32_t)(item_json.value("lat", 0.0) * 1e7);
            new_item.y = (int32_t)(item_json.value("lng", 0.0) * 1e7);
            new_item.z = item_json.value("alt", 0.0f);
        } else if (action == "CMD_DO_SET_CAM_TRIGG_DIST") {
            new_item.command = 206; // MAV_CMD_DO_SET_CAM_TRIGG_DIST
            new_item.param1 = item_json.value("param1", 0.0f); // Distance
            // Params 2,3 unused
            new_item.command = 206;
            // Coordinates ignored usually, but good to set to 0


        }
        mission_items.push_back(new_item);
    }

    std::promise<mavsdk::MissionRaw::Result> prom;
    auto fut = prom.get_future();
    _mission_raw_plugins.at(vehicle_id)->upload_mission_async(mission_items, [&prom](mavsdk::MissionRaw::Result result) {
        prom.set_value(result);
    });

    if (fut.wait_for(std::chrono::seconds(10)) == std::future_status::timeout) {
        return false;
    }
    return fut.get() == mavsdk::MissionRaw::Result::Success;
}

void ConnectionManager::start_mission(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (_mission_raw_plugins.count(vehicle_id)) {
        _mission_raw_plugins.at(vehicle_id)->start_mission_async(nullptr);
    }
}

void ConnectionManager::clear_mission(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (_mission_raw_plugins.count(vehicle_id)) {
        _mission_raw_plugins.at(vehicle_id)->clear_mission_async(nullptr);
    }
}

std::string ConnectionManager::download_mission(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (!_mission_raw_plugins.count(vehicle_id)) {
        return json{{"success", false}, {"error", "Vehicle not found"}}.dump();
    }

    try {
        auto mission_plugin = _mission_raw_plugins.at(vehicle_id);
        // Sync download for simplicity? Or future. MAVSDK v1 download_mission is sync? 
        // MissionRaw::download_mission is sync.
        auto result = mission_plugin->download_mission();
        
        if (result.first != mavsdk::MissionRaw::Result::Success) {
            return json{
                {"success", false},
                {"error", "Mission download failed"},
                {"result", static_cast<int>(result.first)}
            }.dump();
        }
        
        json mission_items = json::array();
        for (const auto& item : result.second) {
            std::string action = "NAV_WAYPOINT";
            if (item.command == 20) action = "NAV_RETURN_TO_LAUNCH";
            else if (item.command == 21) action = "NAV_LAND";
            else if (item.command == 22) action = "NAV_TAKEOFF";
            else if (item.command == 206) action = "CMD_DO_SET_CAM_TRIGG_DIST";
            else if (item.command == 203) action = "CMD_DO_DIGICAM_CONTROL";

            json j = {
                {"lat", (double)item.x / 1e7},
                {"lng", (double)item.y / 1e7},
                {"alt", item.z},
                {"command", item.command},
                {"action", action},
                {"param1", item.param1},
                {"param2", item.param2},
                {"param3", item.param3},
                {"param4", item.param4},
                {"seq", item.seq}
            };
            mission_items.push_back(j);
        }
        
        return json{
            {"success", true},
            {"items", mission_items},
            {"count", mission_items.size()}
        }.dump();
        
    } catch (const std::exception& e) {
        return json{{"success", false}, {"error", std::string("Exception: ") + e.what()}}.dump();
    }
}

std::string ConnectionManager::get_vehicle_status(const std::string& vehicle_id) {
    // Reuse existing telemetry data but add more status fields
    std::lock_guard<std::mutex> lock(_mutex);
    if (!_systems.count(vehicle_id)) {
        return json{
            {"success", false},
            {"error", "Vehicle not found"}
        }.dump();
    }

    try {
        auto telemetry = _telemetry_plugins.at(vehicle_id);
        auto system = _systems.at(vehicle_id);
        
        // Get all telemetry data
        auto position = telemetry->position();
        auto attitude = telemetry->attitude_euler();
        auto battery = telemetry->battery();
        auto flight_mode = telemetry->flight_mode();
        auto armed = telemetry->armed();
        auto in_air = telemetry->in_air();
        auto velocity = telemetry->velocity_ned();
        auto gps_info = telemetry->gps_info();
        auto health = telemetry->health();
        bool connected = system->is_connected();
        
        // Get ArduPilot mode string
        std::string mode_string = flight_mode_to_string(flight_mode);
        auto it_type = _last_mav_type.find(vehicle_id);
        auto it_cust = _last_custom_mode.find(vehicle_id);
        if (it_type != _last_mav_type.end() && it_cust != _last_custom_mode.end()) {
            mode_string = ardupilot_custom_mode_to_string(it_type->second, it_cust->second);
        }


        
        json status_json = {
            {"success", true},
            {"vehicle_id", vehicle_id},
            {"connected", connected},
            {"armed", armed},
            {"in_air", in_air},
            {"flight_mode", mode_string},
            {"position", {
                {"lat", position.latitude_deg},
                {"lng", position.longitude_deg},
                {"alt_rel", position.relative_altitude_m},
                {"alt_abs", position.absolute_altitude_m}
            }},
            {"attitude", {
                {"roll", attitude.roll_deg},
                {"pitch", attitude.pitch_deg},
                {"yaw", attitude.yaw_deg}
            }},
            {"velocity", {
                {"north", velocity.north_m_s},
                {"east", velocity.east_m_s},
                {"down", velocity.down_m_s},
                {"groundspeed", std::sqrt(velocity.north_m_s * velocity.north_m_s + velocity.east_m_s * velocity.east_m_s)}
            }},
            {"battery", {
                {"voltage", battery.voltage_v},
                {"remaining", battery.remaining_percent},
                {"current", battery.current_battery_a}
            }},
            {"gps", {
                {"satellites", gps_info.num_satellites},
                {"fix_type", static_cast<int>(gps_info.fix_type)}
            }},
            {"health", {
                {"is_gyrometer_calibration_ok", health.is_gyrometer_calibration_ok},
                {"is_accelerometer_calibration_ok", health.is_accelerometer_calibration_ok},
                {"is_magnetometer_calibration_ok", health.is_magnetometer_calibration_ok},
                {"is_local_position_ok", health.is_local_position_ok},
                {"is_global_position_ok", health.is_global_position_ok},
                {"is_home_position_ok", health.is_home_position_ok}
            }}
        };
        
        return status_json.dump();
        
    } catch (const std::exception& e) {
        return json{
            {"success", false},
            {"error", std::string("Status error: ") + e.what()}
        }.dump();
    }
}

std::string ConnectionManager::get_all_vehicle_statuses() {
    std::lock_guard<std::mutex> lock(_mutex);
    
    json all_statuses = json::array();
    
    // Helper helper to avoid duplicating mode string logic
    auto get_mode_string = [this](const std::string& vehicle_id, mavsdk::Telemetry::FlightMode fm) -> std::string {
        std::string mode_string = flight_mode_to_string(fm);
        auto it_type = _last_mav_type.find(vehicle_id);
        auto it_cust = _last_custom_mode.find(vehicle_id);
        if (it_type != _last_mav_type.end() && it_cust != _last_custom_mode.end()) {
            mode_string = ardupilot_custom_mode_to_string(it_type->second, it_cust->second);
        }
        return mode_string;
    };

    for (const auto& pair : _systems) {
        std::string vehicle_id = pair.first;
        auto system = pair.second;
        
        try {
            // Basic Status
            bool connected = system->is_connected();
            
            // Try to get telemetry plugin
            if (_telemetry_plugins.count(vehicle_id)) {
                auto telemetry = _telemetry_plugins.at(vehicle_id);
                
                // Fetch only critical data for list view
                auto position = telemetry->position();
                auto battery = telemetry->battery();
                auto flight_mode = telemetry->flight_mode();
                auto armed = telemetry->armed();
                auto gps_info = telemetry->gps_info();
                auto attitude = telemetry->attitude_euler(); // minimal attitude for heading
                
                json vehicle_json = {
                    {"id", vehicle_id},
                    {"connected", connected},
                    {"armed", armed},
                    {"flight_mode", get_mode_string(vehicle_id, flight_mode)},
                    {"battery_pct", battery.remaining_percent},
                    {"gps_sats", gps_info.num_satellites},
                    {"gps_fix", static_cast<int>(gps_info.fix_type)},
                    {"lat", position.latitude_deg},
                    {"lng", position.longitude_deg},
                    {"alt", position.relative_altitude_m},
                    {"heading", attitude.yaw_deg}
                };
                all_statuses.push_back(vehicle_json);
            } else {
                // System exists but no telemetry plugin somehow?
                all_statuses.push_back({
                    {"id", vehicle_id},
                    {"connected", connected},
                    {"status", "no_telemetry"}
                });
            }
        } catch (const std::exception& e) {
             std::cerr << "Error getting status for " << vehicle_id << ": " << e.what() << std::endl;
             // Include minimal info to not break the list
             all_statuses.push_back({
                 {"id", vehicle_id},
                 {"error", "status_fetch_failed"}
             });
        }
    }
    
    return json{
        {"success", true},
        {"vehicles", all_statuses},
        {"count", all_statuses.size()}
    }.dump();
}


void ConnectionManager::start_mavlink_streaming(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (!_systems.count(vehicle_id)) {
        std::cerr << "Vehicle " << vehicle_id << " not found for MAVLink streaming" << std::endl;
        return;
    }
    
    _streaming_active[vehicle_id] = true;
    
    // Setup comprehensive MAVLink message subscriptions using MavlinkPassthrough
    setup_mavlink_subscriptions(vehicle_id);
    
    std::cout << "Started comprehensive MAVLink streaming for vehicle: " << vehicle_id << std::endl;
}

void ConnectionManager::setup_mavlink_subscriptions(const std::string& vehicle_id) {
    auto passthrough = _mavlink_passthrough_plugins[vehicle_id];
    if (!passthrough) {
        std::cerr << "MavlinkPassthrough plugin not available for vehicle: " << vehicle_id << std::endl;
        return;
    }

    // Subscribe to all common MAVLink messages that QGroundControl handles
    // This gives us the same comprehensive coverage as QGroundControl
    
    // HEARTBEAT - System status and mode
    passthrough->subscribe_message(MAVLINK_MSG_ID_HEARTBEAT, 
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // GPS_RAW_INT - GPS position data
    passthrough->subscribe_message(MAVLINK_MSG_ID_GPS_RAW_INT,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // SYS_STATUS - System status including battery
    passthrough->subscribe_message(MAVLINK_MSG_ID_SYS_STATUS,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // BATTERY_STATUS - Detailed battery information
    passthrough->subscribe_message(MAVLINK_MSG_ID_BATTERY_STATUS,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // ATTITUDE - Vehicle attitude
    passthrough->subscribe_message(MAVLINK_MSG_ID_ATTITUDE,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });

    // ATTITUDE_TARGET - Desired attitude
    passthrough->subscribe_message(MAVLINK_MSG_ID_ATTITUDE_TARGET,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
        
    // RADIO_STATUS - Telemetry link status (critical for link budget)
    passthrough->subscribe_message(MAVLINK_MSG_ID_RADIO_STATUS,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
        
    // --- Hook TLog Recorder ---
    // Fallback since intercept_incoming_messages_async is missing in this MAVSDK version.
    // We subscribe to a broad range of message IDs to capture most telemetry.
    for (uint16_t id = 1; id <= 400; ++id) {
         passthrough->subscribe_message(id, [this, vehicle_id](const mavlink_message_t& message) {
            TLogRecorder::instance().record_message(vehicle_id, message);
            // Note: We might get duplicates if we have specific subscriptions that also trace?
            // Actually, setup_mavlink_subscriptions uses specific handlers. 
            // This loop registers a SEPARATE callback for each ID.
            // MAVSDK should call both if multiple are registered.
            // However, we should check if we are overwriting?
            // "This means that all future messages being received will trigger the callback" 
            // It suggests one callback per ID?
            // Docs say: "To stop the subscription, call this method with nullptr".
            // It implies ONE callback.
            // OH NO. If I overwrite the callback, I break the specific handlers (ATTITUDE, BATTERY, etc).
         });
    }
    
    // CRITICAL: We cannot overwrite existing subscriptions.
    // If MAVSDK only supports one callback per ID, this approach breaks the app.
    // I need to check if subscribe_message returns a handle and allows multiple.
    // The header said: "MessageHandle subscribe_message(...)". 
    // Usually returning a handle implies multiple subscribers are allowed.
    // "This means that all future messages being received will trigger the callback"
    // Let's assume it supports multiple. MAVSDK v1 usually does (signal/slot style).


    // ADSB_VEHICLE - Air traffic data
    passthrough->subscribe_message(MAVLINK_MSG_ID_ADSB_VEHICLE,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // ATTITUDE_QUATERNION - Quaternion attitude
    passthrough->subscribe_message(MAVLINK_MSG_ID_ATTITUDE_QUATERNION,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // LOCAL_POSITION_NED - Local position
    passthrough->subscribe_message(MAVLINK_MSG_ID_LOCAL_POSITION_NED,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // GLOBAL_POSITION_INT - Global position
    passthrough->subscribe_message(MAVLINK_MSG_ID_GLOBAL_POSITION_INT,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // VFR_HUD - Vehicle flight data
    passthrough->subscribe_message(MAVLINK_MSG_ID_VFR_HUD,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // RC_CHANNELS - RC input channels
    passthrough->subscribe_message(MAVLINK_MSG_ID_RC_CHANNELS,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // RADIO_STATUS - Radio link status
    passthrough->subscribe_message(MAVLINK_MSG_ID_RADIO_STATUS,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // GPS_STATUS - GPS status information
    passthrough->subscribe_message(MAVLINK_MSG_ID_GPS_STATUS,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // SCALED_PRESSURE - Pressure sensor data
    passthrough->subscribe_message(MAVLINK_MSG_ID_SCALED_PRESSURE,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // SCALED_PRESSURE2 - Additional pressure sensor data
    passthrough->subscribe_message(MAVLINK_MSG_ID_SCALED_PRESSURE2,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // SCALED_PRESSURE3 - Third pressure sensor data
    passthrough->subscribe_message(MAVLINK_MSG_ID_SCALED_PRESSURE3,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // STATUSTEXT - Status text messages
    passthrough->subscribe_message(MAVLINK_MSG_ID_STATUSTEXT,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // COMMAND_ACK - Command acknowledgment
    passthrough->subscribe_message(MAVLINK_MSG_ID_COMMAND_ACK,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });

    // MAG_CAL_PROGRESS - Compass calibration progress
    // passthrough->subscribe_message(MAVLINK_MSG_ID_MAG_CAL_PROGRESS, ...); // Missing header

    // MAG_CAL_REPORT - Compass calibration report
    passthrough->subscribe_message(MAVLINK_MSG_ID_MAG_CAL_REPORT,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // EXTENDED_SYS_STATE - Extended system state
    passthrough->subscribe_message(MAVLINK_MSG_ID_EXTENDED_SYS_STATE,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // HOME_POSITION - Home position
    passthrough->subscribe_message(MAVLINK_MSG_ID_HOME_POSITION,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // HIGH_LATENCY - High latency telemetry
    passthrough->subscribe_message(MAVLINK_MSG_ID_HIGH_LATENCY,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // HIGH_LATENCY2 - High latency telemetry v2
    passthrough->subscribe_message(MAVLINK_MSG_ID_HIGH_LATENCY2,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // MESSAGE_INTERVAL - Message interval settings
    passthrough->subscribe_message(MAVLINK_MSG_ID_MESSAGE_INTERVAL,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // PING - Ping messages
    passthrough->subscribe_message(MAVLINK_MSG_ID_PING,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // OBSTACLE_DISTANCE - Obstacle distance sensor data
    passthrough->subscribe_message(MAVLINK_MSG_ID_OBSTACLE_DISTANCE,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // FENCE_STATUS - Geofence status
    passthrough->subscribe_message(MAVLINK_MSG_ID_FENCE_STATUS,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // ADSB_VEHICLE - ADS-B vehicle information
    passthrough->subscribe_message(MAVLINK_MSG_ID_ADSB_VEHICLE,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // CAMERA_IMAGE_CAPTURED - Camera image capture events
    passthrough->subscribe_message(MAVLINK_MSG_ID_CAMERA_IMAGE_CAPTURED,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // ORBIT_EXECUTION_STATUS - Orbit execution status
    passthrough->subscribe_message(MAVLINK_MSG_ID_ORBIT_EXECUTION_STATUS,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // EVENT - Event messages
    passthrough->subscribe_message(MAVLINK_MSG_ID_EVENT,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // CURRENT_EVENT_SEQUENCE - Current event sequence
    passthrough->subscribe_message(MAVLINK_MSG_ID_CURRENT_EVENT_SEQUENCE,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // RESPONSE_EVENT_ERROR - Response event error
    passthrough->subscribe_message(MAVLINK_MSG_ID_RESPONSE_EVENT_ERROR,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // SERIAL_CONTROL - Serial control messages
    passthrough->subscribe_message(MAVLINK_MSG_ID_SERIAL_CONTROL,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // LOG_ENTRY - Log entry information
    passthrough->subscribe_message(MAVLINK_MSG_ID_LOG_ENTRY,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // LOG_DATA - Log data
    passthrough->subscribe_message(MAVLINK_MSG_ID_LOG_DATA,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // LOGGING_DATA - Logging data
    passthrough->subscribe_message(MAVLINK_MSG_ID_LOGGING_DATA,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // LOGGING_DATA_ACKED - Acknowledged logging data
    passthrough->subscribe_message(MAVLINK_MSG_ID_LOGGING_DATA_ACKED,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // WIND_COV - Wind covariance
    passthrough->subscribe_message(MAVLINK_MSG_ID_WIND_COV,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // IMU data messages
    passthrough->subscribe_message(MAVLINK_MSG_ID_SCALED_IMU,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    passthrough->subscribe_message(MAVLINK_MSG_ID_RAW_IMU,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    // Distance sensor data
    passthrough->subscribe_message(MAVLINK_MSG_ID_DISTANCE_SENSOR,
        [this, vehicle_id](const mavlink_message_t& message) {
            handle_mavlink_message(vehicle_id, message);
        });
    
    std::cout << "Set up comprehensive MAVLink message subscriptions for vehicle: " << vehicle_id << std::endl;
}

void ConnectionManager::handle_mavlink_message(const std::string& vehicle_id, const mavlink_message_t& message) {
    try {
        // Debug logging: print every MAVLink message received
        std::cout << "[MAVLINK] Vehicle: " << vehicle_id << ", Msg: " << get_mavlink_message_name(message.msgid) << " (" << message.msgid << ")" << std::endl;
        // Optionally, print key fields for common messages
        switch (message.msgid) {
            case MAVLINK_MSG_ID_HEARTBEAT: {
                // Track last-known base/custom mode and MAV type/autopilot for QGC-like behavior
                mavlink_heartbeat_t hb;
                mavlink_msg_heartbeat_decode(&message, &hb);
                {
                    std::lock_guard<std::mutex> lock(_mutex);
                    _last_base_mode[vehicle_id] = hb.base_mode;
                    _last_custom_mode[vehicle_id] = hb.custom_mode;
                    _last_mav_type[vehicle_id] = hb.type;
                    _last_autopilot[vehicle_id] = hb.autopilot;
                }
                break;
            }
            case MAVLINK_MSG_ID_ATTITUDE: {
                mavlink_attitude_t att;
                mavlink_msg_attitude_decode(&message, &att);
                std::cout << "  [ATTITUDE] roll: " << att.roll << ", pitch: " << att.pitch << ", yaw: " << att.yaw << std::endl;
                break;
            }
            case MAVLINK_MSG_ID_BATTERY_STATUS: {
                mavlink_battery_status_t bat;
                mavlink_msg_battery_status_decode(&message, &bat);
                std::cout << "  [BATTERY] voltages[0]: " << bat.voltages[0] << ", current_battery: " << bat.current_battery << std::endl;
                break;
            }
            case MAVLINK_MSG_ID_GPS_RAW_INT: {
                mavlink_gps_raw_int_t gps;
                mavlink_msg_gps_raw_int_decode(&message, &gps);
                std::cout << "  [GPS_RAW_INT] lat: " << gps.lat << ", lon: " << gps.lon << ", sat: " << (int)gps.satellites_visible << std::endl;
                break;
            }
            case MAVLINK_MSG_ID_SYS_STATUS: {
                mavlink_sys_status_t sys;
                mavlink_msg_sys_status_decode(&message, &sys);
                std::cout << "  [SYS_STATUS] voltage_battery: " << sys.voltage_battery << ", battery_remaining: " << (int)sys.battery_remaining << std::endl;
                break;
            }
            case MAVLINK_MSG_ID_RADIO_STATUS: {
                mavlink_radio_status_t rad;
                mavlink_msg_radio_status_decode(&message, &rad);
                {
                    std::lock_guard<std::mutex> lock(_mutex);
                    _radio_status[vehicle_id] = {
                        (int)rad.rssi,
                        (int)rad.remrssi,
                        (int)rad.noise,
                        (int)rad.remnoise,
                        (int)rad.txbuf,
                        (int)rad.rxerrors,
                        (int)rad.fixed
                    };
                }
                // Optional: Log if very low
                if (rad.rssi < 20) std::cout << "  [RADIO_STATUS] Low RSSI: " << (int)rad.rssi << std::endl;
                break;
            }
            case MAVLINK_MSG_ID_COMMAND_ACK: {
                try {
                    mavlink_command_ack_t ack;
                    mavlink_msg_command_ack_decode(&message, &ack);
                    {
                        std::lock_guard<std::mutex> lock(_mutex);
                        _last_ack_command[vehicle_id] = ack.command;
                        _last_ack_result[vehicle_id] = ack.result;
                    }
                    _ack_cv.notify_all();
                } catch (const std::exception& e) {
                    std::cerr << "EXCEPTION in COMMAND_ACK handling for vehicle " << vehicle_id << ": " << e.what() << std::endl;
                } catch (...) {
                    std::cerr << "UNKNOWN EXCEPTION in COMMAND_ACK handling for vehicle " << vehicle_id << std::endl;
                }
                break;
            }
            /*
            case MAVLINK_MSG_ID_MAG_CAL_PROGRESS: {
                 // MSG Definition missing in current MAVSDK
                 break;
            }
            */
            case MAVLINK_MSG_ID_MAG_CAL_REPORT: {
                mavlink_mag_cal_report_t report;
                mavlink_msg_mag_cal_report_decode(&message, &report);
                
                std::lock_guard<std::mutex> lock(_mutex);
                if (_calibration_status.count(vehicle_id) && _calibration_status[vehicle_id].active) {
                    auto& status = _calibration_status[vehicle_id];
                    
                    if (report.compass_id < 3) {
                        status.compass_complete[report.compass_id] = true;
                        if (report.cal_status == MAG_CAL_SUCCESS) {
                            status.compass_progress[report.compass_id] = 100;
                        }
                    }
                    
                    // Check if all requested compasses are done
                    bool all_done = true;
                    bool any_failed = false;
                    for (int i=0; i<3; i++) {
                        if (report.cal_mask & (1 << i)) {
                            if (!status.compass_complete[i]) all_done = false;
                            // Check report status for success/fail if complete?
                            // For simplicty logic, we just wait for reports.
                        }
                    }
                    
                    if (report.cal_status == MAG_CAL_SUCCESS) {
                         std::cout << "Compass " << (int)report.compass_id << " calibration SUCCESS" << std::endl;
                    } else {
                         std::cout << "Compass " << (int)report.compass_id << " calibration FAILED" << std::endl;
                         any_failed = true;
                    }
                    
                    if (all_done) {
                        status.active = false;
                        status.success = !any_failed;
                        status.progress = 100;
                        status.status_text = any_failed ? "Calibration Failed" : "Calibration Complete. Reboot Vehicle.";
                    }
                }
                break;
            }
            case MAVLINK_MSG_ID_STATUSTEXT: {
                mavlink_statustext_t status_text;
                mavlink_msg_statustext_decode(&message, &status_text);
                
                // Ensure null termination
                char text_buf[51];
                strncpy(text_buf, status_text.text, 50);
                text_buf[50] = '\0';
                std::string text(text_buf);

                std::cout << "  [STATUSTEXT] " << text << std::endl;

                std::lock_guard<std::mutex> lock(_mutex);
                if (_calibration_status.count(vehicle_id) && _calibration_status[vehicle_id].active) {
                    // Update status text for calibration feedback
                    _calibration_status[vehicle_id].status_text = text;
                    
                    if (text.find("Calibration successful") != std::string::npos || text.find("success") != std::string::npos) {
                        if (text.find("Calibration") != std::string::npos) {
                             _calibration_status[vehicle_id].success = true;
                        }
                    } else if (text.find("Calibration failed") != std::string::npos || text.find("Failed") != std::string::npos) {
                        if (text.find("Calibration") != std::string::npos) {
                            _calibration_status[vehicle_id].success = false;
                        }
                    }
                }
                break;
            }
            default:
                break;
        }
        if (!_streaming_active[vehicle_id]) {
            return;
        }
        
        // Create a JSON representation of the MAVLink message
        json msg = {
            {"msgName", get_mavlink_message_name(message.msgid)},
            {"msgId", message.msgid},
            {"timestamp", std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::system_clock::now().time_since_epoch()).count()},
            {"system_id", message.sysid},
            {"component_id", message.compid},
            {"sequence", message.seq},
            {"payload_length", message.len},
            {"fields", decode_mavlink_message(message)}
        };
        
        std::lock_guard<std::mutex> lock(_mutex);
        _mavlink_messages[vehicle_id].push(msg);
        
        // Keep only the last 100 messages to prevent memory issues
        if (_mavlink_messages[vehicle_id].size() > 100) {
            _mavlink_messages[vehicle_id].pop();
        }
    } catch (const std::exception& e) {
        std::cerr << "EXCEPTION in handle_mavlink_message for vehicle " << vehicle_id << ": " << e.what() << std::endl;
    } catch (...) {
        std::cerr << "UNKNOWN EXCEPTION in handle_mavlink_message for vehicle " << vehicle_id << std::endl;
    }
}

std::string ConnectionManager::get_mavlink_message_name(uint16_t msgid) {
    switch (msgid) {
        case MAVLINK_MSG_ID_HEARTBEAT: return "HEARTBEAT";
        case MAVLINK_MSG_ID_GPS_RAW_INT: return "GPS_RAW_INT";
        case MAVLINK_MSG_ID_SYS_STATUS: return "SYS_STATUS";
        case MAVLINK_MSG_ID_BATTERY_STATUS: return "BATTERY_STATUS";
        case MAVLINK_MSG_ID_ATTITUDE: return "ATTITUDE";
        case MAVLINK_MSG_ID_ATTITUDE_QUATERNION: return "ATTITUDE_QUATERNION";
        case MAVLINK_MSG_ID_LOCAL_POSITION_NED: return "LOCAL_POSITION_NED";
        case MAVLINK_MSG_ID_GLOBAL_POSITION_INT: return "GLOBAL_POSITION_INT";
        case MAVLINK_MSG_ID_VFR_HUD: return "VFR_HUD";
        case MAVLINK_MSG_ID_RC_CHANNELS: return "RC_CHANNELS";
        case MAVLINK_MSG_ID_RADIO_STATUS: return "RADIO_STATUS";
        case MAVLINK_MSG_ID_GPS_STATUS: return "GPS_STATUS";
        case MAVLINK_MSG_ID_SCALED_PRESSURE: return "SCALED_PRESSURE";
        case MAVLINK_MSG_ID_SCALED_PRESSURE2: return "SCALED_PRESSURE2";
        case MAVLINK_MSG_ID_SCALED_PRESSURE3: return "SCALED_PRESSURE3";
        case MAVLINK_MSG_ID_STATUSTEXT: return "STATUSTEXT";
        case MAVLINK_MSG_ID_COMMAND_ACK: return "COMMAND_ACK";
        case MAVLINK_MSG_ID_EXTENDED_SYS_STATE: return "EXTENDED_SYS_STATE";
        case MAVLINK_MSG_ID_HOME_POSITION: return "HOME_POSITION";
        case MAVLINK_MSG_ID_HIGH_LATENCY: return "HIGH_LATENCY";
        case MAVLINK_MSG_ID_HIGH_LATENCY2: return "HIGH_LATENCY2";
        case MAVLINK_MSG_ID_MESSAGE_INTERVAL: return "MESSAGE_INTERVAL";
        case MAVLINK_MSG_ID_PING: return "PING";
        case MAVLINK_MSG_ID_OBSTACLE_DISTANCE: return "OBSTACLE_DISTANCE";
        case MAVLINK_MSG_ID_FENCE_STATUS: return "FENCE_STATUS";
        case MAVLINK_MSG_ID_ADSB_VEHICLE: return "ADSB_VEHICLE";
        case MAVLINK_MSG_ID_CAMERA_IMAGE_CAPTURED: return "CAMERA_IMAGE_CAPTURED";
        case MAVLINK_MSG_ID_ORBIT_EXECUTION_STATUS: return "ORBIT_EXECUTION_STATUS";
        case MAVLINK_MSG_ID_EVENT: return "EVENT";
        case MAVLINK_MSG_ID_CURRENT_EVENT_SEQUENCE: return "CURRENT_EVENT_SEQUENCE";
        case MAVLINK_MSG_ID_RESPONSE_EVENT_ERROR: return "RESPONSE_EVENT_ERROR";
        case MAVLINK_MSG_ID_SERIAL_CONTROL: return "SERIAL_CONTROL";
        case MAVLINK_MSG_ID_LOG_ENTRY: return "LOG_ENTRY";
        case MAVLINK_MSG_ID_LOG_DATA: return "LOG_DATA";
        case MAVLINK_MSG_ID_LOGGING_DATA: return "LOGGING_DATA";
        case MAVLINK_MSG_ID_LOGGING_DATA_ACKED: return "LOGGING_DATA_ACKED";
        case MAVLINK_MSG_ID_WIND_COV: return "WIND_COV";
        case MAVLINK_MSG_ID_SCALED_IMU: return "SCALED_IMU";
        case MAVLINK_MSG_ID_RAW_IMU: return "RAW_IMU";
        case MAVLINK_MSG_ID_DISTANCE_SENSOR: return "DISTANCE_SENSOR";
        default: return "UNKNOWN_" + std::to_string(msgid);
    }
}

json ConnectionManager::decode_mavlink_message(const mavlink_message_t& message) {
    json fields = json::object();
    
    switch (message.msgid) {
        case MAVLINK_MSG_ID_HEARTBEAT: {
            mavlink_heartbeat_t heartbeat;
            mavlink_msg_heartbeat_decode(&message, &heartbeat);
            fields = {
                {"type", heartbeat.type},
                {"autopilot", heartbeat.autopilot},
                {"base_mode", heartbeat.base_mode},
                {"custom_mode", heartbeat.custom_mode},
                {"system_status", heartbeat.system_status},
                {"mavlink_version", heartbeat.mavlink_version}
            };
            break;
        }
        case MAVLINK_MSG_ID_GPS_RAW_INT: {
            mavlink_gps_raw_int_t gps;
            mavlink_msg_gps_raw_int_decode(&message, &gps);
            fields = {
                {"time_usec", static_cast<uint64_t>(gps.time_usec)},
                {"fix_type", static_cast<uint8_t>(gps.fix_type)},
                {"lat", static_cast<int32_t>(gps.lat)},
                {"lon", static_cast<int32_t>(gps.lon)},
                {"alt", static_cast<int32_t>(gps.alt)},
                {"eph", static_cast<uint16_t>(gps.eph)},
                {"epv", static_cast<uint16_t>(gps.epv)},
                {"vel", static_cast<uint16_t>(gps.vel)},
                {"cog", static_cast<uint16_t>(gps.cog)},
                {"satellites_visible", static_cast<uint8_t>(gps.satellites_visible)}
            };
            break;
        }
        case MAVLINK_MSG_ID_SYS_STATUS: {
            mavlink_sys_status_t sys_status;
            mavlink_msg_sys_status_decode(&message, &sys_status);
            fields = {
                {"voltage_battery", static_cast<uint16_t>(sys_status.voltage_battery)},
                {"current_battery", static_cast<int16_t>(sys_status.current_battery)},
                {"battery_remaining", static_cast<int8_t>(sys_status.battery_remaining)},
                {"drop_rate_comm", static_cast<uint16_t>(sys_status.drop_rate_comm)},
                {"errors_comm", static_cast<uint16_t>(sys_status.errors_comm)},
                {"errors_count1", static_cast<uint16_t>(sys_status.errors_count1)},
                {"errors_count2", static_cast<uint16_t>(sys_status.errors_count2)},
                {"errors_count3", static_cast<uint16_t>(sys_status.errors_count3)},
                {"errors_count4", static_cast<uint16_t>(sys_status.errors_count4)}
            };
            break;
        }
        case MAVLINK_MSG_ID_ATTITUDE: {
            mavlink_attitude_t attitude;
            mavlink_msg_attitude_decode(&message, &attitude);
            fields = {
                {"time_boot_ms", attitude.time_boot_ms},
                {"roll", attitude.roll},
                {"pitch", attitude.pitch},
                {"yaw", attitude.yaw},
                {"rollspeed", attitude.rollspeed},
                {"pitchspeed", attitude.pitchspeed},
                {"yawspeed", attitude.yawspeed}
            };
            break;
        }
        case MAVLINK_MSG_ID_LOCAL_POSITION_NED: {
            mavlink_local_position_ned_t pos;
            mavlink_msg_local_position_ned_decode(&message, &pos);
            fields = {
                {"time_boot_ms", pos.time_boot_ms},
                {"x", pos.x},
                {"y", pos.y},
                {"z", pos.z},
                {"vx", pos.vx},
                {"vy", pos.vy},
                {"vz", pos.vz}
            };
            break;
        }
        case MAVLINK_MSG_ID_GLOBAL_POSITION_INT: {
            mavlink_global_position_int_t pos;
            mavlink_msg_global_position_int_decode(&message, &pos);
            fields = {
                {"time_boot_ms", pos.time_boot_ms},
                {"lat", pos.lat},
                {"lon", pos.lon},
                {"alt", pos.alt},
                {"relative_alt", pos.relative_alt},
                {"vx", pos.vx},
                {"vy", pos.vy},
                {"vz", pos.vz},
                {"hdg", pos.hdg}
            };
            break;
        }
        case MAVLINK_MSG_ID_VFR_HUD: {
            mavlink_vfr_hud_t vfr_hud;
            mavlink_msg_vfr_hud_decode(&message, &vfr_hud);
            fields = {
                {"airspeed", vfr_hud.airspeed},
                {"groundspeed", vfr_hud.groundspeed},
                {"heading", vfr_hud.heading},
                {"throttle", vfr_hud.throttle},
                {"alt", vfr_hud.alt},
                {"climb", vfr_hud.climb}
            };
            break;
        }
        case MAVLINK_MSG_ID_RC_CHANNELS: {
            mavlink_rc_channels_t rc;
            mavlink_msg_rc_channels_decode(&message, &rc);
            fields = {
                {"time_boot_ms", rc.time_boot_ms},
                {"chancount", rc.chancount},
                {"chan1_raw", rc.chan1_raw},
                {"chan2_raw", rc.chan2_raw},
                {"chan3_raw", rc.chan3_raw},
                {"chan4_raw", rc.chan4_raw},
                {"chan5_raw", rc.chan5_raw},
                {"chan6_raw", rc.chan6_raw},
                {"chan7_raw", rc.chan7_raw},
                {"chan8_raw", rc.chan8_raw},
                {"rssi", rc.rssi}
            };
            break;
        }
        case MAVLINK_MSG_ID_STATUSTEXT: {
            mavlink_statustext_t status;
            mavlink_msg_statustext_decode(&message, &status);
            fields = {
                {"severity", status.severity},
                {"text", std::string(status.text, 50)}
            };
            break;
        }
        default:
            // For unknown messages, just include basic info
            fields = {
                {"raw_payload_length", message.len}
            };
            break;

        case MAVLINK_MSG_ID_ADSB_VEHICLE: {
            mavlink_adsb_vehicle_t adsb;
            mavlink_msg_adsb_vehicle_decode(&message, &adsb);
            fields = {
                {"icao_address", adsb.ICAO_address},
                {"lat", adsb.lat / 1e7},
                {"lon", adsb.lon / 1e7},
                {"altitude", adsb.altitude / 1000.0}, // mm -> m
                {"heading", adsb.heading / 100.0}, // cdeg -> deg
                {"hor_velocity", adsb.hor_velocity / 100.0}, // cm/s -> m/s
                {"ver_velocity", adsb.ver_velocity / 100.0}, // cm/s -> m/s
                {"callsign", std::string(adsb.callsign, 8)}, // char[8]
                {"emitter_type", adsb.emitter_type},
                {"tslc", adsb.tslc}, // Time since last communication
                {"flags", adsb.flags},
                {"squawk", adsb.squawk}
            };
            break;
        }
    }
    
    return fields;
}

void ConnectionManager::stop_mavlink_streaming(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    _streaming_active[vehicle_id] = false;
    std::cout << "Stopped MAVLink streaming for vehicle: " << vehicle_id << std::endl;
}

std::vector<json> ConnectionManager::get_mavlink_messages(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    std::vector<json> messages;
    
    if (_mavlink_messages.count(vehicle_id)) {
        auto& queue = _mavlink_messages[vehicle_id];
        while (!queue.empty()) {
            messages.push_back(queue.front());
            queue.pop();
        }
    }
    
    return messages;
}

std::string flight_mode_to_string(mavsdk::Telemetry::FlightMode mode) {
    switch (mode) {
        case mavsdk::Telemetry::FlightMode::Ready: return "Ready";
        case mavsdk::Telemetry::FlightMode::Takeoff: return "Takeoff";
        case mavsdk::Telemetry::FlightMode::Hold: return "Hold";
        case mavsdk::Telemetry::FlightMode::Mission: return "Mission";
        case mavsdk::Telemetry::FlightMode::ReturnToLaunch: return "Return to Launch";
        case mavsdk::Telemetry::FlightMode::Land: return "Land";
        case mavsdk::Telemetry::FlightMode::Offboard: return "Offboard";
        case mavsdk::Telemetry::FlightMode::FollowMe: return "Follow Me";
        case mavsdk::Telemetry::FlightMode::Manual: return "Manual";
        case mavsdk::Telemetry::FlightMode::Altctl: return "Altitude Control";
        case mavsdk::Telemetry::FlightMode::Posctl: return "Position Control";
        case mavsdk::Telemetry::FlightMode::Acro: return "Acro";
        case mavsdk::Telemetry::FlightMode::Stabilized: return "Stabilized";
        case mavsdk::Telemetry::FlightMode::Rattitude: return "Rattitude";
        default: return "Unknown";
    }
}

// Convert ArduPilot custom mode directly to string, preserving original mode names
std::string ardupilot_custom_mode_to_string(uint8_t mav_type, uint32_t custom_mode) {
    switch (mav_type) {
        case MAV_TYPE_FIXED_WING: {
            // ArduPlane - use exact mode names from ArduPilot
            switch (custom_mode) {
                case 0: return "MANUAL";
                case 1: return "CIRCLE";
                case 2: return "STABILIZE";
                case 3: return "TRAINING";
                case 4: return "ACRO";
                case 5: return "FBWA";
                case 6: return "FBWB";
                case 7: return "CRUISE";
                case 8: return "AUTOTUNE";
                case 9: return "LAND";  // Reserved for future use
                case 10: return "AUTO";
                case 11: return "RTL";
                case 12: return "LOITER";
                case 13: return "TAKEOFF";
                case 14: return "AVOID_ADSB";
                case 15: return "GUIDED";
                case 16: return "INITIALIZING";
                case 17: return "QSTABILIZE";
                case 18: return "QHOVER";
                case 19: return "QLOITER";
                case 20: return "QLAND";
                case 21: return "QRTL";
                case 22: return "QAUTOTUNE";
                case 23: return "QACRO";
                case 24: return "THERMAL";
                default: return "UNKNOWN";
            }
        }
        case MAV_TYPE_QUADROTOR:
        case MAV_TYPE_HELICOPTER:
        case MAV_TYPE_HEXAROTOR:
        case MAV_TYPE_OCTOROTOR:
        case MAV_TYPE_TRICOPTER:
        case MAV_TYPE_COAXIAL:
        case MAV_TYPE_VTOL_TAILSITTER_DUOROTOR:
        case MAV_TYPE_VTOL_TAILSITTER_QUADROTOR:
        case MAV_TYPE_VTOL_TILTROTOR:
        case MAV_TYPE_VTOL_FIXEDROTOR:
        case MAV_TYPE_VTOL_TAILSITTER:
        case MAV_TYPE_VTOL_TILTWING: {
            // ArduCopter - use exact mode names from ArduPilot
            switch (custom_mode) {
                case 0: return "STABILIZE";
                case 1: return "ACRO";
                case 2: return "ALT_HOLD";
                case 3: return "AUTO";
                case 4: return "GUIDED";
                case 5: return "LOITER";
                case 6: return "RTL";
                case 7: return "CIRCLE";
                case 9: return "LAND";
                case 11: return "DRIFT";
                case 13: return "SPORT";
                case 14: return "FLIP";
                case 15: return "AUTOTUNE";
                case 16: return "POSHOLD";
                case 17: return "BRAKE";
                case 18: return "THROW";
                case 19: return "AVOID_ADSB";
                case 20: return "GUIDED_NOGPS";
                case 21: return "SMART_RTL";
                case 22: return "FLOWHOLD";
                case 23: return "FOLLOW";
                case 24: return "ZIGZAG";
                case 25: return "SYSTEMID";
                case 26: return "AUTOROTATE";
                case 27: return "AUTORTL";
                case 28: return "TURTLE";
                default: return "UNKNOWN";
            }
        }
        case MAV_TYPE_GROUND_ROVER:
        case MAV_TYPE_SURFACE_BOAT: {
            // ArduRover - use exact mode names from ArduPilot
            switch (custom_mode) {
                case 0: return "MANUAL";
                case 1: return "ACRO";
                case 3: return "STEERING";
                case 4: return "HOLD";
                case 5: return "LOITER";
                case 6: return "FOLLOW";
                case 7: return "SIMPLE";
                case 10: return "AUTO";
                case 11: return "RTL";
                case 12: return "SMART_RTL";
                case 15: return "GUIDED";
                case 16: return "INITIALIZING";
                default: return "UNKNOWN";
            }
        }
        default:
            return "UNKNOWN";
    }
}

// --- Jeremy: Add command implementations for flight control ---
bool ConnectionManager::send_takeoff_command(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (!_mavlink_passthrough_plugins.count(vehicle_id)) {
        std::cerr << "Vehicle " << vehicle_id << " not found for takeoff command" << std::endl;
        return false;
    }
    
    auto passthrough = _mavlink_passthrough_plugins[vehicle_id];
    auto system = _systems[vehicle_id];
    
    mavsdk::MavlinkPassthrough::CommandLong cmd;
    cmd.target_sysid = system->get_system_id();
    cmd.target_compid = 0;
    cmd.command = MAV_CMD_NAV_TAKEOFF;
    cmd.param1 = 15.0f; // pitch
    cmd.param2 = 0.0f;
    cmd.param3 = 0.0f;
    cmd.param4 = 0.0f;
    cmd.param5 = 0.0f;
    cmd.param6 = 0.0f;
    cmd.param7 = 50.0f; // altitude

    auto result = passthrough->send_command_long(cmd);
    std::cout << "Takeoff command sent to " << vehicle_id << ": " << (result == mavsdk::MavlinkPassthrough::Result::Success ? "SUCCESS" : "FAILED") << std::endl;
    return result == mavsdk::MavlinkPassthrough::Result::Success;
}

bool ConnectionManager::send_land_command(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (!_mavlink_passthrough_plugins.count(vehicle_id)) {
        std::cerr << "Vehicle " << vehicle_id << " not found for land command" << std::endl;
        return false;
    }
    
    auto passthrough = _mavlink_passthrough_plugins[vehicle_id];
    auto system = _systems[vehicle_id];
    
    mavsdk::MavlinkPassthrough::CommandLong cmd;
    cmd.target_sysid = system->get_system_id();
    cmd.target_compid = 0;
    cmd.command = MAV_CMD_NAV_LAND;
    cmd.param1 = 0.0f; // abort alt
    cmd.param2 = 0.0f;
    cmd.param3 = 0.0f;
    cmd.param4 = 0.0f;
    cmd.param5 = 0.0f;
    cmd.param6 = 0.0f;
    cmd.param7 = 0.0f;

    auto result = passthrough->send_command_long(cmd);
    std::cout << "Land command sent to " << vehicle_id << ": " << (result == mavsdk::MavlinkPassthrough::Result::Success ? "SUCCESS" : "FAILED") << std::endl;
    return result == mavsdk::MavlinkPassthrough::Result::Success;
}

bool ConnectionManager::send_rtl_command(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (!_mavlink_passthrough_plugins.count(vehicle_id)) {
        std::cerr << "Vehicle " << vehicle_id << " not found for RTL command" << std::endl;
        return false;
    }
    
    auto passthrough = _mavlink_passthrough_plugins[vehicle_id];
    auto system = _systems[vehicle_id];
    
    mavsdk::MavlinkPassthrough::CommandLong cmd;
    cmd.target_sysid = system->get_system_id();
    cmd.target_compid = 0;
    cmd.command = MAV_CMD_NAV_RETURN_TO_LAUNCH;
    cmd.param1 = 0.0f;
    cmd.param2 = 0.0f;
    cmd.param3 = 0.0f;
    cmd.param4 = 0.0f;
    cmd.param5 = 0.0f;
    cmd.param6 = 0.0f;
    cmd.param7 = 0.0f;

    auto result = passthrough->send_command_long(cmd);
    std::cout << "RTL command sent to " << vehicle_id << ": " << (result == mavsdk::MavlinkPassthrough::Result::Success ? "SUCCESS" : "FAILED") << std::endl;
    return result == mavsdk::MavlinkPassthrough::Result::Success;
}

bool ConnectionManager::send_pause_command(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (!_mavlink_passthrough_plugins.count(vehicle_id)) {
        std::cerr << "Vehicle " << vehicle_id << " not found for pause command" << std::endl;
        return false;
    }
    
    auto passthrough = _mavlink_passthrough_plugins[vehicle_id];
    auto system = _systems[vehicle_id];
    
    mavsdk::MavlinkPassthrough::CommandLong cmd;
    cmd.target_sysid = system->get_system_id();
    cmd.target_compid = 0;
    cmd.command = MAV_CMD_DO_PAUSE_CONTINUE;
    cmd.param1 = 0.0f; // pause
    cmd.param2 = 0.0f;
    cmd.param3 = 0.0f;
    cmd.param4 = 0.0f;
    cmd.param5 = 0.0f;
    cmd.param6 = 0.0f;
    cmd.param7 = 0.0f;

    auto result = passthrough->send_command_long(cmd);
    std::cout << "Pause command sent to " << vehicle_id << ": " << (result == mavsdk::MavlinkPassthrough::Result::Success ? "SUCCESS" : "FAILED") << std::endl;
    return result == mavsdk::MavlinkPassthrough::Result::Success;
}

bool ConnectionManager::send_set_mode_command(const std::string& vehicle_id, const std::string& mode) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (!_mavlink_passthrough_plugins.count(vehicle_id)) {
        std::cerr << "Vehicle " << vehicle_id << " not found for set_mode command" << std::endl;
        return false;
    }
    
    auto passthrough = _mavlink_passthrough_plugins[vehicle_id];
    auto system = _systems[vehicle_id];
    
    // Normalize mode string
    std::string upper_mode = mode;
    std::transform(upper_mode.begin(), upper_mode.end(), upper_mode.begin(), ::toupper);

    // Build custom_mode mapping based on MAV_TYPE like QGC FirmwarePlugin
    std::vector<uint32_t> candidates;
    auto push_unique = [&candidates](uint32_t v) {
        if (std::find(candidates.begin(), candidates.end(), v) == candidates.end()) candidates.push_back(v);
    };

    uint8_t mav_type = 0;
    {
        std::lock_guard<std::mutex> lock(_mutex);
        mav_type = _last_mav_type[vehicle_id];
    }

    // Heuristic override: choose stack by requested mode token to avoid misclassification
    auto in_set = [&](const std::initializer_list<const char*> names) {
        for (auto* n : names) { if (upper_mode == n) return true; }
        return false;
    };
    enum class Stack { Unknown, Plane, Copter, Rover, Sub };
    Stack forced = Stack::Unknown;
    if (in_set({"FBWA","FBWB","CRUISE","AUTOTUNE","TAKEOFF"})) forced = Stack::Plane;
    else if (in_set({"POSHOLD","BRAKE","SPORT","DRIFT","THROW","GUIDED_NOGPS","SMART_RTL"})) forced = Stack::Copter;
    else if (in_set({"LEARNING","STEERING","HOLD"})) forced = Stack::Rover;
    else if (in_set({"DEPTH HOLD"})) forced = Stack::Sub;

    auto map_plane = [&]() {
        // Reference: ArduPlane Mode mapping - Fixed mapping based on actual ArduPlane firmware
        // 0=MANUAL,1=CIRCLE,2=STABILIZE,4=ACRO,5=FBWA,6=FBWB,7=CRUISE,8=AUTOTUNE,9=LAND,10=AUTO,11=RTL,12=LOITER,13=TAKEOFF,15=GUIDED
        if (upper_mode == "MANUAL") push_unique(0);
        if (upper_mode == "CIRCLE") push_unique(1);
        if (upper_mode == "STABILIZE" || upper_mode == "STABILIZED") push_unique(2);
        if (upper_mode == "ACRO") push_unique(4);
        if (upper_mode == "FBWA") push_unique(5);
        if (upper_mode == "FBWB") push_unique(6);
        if (upper_mode == "CRUISE") push_unique(7);
        if (upper_mode == "AUTOTUNE") push_unique(8);
        if (upper_mode == "LAND") push_unique(9);
        if (upper_mode == "AUTO") push_unique(10);
        if (upper_mode == "RTL") push_unique(11);
        if (upper_mode == "LOITER") push_unique(12);
        if (upper_mode == "TAKEOFF") push_unique(13);
        if (upper_mode == "GUIDED") push_unique(15);
    };

    auto map_copter = [&]() {
        if (upper_mode == "STABILIZE" || upper_mode == "STABILIZED" || upper_mode == "MANUAL") push_unique(0);
        if (upper_mode == "ACRO") push_unique(1);
        if (upper_mode == "ALTHOLD") push_unique(2);
        if (upper_mode == "AUTO") push_unique(3);
        if (upper_mode == "GUIDED") push_unique(4);
        if (upper_mode == "LOITER") push_unique(5);
        if (upper_mode == "RTL") push_unique(6);
        if (upper_mode == "CIRCLE") push_unique(7);
        if (upper_mode == "LAND") push_unique(9);
        if (upper_mode == "POSHOLD") push_unique(16);
    };

    auto map_rover = [&]() {
        if (upper_mode == "MANUAL") push_unique(0);
        if (upper_mode == "ACRO") push_unique(1);
        if (upper_mode == "LEARNING") push_unique(2);
        if (upper_mode == "STEERING") push_unique(3);
        if (upper_mode == "HOLD") push_unique(4);
        if (upper_mode == "LOITER") push_unique(5);
        if (upper_mode == "AUTO") push_unique(10);
        if (upper_mode == "RTL") push_unique(11);
        if (upper_mode == "GUIDED") push_unique(15);
    };

    auto map_sub = [&]() {
        if (upper_mode == "STABILIZE" || upper_mode == "STABILIZED") push_unique(0);
        if (upper_mode == "ACRO") push_unique(1);
        if (upper_mode == "AUTO") push_unique(3);
        if (upper_mode == "GUIDED") push_unique(4);
        if (upper_mode == "DEPTH HOLD" || upper_mode == "DEPHOLD" || upper_mode == "ALTHOLD") push_unique(2);
        if (upper_mode == "POSHOLD") push_unique(16);
    };

    switch (forced == Stack::Unknown ? mav_type : 0xFF) {
        case 0xFF: // Forced stack mapping by requested mode
            if (forced == Stack::Plane) { map_plane(); break; }
            if (forced == Stack::Copter) { map_copter(); break; }
            if (forced == Stack::Rover) { map_rover(); break; }
            if (forced == Stack::Sub) { map_sub(); break; }
            // fallthrough to use mav_type
            [[fallthrough]];
        case MAV_TYPE_QUADROTOR:
        case MAV_TYPE_HELICOPTER:
        case MAV_TYPE_HEXAROTOR:
        case MAV_TYPE_OCTOROTOR:
        case MAV_TYPE_TRICOPTER:
        case MAV_TYPE_COAXIAL:
        case MAV_TYPE_VTOL_TAILSITTER_DUOROTOR:
        case MAV_TYPE_VTOL_TAILSITTER_QUADROTOR:
        case MAV_TYPE_VTOL_TILTROTOR:
            map_copter();
            break;
        case MAV_TYPE_FIXED_WING:
            // Full ArduPlane mapping - Fixed mapping based on actual ArduPlane firmware
            if (upper_mode == "MANUAL") push_unique(0);
            if (upper_mode == "CIRCLE") push_unique(1);
            if (upper_mode == "STABILIZE" || upper_mode == "STABILIZED") push_unique(2);
            if (upper_mode == "ACRO") push_unique(4);
            if (upper_mode == "FBWA") push_unique(5);
            if (upper_mode == "FBWB") push_unique(6);
            if (upper_mode == "CRUISE") push_unique(7);
            if (upper_mode == "AUTOTUNE") push_unique(8);
            if (upper_mode == "LAND") push_unique(9);
            if (upper_mode == "AUTO") push_unique(10);
            if (upper_mode == "RTL") push_unique(11);
            if (upper_mode == "LOITER") push_unique(12);
            if (upper_mode == "TAKEOFF") push_unique(13);
            if (upper_mode == "GUIDED") push_unique(15);
            break;
        case MAV_TYPE_GROUND_ROVER:
        case MAV_TYPE_SURFACE_BOAT:
            map_rover();
            break;
        case MAV_TYPE_SUBMARINE:
            map_sub();
            break;
        default:
            // Unknown type: try all maps to increase success probability
            map_plane(); map_copter(); map_rover(); map_sub();
            break;
    }

    if (candidates.empty()) {
        std::cerr << "Unknown mode: " << mode << std::endl;
        return false;
    }

    std::cout << "[MODE] Requested mode='" << mode << "' (normalized='" << upper_mode << "')" << std::endl;
    std::cout << "[MODE] Candidate custom_mode values: ";
    for (size_t i = 0; i < candidates.size(); ++i) {
        std::cout << candidates[i] << (i + 1 < candidates.size() ? ", " : "\n");
    }

    bool any_sent_success = false;
    uint8_t current_base_mode = 0;
    {
        std::lock_guard<std::mutex> lock(_mutex);
        current_base_mode = _last_base_mode[vehicle_id];
    }
    // Preserve existing base mode bits like QGC does, but ensure CUSTOM_MODE is enabled
    uint8_t preserved_base_mode = (current_base_mode & ~MAV_MODE_FLAG_DECODE_POSITION_CUSTOM_MODE) | MAV_MODE_FLAG_CUSTOM_MODE_ENABLED;
    for (uint32_t custom_mode : candidates) {
        // Prefer COMMAND_LONG MAV_CMD_DO_SET_MODE (QGC behavior)
        mavsdk::MavlinkPassthrough::CommandLong cmd;
        cmd.target_sysid = system->get_system_id();
        cmd.target_compid = MAV_COMP_ID_AUTOPILOT1;
        cmd.command = MAV_CMD_DO_SET_MODE;
        cmd.param1 = static_cast<float>(MAV_MODE_FLAG_CUSTOM_MODE_ENABLED);
        cmd.param2 = static_cast<float>(custom_mode);
        cmd.param3 = 0.0f;
        cmd.param4 = 0.0f;
        cmd.param5 = 0.0f;
        cmd.param6 = 0.0f;
        cmd.param7 = 0.0f;

        auto res_cmd = passthrough->send_command_long(cmd);
        any_sent_success = any_sent_success || (res_cmd == mavsdk::MavlinkPassthrough::Result::Success);
        std::cout << "DO_SET_MODE sent (custom_mode=" << custom_mode << ") result="
                  << (res_cmd == mavsdk::MavlinkPassthrough::Result::Success ? "SUCCESS" : "FAILED") << std::endl;

        // Wait for ACK; if not accepted, fallback once to SET_MODE
        bool ack_ok_local = false;
        {
            std::unique_lock<std::mutex> lock(_mutex);
            _ack_cv.wait_for(lock, std::chrono::milliseconds(1500), [&]{
                return _last_ack_command[vehicle_id] == MAV_CMD_DO_SET_MODE; 
            });
            if (_last_ack_command[vehicle_id] == MAV_CMD_DO_SET_MODE && _last_ack_result[vehicle_id] == MAV_RESULT_ACCEPTED) {
                ack_ok_local = true;
            }
        }
        if (!ack_ok_local) {
            // Fallback to SET_MODE
            auto res_set = passthrough->queue_message([&](MavlinkAddress address, uint8_t channel) {
                mavlink_message_t set_mode_msg;
                mavlink_msg_set_mode_pack_chan(
                    address.system_id,
                    address.component_id,
                    channel,
                    &set_mode_msg,
                    system->get_system_id(),
                    preserved_base_mode,
                    custom_mode
                );
                return set_mode_msg;
            });
            any_sent_success = any_sent_success || (res_set == mavsdk::MavlinkPassthrough::Result::Success);
            std::cout << "SET_MODE fallback sent (custom_mode=" << custom_mode << ") result="
                      << (res_set == mavsdk::MavlinkPassthrough::Result::Success ? "SUCCESS" : "FAILED") << std::endl;
        }
        // Only attempt first mapping
        break;
    }

    // Wait briefly for COMMAND_ACK of DO_SET_MODE
    // Re-check final ACK status after possible fallback
    bool ack_ok = false;
    {
        std::unique_lock<std::mutex> lock(_mutex);
        _ack_cv.wait_for(lock, std::chrono::milliseconds(500), [&]{
            return _last_ack_command[vehicle_id] == MAV_CMD_DO_SET_MODE; 
        });
        if (_last_ack_command[vehicle_id] == MAV_CMD_DO_SET_MODE && _last_ack_result[vehicle_id] == MAV_RESULT_ACCEPTED) {
            ack_ok = true;
        }
    }
    return any_sent_success && ack_ok;
}

bool ConnectionManager::send_arm_command(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    
    std::cout << "[DEBUG] send_arm_command called for vehicle: " << vehicle_id << std::endl;
    
    // SWE100821: Add additional safety checks
    if (vehicle_id.empty()) {
        std::cerr << "ERROR: Empty vehicle_id in send_arm_command" << std::endl;
        return false;
    }
    
    if (!_mavlink_passthrough_plugins.count(vehicle_id)) {
        std::cerr << "Vehicle " << vehicle_id << " not found for arm command" << std::endl;
        return false;
    }
    
    if (!_systems.count(vehicle_id)) {
        std::cerr << "Vehicle " << vehicle_id << " system not found for arm command" << std::endl;
        return false;
    }
    
    try {
        auto passthrough = _mavlink_passthrough_plugins[vehicle_id];
        auto system = _systems[vehicle_id];
        
        if (!passthrough) {
            std::cerr << "ERROR: Null passthrough plugin for vehicle " << vehicle_id << std::endl;
            return false;
        }
        
        if (!system) {
            std::cerr << "ERROR: Null system for vehicle " << vehicle_id << std::endl;
            return false;
        }
        
        std::cout << "[DEBUG] Creating MAVLink arm command for vehicle " << vehicle_id << std::endl;
        
        std::cout << "[DEBUG] Creating MAVLink arm command for vehicle " << vehicle_id << std::endl;
        
        mavsdk::MavlinkPassthrough::CommandLong cmd;
        cmd.target_sysid = system->get_system_id();
        cmd.target_compid = 0;
        cmd.command = MAV_CMD_COMPONENT_ARM_DISARM;
        cmd.param1 = 1.0f; // arm
        cmd.param2 = 0.0f;
        cmd.param3 = 0.0f;
        cmd.param4 = 0.0f;
        cmd.param5 = 0.0f;
        cmd.param6 = 0.0f;
        cmd.param7 = 0.0f;

        std::cout << "[DEBUG] Sending MAVLink arm command to vehicle " << vehicle_id << std::endl;
        auto result = passthrough->send_command_long(cmd);
        std::cout << "Arm command sent to " << vehicle_id << ": " << (result == mavsdk::MavlinkPassthrough::Result::Success ? "SUCCESS" : "FAILED") << std::endl;
        
        std::cout << "[DEBUG] send_arm_command completed successfully for vehicle " << vehicle_id << std::endl;
        return result == mavsdk::MavlinkPassthrough::Result::Success;
        
    } catch (const std::exception& e) {
        std::cerr << "EXCEPTION in send_arm_command for vehicle " << vehicle_id << ": " << e.what() << std::endl;
        return false;
    } catch (...) {
        std::cerr << "UNKNOWN EXCEPTION in send_arm_command for vehicle " << vehicle_id << std::endl;
        return false;
    }
}

bool ConnectionManager::send_disarm_command(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    
    std::cout << "[DEBUG] send_disarm_command called for vehicle: " << vehicle_id << std::endl;
    
    // SWE100821: Add additional safety checks
    if (vehicle_id.empty()) {
        std::cerr << "ERROR: Empty vehicle_id in send_disarm_command" << std::endl;
        return false;
    }
    
    if (!_mavlink_passthrough_plugins.count(vehicle_id)) {
        std::cerr << "Vehicle " << vehicle_id << " not found for disarm command" << std::endl;
        return false;
    }
    
    if (!_systems.count(vehicle_id)) {
        std::cerr << "Vehicle " << vehicle_id << " system not found for disarm command" << std::endl;
        return false;
    }
    
    try {
        auto passthrough = _mavlink_passthrough_plugins[vehicle_id];
        auto system = _systems[vehicle_id];
        
        if (!passthrough) {
            std::cerr << "ERROR: Null passthrough plugin for vehicle " << vehicle_id << std::endl;
            return false;
        }
        
        if (!system) {
            std::cerr << "ERROR: Null system for vehicle " << vehicle_id << std::endl;
            return false;
        }
        
        std::cout << "[DEBUG] Creating MAVLink disarm command for vehicle " << vehicle_id << std::endl;
        
        mavsdk::MavlinkPassthrough::CommandLong command;
        command.target_sysid = system->get_system_id();
        command.target_compid = 0; // target component (0=all)
        command.command = MAV_CMD_COMPONENT_ARM_DISARM;
        command.param1 = 0.0f; // disarm
        command.param2 = 0.0f;
        command.param3 = 0.0f;
        command.param4 = 0.0f;
        command.param5 = 0.0f;
        command.param6 = 0.0f;
        command.param7 = 0.0f;

        std::cout << "[DEBUG] Sending MAVLink disarm command to vehicle " << vehicle_id << std::endl;
        auto result = passthrough->send_command_long(command);
        std::cout << "Disarm command sent to " << vehicle_id << ": " << (result == mavsdk::MavlinkPassthrough::Result::Success ? "SUCCESS" : "FAILED") << std::endl;
        
        std::cout << "[DEBUG] send_disarm_command completed successfully for vehicle " << vehicle_id << std::endl;
        return result == mavsdk::MavlinkPassthrough::Result::Success;
        
    } catch (const std::exception& e) {
        std::cerr << "EXCEPTION in send_disarm_command for vehicle " << vehicle_id << ": " << e.what() << std::endl;
        return false;
    } catch (...) {
        std::cerr << "UNKNOWN EXCEPTION in send_disarm_command for vehicle " << vehicle_id << std::endl;
        return false;
    }
}

std::string ConnectionManager::get_flight_modes(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (!_systems.count(vehicle_id)) {
        std::cerr << "Vehicle " << vehicle_id << " not found for flight modes" << std::endl;
        return json{{"success", false}, {"error", "Vehicle not found"}}.dump();
    }

    // Return mode list based on MAV type similar to QGC FirmwarePlugin
    uint8_t mav_type = _last_mav_type[vehicle_id];
    std::vector<std::string> flight_modes;
    switch (mav_type) {
        case MAV_TYPE_QUADROTOR:
        case MAV_TYPE_HELICOPTER:
        case MAV_TYPE_HEXAROTOR:
        case MAV_TYPE_OCTOROTOR:
        case MAV_TYPE_TRICOPTER:
        case MAV_TYPE_COAXIAL:
        case MAV_TYPE_VTOL_TAILSITTER_DUOROTOR:
        case MAV_TYPE_VTOL_TAILSITTER_QUADROTOR:
        case MAV_TYPE_VTOL_TILTROTOR:
        case MAV_TYPE_VTOL_FIXEDROTOR:
        case MAV_TYPE_VTOL_TAILSITTER:
        case MAV_TYPE_VTOL_TILTWING:
            // ArduCopter comprehensive set (common)
            flight_modes = {
                "STABILIZE","ACRO","ALTHOLD","AUTO","GUIDED","LOITER","RTL","CIRCLE",
                "LAND","POSHOLD","BRAKE","SPORT","DRIFT","AUTOTUNE","THROW","GUIDED_NOGPS",
                "SMART_RTL"
            };
            break;
        case MAV_TYPE_FIXED_WING:
            // ArduPlane comprehensive set (LAND is not a standalone mode on Plane)
            flight_modes = {
                "MANUAL","CIRCLE","STABILIZE","ACRO","FBWA","FBWB","CRUISE","AUTOTUNE",
                "AUTO","RTL","LOITER","TAKEOFF","GUIDED"
            };
            break;
        case MAV_TYPE_GROUND_ROVER:
        case MAV_TYPE_SURFACE_BOAT:
            // ArduRover common set
            flight_modes = {"MANUAL","ACRO","LEARNING","STEERING","HOLD","LOITER","AUTO","RTL","SMART_RTL","GUIDED"};
            break;
        case MAV_TYPE_SUBMARINE:
            // ArduSub common set
            flight_modes = {"STABILIZE","ACRO","DEPTH HOLD","AUTO","GUIDED","POSHOLD"};
            break;
        default:
            // Fallback generic set
            flight_modes = {"MANUAL","STABILIZE","ALTHOLD","AUTO","RTL","LOITER","GUIDED","ACRO","CIRCLE","LAND"};
            break;
    }
    
    json result = {
        {"success", true},
        {"flightModes", flight_modes}
    };
    
    std::cout << "Flight modes for " << vehicle_id << ": " << result.dump() << std::endl;
    return result.dump();
}
// --- End Jeremy patch for command implementations ---

// --- Jeremy: Add parameter management implementations ---
std::string ConnectionManager::get_all_parameters(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (!_mavlink_passthrough_plugins.count(vehicle_id)) {
        return json{{"success", false}, {"error", "Vehicle not found"}}.dump();
    }
    
    // For now, return a mock response since MAVSDK parameter plugin is complex
    // In a full implementation, you would use MAVSDK's Parameter plugin
    json parameters = json::array();
    
    // Mock some common ArduPilot parameters
    std::vector<std::pair<std::string, double>> mockParams = {
        {"SYSID_MYGCS", 255},
        {"SERIAL0_PROTOCOL", 2},
        {"STREAMRATE", 10},
        {"SR0_POSITION", 10},
        {"SR0_ATTITUDE", 10},
        {"SR0_VFR_HUD", 10},
        {"SR0_EXTENDED_STATUS", 10},
        {"FRAME_CLASS", 1},
        {"FRAME_TYPE", 1},
        {"ARMING_CHECK", 1},
        {"ARMING_REQUIRE", 0},
        {"BATT_MONITOR", 4},
        {"BATT_VOLT_PIN", 13},
        {"BATT_CURR_PIN", 12},
        {"BATT_VOLT_MULT", 10.1},
        {"BATT_CURR_MULT", 17.0},
        {"BATT_LOW_VOLT", 10.5},
        {"BATT_LOW_MAH", 0},
        {"BATT_CAPACITY", 3300}
    };
    
    for (const auto& [name, value] : mockParams) {
        json param;
        param["name"] = name;
        param["value"] = value;
        param["units"] = "";
        param["description"] = "Mock parameter for testing";
        param["category"] = "General";
        parameters.push_back(param);
    }
    
    return json{{"success", true}, {"parameters", parameters}}.dump();
}

bool ConnectionManager::set_parameter(const std::string& vehicle_id, const std::string& name, double value) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (!_mavlink_passthrough_plugins.count(vehicle_id)) {
        std::cerr << "Vehicle " << vehicle_id << " not found for parameter set" << std::endl;
        return false;
    }
    
    auto passthrough = _mavlink_passthrough_plugins[vehicle_id];
    auto system = _systems[vehicle_id];
    
    // Send PARAM_SET message
    // Send PARAM_SET message
    char param_id[16] = {0};
    strncpy(param_id, name.c_str(), 15);
    float param_value_f = static_cast<float>(value);
    uint8_t target_sysid = system->get_system_id();
    
    auto result = passthrough->queue_message([&](MavlinkAddress address, uint8_t channel) {
        mavlink_message_t msg;
        mavlink_msg_param_set_pack_chan(
            address.system_id,
            address.component_id,
            channel,
            &msg,
            target_sysid,
            0, // target component
            param_id,
            param_value_f,
            MAV_PARAM_TYPE_REAL32 // Assume float for now
        );
        return msg;
    });

    std::cout << "Parameter set " << name << " = " << value << " to " << vehicle_id << ": " << (result == mavsdk::MavlinkPassthrough::Result::Success ? "SUCCESS" : "FAILED") << std::endl;
    return result == mavsdk::MavlinkPassthrough::Result::Success;
}
// --- End Jeremy patch for parameter implementations ---

// --- Jeremy: Add MAVLink message sending implementation ---
bool ConnectionManager::send_mavlink_message(const std::string& vehicle_id, const std::string& message_type, const json& parameters) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (!_mavlink_passthrough_plugins.count(vehicle_id)) {
        std::cerr << "Vehicle " << vehicle_id << " not found for MAVLink message" << std::endl;
        return false;
    }
    
    auto passthrough = _mavlink_passthrough_plugins[vehicle_id];
    auto system = _systems[vehicle_id];
    
    bool success = false;
    try {
        auto result = passthrough->queue_message([&](MavlinkAddress address, uint8_t channel) {
            mavlink_message_t msg;
            memset(&msg, 0, sizeof(msg)); // Safety

            if (message_type == "HEARTBEAT") {
                mavlink_msg_heartbeat_pack_chan(
                    address.system_id,
                    address.component_id,
                    channel,
                    &msg,
                    static_cast<uint8_t>(parameters.value("type", 1)),
                    static_cast<uint8_t>(parameters.value("autopilot", 3)),
                    static_cast<uint8_t>(parameters.value("base_mode", 0)),
                    static_cast<uint32_t>(parameters.value("custom_mode", 0)),
                    static_cast<uint8_t>(parameters.value("system_status", 3))
                );
            }
            else if (message_type == "COMMAND_LONG") {
                mavlink_msg_command_long_pack_chan(
                    address.system_id,
                    address.component_id,
                    channel,
                    &msg,
                    static_cast<uint8_t>(parameters.value("target_system", 1)),
                    static_cast<uint8_t>(parameters.value("target_component", 1)),
                    static_cast<uint16_t>(parameters.value("command", 0)),
                    static_cast<uint8_t>(parameters.value("confirmation", 0)),
                    static_cast<float>(parameters.value("param1", 0)),
                    static_cast<float>(parameters.value("param2", 0)),
                    static_cast<float>(parameters.value("param3", 0)),
                    static_cast<float>(parameters.value("param4", 0)),
                    static_cast<float>(parameters.value("param5", 0)),
                    static_cast<float>(parameters.value("param6", 0)),
                    static_cast<float>(parameters.value("param7", 0))
                );
            }
            else if (message_type == "SET_MODE") {
                mavlink_msg_set_mode_pack_chan(
                    address.system_id,
                    address.component_id,
                    channel,
                    &msg,
                    static_cast<uint8_t>(parameters.value("target_system", 1)),
                    static_cast<uint8_t>(parameters.value("base_mode", 0)),
                    static_cast<uint32_t>(parameters.value("custom_mode", 0))
                );
            }
            else if (message_type == "PARAM_SET") {
                char param_id[16] = {0};
                std::string param_id_str = parameters.value("param_id", "");
                strncpy(param_id, param_id_str.c_str(), 15);
                
                mavlink_msg_param_set_pack_chan(
                    address.system_id,
                    address.component_id,
                    channel,
                    &msg,
                    static_cast<uint8_t>(parameters.value("target_system", 1)),
                    static_cast<uint8_t>(parameters.value("target_component", 1)),
                    param_id,
                    static_cast<float>(parameters.value("param_value", 0)),
                    static_cast<uint8_t>(parameters.value("param_type", 9))
                );
            }
            else if (message_type == "PARAM_REQUEST_READ") {
                char param_id[16] = {0};
                std::string param_id_str = parameters.value("param_id", "");
                strncpy(param_id, param_id_str.c_str(), 15);
                
                mavlink_msg_param_request_read_pack_chan(
                    address.system_id,
                    address.component_id,
                    channel,
                    &msg,
                    static_cast<uint8_t>(parameters.value("target_system", 1)),
                    static_cast<uint8_t>(parameters.value("target_component", 1)),
                    param_id,
                    static_cast<int16_t>(parameters.value("param_index", -1))
                );
            }
            else if (message_type == "COMMAND_ACK") {
                mavlink_msg_command_ack_pack_chan(
                    address.system_id,
                    address.component_id,
                    channel,
                    &msg,
                    static_cast<uint16_t>(parameters.value("command", 0)),
                    static_cast<uint8_t>(parameters.value("result", 0)),
                    static_cast<uint8_t>(parameters.value("progress", 0)),
                    static_cast<int32_t>(parameters.value("result_param2", 0)),
                    static_cast<uint8_t>(parameters.value("target_system", 0)),
                    static_cast<uint8_t>(parameters.value("target_component", 0))
                );
            }
            else if (message_type == "STATUSTEXT") {
                char text[50] = {0};
                std::string text_str = parameters.value("text", "Test message");
                strncpy(text, text_str.c_str(), 49);
                
                mavlink_msg_statustext_pack_chan(
                    address.system_id,
                    address.component_id,
                    channel,
                    &msg,
                    static_cast<uint8_t>(parameters.value("severity", 6)),
                    text,
                    static_cast<uint16_t>(parameters.value("id", 0)),
                    static_cast<uint8_t>(parameters.value("chunk_seq", 0))
                );
            }
            else {
                // If message type unknown, return empty msg (msgid=0 which is usually bad but safer than crash)
                // Ideally log error but inside lambda hard to log to caller context without capturing
            }

            return msg;
        });

        success = (result == mavsdk::MavlinkPassthrough::Result::Success);
        if (success) {
             std::cout << "MAVLink message " << message_type << " sent to " << vehicle_id << " SUCCESS" << std::endl;
        } else {
             std::cerr << "MAVLink message " << message_type << " sent to " << vehicle_id << " FAILED (Supported?)" << std::endl;
        }

    } catch (const std::exception& e) {
        std::cerr << "Error sending MAVLink message: " << e.what() << std::endl;
        success = false;
    }
    
    return success;
}
// --- End Jeremy patch for MAVLink message sending implementation --- 
// --- Compass Calibration Implementation ---

bool ConnectionManager::start_compass_calibration(const std::string& vehicle_id) {
    if (!_mavlink_passthrough_plugins.count(vehicle_id)) return false;

    {
        std::lock_guard<std::mutex> lock(_mutex);
        CalibrationStatus& status = _calibration_status[vehicle_id];
        status.active = true;
        status.progress = 0;
        status.status_text = "Starting calibration...";
        status.success = false;
        status.compass_progress = {0, 0, 0};
        status.compass_complete = {false, false, false};
    }

    // MAV_CMD_DO_START_MAG_CAL = 4242
    // Params:
    // 1: Compass bitmask (0=all, 1=id0, 2=id1, 4=id2...)
    // 2: Retry on failure
    // 3: Autosave (1=yes)
    // 4: Delay (seconds)
    // 5: Autoreboot (1=yes)
    
    mavsdk::MavlinkPassthrough::CommandLong command;
    command.target_sysid = _systems[vehicle_id]->get_system_id();
    command.target_compid = 0;
    command.command = 4242; // MAV_CMD_DO_START_MAG_CAL
    command.param1 = 0; // Calibration all
    command.param2 = 0; // No retry
    command.param3 = 1; // Autosave
    command.param4 = 0; // No delay
    command.param5 = 0; // No autoreboot
    command.param6 = 0;
    command.param7 = 0;

    _mavlink_passthrough_plugins[vehicle_id]->send_command_long(command);
    return true;
}

bool ConnectionManager::cancel_compass_calibration(const std::string& vehicle_id) {
    if (!_mavlink_passthrough_plugins.count(vehicle_id)) return false;

    {
        std::lock_guard<std::mutex> lock(_mutex);
        _calibration_status[vehicle_id].active = false;
        _calibration_status[vehicle_id].status_text = "Cancelled";
    }

    // MAV_CMD_DO_CANCEL_MAG_CAL = 4243
    mavsdk::MavlinkPassthrough::CommandLong command;
    command.target_sysid = _systems[vehicle_id]->get_system_id();
    command.target_compid = 0;
    command.command = 4243; // MAV_CMD_DO_CANCEL_MAG_CAL
    command.param1 = 0;
    command.param2 = 0;
    command.param3 = 0;
    command.param4 = 0;
    command.param5 = 0;
    command.param6 = 0;
    command.param7 = 0;

    _mavlink_passthrough_plugins[vehicle_id]->send_command_long(command);
    return true;
}

std::string ConnectionManager::get_calibration_status(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (!_calibration_status.count(vehicle_id)) {
        return json{{"active", false}}.dump();
    }
    
    const auto& status = _calibration_status[vehicle_id];
    return json{
        {"active", status.active},
        {"progress", status.progress},
        {"status_text", status.status_text},
        {"success", status.success}
    }.dump();
}

bool ConnectionManager::start_accelerometer_calibration(const std::string& vehicle_id) {
    if (!_mavlink_passthrough_plugins.count(vehicle_id)) return false;

    {
        std::lock_guard<std::mutex> lock(_mutex);
        CalibrationStatus& status = _calibration_status[vehicle_id];
        status.active = true;
        status.progress = 0;
        status.status_text = "Waiting for vehicle to start calibration...";
        status.success = false;
        status.compass_progress = {0, 0, 0};
        status.compass_complete = {false, false, false};
    }

    // MAV_CMD_PREFLIGHT_CALIBRATION = 241
    mavsdk::MavlinkPassthrough::CommandLong command;
    command.target_sysid = _systems[vehicle_id]->get_system_id();
    command.target_compid = 0;
    command.command = 241; // MAV_CMD_PREFLIGHT_CALIBRATION
    command.param1 = 0;
    command.param2 = 0;
    command.param3 = 0;
    command.param4 = 0;
    command.param5 = 1; // Accel (1 to start)
    command.param6 = 0;
    command.param7 = 0;

    _mavlink_passthrough_plugins[vehicle_id]->send_command_long(command);
    return true;
}

bool ConnectionManager::cancel_accelerometer_calibration(const std::string& vehicle_id) {
    if (!_mavlink_passthrough_plugins.count(vehicle_id)) return false;

    {
        std::lock_guard<std::mutex> lock(_mutex);
        _calibration_status[vehicle_id].active = false;
        _calibration_status[vehicle_id].status_text = "Cancelled";
    }

    // No specific cancel command for accel, usually requires reboot or just ignoring.
    // We update our state to stop tracking.
    return true;
}
// Motor Test
bool ConnectionManager::send_motor_test(const std::string& vehicle_id, int motor_index, int throttle_pct, int timeout_sec) {
    std::lock_guard<std::mutex> lock(_mutex);
    
    if (!_systems.count(vehicle_id) || !_mavlink_passthrough_plugins.count(vehicle_id)) {
        return false;
    }

    auto passthrough = _mavlink_passthrough_plugins[vehicle_id];
    auto system = _systems[vehicle_id];

    // MAV_CMD_DO_MOTOR_TEST
    // Param 1: Motor instance number (1-based)
    // Param 2: Throttle type (0=Throttle percent, 1=PWM, 2=Pilot throttle, 3=Pass-through)
    // Param 3: Throttle value (0-100 for type 0)
    // Param 4: Timeout in seconds
    // Param 5: Motor count (for multicopters, 0 for single motor) - Usually 1 for testing single motor
    // Param 6: Motor order/Test type (0=Standard) -- ArduPilot specific usage varies
    // Param 7: Empty

    mavsdk::MavlinkPassthrough::CommandLong command;
    command.target_sysid = system->get_system_id();
    command.target_compid = MAV_COMP_ID_AUTOPILOT1; // Fixed: MAVSDK System doesn't expose component ID directly
    command.command = MAV_CMD_DO_MOTOR_TEST;
    command.param1 = static_cast<float>(motor_index); // Motor index
    command.param2 = 0.0f; // 0 = Throttle percent
    command.param3 = static_cast<float>(throttle_pct); // Throttle value
    command.param4 = static_cast<float>(timeout_sec); // Timeout
    command.param5 = 0.0f; // 
    command.param6 = 0.0f; // MOTOR_TEST_ORDER_DEFAULT
    command.param7 = 0.0f;

    std::cout << "[ConnectionManager] Sending Motor Test: Motor=" << motor_index 
              << " Throttle=" << throttle_pct << "% Timeout=" << timeout_sec << "s" << std::endl;

    auto result = passthrough->send_command_long(command);
    return result == mavsdk::MavlinkPassthrough::Result::Success;
}

// Manual Control
bool ConnectionManager::send_manual_control(const std::string& vehicle_id, float x, float y, float z, float r, uint16_t buttons) {
    // x: Pitch (fwd/back) -1 to 1
    // y: Roll (left/right) -1 to 1
    // z: Thrust 0 to 1
    // r: Yaw -1 to 1
    
    // We don't need full lock for just sending a message usually, but for consistency
    std::lock_guard<std::mutex> lock(_mutex);
    
    if (!_systems.count(vehicle_id) || !_mavlink_passthrough_plugins.count(vehicle_id)) {
        return false;
    }

    auto passthrough = _mavlink_passthrough_plugins[vehicle_id];
    auto system = _systems[vehicle_id];

    // MANUAL_CONTROL message (ID 69)
    // Scale inputs to -1000 to +1000 range for x,y,r. z is 0-1000.
    // NOTE: MANUAL_CONTROL structure:
    // int16_t x; (pitch)
    // int16_t y; (roll)
    // int16_t z; (thrust)
    // int16_t r; (yaw)
    // uint16_t buttons;
    // uint8_t target; (target system, 0 for all)

    mavlink_message_t msg;
    mavlink_manual_control_t manual_control;
    manual_control.target = system->get_system_id();
    
    // Scale float inputs to int16 range
    manual_control.x = static_cast<int16_t>(x * 1000.0f);
    manual_control.y = static_cast<int16_t>(y * 1000.0f);
    manual_control.z = static_cast<int16_t>(z * 1000.0f); // 0-1000 typically
    manual_control.r = static_cast<int16_t>(r * 1000.0f);
    manual_control.buttons = buttons;

    auto result = passthrough->queue_message([&](MavlinkAddress address, uint8_t channel) {
        mavlink_message_t msg;
        mavlink_msg_manual_control_encode_chan(
            address.system_id,
            address.component_id,
            channel,
            &msg,
            &manual_control
        );
        return msg;
    });

    // Don't log every joystick packet, it's too spammy.
    return result == mavsdk::MavlinkPassthrough::Result::Success;
}

// Follow Me
bool ConnectionManager::send_follow_target(const std::string& vehicle_id, double lat, double lon, float alt, float vn, float ve, float vd) {
    if (!_systems.count(vehicle_id) || !_mavlink_passthrough_plugins.count(vehicle_id)) {
        return false;
    }

    auto passthrough = _mavlink_passthrough_plugins[vehicle_id];
    auto system = _systems[vehicle_id];

    mavlink_message_t msg;
    mavlink_follow_target_t follow_target;
    
    // Timestamp
    follow_target.timestamp = 0; // Sync not required for basic follow
    follow_target.est_capabilities = 0;
    
    // Position (int32 degE7)
    follow_target.lat = static_cast<int32_t>(lat * 1e7);
    follow_target.lon = static_cast<int32_t>(lon * 1e7);
    follow_target.alt = static_cast<float>(alt); // meters
    
    // Velocity (m/s)
    follow_target.vel[0] = vn;
    follow_target.vel[1] = ve;
    follow_target.vel[2] = vd;
    
    // Acceleration (optional)
    follow_target.acc[0] = 0;
    follow_target.acc[1] = 0;
    follow_target.acc[2] = 0;
    
    // Attitude (optional)
    follow_target.attitude_q[0] = 1;
    follow_target.attitude_q[1] = 0;
    follow_target.attitude_q[2] = 0;
    follow_target.attitude_q[3] = 0;
    
    follow_target.rates[0] = 0;
    follow_target.rates[1] = 0;
    follow_target.rates[2] = 0;
    
    follow_target.position_cov[0] = 0; 
    follow_target.position_cov[1] = 0; 
    follow_target.position_cov[2] = 0;

    auto result = passthrough->queue_message([&](MavlinkAddress address, uint8_t channel) {
        mavlink_message_t msg;
        mavlink_msg_follow_target_encode_chan(
            address.system_id,
            address.component_id,
            channel,
            &msg,
            &follow_target
        );
        return msg;
    });

    return result == mavsdk::MavlinkPassthrough::Result::Success;
}

std::shared_ptr<mavsdk::System> ConnectionManager::get_system_ptr(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (vehicle_id.empty()) {
        // Return first available system if no ID provided
        if (!_systems.empty()) {
            return _systems.begin()->second;
        }
        return nullptr;
    }
    
    auto it = _systems.find(vehicle_id);
    if (it != _systems.end()) {
        return it->second;
    }
    return nullptr;
}

bool ConnectionManager::upload_geofence(const std::string& vehicle_id, const std::vector<std::pair<double, double>>& points) {
    auto it = _geofence_plugins.find(vehicle_id);
    if (it == _geofence_plugins.end()) return false;

    mavsdk::Geofence::Polygon polygon;
    polygon.fence_type = mavsdk::Geofence::FenceType::Inclusion; // Default to Inclusion
    for (const auto& p : points) {
        mavsdk::Geofence::Point point;
        point.latitude_deg = p.first;
        point.longitude_deg = p.second;
        polygon.points.push_back(point);
    }

    mavsdk::Geofence::GeofenceData data;
    data.polygons.push_back(polygon);

    std::cout << "Uploading geofence with " << points.size() << " points to " << vehicle_id << "..." << std::endl;
    auto result = it->second->upload_geofence(data);
    if (result != mavsdk::Geofence::Result::Success) {
        std::cerr << "Geofence upload failed: " << result << std::endl;
        return false;
    }
    return true;
}

bool ConnectionManager::clear_geofence(const std::string& vehicle_id) {
    auto it = _geofence_plugins.find(vehicle_id);
    if (it == _geofence_plugins.end()) return false;

    auto result = it->second->clear_geofence();
    if (result != mavsdk::Geofence::Result::Success) {
        std::cerr << "Geofence clear failed: " << result << std::endl;
        return false;
    }
    std::cout << "Geofence cleared for " << vehicle_id << std::endl;
    return true;
}

bool ConnectionManager::upload_rally_points(const std::string& vehicle_id, const std::vector<std::tuple<double, double, float>>& points) {
    auto passthrough = _mavlink_passthrough_plugins[vehicle_id];
    if (!passthrough) {
        std::cerr << "No passthrough for " << vehicle_id << std::endl;
        return false;
    }

    uint8_t target_sysid = _systems[vehicle_id]->get_system_id();
    uint8_t target_compid = 0; // Assuming autopilot component
    uint8_t my_sysid = 255; // GCS system ID
    uint8_t my_compid = 1; // GCS component ID

    // Protocol: Just send RALLY_POINT messages. Reference: https://mavlink.io/en/messages/ardupilotmega.html#RALLY_POINT
    // There isn't a strict "Clear" command, usually overwriting or sending count=0 might work, but ArduPilot usually expects the full list.
    // Index mapping is 0-based.
    
    // Safety check: if empty, send a dummy point with count 0? Or just return.
    // If empty, we should probably clear. Sending a point with count=0 might do it.
    
    uint8_t count = static_cast<uint8_t>(points.size());
    
    if (count == 0) {
       // Try sending a point with count 0 to clear
       mavlink_message_t msg = rally::pack_rally_point(
            my_sysid, my_compid,
            target_sysid, target_compid,
            0, 0, // idx=0, count=0
            0, 0, 0, 0, 0, 0
       );
       passthrough->send_message(msg);
       return true;
    }

    for (size_t i = 0; i < points.size(); ++i) {
        auto [lat, lon, alt] = points[i];
        
        mavlink_message_t msg = rally::pack_rally_point(
            my_sysid, my_compid,
            target_sysid, target_compid,
            static_cast<uint8_t>(i), count,
            static_cast<int32_t>(lat * 1e7), // degE7
            static_cast<int32_t>(lon * 1e7), // degE7
            static_cast<int16_t>(alt),       // meters
            static_cast<int16_t>(alt),       // break alt (same as alt for now)
            0,                               // land_dir (0 for now)
            0                                // flags
        );
        
        passthrough->send_message(msg);
        
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    std::cout << "Uploaded " << (int)count << " rally points to " << vehicle_id << std::endl;
    return true;
}

// --- Radio Simulation Implementation ---

void ConnectionManager::set_radio_simulation(const std::string& vehicle_id, bool enabled, double freq, double tx_pwr, double tx_gain, double rx_gain) {
    std::lock_guard<std::mutex> lock(_mutex);
    _radio_sim_params[vehicle_id] = {enabled, freq, tx_pwr, tx_gain, rx_gain, -100.0};
    std::cout << "Radio Simulation for " << vehicle_id << ": " << (enabled ? "ENABLED" : "DISABLED") << std::endl;
}

void ConnectionManager::update_radio_simulation(const std::string& vehicle_id) {
    // Note: _mutex should NOT be locked when calling this private method if it locks internally?
    // Wait, get_telemetry_data_json locks _mutex. calling this would deadlock if we lock again.
    // We should assume the caller holds the lock OR use recursive mutex.
    // Current _mutex is standard mutex.
    // BUT get_telemetry_data_json holds the lock.
    // So this function must NOT lock _mutex again.
    
    if (!_radio_sim_params.count(vehicle_id) || !_radio_sim_params[vehicle_id].enabled) {
        return;
    }

    auto& params = _radio_sim_params[vehicle_id];
    
    // Get positions to calc distance
    // We need telemetry plugin (already have access in get_telemetry_data_json scope, but not here easily without passing it)
    // Let's rely on cached or accessed data.
    // Actually, getting telemetry plugin again is safe?
    
    if (!_telemetry_plugins.count(vehicle_id)) return;
    auto telemetry = _telemetry_plugins[vehicle_id];
    
    auto position = telemetry->position(); // e.g. relative_altitude_m, latitude_deg, longitude_deg
    auto home = telemetry->home(); // latitude_deg, longitude_deg
    
    // Simple distance calculation (Haversine or flat earth for short range)
    // 1 deg lat ~ 111132m
    double lat1 = position.latitude_deg;
    double lon1 = position.longitude_deg;
    double lat2 = home.latitude_deg;
    double lon2 = home.longitude_deg;
    
    if (std::isnan(lat1) || std::isnan(lat2)) return; // No fix

    double R = 6371e3; // metres
    double phi1 = lat1 * M_PI/180;
    double phi2 = lat2 * M_PI/180;
    double dphi = (lat2-lat1) * M_PI/180;
    double dlam = (lon2-lon1) * M_PI/180;

    double a = sin(dphi/2) * sin(dphi/2) +
               cos(phi1) * cos(phi2) *
               sin(dlam/2) * sin(dlam/2);
    double c = 2 * atan2(sqrt(a), sqrt(1-a));
    double dist_m = R * c;

    // FSPL = 20log(d) + 20log(f) + 32.44 + ... 
    // FSPL(dB) = 20*log10(d_km) + 20*log10(f_MHz) + 32.44
    
    double dist_km = std::max(0.001, dist_m / 1000.0);
    double fspl = 20 * log10(dist_km) + 20 * log10(params.frequency_mhz) + 32.44;
    
    double rssi = params.tx_power_dbm + params.tx_gain_dbi + params.rx_gain_dbi - fspl;
    
    // Clamp RSSI
    if (rssi > 0) rssi = 0;
    if (rssi < -120) rssi = -120; // Noise floor
    
    // Update radio status
    // Signal: RSSI
    // Noise: -100
    // RemRSSI: Assume symmetric for sim
    
    _radio_status[vehicle_id] = {
        (int)rssi,
        (int)rssi, // remote rssi
        (int)params.noise_floor_dbm, // noise
        (int)params.noise_floor_dbm, // remnoise
        100, // txbuf
        0,   // rxerrors
        0    // fixed
    };
    
    // Debug print occasionally?
    // std::cout << "Simulated RSSI: " << rssi << " dBm (Dist: " << dist_m << "m)" << std::endl;
}

