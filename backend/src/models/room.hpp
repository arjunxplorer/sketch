#pragma once

#include <string>
#include <unordered_map>
#include <vector>
#include <memory>
#include <mutex>
#include <atomic>
#include <functional>
#include <algorithm>

#include "user_info.hpp"
#include "stroke.hpp"
#include "../protocol/message_types.hpp"

namespace collabboard {

// Forward declaration
class WsSession;

/**
 * @brief Represents a collaborative room with participants and board state.
 */
class Room {
public:
    using BroadcastCallback = std::function<void(const std::string&)>;

    explicit Room(const std::string& id, const std::string& password = "")
        : roomId_(id)
        , password_(password)
        , nextSeq_(1)
        , maxStrokes_(ProtocolConstants::MaxStrokesPerRoom)
        , maxUsers_(ProtocolConstants::MaxUsersPerRoom)
    {}

    // Non-copyable
    Room(const Room&) = delete;
    Room& operator=(const Room&) = delete;

    // Not movable (contains atomic and mutex)
    Room(Room&&) = delete;
    Room& operator=(Room&&) = delete;

    // =========================================================================
    // Room Properties
    // =========================================================================

    const std::string& getId() const { return roomId_; }
    bool hasPassword() const { return !password_.empty(); }
    
    bool validatePassword(const std::string& pwd) const {
        if (password_.empty()) return true;
        return password_ == pwd;
    }

    // =========================================================================
    // Participant Management
    // =========================================================================

    /**
     * @brief Add a participant to the room.
     * @return true if added, false if room is full
     */
    bool addParticipant(const std::string& oderId, const UserInfo& info) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (participants_.size() >= maxUsers_) {
            return false;
        }
        participants_[oderId] = info;
        cursors_[oderId] = CursorState(oderId, 0, 0);
        return true;
    }

    /**
     * @brief Remove a participant from the room.
     */
    void removeParticipant(const std::string& oderId) {
        std::lock_guard<std::mutex> lock(mutex_);
        participants_.erase(oderId);
        cursors_.erase(oderId);
    }

    /**
     * @brief Get a participant by ID.
     * @return Pointer to UserInfo, or nullptr if not found
     */
    UserInfo* getParticipant(const std::string& oderId) {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = participants_.find(oderId);
        return (it != participants_.end()) ? &it->second : nullptr;
    }

