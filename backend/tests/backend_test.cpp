/**
 * @file backend_test.cpp
 * @brief Comprehensive integration tests for the CollabBoard backend
 * 
 * Tests cover:
 * - Models (UserInfo, Stroke, Room)
 * - Message Codec (JSON serialization/deserialization)
 * - Services (RoomService, PresenceService, BoardService)
 * - Full integration flows
 */

#include <gtest/gtest.h>
#include <thread>
#include <chrono>
#include <vector>
#include <memory>

#include "../src/models/user_info.hpp"
#include "../src/models/stroke.hpp"
#include "../src/models/room.hpp"
#include "../src/protocol/message_types.hpp"
#include "../src/protocol/message_codec.hpp"
#include "../src/services/room_service.hpp"
#include "../src/services/presence_service.hpp"
#include "../src/services/board_service.hpp"
#include "../src/utils/uuid.hpp"

using namespace collabboard;

// =============================================================================
// USER INFO TESTS
// =============================================================================

class UserInfoTest : public ::testing::Test {};

TEST_F(UserInfoTest, DefaultConstruction) {
    UserInfo user;
    EXPECT_TRUE(user.userId.empty());
    EXPECT_TRUE(user.userName.empty());
    EXPECT_TRUE(user.color.empty());
    EXPECT_TRUE(user.isActive);
}

TEST_F(UserInfoTest, ParameterizedConstruction) {
    UserInfo user("user-123", "Alice", "#FF5733");
    EXPECT_EQ(user.userId, "user-123");
    EXPECT_EQ(user.userName, "Alice");
    EXPECT_EQ(user.color, "#FF5733");
    EXPECT_TRUE(user.isActive);
}

TEST_F(UserInfoTest, TouchUpdatesLastActivity) {
    UserInfo user("user-123", "Alice", "#FF5733");
    auto before = user.lastActivity;
    
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    user.touch();
    
    EXPECT_GT(user.lastActivity, before);
}

TEST_F(UserInfoTest, GhostDetection) {
    UserInfo user("user-123", "Alice", "#FF5733");
    
    // Not a ghost immediately
    EXPECT_FALSE(user.isGhost(100));
    
    // Wait and check
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    EXPECT_TRUE(user.isGhost(40));
    EXPECT_FALSE(user.isGhost(100));
}

TEST_F(UserInfoTest, IdleTime) {
    UserInfo user("user-123", "Alice", "#FF5733");
    
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    
    int64_t idle = user.getIdleTimeMs();
    EXPECT_GE(idle, 50);
    EXPECT_LT(idle, 150);
}

// =============================================================================
// STROKE TESTS
// =============================================================================

class StrokeTest : public ::testing::Test {};

TEST_F(StrokeTest, DefaultConstruction) {
    Stroke stroke;
    EXPECT_TRUE(stroke.strokeId.empty());
    EXPECT_TRUE(stroke.points.empty());
    EXPECT_EQ(stroke.width, 2.0f);
    EXPECT_FALSE(stroke.complete);
}

TEST_F(StrokeTest, ParameterizedConstruction) {
    Stroke stroke("stroke-1", "user-1", "#000000", 3.0f);
    EXPECT_EQ(stroke.strokeId, "stroke-1");
    EXPECT_EQ(stroke.oderId, "user-1");
    EXPECT_EQ(stroke.color, "#000000");
    EXPECT_EQ(stroke.width, 3.0f);
    EXPECT_FALSE(stroke.complete);
}

TEST_F(StrokeTest, AddPoints) {
    Stroke stroke("stroke-1", "user-1", "#000000", 2.0f);
    
    stroke.addPoint(10.0f, 20.0f);
    stroke.addPoint(15.0f, 25.0f);
    
    EXPECT_EQ(stroke.pointCount(), 2);
    EXPECT_EQ(stroke.points[0].x, 10.0f);
    EXPECT_EQ(stroke.points[0].y, 20.0f);
}

