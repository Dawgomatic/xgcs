#include "vehicle_connection.hpp"
#include <iostream>
#include <mavsdk/mavsdk.h>
#include <future>
#include <chrono>

VehicleConnection::VehicleConnection() : _mavsdk(mavsdk::Mavsdk::Configuration{
    mavsdk::ComponentType::GroundStation
}) {
    // Add error subscription
    _mavsdk.subscribe_connection_errors([](mavsdk::Mavsdk::ConnectionError error) {
        std::cerr << "Connection error: " << error.error_description << std::endl;
    });
}

bool VehicleConnection::connect(const std::string& connection_url) {
    std::cout << "Attempting to connect with URL: " << connection_url << std::endl;
    
    auto result = _mavsdk.add_any_connection(connection_url);
    if (result != mavsdk::ConnectionResult::Success) {
        std::cerr << "Connection failed: " << result << std::endl;
        return false;
    }

    std::cout << "Connection attempt successful, waiting for system..." << std::endl;
    
    // Wait for system to connect
    auto prom = std::promise<std::shared_ptr<mavsdk::System>>();
    auto fut = prom.get_future();

    _mavsdk.subscribe_on_new_system([&prom, this]() {
        auto system = _mavsdk.systems().back();
        if (system->has_autopilot()) {
            prom.set_value(system);
        }
    });

    if (fut.wait_for(std::chrono::seconds(3)) == std::future_status::timeout) {
        std::cerr << "No autopilot found after 3 seconds" << std::endl;
        return false;
    }

    _system = fut.get();
    return true;
}