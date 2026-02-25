/**
 * Main drawing canvas component.
 * Supports multiple element types: strokes, shapes, lines, arrows, text.
 */

import { useRef, useEffect, useCallback, useState, memo } from 'react';
import { useDrawing } from '../hooks/useDrawing';
import { useStrokes, useActiveStroke, useElements, useActiveElement, useActiveTool, useElementActions, usePenColor, useFontSize, useSelection } from '../store/selectors';
import { getBoundsForSelection } from '../utils/hitTest';
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
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

function BoardCanvasComponent({ width, height, containerRef }: BoardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Text input state
  const [textInputPos, setTextInputPos] = useState<{ x: number; y: number } | null>(null);
  const penColor = usePenColor();
  const fontSize = useFontSize();
  const { addTextElement } = useElementActions();
  
  // Legacy strokes for backward compatibility
  const completedStrokes = useStrokes();
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
  } = useDrawing({ canvasRef, containerRef });

  // Custom pointer down handler for text tool
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Don't process if text input is already showing
    if (textInputPos) return;
    
    if (activeTool === ToolType.Text) {
      e.preventDefault();
      e.stopPropagation();
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      setTextInputPos({ x, y });
      return;
    }
    baseHandlePointerDown(e);
  }, [activeTool, baseHandlePointerDown, textInputPos]);

  // Handle text submit
  const handleTextSubmit = useCallback((text: string) => {
    if (textInputPos && text.trim()) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const canvasX = textInputPos.x * scaleX;
        const canvasY = textInputPos.y * scaleY;
        addTextElement(canvasX, canvasY, text);
      }
    }
    setTextInputPos(null);
  }, [textInputPos, addTextElement]);

  const handleTextCancel = useCallback(() => {
    setTextInputPos(null);
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

    // Get completed items
    const completedStrokesFiltered = completedStrokes.filter(s => s.complete);
    const completedElements = elements.filter(e => e.complete);

    // Full redraw - simpler and more reliable
    drawBackground(offCtx);
    
    // Draw all completed strokes
    for (const stroke of completedStrokesFiltered) {
      drawStroke(offCtx, stroke);
    }
    
    // Draw all completed elements
    for (const element of completedElements) {
      drawElement(offCtx, element);
    }
  }, [completedStrokes, elements, drawBackground, drawStroke, drawElement]);

  // Render main canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const offscreen = offscreenCanvasRef.current;
    if (!canvas || !ctx || !offscreen) return;

    // Copy offscreen canvas
    ctx.drawImage(offscreen, 0, 0);

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
  }, [completedStrokes, elements, activeStroke, activeElement, selectedStrokeId, selectedElementId, drawStroke, drawElement]);

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
      style={{
          cursor: getCursor(),
        touchAction: 'none',
      }}
    />
      {textInputPos && (
        <TextInput
          x={textInputPos.x}
          y={textInputPos.y}
          fontSize={fontSize}
          color={penColor}
          onSubmit={handleTextSubmit}
          onCancel={handleTextCancel}
        />
      )}
    </div>
  );
}

export const BoardCanvas = memo(BoardCanvasComponent);
