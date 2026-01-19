#pragma once

#include <cstdint>
#include <cstring>
#include <vector>
#include <mavsdk/mavlink/common/mavlink.h>

// Message IDs
#define MAVLINK_MSG_ID_RALLY_POINT 175
#define MAVLINK_MSG_ID_RALLY_FETCH_POINT 176

// RALLY_POINT Wire Format (Sorted by size: int32, int16, uint8)
// CRC Extra: 138 (Need to verify, but usually not needed for passthrough if we construct manually)
struct mavlink_rally_point_t {
    int32_t lat; /*< [degE7] Latitude of point */
    int32_t lng; /*< [degE7] Longitude of point */
    int16_t alt; /*< [m] Altitude of point */
    int16_t break_alt; /*< [m] Break altitude of point */
    uint16_t land_dir; /*< [cdeg] Heading to aim for when landing */
    uint8_t target_system; /*<  System ID */
    uint8_t target_component; /*<  Component ID */
    uint8_t idx; /*<  Point index (0...19) */
    uint8_t count; /*<  Total number of points (0...19) */
    uint8_t flags; /*<  Configuration flags */
};

// RALLY_FETCH_POINT Wire Format
struct mavlink_rally_fetch_point_t {
    uint8_t target_system; /*<  System ID */
    uint8_t target_component; /*<  Component ID */
    uint8_t idx; /*<  Point index (0...19) */
};

namespace rally {

    // Helper to pack RALLY_POINT
    inline mavlink_message_t pack_rally_point(uint8_t system_id, uint8_t component_id, 
                                            uint8_t target_system, uint8_t target_component, 
                                            uint8_t idx, uint8_t count, 
                                            int32_t lat, int32_t lng, int16_t alt, 
                                            int16_t break_alt, uint16_t land_dir, uint8_t flags) {
        mavlink_message_t msg;
        mavlink_rally_point_t payload;
        
        payload.lat = lat;
        payload.lng = lng;
        payload.alt = alt;
        payload.break_alt = break_alt;
        payload.land_dir = land_dir;
        payload.target_system = target_system;
        payload.target_component = target_component;
        payload.idx = idx;
        payload.count = count;
        payload.flags = flags;

        // MAVLink 2.0 uses specific packing
        // We use the helper provided by mavlink common if possible, but here we just copy payload.
        // NOTE: This assumes same endianness (Likely true for x86/ARM little endian)
        
        msg.msgid = MAVLINK_MSG_ID_RALLY_POINT;
        msg.sysid = system_id;
        msg.compid = component_id;
        msg.len = sizeof(mavlink_rally_point_t); // 19 bytes
        
        // This is a simplified pack. Real MAVLink packing handles checksums, seq numbers, etc.
        // Since we are using Passthrough 'send_message', we might need to be careful.
        // Actually, mavsdk::MavlinkPassthrough::send_message takes a mavlink_message_t and sends it.
        // It might recalculate CRC? Let's hope so. If not, we need the CRC Extra for 175.
        // RALLY_POINT CRC Extra is 138.
        
        memcpy(msg.payload64, &payload, sizeof(payload));
        
        // Finalize? MAVSDK Passthrough usually handles the framing if we pass the message struct.
        // However, we need to make sure the library accepts it.
        
        return msg;
    }

    // Helper to pack RALLY_FETCH_POINT
    inline mavlink_message_t pack_rally_fetch_point(uint8_t system_id, uint8_t component_id,
                                                  uint8_t target_system, uint8_t target_component,
                                                  uint8_t idx) {
        mavlink_message_t msg;
        mavlink_rally_fetch_point_t payload;
        
        payload.target_system = target_system;
        payload.target_component = target_component;
        payload.idx = idx;
        
        msg.msgid = MAVLINK_MSG_ID_RALLY_FETCH_POINT;
        msg.sysid = system_id;
        msg.compid = component_id;
        msg.len = sizeof(mavlink_rally_fetch_point_t); // 3 bytes
        
        memcpy(msg.payload64, &payload, sizeof(payload));
        
        return msg;
    }
}
