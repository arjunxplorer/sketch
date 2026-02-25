#pragma once

#include <string>
#include <vector>
#include <optional>
#include <stdexcept>

#include <nlohmann/json.hpp>

#include "message_types.hpp"
#include "../models/user_info.hpp"
#include "../models/stroke.hpp"

namespace collabboard {

using json = nlohmann::json;

/**
 * @brief Exception for message parsing errors.
 */
class MessageParseError : public std::runtime_error {
public:
    explicit MessageParseError(const std::string& msg) 
        : std::runtime_error(msg) {}
};

/**
 * @brief Handles JSON serialization and deserialization of protocol messages.
 */
class MessageCodec {
public:
    // =========================================================================
    // Parsing (Incoming Messages)
    // =========================================================================

    /**
     * @brief Parse a raw JSON string into a json object.
     * @throws MessageParseError if JSON is invalid
     */
    static json parse(const std::string& rawMessage) {
        try {
            return json::parse(rawMessage);
        } catch (const json::parse_error& e) {
            throw MessageParseError("Invalid JSON: " + std::string(e.what()));
        }
    }

    /**
     * @brief Extract message type from parsed JSON.
     */
    static MessageType getType(const json& msg) {
        if (!msg.contains("type") || !msg["type"].is_string()) {
            return MessageType::Unknown;
        }
        return stringToMessageType(msg["type"].get<std::string>());
    }

    /**
     * @brief Extract sequence number from parsed JSON.
     */
    static uint64_t getSeq(const json& msg) {
        if (!msg.contains("seq") || !msg["seq"].is_number()) {
            return 0;
        }
        return msg["seq"].get<uint64_t>();
    }

    /**
     * @brief Extract data payload from parsed JSON.
     */
    static json getData(const json& msg) {
        if (!msg.contains("data") || !msg["data"].is_object()) {
            return json::object();
        }
        return msg["data"];
    }

    /**
     * @brief Extract timestamp from parsed JSON.
     */
    static int64_t getTimestamp(const json& msg) {
        if (!msg.contains("timestamp") || !msg["timestamp"].is_number()) {
            return 0;
        }
        return msg["timestamp"].get<int64_t>();
    }

    // =========================================================================
    // Validation
    // =========================================================================

    /**
     * @brief Validate join_room message data.
     */
    static bool validateJoinRoom(const json& data) {
        return data.contains("roomId") && data["roomId"].is_string() &&
               data.contains("userName") && data["userName"].is_string();
    }

    /**
     * @brief Validate cursor_move message data.
     */
    static bool validateCursorMove(const json& data) {
        return data.contains("x") && data["x"].is_number() &&
               data.contains("y") && data["y"].is_number();
    }

    /**
     * @brief Validate stroke_start message data.
     */
    static bool validateStrokeStart(const json& data) {
        return data.contains("strokeId") && data["strokeId"].is_string() &&
               data.contains("color") && data["color"].is_string() &&
               data.contains("width") && data["width"].is_number();
    }

    /**
     * @brief Validate stroke_add message data.
     */
    static bool validateStrokeAdd(const json& data) {
        return data.contains("strokeId") && data["strokeId"].is_string() &&
               data.contains("points") && data["points"].is_array();
    }

    /**
     * @brief Validate stroke_end message data.
     */
    static bool validateStrokeEnd(const json& data) {
        return data.contains("strokeId") && data["strokeId"].is_string();
    }

    /**
     * @brief Validate stroke_move message data.
     */
    static bool validateStrokeMove(const json& data) {
        return data.contains("strokeId") && data["strokeId"].is_string() &&
               data.contains("dx") && data["dx"].is_number() &&
               data.contains("dy") && data["dy"].is_number();
    }

    // =========================================================================
    // Data Extraction Helpers
    // =========================================================================

    /**
     * @brief Extract points array from stroke data.
     */
    static std::vector<Point> extractPoints(const json& data) {
        std::vector<Point> points;
        if (!data.contains("points") || !data["points"].is_array()) {
            return points;
        }
        
        for (const auto& pt : data["points"]) {
            if (pt.is_array() && pt.size() >= 2) {
                points.emplace_back(pt[0].get<float>(), pt[1].get<float>());
            }
        }
        return points;
    }

    // =========================================================================
    // Message Creation (Outgoing Messages)
    // =========================================================================

    /**
     * @brief Create base message structure.
     */
    static json createMessage(MessageType type, uint64_t seq, const json& data) {
        return {
            {"type", std::string(messageTypeToString(type))},
            {"seq", seq},
            {"timestamp", currentTimestampMs()},
            {"data", data}
        };
    }

    /**
     * @brief Create welcome message (sent to user on successful join).
     */
    static std::string createWelcome(const std::string& oderId,
                                      const std::string& color,
                                      const std::vector<UserInfo>& users,
                                      uint64_t seq) {
        json userArray = json::array();
        for (const auto& user : users) {
            userArray.push_back({
                {"userId", user.userId},
                {"name", user.userName},
                {"color", user.color}
            });
        }

        json data = {
            {"userId", oderId},
            {"color", color},
            {"users", userArray}
        };

        return createMessage(MessageType::Welcome, seq, data).dump();
    }

