#include "tlog_recorder.hpp"
#include <filesystem>
#include <chrono>
#include <iomanip>
#include <sstream>
#include <iostream>
#include <arpa/inet.h> // For net conversions

namespace fs = std::filesystem;

TLogRecorder& TLogRecorder::instance() {
    static TLogRecorder instance;
    return instance;
}

TLogRecorder::TLogRecorder() {
    // Determine log directory
    _log_dir = "./logs/sessions";
    if (!fs::exists(_log_dir)) {
        fs::create_directories(_log_dir);
    }
}

TLogRecorder::~TLogRecorder() {
    std::lock_guard<std::mutex> lock(_mutex);
    for (auto& pair : _active_logs) {
        if (pair.second && pair.second->is_open()) {
            pair.second->close();
        }
    }
}

bool TLogRecorder::start_recording(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (_active_logs.count(vehicle_id) && _active_logs[vehicle_id]->is_open()) {
        return true; // Already recording
    }

    auto now = std::chrono::system_clock::now();
    auto time_t = std::chrono::system_clock::to_time_t(now);
    std::stringstream ss;
    ss << std::put_time(std::localtime(&time_t), "%Y-%m-%d_%H-%M-%S");
    
    std::string filename = "session_" + vehicle_id + "_" + ss.str() + ".tlog";
    std::string filepath = _log_dir + "/" + filename;

    auto file = std::make_shared<std::ofstream>(filepath, std::ios::binary);
    if (!file->is_open()) {
        std::cerr << "Failed to open log file: " << filepath << std::endl;
        return false;
    }

    _active_logs[vehicle_id] = file;
    _active_filenames[vehicle_id] = filename;
    std::cout << "[TLog] Started recording: " << filepath << std::endl;
    return true;
}

void TLogRecorder::stop_recording(const std::string& vehicle_id) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (_active_logs.count(vehicle_id)) {
        if (_active_logs[vehicle_id]->is_open()) {
            _active_logs[vehicle_id]->close();
        }
        _active_logs.erase(vehicle_id);
        _active_filenames.erase(vehicle_id);
        std::cout << "[TLog] Stopped recording for vehicle: " << vehicle_id << std::endl;
    }
}

void TLogRecorder::record_message(const std::string& vehicle_id, const mavlink_message_t& message) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (!_active_logs.count(vehicle_id)) return;

    auto file = _active_logs[vehicle_id];
    if (!file || !file->is_open()) return;

    // Convert to wire format
    uint8_t buffer[MAVLINK_MAX_PACKET_LEN];
    uint16_t len = mavlink_msg_to_send_buffer(buffer, &message);

    // QGC TLog Format: 64-bit big-endian timestamp (us) + packet
    uint64_t timestamp_us = std::chrono::duration_cast<std::chrono::microseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    
    // Swap to Big Endian
    uint64_t timestamp_be = 
        ((timestamp_us & 0xFF00000000000000ULL) >> 56) |
        ((timestamp_us & 0x00FF000000000000ULL) >> 40) |
        ((timestamp_us & 0x0000FF0000000000ULL) >> 24) |
        ((timestamp_us & 0x000000FF00000000ULL) >> 8) |
        ((timestamp_us & 0x00000000FF000000ULL) << 8) |
        ((timestamp_us & 0x0000000000FF0000ULL) << 24) |
        ((timestamp_us & 0x000000000000FF00ULL) << 40) |
        ((timestamp_us & 0x00000000000000FFULL) << 56);
        
    file->write(reinterpret_cast<const char*>(&timestamp_be), sizeof(uint64_t));
    file->write(reinterpret_cast<const char*>(buffer), len);
}

json TLogRecorder::get_session_list() {
    json sessions = json::array();
    if (!fs::exists(_log_dir)) return sessions;

    for (const auto& entry : fs::directory_iterator(_log_dir)) {
        if (entry.path().extension() == ".tlog") {
            sessions.push_back({
                {"filename", entry.path().filename().string()},
                {"size", entry.file_size()},
                {"path", entry.path().string()}
            });
        }
    }
    return sessions;
}

std::string TLogRecorder::get_session_path(const std::string& session_id) {
    // Prevent directory traversal
    if (session_id.find("..") != std::string::npos) return "";
    
    std::string path = _log_dir + "/" + session_id;
    if (fs::exists(path)) return path;
    return "";
}

