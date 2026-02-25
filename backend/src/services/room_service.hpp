#pragma once

#include <string>
#include <memory>
#include <unordered_map>
#include <mutex>
#include <optional>
#include <functional>
#include <array>
#include <chrono>

#include "../models/room.hpp"
#include "../models/user_info.hpp"
#include "../utils/uuid.hpp"
#include "../protocol/message_codec.hpp"
#include "../protocol/message_types.hpp"
#include "presence_service.hpp"
#include "board_service.hpp"

namespace collabboard {

// Forward declaration
class WsSession;

/**
 * @brief Result of a join room operation.
 */
struct JoinResult {
    bool success;
    ErrorCode errorCode;
    std::string oderId;
    std::string color;
    std::string errorMessage;

    static JoinResult Success(const std::string& uid, const std::string& col) {
        return {true, ErrorCode::InternalError, uid, col, ""};
    }

    static JoinResult Failure(ErrorCode code, const std::string& msg = "") {
        return {false, code, "", "", msg};
    }
};

/**
 * @brief Central service managing all rooms and routing messages.
 */
class RoomService {
public:
    using SendFunc = std::function<void(std::shared_ptr<WsSession>, const std::string&)>;

    explicit RoomService(std::chrono::seconds emptyRoomGracePeriod = std::chrono::seconds(60))
        : emptyRoomGracePeriod_(emptyRoomGracePeriod)
        , nextColorIndex_(0) {
        // Initialize color palette
        colorPalette_ = {
            "#FF5733", "#33FF57", "#3357FF", "#FF33F5", "#F5FF33",
            "#33FFF5", "#FF8C33", "#8C33FF", "#33FF8C", "#FF338C",
            "#338CFF", "#8CFF33", "#FF3333", "#33FF33", "#3333FF"
        };
    }

    // =========================================================================
    // Room Management
    // =========================================================================

    /**
     * @brief Create a new room or get existing one.
     * @return Pointer to the room
     */
    std::shared_ptr<Room> getOrCreateRoom(const std::string& roomId, 
                                           const std::string& password = "") {
        std::lock_guard<std::mutex> lock(roomsMutex_);
        cleanupExpiredRoomsLocked();

        // Cancel any pending deletion - someone is joining
        roomsPendingDeletion_.erase(roomId);

        auto it = rooms_.find(roomId);
        if (it != rooms_.end()) {
            return it->second;
        }

        auto room = std::make_shared<Room>(roomId, password);
        rooms_[roomId] = room;
        return room;
    }

    /**
     * @brief Get a room by ID.
     * @return Pointer to room, or nullptr if not found
     */
    std::shared_ptr<Room> getRoom(const std::string& roomId) {
        std::lock_guard<std::mutex> lock(roomsMutex_);
        cleanupExpiredRoomsLocked();
        auto it = rooms_.find(roomId);
        return (it != rooms_.end()) ? it->second : nullptr;
    }

    /**
     * @brief Check if a room exists.
     */
    bool roomExists(const std::string& roomId) {
        std::lock_guard<std::mutex> lock(roomsMutex_);
        return rooms_.find(roomId) != rooms_.end();
    }

    /**
     * @brief Delete a room.
     */
    void deleteRoom(const std::string& roomId) {
        std::lock_guard<std::mutex> lock(roomsMutex_);
        rooms_.erase(roomId);
    }

    /**
     * @brief Get room count.
     */
    size_t getRoomCount() const {
        std::lock_guard<std::mutex> lock(roomsMutex_);
        return rooms_.size();
    }

    // =========================================================================
    // User Join/Leave
    // =========================================================================

    /**
     * @brief Join a user to a room.
     */
    JoinResult joinRoom(const std::string& roomId,
                        const std::string& userName,
                        const std::string& password,
                        std::shared_ptr<WsSession> session,
                        SendFunc sendFunc) {
        // Get or create room
        auto room = getOrCreateRoom(roomId, password);

        // Validate password
        if (!room->validatePassword(password)) {
            return JoinResult::Failure(ErrorCode::InvalidPassword);
        }

        // Check capacity
        if (room->isFull()) {
            return JoinResult::Failure(ErrorCode::RoomFull);
        }

        // Assign user ID and color
        std::string oderId = generateUserId();
        std::string color = getNextColor();

        // Create user info
        UserInfo userInfo(oderId, userName, color);
        userInfo.session = session;

        // Add to room
        if (!room->addParticipant(oderId, userInfo)) {
            return JoinResult::Failure(ErrorCode::RoomFull);
        }

        // Get existing users for welcome message
        auto existingUsers = room->getParticipants();

        // Send welcome to joining user
        uint64_t welcomeSeq = room->nextSequence();
        std::string welcomeMsg = MessageCodec::createWelcome(
            oderId, color, existingUsers, welcomeSeq
        );
        sendFunc(session, welcomeMsg);

        // Send room state (board snapshot)
        std::string stateMsg = boardService_.getSnapshot(*room);
        sendFunc(session, stateMsg);

        // Broadcast user_joined to others
        uint64_t joinSeq = room->nextSequence();
        std::string joinMsg = MessageCodec::createUserJoined(
            oderId, userName, color, joinSeq
        );
        room->broadcast(joinMsg, oderId, [&sendFunc, &joinMsg](std::shared_ptr<WsSession> s) {
            sendFunc(s, joinMsg);
        });

        return JoinResult::Success(oderId, color);
    }

