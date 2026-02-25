#pragma once

#include <string>
#include <memory>
#include <functional>

#include "../models/room.hpp"
#include "../models/user_info.hpp"
#include "../utils/rate_limiter.hpp"
#include "../protocol/message_codec.hpp"

namespace collabboard {

/**
 * @brief Handles cursor position updates, rate limiting, and ghost cursor detection.
 */
class PresenceService {
public:
    PresenceService()
        : rateLimiter_()  // Uses default 20 Hz, burst of 5
    {}

    /**
     * @brief Handle a cursor move from a user.
     * @param room The room to broadcast to
     * @param oderId The user moving their cursor
     * @param x X position
     * @param y Y position
     * @param sendFunc Function to send message to a session
     * @return true if cursor update was processed, false if rate limited
     */
    bool handleCursorMove(Room& room,
                          const std::string& oderId,
                          float x, float y,
                          std::function<void(std::shared_ptr<WsSession>, const std::string&)> sendFunc) {
        // Check rate limit
        if (!rateLimiter_.tryConsume(oderId)) {
            return false;  // Rate limited
        }

        // Update cursor in room
        room.updateCursor(oderId, x, y);

        // Get user info for the cursor message
        auto* user = room.getParticipant(oderId);
        if (!user) {
            return false;
        }

        // Broadcast cursor position to other users
        uint64_t seq = room.nextSequence();
        std::string message = MessageCodec::createCursorMove(oderId, x, y, seq);

        room.broadcast(message, oderId, [&sendFunc, &message](std::shared_ptr<WsSession> session) {
            sendFunc(session, message);
        });

        return true;
    }

    /**
     * @brief Update a user's last seen timestamp.
     */
    void updateLastSeen(Room& room, const std::string& oderId) {
        auto* user = room.getParticipant(oderId);
        if (user) {
            user->touch();
        }
    }

    /**
     * @brief Get list of ghost users (inactive for too long).
     * @param room The room to check
     * @param timeoutMs Inactivity timeout in milliseconds
     * @return Vector of user IDs that are ghosts
     */
    std::vector<std::string> getGhostUsers(Room& room, int64_t timeoutMs = 3000) {
        std::vector<std::string> ghosts;
        auto participants = room.getParticipants();
        
        for (const auto& user : participants) {
            if (user.isGhost(timeoutMs)) {
                ghosts.push_back(user.userId);
            }
        }
        
        return ghosts;
    }

    /**
     * @brief Mark ghost users as inactive.
     */
    void markGhostsInactive(Room& room, int64_t timeoutMs = 3000) {
        auto ids = room.getParticipantIds();
        for (const auto& oderId : ids) {
            auto* user = room.getParticipant(oderId);
            if (user && user->isGhost(timeoutMs)) {
                user->isActive = false;
            }
        }
    }

    /**
     * @brief Clean up rate limiter for a user who left.
     */
    void removeUser(const std::string& oderId) {
        rateLimiter_.remove(oderId);
    }

    /**
     * @brief Check if a user is currently rate limited.
     */
    bool isRateLimited(const std::string& oderId) {
        return !rateLimiter_.canConsume(oderId);
    }

private:
    CursorRateLimiter rateLimiter_;
};

} // namespace collabboard
