/**
 * React hook for cursor tracking and interpolation.
 * Handles smooth cursor animation for remote users.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useRoomStore } from '../store/roomStore';
import { CursorState, ProtocolConstants } from '../lib/protocol';
import { smoothPosition } from '../utils/lerp';

interface UseCursorTrackingReturn {
  cursors: CursorState[];
  interpolatedCursors: Map<string, { x: number; y: number; opacity: number }>;
}

/**
 * Hook that provides interpolated cursor positions.
 * Uses requestAnimationFrame for smooth 60fps animation.
 */
export function useCursorTracking(): UseCursorTrackingReturn {
  const cursors = useRoomStore((state) => Array.from(state.cursors.values()));
  const cursorsRef = useRef(cursors);
  cursorsRef.current = cursors;

  const interpolatedRef = useRef(new Map<string, { x: number; y: number; opacity: number }>());
  const lastFrameTimeRef = useRef(performance.now());
  const animationFrameRef = useRef<number | null>(null);

  const updateInterpolation = useCallback(() => {
    const now = performance.now();
    const deltaMs = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;

    const currentCursors = cursorsRef.current;
    const interpolated = interpolatedRef.current;
    const nowDate = Date.now();

    // Update each cursor
    for (const cursor of currentCursors) {
      const existing = interpolated.get(cursor.userId);
      const target = { x: cursor.x, y: cursor.y };

      // Calculate opacity based on last update time
      const timeSinceUpdate = nowDate - cursor.lastUpdate;
      let opacity = 1;
      
      if (timeSinceUpdate > ProtocolConstants.GhostCursorTimeoutMs) {
        // Fade out ghost cursors
        const fadeTime = ProtocolConstants.GhostCursorTimeoutMs;
        const fadeProgress = Math.min(1, (timeSinceUpdate - ProtocolConstants.GhostCursorTimeoutMs) / fadeTime);
        opacity = 1 - fadeProgress;
      }

      if (existing) {
        // Interpolate position
        const smoothed = smoothPosition(
          { x: existing.x, y: existing.y },
          target,
          deltaMs,
          15 // Smoothing speed
        );
        
        interpolated.set(cursor.userId, {
          x: smoothed.x,
          y: smoothed.y,
          opacity,
        });
      } else {
        // New cursor, start at target position
        interpolated.set(cursor.userId, {
          x: target.x,
          y: target.y,
          opacity,
        });
      }
    }

    // Remove cursors that no longer exist
    const currentIds = new Set(currentCursors.map((c) => c.userId));
    for (const userId of interpolated.keys()) {
      if (!currentIds.has(userId)) {
        interpolated.delete(userId);
      }
    }

    // Schedule next frame
    animationFrameRef.current = requestAnimationFrame(updateInterpolation);
  }, []);

  useEffect(() => {
    // Start animation loop
    animationFrameRef.current = requestAnimationFrame(updateInterpolation);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [updateInterpolation]);

  return {
    cursors,
    interpolatedCursors: interpolatedRef.current,
  };
}

/**
 * Hook for just reading cursor data without animation.
 */
export function useCursors(): CursorState[] {
  return useRoomStore((state) => Array.from(state.cursors.values()));
}

/**
 * Hook for getting a specific user's cursor.
 */
export function useCursor(userId: string): CursorState | undefined {
  return useRoomStore((state) => state.cursors.get(userId));
}

