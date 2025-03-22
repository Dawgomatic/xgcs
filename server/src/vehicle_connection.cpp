#include "vehicle_connection.hpp"
#include <iostream>
#include <mavsdk/mavsdk.h>
#include <future>
#include <chrono>
#include <thread>

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
    
    // If we already have a system connected, disconnect it first
    if (_system) {
        disconnect();
        
        // Give some time for the system to fully disconnect
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }
    
    // Store the connection handle for later disconnection
    auto [result, handle] = _mavsdk.add_any_connection_with_handle(connection_url);
    if (result != mavsdk::ConnectionResult::Success) {
        std::cerr << "Connection failed: " << result << std::endl;
        return false;
    }
    
    // Store the connection handle
    _connection_handle = handle;

    std::cout << "Connection attempt successful, waiting for system..." << std::endl;
    
    // Wait for system to connect
    auto prom = std::promise<std::shared_ptr<mavsdk::System>>();
    auto fut = prom.get_future();

    auto handle_system = _mavsdk.subscribe_on_new_system([&prom, this]() {
        auto systems = _mavsdk.systems();
        if (!systems.empty()) {
            for (auto system : systems) {
                if (system->has_autopilot()) {
                    std::cout << "Found system with autopilot" << std::endl;
                    prom.set_value(system);
                    break;
                }
            }
        }
    });

    // Wait for up to 5 seconds for a system to be discovered
    if (fut.wait_for(std::chrono::seconds(5)) == std::future_status::timeout) {
        std::cerr << "No autopilot found after 5 seconds" << std::endl;
        // Clean up the connection since no system was found
        _mavsdk.remove_connection(_connection_handle);
        _mavsdk.unsubscribe_on_new_system(handle_system);
        return false;
    }

    _mavsdk.unsubscribe_on_new_system(handle_system);
    _system = fut.get();
    
    // Wait for the system to be fully connected
    std::cout << "System discovered, waiting for connection..." << std::endl;
    for (int i = 0; i < 10; i++) {
        if (_system->is_connected()) {
            std::cout << "System is now connected" << std::endl;
            return true;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
    }
    
    std::cerr << "System discovered but not connected after timeout" << std::endl;
    return false;
}

void VehicleConnection::disconnect() {
    std::cout << "Disconnecting from vehicle..." << std::endl;
    
    if (_system) {
        // First, check if the system is still connected
        if (_system->is_connected()) {
            // Remove the specific connection using the stored handle
            _mavsdk.remove_connection(_connection_handle);
            
            // Wait for the system to fully disconnect
            std::cout << "Waiting for system to disconnect..." << std::endl;
            for (int i = 0; i < 10; i++) {
                if (!_system->is_connected()) {
                    break;
                }
                std::this_thread::sleep_for(std::chrono::milliseconds(200));
            }
        }
        
        // Clear the system reference
        _system = nullptr;
        std::cout << "Vehicle disconnected successfully" << std::endl;
    } else {
        std::cout << "No vehicle connected" << std::endl;
    }
}

bool VehicleConnection::is_connected() const {
    return _system != nullptr && _system->is_connected();
}