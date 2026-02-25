# CollabBoard Backend - Docker image for deployment (Render, Railway, etc.)
FROM ubuntu:22.04

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libboost-all-dev \
    nlohmann-json3-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy source code
COPY . .

# Build
RUN mkdir -p build && cd build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release && \
    make collabboard_server

# Run only the server (no tests)
WORKDIR /app/build
EXPOSE 8080

# Render sets PORT env var; main.cpp reads it
CMD ["./collabboard_server"]
