/**
 * @file layer1_test.cpp
 * @brief Unit tests for Layer 1: Foundation files
 * 
 * Tests cover:
 * - message_types.hpp: Enum conversions, error codes, constants
 * - uuid.hpp: UUID generation, validation, uniqueness
 * - rate_limiter.hpp: Token consumption, rate limiting, muting
 * 
 * Build and run:
 *   cd backend/build
 *   cmake ..
 *   make
 *   ./layer1_test
 */

#include <gtest/gtest.h>
#include <set>
#include <thread>
#include <chrono>
#include <vector>
#include <future>

#include "../src/protocol/message_types.hpp"
#include "../src/utils/uuid.hpp"
#include "../src/utils/rate_limiter.hpp"

using namespace collabboard;

// =============================================================================
// MESSAGE TYPES TESTS
// =============================================================================

class MessageTypesTest : public ::testing::Test {
protected:
    void SetUp() override {}
    void TearDown() override {}
};

// Test: All message types convert to string correctly
TEST_F(MessageTypesTest, MessageTypeToString) {
    EXPECT_EQ(messageTypeToString(MessageType::JoinRoom), "join_room");
    EXPECT_EQ(messageTypeToString(MessageType::Welcome), "welcome");
    EXPECT_EQ(messageTypeToString(MessageType::UserJoined), "user_joined");
    EXPECT_EQ(messageTypeToString(MessageType::UserLeft), "user_left");
    EXPECT_EQ(messageTypeToString(MessageType::CursorMove), "cursor_move");
    EXPECT_EQ(messageTypeToString(MessageType::StrokeStart), "stroke_start");
    EXPECT_EQ(messageTypeToString(MessageType::StrokeAdd), "stroke_add");
    EXPECT_EQ(messageTypeToString(MessageType::StrokeEnd), "stroke_end");
    EXPECT_EQ(messageTypeToString(MessageType::RoomState), "room_state");
    EXPECT_EQ(messageTypeToString(MessageType::Ping), "ping");
    EXPECT_EQ(messageTypeToString(MessageType::Pong), "pong");
    EXPECT_EQ(messageTypeToString(MessageType::Error), "error");
}

// Test: Unknown message type throws exception
TEST_F(MessageTypesTest, UnknownMessageTypeThrows) {
    EXPECT_THROW(messageTypeToString(MessageType::Unknown), std::invalid_argument);
}

// Test: String to message type conversion
TEST_F(MessageTypesTest, StringToMessageType) {
    EXPECT_EQ(stringToMessageType("join_room"), MessageType::JoinRoom);
    EXPECT_EQ(stringToMessageType("welcome"), MessageType::Welcome);
    EXPECT_EQ(stringToMessageType("user_joined"), MessageType::UserJoined);
    EXPECT_EQ(stringToMessageType("user_left"), MessageType::UserLeft);
    EXPECT_EQ(stringToMessageType("cursor_move"), MessageType::CursorMove);
    EXPECT_EQ(stringToMessageType("stroke_start"), MessageType::StrokeStart);
    EXPECT_EQ(stringToMessageType("stroke_add"), MessageType::StrokeAdd);
    EXPECT_EQ(stringToMessageType("stroke_end"), MessageType::StrokeEnd);
    EXPECT_EQ(stringToMessageType("room_state"), MessageType::RoomState);
    EXPECT_EQ(stringToMessageType("ping"), MessageType::Ping);
    EXPECT_EQ(stringToMessageType("pong"), MessageType::Pong);
    EXPECT_EQ(stringToMessageType("error"), MessageType::Error);
}

// Test: Unknown string returns Unknown type
TEST_F(MessageTypesTest, UnknownStringReturnsUnknown) {
    EXPECT_EQ(stringToMessageType("invalid"), MessageType::Unknown);
    EXPECT_EQ(stringToMessageType(""), MessageType::Unknown);
    EXPECT_EQ(stringToMessageType("JOIN_ROOM"), MessageType::Unknown);  // Case sensitive
}

// Test: Roundtrip conversion
TEST_F(MessageTypesTest, RoundtripConversion) {
    std::vector<MessageType> types = {
        MessageType::JoinRoom, MessageType::Welcome, MessageType::UserJoined,
        MessageType::UserLeft, MessageType::CursorMove, MessageType::StrokeStart,
        MessageType::StrokeAdd, MessageType::StrokeEnd, MessageType::RoomState,
        MessageType::Ping, MessageType::Pong, MessageType::Error
    };

    for (auto type : types) {
        std::string str(messageTypeToString(type));
        EXPECT_EQ(stringToMessageType(str), type);
    }
}

