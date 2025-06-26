#pragma once

#include <mavsdk/mavsdk.h>
#include <mavsdk/plugins/mission/mission.h>
#include <mavsdk/plugins/telemetry/telemetry.h>
#include <nlohmann/json.hpp>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

using json = nlohmann::json;

class ConnectionManager {
public:
    static ConnectionManager& instance();

    ConnectionManager(const ConnectionManager&) = delete;
    void operator=(const ConnectionManager&) = delete;

    bool add_vehicle(const std::string& vehicle_id, const std::string& connection_url);
    void remove_vehicle(const std::string& vehicle_id);
    bool is_vehicle_connected(const std::string& vehicle_id) const;
    std::vector<std::string> get_connected_vehicles() const;
    std::string get_telemetry_data_json(const std::string& vehicle_id) const;

    // Mission Management
    bool upload_mission(const std::string& vehicle_id, const json& mission_json);
    void start_mission(const std::string& vehicle_id);
    void clear_mission(const std::string& vehicle_id);

private:
    ConnectionManager();
    ~ConnectionManager() = default;

    mavsdk::Mavsdk _mavsdk;
    mutable std::mutex _mutex;

    std::unordered_map<std::string, std::shared_ptr<mavsdk::System>> _systems;
    std::unordered_map<std::string, std::shared_ptr<mavsdk::Telemetry>> _telemetry_plugins;
    std::unordered_map<std::string, std::shared_ptr<mavsdk::Mission>> _mission_plugins;
}; 