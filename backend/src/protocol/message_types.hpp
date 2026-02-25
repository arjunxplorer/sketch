// Message Types - Enum for all message types


#pragma once

#include <string>
#include <string_view>
#include <unordered_map>
#include <stdexcept>

namespace collabboard{

/**
 * @brief Enumeration of all WebSocket message types in the protocol.
 * 
 * Messages are categorized as:
 * - Control: Room management (join, leave, welcome)
 * - Presence: Cursor position updates
 * - Drawing: Stroke creation and updates
 * - Heartbeat: Connection health checks
 * - State: Board synchronization
 */

enum class MessageType {
   // Control messages (reliable, low frequency)
   JoinRoom,       // Client -> Server: Request to join a room
   Welcome,        // Server -> Client: Successful join response
   UserJoined,     // Server -> All: New user joined
   UserLeft,       // Server -> All: User disconnected

   // Presence messages (loss-tolerant, high frequency)
   CursorMove,     // Bidirectional: Mouse position update

   // Drawing messages (reliable, event-driven)
   StrokeStart,    // Client -> Server: Begin new stroke
   StrokeAdd,      // Client -> Server: Add points to stroke
   StrokeEnd,      // Client -> Server: Complete stroke
   StrokeMove,     // Client -> Server: Move completed stroke by dx, dy

   // State messages (reliable, on-demand)
   RoomState,      // Server -> Client: Full board snapshot

   // Heartbeat messages (reliable, periodic)
   Ping,           // Client -> Server: Keep-alive request
   Pong,           // Server -> Client: Keep-alive response

   // Error messages
   Error,          // Server -> Client: Error notification

   // Unknown/Invalid
   Unknown         // Parsing failed or unrecognized type   
};

/**
 * @brief Error codes for protocol-level errors.
 */
 enum class ErrorCode {
    // Room errors
    RoomNotFound,       // Requested room does not exist
    RoomFull,           // Room has reached max capacity (15 users)
    InvalidPassword,    // Wrong room password

    // Message errors
    MalformedMessage,   // JSON parsing failed
    InvalidMessageType, // Unknown message type
    MissingField,       // Required field not present
    InvalidField,       // Field value out of range or wrong type

    // Rate limiting
    RateLimited,        // Too many messages, temporarily muted

    // Drawing errors
    InvalidStroke,      // Stroke ID not found or not owned by user
    StrokeTooLarge,     // Too many points in stroke

    // Connection errors
    NotInRoom,          // Action requires being in a room first
    AlreadyInRoom,      // Already joined a room

