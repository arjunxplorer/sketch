/**
 * Layer for rendering remote user cursors.
 */

import { useEffect, useState, useRef } from 'react';
import { useRoomStore } from '../store/roomStore';
import { ProtocolConstants } from '../lib/protocol';
import { smoothPosition } from '../utils/lerp';

interface CursorLayerProps {
  canvasWidth: number;
  canvasHeight: number;
}

interface InterpolatedCursor {
  x: number;
  y: number;
  opacity: number;
  userId: string;
  userName: string;
  color: string;
}

export function CursorLayer({ canvasWidth, canvasHeight }: CursorLayerProps) {
  const [interpolatedCursors, setInterpolatedCursors] = useState<InterpolatedCursor[]>([]);
  const lastFrameTimeRef = useRef(performance.now());
  const interpolatedRef = useRef(new Map<string, { x: number; y: number }>());

  // Animation loop for smooth cursor interpolation
  useEffect(() => {
    let animationId: number;
    let isRunning = true;
    
    const animate = () => {
      if (!isRunning) return;
      
      const now = performance.now();
      const deltaMs = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      const nowDate = Date.now();

      // Get cursors directly from store to avoid stale closures
      const cursors = Array.from(useRoomStore.getState().cursors.values());
      
      if (cursors.length === 0) {
        setInterpolatedCursors([]);
        animationId = requestAnimationFrame(animate);
        return;
      }

      const result: InterpolatedCursor[] = [];

      for (const cursor of cursors) {
        const existing = interpolatedRef.current.get(cursor.userId);
        const target = { x: cursor.x, y: cursor.y };

        // Calculate opacity based on last update time
        const timeSinceUpdate = nowDate - cursor.lastUpdate;
        let opacity = 1;
        
        if (timeSinceUpdate > ProtocolConstants.GhostCursorTimeoutMs) {
          const fadeTime = ProtocolConstants.GhostCursorTimeoutMs;
          const fadeProgress = Math.min(1, (timeSinceUpdate - ProtocolConstants.GhostCursorTimeoutMs) / fadeTime);
          opacity = 1 - fadeProgress;
        }

        if (opacity <= 0) continue;

        let displayPos: { x: number; y: number };
        if (existing) {
          displayPos = smoothPosition(existing, target, deltaMs, 15);
        } else {
          displayPos = target;
        }
        
        interpolatedRef.current.set(cursor.userId, displayPos);

        result.push({
          x: displayPos.x,
          y: displayPos.y,
          opacity,
          userId: cursor.userId,
          userName: cursor.userName,
          color: cursor.color,
        });
      }

      // Clean up old cursors from ref
      const currentIds = new Set(cursors.map((c) => c.userId));
      for (const userId of interpolatedRef.current.keys()) {
        if (!currentIds.has(userId)) {
          interpolatedRef.current.delete(userId);
        }
      }

      setInterpolatedCursors(result);
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      isRunning = false;
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div
      className="cursor-layer"
      style={{
        width: canvasWidth,
        height: canvasHeight,
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {interpolatedCursors.map((cursor) => {
        const isGhost = cursor.opacity < 1;

        return (
          <div
            key={cursor.userId}
            className={`remote-cursor ${isGhost ? 'ghost' : ''}`}
            style={{
              position: 'absolute',
              left: cursor.x,
              top: cursor.y,
              opacity: cursor.opacity,
              transform: 'translate(-2px, -2px)',
            }}
          >
            {/* Cursor SVG */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              style={{ filter: `drop-shadow(0 1px 2px rgba(0,0,0,0.3))` }}
            >
              <path
                d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.94a.5.5 0 0 0 .35-.85L6.35 2.79a.5.5 0 0 0-.85.35z"
                fill={cursor.color}
                stroke="#fff"
                strokeWidth="1.5"
              />
            </svg>

            {/* Username label */}
            <div
              className="cursor-label"
              style={{
                backgroundColor: cursor.color,
                marginTop: '2px',
                marginLeft: '12px',
              }}
            >
              {cursor.userName}
            </div>
          </div>
        );
      })}
    </div>
  );
}

