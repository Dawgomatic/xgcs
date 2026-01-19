#include "log_file_manager.hpp"
#include <iostream>
#include <thread>
#include <filesystem>

LogFileManager::LogFileManager() : _log_files_plugin(nullptr) {}

void LogFileManager::init(std::shared_ptr<mavsdk::System> system) {
    if (system) {
        _log_files_plugin = std::make_shared<mavsdk::LogFiles>(system);
        std::cout << "[LogFileManager] Initialized with system." << std::endl;
    }
}

std::string LogFileManager::get_log_list() {
    if (!_log_files_plugin) {
        return "[]";
    }

    std::cout << "[LogFileManager] Requesting log entries..." << std::endl;
    auto result_pair = _log_files_plugin->get_entries();
    if (result_pair.first != mavsdk::LogFiles::Result::Success) {
        std::cerr << "[LogFileManager] Failed to get entries: " << result_pair.first << std::endl;
        return "[]";
    }

    json entries_json = json::array();
    for (const auto& entry : result_pair.second) {
        entries_json.push_back({
            {"id", entry.id},
            {"date", entry.date},
            {"size_bytes", entry.size_bytes}
        });
    }
    return entries_json.dump();
}

std::string LogFileManager::start_download(int log_id, const std::string& target_directory) {
    if (!_log_files_plugin) {
        return "";
    }

    std::lock_guard<std::mutex> lock(_mutex);

    // Find the entry first (inefficient but safe)
    auto result_pair = _log_files_plugin->get_entries();
    if (result_pair.first != mavsdk::LogFiles::Result::Success) {
        return "";
    }

    mavsdk::LogFiles::Entry target_entry;
    bool found = false;
    for (const auto& entry : result_pair.second) {
        if (entry.id == static_cast<uint32_t>(log_id)) {
            target_entry = entry;
            found = true;
            break;
        }
    }

    if (!found) {
        return "";
    }

    // Prepare target path
    std::filesystem::path dir(target_directory);
    if (!std::filesystem::exists(dir)) {
        std::filesystem::create_directories(dir);
    }
    
    // Construct filename: log_ID_DATE.ulg (or .bin)
    // Sanitizing date string might be needed, but usually ISO8601 is okay-ish on linux if no colons?
    // Actually colons are bad on some FS. Let's just use ID.
    std::string filename = "log_" + std::to_string(log_id) + ".ulg"; 
    std::filesystem::path filepath = dir / filename;

    // Initialize state
    _downloads[log_id] = { "downloading", 0.0f, "", filepath.string(), target_entry };

    // Start async download
    _log_files_plugin->download_log_file_async(
        target_entry,
        filepath.string(),
        [this, log_id](mavsdk::LogFiles::Result result, mavsdk::LogFiles::ProgressData progress) {
            std::lock_guard<std::mutex> cb_lock(_mutex);
            auto& state = _downloads[log_id];
            
            if (result == mavsdk::LogFiles::Result::Next) {
                state.progress = progress.progress;
            } else if (result == mavsdk::LogFiles::Result::Success) {
                state.status = "success";
                state.progress = 1.0f;
                std::cout << "[LogFileManager] Download complete: " << state.file_path << std::endl;
            } else {
                state.status = "error";
                state.error_message = "Download failed"; // Could extract enum string
                std::cerr << "[LogFileManager] Download failed: " << result << std::endl;
            }
        }
    );
    
    return filepath.string();
}

json LogFileManager::get_download_status(int log_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (_downloads.find(log_id) == _downloads.end()) {
        return { {"status", "unknown"}, {"progress", 0.0} };
    }
    const auto& state = _downloads[log_id];
    return {
        {"status", state.status},
        {"progress", state.progress},
        {"error", state.error_message},
        {"file", state.file_path}
    };
}