TEST_F(StrokeTest, AddMultiplePoints) {
    Stroke stroke("stroke-1", "user-1", "#000000", 2.0f);
    
    std::vector<Point> points = {{1, 2}, {3, 4}, {5, 6}};
    stroke.addPoints(points);
    
    EXPECT_EQ(stroke.pointCount(), 3);
}

TEST_F(StrokeTest, FinishStroke) {
    Stroke stroke("stroke-1", "user-1", "#000000", 2.0f);
    
    EXPECT_FALSE(stroke.complete);
    stroke.finish();
    EXPECT_TRUE(stroke.complete);
}

TEST_F(StrokeTest, EstimateSize) {
    Stroke stroke("stroke-1", "user-1", "#000000", 2.0f);
    
    size_t emptySize = stroke.estimateSize();
    
    // Add many points
    for (int i = 0; i < 100; ++i) {
        stroke.addPoint(static_cast<float>(i), static_cast<float>(i));
    }
    
    size_t filledSize = stroke.estimateSize();
    EXPECT_GT(filledSize, emptySize);
}

// =============================================================================
// ROOM TESTS
// =============================================================================

class RoomTest : public ::testing::Test {
protected:
    std::shared_ptr<Room> room;
    
    void SetUp() override {
        room = std::make_shared<Room>("test-room", "password123");
    }
};

TEST_F(RoomTest, Construction) {
    EXPECT_EQ(room->getId(), "test-room");
    EXPECT_TRUE(room->hasPassword());
    EXPECT_TRUE(room->isEmpty());
}

TEST_F(RoomTest, PasswordValidation) {
    EXPECT_TRUE(room->validatePassword("password123"));
    EXPECT_FALSE(room->validatePassword("wrong"));
    EXPECT_FALSE(room->validatePassword(""));
}

TEST_F(RoomTest, NoPasswordRoom) {
    Room noPassRoom("open-room");
    EXPECT_FALSE(noPassRoom.hasPassword());
    EXPECT_TRUE(noPassRoom.validatePassword(""));
    EXPECT_TRUE(noPassRoom.validatePassword("anything"));
}

TEST_F(RoomTest, AddRemoveParticipants) {
    UserInfo user1("user-1", "Alice", "#FF0000");
    UserInfo user2("user-2", "Bob", "#00FF00");
    
    EXPECT_TRUE(room->addParticipant("user-1", user1));
    EXPECT_EQ(room->getParticipantCount(), 1);
    EXPECT_FALSE(room->isEmpty());
    
    EXPECT_TRUE(room->addParticipant("user-2", user2));
    EXPECT_EQ(room->getParticipantCount(), 2);
    
    room->removeParticipant("user-1");
    EXPECT_EQ(room->getParticipantCount(), 1);
    
    room->removeParticipant("user-2");
    EXPECT_TRUE(room->isEmpty());
}

TEST_F(RoomTest, RoomCapacity) {
    // Add 15 users (max capacity)
    for (int i = 0; i < 15; ++i) {
        UserInfo user("user-" + std::to_string(i), "User" + std::to_string(i), "#FF0000");
        EXPECT_TRUE(room->addParticipant("user-" + std::to_string(i), user));
    }
    
    EXPECT_TRUE(room->isFull());
    
    // 16th user should fail
    UserInfo extraUser("user-16", "Extra", "#00FF00");
    EXPECT_FALSE(room->addParticipant("user-16", extraUser));
}

TEST_F(RoomTest, GetParticipant) {
    UserInfo user("user-1", "Alice", "#FF0000");
    room->addParticipant("user-1", user);
    
    auto* found = room->getParticipant("user-1");
    EXPECT_NE(found, nullptr);
    EXPECT_EQ(found->userName, "Alice");
    
    auto* notFound = room->getParticipant("user-999");
    EXPECT_EQ(notFound, nullptr);
}

