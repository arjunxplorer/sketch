#pragma once

/**
 * @file http_connection.hpp
 * @brief Handles initial HTTP request - routes /health to HTTP response, else to WebSocket.
 */

#include <memory>
#include <optional>
#include <string>

#include <boost/beast/core.hpp>
#include <boost/beast/http.hpp>
#include <boost/asio/ip/tcp.hpp>

#include "ws_session.hpp"
#include "../services/room_service.hpp"

namespace collabboard {

namespace beast = boost::beast;
namespace http = beast::http;
namespace net = boost::asio;
using tcp = boost::asio::ip::tcp;

/**
 * @brief Handles the initial HTTP request. Routes GET /health to a 200 response,
 *        all other requests to WebSocket upgrade.
 */
class HttpConnection : public std::enable_shared_from_this<HttpConnection> {
public:
    HttpConnection(tcp::socket&& socket, RoomService& roomService)
        : socket_(std::move(socket))
        , roomService_(roomService)
    {}

    void run() {
        readRequest();
    }

private:
    void readRequest() {
        parser_.emplace();
        parser_->body_limit(1024);

        http::async_read(
            socket_,
            buffer_,
            *parser_,
            beast::bind_front_handler(&HttpConnection::onRead, shared_from_this()));
    }

    void onRead(beast::error_code ec, std::size_t) {
        if (ec) {
            return;
        }

        auto& req = parser_->get();

        // Health check endpoint for keepalive pings (Render, UptimeRobot, etc.)
        if (req.method() == http::verb::get &&
            req.target() == "/health") {
            sendHealthResponse();
            return;
        }

        // WebSocket upgrade - pass to WsSession
        upgradeToWebSocket(req);
    }

    void sendHealthResponse() {
        http::response<http::string_body> res{http::status::ok, 11};
        res.set(http::field::server, "CollabBoard/1.0");
        res.set(http::field::content_type, "text/plain");
        res.body() = "OK";
        res.prepare_payload();

        auto self = shared_from_this();
        http::async_write(
            socket_,
            res,
            [self](beast::error_code ec, std::size_t) {
                beast::error_code closeEc;
                self->socket_.shutdown(tcp::socket::shutdown_both, closeEc);
            });
    }

    void upgradeToWebSocket(http::request<http::empty_body> const& req) {
        // Create WebSocket session with the socket (move it)
        auto wsSession = std::make_shared<WsSession>(std::move(socket_), roomService_);
        wsSession->runWithRequest(req);
    }

    tcp::socket socket_;
    RoomService& roomService_;
    beast::flat_buffer buffer_;
    std::optional<http::request_parser<http::empty_body>> parser_;
};

} // namespace collabboard
