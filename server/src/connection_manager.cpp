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
            {"armed", armed}
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