// Test: Error codes convert to string
TEST_F(MessageTypesTest, ErrorCodeToString) {
    EXPECT_EQ(errorCodeToString(ErrorCode::RoomNotFound), "ROOM_NOT_FOUND");
    EXPECT_EQ(errorCodeToString(ErrorCode::RoomFull), "ROOM_FULL");
    EXPECT_EQ(errorCodeToString(ErrorCode::InvalidPassword), "INVALID_PASSWORD");
    EXPECT_EQ(errorCodeToString(ErrorCode::RateLimited), "RATE_LIMITED");
    EXPECT_EQ(errorCodeToString(ErrorCode::MalformedMessage), "MALFORMED_MESSAGE");
}

// Test: Error codes have messages
TEST_F(MessageTypesTest, ErrorCodeToMessage) {
    EXPECT_FALSE(std::string(errorCodeToMessage(ErrorCode::RoomFull)).empty());
    EXPECT_FALSE(std::string(errorCodeToMessage(ErrorCode::RateLimited)).empty());
    EXPECT_FALSE(std::string(errorCodeToMessage(ErrorCode::InternalError)).empty());
}

// Test: Protocol constants are reasonable
TEST_F(MessageTypesTest, ProtocolConstants) {
    EXPECT_EQ(ProtocolConstants::MaxUsersPerRoom, 15);
    EXPECT_EQ(ProtocolConstants::MaxStrokesPerRoom, 1000);
    EXPECT_EQ(ProtocolConstants::MaxMessageSize, 64 * 1024);
    EXPECT_GT(ProtocolConstants::HeartbeatTimeoutMs, ProtocolConstants::HeartbeatIntervalMs);
    EXPECT_EQ(ProtocolConstants::CursorUpdatesPerSecond, 20.0);
}

// =============================================================================
// UUID TESTS
// =============================================================================

class UUIDTest : public ::testing::Test {
protected:
    void SetUp() override {}
    void TearDown() override {}
};

// Test: UUID has correct format
TEST_F(UUIDTest, UUIDFormat) {
    std::string uuid = generateUUID();
    
    // Check length: 36 characters (32 hex + 4 dashes)
    EXPECT_EQ(uuid.length(), 36);
    
    // Check dash positions
    EXPECT_EQ(uuid[8], '-');
    EXPECT_EQ(uuid[13], '-');
    EXPECT_EQ(uuid[18], '-');
    EXPECT_EQ(uuid[23], '-');
    
    // Check version (position 14 should be '4')
    EXPECT_EQ(uuid[14], '4');
    
    // Check variant (position 19 should be 8, 9, a, or b)
    char variant = uuid[19];
    EXPECT_TRUE(variant == '8' || variant == '9' || 
                variant == 'a' || variant == 'b' ||
                variant == 'A' || variant == 'B');
}

// Test: UUID validation works
TEST_F(UUIDTest, UUIDValidation) {
    // Valid UUIDs
    EXPECT_TRUE(isValidUUID(generateUUID()));
    EXPECT_TRUE(isValidUUID("f47ac10b-58cc-4372-a567-0e02b2c3d479"));
    EXPECT_TRUE(isValidUUID("550e8400-e29b-41d4-a716-446655440000"));
    
    // Invalid UUIDs
    EXPECT_FALSE(isValidUUID(""));
    EXPECT_FALSE(isValidUUID("not-a-uuid"));
    EXPECT_FALSE(isValidUUID("f47ac10b-58cc-3372-a567-0e02b2c3d479"));  // Wrong version (3)
    EXPECT_FALSE(isValidUUID("f47ac10b-58cc-4372-c567-0e02b2c3d479"));  // Wrong variant (c)
    EXPECT_FALSE(isValidUUID("f47ac10b58cc4372a5670e02b2c3d479"));      // No dashes
    EXPECT_FALSE(isValidUUID("f47ac10b-58cc-4372-a567-0e02b2c3d47"));   // Too short
    EXPECT_FALSE(isValidUUID("f47ac10b-58cc-4372-a567-0e02b2c3d4799")); // Too long
    EXPECT_FALSE(isValidUUID("g47ac10b-58cc-4372-a567-0e02b2c3d479"));  // Invalid hex char
}