// Helper to decode MAVLink messages
json decode_mavlink_message_tlog(const mavlink_message_t& message) {
    json fields = json::object();
    
    switch (message.msgid) {
        case MAVLINK_MSG_ID_HEARTBEAT: {
            mavlink_heartbeat_t heartbeat;
            mavlink_msg_heartbeat_decode(&message, &heartbeat);
            fields = {
                {"type", heartbeat.type},
                {"autopilot", heartbeat.autopilot},
                {"base_mode", heartbeat.base_mode},
                {"custom_mode", heartbeat.custom_mode},
                {"system_status", heartbeat.system_status},
                {"mavlink_version", heartbeat.mavlink_version}
            };
            break;
        }
        case MAVLINK_MSG_ID_GPS_RAW_INT: {
            mavlink_gps_raw_int_t gps;
            mavlink_msg_gps_raw_int_decode(&message, &gps);
            fields = {
                {"time_usec", static_cast<uint64_t>(gps.time_usec)},
                {"fix_type", static_cast<uint8_t>(gps.fix_type)},
                {"lat", static_cast<int32_t>(gps.lat)},
                {"lon", static_cast<int32_t>(gps.lon)},
                {"alt", static_cast<int32_t>(gps.alt)},
                {"eph", static_cast<uint16_t>(gps.eph)},
                {"epv", static_cast<uint16_t>(gps.epv)},
                {"vel", static_cast<uint16_t>(gps.vel)},
                {"cog", static_cast<uint16_t>(gps.cog)},
                {"satellites_visible", static_cast<uint8_t>(gps.satellites_visible)}
            };
            break;
        }
        case MAVLINK_MSG_ID_SYS_STATUS: {
            mavlink_sys_status_t sys_status;
            mavlink_msg_sys_status_decode(&message, &sys_status);
            fields = {
                {"voltage_battery", static_cast<uint16_t>(sys_status.voltage_battery)},
                {"current_battery", static_cast<int16_t>(sys_status.current_battery)},
                {"battery_remaining", static_cast<int8_t>(sys_status.battery_remaining)}
            };
            break;
        }
        case MAVLINK_MSG_ID_ATTITUDE: {
            mavlink_attitude_t attitude;
            mavlink_msg_attitude_decode(&message, &attitude);
            fields = {
                {"time_boot_ms", attitude.time_boot_ms},
                {"roll", attitude.roll},
                {"pitch", attitude.pitch},
                {"yaw", attitude.yaw},
                {"rollspeed", attitude.rollspeed},
                {"pitchspeed", attitude.pitchspeed},
                {"yawspeed", attitude.yawspeed}
            };
            break;
        }
        case MAVLINK_MSG_ID_GLOBAL_POSITION_INT: {
            mavlink_global_position_int_t pos;
            mavlink_msg_global_position_int_decode(&message, &pos);
            fields = {
                {"time_boot_ms", pos.time_boot_ms},
                {"lat", pos.lat},
                {"lon", pos.lon},
                {"alt", pos.alt},
                {"relative_alt", pos.relative_alt},
                {"vx", pos.vx},
                {"vy", pos.vy},
                {"vz", pos.vz},
                {"hdg", pos.hdg}
            };
            break;
        }
        case MAVLINK_MSG_ID_VFR_HUD: {
            mavlink_vfr_hud_t vfr_hud;
            mavlink_msg_vfr_hud_decode(&message, &vfr_hud);
            fields = {
                {"airspeed", vfr_hud.airspeed},
                {"groundspeed", vfr_hud.groundspeed},
                {"heading", vfr_hud.heading},
                {"throttle", vfr_hud.throttle},
                {"alt", vfr_hud.alt},
                {"climb", vfr_hud.climb}
            };
            break;
        }
        case MAVLINK_MSG_ID_RC_CHANNELS: {
            mavlink_rc_channels_t rc;
            mavlink_msg_rc_channels_decode(&message, &rc);
            fields = {
                {"time_boot_ms", rc.time_boot_ms},
                {"chancount", rc.chancount},
                {"chan1_raw", rc.chan1_raw},
                {"chan2_raw", rc.chan2_raw},
                {"chan3_raw", rc.chan3_raw},
                {"chan4_raw", rc.chan4_raw}
            };
            break;
        }
    }
    return fields;
}