TEST_F(RoomTest, CursorUpdates) {
    UserInfo user("user-1", "Alice", "#FF0000");
    room->addParticipant("user-1", user);
    
    room->updateCursor("user-1", 100.0f, 200.0f);
    
    auto* cursor = room->getCursor("user-1");
    EXPECT_NE(cursor, nullptr);
    EXPECT_EQ(cursor->x, 100.0f);
    EXPECT_EQ(cursor->y, 200.0f);
}

TEST_F(RoomTest, StrokeManagement) {
    Stroke stroke1("stroke-1", "user-1", "#000000", 2.0f);
    stroke1.addPoint(10, 20);
    stroke1.addPoint(30, 40);
    
    room->addStroke(stroke1);
    EXPECT_EQ(room->getStrokeCount(), 1);
    
    auto* found = room->getStroke("stroke-1");
    EXPECT_NE(found, nullptr);
    EXPECT_EQ(found->pointCount(), 2);
}

TEST_F(RoomTest, StrokeSnapshot) {
    // Add 10 strokes
    for (int i = 0; i < 10; ++i) {
        Stroke s("stroke-" + std::to_string(i), "user-1", "#000000", 2.0f);
        room->addStroke(s);
    }
    
    // Get snapshot with limit
    auto snapshot = room->getStrokesSnapshot(5);
    EXPECT_EQ(snapshot.size(), 5);
    
    // Full snapshot
    auto full = room->getStrokesSnapshot(100);
    EXPECT_EQ(full.size(), 10);
}

TEST_F(RoomTest, SequenceNumbers) {
    uint64_t seq1 = room->nextSequence();
    uint64_t seq2 = room->nextSequence();
    uint64_t seq3 = room->nextSequence();
    
    EXPECT_EQ(seq2, seq1 + 1);
    EXPECT_EQ(seq3, seq2 + 1);
}

// =============================================================================
// MESSAGE CODEC TESTS
// =============================================================================

class MessageCodecTest : public ::testing::Test {};

TEST_F(MessageCodecTest, ParseValidJson) {
    std::string msg = R"({"type":"ping","seq":1,"data":{}})";
    auto parsed = MessageCodec::parse(msg);
    
    EXPECT_EQ(MessageCodec::getType(parsed), MessageType::Ping);
    EXPECT_EQ(MessageCodec::getSeq(parsed), 1);
}

TEST_F(MessageCodecTest, ParseInvalidJson) {
    EXPECT_THROW(MessageCodec::parse("not json"), MessageParseError);
    EXPECT_THROW(MessageCodec::parse("{incomplete"), MessageParseError);
}

TEST_F(MessageCodecTest, GetTypeUnknown) {
    auto parsed = MessageCodec::parse(R"({"type":"invalid_type"})");
    EXPECT_EQ(MessageCodec::getType(parsed), MessageType::Unknown);
}

TEST_F(MessageCodecTest, ValidateJoinRoom) {
    auto valid = MessageCodec::parse(R"({"roomId":"room-1","userName":"Alice"})");
    EXPECT_TRUE(MessageCodec::validateJoinRoom(valid));
    
    auto missingRoom = MessageCodec::parse(R"({"userName":"Alice"})");
    EXPECT_FALSE(MessageCodec::validateJoinRoom(missingRoom));
    
    auto missingName = MessageCodec::parse(R"({"roomId":"room-1"})");
    EXPECT_FALSE(MessageCodec::validateJoinRoom(missingName));
}

TEST_F(MessageCodecTest, ValidateCursorMove) {
    auto valid = MessageCodec::parse(R"({"x":100,"y":200})");
    EXPECT_TRUE(MessageCodec::validateCursorMove(valid));
    
    auto missing = MessageCodec::parse(R"({"x":100})");
    EXPECT_FALSE(MessageCodec::validateCursorMove(missing));
}

