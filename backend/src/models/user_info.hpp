#pragma once

#include <string>
#include <chrono>
#include <memory>

namespace collabboard {

// Forward declaration
class WsSession;

/**
 * @brief Represents a user's identity and state within a room.
 */
struct UserInfo {
    std::string userId;          // Unique identifier (UUID)
    std::string userName;        // Display name
    std::string color;           // Hex color code (e.g., "#FF5733")
    std::weak_ptr<WsSession> session;  // Connection reference
    std::chrono::steady_clock::time_point lastActivity;  // For ghost detection
    bool isActive;               // false if ghost/disconnected

    UserInfo() 
        : lastActivity(std::chrono::steady_clock::now())
        , isActive(true)
    {}

    UserInfo(const std::string& id, const std::string& name, const std::string& col)
        : userId(id)
        , userName(name)
        , color(col)
        , lastActivity(std::chrono::steady_clock::now())
        , isActive(true)
    {}

    /**
     * @brief Update the last activity timestamp.
     */
    void touch() {
        lastActivity = std::chrono::steady_clock::now();
        isActive = true;
    }

    /**
     * @brief Check if user is a ghost (inactive for too long).
     * @param timeoutMs Timeout in milliseconds (default 3000ms)
     * @return true if user has been inactive longer than timeout
     */
    bool isGhost(int64_t timeoutMs = 3000) const {
        auto now = std::chrono::steady_clock::now();
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
            now - lastActivity
        ).count();
        return elapsed > timeoutMs;
    }

    /**
     * @brief Get milliseconds since last activity.
     */
    int64_t getIdleTimeMs() const {
        auto now = std::chrono::steady_clock::now();
        return std::chrono::duration_cast<std::chrono::milliseconds>(
            now - lastActivity
        ).count();
    }
};

/**
 * @brief Cursor position state for a user.
 */
struct CursorState {
    std::string oderId;
    float x = 0.0f;
    float y = 0.0f;
    std::chrono::steady_clock::time_point lastUpdate;
    bool visible = true;

    CursorState() : lastUpdate(std::chrono::steady_clock::now()) {}

    CursorState(const std::string& uid, float xPos, float yPos)
        : oderId(uid)
        , x(xPos)
        , y(yPos)
        , lastUpdate(std::chrono::steady_clock::now())
        , visible(true)
    {}

    void update(float newX, float newY) {
        x = newX;
        y = newY;
        lastUpdate = std::chrono::steady_clock::now();
        visible = true;
    }

    bool isStale(int64_t timeoutMs = 3000) const {
        auto now = std::chrono::steady_clock::now();
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
            now - lastUpdate
        ).count();
        return elapsed > timeoutMs;
    }
};

} // namespace collabboard
