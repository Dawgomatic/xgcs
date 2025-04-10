#include <crow.h>
#include "connection_manager.hpp"
#include <nlohmann/json.hpp>
#include <iostream>
#include <crow/websocket.h>
#include <thread>

using json = nlohmann::json;

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
            std::string vehicleType = params["type"].get<std::string>();
            
            std::string connection_url = "tcp://" + ip + ":" + std::to_string(port);
            bool success = ConnectionManager::instance().add_vehicle(vehicleId, connection_url, vehicleType);
            
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
        
        try {
            auto vehicleId = req.url_params.get("vehicleId");
            
            if (!vehicleId) {
                json error_json = {
                    {"error", "Vehicle ID not provided"}
                };
                
                res.code = 400;
                res.set_header("Content-Type", "application/json");
                res.body = error_json.dump();
                return res;
            }
            
            if (!ConnectionManager::instance().is_vehicle_connected(vehicleId)) {
                json error_json = {
                    {"error", "Vehicle not connected"}
                };
                
                res.code = 404;
                res.set_header("Content-Type", "application/json");
                res.body = error_json.dump();
                return res;
            }
            
            // Get real telemetry data from the vehicle as JSON string
            std::string telemetry_json = ConnectionManager::instance().get_telemetry_data_json(vehicleId);
            
            // Parse the JSON string
            json telemetry_data = json::parse(telemetry_json);
            
            res.code = 200;
            res.set_header("Content-Type", "application/json");
            res.body = telemetry_data.dump();
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

    std::cout << "Starting server on port 8081..." << std::endl;
    app.bindaddr("0.0.0.0").port(8081).run();
    return 0;
}