/**
 * Main board page component - container for the whiteboard experience.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { BoardCanvas } from './BoardCanvas';
import { CursorLayer } from './CursorLayer';
import { Toolbar } from './Toolbar';
import { PresencePanel } from './PresencePanel';
import { ConnectionStatus } from './ConnectionStatus';
import { JoinModal } from './JoinModal';
import { Toast } from './Toast';
import { useConnectionState, useWebSocket } from '../hooks/useWebSocket';
import { useRoomStore } from '../store/roomStore';
import { useRoomId, useDisconnect, useSetActiveTool, useSelection, useCanvasDimensions, useZoomLevel, useSetZoomLevel } from '../store/selectors';
import { ToolType } from '../lib/protocol';
import { loadRoomCredentials } from '../utils/roomPersistence';

const TOAST_DURATION_MS = 2000;

export function BoardPage() {
  const { isConnected, isConnecting } = useConnectionState();
  const canvasDimensions = useCanvasDimensions();
  const zoomLevel = useZoomLevel();
  const setZoomLevel = useSetZoomLevel();

  // Ctrl/Cmd + scroll to zoom
  const handleCanvasWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const current = useRoomStore.getState().zoomLevel;
      setZoomLevel(current + delta);
    },
    [setZoomLevel]
  );
  const { connect } = useWebSocket();
  const roomId = useRoomId();
  const disconnect = useDisconnect();
  const setActiveTool = useSetActiveTool();
  const clearSelection = useSelection().clearSelection;
  const hasAttemptedAutoReconnect = useRef(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Auto-reconnect on load when we have stored credentials
  useEffect(() => {
    if (hasAttemptedAutoReconnect.current) return;
    const credentials = loadRoomCredentials();
    if (credentials) {
      hasAttemptedAutoReconnect.current = true;
      connect(credentials.roomId, credentials.userName, credentials.password);
    } else {
      setShowJoinModal(true);
    }
  }, [connect]);

  // Show join modal when disconnected (and not auto-connecting)
  useEffect(() => {
    if (isConnected) {
      setShowJoinModal(false);
    } else if (!isConnecting && (hasAttemptedAutoReconnect.current || !loadRoomCredentials())) {
      setShowJoinModal(true);
    }
  }, [isConnected, isConnecting]);

  // Handle leave room
  const handleLeaveRoom = useCallback(() => {
    disconnect();
    setShowJoinModal(true);
  }, [disconnect]);

  // Copy room ID with toast feedback
  const handleCopyRoomId = useCallback(() => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId).then(() => {
      setToastMessage('Copied to clipboard!');
    });
  }, [roomId]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ctrl/Cmd + Plus/Equal = zoom in, Ctrl/Cmd + Minus = zoom out
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          const current = useRoomStore.getState().zoomLevel;
          useRoomStore.getState().setZoomLevel(Math.min(3, current + 0.25));
          return;
        }
        if (e.key === '-') {
          e.preventDefault();
          const current = useRoomStore.getState().zoomLevel;
          useRoomStore.getState().setZoomLevel(Math.max(0.5, current - 0.25));
          return;
        }
      }

      // Escape - clear selection first, or leave room
      if (e.key === 'Escape') {
        const state = useRoomStore.getState();
        if (state.selectedStrokeId || state.selectedElementId) {
          clearSelection();
          return;
        }
        if (isConnected && window.confirm('Leave the room?')) {
          handleLeaveRoom();
        }
        return;
      }

      // Tool shortcuts (single key, no modifiers)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();
      switch (key) {
        case 'v':
        case '1':
          setActiveTool(ToolType.Select);
          break;
        case 'h':
        case '2':
          setActiveTool(ToolType.Pan);
          break;
        case 'p':
        case '3':
          setActiveTool(ToolType.Pen);
          break;
        case 'l':
        case '4':
          setActiveTool(ToolType.Line);
          break;
        case 'a':
        case '5':
          setActiveTool(ToolType.Arrow);
          break;
        case 'r':
        case '6':
          setActiveTool(ToolType.Rectangle);
          break;
        case 'o':
        case '7':
          setActiveTool(ToolType.Ellipse);
          break;
        case 'd':
        case '8':
          setActiveTool(ToolType.Diamond);
          break;
        case 't':
        case '9':
          setActiveTool(ToolType.Text);
          break;
        case 'e':
        case '0':
          setActiveTool(ToolType.Eraser);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConnected, handleLeaveRoom, setActiveTool]);

  return (
    <div className="board-page">
      {/* Header */}
      <header className="board-header">
        <div className="header-left">
          <h1 className="logo">CollabBoard</h1>
          {roomId && (
            <div className="room-info">
              <span className="room-label">Room:</span>
              <span className="room-id">{roomId}</span>
              <button
                className="copy-btn"
                onClick={handleCopyRoomId}
                title="Copy room ID"
              >
                📋
              </button>
            </div>
          )}
        </div>
        <div className="header-right">
          <ConnectionStatus />
          {isConnected && (
            <button className="leave-btn" onClick={handleLeaveRoom}>
              Leave Room
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="board-main">
        {isConnected ? (
          <>
            {/* Toolbar */}
            <Toolbar />

            {/* Canvas container */}
            <div
              className="canvas-container"
              ref={canvasContainerRef}
              onWheel={handleCanvasWheel}
            >
              <div
                className="canvas-wrapper"
                style={{
                  width: canvasDimensions.width,
                  height: canvasDimensions.height,
                  position: 'relative',
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: '0 0',
                }}
              >
                <BoardCanvas
                  width={canvasDimensions.width}
                  height={canvasDimensions.height}
                  offsetX={canvasDimensions.offsetX}
                  offsetY={canvasDimensions.offsetY}
                  containerRef={canvasContainerRef}
                />
                <CursorLayer
                  canvasWidth={canvasDimensions.width}
                  canvasHeight={canvasDimensions.height}
                  offsetX={canvasDimensions.offsetX}
                  offsetY={canvasDimensions.offsetY}
                />
              </div>
            </div>

            {/* Presence panel */}
            <PresencePanel />
          </>
        ) : (
          <div className="disconnected-state">
            <div className="disconnected-content">
              <h2>Welcome to CollabBoard</h2>
              {isConnecting ? (
                <>
                  <p>Reconnecting...</p>
                  <div className="spinner" />
                </>
              ) : (
                <>
                  <p>Join a room to start collaborating</p>
                  <button
                    className="btn-primary"
                    onClick={() => setShowJoinModal(true)}
                  >
                    Join Room
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Join Modal */}
      <JoinModal
        isOpen={showJoinModal}
        onClose={isConnected ? () => setShowJoinModal(false) : undefined}
      />

      {/* Toast for copy feedback */}
      <Toast message={toastMessage ?? ''} visible={!!toastMessage} />
    </div>
  );
}

