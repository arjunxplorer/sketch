#pragma once

#include <memory>
#include <string>
#include <queue>
#include <mutex>
#include <chrono>

#include <boost/beast/core.hpp>
#include <boost/beast/websocket.hpp>
#include <boost/asio/strand.hpp>

#include "../protocol/message_handler.hpp"
#include "../protocol/message_codec.hpp"
#include "../services/room_service.hpp"

namespace collabboard {

namespace beast = boost::beast;
namespace websocket = beast::websocket;
namespace net = boost::asio;
using tcp = boost::asio::ip::tcp;

/**
 * @brief Manages a single WebSocket connection.
 * 
 * Handles reading, writing, and lifecycle of a WebSocket connection.
 * Uses enable_shared_from_this for safe async operations.
 */
class WsSession : public std::enable_shared_from_this<WsSession> {
public:
    WsSession(tcp::socket&& socket, RoomService& roomService)
        : ws_(std::move(socket))
        , roomService_(roomService)
        , messageHandler_(roomService)
        , strand_(net::make_strand(ws_.get_executor()))
        , isWriting_(false)
        , isClosed_(false)
        , lastPing_(std::chrono::steady_clock::now())
    {}

    ~WsSession() {
        // Ensure cleanup on destruction
        if (!roomId_.empty() && !oderId_.empty()) {
            try {
                roomService_.leaveRoom(roomId_, oderId_, 
                    [](std::shared_ptr<WsSession>, const std::string&) {});
            } catch (...) {}
        }
    }

    /**
     * @brief Start the session (accept WebSocket handshake, then read).
     */
    void run() {
        // Set suggested timeout settings for the websocket
        ws_.set_option(websocket::stream_base::timeout::suggested(
            beast::role_type::server));

        // Set a decorator to change the Server field of the handshake
        ws_.set_option(websocket::stream_base::decorator(
            [](websocket::response_type& res) {
                res.set(boost::beast::http::field::server, "CollabBoard/1.0");
            }));

        // Accept the WebSocket handshake
        ws_.async_accept(
            beast::bind_front_handler(&WsSession::onAccept, shared_from_this()));
    }

    /**
     * @brief Send a message to this session.
     */
    void send(const std::string& message) {
        // Post to strand to ensure thread safety
        net::post(strand_, [self = shared_from_this(), message]() {
            self->doSend(message);
        });
    }

    /**
     * @brief Close the session.
     */
    void close() {
        net::post(strand_, [self = shared_from_this()]() {
            self->doClose();
        });
    }

    // Getters
    const std::string& getUserId() const { return oderId_; }
    const std::string& getRoomId() const { return roomId_; }
    const std::string& getUserName() const { return userName_; }
    bool isInRoom() const { return !roomId_.empty(); }

private:
    /**
     * @brief Called when WebSocket accept completes.
     */
    void onAccept(beast::error_code ec) {
        if (ec) {
            return fail(ec, "accept");
        }
        // Start reading
        doRead();
    }

    /**
     * @brief Start async read loop.
     */
    void doRead() {
        if (isClosed_) return;

        ws_.async_read(
            buffer_,
            beast::bind_front_handler(&WsSession::onRead, shared_from_this()));
    }

    /**
     * @brief Called when a read completes.
     */
    void onRead(beast::error_code ec, std::size_t bytesTransferred) {
        boost::ignore_unused(bytesTransferred);

        // Handle close or error
        if (ec == websocket::error::closed) {
            return onDisconnect();
        }
        if (ec) {
            return fail(ec, "read");
        }

        // Process the message
        std::string message = beast::buffers_to_string(buffer_.data());
        buffer_.consume(buffer_.size());

        // Update last ping time
        lastPing_ = std::chrono::steady_clock::now();

        // Handle the message
        onMessage(message);

        // Continue reading
        doRead();
    }

    /**
     * @brief Process an incoming message.
     */
    void onMessage(const std::string& message) {
        // Create send function
        auto sendFunc = [](std::shared_ptr<WsSession> session, const std::string& msg) {
            if (session) {
                session->send(msg);
            }
        };

        // Handle message through message handler
        auto result = messageHandler_.handle(
            shared_from_this(),
            roomId_,
            oderId_,
            message,
            sendFunc
        );

        // If this was a join message, update session state
        if (result.has_value()) {
            if (result->success) {
                // Parse room ID from original message
                try {
                    auto msg = MessageCodec::parse(message);
                    auto data = MessageCodec::getData(msg);
                    roomId_ = data["roomId"].get<std::string>();
                    userName_ = data["userName"].get<std::string>();
                    oderId_ = result->oderId;
                    userColor_ = result->color;
                } catch (...) {
                    // Parse error, but join succeeded - shouldn't happen
                }
            }
        }
    }

    /**
     * @brief Queue a message for sending.
     */
    void doSend(const std::string& message) {
        if (isClosed_) return;

        writeQueue_.push(message);

        // If not already writing, start the write loop
        if (!isWriting_) {
            doWrite();
        }
    }

    /**
     * @brief Write the next message from the queue.
     */
    void doWrite() {
        if (writeQueue_.empty()) {
            isWriting_ = false;
            return;
        }

        isWriting_ = true;
        currentWrite_ = writeQueue_.front();
        writeQueue_.pop();

        ws_.async_write(
            net::buffer(currentWrite_),
            beast::bind_front_handler(&WsSession::onWrite, shared_from_this()));
    }

    /**
     * @brief Called when a write completes.
     */
    void onWrite(beast::error_code ec, std::size_t bytesTransferred) {
        boost::ignore_unused(bytesTransferred);

        if (ec) {
            return fail(ec, "write");
        }

        // Write next message
        doWrite();
    }

    /**
     * @brief Close the WebSocket connection.
     */
    void doClose() {
        if (isClosed_) return;
        isClosed_ = true;

        // Leave room before closing
        onDisconnect();

        beast::error_code ec;
        ws_.close(websocket::close_code::normal, ec);
    }

    /**
     * @brief Handle disconnect/cleanup.
     */
    void onDisconnect() {
        if (!roomId_.empty() && !oderId_.empty()) {
            auto sendFunc = [](std::shared_ptr<WsSession> session, const std::string& msg) {
                if (session) {
                    session->send(msg);
                }
            };
            roomService_.leaveRoom(roomId_, oderId_, sendFunc);
            roomId_.clear();
            oderId_.clear();
        }
    }

    /**
     * @brief Handle an error.
     */
    void fail(beast::error_code ec, char const* what) {
        // Log error (in production, use proper logging)
        // std::cerr << what << ": " << ec.message() << std::endl;
        onDisconnect();
    }

    websocket::stream<beast::tcp_stream> ws_;
    RoomService& roomService_;
    MessageHandler messageHandler_;
    net::strand<net::any_io_executor> strand_;
    beast::flat_buffer buffer_;
    
    std::queue<std::string> writeQueue_;
    std::string currentWrite_;
    bool isWriting_;
    bool isClosed_;

    std::string oderId_;
    std::string roomId_;
    std::string userName_;
    std::string userColor_;
    std::chrono::steady_clock::time_point lastPing_;
};

} // namespace collabboard
