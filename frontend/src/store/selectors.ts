/**
 * Memoized selectors for derived state.
 */

import { useShallow } from 'zustand/react/shallow';
import { useRoomStore } from './roomStore';
import { CursorState, UserInfo, Stroke, DrawingElement, ToolTypeValue, ProtocolConstants } from '../lib/protocol';
import { useRef } from 'react';
import { getContentBounds } from '../utils/hitTest';

// Canvas expansion constants
const MIN_CANVAS_WIDTH = 1920;
const MIN_CANVAS_HEIGHT = 1080;
const EXPAND_PADDING = 200;

// =============================================================================
// Connection Selectors
// =============================================================================

export function useConnectionStatus() {
  return useRoomStore((state) => state.connectionStatus);
}

export function useIsConnected() {
  return useRoomStore((state) => state.connectionStatus === 'connected');
}

export function useLastError() {
  return useRoomStore((state) => state.lastError);
}

// =============================================================================
// Identity Selectors
// =============================================================================

export function useUserId() {
  return useRoomStore((state) => state.userId);
}

export function useUserName() {
  return useRoomStore((state) => state.userName);
}

export function useUserColor() {
  return useRoomStore((state) => state.userColor);
}

export function useRoomId() {
  return useRoomStore((state) => state.roomId);
}

// =============================================================================
// Participants Selectors
// =============================================================================

export function useUsers(): UserInfo[] {
  return useRoomStore(
    useShallow((state) => Array.from(state.users.values()))
  );
}

export function useUserCount(): number {
  return useRoomStore((state) => state.users.size + (state.userId ? 1 : 0));
}

export function useUser(userId: string): UserInfo | undefined {
  return useRoomStore((state) => state.users.get(userId));
}

// =============================================================================
// Cursor Selectors
// =============================================================================

export function useCursors(): CursorState[] {
  return useRoomStore(
    useShallow((state) => Array.from(state.cursors.values()))
  );
}

export function useActiveCursors(): CursorState[] {
  const now = Date.now();
  return useRoomStore(
    useShallow((state) =>
      Array.from(state.cursors.values()).filter(
        (cursor) => now - cursor.lastUpdate < ProtocolConstants.GhostCursorTimeoutMs
      )
    )
  );
}

export function useGhostCursors(): CursorState[] {
  const now = Date.now();
  return useRoomStore(
    useShallow((state) =>
      Array.from(state.cursors.values()).filter(
        (cursor) =>
          now - cursor.lastUpdate >= ProtocolConstants.GhostCursorTimeoutMs &&
          now - cursor.lastUpdate < ProtocolConstants.GhostCursorTimeoutMs * 2
      )
    )
  );
}

// =============================================================================
// Drawing Selectors
// =============================================================================

export function useStrokes(): Stroke[] {
  return useRoomStore((state) => state.strokes);
}

export function useActiveStroke(): Stroke | null {
  return useRoomStore((state) => state.activeStroke);
}

export function useAllStrokes(): Stroke[] {
  return useRoomStore(
    useShallow((state) => {
      if (state.activeStroke) {
        return [...state.strokes, state.activeStroke];
      }
      return state.strokes;
    })
  );
}

export function usePenColor() {
  return useRoomStore((state) => state.penColor);
}

export function usePenWidth() {
  return useRoomStore((state) => state.penWidth);
}

export function useFillColor() {
  return useRoomStore((state) => state.fillColor);
}

export function useFontSize() {
  return useRoomStore((state) => state.fontSize);
}

// =============================================================================
// Tool Selectors
// =============================================================================

export function useActiveTool(): ToolTypeValue {
  return useRoomStore((state) => state.activeTool);
}

export function useSetActiveTool() {
  return useRoomStore((state) => state.setActiveTool);
}

export function useZoomLevel() {
  return useRoomStore((state) => state.zoomLevel);
}

export function useSetZoomLevel() {
  return useRoomStore((state) => state.setZoomLevel);
}

export function useSelection() {
  return useRoomStore(
    useShallow((state) => ({
      selectedStrokeId: state.selectedStrokeId,
      selectedElementId: state.selectedElementId,
      selectObjectAt: state.selectObjectAt,
      moveSelectedObject: state.moveSelectedObject,
      sendStrokeMove: state.sendStrokeMove,
      clearSelection: state.clearSelection,
    }))
  );
}

// =============================================================================
// Element Selectors
// =============================================================================

export function useElements(): DrawingElement[] {
  return useRoomStore((state) => state.elements);
}

export function useActiveElement(): DrawingElement | null {
  return useRoomStore((state) => state.activeElement);
}

export function useAllElements(): DrawingElement[] {
  return useRoomStore(
    useShallow((state) => {
      if (state.activeElement) {
        return [...state.elements, state.activeElement];
      }
      return state.elements;
    })
  );
}