TEST_F(MessageCodecTest, CreateWelcome) {
    std::vector<UserInfo> users = {
        UserInfo("user-1", "Alice", "#FF0000"),
        UserInfo("user-2", "Bob", "#00FF00")
    };
    
    std::string msg = MessageCodec::createWelcome("user-3", "#0000FF", users, 100);
    auto parsed = MessageCodec::parse(msg);
    
    EXPECT_EQ(MessageCodec::getType(parsed), MessageType::Welcome);
    EXPECT_EQ(MessageCodec::getSeq(parsed), 100);
    
    auto data = MessageCodec::getData(parsed);
    EXPECT_EQ(data["userId"], "user-3");
    EXPECT_EQ(data["color"], "#0000FF");
    EXPECT_EQ(data["users"].size(), 2);
}

TEST_F(MessageCodecTest, CreateUserJoined) {
    std::string msg = MessageCodec::createUserJoined("user-1", "Alice", "#FF0000", 50);
    auto parsed = MessageCodec::parse(msg);
    
    EXPECT_EQ(MessageCodec::getType(parsed), MessageType::UserJoined);
    
    auto data = MessageCodec::getData(parsed);
    EXPECT_EQ(data["userId"], "user-1");
    EXPECT_EQ(data["name"], "Alice");
}

TEST_F(MessageCodecTest, CreateCursorMove) {
    std::string msg = MessageCodec::createCursorMove("user-1", 150.5f, 200.5f, 25);
    auto parsed = MessageCodec::parse(msg);
    
    EXPECT_EQ(MessageCodec::getType(parsed), MessageType::CursorMove);
    
    auto data = MessageCodec::getData(parsed);
    EXPECT_FLOAT_EQ(data["x"].get<float>(), 150.5f);
    EXPECT_FLOAT_EQ(data["y"].get<float>(), 200.5f);
}

TEST_F(MessageCodecTest, CreateStrokeMessages) {
    // stroke_start
    std::string startMsg = MessageCodec::createStrokeStart("stroke-1", "user-1", "#000000", 2.0f, 1);
    auto startParsed = MessageCodec::parse(startMsg);
    EXPECT_EQ(MessageCodec::getType(startParsed), MessageType::StrokeStart);
    
    // stroke_add
    std::vector<Point> points = {{10, 20}, {30, 40}};
    std::string addMsg = MessageCodec::createStrokeAdd("stroke-1", "user-1", points, 2);
    auto addParsed = MessageCodec::parse(addMsg);
    EXPECT_EQ(MessageCodec::getType(addParsed), MessageType::StrokeAdd);
    
    // stroke_end
    std::string endMsg = MessageCodec::createStrokeEnd("stroke-1", "user-1", 3);
    auto endParsed = MessageCodec::parse(endMsg);
    EXPECT_EQ(MessageCodec::getType(endParsed), MessageType::StrokeEnd);
}

TEST_F(MessageCodecTest, CreateRoomState) {
    std::vector<Stroke> strokes;
    Stroke s1("stroke-1", "user-1", "#000000", 2.0f);
    s1.addPoint(10, 20);
    s1.complete = true;
    strokes.push_back(s1);
    
    std::string msg = MessageCodec::createRoomState(strokes, 500);
    auto parsed = MessageCodec::parse(msg);
    
    EXPECT_EQ(MessageCodec::getType(parsed), MessageType::RoomState);
    
    auto data = MessageCodec::getData(parsed);
    EXPECT_EQ(data["strokes"].size(), 1);
    EXPECT_EQ(data["snapshotSeq"], 500);
}

TEST_F(MessageCodecTest, CreateError) {
    std::string msg = MessageCodec::createError(ErrorCode::RoomFull, 0);
    auto parsed = MessageCodec::parse(msg);
    
    EXPECT_EQ(MessageCodec::getType(parsed), MessageType::Error);
    
    auto data = MessageCodec::getData(parsed);
    EXPECT_EQ(data["code"], "ROOM_FULL");
}

