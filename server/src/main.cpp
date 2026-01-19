#include <crow.h>
#include "connection_manager.hpp"
#include "video_manager.hpp"
#include "log_file_manager.hpp"
#include "tlog_recorder.hpp"
#include <nlohmann/json.hpp>
#include <iostream>
#include <crow/websocket.h>
#include <thread>
#include <unordered_map>
#include <mutex>
#include <algorithm>
#include <signal.h>
#include <atomic>
#include <chrono>

using json = nlohmann::json;

// Global WebSocket connection store
std::unordered_map<std::string, std::vector<crow::websocket::connection*>> g_websocket_connections;
std::mutex g_websocket_mutex;
// Map from connection* to vehicleId (set after first message)
std::unordered_map<crow::websocket::connection*, std::string> g_conn_to_vehicle;

// SWE100821: Add global shutdown flag for graceful termination
std::atomic<bool> g_shutdown_requested{false};

// Signal handler for graceful shutdown
void signal_handler(int signal) {
    std::cout << "\n[INFO] Received signal " << signal << ", shutting down gracefully..." << std::endl;
    g_shutdown_requested = true;
}

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
    // SWE100821: Set up signal handlers for graceful shutdown
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
    
    std::cout << "[INFO] Starting XGCS C++ Backend Server..." << std::endl;
    std::cout << "[INFO] PID: " << getpid() << std::endl;
    
    try {
        crow::SimpleApp app;

        app.loglevel(crow::LogLevel::Warning);  // Hide Info level logs

        // SWE100821: Note: on_error not available in this Crow version
        // Error handling is done at the route level

        // Initialize Managers
        ConnectionManager& connection_manager = ConnectionManager::instance();
        VideoManager video_manager;
        LogFileManager log_file_manager;
        
        // Pass system to log manager if vehicle is connected
        // Note: This needs better handling for multi-vehicle, but for now we grab the first created system
        // We'll init lazily in the routes or via a hook. 
        // Better: connection_manager exposes get_system(id).

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

        // SWE100821: Add health check endpoint for monitoring
        CROW_ROUTE(app, "/health")
        .methods("GET"_method)
        ([](const crow::request&) {
            crow::response res;
            res.add_header("Access-Control-Allow-Origin", "*");
            res.add_header("Content-Type", "application/json");
            
            json health_data = {
                {"status", "healthy"},
                {"timestamp", std::chrono::duration_cast<std::chrono::seconds>(
                    std::chrono::system_clock::now().time_since_epoch()).count()},
                {"pid", getpid()},
                {"uptime", "running"},
                {"version", "1.0.0"}
            };
            
            res.code = 200;
            res.body = health_data.dump();
            return res;
        });



        // --- Video Streaming Endpoints ---
        CROW_ROUTE(app, "/api/video/start").methods("POST"_method)
        ([&video_manager](const crow::request& req) {
            crow::response res;
            res.add_header("Access-Control-Allow-Origin", "*");
            res.add_header("Content-Type", "application/json");

            auto body = json::parse(req.body, nullptr, false);
            if (body.is_discarded()) {
                 // Default ports if no JSON
                 if (video_manager.start_stream(5600, 8082)) {
                     res.code = 200;
                     res.body = R"({"status": "started", "url": "http://localhost:8082"})";
                 } else {
                     res.code = 500;
                     res.body = R"({"status": "error", "message": "Failed to start pipeline"})";
                 }
                 return res;
            }

            int udp_port = body.value("udp_port", 5600);
            int http_port = body.value("http_port", 8082);

            if (video_manager.start_stream(udp_port, http_port)) {
                res.code = 200;
                json response = {
                    {"status", "started"},
                    {"url", "http://localhost:" + std::to_string(http_port)}
                };
                res.body = response.dump();
            } else {
                res.code = 500;
                res.body = R"({"status": "error", "message": "Failed to start pipeline"})";
            }
            return res;
        });

        CROW_ROUTE(app, "/api/video/stop").methods("POST"_method)
        ([&video_manager](const crow::request&) {
            crow::response res;
            res.add_header("Access-Control-Allow-Origin", "*");
            res.add_header("Content-Type", "application/json");
            
            video_manager.stop_stream();
            res.code = 200;
            res.body = R"({"status": "stopped"})";
            return res;
        });

        CROW_ROUTE(app, "/api/video/status").methods("GET"_method)
        ([&video_manager](const crow::request&) {
            crow::response res;
            res.add_header("Access-Control-Allow-Origin", "*");
            res.add_header("Content-Type", "application/json");
            
            json response = {
                {"streaming", video_manager.is_streaming()}
            };
            res.code = 200;
            res.body = response.dump();
            res.body = response.dump();
            return res;
        });

        // --- Log File Endpoints ---
        CROW_ROUTE(app, "/api/logs/list").methods("GET"_method)
        ([&log_file_manager, &connection_manager](const crow::request& req) {
            crow::response res;
            res.add_header("Access-Control-Allow-Origin", "*");
            res.add_header("Content-Type", "application/json");

            auto vehicleId = req.url_params.get("vehicleId");
            auto system = connection_manager.get_system_ptr(vehicleId ? vehicleId : ""); 
            
            if (system) {
                log_file_manager.init(system); 
                res.body = log_file_manager.get_log_list();
            } else {
                res.body = "[]";
            }
            res.code = 200;
            return res;
        });

        CROW_ROUTE(app, "/api/logs/download/<int>").methods("POST"_method)
        ([&log_file_manager](const crow::request&, int log_id) {
             crow::response res;
             res.add_header("Access-Control-Allow-Origin", "*");
             res.add_header("Content-Type", "application/json");

             // Download to a known folder (./logs)
             // Ensure the logs directory exists
             std::string path = log_file_manager.start_download(log_id, "./logs");
             if (path.empty()) {
                 res.code = 500;
                 res.body = R"({"error": "Failed to start download"})";
             } else {
                 res.code = 200;
                 res.body = R"({"status": "started"})";
             }
             return res;
        });

        CROW_ROUTE(app, "/api/logs/download/<int>/status").methods("GET"_method)
        ([&log_file_manager](const crow::request&, int log_id) {
             crow::response res;
             res.add_header("Access-Control-Allow-Origin", "*");
             res.add_header("Content-Type", "application/json");

             res.body = log_file_manager.get_download_status(log_id).dump();
             res.code = 200;
             return res;
        });

        // --- Session / TLog Endpoints ---
        CROW_ROUTE(app, "/api/sessions").methods("GET"_method)
        ([](const crow::request&) {
             crow::response res;
             res.add_header("Access-Control-Allow-Origin", "*");
             res.add_header("Content-Type", "application/json");
             res.body = TLogRecorder::instance().get_session_list().dump();
             res.code = 200;
             return res;
        });

        CROW_ROUTE(app, "/api/sessions/download/<string>").methods("GET"_method)
        ([](const crow::request&, std::string session_id) {
             crow::response res;
             res.add_header("Access-Control-Allow-Origin", "*");
             
             std::string path = TLogRecorder::instance().get_session_path(session_id);
             if (path.empty()) {
                 res.code = 404;
                 res.body = "Session not found";
                 return res;
             }
             
             // Crow's set_static_file_info is for static assets. 
             // For dynamic downloads, we can just read the file (memory heavy for huge files) 
             // or let Crow serve it if we had a static dir.
             // For MVP, read to string.
             std::ifstream file(path, std::ios::binary);
             if (file) {
                 std::ostringstream ss;
                 ss << file.rdbuf();
                 res.body = ss.str();
                 res.add_header("Content-Type", "application/octet-stream");
                 res.add_header("Content-Disposition", "attachment; filename=\"" + session_id + "\"");
                 res.code = 200;
             } else {
                 res.code = 500;
             }
             return res;
        });

        CROW_ROUTE(app, "/api/sessions/data/<string>").methods("GET"_method)
        ([](const crow::request&, std::string session_id) {
             crow::response res;
             res.add_header("Access-Control-Allow-Origin", "*");
             res.add_header("Content-Type", "application/json");
             res.body = TLogRecorder::instance().get_session_data_json(session_id);
             res.code = 200;
             return res;
        });

        // --- Geofence Endpoints ---
        CROW_ROUTE(app, "/api/geofence/upload").methods("POST"_method)
        ([](const crow::request& req) {
             crow::response res;
             res.add_header("Access-Control-Allow-Origin", "*");
             res.add_header("Content-Type", "application/json");
             try {
                auto body = json::parse(req.body);
                std::string vehicle_id = body.value("vehicle_id", "");
                auto points_json = body["points"];
                
                std::vector<std::pair<double, double>> points;
                for (const auto& p : points_json) {
                    points.push_back({p["lat"], p["lng"]});
                }
                
                if (ConnectionManager::instance().upload_geofence(vehicle_id, points)) {
                    res.body = json({{"status", "success"}}).dump();
                } else {
                    res.body = json({{"status", "error"}, {"message", "Upload failed"}}).dump();
                    res.code = 500;
                }
             } catch (const std::exception& e) {
                 res.body = json({{"status", "error"}, {"message", e.what()}}).dump();
                 res.code = 400;
             }
             return res;
        });

        CROW_ROUTE(app, "/api/geofence/clear").methods("POST"_method)
        ([](const crow::request& req) {
             crow::response res;
             res.add_header("Access-Control-Allow-Origin", "*");
             res.add_header("Content-Type", "application/json");
             try {
                auto body = json::parse(req.body);
                std::string vehicle_id = body.value("vehicle_id", "");
                if (ConnectionManager::instance().clear_geofence(vehicle_id)) {
                    res.body = json({{"status", "success"}}).dump();
                } else {
                     res.body = json({{"status", "error"}, {"message", "Clear failed"}}).dump();
                     res.code = 500;
                }
             } catch (const std::exception& e) {
                 res.body = json({{"status", "error"}, {"message", e.what()}}).dump();
                 res.code = 400;
             }
             return res;
        });

        // Rally Points
        CROW_ROUTE(app, "/api/rally/upload").methods("POST"_method)([&connection_manager](const crow::request& req) {
            auto body = json::parse(req.body);
            std::string vehicle_id = body.value("vehicle_id", "");
            std::vector<std::tuple<double, double, float>> points;
            
            if (body.contains("points")) {
                for (const auto& p : body["points"]) {
                    points.emplace_back(p["lat"], p["lon"], p.contains("alt") ? (float)p["alt"] : 30.0f);
                }
            }
            
            bool result = connection_manager.upload_rally_points(vehicle_id, points);
            return crow::response(result ? 200 : 500, json({{"status", result ? "success" : "error"}}).dump());
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
                
                std::string connection_url = "tcpout://" + ip + ":" + std::to_string(port);
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

        CROW_ROUTE(app, "/telemetry/all")
        .methods("GET"_method)
        ([](const crow::request&) {
            crow::response res;
            res.add_header("Access-Control-Allow-Origin", "*");
            res.set_header("Content-Type", "application/json");

            try {
                // Get bulk telemetry data
                std::string telemetry_json_str = ConnectionManager::instance().get_all_vehicle_statuses();
                
                res.code = 200;
                res.body = telemetry_json_str;
            } catch (const std::exception& e) {
                res.code = 500;
                res.body = json{
                    {"success", false},
                    {"error", std::string("Error: ") + e.what()}
                }.dump();
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

        // NEW: Mission download endpoint
        CROW_ROUTE(app, "/api/mission/download/<string>")
        .methods("GET"_method)
        ([](const std::string& vehicle_id) {
            crow::response res;
            res.add_header("Access-Control-Allow-Origin", "*");
            res.add_header("Content-Type", "application/json");
            
            std::string result = ConnectionManager::instance().download_mission(vehicle_id);
            res.body = result;
            res.code = 200;
            return res;
        });

        // NEW: Vehicle status endpoint
        CROW_ROUTE(app, "/api/vehicle/<string>/status")
        .methods("GET"_method)
        ([](const std::string& vehicle_id) {
            crow::response res;
            res.add_header("Access-Control-Allow-Origin", "*");
            res.add_header("Content-Type", "application/json");
            
            std::string result = ConnectionManager::instance().get_vehicle_status(vehicle_id);
            res.body = result;
            res.code = 200;
            return res;
        });

        // --- Radio Simulation Endpoint ---
        CROW_ROUTE(app, "/api/simulation/radio").methods("POST"_method)
        ([](const crow::request& req) {
            auto params = json::parse(req.body);
            std::string vehicleId = params["vehicleId"].get<std::string>();
            bool enabled = params.value("enabled", false);
            double freq = params.value("frequency", 915.0);
            double tx_pwr = params.value("txPower", 30.0);
            double tx_gain = params.value("txGain", 3.0);
            double rx_gain = params.value("rxGain", 3.0);
            
            ConnectionManager::instance().set_radio_simulation(vehicleId, enabled, freq, tx_pwr, tx_gain, rx_gain);
            
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

        // --- Jeremy: Add arm/disarm endpoints with enhanced stability ---
        CROW_ROUTE(app, "/api/command/arm").methods("POST"_method)
        ([](const crow::request& req) {
            std::cout << "[DEBUG] /api/command/arm called" << std::endl;
            
            try {
                auto params = json::parse(req.body);
                std::string vehicleId = params["vehicleId"].get<std::string>();
                
                // SWE100821: Add input validation
                if (vehicleId.empty()) {
                    auto response = crow::response(400, json{{"success", false}, {"error", "Vehicle ID is required"}}.dump());
                    response.add_header("Access-Control-Allow-Origin", "*");
                    response.set_header("Content-Type", "application/json");
                    return response;
                }
                
                bool success = ConnectionManager::instance().send_arm_command(vehicleId);
                
                // SWE100821: Use simple response constructor to prevent crashes
                auto response = crow::response(200, json{{"success", success}, {"message", success ? "Arm command sent successfully" : "Arm command failed"}}.dump());
                response.add_header("Access-Control-Allow-Origin", "*");
                response.set_header("Content-Type", "application/json");
                
                std::cout << "[DEBUG] Arm endpoint response: " << response.code << " - " << response.body << std::endl;
                return response;
                
            } catch (const std::exception& e) {
                std::cerr << "Exception in arm endpoint: " << e.what() << std::endl;
                auto response = crow::response(400, json{{"success", false}, {"error", e.what()}}.dump());
                response.add_header("Access-Control-Allow-Origin", "*");
                response.set_header("Content-Type", "application/json");
                return response;
            }
        });

        // --- Compass Calibration Endpoints ---
        CROW_ROUTE(app, "/api/calibration/compass/start").methods("POST"_method)
        ([](const crow::request& req) {
            auto params = json::parse(req.body);
            std::string vehicleId = params["vehicleId"].get<std::string>();
            bool success = ConnectionManager::instance().start_compass_calibration(vehicleId);
            crow::response res;
            res.add_header("Access-Control-Allow-Origin", "*");
            res.code = 200;
            res.body = json{{"success", success}}.dump();
            return res;
        });

        CROW_ROUTE(app, "/api/calibration/compass/cancel").methods("POST"_method)
        ([](const crow::request& req) {
            auto params = json::parse(req.body);
            std::string vehicleId = params["vehicleId"].get<std::string>();
            bool success = ConnectionManager::instance().cancel_compass_calibration(vehicleId);
            crow::response res;
            res.add_header("Access-Control-Allow-Origin", "*");
            res.code = 200;
            res.body = json{{"success", success}}.dump();
            return res;
        });

        // --- Accelerometer Calibration Endpoints ---
        CROW_ROUTE(app, "/api/calibration/accelerometer/start").methods("POST"_method)
        ([](const crow::request& req) {
            auto params = json::parse(req.body);
            std::string vehicleId = params["vehicleId"].get<std::string>();
            bool success = ConnectionManager::instance().start_accelerometer_calibration(vehicleId);
            crow::response res;
            res.add_header("Access-Control-Allow-Origin", "*");
            res.code = 200;
            res.body = json{{"success", success}}.dump();
            return res;
        });

        CROW_ROUTE(app, "/api/calibration/accelerometer/cancel").methods("POST"_method)
        ([](const crow::request& req) {
            auto params = json::parse(req.body);
            std::string vehicleId = params["vehicleId"].get<std::string>();
            bool success = ConnectionManager::instance().cancel_accelerometer_calibration(vehicleId);
            crow::response res;
            res.add_header("Access-Control-Allow-Origin", "*");
            res.code = 200;
            res.body = json{{"success", success}}.dump();
            return res;
        });

        CROW_ROUTE(app, "/api/calibration/<string>/status").methods("GET"_method)
        ([](const std::string& vehicle_id) {
            std::string status = ConnectionManager::instance().get_calibration_status(vehicle_id);
            crow::response res;
            res.add_header("Access-Control-Allow-Origin", "*");
            res.add_header("Content-Type", "application/json");
            res.code = 200;
            res.body = status;
            return res;
        });

        CROW_ROUTE(app, "/api/command/disarm").methods("POST"_method)
        ([](const crow::request& req) {
            std::cout << "[DEBUG] /api/command/disarm called" << std::endl;
            
            try {
                auto params = json::parse(req.body);
                std::string vehicleId = params["vehicleId"].get<std::string>();
                
                // SWE100821: Add input validation
                if (vehicleId.empty()) {
                    auto response = crow::response(400, json{{"success", false}, {"error", "Vehicle ID is required"}}.dump());
                    response.add_header("Access-Control-Allow-Origin", "*");
                    response.set_header("Content-Type", "application/json");
                    return response;
                }
                
                bool success = ConnectionManager::instance().send_disarm_command(vehicleId);
                
                // SWE100821: Use simple response constructor to prevent crashes
                auto response = crow::response(200, json{{"success", success}, {"message", success ? "Disarm command sent successfully" : "Disarm command failed"}}.dump());
                response.add_header("Access-Control-Allow-Origin", "*");
                response.set_header("Content-Type", "application/json");
                
                std::cout << "[DEBUG] Disarm endpoint response: " << response.code << " - " << response.body << std::endl;
                return response;
                
            } catch (const std::exception& e) {
                std::cerr << "Exception in disarm endpoint: " << e.what() << std::endl;
                auto response = crow::response(400, json{{"success", false}, {"error", e.what()}}.dump());
                response.add_header("Access-Control-Allow-Origin", "*");
                response.set_header("Content-Type", "application/json");
                return response;
            }
        });
        // --- End Jeremy patch for arm/disarm endpoints ---

        // --- Jeremy: Add flight modes endpoint ---
        CROW_ROUTE(app, "/api/vehicle/<string>/flight-modes").methods("GET"_method)
        ([](const std::string& vehicle_id) {
            std::cout << "[DEBUG] /api/vehicle/" << vehicle_id << "/flight-modes called" << std::endl;
            auto result = ConnectionManager::instance().get_flight_modes(vehicle_id);
            return crow::response(200, result);
        });
        // --- End Jeremy patch for flight modes endpoint ---

        // --- Jeremy: Add flight mode change endpoint ---
        CROW_ROUTE(app, "/api/vehicle/<string>/flight-mode").methods("POST"_method)
        ([](const crow::request& req, const std::string& vehicle_id) {
            std::cout << "[DEBUG] /api/vehicle/" << vehicle_id << "/flight-mode called" << std::endl;
            std::cout << "[DEBUG] Body: " << req.body << std::endl;
            
            try {
                auto params = json::parse(req.body);
                std::string flight_mode = params["flight_mode"].get<std::string>();
                std::cout << "[DEBUG] Changing flight mode to: " << flight_mode << std::endl;
                
                bool success = ConnectionManager::instance().send_set_mode_command(vehicle_id, flight_mode);
                return crow::response(200, json{{"success", success}}.dump());
            } catch (const std::exception& e) {
                std::cerr << "Exception in flight-mode endpoint: " << e.what() << std::endl;
                return crow::response(400, json{{"success", false}, {"error", e.what()}}.dump());
            }
        });
        // --- End Jeremy patch for flight mode change endpoint ---

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

        // Motor Test
        CROW_ROUTE(app, "/api/command/motor_test").methods("POST"_method)
        ([](const crow::request& req) {
            auto params = json::parse(req.body);
            std::string vehicleId = params["vehicleId"].get<std::string>();
            int motorIndex = params["motorIndex"].get<int>();
            int throttle = params["throttle"].get<int>();
            int timeout = params["timeout"].get<int>();

            bool success = ConnectionManager::instance().send_motor_test(vehicleId, motorIndex, throttle, timeout);
            
            return crow::response(200, json{{"success", success}}.dump());
        });

        // Manual Control (Joystick)
        CROW_ROUTE(app, "/api/command/manual_control").methods("POST"_method)
        ([](const crow::request& req) {
            auto params = json::parse(req.body);
            std::string vehicleId = params["vehicleId"].get<std::string>();
            float x = params["x"].get<float>();
            float y = params["y"].get<float>();
            float z = params["z"].get<float>();
            float r = params["r"].get<float>();
            uint16_t buttons = params["buttons"].get<uint16_t>();

            // Don't wait on result/lock for too long if possible, but for now blocking is fine at 10-20Hz
            bool success = ConnectionManager::instance().send_manual_control(vehicleId, x, y, z, r, buttons);
            
            return crow::response(200, json{{"success", success}}.dump());
        });

        // Follow Me Target Update
        CROW_ROUTE(app, "/api/command/follow_target").methods("POST"_method)
        ([](const crow::request& req) {
            auto params = json::parse(req.body);
            std::string vehicleId = params["vehicleId"].get<std::string>();
            double lat = params["lat"].get<double>();
            double lon = params["lon"].get<double>();
            float alt = params["alt"].get<float>(); // AMsl
            float vn = 0.0f;
            float ve = 0.0f;
            float vd = 0.0f;
            
            if (params.count("vn")) vn = params["vn"].get<float>();
            if (params.count("ve")) ve = params["ve"].get<float>();
            if (params.count("vd")) vd = params["vd"].get<float>();

            bool success = ConnectionManager::instance().send_follow_target(vehicleId, lat, lon, alt, vn, ve, vd);
            return crow::response(200, json{{"success", success}}.dump());
        });

        // --- Jeremy: Add connections endpoint for frontend ---
        CROW_ROUTE(app, "/api/connections").methods("GET"_method)
        ([](const crow::request&) {
            crow::response res;
            res.add_header("Access-Control-Allow-Origin", "*");
            res.add_header("Content-Type", "application/json");
            
            try {
                auto& cm = ConnectionManager::instance();
                auto vehicles = cm.get_connected_vehicles();
                
                json connections = json::array();
                for (const auto& vehicleId : vehicles) {
                    connections.push_back({
                        {"id", vehicleId},
                        {"name", vehicleId},
                        {"connected", true},
                        {"connectionStatus", "connected"}
                    });
                }
                
                res.code = 200;
                res.body = connections.dump();
            } catch (const std::exception& e) {
                std::cerr << "Exception in /api/connections: " << e.what() << std::endl;
                res.code = 500;
                res.body = json{{"error", "Internal server error"}, {"message", e.what()}}.dump();
            }
            
            return res;
        });
        // --- End Jeremy patch for connections endpoint ---

        // MAVLink Streaming WebSocket endpoint
        CROW_ROUTE(app, "/api/mavlink/stream/<string>")
        .websocket(&app)
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
            while (!g_shutdown_requested) {
                try {
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
                } catch (const std::exception& e) {
                    std::cerr << "[ERROR] Exception in WebSocket thread: " << e.what() << std::endl;
                    // Continue running despite errors
                }
            }
        }).detach();

        std::cout << "[INFO] Starting server on port 8081..." << std::endl;
        std::cout << "[INFO] Server initialized successfully" << std::endl;
        
        // SWE100821: Add graceful shutdown handling
        app.bindaddr("0.0.0.0").port(8081).run();
        
        std::cout << "[INFO] Server shutdown complete" << std::endl;
        return 0;
        
    } catch (const std::exception& e) {
        std::cerr << "[FATAL] Unhandled exception in main: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "[FATAL] Unknown exception in main" << std::endl;
        return 1;
    }
}