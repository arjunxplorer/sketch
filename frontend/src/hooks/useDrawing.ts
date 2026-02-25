/**
 * React hook for drawing functionality.
 * Supports multiple tools: pen, shapes, lines, arrows, text, select, pan.
 */

import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useRoomStore } from '../store/roomStore';
import { useIsConnected, useActiveTool, useSelection } from '../store/selectors';
import { ToolType } from '../lib/protocol';

interface UseDrawingOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

interface UseDrawingReturn {
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
  handlePointerLeave: (e: React.PointerEvent) => void;
  isDrawing: boolean;
}

export function useDrawing({ canvasRef, containerRef }: UseDrawingOptions): UseDrawingReturn {
  const isConnected = useIsConnected();
  const activeTool = useActiveTool();
  const { selectObjectAt, moveSelectedObject, sendStrokeMove } = useSelection();
  
  // Legacy stroke actions (for backward compatibility with backend)
  const startStroke = useRoomStore((state) => state.startStroke);
  const addStrokePoint = useRoomStore((state) => state.addStrokePoint);
  const endStroke = useRoomStore((state) => state.endStroke);
  const sendCursorMove = useRoomStore((state) => state.sendCursorMove);
  
  // New element actions
  const startElement = useRoomStore((state) => state.startElement);
  const updateElement = useRoomStore((state) => state.updateElement);
  const finishElement = useRoomStore((state) => state.finishElement);
  
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const totalDragDeltaRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Get canvas-relative coordinates
  const getCanvasCoords = useCallback((e: React.PointerEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, [canvasRef]);

  // Check if current tool is a drawing tool
  const isDrawingTool = useCallback((tool: string) => {
    return [
      ToolType.Pen,
      ToolType.Line,
      ToolType.Arrow,
      ToolType.Rectangle,
      ToolType.Ellipse,
      ToolType.Diamond,
      ToolType.Eraser,
    ].includes(tool as typeof ToolType.Pen);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only left click

    const coords = getCanvasCoords(e);
    if (!coords) return;

    // Pan tool - start panning
    if (activeTool === ToolType.Pan && containerRef?.current) {
      e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: containerRef.current.scrollLeft,
        scrollTop: containerRef.current.scrollTop,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Select tool - select or start drag
    if (activeTool === ToolType.Select) {
      e.preventDefault();
      selectObjectAt(coords.x, coords.y);
      const hasSelection = useRoomStore.getState().selectedStrokeId || useRoomStore.getState().selectedElementId;
      if (hasSelection) {
        isDraggingRef.current = true;
        dragStartRef.current = { x: coords.x, y: coords.y };
        totalDragDeltaRef.current = { x: 0, y: 0 };
      }
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (!isConnected) return;

    // Text tool is handled by canvas component
    if (activeTool === ToolType.Text) return;

    // Skip non-drawing tools
    if (!isDrawingTool(activeTool)) return;

    // Capture pointer for smooth drawing
    const target = e.target as HTMLElement;
    target.setPointerCapture(e.pointerId);

    isDrawingRef.current = true;
    setIsDrawing(true);
    lastPointRef.current = coords;

    // Use legacy stroke system for pen tool and eraser (backward compatible with backend)
    if (activeTool === ToolType.Pen || activeTool === ToolType.Eraser) {
      startStroke(activeTool === ToolType.Eraser);
      addStrokePoint(coords.x, coords.y);
    } else {
      // Use new element system for shapes
      startElement(coords.x, coords.y);
    }
  }, [isConnected, getCanvasCoords, activeTool, isDrawingTool, startStroke, addStrokePoint, startElement, selectObjectAt, containerRef]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;

    // Pan - update scroll
    if (isPanningRef.current && containerRef?.current && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      containerRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
      containerRef.current.scrollTop = panStartRef.current.scrollTop - dy;
      return;
    }

    // Select - drag selected object (flushSync ensures canvas repaints immediately)
    if (isDraggingRef.current && dragStartRef.current) {
      const dx = coords.x - dragStartRef.current.x;
      const dy = coords.y - dragStartRef.current.y;
      totalDragDeltaRef.current.x += dx;
      totalDragDeltaRef.current.y += dy;
      flushSync(() => {
        moveSelectedObject(dx, dy);
      });
      dragStartRef.current = { x: coords.x, y: coords.y };
      return;
    }

    // Always send cursor position (throttled by outbox)
    if (isConnected) {
      sendCursorMove(coords.x, coords.y);
    }

    // Update active drawing
    if (isDrawingRef.current && isConnected) {
      if (activeTool === ToolType.Pen || activeTool === ToolType.Eraser) {
        // Pen/Eraser tool: add points with minimum distance
        const last = lastPointRef.current;
        if (last) {
          const dx = coords.x - last.x;
          const dy = coords.y - last.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist >= 2) {
            addStrokePoint(coords.x, coords.y);
            lastPointRef.current = coords;
          }
        } else {
          addStrokePoint(coords.x, coords.y);
          lastPointRef.current = coords;
        }
      } else if (isDrawingTool(activeTool)) {
        // Shape tools: update element dimensions
        updateElement(coords.x, coords.y);
      }
    }
  }, [isConnected, getCanvasCoords, activeTool, sendCursorMove, addStrokePoint, updateElement, isDrawingTool, moveSelectedObject, containerRef]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    // Release pointer capture
    const target = e.target as HTMLElement;
    target.releasePointerCapture(e.pointerId);

    // Pan - stop panning
    if (isPanningRef.current) {
      isPanningRef.current = false;
      panStartRef.current = null;
      return;
    }

    // Select - stop dragging, sync move to other users
    if (isDraggingRef.current) {
      const selectedStrokeId = useRoomStore.getState().selectedStrokeId;
      const { x: dx, y: dy } = totalDragDeltaRef.current;
      if (selectedStrokeId && (dx !== 0 || dy !== 0)) {
        sendStrokeMove(selectedStrokeId, dx, dy);
      }
      isDraggingRef.current = false;
      dragStartRef.current = null;
      totalDragDeltaRef.current = { x: 0, y: 0 };
      return;
    }

    if (!isDrawingRef.current) return;

    isDrawingRef.current = false;
    setIsDrawing(false);
    lastPointRef.current = null;

    // Finish the drawing
    if (isConnected) {
      if (activeTool === ToolType.Pen || activeTool === ToolType.Eraser) {
        endStroke();
      } else if (isDrawingTool(activeTool)) {
        finishElement();
      }
    }
  }, [isConnected, activeTool, endStroke, finishElement, isDrawingTool, sendStrokeMove]);

  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    if (isDrawingRef.current) {
      handlePointerUp(e);
    }
  }, [handlePointerUp]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    isDrawing,
  };
}

/**
 * Hook for drawing settings.
 */
export function useDrawingSettings() {
  const penColor = useRoomStore((state) => state.penColor);
  const penWidth = useRoomStore((state) => state.penWidth);
  const setPenColor = useRoomStore((state) => state.setPenColor);
  const setPenWidth = useRoomStore((state) => state.setPenWidth);

  return {
    penColor,
    penWidth,
    setPenColor,
    setPenWidth,
  };
}