TEST_F(MessageCodecTest, ExtractPoints) {
    auto data = MessageCodec::parse(R"({"points":[[10,20],[30,40],[50,60]]})");
    auto points = MessageCodec::extractPoints(data);
    
    EXPECT_EQ(points.size(), 3);
    EXPECT_FLOAT_EQ(points[0].x, 10.0f);
    EXPECT_FLOAT_EQ(points[0].y, 20.0f);
    EXPECT_FLOAT_EQ(points[2].x, 50.0f);
}

// =============================================================================
// ROOM SERVICE TESTS
// =============================================================================

class RoomServiceTest : public ::testing::Test {
protected:
    RoomService roomService;
    std::vector<std::string> sentMessages;
    RoomService::SendFunc mockSendFunc;
    
    void SetUp() override {
        sentMessages.clear();
        mockSendFunc = [this](std::shared_ptr<WsSession>, const std::string& msg) {
            sentMessages.push_back(msg);
        };
    }
};

TEST_F(RoomServiceTest, CreateRoom) {
    auto room = roomService.getOrCreateRoom("room-1");
    EXPECT_NE(room, nullptr);
    EXPECT_EQ(room->getId(), "room-1");
    EXPECT_EQ(roomService.getRoomCount(), 1);
    
    // Get same room again
    auto sameRoom = roomService.getOrCreateRoom("room-1");
    EXPECT_EQ(room, sameRoom);
    EXPECT_EQ(roomService.getRoomCount(), 1);
}

TEST_F(RoomServiceTest, RoomExists) {
    EXPECT_FALSE(roomService.roomExists("room-1"));
    
    roomService.getOrCreateRoom("room-1");
    
    EXPECT_TRUE(roomService.roomExists("room-1"));
}

TEST_F(RoomServiceTest, DeleteRoom) {
    roomService.getOrCreateRoom("room-1");
    EXPECT_EQ(roomService.getRoomCount(), 1);
    
    roomService.deleteRoom("room-1");
    EXPECT_EQ(roomService.getRoomCount(), 0);
}

TEST_F(RoomServiceTest, JoinRoomSuccess) {
    auto result = roomService.joinRoom("room-1", "Alice", "", nullptr, mockSendFunc);
    
    EXPECT_TRUE(result.success);
    EXPECT_FALSE(result.oderId.empty());
    EXPECT_FALSE(result.color.empty());
    
    // Should have sent welcome and room_state messages
    EXPECT_GE(sentMessages.size(), 2);
}

TEST_F(RoomServiceTest, JoinRoomWithPassword) {
    // Create room with password first
    roomService.getOrCreateRoom("secure-room", "secret123");
    
    // Wrong password
    auto failResult = roomService.joinRoom("secure-room", "Alice", "wrong", nullptr, mockSendFunc);
    EXPECT_FALSE(failResult.success);
    EXPECT_EQ(failResult.errorCode, ErrorCode::InvalidPassword);
    
    // Correct password
    auto successResult = roomService.joinRoom("secure-room", "Bob", "secret123", nullptr, mockSendFunc);
    EXPECT_TRUE(successResult.success);
}

TEST_F(RoomServiceTest, ColorAssignment) {
    std::set<std::string> colors;
    
    // Join multiple users, each should get a different color
    for (int i = 0; i < 5; ++i) {
        auto result = roomService.joinRoom("room-1", "User" + std::to_string(i), "", nullptr, mockSendFunc);
        EXPECT_TRUE(result.success);
        colors.insert(result.color);
    }
    
    // Should have 5 different colors
    EXPECT_EQ(colors.size(), 5);
}

TEST_F(RoomServiceTest, HandleCursorMove) {
    // Join a room first
    auto result = roomService.joinRoom("room-1", "Alice", "", nullptr, mockSendFunc);
    sentMessages.clear();
    
    // Move cursor
    auto error = roomService.handleCursorMove("room-1", result.oderId, 100.0f, 200.0f, mockSendFunc);
    EXPECT_FALSE(error.has_value());
}

