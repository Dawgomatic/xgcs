#include "connection_manager.hpp"
#include <iostream>
#include <future>
#include <chrono>
#include <atomic>

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
    _telemetry_plugins[vehicle_id]->set_rate_position(10.0);

    std::cout << "Vehicle " << vehicle_id << " connected." << std::endl;
    return true;
}

void ConnectionManager::remove_vehicle(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    _systems.erase(vehicle_id);
    _telemetry_plugins.erase(vehicle_id);
    _mission_plugins.erase(vehicle_id);
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
            {"flight_mode", flight_mode_to_string(flight_mode)},
            {"armed", armed},
            {"velocity", {
                {"airspeed", velocity.north_m_s},
                {"groundspeed", velocity.east_m_s},
                {"heading", velocity.down_m_s}
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
    
    // Subscribe to attitude messages
    auto telemetry = _telemetry_plugins[vehicle_id];
    if (telemetry) {
        auto system = _systems[vehicle_id];
        uint8_t system_id = system->get_system_id();
        auto component_ids = system->component_ids();
        uint8_t component_id = component_ids.empty() ? 1 : component_ids[0];
        telemetry->subscribe_attitude_euler([this, vehicle_id, system_id, component_id](mavsdk::Telemetry::EulerAngle attitude) {
            if (_streaming_active[vehicle_id]) {
                json msg = {
                    {"msgName", "ATTITUDE"},
                    {"timestamp", std::chrono::duration_cast<std::chrono::milliseconds>(
                        std::chrono::system_clock::now().time_since_epoch()).count()},
                    {"fields", {
                        {"roll_deg", attitude.roll_deg},
                        {"pitch_deg", attitude.pitch_deg},
                        {"yaw_deg", attitude.yaw_deg}
                    }},
                    {"system_id", system_id},
                    {"component_id", component_id}
                };
                
                std::lock_guard<std::mutex> lock(_mutex);
                _mavlink_messages[vehicle_id].push(msg);
                
                if (_mavlink_messages[vehicle_id].size() > 100) {
                    _mavlink_messages[vehicle_id].pop();
                }
            }
        });
        
        // Subscribe to position messages
        telemetry->subscribe_position([this, vehicle_id, system_id, component_id](mavsdk::Telemetry::Position position) {
            if (_streaming_active[vehicle_id]) {
                json msg = {
                    {"msgName", "GPS_RAW_INT"},
                    {"timestamp", std::chrono::duration_cast<std::chrono::milliseconds>(
                        std::chrono::system_clock::now().time_since_epoch()).count()},
                    {"fields", {
                        {"lat", position.latitude_deg},
                        {"lon", position.longitude_deg},
                        {"alt", position.relative_altitude_m}
                    }},
                    {"system_id", system_id},
                    {"component_id", component_id}
                };
                
                std::lock_guard<std::mutex> lock(_mutex);
                _mavlink_messages[vehicle_id].push(msg);
                
                if (_mavlink_messages[vehicle_id].size() > 100) {
                    _mavlink_messages[vehicle_id].pop();
                }
            }
        });
        
        // Subscribe to battery messages
        telemetry->subscribe_battery([this, vehicle_id, system_id, component_id](mavsdk::Telemetry::Battery battery) {
            if (_streaming_active[vehicle_id]) {
                json msg = {
                    {"msgName", "SYS_STATUS"},
                    {"timestamp", std::chrono::duration_cast<std::chrono::milliseconds>(
                        std::chrono::system_clock::now().time_since_epoch()).count()},
                    {"fields", {
                        {"voltage_battery", battery.voltage_v},
                        {"battery_remaining", battery.remaining_percent}
                    }},
                    {"system_id", system_id},
                    {"component_id", component_id}
                };
                
                std::lock_guard<std::mutex> lock(_mutex);
                _mavlink_messages[vehicle_id].push(msg);
                
                if (_mavlink_messages[vehicle_id].size() > 100) {
                    _mavlink_messages[vehicle_id].pop();
                }
            }
        });

        // Subscribe to velocity messages
        telemetry->subscribe_velocity_ned([this, vehicle_id, system_id, component_id](mavsdk::Telemetry::VelocityNed velocity) {
            if (_streaming_active[vehicle_id]) {
                json msg = {
                    {"msgName", "VFR_HUD"},
                    {"timestamp", std::chrono::duration_cast<std::chrono::milliseconds>(
                        std::chrono::system_clock::now().time_since_epoch()).count()},
                    {"fields", {
                        {"airspeed", velocity.north_m_s},
                        {"groundspeed", velocity.east_m_s},
                        {"heading", velocity.down_m_s}
                    }},
                    {"system_id", system_id},
                    {"component_id", component_id}
                };
                
                std::lock_guard<std::mutex> lock(_mutex);
                _mavlink_messages[vehicle_id].push(msg);
                
                if (_mavlink_messages[vehicle_id].size() > 100) {
                    _mavlink_messages[vehicle_id].pop();
                }
            }
        });

        // Subscribe to GPS info
        telemetry->subscribe_gps_info([this, vehicle_id, system_id, component_id](mavsdk::Telemetry::GpsInfo gps_info) {
            if (_streaming_active[vehicle_id]) {
                json msg = {
                    {"msgName", "GPS_STATUS"},
                    {"timestamp", std::chrono::duration_cast<std::chrono::milliseconds>(
                        std::chrono::system_clock::now().time_since_epoch()).count()},
                    {"fields", {
                        {"satellites_visible", gps_info.num_satellites},
                        {"fix_type", static_cast<int>(gps_info.fix_type)}
                    }},
                    {"system_id", system_id},
                    {"component_id", component_id}
                };
                
                std::lock_guard<std::mutex> lock(_mutex);
                _mavlink_messages[vehicle_id].push(msg);
                
                if (_mavlink_messages[vehicle_id].size() > 100) {
                    _mavlink_messages[vehicle_id].pop();
                }
            }
        });

        // Subscribe to flight mode
        telemetry->subscribe_flight_mode([this, vehicle_id, system_id, component_id](mavsdk::Telemetry::FlightMode flight_mode) {
            if (_streaming_active[vehicle_id]) {
                json msg = {
                    {"msgName", "HEARTBEAT"},
                    {"timestamp", std::chrono::duration_cast<std::chrono::milliseconds>(
                        std::chrono::system_clock::now().time_since_epoch()).count()},
                    {"fields", {
                        {"custom_mode", static_cast<int>(flight_mode)},
                        {"type", 2}, // MAV_TYPE_QUADROTOR
                        {"autopilot", 12}, // MAV_AUTOPILOT_PX4
                        {"base_mode", 81}, // MAV_MODE_FLAG_SAFETY_ARMED | MAV_MODE_FLAG_STABILIZATION_ENABLED
                        {"system_id", system_id},
                        {"component_id", component_id}
                    }}
                };
                
                std::lock_guard<std::mutex> lock(_mutex);
                _mavlink_messages[vehicle_id].push(msg);
                
                if (_mavlink_messages[vehicle_id].size() > 100) {
                    _mavlink_messages[vehicle_id].pop();
                }
            }
        });

        // Subscribe to armed status
        telemetry->subscribe_armed([this, vehicle_id, system_id, component_id](bool armed) {
            if (_streaming_active[vehicle_id]) {
                json msg = {
                    {"msgName", "HEARTBEAT"},
                    {"timestamp", std::chrono::duration_cast<std::chrono::milliseconds>(
                        std::chrono::system_clock::now().time_since_epoch()).count()},
                    {"fields", {
                        {"base_mode", armed ? 81 : 80}, // MAV_MODE_FLAG_SAFETY_ARMED when armed
                        {"custom_mode", 0},
                        {"type", 2}, // MAV_TYPE_QUADROTOR
                        {"autopilot", 12}, // MAV_AUTOPILOT_PX4
                        {"system_id", system_id},
                        {"component_id", component_id}
                    }}
                };
                
                std::lock_guard<std::mutex> lock(_mutex);
                _mavlink_messages[vehicle_id].push(msg);
                
                if (_mavlink_messages[vehicle_id].size() > 100) {
                    _mavlink_messages[vehicle_id].pop();
                }
            }
        });

        // Subscribe to RC channels
        telemetry->subscribe_rc_status([this, vehicle_id, system_id, component_id](mavsdk::Telemetry::RcStatus rc_status) {
            if (_streaming_active[vehicle_id]) {
                json msg = {
                    {"msgName", "RC_CHANNELS"},
                    {"timestamp", std::chrono::duration_cast<std::chrono::milliseconds>(
                        std::chrono::system_clock::now().time_since_epoch()).count()},
                    {"fields", {
                        {"available", rc_status.is_available},
                        {"rssi", rc_status.signal_strength_percent}
                    }},
                    {"system_id", system_id},
                    {"component_id", component_id}
                };
                
                std::lock_guard<std::mutex> lock(_mutex);
                _mavlink_messages[vehicle_id].push(msg);
                
                if (_mavlink_messages[vehicle_id].size() > 100) {
                    _mavlink_messages[vehicle_id].pop();
                }
            }
        });

        // Subscribe to attitude quaternion
        telemetry->subscribe_attitude_quaternion([this, vehicle_id, system_id, component_id](mavsdk::Telemetry::Quaternion quaternion) {
            if (_streaming_active[vehicle_id]) {
                json msg = {
                    {"msgName", "ATTITUDE_QUATERNION"},
                    {"timestamp", std::chrono::duration_cast<std::chrono::milliseconds>(
                        std::chrono::system_clock::now().time_since_epoch()).count()},
                    {"fields", {
                        {"q1", quaternion.w},
                        {"q2", quaternion.x},
                        {"q3", quaternion.y},
                        {"q4", quaternion.z}
                    }},
                    {"system_id", system_id},
                    {"component_id", component_id}
                };
                
                std::lock_guard<std::mutex> lock(_mutex);
                _mavlink_messages[vehicle_id].push(msg);
                
                if (_mavlink_messages[vehicle_id].size() > 100) {
                    _mavlink_messages[vehicle_id].pop();
                }
            }
        });

        // Subscribe to global position
        telemetry->subscribe_raw_gps([this, vehicle_id, system_id, component_id](mavsdk::Telemetry::RawGps raw_gps) {
            if (_streaming_active[vehicle_id]) {
                json msg = {
                    {"msgName", "GPS_RAW_INT"},
                    {"timestamp", std::chrono::duration_cast<std::chrono::milliseconds>(
                        std::chrono::system_clock::now().time_since_epoch()).count()},
                    {"fields", {
                        {"lat", raw_gps.latitude_deg * 1e7},
                        {"lon", raw_gps.longitude_deg * 1e7},
                        {"alt", raw_gps.absolute_altitude_m * 1000},
                        {"eph", raw_gps.hdop * 100},
                        {"epv", raw_gps.vdop * 100},
                        {"vel", raw_gps.velocity_m_s * 100},
                        {"cog", raw_gps.cog_deg * 100}
                    }},
                    {"system_id", system_id},
                    {"component_id", component_id}
                };
                
                std::lock_guard<std::mutex> lock(_mutex);
                _mavlink_messages[vehicle_id].push(msg);
                
                if (_mavlink_messages[vehicle_id].size() > 100) {
                    _mavlink_messages[vehicle_id].pop();
                }
            }
        });
    }
    
    std::cout << "Started MAVLink streaming for vehicle: " << vehicle_id << std::endl;
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