export interface CanvasDimensions {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Dynamic canvas dimensions - expands when content exceeds minimum size.
 * - Never shrinks (avoids content clipping when content is removed)
 * - Supports negative coordinates (content to the left/top of origin)
 * - Shrink hysteresis: never shrinks to avoid flicker when content is removed
 */
export function useCanvasDimensions(): CanvasDimensions {
  const maxSizeRef = useRef({ width: MIN_CANVAS_WIDTH, height: MIN_CANVAS_HEIGHT });

  return useRoomStore(
    useShallow((state) => {
      // Reset max size when disconnected so new room starts fresh
      if (state.connectionStatus === 'disconnected') {
        maxSizeRef.current = { width: MIN_CANVAS_WIDTH, height: MIN_CANVAS_HEIGHT };
        return { width: MIN_CANVAS_WIDTH, height: MIN_CANVAS_HEIGHT, offsetX: 0, offsetY: 0 };
      }

      const strokes = state.activeStroke
        ? [...state.strokes, state.activeStroke]
        : state.strokes;
      const elements = state.activeElement
        ? [...state.elements, state.activeElement]
        : state.elements;

      const bounds = getContentBounds(strokes, elements);
      if (!bounds) {
        const w = maxSizeRef.current.width;
        const h = maxSizeRef.current.height;
        return { width: w, height: h, offsetX: 0, offsetY: 0 };
      }

      // Support negative coordinates: offset shifts content into view
      const offsetX = bounds.minX < 0 ? -bounds.minX : 0;
      const offsetY = bounds.minY < 0 ? -bounds.minY : 0;

      // When offset=0, content starts at (0,0); need space to maxX/maxY.
      // When offset>0, we translate so content fits in (maxX-minX) x (maxY-minY).
      const contentWidth =
        offsetX > 0
          ? bounds.maxX - bounds.minX + EXPAND_PADDING
          : bounds.maxX + EXPAND_PADDING;
      const contentHeight =
        offsetY > 0
          ? bounds.maxY - bounds.minY + EXPAND_PADDING
          : bounds.maxY + EXPAND_PADDING;

      const computedWidth = Math.max(MIN_CANVAS_WIDTH, Math.ceil(contentWidth));
      const computedHeight = Math.max(MIN_CANVAS_HEIGHT, Math.ceil(contentHeight));

      // Never shrink; only expand (avoids clipping when content is removed)
      const prev = maxSizeRef.current;
      const width = Math.max(prev.width, computedWidth);
      const height = Math.max(prev.height, computedHeight);

      maxSizeRef.current = { width, height };

      return { width, height, offsetX, offsetY };
    })
  );
}

export function useElementActions() {
  return useRoomStore(
    useShallow((state) => ({
      startElement: state.startElement,
      updateElement: state.updateElement,
      finishElement: state.finishElement,
      addTextElement: state.addTextElement,
      updateTextElement: state.updateTextElement,
      deleteTextElement: state.deleteTextElement,
    }))
  );
}

// =============================================================================
// Action Selectors
// =============================================================================

export function useConnect() {
  return useRoomStore((state) => state.connect);
}

export function useDisconnect() {
  return useRoomStore((state) => state.disconnect);
}

export function useSendCursorMove() {
  return useRoomStore((state) => state.sendCursorMove);
}

export function useStartStroke() {
  return useRoomStore((state) => state.startStroke);
}

export function useAddStrokePoint() {
  return useRoomStore((state) => state.addStrokePoint);
}

export function useEndStroke() {
  return useRoomStore((state) => state.endStroke);
}

export function useSetPenColor() {
  return useRoomStore((state) => state.setPenColor);
}

export function useSetPenWidth() {
  return useRoomStore((state) => state.setPenWidth);
}

// =============================================================================
// Combined Selectors
// =============================================================================

export interface DrawingActions {
  startStroke: () => void;
  addStrokePoint: (x: number, y: number) => void;
  endStroke: () => void;
  sendCursorMove: (x: number, y: number) => void;
}

export function useDrawingActions(): DrawingActions {
  return useRoomStore(
    useShallow((state) => ({
      startStroke: state.startStroke,
      addStrokePoint: state.addStrokePoint,
      endStroke: state.endStroke,
      sendCursorMove: state.sendCursorMove,
    }))
  );
}

export interface PenSettings {
  color: string;
  width: number;
  setColor: (color: string) => void;
  setWidth: (width: number) => void;
}

export function usePenSettings(): PenSettings {
  return useRoomStore(
    useShallow((state) => ({
      color: state.penColor,
      width: state.penWidth,
      setColor: state.setPenColor,
      setWidth: state.setPenWidth,
    }))
  );
}

