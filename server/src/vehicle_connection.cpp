#include "vehicle_connection.hpp"
#include <iostream>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <fcntl.h>
#include <termios.h>
#include <unistd.h>
#include <string.h>
#include <mutex>
#include <thread>
#include <future>
#include <chrono>
#include <mavsdk/mavsdk.h>
#include <mavsdk/plugins/telemetry/telemetry.h>
#include <mavsdk/plugins/action/action.h>

class ConnectionImpl {
public:
    virtual ~ConnectionImpl() = default;
    virtual bool open() = 0;
    virtual void close() = 0;
    virtual ssize_t read(uint8_t* buffer, size_t len) = 0;
    virtual ssize_t write(const uint8_t* buffer, size_t len) = 0;
    virtual bool isOpen() const = 0;
};

// Serial Connection Implementation
class SerialImpl : public ConnectionImpl {
public:
    SerialImpl(const std::string& device, int baudrate) 
        : device_(device), baudrate_(baudrate), fd_(-1) {}
    
    bool open() override {
        fd_ = ::open(device_.c_str(), O_RDWR | O_NOCTTY | O_NONBLOCK);
        if (fd_ < 0) return false;

        struct termios tty;
        memset(&tty, 0, sizeof(tty));
        if (tcgetattr(fd_, &tty) != 0) {
            close();
            return false;
        }

        // Set baud rate
        speed_t speed;
        switch (baudrate_) {
            case 9600:   speed = B9600;   break;
            case 19200:  speed = B19200;  break;
            case 38400:  speed = B38400;  break;
            case 57600:  speed = B57600;  break;
            case 115200: speed = B115200; break;
            default:     speed = B115200; break;
        }
        
        cfsetospeed(&tty, speed);
        cfsetispeed(&tty, speed);

        tty.c_cflag |= (CLOCAL | CREAD);    // Ignore modem controls
        tty.c_cflag &= ~CSIZE;
        tty.c_cflag |= CS8;                  // 8-bit characters
        tty.c_cflag &= ~PARENB;             // No parity bit
        tty.c_cflag &= ~CSTOPB;             // One stop bit
        tty.c_cflag &= ~CRTSCTS;            // No hardware flow control

        // Setup for non-canonical mode
        tty.c_iflag &= ~(IGNBRK | BRKINT | PARMRK | ISTRIP | INLCR | IGNCR | ICRNL | IXON);
        tty.c_lflag &= ~(ECHO | ECHONL | ICANON | ISIG | IEXTEN);
        tty.c_oflag &= ~OPOST;

        // Fetch bytes as they become available
        tty.c_cc[VMIN] = 0;
        tty.c_cc[VTIME] = 1;

        if (tcsetattr(fd_, TCSANOW, &tty) != 0) {
            close();
            return false;
        }

        return true;
    }

    void close() override {
        if (fd_ >= 0) {
            ::close(fd_);
            fd_ = -1;
        }
    }

    ssize_t read(uint8_t* buffer, size_t len) override {
        return ::read(fd_, buffer, len);
    }

    ssize_t write(const uint8_t* buffer, size_t len) override {
        return ::write(fd_, buffer, len);
    }

    bool isOpen() const override {
        return fd_ >= 0;
    }

private:
    std::string device_;
    int baudrate_;
    int fd_;
};

// UDP Connection Implementation
class UDPImpl : public ConnectionImpl {
public:
    UDPImpl(const std::string& address, int port) 
        : address_(address), port_(port), sock_(-1) {}

    bool open() override {
        sock_ = socket(AF_INET, SOCK_DGRAM, 0);
        if (sock_ < 0) return false;

        struct sockaddr_in addr;
        memset(&addr, 0, sizeof(addr));
        addr.sin_family = AF_INET;
        addr.sin_port = htons(port_);
        addr.sin_addr.s_addr = inet_addr(address_.c_str());

        if (bind(sock_, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
            close();
            return false;
        }

        return true;
    }

    void close() override {
        if (sock_ >= 0) {
            ::close(sock_);
            sock_ = -1;
        }
    }

    ssize_t read(uint8_t* buffer, size_t len) override {
        struct sockaddr_in sender_addr;
        socklen_t sender_len = sizeof(sender_addr);
        return recvfrom(sock_, buffer, len, 0, 
                       (struct sockaddr*)&sender_addr, &sender_len);
    }

    ssize_t write(const uint8_t* buffer, size_t len) override {
        struct sockaddr_in dest_addr;
        memset(&dest_addr, 0, sizeof(dest_addr));
        dest_addr.sin_family = AF_INET;
        dest_addr.sin_port = htons(port_);
        dest_addr.sin_addr.s_addr = inet_addr(address_.c_str());

        return sendto(sock_, buffer, len, 0, 
                     (struct sockaddr*)&dest_addr, sizeof(dest_addr));
    }

    bool isOpen() const override {
        return sock_ >= 0;
    }

private:
    std::string address_;
    int port_;
    int sock_;
};

// TCP Connection Implementation
class TCPImpl : public ConnectionImpl {
public:
    TCPImpl(const std::string& address, int port)
        : address_(address), port_(port), sock_(-1) {}

