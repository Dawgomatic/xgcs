#include "mavlink_streamer.h"
#include <mavsdk/plugins/telemetry/telemetry.h>
#include <thread>
#include <algorithm>

using json = nlohmann::json;
using namespace mavsdk;

MavlinkStreamer::MavlinkStreamer(crow::SimpleApp& app, Mavsdk& mavsdk)
    : app_(app), mavsdk_(mavsdk) {}

void MavlinkStreamer::register_vehicle(const std::string& vehicle_id, int tcp_port) {
    std::string conn_url = "tcp://127.0.0.1:" + std::to_string(tcp_port);
    mavsdk_.add_any_connection(conn_url);

    std::shared_ptr<System> system;
    for (int i = 0; i < 20; ++i) {
        if (!mavsdk_.systems().empty()) {
            system = mavsdk_.systems().at(0);
            break;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
    }
    if (!system) return;

    VehicleStream stream;
    stream.system = system;
    {
        std::lock_guard<std::mutex> lock(streams_mutex_);
        streams_[vehicle_id] = stream;
    }
    setup_ws_endpoint(vehicle_id);

    // Example: subscribe to attitude (expand for all messages or use raw MAVLink API)
    auto telemetry = std::make_shared<Telemetry>(*system);
    telemetry->subscribe_attitude_euler([this, vehicle_id](Telemetry::EulerAngle euler) {
        json msg = {
            {"msgName", "ATTITUDE"},
            {"fields", {{"roll_deg", euler.roll_deg}, {"pitch_deg", euler.pitch_deg}, {"yaw_deg", euler.yaw_deg}}},
            {"timestamp", std::chrono::system_clock::now().time_since_epoch().count()}
        };
        broadcast(vehicle_id, msg);
    });
    // TODO: Add more subscriptions or use MAVSDK's raw message API for full inspector.
}

void MavlinkStreamer::setup_ws_endpoint(const std::string& vehicle_id) {
    std::string endpoint = "/api/mavlink/stream/" + vehicle_id;
    CROW_ROUTE(app_, endpoint)
    .websocket()
    .onopen([this, vehicle_id](crow::websocket::connection& conn) {
        std::lock_guard<std::mutex> lock(streams_mutex_);
        streams_[vehicle_id].clients.push_back(&conn);
    })
    .onclose([this, vehicle_id](crow::websocket::connection& conn, const std::string&) {
        std::lock_guard<std::mutex> lock(streams_mutex_);
        auto& clients = streams_[vehicle_id].clients;
        clients.erase(std::remove(clients.begin(), clients.end(), &conn), clients.end());
    });
}

void MavlinkStreamer::broadcast(const std::string& vehicle_id, const json& msg) {
    std::lock_guard<std::mutex> lock(streams_mutex_);
    for (auto* ws : streams_[vehicle_id].clients) {
        ws->send_text(msg.dump());
    }
}

void MavlinkStreamer::unregister_vehicle(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(streams_mutex_);
    streams_.erase(vehicle_id);
} 