#include <boost/asio.hpp>
#include <boost/beast/core.hpp>
#include <boost/beast/http.hpp>
#include <nlohmann/json.hpp>
#include "vehicle_connection.hpp"
#include <iostream>

namespace beast = boost::beast;
namespace http = beast::http;
namespace asio = boost::asio;
using tcp = boost::asio::ip::tcp;
using json = nlohmann::json;

VehicleConnection vehicle;

void handle_request(tcp::socket& socket) {
    try {
        beast::flat_buffer buffer;
        http::request<http::string_body> req;
        http::read(socket, buffer, req);

        http::response<http::string_body> res{http::status::ok, req.version()};
        res.set(http::field::server, "Vehicle Server");
        res.set(http::field::content_type, "application/json");
        res.set(http::field::access_control_allow_origin, "*");
        res.set(http::field::access_control_allow_methods, "POST, OPTIONS");
        res.set(http::field::access_control_allow_headers, "Content-Type");

        // Handle OPTIONS request
        if (req.method() == http::verb::options) {
            res.result(http::status::no_content);
            res.body() = "";
            res.prepare_payload();
            http::write(socket, res);
            return;
        }

        // Handle connect request
        if (req.target() == "/connect" && req.method() == http::verb::post) {
            try {
                auto params = json::parse(req.body());
                std::string ip = params["ip"].get<std::string>();
                int port = params["port"].get<int>();
                
                std::string connection_url = "tcp://" + ip + ":" + std::to_string(port);
                std::cout << "Attempting connection to: " << connection_url << std::endl;
                
                bool success = vehicle.connect(connection_url);
                
                json response;
                response["success"] = success;
                response["message"] = success ? "Connected successfully" : "Connection failed";
                res.body() = response.dump();
            } catch (const std::exception& e) {
                res.result(http::status::bad_request);
                json response;
                response["success"] = false;
                response["message"] = std::string("Error: ") + e.what();
                res.body() = response.dump();
            }
        }
        // Handle disconnect request
        else if (req.target() == "/disconnect" && req.method() == http::verb::post) {
            try {
                vehicle.disconnect();
                
                json response;
                response["success"] = true;
                response["message"] = "Disconnected successfully";
                res.body() = response.dump();
            } catch (const std::exception& e) {
                res.result(http::status::internal_server_error);
                json response;
                response["success"] = false;
                response["message"] = std::string("Error: ") + e.what();
                res.body() = response.dump();
            }
        }

        res.prepare_payload();
        http::write(socket, res);
    } catch (const std::exception& e) {
        std::cerr << "Error handling request: " << e.what() << std::endl;
    }
}

int main() {
    try {
        asio::io_context ioc{1};
        tcp::acceptor acceptor{ioc, {{}, 8081}};
        
        std::cout << "Server listening on port 8081..." << std::endl;
        
        while (true) {
            tcp::socket socket{ioc};
            acceptor.accept(socket);
            handle_request(socket);
        }
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        return 1;
    }
}