    // Internal errors
    InternalError       // Unexpected server error
};

// =============================================================================
// String Constants for JSON Serialization
// =============================================================================

namespace MessageTypeStrings {
    constexpr std::string_view JoinRoom    = "join_room";
    constexpr std::string_view Welcome     = "welcome";
    constexpr std::string_view UserJoined  = "user_joined";
    constexpr std::string_view UserLeft    = "user_left";
    constexpr std::string_view CursorMove  = "cursor_move";
    constexpr std::string_view StrokeStart = "stroke_start";
    constexpr std::string_view StrokeAdd   = "stroke_add";
    constexpr std::string_view StrokeEnd   = "stroke_end";
    constexpr std::string_view StrokeMove  = "stroke_move";
    constexpr std::string_view RoomState   = "room_state";
    constexpr std::string_view Ping        = "ping";
    constexpr std::string_view Pong        = "pong";
    constexpr std::string_view Error       = "error";
}

namespace ErrorCodeStrings {
    constexpr std::string_view RoomNotFound      = "ROOM_NOT_FOUND";
    constexpr std::string_view RoomFull          = "ROOM_FULL";
    constexpr std::string_view InvalidPassword   = "INVALID_PASSWORD";
    constexpr std::string_view MalformedMessage  = "MALFORMED_MESSAGE";
    constexpr std::string_view InvalidMessageType = "INVALID_MESSAGE_TYPE";
    constexpr std::string_view MissingField      = "MISSING_FIELD";
    constexpr std::string_view InvalidField      = "INVALID_FIELD";
    constexpr std::string_view RateLimited       = "RATE_LIMITED";
    constexpr std::string_view InvalidStroke     = "INVALID_STROKE";
    constexpr std::string_view StrokeTooLarge    = "STROKE_TOO_LARGE";
    constexpr std::string_view NotInRoom         = "NOT_IN_ROOM";
    constexpr std::string_view AlreadyInRoom     = "ALREADY_IN_ROOM";
    constexpr std::string_view InternalError     = "INTERNAL_ERROR";
}

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * @brief Convert a string to MessageType enum.
 * @param typeStr The JSON "type" field value
 * @return Corresponding MessageType, or MessageType::Unknown if not recognized
 */
 inline MessageType stringToMessageType(std::string_view typeStr) {
    static const std::unordered_map<std::string_view, MessageType> mapping = {
        {MessageTypeStrings::JoinRoom,    MessageType::JoinRoom},
        {MessageTypeStrings::Welcome,     MessageType::Welcome},
        {MessageTypeStrings::UserJoined,  MessageType::UserJoined},
        {MessageTypeStrings::UserLeft,    MessageType::UserLeft},
        {MessageTypeStrings::CursorMove,  MessageType::CursorMove},
        {MessageTypeStrings::StrokeStart, MessageType::StrokeStart},
        {MessageTypeStrings::StrokeAdd,   MessageType::StrokeAdd},
        {MessageTypeStrings::StrokeEnd,   MessageType::StrokeEnd},
        {MessageTypeStrings::StrokeMove,  MessageType::StrokeMove},
        {MessageTypeStrings::RoomState,   MessageType::RoomState},
        {MessageTypeStrings::Ping,        MessageType::Ping},
        {MessageTypeStrings::Pong,        MessageType::Pong},
        {MessageTypeStrings::Error,       MessageType::Error}
    };

    auto it = mapping.find(typeStr);
    return (it != mapping.end()) ? it->second : MessageType::Unknown;
}

/**
 * @brief Convert MessageType enum to string for JSON serialization.
 * @param type The MessageType enum value
 * @return String representation for JSON "type" field
 * @throws std::invalid_argument if MessageType::Unknown is passed
 */
inline std::string_view messageTypeToString(MessageType type) {
    switch (type) {
        case MessageType::JoinRoom:    return MessageTypeStrings::JoinRoom;
        case MessageType::Welcome:     return MessageTypeStrings::Welcome;
        case MessageType::UserJoined:  return MessageTypeStrings::UserJoined;
        case MessageType::UserLeft:    return MessageTypeStrings::UserLeft;
        case MessageType::CursorMove:  return MessageTypeStrings::CursorMove;
        case MessageType::StrokeStart: return MessageTypeStrings::StrokeStart;
        case MessageType::StrokeAdd:   return MessageTypeStrings::StrokeAdd;
        case MessageType::StrokeEnd:   return MessageTypeStrings::StrokeEnd;
        case MessageType::StrokeMove:  return MessageTypeStrings::StrokeMove;
        case MessageType::RoomState:   return MessageTypeStrings::RoomState;
        case MessageType::Ping:        return MessageTypeStrings::Ping;
        case MessageType::Pong:        return MessageTypeStrings::Pong;
        case MessageType::Error:       return MessageTypeStrings::Error;
        case MessageType::Unknown:
        default:
            throw std::invalid_argument("Cannot convert Unknown message type to string");
    }
}

/**
 * @brief Convert ErrorCode enum to string for JSON serialization.
 * @param code The ErrorCode enum value
 * @return String representation for JSON error code field
 */
inline std::string_view errorCodeToString(ErrorCode code) {
    switch (code) {
        case ErrorCode::RoomNotFound:       return ErrorCodeStrings::RoomNotFound;
        case ErrorCode::RoomFull:           return ErrorCodeStrings::RoomFull;
        case ErrorCode::InvalidPassword:    return ErrorCodeStrings::InvalidPassword;
        case ErrorCode::MalformedMessage:   return ErrorCodeStrings::MalformedMessage;
        case ErrorCode::InvalidMessageType: return ErrorCodeStrings::InvalidMessageType;
        case ErrorCode::MissingField:       return ErrorCodeStrings::MissingField;
        case ErrorCode::InvalidField:       return ErrorCodeStrings::InvalidField;
        case ErrorCode::RateLimited:        return ErrorCodeStrings::RateLimited;
        case ErrorCode::InvalidStroke:      return ErrorCodeStrings::InvalidStroke;
        case ErrorCode::StrokeTooLarge:     return ErrorCodeStrings::StrokeTooLarge;
        case ErrorCode::NotInRoom:          return ErrorCodeStrings::NotInRoom;
        case ErrorCode::AlreadyInRoom:      return ErrorCodeStrings::AlreadyInRoom;
        case ErrorCode::InternalError:
        default:
            return ErrorCodeStrings::InternalError;
    }
}

/**
 * @brief Get a human-readable message for an error code.
 * @param code The ErrorCode enum value
 * @return Human-readable error message
 */
inline std::string_view errorCodeToMessage(ErrorCode code) {
    switch (code) {
        case ErrorCode::RoomNotFound:
            return "The requested room does not exist";
        case ErrorCode::RoomFull:
            return "Room has reached maximum capacity (15 users)";
        case ErrorCode::InvalidPassword:
            return "Incorrect room password";
        case ErrorCode::MalformedMessage:
            return "Message format is invalid";
        case ErrorCode::InvalidMessageType:
            return "Unknown message type";
        case ErrorCode::MissingField:
            return "Required field is missing";
        case ErrorCode::InvalidField:
            return "Field value is invalid";
        case ErrorCode::RateLimited:
            return "Too many messages, please slow down";
        case ErrorCode::InvalidStroke:
            return "Stroke not found or not owned by you";
        case ErrorCode::StrokeTooLarge:
            return "Stroke contains too many points";
        case ErrorCode::NotInRoom:
            return "You must join a room first";
        case ErrorCode::AlreadyInRoom:
            return "You are already in a room";
        case ErrorCode::InternalError:
        default:
            return "An unexpected error occurred";
    }
}

// =============================================================================
// Protocol Constants
// =============================================================================

namespace ProtocolConstants {
    // Room limits
    constexpr size_t MaxUsersPerRoom = 15;
    constexpr size_t MaxStrokesPerRoom = 1000;
    constexpr size_t SnapshotStrokeLimit = 500;
    constexpr size_t SnapshotStrokeLimitSmall = 200;

    // Message limits
    constexpr size_t MaxMessageSize = 64 * 1024;  // 64 KB
    constexpr size_t MaxPointsPerStroke = 10000;

    // Timing (in milliseconds)
    constexpr int HeartbeatIntervalMs = 10000;    // 10 seconds
    constexpr int HeartbeatTimeoutMs = 30000;     // 30 seconds
    constexpr int GhostCursorTimeoutMs = 3000;    // 3 seconds
    constexpr int RateLimitMuteDurationMs = 10000; // 10 seconds

    // Rate limiting
    constexpr double CursorUpdatesPerSecond = 20.0;
    constexpr double RateLimitBurstSize = 5.0;
}
}
