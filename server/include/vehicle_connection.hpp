#ifndef VEHICLE_CONNECTION_HPP
#define VEHICLE_CONNECTION_HPP

#include <mavsdk/mavsdk.h>
#include <mavsdk/plugins/telemetry/telemetry.h>
#include <mavsdk/plugins/action/action.h>
#include <string>
#include <memory>

class VehicleConnection {
public:
    VehicleConnection();
    ~VehicleConnection() = default;

    bool connect(const std::string& connection_url);
    bool arm();
    bool disarm();
    bool takeoff();
    bool land();

    // Get telemetry data
    mavsdk::Telemetry::Position getPosition() const;
    mavsdk::Telemetry::EulerAngle getAttitude() const;
    float getBatteryPercentage() const;

private:
    mavsdk::Mavsdk _mavsdk;
    std::shared_ptr<mavsdk::System> _system;
    std::unique_ptr<mavsdk::Telemetry> _telemetry;
    std::unique_ptr<mavsdk::Action> _action;
};

#endif // VEHICLE_CONNECTION_HPP