TEST_F(RoomServiceTest, HandleCursorMoveRoomNotFound) {
    auto error = roomService.handleCursorMove("nonexistent", "user-1", 100.0f, 200.0f, mockSendFunc);
    EXPECT_TRUE(error.has_value());
    EXPECT_EQ(error.value(), ErrorCode::RoomNotFound);
}

TEST_F(RoomServiceTest, HandleStrokeFlow) {
    // Join room
    auto result = roomService.joinRoom("room-1", "Alice", "", nullptr, mockSendFunc);
    std::string oderId = result.oderId;
    sentMessages.clear();
    
    // Start stroke
    auto startError = roomService.handleStrokeStart("room-1", oderId, "stroke-1", "#000000", 2.0f, mockSendFunc);
    EXPECT_FALSE(startError.has_value());
    
    // Add points
    std::vector<Point> points = {{10, 20}, {30, 40}};
    auto addError = roomService.handleStrokeAdd("room-1", oderId, "stroke-1", points, mockSendFunc);
    EXPECT_FALSE(addError.has_value());
    
    // End stroke
    auto endError = roomService.handleStrokeEnd("room-1", oderId, "stroke-1", mockSendFunc);
    EXPECT_FALSE(endError.has_value());
    
    // Verify stroke is in room
    auto room = roomService.getRoom("room-1");
    EXPECT_EQ(room->getStrokeCount(), 1);
    
    auto* stroke = room->getStroke("stroke-1");
    EXPECT_NE(stroke, nullptr);
    EXPECT_TRUE(stroke->complete);
    EXPECT_EQ(stroke->pointCount(), 2);
}

// =============================================================================
// PRESENCE SERVICE TESTS
// =============================================================================

class PresenceServiceTest : public ::testing::Test {
protected:
    PresenceService presenceService;
    std::shared_ptr<Room> room;
    std::vector<std::string> sentMessages;
    
    void SetUp() override {
        room = std::make_shared<Room>("test-room");
        UserInfo user("user-1", "Alice", "#FF0000");
        room->addParticipant("user-1", user);
        sentMessages.clear();
    }
    
    std::function<void(std::shared_ptr<WsSession>, const std::string&)> mockSendFunc() {
        return [this](std::shared_ptr<WsSession>, const std::string& msg) {
            sentMessages.push_back(msg);
        };
    }
};

TEST_F(PresenceServiceTest, HandleCursorMove) {
    bool result = presenceService.handleCursorMove(*room, "user-1", 100.0f, 200.0f, mockSendFunc());
    EXPECT_TRUE(result);
    
    auto* cursor = room->getCursor("user-1");
    EXPECT_FLOAT_EQ(cursor->x, 100.0f);
    EXPECT_FLOAT_EQ(cursor->y, 200.0f);
}

TEST_F(PresenceServiceTest, RateLimiting) {
    // Consume all burst tokens (5)
    for (int i = 0; i < 5; ++i) {
        EXPECT_TRUE(presenceService.handleCursorMove(*room, "user-1", 
            static_cast<float>(i), static_cast<float>(i), mockSendFunc()));
    }
    
    // 6th should be rate limited
    EXPECT_FALSE(presenceService.handleCursorMove(*room, "user-1", 6.0f, 6.0f, mockSendFunc()));
}

TEST_F(PresenceServiceTest, UpdateLastSeen) {
    auto* user = room->getParticipant("user-1");
    auto before = user->lastActivity;
    
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    presenceService.updateLastSeen(*room, "user-1");
    
    EXPECT_GT(user->lastActivity, before);
}

TEST_F(PresenceServiceTest, GhostUserDetection) {
    // No ghosts initially
    auto ghosts = presenceService.getGhostUsers(*room, 50);
    EXPECT_TRUE(ghosts.empty());
    
    // Wait and check
    std::this_thread::sleep_for(std::chrono::milliseconds(60));
    ghosts = presenceService.getGhostUsers(*room, 50);
    EXPECT_EQ(ghosts.size(), 1);
    EXPECT_EQ(ghosts[0], "user-1");
}

