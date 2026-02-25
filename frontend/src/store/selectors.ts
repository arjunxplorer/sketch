/**
 * Memoized selectors for derived state.
 */

import { useShallow } from 'zustand/react/shallow';
import { useRoomStore } from './roomStore';
import { CursorState, UserInfo, Stroke, DrawingElement, ToolTypeValue, ProtocolConstants } from '../lib/protocol';

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

export function useElementActions() {
  return useRoomStore(
    useShallow((state) => ({
      startElement: state.startElement,
      updateElement: state.updateElement,
      finishElement: state.finishElement,
      addTextElement: state.addTextElement,
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

