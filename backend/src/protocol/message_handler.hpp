#pragma once

#include <string>
#include <memory>
#include <functional>

#include "message_types.hpp"
#include "message_codec.hpp"
#include "../services/room_service.hpp"

namespace collabboard {

// Forward declaration
class WsSession;

/**
 * @brief Dispatches parsed messages to appropriate service handlers.
 */
class MessageHandler {
public:
    using SendFunc = std::function<void(std::shared_ptr<WsSession>, const std::string&)>;

    explicit MessageHandler(RoomService& roomService)
        : roomService_(roomService)
    {}

    /**
     * @brief Handle an incoming message from a session.
     * @param session The session that sent the message
     * @param roomId The room the session is in (empty if not joined)
     * @param oderId The user ID (empty if not joined)
     * @param rawMessage The raw JSON message string
     * @param sendFunc Function to send response/broadcast
     * @return JoinResult if this was a join message, nullopt otherwise
     */
    std::optional<JoinResult> handle(std::shared_ptr<WsSession> session,
                                      const std::string& roomId,
                                      const std::string& oderId,
                                      const std::string& rawMessage,
                                      SendFunc sendFunc) {
        // Parse message
        json msg;
        try {
            msg = MessageCodec::parse(rawMessage);
        } catch (const MessageParseError&) {
            sendError(session, ErrorCode::MalformedMessage, sendFunc);
            return std::nullopt;
        }

        // Get message type
        MessageType type = MessageCodec::getType(msg);
        json data = MessageCodec::getData(msg);

        switch (type) {
            case MessageType::JoinRoom:
                return handleJoinRoom(session, data, sendFunc);

            case MessageType::CursorMove:
                handleCursorMove(roomId, oderId, data, sendFunc);
                break;

            case MessageType::StrokeStart:
                handleStrokeStart(roomId, oderId, data, sendFunc);
                break;

            case MessageType::StrokeAdd:
                handleStrokeAdd(roomId, oderId, data, sendFunc);
                break;

            case MessageType::StrokeEnd:
                handleStrokeEnd(roomId, oderId, data, sendFunc);
                break;

            case MessageType::StrokeMove:
                handleStrokeMove(roomId, oderId, data, sendFunc);
                break;

            case MessageType::Ping:
                handlePing(session, msg, sendFunc);
                break;

            case MessageType::Unknown:
            default:
                sendError(session, ErrorCode::InvalidMessageType, sendFunc);
                break;
        }

        return std::nullopt;
    }

private:
    /**
     * @brief Handle join_room message.
     */
    std::optional<JoinResult> handleJoinRoom(std::shared_ptr<WsSession> session,
                                              const json& data,
                                              SendFunc sendFunc) {
        // Validate data
        if (!MessageCodec::validateJoinRoom(data)) {
            sendError(session, ErrorCode::MissingField, sendFunc);
            return JoinResult::Failure(ErrorCode::MissingField);
        }

        std::string roomId = data["roomId"].get<std::string>();
        std::string userName = data["userName"].get<std::string>();
        std::string password = data.value("password", "");

        // Join the room
        return roomService_.joinRoom(roomId, userName, password, session, sendFunc);
    }

    /**
     * @brief Handle cursor_move message.
     */
    void handleCursorMove(const std::string& roomId,
                          const std::string& oderId,
                          const json& data,
                          SendFunc sendFunc) {
        // Check if in room
        if (roomId.empty() || oderId.empty()) {
            return;  // Silently ignore if not in room
        }

        // Validate data
        if (!MessageCodec::validateCursorMove(data)) {
            return;  // Silently ignore invalid cursor moves
        }

        float x = data["x"].get<float>();
        float y = data["y"].get<float>();

        // Route to service (rate limiting handled there)
        roomService_.handleCursorMove(roomId, oderId, x, y, sendFunc);
    }

    /**
     * @brief Handle stroke_start message.
     */
    void handleStrokeStart(const std::string& roomId,
                           const std::string& oderId,
                           const json& data,
                           SendFunc sendFunc) {
        // Check if in room
        if (roomId.empty() || oderId.empty()) {
            return;
        }

        // Validate data
        if (!MessageCodec::validateStrokeStart(data)) {
            return;
        }

        std::string strokeId = data["strokeId"].get<std::string>();
        std::string color = data["color"].get<std::string>();
        float width = data["width"].get<float>();

        auto error = roomService_.handleStrokeStart(roomId, oderId, strokeId, color, width, sendFunc);
        // Errors are logged but not sent back for stroke operations
        (void)error;
    }

    /**
     * @brief Handle stroke_add message.
     */
    void handleStrokeAdd(const std::string& roomId,
                         const std::string& oderId,
                         const json& data,
                         SendFunc sendFunc) {
        // Check if in room
        if (roomId.empty() || oderId.empty()) {
            return;
        }

        // Validate data
        if (!MessageCodec::validateStrokeAdd(data)) {
            return;
        }

        std::string strokeId = data["strokeId"].get<std::string>();
        std::vector<Point> points = MessageCodec::extractPoints(data);

        auto error = roomService_.handleStrokeAdd(roomId, oderId, strokeId, points, sendFunc);
        (void)error;
    }

    /**
     * @brief Handle stroke_end message.
     */
    void handleStrokeEnd(const std::string& roomId,
                         const std::string& oderId,
                         const json& data,
                         SendFunc sendFunc) {
        // Check if in room
        if (roomId.empty() || oderId.empty()) {
            return;
        }

        // Validate data
        if (!MessageCodec::validateStrokeEnd(data)) {
            return;
        }

        std::string strokeId = data["strokeId"].get<std::string>();

        auto error = roomService_.handleStrokeEnd(roomId, oderId, strokeId, sendFunc);
        (void)error;
    }

    /**
     * @brief Handle stroke_move message.
     */
    void handleStrokeMove(const std::string& roomId,
                          const std::string& oderId,
                          const json& data,
                          SendFunc sendFunc) {
        if (roomId.empty() || oderId.empty()) {
            return;
        }

        if (!MessageCodec::validateStrokeMove(data)) {
            return;
        }

        std::string strokeId = data["strokeId"].get<std::string>();
        float dx = data["dx"].get<float>();
        float dy = data["dy"].get<float>();

        auto error = roomService_.handleStrokeMove(roomId, oderId, strokeId, dx, dy, sendFunc);
        (void)error;
    }

    /**
     * @brief Handle ping message.
     */
    void handlePing(std::shared_ptr<WsSession> session,
                    const json& msg,
                    SendFunc sendFunc) {
        uint64_t seq = MessageCodec::getSeq(msg);
        std::string pong = MessageCodec::createPong(seq);
        sendFunc(session, pong);
    }

    /**
     * @brief Send an error message to a session.
     */
    void sendError(std::shared_ptr<WsSession> session,
                   ErrorCode code,
                   SendFunc sendFunc) {
        std::string errorMsg = MessageCodec::createError(code, 0);
        sendFunc(session, errorMsg);
    }

    RoomService& roomService_;
};

} // namespace collabboard
