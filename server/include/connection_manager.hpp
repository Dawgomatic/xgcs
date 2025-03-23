#pragma once
#include <mavsdk/mavsdk.h>
#include <unordered_map>
#include <memory>
#include <string>
#include <mutex>

struct VehicleInfo {
    std::string connection_url;
    std::string vehicle_type;
    std::string connection_type;
    bool is_connected{false};
};

class ConnectionManager {
public:
    static ConnectionManager& instance();
    
    // Add new vehicle connection
    bool add_vehicle(const std::string& vehicle_id, 
                    const std::string& connection_url,
                    const std::string& vehicle_type);
    
    // Remove vehicle connection
    void remove_vehicle(const std::string& vehicle_id);
    
    // Get vehicle connection status
    bool is_vehicle_connected(const std::string& vehicle_id) const;
    
    // Get all connected vehicles
    std::vector<std::string> get_connected_vehicles() const;
    
    // Subscribe to telemetry for specific vehicle
    bool subscribe_telemetry(const std::string& vehicle_id, 
                           std::function<void(const std::string&)> callback);

private:
    ConnectionManager() = default;
    
    std::unordered_map<std::string, std::shared_ptr<mavsdk::System>> _systems;
    std::unordered_map<std::string, VehicleInfo> _vehicle_info;
    std::unordered_map<std::string, mavsdk::Mavsdk::ConnectionHandle> _connections;
    
    mutable std::mutex _mutex;
    mavsdk::Mavsdk _mavsdk{mavsdk::Mavsdk::Configuration{mavsdk::ComponentType::GroundStation}};
}; 