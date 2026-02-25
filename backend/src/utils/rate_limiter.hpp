
#pragma once

#include <string>
#include <unordered_map>
#include <chrono>
#include <mutex>
#include <optional>

namespace collabboard {

/**
 * @brief Token bucket for rate limiting.
 * 
 * Each bucket tracks available tokens and refills over time.
 * Tokens are consumed when actions are performed.
 */
struct TokenBucket {
    double tokens;
    std::chrono::steady_clock::time_point lastRefill;

    TokenBucket(double initialTokens = 0.0)
        : tokens(initialTokens)
        , lastRefill(std::chrono::steady_clock::now())
    {}
};

/**
 * @brief Token bucket rate limiter for controlling message frequency.
 * 
 * Implements the token bucket algorithm:
 * - Each user has a bucket that fills with tokens over time
 * - Sending a message consumes one token
 * - If no tokens available, the action is rate limited
 * - Bucket has a maximum capacity (burst size)
 * 
 * Thread-safe: All operations are protected by mutex.
 * 
 * Example usage:
 *   RateLimiter limiter(20.0, 5.0);  // 20 tokens/sec, burst of 5
 *   
 *   if (limiter.tryConsume(oderId)) {
 *       // Action allowed, process message
 *   } else {
 *       // Rate limited, reject or queue message
 *   }
 */
class RateLimiter {
public:
    /**
     * @brief Construct a new Rate Limiter.
     * @param tokensPerSecond How many tokens are added per second
     * @param maxTokens Maximum tokens in bucket (burst size)
     */
    explicit RateLimiter(double tokensPerSecond = 20.0, double maxTokens = 5.0)
        : tokensPerSecond_(tokensPerSecond)
        , maxTokens_(maxTokens)
    {}

    /**
     * @brief Try to consume a token for the given user.
     * @param userId The user identifier
     * @return true if token was consumed (action allowed)
     * @return false if rate limited (no tokens available)
     */
    bool tryConsume(const std::string& userId) {
        std::lock_guard<std::mutex> lock(mutex_);

        auto now = std::chrono::steady_clock::now();
        auto& bucket = getOrCreateBucket(userId);

        // Refill tokens based on elapsed time
        refillBucket(bucket, now);

        // Try to consume a token
        if (bucket.tokens >= 1.0) {
            bucket.tokens -= 1.0;
            return true;
        }

        return false;
    }

    /**
     * @brief Try to consume multiple tokens for the given user.
     * @param userId The user identifier
     * @param count Number of tokens to consume
     * @return true if tokens were consumed (action allowed)
     * @return false if rate limited (not enough tokens)
     */
    bool tryConsume(const std::string& userId, double count) {
        std::lock_guard<std::mutex> lock(mutex_);

        auto now = std::chrono::steady_clock::now();
        auto& bucket = getOrCreateBucket(userId);

        refillBucket(bucket, now);

        if (bucket.tokens >= count) {
            bucket.tokens -= count;
            return true;
        }

        return false;
    }

    /**
     * @brief Check if a user is currently rate limited without consuming.
     * @param userId The user identifier
     * @return true if at least one token is available
     * @return false if rate limited
     */
    bool canConsume(const std::string& userId) {
        std::lock_guard<std::mutex> lock(mutex_);

        auto now = std::chrono::steady_clock::now();
        auto& bucket = getOrCreateBucket(userId);

        refillBucket(bucket, now);

        return bucket.tokens >= 1.0;
    }

    /**
     * @brief Get the current token count for a user.
     * @param userId The user identifier
     * @return Current token count, or nullopt if user has no bucket
     */
    std::optional<double> getTokens(const std::string& userId) {
        std::lock_guard<std::mutex> lock(mutex_);

        auto it = buckets_.find(userId);
        if (it == buckets_.end()) {
            return std::nullopt;
        }

        auto now = std::chrono::steady_clock::now();
        refillBucket(it->second, now);

        return it->second.tokens;
    }