    bool open() override {
        sock_ = socket(AF_INET, SOCK_STREAM, 0);
        if (sock_ < 0) {
            std::cerr << "Failed to create socket: " << strerror(errno) << std::endl;
            return false;
        }

        struct sockaddr_in addr;
        memset(&addr, 0, sizeof(addr));
        addr.sin_family = AF_INET;
        addr.sin_port = htons(port_);
        if (inet_pton(AF_INET, address_.c_str(), &addr.sin_addr) != 1) {
            std::cerr << "Invalid IP address format: " << address_ << std::endl;
            close();
            return false;
        }

        std::cout << "Attempting to connect to " << address_ << ":" << port_ << std::endl;
        
        if (connect(sock_, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
            std::cerr << "Connection failed: " << strerror(errno) << std::endl;
            close();
            return false;
        }

        std::cout << "Successfully connected to " << address_ << ":" << port_ << std::endl;
        return true;
    }

    void close() override {
        if (sock_ >= 0) {
            ::close(sock_);
            sock_ = -1;
        }
    }

    ssize_t read(uint8_t* buffer, size_t len) override {
        return recv(sock_, buffer, len, 0);
    }

    ssize_t write(const uint8_t* buffer, size_t len) override {
        return send(sock_, buffer, len, 0);
    }

    bool isOpen() const override {
        return sock_ >= 0;
    }

private:
    std::string address_;
    int port_;
    int sock_;
};

// VehicleConnection implementation
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
        std::cerr << "Connection failed with result: " << result << std::endl;
        
        switch(result) {
            case mavsdk::ConnectionResult::Timeout:
                std::cerr << "Connection timed out - check if device is running" << std::endl;
                break;
            case mavsdk::ConnectionResult::SocketError:
                std::cerr << "Socket error - check if port is correct" << std::endl;
                break;
            case mavsdk::ConnectionResult::BindError:
                std::cerr << "Bind error - port might be in use" << std::endl;
                break;
            case mavsdk::ConnectionResult::SocketConnectionError:
                std::cerr << "Socket connection error - check if device is accepting connections" << std::endl;
                break;
            case mavsdk::ConnectionResult::ConnectionError:
                std::cerr << "Connection error - check connection URL format" << std::endl;
                break;
            default:
                std::cerr << "Unknown error" << std::endl;
        }
        return false;
    }

    std::cout << "Connection attempt successful, waiting for system..." << std::endl;
    auto prom = std::promise<std::shared_ptr<mavsdk::System>>();
    auto fut = prom.get_future();

    _mavsdk.subscribe_on_new_system([&prom, this]() {
        auto system = _mavsdk.systems().back();
        if (system->has_autopilot()) {
            prom.set_value(system);
        }
    });

    if (fut.wait_for(std::chrono::seconds(10)) == std::future_status::timeout) {
        std::cerr << "No autopilot found after 10 seconds." << std::endl;
        return false;
    }

    _system = fut.get();
    _telemetry = std::make_unique<mavsdk::Telemetry>(_system);
    _action = std::make_unique<mavsdk::Action>(_system);

    return true;
}

bool VehicleConnection::arm() {
    if (!_action) return false;
    
    const auto result = _action->arm();
    return result == mavsdk::Action::Result::Success;
}

bool VehicleConnection::disarm() {
    if (!_action) return false;
    
    const auto result = _action->disarm();
    return result == mavsdk::Action::Result::Success;
}

bool VehicleConnection::takeoff() {
    if (!_action) return false;
    
    const auto result = _action->takeoff();
    return result == mavsdk::Action::Result::Success;
}

bool VehicleConnection::land() {
    if (!_action) return false;
    
    const auto result = _action->land();
    return result == mavsdk::Action::Result::Success;
}

mavsdk::Telemetry::Position VehicleConnection::getPosition() const {
    if (!_telemetry) return {};
    return _telemetry->position();
}

mavsdk::Telemetry::EulerAngle VehicleConnection::getAttitude() const {
    if (!_telemetry) return {};
    return _telemetry->attitude_euler();
}

float VehicleConnection::getBatteryPercentage() const {
    if (!_telemetry) return 0.0f;
    return _telemetry->battery().remaining_percent;
}