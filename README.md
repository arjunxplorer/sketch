<div align="center">

# CollabBoard

**A real-time collaborative whiteboard with a C++20 WebSocket backend and React + TypeScript frontend**

![C++20](https://img.shields.io/badge/C%2B%2B-20-blue?style=flat-square&logo=cplusplus)
![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?style=flat-square&logo=typescript)
![License](https://img.shields.io/badge/License-Private-red?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS-lightgrey?style=flat-square)

[Features](#features) · [Quick Start](#quick-start) · [Architecture](#architecture) · [Protocol](#protocol-reference) · [Tools](#drawing-tools) · [Deploy](#deployment) · [Testing](#testing)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Drawing Tools](#drawing-tools)
- [Protocol Reference](#protocol-reference)
- [Network & Reliability](#network--reliability)
- [Building from Source](#building-from-source)
- [Deployment](#deployment)
- [Testing](#testing)
- [Environment Variables](#environment-variables)
- [License](#license)

---

## Overview

CollabBoard is a real-time collaborative whiteboard application. Users join named rooms, draw freehand strokes, create shapes, add text, and see each other's cursors — all synchronized live over WebSockets.

The backend is a multi-threaded C++20 WebSocket server built on Boost.Beast. The frontend is a single-page React application written in TypeScript with Vite. They communicate over a custom JSON-based WebSocket protocol with sequence numbering, heartbeats, and rate limiting.

---

## Features

| Feature | Description |
|---------|-------------|
| **10 Drawing Tools** | Pen, line, arrow, rectangle, ellipse, diamond, text, eraser, select, pan |
| **Real-Time Cursors** | Smooth cursor interpolation with exponential smoothing via requestAnimationFrame |
| **Room Management** | On-demand rooms with optional password protection and auto-cleanup |
| **Auto-Reconnect** | Exponential backoff reconnection with localStorage persistence |
| **Heartbeat System** | Ping/pong keep-alive (10s interval, 30s timeout) with ghost cursor detection |
| **Rate Limiting** | Server-side token bucket rate limiter (20 req/s) with muting for repeat offenders |
| **Dynamic Canvas** | Never-clipping canvas with zoom (0.5x–3x) and offscreen caching for redraws |
| **Dark Theme** | Custom dark UI with indigo accent, JetBrains Mono font |
| **Zero Config Rooms** | Any room ID works — rooms are created on demand |

---

## Quick Start

### 1. Build the Backend

```bash
cd backend
mkdir build && cd build
cmake ..
make
./collabboard_server          # default port 8080
```

### 2. Run the Frontend

```bash
cd frontend
npm install
npm run dev                   # starts on http://localhost:3000
```

### 3. Collaborate

Open `http://localhost:3000` in two browser tabs, join the same room, and start drawing. Cursors and strokes sync in real time.

---

## Architecture

```
┌─────────────────┐                         ┌─────────────────┐
│   Browser Tab   │──── WebSocket ─────────▶│                 │
│   (React App)   │◀─── JSON messages ──────│                 │
└─────────────────┘                         │   C++20 Server  │
                                            │  (Boost.Beast)  │
┌─────────────────┐                         │                 │
│   Browser Tab   │──── WebSocket ─────────▶│   Room Service  │
│   (React App)   │◀─── JSON messages ──────│   Board Service │
└─────────────────┘                         │   Presence Svc  │
                                            └─────────────────┘
       Frontend                                      Backend
  ┌───────────────┐                            ┌──────────────────┐
  │  Zustand Store │                            │  Multi-threaded  │
  │  Canvas Layer  │                            │  io_context pool │
  │  WS Client     │                            │  Rate Limiter    │
  │  Outbox/Inbox  │                            │  Token Bucket    │
  └───────────────┘                            └──────────────────┘
```

### Core Components

| Component | Location | Role |
|-----------|----------|------|
| **WebSocket Server** | `backend/src/server/` | TCP acceptor, per-connection sessions, HTTP health endpoint |
| **Room Service** | `backend/src/services/room_service.hpp` | Central room manager — join, leave, message routing |
| **Board Service** | `backend/src/services/board_service.hpp` | Stroke CRUD, board snapshots for late joiners |
| **Presence Service** | `backend/src/services/presence_service.hpp` | Cursor updates, rate limiting, ghost detection |
| **Message Codec** | `backend/src/protocol/message_codec.hpp` | JSON serialization/deserialization via nlohmann/json |
| **WS Client** | `frontend/src/lib/wsClient.ts` | Auto-reconnect, heartbeat, exponential backoff |
| **Room Store** | `frontend/src/store/roomStore.ts` | Zustand store — all state and actions |
| **Outbox** | `frontend/src/lib/outbox.ts` | Cursor throttle (50ms), stroke point batching (16ms) |
| **Canvas** | `frontend/src/components/BoardCanvas.tsx` | HTML5 Canvas rendering for all element types |

### Data Flow

1. A user draws a stroke — the frontend fires `stroke_start`, batches points via `stroke_add` (16ms intervals), then sends `stroke_end`
2. The backend's **Room Service** receives the messages and broadcasts them to all other users in the room
3. Remote clients render the stroke on their canvas in real time
4. Cursor positions are throttled to 20 Hz and smoothed on the receiving end with exponential interpolation
5. On join, the server sends a `room_state` snapshot containing all existing strokes

---

## Project Structure

```
white_mouse/
├── backend/
│   ├── CMakeLists.txt
│   ├── Dockerfile
│   └── src/
│       ├── main.cpp                  # Server entry point
│       ├── models/                   # Room, Stroke, UserInfo structs
│       ├── protocol/                 # Message types, JSON codec, handler
│       ├── server/                   # WebSocket server, session, HTTP
│       ├── services/                 # Room, board, presence services
│       └── utils/                    # Rate limiter, UUID generator
│
├── frontend/
│   ├── src/
│   │   ├── components/               # BoardPage, Canvas, Toolbar, etc.
│   │   ├── hooks/                    # useWebSocket, useDrawing, useCursorTracking
│   │   ├── lib/                      # Protocol, WS client, inbox/outbox
│   │   ├── store/                    # Zustand state management
│   │   └── utils/                    # Color, hit testing, ID generation
│   ├── package.json
│   └── vite.config.ts
│
└── render.yaml                       # Render.com deployment blueprint
```

---

## Drawing Tools

| Shortcut | Tool | Description |
|----------|------|-------------|
| `V` / `1` | Select | Click to select, drag to move strokes, double-click text to edit |
| `H` / `2` | Pan | Click-drag to scroll the canvas |
| `P` / `3` | Pen | Freehand drawing with smooth quadratic curve rendering |
| `L` / `4` | Line | Straight line between two points |
| `A` / `5` | Arrow | Line with arrowhead |
| `R` / `6` | Rectangle | Rectangle with optional fill |
| `O` / `7` | Ellipse | Ellipse with optional fill |
| `D` / `8` | Diamond | Diamond shape with optional fill |
| `T` / `9` | Text | Click to place, inline editing with auto-resize textarea |
| `E` / `0` | Eraser | Draw over strokes or shapes to delete them |

All shapes are frontend abstractions converted to interpolated point strokes for backend syncing. Text elements are encoded as `txt:<base64-json>` stroke IDs, requiring zero backend changes.

---

## Protocol Reference

All messages use a JSON envelope:

```json
{ "type": "<string>", "seq": 0, "timestamp": 1717000000000, "data": { } }
```

### Client-to-Server Messages

| Type | Purpose | Key Fields |
|------|---------|------------|
| `join_room` | Request to join a room | `roomId`, `userName`, `password?` |
| `stroke_start` | Begin a new stroke | `strokeId`, `color`, `width` |
| `stroke_add` | Add points to a stroke | `strokeId`, `points[]` |
| `stroke_end` | Complete a stroke | `strokeId` |
| `stroke_move` | Move a completed stroke | `strokeId`, `dx`, `dy` |
| `stroke_delete` | Delete a stroke | `strokeId` |
| `cursor_move` | Mouse position update | `x`, `y` |
| `pong` | Heartbeat response | — |

### Server-to-Client Messages

| Type | Purpose | Key Fields |
|------|---------|------------|
| `welcome` | Join success | `userId`, `color`, `users[]` |
| `user_joined` | Broadcast: new user | `userId`, `userName`, `color` |
| `user_left` | Broadcast: user left | `userId` |
| `room_state` | Full board snapshot | `strokes[]`, `users[]` |
| `cursor_move` | Remote cursor position | `userId`, `x`, `y` |
| `error` | Error with code | `code`, `message` |
| `ping` | Heartbeat | — |

### Protocol Constants

| Constant | Value |
|----------|-------|
| Max users per room | 15 |
| Max strokes per room | 1,000 |
| Max message size | 64 KB |
| Max points per stroke | 10,000 |
| Cursor rate limit | 20 updates/sec (burst of 5) |
| Heartbeat interval | 10 seconds |
| Heartbeat timeout | 30 seconds |
| Ghost cursor timeout | 3 seconds |

---

## Network & Reliability

- **Auto-reconnect** — Exponential backoff from 1s to 30s on connection loss
- **Heartbeat** — Ping/pong every 10s; 30s timeout triggers reconnect
- **Cursor throttling** — 50ms intervals (20 Hz) on the frontend
- **Stroke batching** — Points batched at 16ms intervals (~60 fps)
- **Message inbox** — Per-category sequence tracking for ordered delivery
- **Rate limiting** — Server-side token bucket (20 tokens/sec, burst of 5)
- **Muting** — Repeat offenders are temporarily muted by the rate limiter
- **Room persistence** — localStorage saves room state for auto-reconnect on refresh

---

## Building from Source

### Prerequisites

- **Backend**: CMake 3.16+, Boost 1.74+, a C++20 compiler (GCC 10+, Clang 13+, MSVC 2022)
- **Frontend**: Node.js 18+, npm

### Backend

```bash
cd backend
mkdir build && cd build
cmake ..
make

# Run the server
./collabboard_server          # default port 8080
./collabboard_server 9090     # custom port

# Run tests
make run_tests
```

### Frontend

```bash
cd frontend
npm install
npm run dev                   # dev server on port 3000
npm run build                 # production build
npm test                      # run tests
npm run lint                  # lint check
```

---

## Deployment

### Render.com

The repo includes a `render.yaml` blueprint. Push to GitHub and connect the repo on [Render](https://render.com) — it detects the blueprint and provisions the Docker web service automatically.

The backend exposes `GET /health` for uptime monitoring. On Render's free tier, the service spins down after 15 minutes of inactivity. Use [UptimeRobot](https://uptimerobot.com) with a 5-minute interval on the `/health` endpoint to keep it alive.

### Manual Docker

```bash
cd backend
docker build -t collabboard-backend .
docker run -p 8080:8080 collabboard-backend
```

### Frontend Static Build

```bash
cd frontend
VITE_WS_URL=wss://your-backend.example.com npm run build
# serve the dist/ directory with any static file server
```

---

## Testing

### Backend (Google Test)

```bash
cd backend/build
make run_tests
```

Covers: models, protocol codec, room service, board service, presence service, integration tests.

### Frontend (Vitest)

```bash
cd frontend
npm test
```

Covers: outbox throttling, room store state management, WebSocket client reconnection.

---

## Environment Variables

Create `frontend/.env` (see `.env.example`):

```env
# WebSocket server URL for production builds
VITE_WS_URL=wss://your-backend.example.com
```

For local development the default `ws://localhost:8080` is used automatically.

---

## License

This project is private. All rights reserved.

---

<div align="center">

**Built with C++20 and React for real-time collaboration.**

</div>
