#pragma once

#include <memory>
#include <string>
#include <iostream>

#include <boost/beast/core.hpp>
#include <boost/asio/ip/tcp.hpp>
#include <boost/asio/strand.hpp>

#include "ws_session.hpp"
#include "../services/room_service.hpp"

namespace collabboard {

namespace beast = boost::beast;
namespace net = boost::asio;
using tcp = boost::asio::ip::tcp;

/**
 * @brief TCP acceptor that listens for incoming connections and spawns WebSocket sessions.
 */
class WsServer : public std::enable_shared_from_this<WsServer> {
public:
    WsServer(net::io_context& ioc, tcp::endpoint endpoint, RoomService& roomService)
        : ioc_(ioc)
        , acceptor_(net::make_strand(ioc))
        , roomService_(roomService)
    {
        beast::error_code ec;

        // Open the acceptor
        acceptor_.open(endpoint.protocol(), ec);
        if (ec) {
            fail(ec, "open");
            return;
        }

        // Allow address reuse
        acceptor_.set_option(net::socket_base::reuse_address(true), ec);
        if (ec) {
            fail(ec, "set_option");
            return;
        }

        // Bind to the server address
        acceptor_.bind(endpoint, ec);
        if (ec) {
            fail(ec, "bind");
            return;
        }

        // Start listening for connections
        acceptor_.listen(net::socket_base::max_listen_connections, ec);
        if (ec) {
            fail(ec, "listen");
            return;
        }

        std::cout << "CollabBoard server listening on " 
                  << endpoint.address().to_string() 
                  << ":" << endpoint.port() << std::endl;
    }

    /**
     * @brief Start accepting incoming connections.
     */
    void run() {
        doAccept();
    }

    /**
     * @brief Stop accepting connections.
     */
    void stop() {
        beast::error_code ec;
        acceptor_.close(ec);
    }

private:
    /**
     * @brief Start async accept for next connection.
     */
    void doAccept() {
        acceptor_.async_accept(
            net::make_strand(ioc_),
            beast::bind_front_handler(&WsServer::onAccept, shared_from_this()));
    }

    /**
     * @brief Called when a new connection is accepted.
     */
    void onAccept(beast::error_code ec, tcp::socket socket) {
        if (ec) {
            fail(ec, "accept");
        } else {
            // Create the session and run it
            std::make_shared<WsSession>(std::move(socket), roomService_)->run();
        }

        // Accept another connection
        doAccept();
    }

    /**
     * @brief Handle an error.
     */
    void fail(beast::error_code ec, char const* what) {
        std::cerr << what << ": " << ec.message() << std::endl;
    }

    net::io_context& ioc_;
    tcp::acceptor acceptor_;
    RoomService& roomService_;
};

} // namespace collabboard
