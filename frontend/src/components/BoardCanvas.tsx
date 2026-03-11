/**
 * Main drawing canvas component.
 * Supports multiple element types: strokes, shapes, lines, arrows, text.
 */

import { useRef, useEffect, useCallback, useState, memo } from 'react';
import { useDrawing } from '../hooks/useDrawing';
import { useStrokes, useActiveStroke, useElements, useActiveElement, useActiveTool, useElementActions, usePenColor, useFontSize, useSelection } from '../store/selectors';
import { getBoundsForSelection, hitTest } from '../utils/hitTest';
import { TextInput } from './TextInput';
import { 
  Stroke, 
  DrawingElement, 
  StrokeElement, 
  LineElement, 
  ArrowElement,
  RectangleElement,
  EllipseElement,
  DiamondElement,
  TextElement,
  ToolType,
} from '../lib/protocol';

interface BoardCanvasProps {
  width: number;
  height: number;
  offsetX?: number;
  offsetY?: number;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

function BoardCanvasComponent({ width, height, offsetX = 0, offsetY = 0, containerRef }: BoardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Text input state: canvas coords + optional existing text element for editing
  const [textInputState, setTextInputState] = useState<{
    canvasX: number;
    canvasY: number;
    existingElement?: TextElement;
    scaleX: number;
    scaleY: number;
  } | null>(null);
  const penColor = usePenColor();
  const fontSize = useFontSize();
  const { addTextElement, updateTextElement, deleteTextElement } = useElementActions();
  const justDismissedRef = useRef(false);
  
  // Legacy strokes for backward compatibility
  const strokes = useStrokes();
  const completedStrokes = strokes.filter((s) => s.complete);
  const activeStroke = useActiveStroke();
  
  // New element system
  const elements = useElements();
  const activeElement = useActiveElement();
  const activeTool = useActiveTool();
  const { selectedStrokeId, selectedElementId } = useSelection();
  
  const {
    handlePointerDown: baseHandlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
  } = useDrawing({ canvasRef, containerRef, offsetX, offsetY });

  // Open text editor at position (used by Text tool click and Select tool double-click)
  const openTextEditor = useCallback((canvasX: number, canvasY: number, existing?: TextElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const textScaleX = rect.width / canvas.width;
    const textScaleY = rect.height / canvas.height;
    setTextInputState({
      canvasX: existing ? existing.x : canvasX,
      canvasY: existing ? existing.y : canvasY,
      existingElement: existing,
      scaleX: textScaleX,
      scaleY: textScaleY,
    });
  }, []);

  // Custom pointer down handler for text tool
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (textInputState) return;
    if (justDismissedRef.current) {
      justDismissedRef.current = false;
      return;
    }
    
    if (activeTool === ToolType.Text) {
      e.preventDefault();
      e.stopPropagation();
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const rect = canvas.getBoundingClientRect();
      const coordScaleX = canvas.width / rect.width;
      const coordScaleY = canvas.height / rect.height;
      const displayX = e.clientX - rect.left;
      const displayY = e.clientY - rect.top;
      const canvasX = displayX * coordScaleX;
      const canvasY = displayY * coordScaleY;
      // Convert to content coords (account for offset when content extends left/up)
      const contentX = canvasX - offsetX;
      const contentY = canvasY - offsetY;

      // Scale for TextInput positioning (display size / logical size)
      const textScaleX = rect.width / canvas.width;
      const textScaleY = rect.height / canvas.height;

      // Check if clicking on existing text element (for editing)
      const completedElements = elements.filter((e) => e.complete);
      const hit = hitTest(contentX, contentY, completedStrokes, completedElements);

      if (hit?.type === 'element') {
        const existing = completedElements.find((el) => el.id === hit.id && el.type === 'text') as TextElement | undefined;
        if (existing) {
          openTextEditor(contentX, contentY, existing);
          return;
        }
      }

      openTextEditor(contentX, contentY);
      return;
    }
    baseHandlePointerDown(e);
  }, [activeTool, baseHandlePointerDown, textInputState, elements, completedStrokes, openTextEditor, offsetX, offsetY]);

  // Double-click on text with Select tool opens editor (allows any user to edit)
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (textInputState) return;
    if (activeTool !== ToolType.Select) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;
    const contentX = canvasX - offsetX;
    const contentY = canvasY - offsetY;

    const completedElements = elements.filter((el) => el.complete);
    const hit = hitTest(contentX, contentY, completedStrokes, completedElements);
    if (hit?.type === 'element') {
      const existing = completedElements.find((el) => el.id === hit.id && el.type === 'text') as TextElement | undefined;
      if (existing) {
        e.preventDefault();
        e.stopPropagation();
        openTextEditor(contentX, contentY, existing);
      }
    }
  }, [activeTool, textInputState, elements, completedStrokes, openTextEditor, offsetX, offsetY]);

  // Handle text submit
  const handleTextSubmit = useCallback((text: string) => {
    if (!textInputState) {
      setTextInputState(null);
      return;
    }
    justDismissedRef.current = true;
    setTimeout(() => { justDismissedRef.current = false; }, 150);

    if (!text.trim()) {
      if (textInputState.existingElement) {
        deleteTextElement(textInputState.existingElement.id);
      }
      setTextInputState(null);
      return;
    }

    if (textInputState.existingElement) {
      // Skip update if text unchanged - avoids delete+add with same id which causes
      // the editor to receive only delete (and lose the text) while others get both
      if (text === textInputState.existingElement.text) {
        setTextInputState(null);
        return;
      }
      updateTextElement(textInputState.existingElement.id, text);
    } else {
      addTextElement(textInputState.canvasX, textInputState.canvasY, text);
    }
    setTextInputState(null);
  }, [textInputState, addTextElement, updateTextElement, deleteTextElement]);

  const handleTextCancel = useCallback(() => {
    justDismissedRef.current = true;
    setTimeout(() => { justDismissedRef.current = false; }, 150);
    setTextInputState(null);
  }, []);

  // Get cursor style based on active tool
  const getCursor = () => {
    switch (activeTool) {
      case ToolType.Select:
        return selectedStrokeId || selectedElementId ? 'move' : 'default';
      case ToolType.Pan:
        return 'grab';
      case ToolType.Text:
        return 'text';
      case ToolType.Eraser:
        return 'crosshair';
      default:
        return 'crosshair';
    }
  };

  // Draw a legacy stroke
  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (stroke.points.length < 2) return;

    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const firstPoint = stroke.points[0];
    if (firstPoint) {
      ctx.moveTo(firstPoint.x, firstPoint.y);
    }

    for (let i = 1; i < stroke.points.length - 1; i++) {
      const current = stroke.points[i];
      const next = stroke.points[i + 1];
      if (current && next) {
        const midX = (current.x + next.x) / 2;
        const midY = (current.y + next.y) / 2;
        ctx.quadraticCurveTo(current.x, current.y, midX, midY);
      }
    }

    const lastPoint = stroke.points[stroke.points.length - 1];
    if (lastPoint && stroke.points.length > 1) {
      const secondLast = stroke.points[stroke.points.length - 2];
      if (secondLast) {
        ctx.quadraticCurveTo(secondLast.x, secondLast.y, lastPoint.x, lastPoint.y);
      }
    }

    ctx.stroke();
  }, []);

  // Draw any element type
  const drawElement = useCallback((ctx: CanvasRenderingContext2D, element: DrawingElement) => {
    ctx.strokeStyle = element.color;
    ctx.lineWidth = element.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (element.type) {
      case 'stroke': {
        const stroke = element as StrokeElement;
        if (stroke.points.length < 2) return;
        
        ctx.beginPath();
        const first = stroke.points[0];
        if (first) ctx.moveTo(first.x, first.y);
        
        for (let i = 1; i < stroke.points.length - 1; i++) {
          const curr = stroke.points[i];
          const next = stroke.points[i + 1];
          if (curr && next) {
            const midX = (curr.x + next.x) / 2;
            const midY = (curr.y + next.y) / 2;
            ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
          }
        }
        
        const last = stroke.points[stroke.points.length - 1];
        if (last) ctx.lineTo(last.x, last.y);
        ctx.stroke();
        break;
      }

      case 'line': {
        const line = element as LineElement;
        ctx.beginPath();
        ctx.moveTo(line.x, line.y);
        ctx.lineTo(line.endX, line.endY);
        ctx.stroke();
        break;
      }

      case 'arrow': {
        const arrow = element as ArrowElement;
        const headLen = 15;
        const dx = arrow.endX - arrow.x;
        const dy = arrow.endY - arrow.y;
        const angle = Math.atan2(dy, dx);
        
        // Line
        ctx.beginPath();
        ctx.moveTo(arrow.x, arrow.y);
        ctx.lineTo(arrow.endX, arrow.endY);
        ctx.stroke();
        
        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(arrow.endX, arrow.endY);
        ctx.lineTo(
          arrow.endX - headLen * Math.cos(angle - Math.PI / 6),
          arrow.endY - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(arrow.endX, arrow.endY);
        ctx.lineTo(
          arrow.endX - headLen * Math.cos(angle + Math.PI / 6),
          arrow.endY - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
        break;
      }

      case 'rectangle': {
        const rect = element as RectangleElement;
        if (rect.fill) {
          ctx.fillStyle = rect.fill;
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        }
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        break;
      }

      case 'ellipse': {
        const ellipse = element as EllipseElement;
        const cx = ellipse.x + ellipse.width / 2;
        const cy = ellipse.y + ellipse.height / 2;
        const rx = Math.abs(ellipse.width / 2);
        const ry = Math.abs(ellipse.height / 2);
        
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (ellipse.fill) {
          ctx.fillStyle = ellipse.fill;
          ctx.fill();
        }
        ctx.stroke();
        break;
      }

      case 'diamond': {
        const diamond = element as DiamondElement;
        const cx = diamond.x + diamond.width / 2;
        const cy = diamond.y + diamond.height / 2;

        ctx.beginPath();
        ctx.moveTo(cx, diamond.y);
        ctx.lineTo(diamond.x + diamond.width, cy);
        ctx.lineTo(cx, diamond.y + diamond.height);
        ctx.lineTo(diamond.x, cy);
        ctx.closePath();
        
        if (diamond.fill) {
          ctx.fillStyle = diamond.fill;
          ctx.fill();
        }
        ctx.stroke();
        break;
      }

      case 'text': {
        const textEl = element as TextElement;
        ctx.font = `${textEl.fontSize}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = textEl.color;
        ctx.textBaseline = 'top';
        ctx.fillText(textEl.text, textEl.x, textEl.y);
        break;
      }
    }
  }, []);

  // Draw the background (light black, no grid)
  const drawBackground = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, width, height);
  }, [width, height]);

  // Initialize offscreen canvas
  useEffect(() => {
    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
    }
    offscreenCanvasRef.current.width = width;
    offscreenCanvasRef.current.height = height;
    
    const offCtx = offscreenCanvasRef.current.getContext('2d');
    if (offCtx) {
      drawBackground(offCtx);
    }
  }, [width, height, drawBackground]);

  // Update offscreen canvas with completed elements - simple full redraw approach
  useEffect(() => {
    const offscreen = offscreenCanvasRef.current;
    const offCtx = offscreen?.getContext('2d');
    if (!offscreen || !offCtx) return;

    // Get completed items - exclude text being edited to avoid ghost/double text
    const editingId = textInputState?.existingElement?.id;
    const completedElements = elements.filter(e => e.complete && e.id !== editingId);

    // Full redraw - simpler and more reliable
    drawBackground(offCtx);

    if (offsetX !== 0 || offsetY !== 0) {
      offCtx.save();
      offCtx.translate(offsetX, offsetY);
    }

    // Draw all completed strokes
    for (const stroke of completedStrokes) {
      drawStroke(offCtx, stroke);
    }

    // Draw all completed elements
    for (const element of completedElements) {
      drawElement(offCtx, element);
    }

    if (offsetX !== 0 || offsetY !== 0) {
      offCtx.restore();
    }
  }, [width, height, offsetX, offsetY, completedStrokes, elements, textInputState?.existingElement?.id, drawBackground, drawStroke, drawElement]);

  // Render main canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const offscreen = offscreenCanvasRef.current;
    if (!canvas || !ctx || !offscreen) return;

    // Copy offscreen canvas
    ctx.drawImage(offscreen, 0, 0);

    if (offsetX !== 0 || offsetY !== 0) {
      ctx.save();
      ctx.translate(offsetX, offsetY);
    }

    // Draw in-progress legacy strokes
    for (const stroke of completedStrokes) {
      if (!stroke.complete) {
        drawStroke(ctx, stroke);
      }
    }

    // Draw in-progress elements
    for (const element of elements) {
      if (!element.complete) {
        drawElement(ctx, element);
      }
    }

    // Draw local active stroke
    if (activeStroke) {
      drawStroke(ctx, activeStroke);
    }

    // Draw local active element
    if (activeElement) {
      drawElement(ctx, activeElement);
    }

    // Draw selection highlight
    if (selectedStrokeId || selectedElementId) {
      const bounds = selectedStrokeId
        ? getBoundsForSelection(selectedStrokeId, 'stroke', completedStrokes, elements)
        : selectedElementId
          ? getBoundsForSelection(selectedElementId, 'element', completedStrokes, elements)
          : null;
      if (bounds) {
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(bounds.minX - 2, bounds.minY - 2, bounds.maxX - bounds.minX + 4, bounds.maxY - bounds.minY + 4);
        ctx.setLineDash([]);
      }
    }

    if (offsetX !== 0 || offsetY !== 0) {
      ctx.restore();
    }
  }, [width, height, offsetX, offsetY, completedStrokes, elements, activeStroke, activeElement, selectedStrokeId, selectedElementId, drawStroke, drawElement]);

  return (
    <div className="canvas-wrapper-inner" style={{ position: 'relative', width, height }}>
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="board-canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onDoubleClick={handleDoubleClick}
      style={{
          cursor: getCursor(),
        touchAction: 'none',
      }}
    />
      {textInputState && (
        <TextInput
          x={textInputState.canvasX + offsetX}
          y={textInputState.canvasY + offsetY}
          fontSize={textInputState.existingElement?.fontSize ?? fontSize}
          color={textInputState.existingElement?.color ?? penColor}
          initialValue={textInputState.existingElement?.text}
          elementId={textInputState.existingElement?.id}
          scaleX={textInputState.scaleX}
          scaleY={textInputState.scaleY}
          onSubmit={handleTextSubmit}
          onCancel={handleTextCancel}
        />
      )}
    </div>
  );
}

export const BoardCanvas = memo(BoardCanvasComponent);