// =============================================================================
// BOARD SERVICE TESTS
// =============================================================================

class BoardServiceTest : public ::testing::Test {
protected:
    BoardService boardService;
    std::shared_ptr<Room> room;
    std::vector<std::string> sentMessages;
    
    void SetUp() override {
        room = std::make_shared<Room>("test-room");
        UserInfo user("user-1", "Alice", "#FF0000");
        room->addParticipant("user-1", user);
        sentMessages.clear();
    }
    
    std::function<void(std::shared_ptr<WsSession>, const std::string&)> mockSendFunc() {
        return [this](std::shared_ptr<WsSession>, const std::string& msg) {
            sentMessages.push_back(msg);
        };
    }
};

TEST_F(BoardServiceTest, HandleStrokeStart) {
    auto error = boardService.handleStrokeStart(*room, "user-1", "stroke-1", "#000000", 2.0f, mockSendFunc());
    EXPECT_FALSE(error.has_value());
    
    auto* stroke = room->getStroke("stroke-1");
    EXPECT_NE(stroke, nullptr);
    EXPECT_EQ(stroke->oderId, "user-1");
    EXPECT_EQ(stroke->color, "#000000");
}

TEST_F(BoardServiceTest, HandleStrokeAdd) {
    // Start stroke first
    boardService.handleStrokeStart(*room, "user-1", "stroke-1", "#000000", 2.0f, mockSendFunc());
    
    // Add points
    std::vector<Point> points = {{10, 20}, {30, 40}, {50, 60}};
    auto error = boardService.handleStrokeAdd(*room, "user-1", "stroke-1", points, mockSendFunc());
    EXPECT_FALSE(error.has_value());
    
    auto* stroke = room->getStroke("stroke-1");
    EXPECT_EQ(stroke->pointCount(), 3);
}

TEST_F(BoardServiceTest, HandleStrokeAddInvalidStroke) {
    std::vector<Point> points = {{10, 20}};
    auto error = boardService.handleStrokeAdd(*room, "user-1", "nonexistent", points, mockSendFunc());
    
    EXPECT_TRUE(error.has_value());
    EXPECT_EQ(error.value(), ErrorCode::InvalidStroke);
}

TEST_F(BoardServiceTest, HandleStrokeAddWrongUser) {
    // Start stroke as user-1
    boardService.handleStrokeStart(*room, "user-1", "stroke-1", "#000000", 2.0f, mockSendFunc());
    
    // Try to add points as user-2
    std::vector<Point> points = {{10, 20}};
    auto error = boardService.handleStrokeAdd(*room, "user-2", "stroke-1", points, mockSendFunc());
    
    EXPECT_TRUE(error.has_value());
    EXPECT_EQ(error.value(), ErrorCode::InvalidStroke);
}

TEST_F(BoardServiceTest, HandleStrokeEnd) {
    boardService.handleStrokeStart(*room, "user-1", "stroke-1", "#000000", 2.0f, mockSendFunc());
    
    auto error = boardService.handleStrokeEnd(*room, "user-1", "stroke-1", mockSendFunc());
    EXPECT_FALSE(error.has_value());
    
    auto* stroke = room->getStroke("stroke-1");
    EXPECT_TRUE(stroke->complete);
}

TEST_F(BoardServiceTest, GetSnapshot) {
    // Add some strokes
    for (int i = 0; i < 5; ++i) {
        boardService.handleStrokeStart(*room, "user-1", "stroke-" + std::to_string(i), "#000000", 2.0f, mockSendFunc());
    }
    
    std::string snapshot = boardService.getSnapshot(*room);
    auto parsed = MessageCodec::parse(snapshot);
    
    EXPECT_EQ(MessageCodec::getType(parsed), MessageType::RoomState);
    
    auto data = MessageCodec::getData(parsed);
    EXPECT_EQ(data["strokes"].size(), 5);
}

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

class IntegrationTest : public ::testing::Test {
protected:
    RoomService roomService;
    std::vector<std::pair<std::string, std::string>> messages;  // (userId, message)
    