// Test: UUIDs are unique
TEST_F(UUIDTest, UUIDUniqueness) {
    std::set<std::string> uuids;
    const int count = 10000;
    
    for (int i = 0; i < count; ++i) {
        uuids.insert(generateUUID());
    }
    
    // All UUIDs should be unique
    EXPECT_EQ(uuids.size(), count);
}

// Test: Short ID format
TEST_F(UUIDTest, ShortIdFormat) {
    std::string shortId = generateShortId();
    
    // Check length: 8 hex characters
    EXPECT_EQ(shortId.length(), 8);
    
    // Check all characters are hex
    for (char c : shortId) {
        EXPECT_TRUE((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'));
    }
}

// Test: Short IDs are reasonably unique
TEST_F(UUIDTest, ShortIdUniqueness) {
    std::set<std::string> ids;
    const int count = 1000;
    
    for (int i = 0; i < count; ++i) {
        ids.insert(generateShortId());
    }
    
    // All should be unique (collision probability is very low)
    EXPECT_EQ(ids.size(), count);
}

// Test: Prefixed ID generators
TEST_F(UUIDTest, PrefixedIdGenerators) {
    std::string roomId = generateRoomId();
    EXPECT_TRUE(roomId.rfind("room-", 0) == 0);  // Starts with "room-"
    EXPECT_EQ(roomId.length(), 13);  // "room-" + 8 hex chars
    
    std::string oderId = generateUserId();
    EXPECT_TRUE(oderId.rfind("user-", 0) == 0);  // Starts with "user-"
    EXPECT_EQ(oderId.length(), 41);  // "user-" + 36 UUID chars
    
    std::string strokeId = generateStrokeId();
    EXPECT_TRUE(strokeId.rfind("stroke-", 0) == 0);  // Starts with "stroke-"
    EXPECT_EQ(strokeId.length(), 15);  // "stroke-" + 8 hex chars
}

// Test: Thread safety of UUID generation
TEST_F(UUIDTest, ThreadSafety) {
    const int threadsCount = 10;
    const int uuidsPerThread = 1000;
    std::vector<std::future<std::vector<std::string>>> futures;
    
    for (int t = 0; t < threadsCount; ++t) {
        futures.push_back(std::async(std::launch::async, [uuidsPerThread]() {
            std::vector<std::string> ids;
            for (int i = 0; i < uuidsPerThread; ++i) {
                ids.push_back(generateUUID());
            }
            return ids;
        }));
    }
    
    std::set<std::string> allUuids;
    for (auto& future : futures) {
        auto ids = future.get();
        for (const auto& id : ids) {
            allUuids.insert(id);
        }
    }
    
    // All UUIDs from all threads should be unique
    EXPECT_EQ(allUuids.size(), threadsCount * uuidsPerThread);
}

// =============================================================================
// RATE LIMITER TESTS
// =============================================================================

class RateLimiterTest : public ::testing::Test {
protected:
    void SetUp() override {}
    void TearDown() override {}
};

// Test: Basic token consumption
TEST_F(RateLimiterTest, BasicConsumption) {
    RateLimiter limiter(10.0, 5.0);  // 10 tokens/sec, burst of 5
    std::string userId = "user1";
    
    // Should be able to consume burst tokens
    for (int i = 0; i < 5; ++i) {
        EXPECT_TRUE(limiter.tryConsume(userId));
    }
    
    // Should be rate limited now (no tokens left)
    EXPECT_FALSE(limiter.tryConsume(userId));
}

// Test: Token refill over time
TEST_F(RateLimiterTest, TokenRefill) {
    RateLimiter limiter(100.0, 5.0);  // 100 tokens/sec for fast testing
    std::string userId = "user1";
    
    // Consume all tokens
    for (int i = 0; i < 5; ++i) {
        limiter.tryConsume(userId);
    }
    EXPECT_FALSE(limiter.tryConsume(userId));
    
    // Wait for tokens to refill (100 tokens/sec = 1 token per 10ms)
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    
    // Should have tokens again
    EXPECT_TRUE(limiter.tryConsume(userId));
}

// Test: Burst handling
TEST_F(RateLimiterTest, BurstHandling) {
    RateLimiter limiter(10.0, 3.0);  // 10 tokens/sec, burst of 3
    std::string userId = "user1";
    
    // Can consume up to burst size
    EXPECT_TRUE(limiter.tryConsume(userId));
    EXPECT_TRUE(limiter.tryConsume(userId));
    EXPECT_TRUE(limiter.tryConsume(userId));
    EXPECT_FALSE(limiter.tryConsume(userId));
}

// Test: Multiple users are independent
TEST_F(RateLimiterTest, MultipleUsers) {
    RateLimiter limiter(10.0, 2.0);
    
    // User1 consumes tokens
    EXPECT_TRUE(limiter.tryConsume("user1"));
    EXPECT_TRUE(limiter.tryConsume("user1"));
    EXPECT_FALSE(limiter.tryConsume("user1"));
    
    // User2 should still have tokens
    EXPECT_TRUE(limiter.tryConsume("user2"));
    EXPECT_TRUE(limiter.tryConsume("user2"));
    EXPECT_FALSE(limiter.tryConsume("user2"));
}

// Test: canConsume doesn't consume tokens
TEST_F(RateLimiterTest, CanConsumeDoesNotConsume) {
    RateLimiter limiter(10.0, 2.0);
    std::string userId = "user1";
    
    EXPECT_TRUE(limiter.canConsume(userId));
    EXPECT_TRUE(limiter.canConsume(userId));
    EXPECT_TRUE(limiter.canConsume(userId));  // Still true
    
    // Actually consume
    EXPECT_TRUE(limiter.tryConsume(userId));
    EXPECT_TRUE(limiter.tryConsume(userId));
    EXPECT_FALSE(limiter.canConsume(userId));
}

// Test: Get tokens count
TEST_F(RateLimiterTest, GetTokens) {
    RateLimiter limiter(10.0, 5.0);
    std::string userId = "user1";
    
    // New user has no bucket yet
    EXPECT_FALSE(limiter.getTokens("nonexistent").has_value());
    
    // After first access, bucket is created with max tokens
    limiter.tryConsume(userId);
    auto tokens = limiter.getTokens(userId);
    EXPECT_TRUE(tokens.has_value());
    EXPECT_NEAR(tokens.value(), 4.0, 0.1);  // 5 - 1 = 4
}

// Test: Reset bucket
TEST_F(RateLimiterTest, Reset) {
    RateLimiter limiter(10.0, 5.0);
    std::string userId = "user1";
    
    // Consume all tokens
    for (int i = 0; i < 5; ++i) {
        limiter.tryConsume(userId);
    }
    EXPECT_FALSE(limiter.tryConsume(userId));
    
    // Reset
    limiter.reset(userId);
    
    // Should have tokens again
    EXPECT_TRUE(limiter.tryConsume(userId));
}

// Test: Remove user
TEST_F(RateLimiterTest, Remove) {
    RateLimiter limiter(10.0, 5.0);
    std::string userId = "user1";
    
    limiter.tryConsume(userId);
    EXPECT_EQ(limiter.size(), 1);
    
    limiter.remove(userId);
    EXPECT_EQ(limiter.size(), 0);
}

// Test: Wait time calculation
TEST_F(RateLimiterTest, WaitTime) {
    RateLimiter limiter(10.0, 2.0);  // 10 tokens/sec
    std::string userId = "user1";
    
    // Consume all tokens
    limiter.tryConsume(userId);
    limiter.tryConsume(userId);
    
    // Should need to wait ~100ms for 1 token at 10 tokens/sec
    int64_t waitTime = limiter.getWaitTimeMs(userId);
    EXPECT_GT(waitTime, 50);   // More than 50ms
    EXPECT_LT(waitTime, 150);  // Less than 150ms
}

// Test: CursorRateLimiter preset
TEST_F(RateLimiterTest, CursorRateLimiter) {
    CursorRateLimiter limiter;
    
    EXPECT_EQ(limiter.getTokensPerSecond(), 20.0);
    EXPECT_EQ(limiter.getMaxTokens(), 5.0);
    
    // Should allow burst of 5
    for (int i = 0; i < 5; ++i) {
        EXPECT_TRUE(limiter.tryConsume("user1"));
    }
    EXPECT_FALSE(limiter.tryConsume("user1"));
}

// Test: Consume multiple tokens
TEST_F(RateLimiterTest, ConsumeMultiple) {
    RateLimiter limiter(10.0, 5.0);
    std::string userId = "user1";
    
    // Consume 3 tokens at once
    EXPECT_TRUE(limiter.tryConsume(userId, 3.0));
    
    // Only 2 left
    EXPECT_TRUE(limiter.tryConsume(userId, 2.0));
    
    // None left
    EXPECT_FALSE(limiter.tryConsume(userId, 1.0));
}

// Test: Thread safety of rate limiter
TEST_F(RateLimiterTest, ThreadSafety) {
    RateLimiter limiter(1000.0, 100.0);  // High rate for testing
    std::atomic<int> successCount{0};
    std::atomic<int> failCount{0};
    
    const int threadsCount = 10;
    const int attemptsPerThread = 50;
    std::vector<std::thread> threads;
    
    for (int t = 0; t < threadsCount; ++t) {
        threads.emplace_back([&limiter, &successCount, &failCount, attemptsPerThread]() {
            for (int i = 0; i < attemptsPerThread; ++i) {
                if (limiter.tryConsume("shared_user")) {
                    ++successCount;
                } else {
                    ++failCount;
                }
            }
        });
    }
    
    for (auto& thread : threads) {
        thread.join();
    }
    
    // Total attempts should match
    EXPECT_EQ(successCount + failCount, threadsCount * attemptsPerThread);
    
    // Should have some successes (at least burst amount)
    EXPECT_GE(successCount, 100);
}

// =============================================================================
// MUTING RATE LIMITER TESTS
// =============================================================================

class MutingRateLimiterTest : public ::testing::Test {
protected:
    void SetUp() override {}
    void TearDown() override {}
};

// Test: Basic muting after violations
TEST_F(MutingRateLimiterTest, MutingAfterViolations) {
    MutingRateLimiter limiter(100.0, 2.0, 100, 3);  // 100ms mute, 3 violations
    std::string userId = "user1";
    
    // Consume tokens
    EXPECT_TRUE(limiter.tryConsume(userId));
    EXPECT_TRUE(limiter.tryConsume(userId));
    
    // Now rate limited - these are violations
    EXPECT_FALSE(limiter.tryConsume(userId));  // Violation 1
    EXPECT_FALSE(limiter.tryConsume(userId));  // Violation 2
    EXPECT_FALSE(limiter.tryConsume(userId));  // Violation 3 -> muted
    
    // Should be muted now
    EXPECT_TRUE(limiter.isMuted(userId));
}

// Test: Mute expires after duration
TEST_F(MutingRateLimiterTest, MuteExpires) {
    MutingRateLimiter limiter(1000.0, 2.0, 50, 2);  // 50ms mute, 2 violations
    std::string userId = "user1";
    
    // Get muted
    limiter.tryConsume(userId);
    limiter.tryConsume(userId);
    limiter.tryConsume(userId);  // Violation 1
    limiter.tryConsume(userId);  // Violation 2 -> muted
    
    EXPECT_TRUE(limiter.isMuted(userId));
    
    // Wait for mute to expire
    std::this_thread::sleep_for(std::chrono::milliseconds(60));
    
    EXPECT_FALSE(limiter.isMuted(userId));
    EXPECT_TRUE(limiter.tryConsume(userId));  // Should work again
}

// Test: Get mute time remaining
TEST_F(MutingRateLimiterTest, MuteTimeRemaining) {
    MutingRateLimiter limiter(1000.0, 1.0, 100, 1);  // 100ms mute, 1 violation
    std::string userId = "user1";
    
    // Not muted yet
    EXPECT_EQ(limiter.getMuteTimeRemainingMs(userId), 0);
    
    // Get muted
    limiter.tryConsume(userId);
    limiter.tryConsume(userId);  // Muted
    
    int64_t remaining = limiter.getMuteTimeRemainingMs(userId);
    EXPECT_GT(remaining, 50);
    EXPECT_LE(remaining, 100);
}

// Test: Remove clears mute status
TEST_F(MutingRateLimiterTest, RemoveClearsMute) {
    // Use maxTokens=5 to avoid edge cases, 1 violation to mute
    MutingRateLimiter limiter(1000.0, 5.0, 1000, 1);
    std::string userId = "user1";
    
    // Consume all tokens to trigger rate limiting
    for (int i = 0; i < 5; ++i) {
        limiter.tryConsume(userId);
    }
    
    // This should fail (rate limited) and cause muting (1 violation = muted)
    EXPECT_FALSE(limiter.tryConsume(userId));
    EXPECT_TRUE(limiter.isMuted(userId));
    
    // Remove user - clears mute status and bucket
    limiter.remove(userId);
    
    // Should not be muted anymore
    EXPECT_FALSE(limiter.isMuted(userId));
    
    // Should be able to consume again (fresh bucket with 5 tokens)
    EXPECT_TRUE(limiter.tryConsume(userId));
}

// =============================================================================
// MAIN
// =============================================================================

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}

