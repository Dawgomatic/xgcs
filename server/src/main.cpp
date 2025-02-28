#include <crow.h>
#include "vehicle_connection.hpp"
#include <nlohmann/json.hpp>
#include <thread>

using json = nlohmann::json;

int main() {
    crow::SimpleApp app;

    VehicleConnection vehicle;

    // Handle OPTIONS preflight requests for /connect
    CROW_ROUTE(app, "/connect")
    .methods("OPTIONS"_method)
    ([](const crow::request&) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        res.add_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        res.add_header("Access-Control-Allow-Headers", "Content-Type");
        res.code = 204;
        return res;
    });

    // Connect to vehicle
    CROW_ROUTE(app, "/connect")
    .methods("POST"_method)
    ([&vehicle](const crow::request& req) {
        std::cout << "Received connection request with body: " << req.body << std::endl;
        
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        res.add_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        res.add_header("Access-Control-Allow-Headers", "Content-Type");
        res.set_header("Content-Type", "application/json");

        try {
            auto params = json::parse(req.body);
            
            // Get connection details from request
            std::string ip = params["ip"].get<std::string>();
            int port = params["port"].get<int>();
            std::string type = params["type"].get<std::string>();
            
            std::cout << "Connecting with parameters:" << std::endl;
            std::cout << "IP: " << ip << std::endl;
            std::cout << "Port: " << port << std::endl;
            std::cout << "Type: " << type << std::endl;
            
            // Construct connection URL based on type
            std::string connection_url = "tcp://" + ip + ":" + std::to_string(port);
            std::cout << "Full connection URL: " << connection_url << std::endl;
            
            bool success = vehicle.connect(connection_url);
            
            json response;
            response["success"] = success;
            response["message"] = success ? "Connected successfully" : "Connection failed";
            
            res.code = success ? 200 : 400;
            res.body = response.dump();
            
            std::cout << "Connection " << (success ? "successful" : "failed") << std::endl;
        } catch (const std::exception& e) {
            std::cerr << "Error processing request: " << e.what() << std::endl;
            
            json response;
            response["success"] = false;
            response["message"] = std::string("Error: ") + e.what();
            
            res.code = 400;
            res.body = response.dump();
        }
        
        return res;
    });

    // Arm vehicle
    CROW_ROUTE(app, "/arm")
    .methods("POST"_method)
    ([&vehicle]() {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        res.add_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        res.add_header("Access-Control-Allow-Headers", "Content-Type");

        bool success = vehicle.arm();
        
        json response;
        response["success"] = success;
        res.body = response.dump();
        return res;
    });

    // Get telemetry
    CROW_ROUTE(app, "/telemetry")
    .methods("GET"_method)
    ([&vehicle]() {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        res.add_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        res.add_header("Access-Control-Allow-Headers", "Content-Type");

        auto position = vehicle.getPosition();
        auto attitude = vehicle.getAttitude();
        float battery = vehicle.getBatteryPercentage();

        json response = {
            {"position", {
                {"latitude_deg", position.latitude_deg},
                {"longitude_deg", position.longitude_deg},
                {"absolute_altitude_m", position.absolute_altitude_m},
                {"relative_altitude_m", position.relative_altitude_m}
            }},
            {"attitude", {
                {"roll_deg", attitude.roll_deg},
                {"pitch_deg", attitude.pitch_deg},
                {"yaw_deg", attitude.yaw_deg}
            }},
            {"battery", battery}
        };

        res.body = response.dump();
        return res;
    });

    // Add a WebSocket route for streaming telemetry
    CROW_ROUTE(app, "/ws")
    .websocket(&app)
    .onopen([](crow::websocket::connection& conn) {
        std::cout << "WebSocket connection opened" << std::endl;
    })
    .onclose([](crow::websocket::connection& conn, const std::string& reason, uint16_t code) {
        std::cout << "WebSocket connection closed: " << reason << " (code: " << code << ")" << std::endl;
    })
    .onmessage([&vehicle](crow::websocket::connection& conn, const std::string& data, bool is_binary) {
        if (data == "start_telemetry") {
            // Start sending periodic telemetry updates in a separate thread
            std::thread([&conn, &vehicle]() {
                try {
                    while(true) {
                        auto position = vehicle.getPosition();
                        json telemetry = {
                            {"type", "position"},
                            {"data", {
                                {"latitude", position.latitude_deg},
                                {"longitude", position.longitude_deg},
                                {"altitude", position.absolute_altitude_m}
                            }}
                        };
                        conn.send_text(telemetry.dump());
                        std::this_thread::sleep_for(std::chrono::milliseconds(100));
                    }
                } catch (const std::exception& e) {
                    std::cerr << "Error in telemetry thread: " << e.what() << std::endl;
                }
            }).detach();
        }
    });

    // Handle OPTIONS requests for CORS
    CROW_ROUTE(app, "/<path>")
    .methods("OPTIONS"_method)
    ([](const crow::request&, std::string path) {
        crow::response res;
        res.add_header("Access-Control-Allow-Origin", "*");
        res.add_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        res.add_header("Access-Control-Allow-Headers", "Content-Type");
        res.code = 204;
        return res;
    });

    std::cout << "Server starting on port 8081..." << std::endl;
    app.port(8081).multithreaded().run();
    return 0;
} 