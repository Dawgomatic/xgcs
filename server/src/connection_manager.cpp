#include "connection_manager.hpp"
#include <future>
#include <iostream>

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