    /**
     * @brief Remove a user from a room.
     */
    void leaveRoom(const std::string& roomId,
                   const std::string& oderId,
                   SendFunc sendFunc) {
        auto room = getRoom(roomId);
        if (!room) return;

        // Remove participant
        room->removeParticipant(oderId);

        // Clean up presence tracking
        presenceService_.removeUser(oderId);

        // Broadcast user_left
        uint64_t seq = room->nextSequence();
        std::string leaveMsg = MessageCodec::createUserLeft(oderId, seq);
        room->broadcast(leaveMsg, "", [&sendFunc, &leaveMsg](std::shared_ptr<WsSession> s) {
            sendFunc(s, leaveMsg);
        });

        // Schedule room deletion if empty - grace period allows reconnection on refresh
        if (room->isEmpty()) {
            auto deadline = std::chrono::steady_clock::now() + emptyRoomGracePeriod_;
            roomsPendingDeletion_[roomId] = deadline;
        }
    }

    // =========================================================================
    // Message Routing
    // =========================================================================

    /**
     * @brief Route a cursor move message.
     * @return Error code if failed, nullopt if success
     */
    std::optional<ErrorCode> handleCursorMove(const std::string& roomId,
                                               const std::string& oderId,
                                               float x, float y,
                                               SendFunc sendFunc) {
        auto room = getRoom(roomId);
        if (!room) {
            return ErrorCode::RoomNotFound;
        }

        if (!presenceService_.handleCursorMove(*room, oderId, x, y, sendFunc)) {
            return ErrorCode::RateLimited;
        }

        return std::nullopt;
    }

    /**
     * @brief Route a stroke_start message.
     */
    std::optional<ErrorCode> handleStrokeStart(const std::string& roomId,
                                                const std::string& oderId,
                                                const std::string& strokeId,
                                                const std::string& color,
                                                float width,
                                                SendFunc sendFunc) {
        auto room = getRoom(roomId);
        if (!room) {
            return ErrorCode::RoomNotFound;
        }

        return boardService_.handleStrokeStart(*room, oderId, strokeId, color, width, sendFunc);
    }

    /**
     * @brief Route a stroke_add message.
     */
    std::optional<ErrorCode> handleStrokeAdd(const std::string& roomId,
                                              const std::string& oderId,
                                              const std::string& strokeId,
                                              const std::vector<Point>& points,
                                              SendFunc sendFunc) {
        auto room = getRoom(roomId);
        if (!room) {
            return ErrorCode::RoomNotFound;
        }

        // Update user activity
        presenceService_.updateLastSeen(*room, oderId);

        return boardService_.handleStrokeAdd(*room, oderId, strokeId, points, sendFunc);
    }

    /**
     * @brief Route a stroke_end message.
     */
    std::optional<ErrorCode> handleStrokeEnd(const std::string& roomId,
                                              const std::string& oderId,
                                              const std::string& strokeId,
                                              SendFunc sendFunc) {
        auto room = getRoom(roomId);
        if (!room) {
            return ErrorCode::RoomNotFound;
        }

        return boardService_.handleStrokeEnd(*room, oderId, strokeId, sendFunc);
    }

    /**
     * @brief Route a stroke_move message.
     */
    std::optional<ErrorCode> handleStrokeMove(const std::string& roomId,
                                              const std::string& oderId,
                                              const std::string& strokeId,
                                              float dx, float dy,
                                              SendFunc sendFunc) {
        auto room = getRoom(roomId);
        if (!room) {
            return ErrorCode::RoomNotFound;
        }

        return boardService_.handleStrokeMove(*room, oderId, strokeId, dx, dy, sendFunc);
    }

    // =========================================================================
    // Service Access
    // =========================================================================

    PresenceService& getPresenceService() { return presenceService_; }
    BoardService& getBoardService() { return boardService_; }

private:
    /**
     * @brief Delete rooms that have been empty past the grace period.
     * Must be called with roomsMutex_ held.
     */
    void cleanupExpiredRoomsLocked() {
        auto now = std::chrono::steady_clock::now();
        for (auto it = roomsPendingDeletion_.begin(); it != roomsPendingDeletion_.end(); ) {
            if (it->second <= now) {
                rooms_.erase(it->first);
                it = roomsPendingDeletion_.erase(it);
            } else {
                ++it;
            }
        }
    }

    /**
     * @brief Get the next color from the palette.
     */
    std::string getNextColor() {
        std::lock_guard<std::mutex> lock(colorMutex_);
        std::string color = colorPalette_[nextColorIndex_];
        nextColorIndex_ = (nextColorIndex_ + 1) % colorPalette_.size();
        return color;
    }

    std::chrono::seconds emptyRoomGracePeriod_;
    std::unordered_map<std::string, std::shared_ptr<Room>> rooms_;
    std::unordered_map<std::string, std::chrono::steady_clock::time_point> roomsPendingDeletion_;
    mutable std::mutex roomsMutex_;

    PresenceService presenceService_;
    BoardService boardService_;

    std::array<std::string, 15> colorPalette_;
    size_t nextColorIndex_;
    std::mutex colorMutex_;
};

} // namespace collabboard
