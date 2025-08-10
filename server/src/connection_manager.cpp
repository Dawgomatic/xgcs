#include "connection_manager.hpp"
#include <iostream>
#include <future>
#include <chrono>
#include <atomic>
#include <mavlink/common/mavlink.h>
#include <algorithm>

std::string flight_mode_to_string(mavsdk::Telemetry::FlightMode mode);

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
    _mission_plugins[vehicle_id] = std::make_shared<mavsdk::Mission>(system);
    _mavlink_passthrough_plugins[vehicle_id] = std::make_shared<mavsdk::MavlinkPassthrough>(system);
    _telemetry_plugins[vehicle_id]->set_rate_position(10.0);

    // --- Jeremy: Request full telemetry streams like QGC ---
    // Send SET_MESSAGE_INTERVAL for all key telemetry messages at 5 Hz
    auto passthrough = _mavlink_passthrough_plugins[vehicle_id];
    if (passthrough) {
        const int rate_hz = 5;
        const int interval_us = 1000000 / rate_hz;
        std::vector<uint16_t> msg_ids = {
            MAVLINK_MSG_ID_ATTITUDE,
            MAVLINK_MSG_ID_SYS_STATUS,
            MAVLINK_MSG_ID_BATTERY_STATUS,
            MAVLINK_MSG_ID_GPS_RAW_INT,
            MAVLINK_MSG_ID_GLOBAL_POSITION_INT,
            MAVLINK_MSG_ID_RC_CHANNELS,
            MAVLINK_MSG_ID_VFR_HUD
        };
        for (uint16_t msgid : msg_ids) {
            mavlink_message_t msg;
            mavlink_msg_command_long_pack(
                passthrough->get_our_sysid(),
                passthrough->get_our_compid(),
                &msg,
                system->get_system_id(),
                0, // target component
                MAV_CMD_SET_MESSAGE_INTERVAL,
                0, // confirmation
                msgid, // param1: message id
                interval_us, // param2: interval (us)
                0,0,0,0,0 // unused
            );
            passthrough->send_message(msg);
            std::cout << "[MAVLINK] Sent SET_MESSAGE_INTERVAL for msgid " << msgid << " at " << rate_hz << " Hz" << std::endl;
        }

        // --- Jeremy: Also request all legacy MAVLink data streams (ArduPilot/PX4 style) ---
        // This ensures we get all standard telemetry categories
        const int stream_rate_hz = 5;
        std::vector<uint8_t> stream_ids = {
            MAV_DATA_STREAM_ALL,
            MAV_DATA_STREAM_RAW_SENSORS,
            MAV_DATA_STREAM_EXTENDED_STATUS,
            MAV_DATA_STREAM_RC_CHANNELS,
            MAV_DATA_STREAM_POSITION,
            MAV_DATA_STREAM_EXTRA1,
            MAV_DATA_STREAM_EXTRA2,
            MAV_DATA_STREAM_EXTRA3
        };
        for (uint8_t stream_id : stream_ids) {
            mavlink_message_t req;
            mavlink_msg_request_data_stream_pack(
                passthrough->get_our_sysid(),
                passthrough->get_our_compid(),
                &req,
                system->get_system_id(),
                0, // target component
                stream_id,
                stream_rate_hz,
                1 // start streaming
            );
            passthrough->send_message(req);
            std::cout << "[MAVLINK] Sent REQUEST_DATA_STREAM for stream_id " << (int)stream_id << " at " << stream_rate_hz << " Hz" << std::endl;
        }

        // Subscribe to HEARTBEAT and COMMAND_ACK immediately to track mode/acks even without WS streaming
        passthrough->subscribe_message(MAVLINK_MSG_ID_HEARTBEAT,
            [this, vehicle_id](const mavlink_message_t& message) {
                handle_mavlink_message(vehicle_id, message);
            });
        passthrough->subscribe_message(MAVLINK_MSG_ID_COMMAND_ACK,
            [this, vehicle_id](const mavlink_message_t& message) {
                handle_mavlink_message(vehicle_id, message);
            });
    }

    std::cout << "Vehicle " << vehicle_id << " connected." << std::endl;
    return true;
}

