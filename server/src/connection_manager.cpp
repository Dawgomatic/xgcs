#include "connection_manager.hpp"
#include <future>

ConnectionManager& ConnectionManager::instance() {
    static ConnectionManager instance;
    return instance;
}

bool ConnectionManager::add_vehicle(const std::string& vehicle_id,
                                  const std::string& connection_url,
                                  const std::string& vehicle_type) {
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