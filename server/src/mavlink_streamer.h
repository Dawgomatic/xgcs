#pragma once
#include <crow.h>
#include <mavsdk/mavsdk.h>
#include <nlohmann/json.hpp>
#include <memory>
#include <unordered_map>
#include <mutex>
#include <string>
#include <vector>

class MavlinkStreamer {
public:
    MavlinkStreamer(crow::SimpleApp& app, mavsdk::Mavsdk& mavsdk);
    void register_vehicle(const std::string& vehicle_id, int tcp_port);
    void unregister_vehicle(const std::string& vehicle_id);

private:
    struct VehicleStream {
        std::shared_ptr<mavsdk::System> system;
        std::vector<crow::websocket::connection*> clients;
        std::mutex clients_mutex;
        // Filtering: store allowed message types, etc.
    };

    crow::SimpleApp& app_;
    mavsdk::Mavsdk& mavsdk_;
    std::unordered_map<std::string, VehicleStream> streams_;
    std::mutex streams_mutex_;

    void setup_ws_endpoint(const std::string& vehicle_id);
    void broadcast(const std::string& vehicle_id, const nlohmann::json& msg);
}; 