    /**
     * @brief Get time until next token is available.
     * @param userId The user identifier
     * @return Milliseconds until next token, 0 if tokens available
     */
    int64_t getWaitTimeMs(const std::string& userId) {
        std::lock_guard<std::mutex> lock(mutex_);

        auto now = std::chrono::steady_clock::now();
        auto& bucket = getOrCreateBucket(userId);

        refillBucket(bucket, now);

        if (bucket.tokens >= 1.0) {
            return 0;
        }

        // Calculate time to get one token
        double tokensNeeded = 1.0 - bucket.tokens;
        double secondsToWait = tokensNeeded / tokensPerSecond_;
        return static_cast<int64_t>(secondsToWait * 1000.0);
    }

    /**
     * @brief Reset a user's bucket to full capacity.
     * @param userId The user identifier
     * 
     * Useful after a mute period ends or for testing.
     */
    void reset(const std::string& userId) {
        std::lock_guard<std::mutex> lock(mutex_);

        auto it = buckets_.find(userId);
        if (it != buckets_.end()) {
            it->second.tokens = maxTokens_;
            it->second.lastRefill = std::chrono::steady_clock::now();
        }
    }

    /**
     * @brief Remove a user's bucket entirely.
     * @param userId The user identifier
     * 
     * Call when user disconnects to free memory.
     */
    void remove(const std::string& userId) {
        std::lock_guard<std::mutex> lock(mutex_);
        buckets_.erase(userId);
    }

    /**
     * @brief Remove buckets that haven't been used recently.
     * @param maxAgeSeconds Remove buckets older than this
     * @return Number of buckets removed
     * 
     * Call periodically to prevent memory growth from inactive users.
     */
    size_t cleanup(int maxAgeSeconds = 300) {
        std::lock_guard<std::mutex> lock(mutex_);

        auto now = std::chrono::steady_clock::now();
        auto maxAge = std::chrono::seconds(maxAgeSeconds);
        size_t removed = 0;

        for (auto it = buckets_.begin(); it != buckets_.end(); ) {
            if (now - it->second.lastRefill > maxAge) {
                it = buckets_.erase(it);
                ++removed;
            } else {
                ++it;
            }
        }

        return removed;
    }

    /**
     * @brief Get the number of tracked users.
     * @return Number of active buckets
     */
    size_t size() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return buckets_.size();
    }

    /**
     * @brief Clear all buckets.
     */
    void clear() {
        std::lock_guard<std::mutex> lock(mutex_);
        buckets_.clear();
    }

    // Getters for configuration
    double getTokensPerSecond() const { return tokensPerSecond_; }
    double getMaxTokens() const { return maxTokens_; }

private:
    /**
     * @brief Get or create a bucket for the user.
     * @param userId The user identifier
     * @return Reference to the user's bucket
     * 
     * Note: Must be called with mutex held.
     */
    TokenBucket& getOrCreateBucket(const std::string& userId) {
        auto it = buckets_.find(userId);
        if (it == buckets_.end()) {
            // Create new bucket with max tokens (allows initial burst)
            auto [newIt, _] = buckets_.emplace(userId, TokenBucket(maxTokens_));
            return newIt->second;
        }
        return it->second;
    }

    /**
     * @brief Refill tokens based on elapsed time.
     * @param bucket The bucket to refill
     * @param now Current time point
     * 
     * Note: Must be called with mutex held.
     */
    void refillBucket(TokenBucket& bucket, 
                      std::chrono::steady_clock::time_point now) {
        auto elapsed = std::chrono::duration<double>(now - bucket.lastRefill);
        double tokensToAdd = elapsed.count() * tokensPerSecond_;

        bucket.tokens = std::min(bucket.tokens + tokensToAdd, maxTokens_);
        bucket.lastRefill = now;
    }

    double tokensPerSecond_;
    double maxTokens_;
    std::unordered_map<std::string, TokenBucket> buckets_;
    mutable std::mutex mutex_;
};

/**
 * @brief Specialized rate limiter for cursor updates.
 * 
 * Pre-configured with cursor-specific settings:
 * - 20 updates per second
 * - Burst of 5 for initial mouse movements
 */
class CursorRateLimiter : public RateLimiter {
public:
    CursorRateLimiter() 
        : RateLimiter(20.0, 5.0)  // 20 Hz, burst of 5
    {}
};

