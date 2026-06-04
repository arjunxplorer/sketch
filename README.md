# CollabBoard

A real-time collaborative whiteboard built with a **C++20 WebSocket backend** and a **React + TypeScript frontend**. Join a room, draw freehand strokes, create shapes, add text, and see each other's cursors — all live.

---

## Features

**10 Drawing Tools**

| Shortcut | Tool | Description |
|----------|------|-------------|
| `V` / `1` | Select | Click to select, drag to move elements |
| `H` / `2` | Pan | Click-drag to scroll the canvas |
| `P` / `3` | Pen | Freehand drawing with smooth quadratic curves |
| `L` / `4` | Line | Straight line between two points |
| `A` / `5` | Arrow | Line with arrowhead |
| `R` / `6` | Rectangle | Rectangle with optional fill |
| `O` / `7` | Ellipse | Ellipse with optional fill |
| `D` / `8` | Diamond | Diamond shape with optional fill |
| `T` / `9` | Text | Click to place, inline editing with auto-resize |
| `E` / `0` | Eraser | Draw over elements to delete them |

**Collaboration**
- Real-time cursor sharing with smooth interpolation
- Color-coded user avatars (15-color palette auto-assigned)
- User presence panel showing who's online
- Ghost cursor detection — inactive cursors fade out after 3 seconds

**Canvas**
- Zoom in/out (`Ctrl+Scroll` or `Ctrl`+`+`/`-`, range 0.5x–3x)
- Dynamic canvas expansion — never clips, supports negative coordinates
- Offscreen caching for efficient redraws of completed elements

**Rooms**
- Created on demand — any room ID works
- Optional password protection
- Board snapshots sent to late joiners
- 60-second grace period on disconnect (survives page refresh)
- LocalStorage persistence for automatic reconnection

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | C++20, Boost.Beast (WebSocket), nlohmann/json, CMake |
| Frontend | React 18, TypeScript 5.7, Vite 6, Zustand |
| Testing | Google Test (backend), Vitest + Testing Library (frontend) |
| Deployment | Docker, Render.com |

---

## Project Structure

```
white_mouse/
├── backend/
│   ├── CMakeLists.txt
│   ├── Dockerfile
│   └── src/
│       ├── main.cpp                  # Server entry point
│       ├── models/                   # Room, Stroke, UserInfo
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
│   └── package.json
│
└── render.yaml                       # Render.com deployment blueprint
```

---

## Getting Started

### Prerequisites

- **Backend**: CMake 3.16+, Boost 1.74+, a C++20 compiler (GCC 10+, Clang 13+, MSVC 2022)
- **Frontend**: Node.js 18+, npm

### Backend

```bash
cd backend
mkdir build && cd build
cmake ..
make
./collabboard_server          # default port 8080
./collabboard_server 9090     # custom port
```

### Frontend

```bash
cd frontend
npm install
npm run dev                   # starts on http://localhost:3000
```

The Vite dev server proxies `/ws` to `ws://localhost:8080`, so the backend must be running for collaboration to work.

### Environment Variables

Create `frontend/.env` (see `.env.example`):

```env
# WebSocket server URL for production builds
VITE_WS_URL=wss://your-backend.example.com
```

For local development the default `ws://localhost:8080` is used automatically.

---

## Testing

```bash
# Backend (Google Test)
cd backend/build
make run_tests

# Frontend (Vitest)
cd frontend
npm test
```

---

## Deployment

### Render.com (recommended)

The repo includes a `render.yaml` blueprint. To deploy:

1. Push to GitHub
2. Connect the repo on [Render](https://render.com)
3. Render detects the blueprint and provisions the Docker web service automatically

The backend exposes `GET /health` for uptime monitoring. On Render's free tier, the service spins down after 15 minutes of inactivity — use [UptimeRobot](https://uptimerobot.com) with a 5-minute interval on the `/health` endpoint to keep it alive.

### Manual Docker

```bash
cd backend
docker build -t collabboard-backend .
docker run -p 8080:8080 collabboard-backend
```

### Frontend (static build)

```bash
cd frontend
VITE_WS_URL=wss://your-backend.example.com npm run build
# serve the dist/ directory with any static file server
```

---

## WebSocket Protocol

All messages use a JSON envelope:

```json
{ "type": "<string>", "seq": 0, "timestamp": 1717000000000, "data": { } }
```

**Message flow:**

```
Client                          Server
  |--- join_room ------------------>|
  |<-- welcome (userId, color) -----|
  |<-- room_state (all strokes) ----|
  |                                  |
  |--- stroke_start ---------------->|  (broadcast to others)
  |--- stroke_add (points) -------->|
  |--- stroke_end ----------------->|
  |                                  |
  |<-- cursor_move (other users) ---|
  |--- cursor_move ---------------->|
  |                                  |
  |<-- ping ------------------------|
  |--- pong ----------------------->|
```

**Key limits:**
- 15 users per room, 1000 strokes per room
- 64 KB max message size, 10,000 max points per stroke
- Cursor updates throttled to 20 Hz
- Heartbeat every 10 seconds, 30-second timeout

---

## Architecture Highlights

- **Multi-threaded backend** — Boost.Asio `io_context` scaled to `hardware_concurrency()` threads
- **Token bucket rate limiting** — 20 tokens/sec with burst of 5; repeat offenders get muted
- **Frontend outbox** — cursor updates throttled at 50ms, stroke points batched at 16ms (~60fps)
- **Cursor interpolation** — `requestAnimationFrame`-based exponential smoothing for buttery-smooth remote cursors
- **Text encoding** — text elements are encoded as `txt:<base64-json>` stroke IDs, requiring zero backend changes
- **Shape syncing** — shapes are frontend abstractions converted to interpolated point strokes for the backend

---

## License

This project is private. All rights reserved.