    /**
     * @brief Create user_joined message.
     */
    static std::string createUserJoined(const std::string& oderId,
                                         const std::string& userName,
                                         const std::string& color,
                                         uint64_t seq) {
        json data = {
            {"userId", oderId},
            {"name", userName},
            {"color", color}
        };
        return createMessage(MessageType::UserJoined, seq, data).dump();
    }

    /**
     * @brief Create user_left message.
     */
    static std::string createUserLeft(const std::string& oderId, uint64_t seq) {
        json data = {{"userId", oderId}};
        return createMessage(MessageType::UserLeft, seq, data).dump();
    }

    /**
     * @brief Create cursor_move message.
     */
    static std::string createCursorMove(const std::string& oderId,
                                         float x, float y,
                                         uint64_t seq) {
        json data = {
            {"userId", oderId},
            {"x", x},
            {"y", y}
        };
        return createMessage(MessageType::CursorMove, seq, data).dump();
    }

    /**
     * @brief Create stroke_start message.
     */
    static std::string createStrokeStart(const std::string& strokeId,
                                          const std::string& oderId,
                                          const std::string& color,
                                          float width,
                                          uint64_t seq) {
        json data = {
            {"strokeId", strokeId},
            {"userId", oderId},
            {"color", color},
            {"width", width}
        };
        return createMessage(MessageType::StrokeStart, seq, data).dump();
    }

    /**
     * @brief Create stroke_add message.
     */
    static std::string createStrokeAdd(const std::string& strokeId,
                                        const std::string& oderId,
                                        const std::vector<Point>& points,
                                        uint64_t seq) {
        json pointsArray = json::array();
        for (const auto& pt : points) {
            pointsArray.push_back({pt.x, pt.y});
        }

        json data = {
            {"strokeId", strokeId},
            {"userId", oderId},
            {"points", pointsArray}
        };
        return createMessage(MessageType::StrokeAdd, seq, data).dump();
    }

    /**
     * @brief Create stroke_end message.
     */
    static std::string createStrokeEnd(const std::string& strokeId,
                                        const std::string& oderId,
                                        uint64_t seq) {
        json data = {
            {"strokeId", strokeId},
            {"userId", oderId}
        };
        return createMessage(MessageType::StrokeEnd, seq, data).dump();
    }

    /**
     * @brief Create stroke_move message.
     */
    static std::string createStrokeMove(const std::string& strokeId,
                                         const std::string& oderId,
                                         float dx, float dy,
                                         uint64_t seq) {
        json data = {
            {"strokeId", strokeId},
            {"userId", oderId},
            {"dx", dx},
            {"dy", dy}
        };
        return createMessage(MessageType::StrokeMove, seq, data).dump();
    }

    /**
     * @brief Create room_state message (snapshot for late joiners).
     */
    static std::string createRoomState(const std::vector<Stroke>& strokes,
                                        uint64_t snapshotSeq) {
        json strokesArray = json::array();
        for (const auto& stroke : strokes) {
            json pointsArray = json::array();
            for (const auto& pt : stroke.points) {
                pointsArray.push_back({pt.x, pt.y});
            }

            strokesArray.push_back({
                {"strokeId", stroke.strokeId},
                {"userId", stroke.oderId},
                {"points", pointsArray},
                {"color", stroke.color},
                {"width", stroke.width},
                {"complete", stroke.complete}
            });
        }

        json data = {
            {"strokes", strokesArray},
            {"snapshotSeq", snapshotSeq}
        };
        return createMessage(MessageType::RoomState, snapshotSeq, data).dump();
    }

    /**
     * @brief Create pong message.
     */
    static std::string createPong(uint64_t seq) {
        return createMessage(MessageType::Pong, seq, json::object()).dump();
    }

    /**
     * @brief Create error message.
     */
    static std::string createError(ErrorCode code, uint64_t seq) {
        json data = {
            {"code", std::string(errorCodeToString(code))},
            {"message", std::string(errorCodeToMessage(code))}
        };
        return createMessage(MessageType::Error, seq, data).dump();
    }

    /**
     * @brief Create error message with custom message.
     */
    static std::string createError(ErrorCode code, 
                                    const std::string& customMessage,
                                    uint64_t seq) {
        json data = {
            {"code", std::string(errorCodeToString(code))},
            {"message", customMessage}
        };
        return createMessage(MessageType::Error, seq, data).dump();
    }

private:
    /**
     * @brief Get current timestamp in milliseconds.
     */
    static int64_t currentTimestampMs() {
        auto now = std::chrono::system_clock::now();
        auto duration = now.time_since_epoch();
        return std::chrono::duration_cast<std::chrono::milliseconds>(duration).count();
    }
};

} // namespace collabboard
