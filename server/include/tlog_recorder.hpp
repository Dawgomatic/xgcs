#pragma once

#include <mavsdk/mavsdk.h>
#include <string>
#include <vector>
#include <mutex>
#include <fstream>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

class TLogRecorder {
public:
    static TLogRecorder& instance();

    bool start_recording(const std::string& vehicle_id);
    void stop_recording(const std::string& vehicle_id);
    void record_message(const std::string& vehicle_id, const mavlink_message_t& message);
    
    // API Support
    json get_session_list();
    std::string get_session_path(const std::string& session_id);
    std::string get_session_data_json(const std::string& session_id); // Basic JSON conversion for frontend MVP

private:
    TLogRecorder();
    ~TLogRecorder();

    std::string _log_dir;
    std::mutex _mutex;
    std::unordered_map<std::string, std::shared_ptr<std::ofstream>> _active_logs;
    std::unordered_map<std::string, std::string> _active_filenames;
};
