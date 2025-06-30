#include <crow.h>
#include "connection_manager.hpp"
#include <nlohmann/json.hpp>
#include <iostream>
#include <crow/websocket.h>
#include <thread>
#include <unordered_map>
#include <mutex>
#include <algorithm>

using json = nlohmann::json;

// Global WebSocket connection store
std::unordered_map<std::string, std::vector<crow::websocket::connection*>> g_websocket_connections;
std::mutex g_websocket_mutex;
// Map from connection* to vehicleId (set after first message)
std::unordered_map<crow::websocket::connection*, std::string> g_conn_to_vehicle;

// WebSocket context for per-connection vehicleId
struct MavlinkWSContext {
    std::string vehicleId;
};

// Utility to extract vehicleId from path
std::string extract_vehicle_id_from_path(const std::string& path) {
    // Expected: /api/mavlink/stream/<vehicleId>
    auto pos = path.find_last_of('/');
    if (pos != std::string::npos && pos + 1 < path.size()) {
        return path.substr(pos + 1);
    }
    return "";
}

int main() {
    crow::SimpleApp app;

    app.loglevel(crow::LogLevel::Warning);  // Hide Info level logs

    // OPTIONS handler for all routes
    CROW_ROUTE(app, "/<path>")
    .methods("OPTIONS"_method)
    ([](const crow::request&, std::string) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        res.add_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.add_header("Access-Control-Allow-Headers", "Content-Type");
        res.code = 200;
        return res;
    });

    CROW_ROUTE(app, "/connect").methods("POST"_method)
    ([](const crow::request& req) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        try {
            auto params = json::parse(req.body);
            std::string ip = params["ip"].get<std::string>();
            int port = params["port"].get<int>();
            std::string vehicleId = params["name"].get<std::string>();
            
            // Trim whitespace from vehicleId
            vehicleId.erase(0, vehicleId.find_first_not_of(" \t\n\r"));
            vehicleId.erase(vehicleId.find_last_not_of(" \t\n\r") + 1);
            
            std::string connection_url = "tcp://" + ip + ":" + std::to_string(port);
            bool success = ConnectionManager::instance().add_vehicle(vehicleId, connection_url);
            
            json response_json = {
                {"success", success},
                {"message", success ? "Connected successfully" : "Connection failed"}
            };
            
            res.code = success ? 200 : 400;
            res.set_header("Content-Type", "application/json");
            res.body = response_json.dump();
            return res;
        } catch (const std::exception& e) {
            std::cerr << "Exception in /connect: " << e.what() << std::endl;
            
            json error_json = {
                {"success", false},
                {"message", std::string("Error: ") + e.what()}
            };
            
            res.code = 400;
            res.set_header("Content-Type", "application/json");
            res.body = error_json.dump();
            
            return res;
        }
    });

    CROW_ROUTE(app, "/disconnect").methods(crow::HTTPMethod::POST)
    ([](const crow::request& req) {
        try {
            auto params = json::parse(req.body);
            std::string vehicleId = params["name"].get<std::string>();
            
            // Trim whitespace from vehicleId
            vehicleId.erase(0, vehicleId.find_first_not_of(" \t\n\r"));
            vehicleId.erase(vehicleId.find_last_not_of(" \t\n\r") + 1);
            
            ConnectionManager::instance().remove_vehicle(vehicleId);
            
            json response_json = {
                {"success", true},
                {"message", "Disconnected successfully"}
            };
            
            crow::response resp;
            resp.code = 200;
            resp.set_header("Content-Type", "application/json");
            resp.body = response_json.dump();
            
            return resp;
        } catch (const std::exception& e) {
            std::cerr << "Exception in /disconnect: " << e.what() << std::endl;
            
            json error_json = {
                {"success", false},
                {"message", std::string("Error: ") + e.what()}
            };
            
            crow::response resp;
            resp.code = 400;
            resp.set_header("Content-Type", "application/json");
            resp.body = error_json.dump();
            
            return resp;
        }
    });

    CROW_ROUTE(app, "/vehicles")
    .methods("GET"_method)
    ([](const crow::request&) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        
        try {
            auto connectedVehicles = ConnectionManager::instance().get_connected_vehicles();
            
            json vehicles_json = json::array();
            for (const auto& vehicleId : connectedVehicles) {
                vehicles_json.push_back({{"id", vehicleId}});
            }
            
            json response_json = {
                {"vehicles", vehicles_json}
            };
            
            res.code = 200;
            res.set_header("Content-Type", "application/json");
            res.body = response_json.dump();
        } catch (const std::exception& e) {
            json error_json = {
                {"error", std::string("Error: ") + e.what()}
            };
            
            res.code = 500;
            res.set_header("Content-Type", "application/json");
            res.body = error_json.dump();
        }
        
        return res;
    });

    CROW_ROUTE(app, "/telemetry")
    .methods("GET"_method)
    ([](const crow::request& req) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        res.set_header("Content-Type", "application/json");

        try {
            auto vehicleId_ptr = req.url_params.get("vehicleId");
            
            if (!vehicleId_ptr) {
                res.code = 400;
                res.body = json{
                    {"success", false},
                    {"error", "Vehicle ID not provided"}
                }.dump();
                return res;
            }
            
            // Trim whitespace from vehicleId
            std::string vehicleId = vehicleId_ptr;
            vehicleId.erase(0, vehicleId.find_first_not_of(" \t\n\r"));
            vehicleId.erase(vehicleId.find_last_not_of(" \t\n\r") + 1);

            if (!ConnectionManager::instance().is_vehicle_connected(vehicleId)) {
                res.code = 404;
                res.body = json{
                    {"success", false},
                    {"error", "Vehicle not connected"},
                    {"vehicleId", vehicleId}
                }.dump();
                return res;
            }
            
            // Get real telemetry data from the vehicle as JSON string
            std::string telemetry_json_str = ConnectionManager::instance().get_telemetry_data_json(vehicleId);
            
            // Parse the JSON string
            json telemetry_data = json::parse(telemetry_json_str);
            telemetry_data["success"] = true;
            
            res.code = 200;
            res.body = telemetry_data.dump();
        } catch (const std::exception& e) {
            res.code = 500;
            res.body = json{
                {"success", false},
                {"error", std::string("Error: ") + e.what()}
            }.dump();
        }
        
        return res;
    });

    CROW_ROUTE(app, "/connections")
    .methods("GET"_method)
    ([](const crow::request&) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        
        try {
            auto& cm = ConnectionManager::instance();
            auto vehicles = cm.get_connected_vehicles();
            
            json connections_json = json::array();
            for (const auto& vehicle_id : vehicles) {
                // Get connection details if available
                connections_json.push_back({
                    {"id", vehicle_id},
                    {"connected", true}
                });
            }
            
            json response_json = {
                {"connections", connections_json}
            };
            
            res.code = 200;
            res.set_header("Content-Type", "application/json");
            res.body = response_json.dump();
        } catch (const std::exception& e) {
            json error_json = {
                {"error", std::string("Error: ") + e.what()}
            };
            
            res.code = 500;
            res.set_header("Content-Type", "application/json");
            res.body = error_json.dump();
        }
        
        return res;
    });

    CROW_ROUTE(app, "/mission/upload").methods("POST"_method)
    ([](const crow::request& req) {
        auto params = json::parse(req.body);
        std::string vehicleId = params["vehicleId"].get<std::string>();
        json missionJson = params["mission"];
        
        bool success = ConnectionManager::instance().upload_mission(vehicleId, missionJson);
        
        return crow::response(success ? 200 : 400, json{
            {"success", success},
            {"message", success ? "Mission uploaded" : "Mission upload failed"}
        }.dump());
    });

    CROW_ROUTE(app, "/mission/start").methods("POST"_method)
    ([](const crow::request& req) {
        auto params = json::parse(req.body);
        std::string vehicleId = params["vehicleId"].get<std::string>();
        ConnectionManager::instance().start_mission(vehicleId);
        return crow::response(200, json{{"success", true}}.dump());
    });

    CROW_ROUTE(app, "/mission/clear").methods("POST"_method)
    ([](const crow::request& req) {
        auto params = json::parse(req.body);
        std::string vehicleId = params["vehicleId"].get<std::string>();
        ConnectionManager::instance().clear_mission(vehicleId);
        return crow::response(200, json{{"success", true}}.dump());
    });

    // --- Jeremy: Add command endpoints for flight control ---
    CROW_ROUTE(app, "/api/command/takeoff").methods("POST"_method)
    ([](const crow::request& req) {
        auto params = json::parse(req.body);
        std::string vehicleId = params["vehicleId"].get<std::string>();
        bool success = ConnectionManager::instance().send_takeoff_command(vehicleId);
        return crow::response(200, json{{"success", success}}.dump());
    });

    CROW_ROUTE(app, "/api/command/land").methods("POST"_method)
    ([](const crow::request& req) {
        auto params = json::parse(req.body);
        std::string vehicleId = params["vehicleId"].get<std::string>();
        bool success = ConnectionManager::instance().send_land_command(vehicleId);
        return crow::response(200, json{{"success", success}}.dump());
    });

    CROW_ROUTE(app, "/api/command/rtl").methods("POST"_method)
    ([](const crow::request& req) {
        auto params = json::parse(req.body);
        std::string vehicleId = params["vehicleId"].get<std::string>();
        bool success = ConnectionManager::instance().send_rtl_command(vehicleId);
        return crow::response(200, json{{"success", success}}.dump());
    });

    CROW_ROUTE(app, "/api/command/pause").methods("POST"_method)
    ([](const crow::request& req) {
        auto params = json::parse(req.body);
        std::string vehicleId = params["vehicleId"].get<std::string>();
        bool success = ConnectionManager::instance().send_pause_command(vehicleId);
        return crow::response(200, json{{"success", success}}.dump());
    });

    CROW_ROUTE(app, "/api/command/set_mode").methods("POST"_method)
    ([](const crow::request& req) {
        // --- DEBUG LOGGING ---
        std::cout << "[DEBUG] /api/command/set_mode called" << std::endl;
        std::cout << "[DEBUG] Method code: " << static_cast<int>(req.method) << std::endl;
        std::cout << "[DEBUG] Headers:" << std::endl;
        for (const auto& h : req.headers) {
            std::cout << "    " << h.first << ": " << h.second << std::endl;
        }
        std::cout << "[DEBUG] Body: " << req.body << std::endl;
        // --- END DEBUG LOGGING ---
        auto params = json::parse(req.body);
        std::string vehicleId = params["vehicleId"].get<std::string>();
        std::string mode = params["mode"].get<std::string>();
        bool success = ConnectionManager::instance().send_set_mode_command(vehicleId, mode);
        return crow::response(200, json{{"success", success}}.dump());
    });
    // --- End Jeremy patch for command endpoints ---

    // --- Jeremy: Add parameter endpoints ---
    CROW_ROUTE(app, "/api/parameters").methods("GET"_method)
    ([](const crow::request& req) {
        std::string vehicleId = req.url_params.get("vehicleId");
        if (vehicleId.empty()) {
            return crow::response(400, json{{"success", false}, {"error", "vehicleId required"}}.dump());
        }
        
        auto result = ConnectionManager::instance().get_all_parameters(vehicleId);
        return crow::response(200, result);
    });

    CROW_ROUTE(app, "/api/parameters/set").methods("POST"_method)
    ([](const crow::request& req) {
        auto params = json::parse(req.body);
        std::string vehicleId = params["vehicleId"].get<std::string>();
        std::string name = params["name"].get<std::string>();
        double value = params["value"].get<double>();
        
        bool success = ConnectionManager::instance().set_parameter(vehicleId, name, value);
        return crow::response(200, json{{"success", success}}.dump());
    });
    // --- End Jeremy patch for parameter endpoints ---

    // --- Jeremy: Add MAVLink message sending endpoint ---
    CROW_ROUTE(app, "/api/mavlink/send").methods("POST"_method)
    ([](const crow::request& req) {
        auto params = json::parse(req.body);
        std::string vehicleId = params["vehicleId"].get<std::string>();
        std::string messageType = params["messageType"].get<std::string>();
        json parameters = params["parameters"];
        
        bool success = ConnectionManager::instance().send_mavlink_message(vehicleId, messageType, parameters);
        return crow::response(200, json{{"success", success}}.dump());
    });
    // --- End Jeremy patch for MAVLink message sending endpoint ---

    // MAVLink Streaming WebSocket endpoint
    CROW_WEBSOCKET_ROUTE(app, "/api/mavlink/stream")
    .onopen([&](crow::websocket::connection& conn) {
        // Do nothing. Wait for first message to get vehicleId.
    })
    .onclose([&](crow::websocket::connection& conn, const std::string& reason, uint16_t code) {
        std::string vehicleId;
        {
            std::lock_guard<std::mutex> lock(g_websocket_mutex);
            auto it = g_conn_to_vehicle.find(&conn);
            if (it != g_conn_to_vehicle.end()) {
                vehicleId = it->second;
                auto& connections = g_websocket_connections[vehicleId];
                connections.erase(std::remove(connections.begin(), connections.end(), &conn), connections.end());
                g_conn_to_vehicle.erase(it);
            }
        }
        if (!vehicleId.empty()) {
            std::cout << "WebSocket closed for vehicle: " << vehicleId << std::endl;
            ConnectionManager::instance().stop_mavlink_streaming(vehicleId);
        }
    })
    .onmessage([&](crow::websocket::connection& conn, const std::string& data, bool is_binary) {
        std::string vehicleId;
        {
            std::lock_guard<std::mutex> lock(g_websocket_mutex);
            auto it = g_conn_to_vehicle.find(&conn);
            if (it == g_conn_to_vehicle.end()) {
                // First message: treat as vehicleId
                vehicleId = data;
                g_conn_to_vehicle[&conn] = vehicleId;
                g_websocket_connections[vehicleId].push_back(&conn);
                std::cout << "WebSocket opened for vehicle: " << vehicleId << std::endl;
                ConnectionManager::instance().start_mavlink_streaming(vehicleId);
                return;
            } else {
                vehicleId = it->second;
            }
        }
        // No-op for subsequent messages
    });

    // Start a background thread to send MAVLink messages to WebSocket clients
    std::thread([&app]() {
        while (true) {
            std::this_thread::sleep_for(std::chrono::milliseconds(100)); // 10 Hz
            
            auto& cm = ConnectionManager::instance();
            auto vehicles = cm.get_connected_vehicles();
            
            for (const auto& vehicleId : vehicles) {
                auto messages = cm.get_mavlink_messages(vehicleId);
                
                if (!messages.empty()) {
                    std::lock_guard<std::mutex> lock(g_websocket_mutex);
                    auto it = g_websocket_connections.find(vehicleId);
                    if (it != g_websocket_connections.end()) {
                        for (const auto& msg : messages) {
                            for (auto* conn : it->second) {
                                try {
                                    conn->send_text(msg.dump());
                                } catch (...) {
                                    // Connection might be closed, ignore
                                }
                            }
                        }
                    }
                }
            }
        }
    }).detach();

    std::cout << "Starting server on port 8081..." << std::endl;
    app.bindaddr("0.0.0.0").port(8081).run();
    return 0;
}