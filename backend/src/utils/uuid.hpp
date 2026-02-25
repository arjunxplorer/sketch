// UUID - UUID generation utilities

#pragma once

#include <string>
#include <random>
#include <sstream>
#include <iomanip>
#include <array>


namespace collabboard {
/**
 * @brief UUID generator for creating unique identifiers.
 * 
 * Generates RFC 4122 compliant UUID v4 (random) identifiers.
 * Thread-safe when each thread uses its own generator instance,
 * or when using the static generateUUID() function which uses thread_local.
 * 
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * Where x is any hex digit and y is one of 8, 9, A, or B.
 */

class UUIDGenerator {
public:
    /**
     * @brief Construct a new UUID Generator.
     * Uses std::random_device for seeding, which provides
     * non-deterministic random numbers on most platforms.
     */
     UUIDGenerator()
        : rng_(std::random_device{}())
        , dist_(0,15)
        , dist_variant_(8,11)
    {}
    /**
    * @brief Generate a new UUID v4 string.
    * @return UUID string in format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    */
    std::string generate(){
        std::ostringstream ss;
        ss<< std::hex << std::setfill('0');

        //First segment: 8 hex digit
        for(int i=0; i<8; ++i){
            ss << dist_(rng_);
        }
        ss <<'-';
        // Second segment: 4 hex digits
        for (int i = 0; i < 4; ++i) {
            ss << dist_(rng_);
        }
        ss << '-';

        // Third segment: 4xxx (version 4)
        ss << '4';  // UUID version 4
        for (int i = 0; i < 3; ++i) {
            ss << dist_(rng_);
        }
        ss << '-';

        // Fourth segment: yxxx (variant bits)
        ss << std::hex << dist_variant_(rng_);  // y is 8, 9, A, or B
        for (int i = 0; i < 3; ++i) {
            ss << dist_(rng_);
        }
        ss << '-';

        // Fifth segment: 12 hex digits
        for (int i = 0; i < 12; ++i) {
            ss << dist_(rng_);
        }
        return ss.str();
    }
    /**
     * @brief Generate a short ID (8 characters) for less critical uses.
     * @return 8-character hex string
     * 
     * Useful for stroke IDs where full UUID length is unnecessary.
     */
     std::string generateShort() {
        std::ostringstream ss;
        ss << std::hex << std::setfill('0');
        for (int i = 0; i < 8; ++i) {
            ss << dist_(rng_);
        }
        return ss.str();
    }

    private:
    std::mt19937 rng_;
    std::uniform_int_distribution<int> dist_;
    std::uniform_int_distribution<int> dist_variant_;
};

/**
 * @brief Generate a UUID v4 string using a thread-local generator.
 * @return UUID string in format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * 
 * This is the recommended way to generate UUIDs in most cases.
 * Thread-safe and doesn't require managing generator instances.
 * 
 * Example:
 *   std::string id = collabboard::generateUUID();
 *   // id = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
 */

inline std::string generateUUID() {
    thread_local UUIDGenerator generator;
    return generator.generate();
}

/**
 * @brief Generate a short ID (8 hex characters) using a thread-local generator.
 * @return 8-character hex string
 * 
 * Example:
 *   std::string id = collabboard::generateShortId();
 *   // id = "a1b2c3d4"
 */
inline std::string generateShortId() {
    thread_local UUIDGenerator generator;
    return generator.generateShort();
}
/**
 * @brief Validate if a string is a valid UUID v4 format.
 * @param uuid The string to validate
 * @return true if valid UUID v4 format, false otherwise
 * 
 * Checks format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * Where all x are hex digits, version is 4, and y is 8-B.
 */

inline bool isValidUUID(const std::string& uuid){
    if(uuid.length() != 36){
        return false;
    }

    if (uuid[8] != '-' || uuid[13] != '-' || uuid[18] != '-' || uuid[23] != '-') {
        return false;
    }
    // Check version (position 14 should be '4')
    if (uuid[14] != '4') {
        return false;
    }

    // Check variant (position 19 should be 8, 9, a, b, A, or B)
    char variant = uuid[19];
    if (variant != '8' && variant != '9' && 
        variant != 'a' && variant != 'b' &&
        variant != 'A' && variant != 'B') {
        return false;
    }

    // Check all other characters are hex digits
    for (size_t i = 0; i < uuid.length(); ++i) {
        if (i == 8 || i == 13 || i == 18 || i == 23) {
            continue;  // Skip dashes
        }
        char c = uuid[i];
        if (!((c >= '0' && c <= '9') || 
              (c >= 'a' && c <= 'f') || 
              (c >= 'A' && c <= 'F'))) {
            return false;
        }
    }

    return true;
}

/**
 * @brief Generate a user-friendly room ID.
 * @return Room ID in format: room-xxxxxxxx
 * 
 * Example:
 *   std::string roomId = collabboard::generateRoomId();
 *   // roomId = "room-a1b2c3d4"
 */
 inline std::string generateRoomId() {
    return "room-" + generateShortId();
}

/**
 * @brief Generate a user ID with prefix.
 * @return User ID in format: user-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * 
 * Example:
 *   std::string oderId = collabboard::generateUserId();
 *   // oderId = "user-f47ac10b-58cc-4372-a567-0e02b2c3d479"
 */
inline std::string generateUserId() {
    return "user-" + generateUUID();
}

/**
 * @brief Generate a stroke ID with prefix.
 * @return Stroke ID in format: stroke-xxxxxxxx
 * 
 * Example:
 *   std::string strokeId = collabboard::generateStrokeId();
 *   // strokeId = "stroke-a1b2c3d4"
 */
inline std::string generateStrokeId() {
    return "stroke-" + generateShortId();
}

} // namespace collabboard
