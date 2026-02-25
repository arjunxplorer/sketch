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
import { useConnectionState } from '../hooks/useWebSocket';
import { useRoomStore } from '../store/roomStore';
import { useRoomId, useDisconnect, useSetActiveTool, useSelection } from '../store/selectors';
import { ToolType } from '../lib/protocol';

// Canvas dimensions
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

const TOAST_DURATION_MS = 2000;

export function BoardPage() {
  const { isConnected } = useConnectionState();
  const roomId = useRoomId();
  const disconnect = useDisconnect();
  const setActiveTool = useSetActiveTool();
  const clearSelection = useSelection().clearSelection;
  const [showJoinModal, setShowJoinModal] = useState(!isConnected);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Show join modal when disconnected
  useEffect(() => {
    if (!isConnected && !roomId) {
      setShowJoinModal(true);
    } else if (isConnected) {
      setShowJoinModal(false);
    }
  }, [isConnected, roomId]);

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
            <div className="canvas-container" ref={canvasContainerRef}>
              <div
                className="canvas-wrapper"
                style={{
                  width: CANVAS_WIDTH,
                  height: CANVAS_HEIGHT,
                  position: 'relative',
                }}
              >
                <BoardCanvas
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  containerRef={canvasContainerRef}
                />
                <CursorLayer
                  canvasWidth={CANVAS_WIDTH}
                  canvasHeight={CANVAS_HEIGHT}
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
              <p>Join a room to start collaborating</p>
              <button
                className="btn-primary"
                onClick={() => setShowJoinModal(true)}
              >
                Join Room
              </button>
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