void ConnectionManager::remove_vehicle(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    _systems.erase(vehicle_id);
    _telemetry_plugins.erase(vehicle_id);
    _mission_plugins.erase(vehicle_id);
    _mavlink_passthrough_plugins.erase(vehicle_id);
    std::cout << "Removed vehicle: " << vehicle_id << std::endl;
}

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

std::string ConnectionManager::get_telemetry_data_json(const std::string& vehicle_id) const {
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
        bool connected = system->is_connected();

        // Derive ArduPilot flight mode name from last HEARTBEAT custom_mode when possible (QGC style)
        std::string mode_string = flight_mode_to_string(flight_mode);
        auto it_type = _last_mav_type.find(vehicle_id);
        auto it_cust = _last_custom_mode.find(vehicle_id);
        if (it_type != _last_mav_type.end() && it_cust != _last_custom_mode.end()) {
            uint8_t mav_type = it_type->second;
            uint32_t cm = it_cust->second;
            switch (mav_type) {
                case MAV_TYPE_FIXED_WING: {
                    // ArduPlane
                    switch (cm) {
                        case 0: mode_string = "MANUAL"; break;
                        case 1: mode_string = "CIRCLE"; break;
                        case 2: mode_string = "STABILIZE"; break;
                        case 4: mode_string = "ACRO"; break;
                        case 5: mode_string = "FBWA"; break;
                        case 6: mode_string = "FBWB"; break;
                        case 7: mode_string = "CRUISE"; break;
                        case 8: mode_string = "AUTOTUNE"; break;
                        case 9: mode_string = "LAND"; break;
                        case 10: mode_string = "AUTO"; break;
                        case 11: mode_string = "RTL"; break;
                        case 12: mode_string = "LOITER"; break;
                        case 13: mode_string = "TAKEOFF"; break;
                        case 15: mode_string = "GUIDED"; break;
                        default: break;
                    }
                    break;
                }
                case MAV_TYPE_QUADROTOR:
                case MAV_TYPE_HELICOPTER:
                case MAV_TYPE_HEXAROTOR:
                case MAV_TYPE_OCTOROTOR:
                case MAV_TYPE_TRICOPTER:
                case MAV_TYPE_COAXIAL:
                case MAV_TYPE_VTOL_TAILSITTER_DUOROTOR:
                case MAV_TYPE_VTOL_TAILSITTER_QUADROTOR:
                case MAV_TYPE_VTOL_TILTROTOR: {
                    // ArduCopter
                    switch (cm) {
                        case 0: mode_string = "STABILIZE"; break;
                        case 1: mode_string = "ACRO"; break;
                        case 2: mode_string = "ALTHOLD"; break;
                        case 3: mode_string = "AUTO"; break;
                        case 4: mode_string = "GUIDED"; break;
                        case 5: mode_string = "LOITER"; break;
                        case 6: mode_string = "RTL"; break;
                        case 7: mode_string = "CIRCLE"; break;
                        case 9: mode_string = "LAND"; break;
                        case 16: mode_string = "POSHOLD"; break;
                        default: break;
                    }
                    break;
                }
                case MAV_TYPE_GROUND_ROVER:
                case MAV_TYPE_SURFACE_BOAT: {
                    // ArduRover (subset)
                    switch (cm) {
                        case 0: mode_string = "MANUAL"; break;
                        case 1: mode_string = "ACRO"; break;
                        case 2: mode_string = "LEARNING"; break;
                        case 3: mode_string = "STEERING"; break;
                        case 4: mode_string = "HOLD"; break;
                        case 5: mode_string = "LOITER"; break;
                        case 10: mode_string = "AUTO"; break;
                        case 11: mode_string = "RTL"; break;
                        case 15: mode_string = "GUIDED"; break;
                        default: break;
                    }
                    break;
                }
                case MAV_TYPE_SUBMARINE: {
                    // ArduSub (subset)
                    switch (cm) {
                        case 0: mode_string = "STABILIZE"; break;
                        case 1: mode_string = "ACRO"; break;
                        case 2: mode_string = "DEPTH HOLD"; break;
                        case 3: mode_string = "AUTO"; break;
                        case 4: mode_string = "GUIDED"; break;
                        case 16: mode_string = "POSHOLD"; break;
                        default: break;
                    }
                    break;
                }
                default:
                    break;
            }
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
    if (!_mission_plugins.count(vehicle_id)) return false;

    mavsdk::Mission::MissionPlan mission_plan;
    for (const auto& item_json : mission_json["items"]) {
        mavsdk::Mission::MissionItem new_item;
        new_item.latitude_deg = item_json.value("lat", 0.0);
        new_item.longitude_deg = item_json.value("lng", 0.0);
        new_item.relative_altitude_m = item_json.value("alt", 0.0f);
        mission_plan.mission_items.push_back(new_item);
    }

    std::promise<mavsdk::Mission::Result> prom;
    auto fut = prom.get_future();
    _mission_plugins.at(vehicle_id)->upload_mission_async(mission_plan, [&prom](mavsdk::Mission::Result result) {
        prom.set_value(result);
    });

    if (fut.wait_for(std::chrono::seconds(10)) == std::future_status::timeout) {
        return false;
    }
    return fut.get() == mavsdk::Mission::Result::Success;
}

void ConnectionManager::start_mission(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (_mission_plugins.count(vehicle_id)) {
        _mission_plugins.at(vehicle_id)->start_mission_async(nullptr);
    }
}

void ConnectionManager::clear_mission(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (_mission_plugins.count(vehicle_id)) {
        _mission_plugins.at(vehicle_id)->clear_mission_async(nullptr);
    }
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
        case MAVLINK_MSG_ID_COMMAND_ACK: {
            mavlink_command_ack_t ack;
            mavlink_msg_command_ack_decode(&message, &ack);
            {
                std::lock_guard<std::mutex> lock(_mutex);
                _last_ack_command[vehicle_id] = ack.command;
                _last_ack_result[vehicle_id] = ack.result;
            }
            _ack_cv.notify_all();
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
    
    mavlink_message_t msg;
    mavlink_msg_command_long_pack(
        passthrough->get_our_sysid(),
        passthrough->get_our_compid(),
        &msg,
        system->get_system_id(),
        0, // target component
        MAV_CMD_NAV_TAKEOFF,
        0, // confirmation
        15.0f, // param1: pitch
        0.0f,  // param2: unused
        0.0f,  // param3: unused
        0.0f,  // param4: yaw
        0.0f,  // param5: latitude
        0.0f,  // param6: longitude
        50.0f  // param7: altitude
    );
    
    auto result = passthrough->send_message(msg);
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
    
    mavlink_message_t msg;
    mavlink_msg_command_long_pack(
        passthrough->get_our_sysid(),
        passthrough->get_our_compid(),
        &msg,
        system->get_system_id(),
        0, // target component
        MAV_CMD_NAV_LAND,
        0, // confirmation
        0.0f, // param1: abort altitude
        0.0f, // param2: unused
        0.0f, // param3: unused
        0.0f, // param4: yaw
        0.0f, // param5: latitude
        0.0f, // param6: longitude
        0.0f  // param7: altitude
    );
    
    auto result = passthrough->send_message(msg);
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
    
    mavlink_message_t msg;
    mavlink_msg_command_long_pack(
        passthrough->get_our_sysid(),
        passthrough->get_our_compid(),
        &msg,
        system->get_system_id(),
        0, // target component
        MAV_CMD_NAV_RETURN_TO_LAUNCH,
        0, // confirmation
        0.0f, // param1: unused
        0.0f, // param2: unused
        0.0f, // param3: unused
        0.0f, // param4: unused
        0.0f, // param5: unused
        0.0f, // param6: unused
        0.0f  // param7: unused
    );
    
    auto result = passthrough->send_message(msg);
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
    
    mavlink_message_t msg;
    mavlink_msg_command_long_pack(
        passthrough->get_our_sysid(),
        passthrough->get_our_compid(),
        &msg,
        system->get_system_id(),
        0, // target component
        MAV_CMD_DO_PAUSE_CONTINUE,
        0, // confirmation
        0.0f, // param1: 0=pause, 1=continue
        0.0f, // param2: unused
        0.0f, // param3: unused
        0.0f, // param4: unused
        0.0f, // param5: unused
        0.0f, // param6: unused
        0.0f  // param7: unused
    );
    
    auto result = passthrough->send_message(msg);
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
        mavlink_message_t cmd_msg;
        mavlink_msg_command_long_pack(
            passthrough->get_our_sysid(),
            passthrough->get_our_compid(),
            &cmd_msg,
            system->get_system_id(),
            MAV_COMP_ID_AUTOPILOT1, // target component
            MAV_CMD_DO_SET_MODE,
            0, // confirmation
            static_cast<float>(MAV_MODE_FLAG_CUSTOM_MODE_ENABLED), // param1: only custom enabled
            static_cast<float>(custom_mode),                       // param2: custom mode
            0.0f, 0.0f, 0.0f, 0.0f, 0.0f
        );
        auto res_cmd = passthrough->send_message(cmd_msg);
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
            mavlink_message_t set_mode_msg;
            mavlink_msg_set_mode_pack(
                passthrough->get_our_sysid(),
                passthrough->get_our_compid(),
                &set_mode_msg,
                system->get_system_id(),
                preserved_base_mode,
                custom_mode
            );
            auto res_set = passthrough->send_message(set_mode_msg);
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
    if (!_mavlink_passthrough_plugins.count(vehicle_id)) {
        std::cerr << "Vehicle " << vehicle_id << " not found for arm command" << std::endl;
        return false;
    }
    
    auto passthrough = _mavlink_passthrough_plugins[vehicle_id];
    auto system = _systems[vehicle_id];
    
    mavlink_message_t msg;
    mavlink_msg_command_long_pack(
        passthrough->get_our_sysid(),
        passthrough->get_our_compid(),
        &msg,
        system->get_system_id(),
        0, // target component
        MAV_CMD_COMPONENT_ARM_DISARM,
        0, // confirmation
        1.0f, // param1: arm (1 = arm, 0 = disarm)
        0.0f, // param2: unused
        0.0f, // param3: unused
        0.0f, // param4: unused
        0.0f, // param5: unused
        0.0f, // param6: unused
        0.0f  // param7: unused
    );
    
    auto result = passthrough->send_message(msg);
    std::cout << "Arm command sent to " << vehicle_id << ": " << (result == mavsdk::MavlinkPassthrough::Result::Success ? "SUCCESS" : "FAILED") << std::endl;
    return result == mavsdk::MavlinkPassthrough::Result::Success;
}

bool ConnectionManager::send_disarm_command(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (!_mavlink_passthrough_plugins.count(vehicle_id)) {
        std::cerr << "Vehicle " << vehicle_id << " not found for disarm command" << std::endl;
        return false;
    }
    
    auto passthrough = _mavlink_passthrough_plugins[vehicle_id];
    auto system = _systems[vehicle_id];
    
    mavlink_message_t msg;
    mavlink_msg_command_long_pack(
        passthrough->get_our_sysid(),
        passthrough->get_our_compid(),
        &msg,
        system->get_system_id(),
        0, // target component
        MAV_CMD_COMPONENT_ARM_DISARM,
        0, // confirmation
        0.0f, // param1: disarm (1 = arm, 0 = disarm)
        0.0f, // param2: unused
        0.0f, // param3: unused
        0.0f, // param4: unused
        0.0f, // param5: unused
        0.0f, // param6: unused
        0.0f  // param7: unused
    );
    
    auto result = passthrough->send_message(msg);
    std::cout << "Disarm command sent to " << vehicle_id << ": " << (result == mavsdk::MavlinkPassthrough::Result::Success ? "SUCCESS" : "FAILED") << std::endl;
    return result == mavsdk::MavlinkPassthrough::Result::Success;
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
    mavlink_message_t msg;
    char param_id[16] = {0};
    strncpy(param_id, name.c_str(), 15);
    
    mavlink_msg_param_set_pack(
        passthrough->get_our_sysid(),
        passthrough->get_our_compid(),
        &msg,
        system->get_system_id(),
        0, // target component
        param_id,
        static_cast<float>(value),
        MAV_PARAM_TYPE_REAL32 // Assume float for now
    );
    
    auto result = passthrough->send_message(msg);
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
    
    mavlink_message_t msg;
    bool success = false;
    
    try {
        if (message_type == "HEARTBEAT") {
            mavlink_msg_heartbeat_pack(
                passthrough->get_our_sysid(),
                passthrough->get_our_compid(),
                &msg,
                static_cast<uint8_t>(parameters.value("type", 1)),
                static_cast<uint8_t>(parameters.value("autopilot", 3)),
                static_cast<uint8_t>(parameters.value("base_mode", 0)),
                static_cast<uint32_t>(parameters.value("custom_mode", 0)),
                static_cast<uint8_t>(parameters.value("system_status", 3))
            );
            success = true;
        }
        else if (message_type == "COMMAND_LONG") {
            mavlink_msg_command_long_pack(
                passthrough->get_our_sysid(),
                passthrough->get_our_compid(),
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
            success = true;
        }
        else if (message_type == "SET_MODE") {
            mavlink_msg_set_mode_pack(
                passthrough->get_our_sysid(),
                passthrough->get_our_compid(),
                &msg,
                static_cast<uint8_t>(parameters.value("target_system", 1)),
                static_cast<uint8_t>(parameters.value("base_mode", 0)),
                static_cast<uint32_t>(parameters.value("custom_mode", 0))
            );
            success = true;
        }
        else if (message_type == "PARAM_SET") {
            char param_id[16] = {0};
            std::string param_id_str = parameters.value("param_id", "");
            strncpy(param_id, param_id_str.c_str(), 15);
            
            mavlink_msg_param_set_pack(
                passthrough->get_our_sysid(),
                passthrough->get_our_compid(),
                &msg,
                static_cast<uint8_t>(parameters.value("target_system", 1)),
                static_cast<uint8_t>(parameters.value("target_component", 1)),
                param_id,
                static_cast<float>(parameters.value("param_value", 0)),
                static_cast<uint8_t>(parameters.value("param_type", 9))
            );
            success = true;
        }
        else if (message_type == "PARAM_REQUEST_READ") {
            char param_id[16] = {0};
            std::string param_id_str = parameters.value("param_id", "");
            strncpy(param_id, param_id_str.c_str(), 15);
            
            mavlink_msg_param_request_read_pack(
                passthrough->get_our_sysid(),
                passthrough->get_our_compid(),
                &msg,
                static_cast<uint8_t>(parameters.value("target_system", 1)),
                static_cast<uint8_t>(parameters.value("target_component", 1)),
                param_id,
                static_cast<int16_t>(parameters.value("param_index", -1))
            );
            success = true;
        }
        else if (message_type == "COMMAND_ACK") {
            mavlink_msg_command_ack_pack(
                passthrough->get_our_sysid(),
                passthrough->get_our_compid(),
                &msg,
                static_cast<uint16_t>(parameters.value("command", 0)),
                static_cast<uint8_t>(parameters.value("result", 0)),
                static_cast<uint8_t>(parameters.value("progress", 0)),
                static_cast<int32_t>(parameters.value("result_param2", 0)),
                static_cast<uint8_t>(parameters.value("target_system", 0)),
                static_cast<uint8_t>(parameters.value("target_component", 0))
            );
            success = true;
        }
        else if (message_type == "STATUSTEXT") {
            char text[50] = {0};
            std::string text_str = parameters.value("text", "Test message");
            strncpy(text, text_str.c_str(), 49);
            
            mavlink_msg_statustext_pack(
                passthrough->get_our_sysid(),
                passthrough->get_our_compid(),
                &msg,
                static_cast<uint8_t>(parameters.value("severity", 6)),
                text,
                static_cast<uint16_t>(parameters.value("id", 0)),
                static_cast<uint8_t>(parameters.value("chunk_seq", 0))
            );
            success = true;
        }
        
        if (success) {
            auto result = passthrough->send_message(msg);
            success = (result == mavsdk::MavlinkPassthrough::Result::Success);
            std::cout << "MAVLink message " << message_type << " sent to " << vehicle_id << ": " << (success ? "SUCCESS" : "FAILED") << std::endl;
        } else {
            std::cerr << "Unsupported message type: " << message_type << std::endl;
        }
    } catch (const std::exception& e) {
        std::cerr << "Error sending MAVLink message: " << e.what() << std::endl;
        success = false;
    }
    
    return success;
}
// --- End Jeremy patch for MAVLink message sending implementation --- 