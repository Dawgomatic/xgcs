#include "connection_manager.hpp"
#include <future>
#include <iostream>
#include <nlohmann/json.hpp>
#include <thread>
#include <chrono>

using json = nlohmann::json;

std::string flight_mode_to_string(mavsdk::Telemetry::FlightMode mode) {
    switch (mode) {
        case mavsdk::Telemetry::FlightMode::Ready:
            return "Ready";
        case mavsdk::Telemetry::FlightMode::Takeoff:
            return "Takeoff";
        case mavsdk::Telemetry::FlightMode::Hold:
            return "Hold";
        case mavsdk::Telemetry::FlightMode::Mission:
            return "Mission";
        case mavsdk::Telemetry::FlightMode::ReturnToLaunch:
            return "Return to Launch";
        case mavsdk::Telemetry::FlightMode::Land:
            return "Land";
        case mavsdk::Telemetry::FlightMode::Offboard:
            return "Offboard";
        case mavsdk::Telemetry::FlightMode::FollowMe:
            return "Follow Me";
        case mavsdk::Telemetry::FlightMode::Manual:
            return "Manual";
        case mavsdk::Telemetry::FlightMode::Altctl:
            return "Altitude Control";
        case mavsdk::Telemetry::FlightMode::Posctl:
            return "Position Control";
        case mavsdk::Telemetry::FlightMode::Acro:
            return "Acro";
        case mavsdk::Telemetry::FlightMode::Stabilized:
            return "Stabilized";
        case mavsdk::Telemetry::FlightMode::Rattitude:
            return "Rattitude";
        default:
            return "Unknown";
    }
}

ConnectionManager::ConnectionManager() 
    : _mavsdk(mavsdk::Mavsdk::Configuration(mavsdk::ComponentType::GroundStation))
{
    std::cout << "ConnectionManager initialized" << std::endl;
    
    // Add error subscription
    _mavsdk.subscribe_connection_errors([](mavsdk::Mavsdk::ConnectionError error) {
        std::cerr << "MAVSDK connection error: " << error.error_description << std::endl;
    });
    
    // Log when systems are discovered
    _mavsdk.subscribe_on_new_system([this]() {
        auto systems = _mavsdk.systems();
        std::cout << "New system discovered. Total systems: " << systems.size() << std::endl;
        for (auto& system : systems) {
            std::cout << "  System connected: " << system->is_connected() << std::endl;
        }
    });
}

ConnectionManager& ConnectionManager::instance() {
    static ConnectionManager instance;
    return instance;
}

bool ConnectionManager::add_vehicle(const std::string& vehicle_id,
                                  const std::string& connection_url,
                                  const std::string& vehicle_type) {
    std::cout << "Adding vehicle: " << vehicle_id << " with URL: " << connection_url << std::endl;
    
    std::lock_guard<std::mutex> lock(_mutex);
    
    // Check if vehicle already exists
    if (_vehicle_info.find(vehicle_id) != _vehicle_info.end()) {
        return false;
    }
    
    auto [result, handle] = _mavsdk.add_any_connection_with_handle(connection_url);
    if (result != mavsdk::ConnectionResult::Success) {
        std::cerr << "Failed to add connection: " << connection_url << std::endl;
        return false;
    }
    
    _connections[vehicle_id] = handle;
    _vehicle_info[vehicle_id] = VehicleInfo{
        connection_url,
        vehicle_type,
        connection_url.substr(0, connection_url.find(":")),
        false
    };
    
    // Setup system discovery
    auto prom = std::make_shared<std::promise<std::shared_ptr<mavsdk::System>>>();
    auto fut = prom->get_future();
    
    _mavsdk.subscribe_on_new_system([this, prom, vehicle_id]() {
        auto system = _mavsdk.systems().back();
        if (system->has_autopilot()) {
            _systems[vehicle_id] = system;
            _vehicle_info[vehicle_id].is_connected = true;
            prom->set_value(system);
            
            // Initialize telemetry plugin for this system
            _telemetry_plugins[vehicle_id] = std::make_shared<mavsdk::Telemetry>(system);
            
            // Start telemetry console output
            start_telemetry_console_output(vehicle_id);
        }
    });
    
    return true;
}

bool ConnectionManager::is_vehicle_connected(const std::string& vehicle_id) const {
    std::lock_guard<std::mutex> lock(_mutex);
    auto it = _vehicle_info.find(vehicle_id);
    return it != _vehicle_info.end() && it->second.is_connected;
}

void ConnectionManager::remove_vehicle(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    
    auto it = _connections.find(vehicle_id);
    if (it != _connections.end()) {
        _mavsdk.remove_connection(it->second);
        _connections.erase(it);
    }
    
    _vehicle_info.erase(vehicle_id);
    _systems.erase(vehicle_id);
    _telemetry_plugins.erase(vehicle_id);
}

std::vector<std::string> ConnectionManager::get_connected_vehicles() const {
    std::lock_guard<std::mutex> lock(_mutex);
    
    std::vector<std::string> connected_vehicles;
    for (const auto& [id, info] : _vehicle_info) {
        if (info.is_connected) {
            connected_vehicles.push_back(id);
        }
    }
    
    return connected_vehicles;
}

