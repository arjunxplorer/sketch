/**
 * @file main.cpp
 * @brief CollabBoard WebSocket Server Entry Point
 * 
 * Starts the collaborative whiteboard WebSocket server.
 * 
 * Usage:
 *   ./collabboard_server [port]
 *   ./collabboard_server 8080
 */

#include <iostream>
#include <string>
#include <thread>
#include <vector>
#include <csignal>
#include <atomic>
#include <cstdlib>

#include <boost/asio/io_context.hpp>
#include <boost/asio/signal_set.hpp>

#include "server/ws_server.hpp"
#include "services/room_service.hpp"

namespace net = boost::asio;

// Global flag for shutdown
std::atomic<bool> g_running{true};

void printBanner() {
    std::cout << R"(
   ______      ____      __    ____                       __
  / ____/___  / / /___ _/ /_  / __ )____  ____ __________/ /
 / /   / __ \/ / / __ `/ __ \/ __  / __ \/ __ `/ ___/ __  / 
/ /___/ /_/ / / / /_/ / /_/ / /_/ / /_/ / /_/ / /  / /_/ /  
\____/\____/_/_/\__,_/_.___/_____/\____/\__,_/_/   \__,_/   

    Real-time Collaborative Whiteboard Server v1.0
)" << std::endl;
}

void printUsage(const char* programName) {
    std::cout << "Usage: " << programName << " [port]" << std::endl;
    std::cout << "  port: Port number to listen on (default: 8080)" << std::endl;
}

int main(int argc, char* argv[]) {
    // Parse port: CLI arg > PORT env var > default 8080
    unsigned short port = 8080;

    if (argc > 1) {
        std::string arg = argv[1];
        if (arg == "-h" || arg == "--help") {
            printUsage(argv[0]);
            return 0;
        }
        try {
            port = static_cast<unsigned short>(std::stoi(arg));
        } catch (...) {
            std::cerr << "Invalid port number: " << arg << std::endl;
            printUsage(argv[0]);
            return 1;
        }
    } else if (const char* envPort = std::getenv("PORT")) {
        try {
            port = static_cast<unsigned short>(std::stoi(envPort));
        } catch (...) {
            std::cerr << "Invalid PORT env: " << envPort << ", using 8080" << std::endl;
        }
    }

    printBanner();

    try {
        // Create io_context with thread count
        const auto threads = std::max<int>(1, static_cast<int>(std::thread::hardware_concurrency()));
        net::io_context ioc{threads};

        // Create room service
        collabboard::RoomService roomService;

        // Create and launch the server
        auto server = std::make_shared<collabboard::WsServer>(
            ioc,
            boost::asio::ip::tcp::endpoint{
                boost::asio::ip::make_address("0.0.0.0"),
                port
            },
            roomService
        );
        server->run();

        // Set up signal handling for graceful shutdown
        net::signal_set signals(ioc, SIGINT, SIGTERM);
        signals.async_wait([&](boost::system::error_code const&, int sig) {
            std::cout << "\nReceived signal " << sig << ", shutting down..." << std::endl;
            g_running = false;
            server->stop();
            ioc.stop();
        });

        std::cout << "Server started with " << threads << " thread(s)" << std::endl;
        std::cout << "Press Ctrl+C to stop" << std::endl;
        std::cout << std::endl;

        // Run the io_context on multiple threads
        std::vector<std::thread> v;
        v.reserve(threads - 1);
        for (auto i = threads - 1; i > 0; --i) {
            v.emplace_back([&ioc] {
                ioc.run();
            });
        }
        ioc.run();

        // Wait for all threads to complete
        for (auto& t : v) {
            t.join();
        }

        std::cout << "Server stopped." << std::endl;
        return 0;

    } catch (const std::exception& e) {
        std::cerr << "Fatal error: " << e.what() << std::endl;
        return 1;
    }
}