    RoomService::SendFunc createSendFunc(const std::string& forUser) {
        return [this, forUser](std::shared_ptr<WsSession>, const std::string& msg) {
            messages.push_back({forUser, msg});
        };
    }
};

TEST_F(IntegrationTest, FullCollaborationFlow) {
    // User 1 joins
    auto user1Result = roomService.joinRoom("collab-room", "Alice", "", nullptr, createSendFunc("user1"));
    EXPECT_TRUE(user1Result.success);
    std::string user1Id = user1Result.oderId;
    
    // User 2 joins
    auto user2Result = roomService.joinRoom("collab-room", "Bob", "", nullptr, createSendFunc("user2"));
    EXPECT_TRUE(user2Result.success);
    std::string user2Id = user2Result.oderId;
    
    // Clear messages to focus on collaboration
    messages.clear();
    
    // User 1 moves cursor
    roomService.handleCursorMove("collab-room", user1Id, 100.0f, 100.0f, createSendFunc("broadcast"));
    
    // User 1 starts drawing
    roomService.handleStrokeStart("collab-room", user1Id, "stroke-1", "#FF0000", 3.0f, createSendFunc("broadcast"));
    
    // User 1 adds points
    std::vector<Point> points = {{100, 100}, {150, 150}, {200, 200}};
    roomService.handleStrokeAdd("collab-room", user1Id, "stroke-1", points, createSendFunc("broadcast"));
    
    // User 1 finishes stroke
    roomService.handleStrokeEnd("collab-room", user1Id, "stroke-1", createSendFunc("broadcast"));
    
    // Verify room state
    auto room = roomService.getRoom("collab-room");
    EXPECT_EQ(room->getParticipantCount(), 2);
    EXPECT_EQ(room->getStrokeCount(), 1);
    
    auto* stroke = room->getStroke("stroke-1");
    EXPECT_TRUE(stroke->complete);
    EXPECT_EQ(stroke->pointCount(), 3);
    EXPECT_EQ(stroke->color, "#FF0000");
}

TEST_F(IntegrationTest, MultipleUsersDrawing) {
    // 3 users join
    std::vector<std::string> userIds;
    for (int i = 0; i < 3; ++i) {
        auto result = roomService.joinRoom("art-room", "Artist" + std::to_string(i), "", 
                                            nullptr, createSendFunc("user" + std::to_string(i)));
        EXPECT_TRUE(result.success);
        userIds.push_back(result.oderId);
    }
    
    // Each user draws a stroke
    for (int i = 0; i < 3; ++i) {
        std::string strokeId = "stroke-" + std::to_string(i);
        roomService.handleStrokeStart("art-room", userIds[i], strokeId, "#00FF00", 2.0f, createSendFunc("broadcast"));
        
        std::vector<Point> pts = {{static_cast<float>(i*100), static_cast<float>(i*100)}};
        roomService.handleStrokeAdd("art-room", userIds[i], strokeId, pts, createSendFunc("broadcast"));
        roomService.handleStrokeEnd("art-room", userIds[i], strokeId, createSendFunc("broadcast"));
    }
    
    auto room = roomService.getRoom("art-room");
    EXPECT_EQ(room->getStrokeCount(), 3);
}

TEST_F(IntegrationTest, UserLeavesAndRoomCleanup) {
    // User joins
    auto result = roomService.joinRoom("temp-room", "TempUser", "", nullptr, createSendFunc("user1"));
    EXPECT_TRUE(result.success);
    
    EXPECT_EQ(roomService.getRoomCount(), 1);
    
    // User leaves
    roomService.leaveRoom("temp-room", result.oderId, createSendFunc("broadcast"));
    
    // Room should be deleted since it's empty
    EXPECT_EQ(roomService.getRoomCount(), 0);
    EXPECT_FALSE(roomService.roomExists("temp-room"));
}

// =============================================================================
// MAIN
// =============================================================================

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}

