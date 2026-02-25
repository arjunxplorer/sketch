# CollabBoard Backend - CMake Build Configuration
# 
# Build instructions:
#   mkdir build && cd build
#   cmake ..
#   make
#
# Run server:
#   ./collabboard_server 8080
#
# Run tests:
#   ./layer1_test

cmake_minimum_required(VERSION 3.16)
project(CollabBoard VERSION 1.0.0 LANGUAGES CXX)

# =============================================================================
# C++ Standard
# =============================================================================
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# =============================================================================
# Compiler Flags
# =============================================================================
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang|AppleClang")
    add_compile_options(
        -Wall
        -Wextra
        -Wpedantic
        -Werror=return-type
        -Wno-unused-parameter
    )
    
    # Debug flags
    set(CMAKE_CXX_FLAGS_DEBUG "-g -O0 -DDEBUG")
    
    # Release flags
    set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG")
endif()

# Default to Release build if not specified
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

message(STATUS "Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "C++ Compiler: ${CMAKE_CXX_COMPILER_ID} ${CMAKE_CXX_COMPILER_VERSION}")

# =============================================================================
# Dependencies
# =============================================================================

# Boost (required for Beast WebSocket) - header-only mode
set(Boost_NO_WARN_NEW_VERSIONS 1)
find_package(Boost 1.74 REQUIRED)
if(Boost_FOUND)
    message(STATUS "Boost version: ${Boost_VERSION}")
    include_directories(${Boost_INCLUDE_DIRS})
endif()

# nlohmann/json (fetch if not found)
find_package(nlohmann_json 3.9 QUIET)
if(NOT nlohmann_json_FOUND)
    message(STATUS "nlohmann_json not found, fetching...")
    include(FetchContent)
    FetchContent_Declare(
        nlohmann_json
        GIT_REPOSITORY https://github.com/nlohmann/json.git
        GIT_TAG v3.11.3
    )
    FetchContent_MakeAvailable(nlohmann_json)
endif()

# Threads
find_package(Threads REQUIRED)

# =============================================================================
# Include Directories
# =============================================================================
include_directories(${CMAKE_SOURCE_DIR}/src)

# =============================================================================
# Main Server Executable
# =============================================================================
add_executable(collabboard_server
    src/main.cpp
)

target_link_libraries(collabboard_server
    nlohmann_json::nlohmann_json
    Threads::Threads
)

target_include_directories(collabboard_server PRIVATE
    ${CMAKE_SOURCE_DIR}/src
)

# =============================================================================
# Google Test
# =============================================================================
include(FetchContent)

FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG v1.14.0
)

# For Windows: Prevent overriding the parent project's compiler/linker settings
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)

FetchContent_MakeAvailable(googletest)

enable_testing()

# =============================================================================
# Layer 1 Test Executable
# =============================================================================
add_executable(layer1_test
    tests/layer1_test.cpp
)

target_link_libraries(layer1_test
    GTest::gtest
    GTest::gtest_main
    Threads::Threads
)

target_include_directories(layer1_test PRIVATE
    ${CMAKE_SOURCE_DIR}/src
)

# =============================================================================
# Backend Integration Test Executable
# =============================================================================
add_executable(backend_test
    tests/backend_test.cpp
)

target_link_libraries(backend_test
    GTest::gtest
    GTest::gtest_main
    nlohmann_json::nlohmann_json
    Threads::Threads
)

target_include_directories(backend_test PRIVATE
    ${CMAKE_SOURCE_DIR}/src
)

# Add tests to CTest
include(GoogleTest)
gtest_discover_tests(layer1_test)
gtest_discover_tests(backend_test)

# =============================================================================
# All Tests Target
# =============================================================================
add_custom_target(run_tests
    COMMAND ${CMAKE_CTEST_COMMAND} --output-on-failure
    DEPENDS layer1_test
    WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
)

# =============================================================================
# Installation
# =============================================================================
install(TARGETS collabboard_server DESTINATION bin)

# =============================================================================
# Summary
# =============================================================================
message(STATUS "")
message(STATUS "=== CollabBoard Backend ===")
message(STATUS "")
message(STATUS "Build targets:")
message(STATUS "  collabboard_server - Main WebSocket server")
message(STATUS "  layer1_test        - Layer 1 unit tests")
message(STATUS "")
message(STATUS "Commands:")
message(STATUS "  make                    - Build all targets")
message(STATUS "  make run_tests          - Run all tests")
message(STATUS "  ./collabboard_server    - Run server on default port 8080")
message(STATUS "  ./collabboard_server 9000 - Run server on port 9000")
message(STATUS "")