std::string TLogRecorder::get_session_data_json(const std::string& session_id) {
     std::string path = get_session_path(session_id);
     if (path.empty()) return "[]";

     std::ifstream file(path, std::ios::binary);
     if (!file.is_open()) return "[]";

     json output = json::array();
     
     while (file.peek() != EOF) {
         uint64_t timestamp_be;
         if (!file.read(reinterpret_cast<char*>(&timestamp_be), sizeof(uint64_t))) break;

         // Swap back to host order
         uint64_t timestamp_us = 
            ((timestamp_be & 0xFF00000000000000ULL) >> 56) |
            ((timestamp_be & 0x00FF000000000000ULL) >> 40) |
            ((timestamp_be & 0x0000FF0000000000ULL) >> 24) |
            ((timestamp_be & 0x000000FF00000000ULL) >> 8) |
            ((timestamp_be & 0x00000000FF000000ULL) << 8) |
            ((timestamp_be & 0x0000000000FF0000ULL) << 24) |
            ((timestamp_be & 0x000000000000FF00ULL) << 40) |
            ((timestamp_be & 0x00000000000000FFULL) << 56);
            
         // Read Header (Assuming V1/V2 mix, but we wrote it using mavlink_msg_to_send_buffer)
         // We must read carefully.
         // Actually, writing `mavlink_msg_to_send_buffer` writes the PACKET.
         // The packet STARTS with Magic.
         
         uint8_t magic;
         if (!file.read(reinterpret_cast<char*>(&magic), 1)) break;
         
         uint8_t len;
         if (!file.read(reinterpret_cast<char*>(&len), 1)) break;

         int packet_len = 0;
         if (magic == 0xFE) { // V1
            packet_len = len + 6 + 2; 
         } else if (magic == 0xFD) { // V2
            packet_len = len + 10 + 2; 
            // V2 signature is handled by parser but for raw reading?
            // "mavlink_msg_to_send_buffer" includes signature if present.
            // But we don't know if it's present from just first 2 bytes easily without parsing flags.
            // V2 Header: [Magic][Len][IncFlags][CmpFlags][Seq][Sys][Comp][MsgID 3 bytes]
            // We need to read flags to know if signature is there.
         } else {
             // Sync lost?
             break; 
         }
         
         // Rewind to read full packet
         file.seekg(-2, std::ios::cur);
         
         // Allocate buffer for max packet
         uint8_t buffer[MAVLINK_MAX_PACKET_LEN];
         // Ideally we want to read exactly `packet_len`.
         // But for V2 we need to read header to know length.
         // Let's rely on MAVLink helper which parses byte by byte?
         // No, simpler: Read a chunk, parse it.
         
         // MVP approach: We assume V1 (0xFE) or standard V2 (0xFD) without signature for now?
         // Or just read 280 bytes (MAX) and let the parser figure it out?
         // No, that messes up the next timestamp.
         
         // Correct way: Read Header -> Calculate Len -> Read Rest.
         if (magic == 0xFE) {
             packet_len = len + 8; // 6 header + 2 crc
         } else if (magic == 0xFD) {
             // Need flags
             uint8_t flags[2];
             if (!file.read(reinterpret_cast<char*>(flags), 2)) break;
             bool has_signature = (flags[0] & 0x01);
             packet_len = len + 12; // 10 header + 2 crc
             if (has_signature) packet_len += 13;
             file.seekg(-2, std::ios::cur); // Rewind flags
         }

         file.seekg(-2, std::ios::cur); // Rewind Magic/Len
         
         if (!file.read(reinterpret_cast<char*>(buffer), packet_len)) break;

         mavlink_message_t msg;
         mavlink_status_t status;
         bool msg_received = false;
         for (int i = 0; i < packet_len; ++i) {
             if (mavlink_parse_char(MAVLINK_COMM_0, buffer[i], &msg, &status)) {
                 msg_received = true;
                 break;
             }
         }
         
         if (msg_received) {
             json fields = decode_mavlink_message_tlog(msg);
             if (!fields.empty()) {
                 output.push_back({
                     {"timestamp_us", timestamp_us},
                     {"msgid", static_cast<uint32_t>(msg.msgid)},
                     {"sysid", static_cast<uint8_t>(msg.sysid)},
                     {"compid", static_cast<uint8_t>(msg.compid)},
                     {"data", fields}
                 });
             }
         }
     }
     
     return output.dump();
}
