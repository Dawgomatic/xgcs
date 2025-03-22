#pragma once
#include <mavsdk/mavsdk.h>
#include <string>
#include <memory>

class VehicleConnection {
public:
    VehicleConnection();
    bool connect(const std::string& connection_url);
    void disconnect();
    bool is_connected() const;

private:
    mavsdk::Mavsdk _mavsdk;
    std::shared_ptr<mavsdk::System> _system;
    mavsdk::Mavsdk::ConnectionHandle _connection_handle;
};