/**
 * @brief Rate limiter that tracks muted users.
 * 
 * When a user exceeds rate limits multiple times, they can be
 * temporarily muted. This class tracks mute status separately.
 */
class MutingRateLimiter {
public:
    /**
     * @brief Construct a muting rate limiter.
     * @param tokensPerSecond Token refill rate
     * @param maxTokens Maximum tokens (burst)
     * @param muteDurationMs How long to mute repeat offenders
     * @param violationsBeforeMute Number of violations before muting
     */
    MutingRateLimiter(
        double tokensPerSecond = 20.0,
        double maxTokens = 5.0,
        int64_t muteDurationMs = 10000,
        int violationsBeforeMute = 3
    )
        : limiter_(tokensPerSecond, maxTokens)
        , muteDurationMs_(muteDurationMs)
        , violationsBeforeMute_(violationsBeforeMute)
    {}

    /**
     * @brief Try to consume a token, tracking violations.
     * @param userId The user identifier
     * @return true if allowed
     * @return false if rate limited or muted
     */
    bool tryConsume(const std::string& userId) {
        std::lock_guard<std::mutex> lock(mutex_);

        // Check if user is muted
        auto muteIt = mutedUntil_.find(userId);
        if (muteIt != mutedUntil_.end()) {
            auto now = std::chrono::steady_clock::now();
            if (now < muteIt->second) {
                return false;  // Still muted
            }
            // Mute expired, remove it
            mutedUntil_.erase(muteIt);
            violations_.erase(userId);
        }

        // Try normal rate limiting
        if (limiter_.tryConsume(userId)) {
            return true;
        }

        // Rate limited - track violation
        int& count = violations_[userId];
        ++count;

        if (count >= violationsBeforeMute_) {
            // Mute the user
            auto muteUntil = std::chrono::steady_clock::now() + 
                             std::chrono::milliseconds(muteDurationMs_);
            mutedUntil_[userId] = muteUntil;
        }

        return false;
    }

    /**
     * @brief Check if a user is currently muted.
     * @param userId The user identifier
     * @return true if muted, false otherwise
     */
    bool isMuted(const std::string& userId) {
        std::lock_guard<std::mutex> lock(mutex_);

        auto it = mutedUntil_.find(userId);
        if (it == mutedUntil_.end()) {
            return false;
        }

        auto now = std::chrono::steady_clock::now();
        if (now >= it->second) {
            // Mute expired
            mutedUntil_.erase(it);
            violations_.erase(userId);
            return false;
        }

        return true;
    }

    /**
     * @brief Get remaining mute time in milliseconds.
     * @param userId The user identifier
     * @return Milliseconds remaining, 0 if not muted
     */
    int64_t getMuteTimeRemainingMs(const std::string& userId) {
        std::lock_guard<std::mutex> lock(mutex_);

        auto it = mutedUntil_.find(userId);
        if (it == mutedUntil_.end()) {
            return 0;
        }

        auto now = std::chrono::steady_clock::now();
        if (now >= it->second) {
            mutedUntil_.erase(it);
            return 0;
        }

        auto remaining = std::chrono::duration_cast<std::chrono::milliseconds>(
            it->second - now
        );
        return remaining.count();
    }

    /**
     * @brief Remove a user from tracking.
     * @param userId The user identifier
     */
    void remove(const std::string& userId) {
        std::lock_guard<std::mutex> lock(mutex_);
        limiter_.remove(userId);
        violations_.erase(userId);
        mutedUntil_.erase(userId);
    }

    /**
     * @brief Clear all state.
     */
    void clear() {
        std::lock_guard<std::mutex> lock(mutex_);
        limiter_.clear();
        violations_.clear();
        mutedUntil_.clear();
    }

private:
    RateLimiter limiter_;
    int64_t muteDurationMs_;
    int violationsBeforeMute_;
    std::unordered_map<std::string, int> violations_;
    std::unordered_map<std::string, std::chrono::steady_clock::time_point> mutedUntil_;
    std::mutex mutex_;
};

} // namespace collabboard