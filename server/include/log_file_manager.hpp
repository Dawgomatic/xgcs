#pragma once

#include <mavsdk/mavsdk.h>
#include <mavsdk/plugins/log_files/log_files.h>
#include <nlohmann/json.hpp>
#include <memory>
#include <string>
#include <vector>
#include <mutex>
#include <map>

using json = nlohmann::json;

class LogFileManager {
public:
    LogFileManager();
    ~LogFileManager() = default;

    // Initialize with the system
    void init(std::shared_ptr<mavsdk::System> system);

    // List logs
    // Returns a JSON list of log entries: [{id, date, size_bytes}, ...]
    std::string get_log_list();

    // Trigger download of a specific log entry
    // Returns a unique download ID or error
    std::string start_download(int log_id, const std::string& target_directory);

    // Check download status
    // Returns JSON: { status: "downloading"|"success"|"error", progress: 0.0-1.0, error: "" }
    json get_download_status(int log_id);

private:
    std::shared_ptr<mavsdk::LogFiles> _log_files_plugin;
    std::mutex _mutex;

    // Track download progress: log_id -> progress (0.0 - 1.0)
    struct DownloadState {
        std::string status; // "downloading", "success", "error"
        float progress;
        std::string error_message;
        std::string file_path;
        mavsdk::LogFiles::Entry entry;
    };
    std::map<int, DownloadState> _downloads;
};
