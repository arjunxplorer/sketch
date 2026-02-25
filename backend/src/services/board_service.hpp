#pragma once

#include <string>
#include <memory>
#include <functional>
#include <optional>

#include "../models/room.hpp"
#include "../models/stroke.hpp"
#include "../protocol/message_codec.hpp"
#include "../protocol/message_types.hpp"

namespace collabboard {

/**
 * @brief Handles drawing stroke events and generates board snapshots.
 */
class BoardService {
public:
    BoardService()
        : maxStrokesPerRoom_(ProtocolConstants::MaxStrokesPerRoom)
        , snapshotLimit_(ProtocolConstants::SnapshotStrokeLimit)
    {}

    /**
     * @brief Handle stroke_start message.
     * @return Error code if failed, nullopt if success
     */
    std::optional<ErrorCode> handleStrokeStart(
        Room& room,
        const std::string& oderId,
        const std::string& strokeId,
        const std::string& color,
        float width,
        std::function<void(std::shared_ptr<WsSession>, const std::string&)> sendFunc) {
        
        // Create new stroke
        Stroke stroke(strokeId, oderId, color, width);
        stroke.seq = room.nextSequence();
        room.addStroke(stroke);

        // Broadcast to other users
        std::string message = MessageCodec::createStrokeStart(
            strokeId, oderId, color, width, stroke.seq
        );

        room.broadcast(message, oderId, [&sendFunc, &message](std::shared_ptr<WsSession> session) {
            sendFunc(session, message);
        });

        return std::nullopt;  // Success
    }

    /**
     * @brief Handle stroke_add message.
     * @return Error code if failed, nullopt if success
     */
    std::optional<ErrorCode> handleStrokeAdd(
        Room& room,
        const std::string& oderId,
        const std::string& strokeId,
        const std::vector<Point>& points,
        std::function<void(std::shared_ptr<WsSession>, const std::string&)> sendFunc) {
        
        // Find the stroke
        Stroke* stroke = room.getStroke(strokeId);
        if (!stroke) {
            return ErrorCode::InvalidStroke;
        }

        // Verify ownership
        if (stroke->oderId != oderId) {
            return ErrorCode::InvalidStroke;
        }

        // Check if stroke is already complete
        if (stroke->complete) {
            return ErrorCode::InvalidStroke;
        }

        // Check point limit
        if (stroke->pointCount() + points.size() > ProtocolConstants::MaxPointsPerStroke) {
            return ErrorCode::StrokeTooLarge;
        }

        // Add points
        stroke->addPoints(points);

        // Broadcast to other users
        uint64_t seq = room.nextSequence();
        std::string message = MessageCodec::createStrokeAdd(strokeId, oderId, points, seq);

        room.broadcast(message, oderId, [&sendFunc, &message](std::shared_ptr<WsSession> session) {
            sendFunc(session, message);
        });

        return std::nullopt;  // Success
    }

    /**
     * @brief Handle stroke_end message.
     * @return Error code if failed, nullopt if success
     */
    std::optional<ErrorCode> handleStrokeEnd(
        Room& room,
        const std::string& oderId,
        const std::string& strokeId,
        std::function<void(std::shared_ptr<WsSession>, const std::string&)> sendFunc) {
        
        // Find the stroke
        Stroke* stroke = room.getStroke(strokeId);
        if (!stroke) {
            return ErrorCode::InvalidStroke;
        }

        // Verify ownership
        if (stroke->oderId != oderId) {
            return ErrorCode::InvalidStroke;
        }

        // Mark as complete
        stroke->finish();

        // Broadcast to other users
        uint64_t seq = room.nextSequence();
        std::string message = MessageCodec::createStrokeEnd(strokeId, oderId, seq);

        room.broadcast(message, oderId, [&sendFunc, &message](std::shared_ptr<WsSession> session) {
            sendFunc(session, message);
        });

        return std::nullopt;  // Success
    }

    /**
     * @brief Handle stroke_move message (move completed stroke by dx, dy).
     * @return Error code if failed, nullopt if success
     */
    std::optional<ErrorCode> handleStrokeMove(
        Room& room,
        const std::string& oderId,
        const std::string& strokeId,
        float dx, float dy,
        std::function<void(std::shared_ptr<WsSession>, const std::string&)> sendFunc) {

        Stroke* stroke = room.getStroke(strokeId);
        if (!stroke) {
            return ErrorCode::InvalidStroke;
        }

        // Verify ownership
        if (stroke->oderId != oderId) {
            return ErrorCode::InvalidStroke;
        }

        // Only complete strokes can be moved
        if (!stroke->complete) {
            return ErrorCode::InvalidStroke;
        }

        // Translate points
        stroke->translate(dx, dy);

        // Broadcast to other users
        uint64_t seq = room.nextSequence();
        std::string message = MessageCodec::createStrokeMove(strokeId, oderId, dx, dy, seq);

        room.broadcast(message, oderId, [&sendFunc, &message](std::shared_ptr<WsSession> session) {
            sendFunc(session, message);
        });

        return std::nullopt;  // Success
    }

    /**
     * @brief Get board snapshot for a room.
     * @param room The room to snapshot
     * @return Snapshot message string
     */
    std::string getSnapshot(Room& room) {
        auto strokes = room.getStrokesSnapshot(snapshotLimit_);
        uint64_t seq = room.currentSequence();
        return MessageCodec::createRoomState(strokes, seq);
    }

    /**
     * @brief Get stroke count for a room.
     */
    size_t getStrokeCount(const Room& room) const {
        return room.getStrokeCount();
    }

private:
    size_t maxStrokesPerRoom_;
    size_t snapshotLimit_;
};

} // namespace collabboard