void ConnectionManager::start_telemetry_console_output(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    
    auto it = _telemetry_plugins.find(vehicle_id);
    if (it == _telemetry_plugins.end()) {
        std::cerr << "No telemetry plugin for vehicle: " << vehicle_id << std::endl;
        return;
    }
    
    auto telemetry = it->second;
    
    // Set up position subscription
    telemetry->subscribe_position([vehicle_id](mavsdk::Telemetry::Position position) {
        std::cout << "[" << vehicle_id << "] Position: "
                  << "Lat: " << position.latitude_deg << "°, "
                  << "Lon: " << position.longitude_deg << "°, "
                  << "Alt: " << position.relative_altitude_m << "m" << std::endl;
    });
    
    // Set up attitude subscription
    telemetry->subscribe_attitude_euler([vehicle_id](mavsdk::Telemetry::EulerAngle euler) {
        std::cout << "[" << vehicle_id << "] Attitude: "
                  << "Roll: " << euler.roll_deg << "°, "
                  << "Pitch: " << euler.pitch_deg << "°, "
                  << "Yaw: " << euler.yaw_deg << "°" << std::endl;
    });
    
    // Set up battery subscription
    telemetry->subscribe_battery([vehicle_id](mavsdk::Telemetry::Battery battery) {
        std::cout << "[" << vehicle_id << "] Battery: "
                  << battery.voltage_v << "V, "
                  << battery.remaining_percent * 100.0f << "%" << std::endl;
    });
    
    // Set up flight mode subscription
    telemetry->subscribe_flight_mode([vehicle_id](mavsdk::Telemetry::FlightMode mode) {
        std::cout << "[" << vehicle_id << "] Flight mode: " << flight_mode_to_string(mode) << std::endl;
    });
    
    // Set up armed status subscription
    telemetry->subscribe_armed([vehicle_id](bool armed) {
        std::cout << "[" << vehicle_id << "] Armed: " << (armed ? "Yes" : "No") << std::endl;
    });
    
    // Set up health subscription
    telemetry->subscribe_health([vehicle_id](mavsdk::Telemetry::Health health) {
        std::cout << "[" << vehicle_id << "] Health: "
                  << "Gyro: " << (health.is_gyrometer_calibration_ok ? "OK" : "NOT OK") << ", "
                  << "Accel: " << (health.is_accelerometer_calibration_ok ? "OK" : "NOT OK") << ", "
                  << "Mag: " << (health.is_magnetometer_calibration_ok ? "OK" : "NOT OK") << ", "
                  << "GPS: " << (health.is_local_position_ok ? "OK" : "NOT OK") << std::endl;
    });
    
    std::cout << "Started telemetry output for vehicle: " << vehicle_id << std::endl;
}

std::string ConnectionManager::get_telemetry_data_json(const std::string& vehicle_id) const {
    std::lock_guard<std::mutex> lock(_mutex);
    
    auto it = _telemetry_plugins.find(vehicle_id);
    if (it == _telemetry_plugins.end()) {
        return "{}";  // Return empty JSON object as string
    }
    
    auto telemetry = it->second;
    
    // Get the latest telemetry data
    auto position = telemetry->position();
    auto attitude = telemetry->attitude_euler();
    auto battery = telemetry->battery();
    auto flight_mode = telemetry->flight_mode();
    auto armed = telemetry->armed();
    auto health = telemetry->health();
    
    // Create a JSON object with the telemetry data
    nlohmann::json telemetry_json = {
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
            {"remaining", battery.remaining_percent * 100.0f}
        }},
        {"flight_mode", flight_mode_to_string(flight_mode)},
        {"armed", armed},
        {"health", {
            {"gyro_ok", health.is_gyrometer_calibration_ok},
            {"accel_ok", health.is_accelerometer_calibration_ok},
            {"mag_ok", health.is_magnetometer_calibration_ok},
            {"gps_ok", health.is_local_position_ok}
        }}
    };
    
    return telemetry_json.dump();  // Return as JSON string
}

ConnectionManager::TelemetryData ConnectionManager::get_telemetry_data(const std::string& vehicle_id) const {
    std::lock_guard<std::mutex> lock(_mutex);
    
    TelemetryData data;
    
    auto it = _telemetry_plugins.find(vehicle_id);
    if (it == _telemetry_plugins.end()) {
        return data;  // Return empty data
    }
    
    auto telemetry = it->second;
    
    // Get the latest telemetry data
    auto position = telemetry->position();
    auto attitude = telemetry->attitude_euler();
    
    // Fill the struct
    data.position.lat = position.latitude_deg;
    data.position.lng = position.longitude_deg;
    data.position.alt = position.relative_altitude_m;
    
    data.attitude.roll = attitude.roll_deg;
    data.attitude.pitch = attitude.pitch_deg;
    data.attitude.yaw = attitude.yaw_deg;
    
    return data;
} 