    /**
     * @brief Get number of participants.
     */
    size_t getParticipantCount() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return participants_.size();
    }

    /**
     * @brief Check if room is empty.
     */
    bool isEmpty() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return participants_.empty();
    }

    /**
     * @brief Check if room is full.
     */
    bool isFull() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return participants_.size() >= maxUsers_;
    }

    /**
     * @brief Get all participant IDs.
     */
    std::vector<std::string> getParticipantIds() const {
        std::lock_guard<std::mutex> lock(mutex_);
        std::vector<std::string> ids;
        ids.reserve(participants_.size());
        for (const auto& [id, _] : participants_) {
            ids.push_back(id);
        }
        return ids;
    }

    /**
     * @brief Get all participants as a vector.
     */
    std::vector<UserInfo> getParticipants() const {
        std::lock_guard<std::mutex> lock(mutex_);
        std::vector<UserInfo> users;
        users.reserve(participants_.size());
        for (const auto& [_, info] : participants_) {
            users.push_back(info);
        }
        return users;
    }

    // =========================================================================
    // Cursor Management
    // =========================================================================

    /**
     * @brief Update a user's cursor position.
     */
    void updateCursor(const std::string& oderId, float x, float y) {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = cursors_.find(oderId);
        if (it != cursors_.end()) {
            it->second.update(x, y);
        }
        // Also update user's last activity
        auto userIt = participants_.find(oderId);
        if (userIt != participants_.end()) {
            userIt->second.touch();
        }
    }

    /**
     * @brief Get a user's cursor state.
     */
    CursorState* getCursor(const std::string& oderId) {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = cursors_.find(oderId);
        return (it != cursors_.end()) ? &it->second : nullptr;
    }

    /**
     * @brief Get all cursors.
     */
    std::unordered_map<std::string, CursorState> getCursors() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return cursors_;
    }

    // =========================================================================
    // Stroke Management
    // =========================================================================

    /**
     * @brief Add a stroke to the room.
     */
    void addStroke(const Stroke& stroke) {
        std::lock_guard<std::mutex> lock(mutex_);
        strokes_.push_back(stroke);
        pruneStrokesIfNeeded();
    }

    /**
     * @brief Get a stroke by ID.
     */
    Stroke* getStroke(const std::string& strokeId) {
        std::lock_guard<std::mutex> lock(mutex_);
        for (auto& stroke : strokes_) {
            if (stroke.strokeId == strokeId) {
                return &stroke;
            }
        }
        return nullptr;
    }

    /**
     * @brief Get all strokes (for snapshot).
     */
    std::vector<Stroke> getStrokes() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return strokes_;
    }

    /**
     * @brief Get recent strokes for snapshot (up to limit).
     */
    std::vector<Stroke> getStrokesSnapshot(size_t limit = 500) const {
        std::lock_guard<std::mutex> lock(mutex_);
        if (strokes_.size() <= limit) {
            return strokes_;
        }
        return std::vector<Stroke>(
            strokes_.end() - static_cast<std::ptrdiff_t>(limit),
            strokes_.end()
        );
    }

    /**
     * @brief Get stroke count.
     */
    size_t getStrokeCount() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return strokes_.size();
    }

    // =========================================================================
    // Sequence Numbers
    // =========================================================================

    /**
     * @brief Get the next sequence number.
     */
    uint64_t nextSequence() {
        return nextSeq_.fetch_add(1, std::memory_order_relaxed);
    }

    /**
     * @brief Get current sequence number without incrementing.
     */
    uint64_t currentSequence() const {
        return nextSeq_.load(std::memory_order_relaxed);
    }

    // =========================================================================
    // Broadcasting
    // =========================================================================

    /**
     * @brief Broadcast a message to all participants except one.
     * @param message The message to send
     * @param excludeUserId User ID to exclude (empty = send to all)
     * @param sendFunc Function to call for each recipient session
     */
    void broadcast(const std::string& message, 
                   const std::string& excludeUserId,
                   std::function<void(std::shared_ptr<WsSession>)> sendFunc) {
        std::lock_guard<std::mutex> lock(mutex_);
        for (auto& [oderId, info] : participants_) {
            if (oderId == excludeUserId) continue;
            if (auto session = info.session.lock()) {
                sendFunc(session);
            }
        }
    }

    /**
     * @brief Send to a specific user.
     */
    void sendTo(const std::string& oderId,
                std::function<void(std::shared_ptr<WsSession>)> sendFunc) {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = participants_.find(oderId);
        if (it != participants_.end()) {
            if (auto session = it->second.session.lock()) {
                sendFunc(session);
            }
        }
    }

private:
    /**
     * @brief Prune old strokes if over limit.
     * Must be called with mutex held.
     */
    void pruneStrokesIfNeeded() {
        if (strokes_.size() > maxStrokes_) {
            size_t toRemove = strokes_.size() - maxStrokes_;
            strokes_.erase(strokes_.begin(), strokes_.begin() + static_cast<std::ptrdiff_t>(toRemove));
        }
    }

    std::string roomId_;
    std::string password_;
    std::unordered_map<std::string, UserInfo> participants_;
    std::unordered_map<std::string, CursorState> cursors_;
    std::vector<Stroke> strokes_;
    std::atomic<uint64_t> nextSeq_;
    size_t maxStrokes_;
    size_t maxUsers_;
    mutable std::mutex mutex_;
};

} // namespace collabboard
