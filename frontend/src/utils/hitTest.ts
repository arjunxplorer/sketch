/**
 * Hit testing utilities for selecting objects on the canvas.
 */

import { Stroke, DrawingElement } from '../lib/protocol';

const HIT_PADDING = 16; // pixels of padding around objects for easier selection

export interface HitResult {
  type: 'stroke' | 'element';
  id: string;
}

/**
 * Get bounding box of a stroke (min/max of all points with padding).
 */
function getStrokeBounds(stroke: Stroke): { minX: number; minY: number; maxX: number; maxY: number } {
  if (stroke.points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  const padding = Math.max(stroke.width, HIT_PADDING);
  let minX = stroke.points[0].x;
  let minY = stroke.points[0].y;
  let maxX = stroke.points[0].x;
  let maxY = stroke.points[0].y;

  for (const p of stroke.points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
}

/**
 * Get bounding box of an element.
 */
function getElementBounds(element: DrawingElement): { minX: number; minY: number; maxX: number; maxY: number } {
  const padding = HIT_PADDING;

  switch (element.type) {
    case 'stroke': {
      const pts = element.points;
      if (pts.length === 0) return { minX: element.x, minY: element.y, maxX: element.x, maxY: element.y };
      let minX = pts[0].x, minY = pts[0].y, maxX = pts[0].x, maxY = pts[0].y;
      for (const p of pts) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      return { minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding };
    }
    case 'line':
    case 'arrow': {
      const line = element as { x: number; y: number; endX: number; endY: number };
      const minX = Math.min(line.x, line.endX) - padding;
      const maxX = Math.max(line.x, line.endX) + padding;
      const minY = Math.min(line.y, line.endY) - padding;
      const maxY = Math.max(line.y, line.endY) + padding;
      return { minX, minY, maxX, maxY };
    }
    case 'rectangle':
    case 'ellipse':
    case 'diamond': {
      const shape = element as { x: number; y: number; width: number; height: number };
      const w = shape.width;
      const h = shape.height;
      const minX = shape.x + Math.min(0, w) - padding;
      const minY = shape.y + Math.min(0, h) - padding;
      const maxX = shape.x + Math.max(0, w) + padding;
      const maxY = shape.y + Math.max(0, h) + padding;
      return { minX, minY, maxX, maxY };
    }
    case 'text': {
      const text = element as { x: number; y: number; text: string; fontSize: number };
      const lines = text.text.split('\n');
      const lineHeight = text.fontSize * 1.2;
      const charWidth = text.fontSize * 0.6;
      // Max line width (longest line)
      let maxLineWidth = 0;
      for (const line of lines) {
        maxLineWidth = Math.max(maxLineWidth, line.length * charWidth);
      }
      const totalHeight = lines.length * lineHeight;
      return {
        minX: text.x - padding,
        minY: text.y - padding,
        maxX: text.x + maxLineWidth + padding,
        maxY: text.y + totalHeight + padding,
      };
    }
    default: {
      const base = element as { x: number; y: number };
      return { minX: base.x, minY: base.y, maxX: base.x, maxY: base.y };
    }
  }
}

function pointInBounds(x: number, y: number, bounds: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

/**
 * Find the topmost object at the given point.
 * Checks elements first (reverse order), then strokes (reverse order).
 */
export function hitTest(
  x: number,
  y: number,
  strokes: Stroke[],
  elements: DrawingElement[]
): HitResult | null {
  // Check elements (last drawn = on top)
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (!el.complete) continue;
    const bounds = getElementBounds(el);
    if (pointInBounds(x, y, bounds)) {
      return { type: 'element', id: el.id };
    }
  }

  // Check strokes (last drawn = on top)
  for (let i = strokes.length - 1; i >= 0; i--) {
    const stroke = strokes[i];
    if (!stroke.complete || stroke.points.length < 1) continue;
    const bounds = getStrokeBounds(stroke);
    if (pointInBounds(x, y, bounds)) {
      return { type: 'stroke', id: stroke.strokeId };
    }
  }

  return null;
}

/**
 * Check if a point is within radius of any eraser point.
 */
function pointNearEraserPath(
  x: number,
  y: number,
  eraserPoints: { x: number; y: number }[],
  radius: number
): boolean {
  for (const ep of eraserPoints) {
    const dx = x - ep.x;
    const dy = y - ep.y;
    if (dx * dx + dy * dy <= radius * radius) return true;
  }
  return false;
}

/**
 * Find stroke and element IDs that overlap with the eraser path.
 * Returns IDs that can be deleted (strokes in backend; text elements use strokeId).
 */
export function getErasedIds(
  eraserPoints: { x: number; y: number }[],
  eraserRadius: number,
  strokes: Stroke[],
  elements: DrawingElement[]
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  // Check strokes - stroke overlaps if any point is within eraser radius
  for (const stroke of strokes) {
    if (!stroke.complete || stroke.points.length < 1) continue;
    for (const p of stroke.points) {
      if (pointNearEraserPath(p.x, p.y, eraserPoints, eraserRadius)) {
        if (!seen.has(stroke.strokeId)) {
          seen.add(stroke.strokeId);
          ids.push(stroke.strokeId);
        }
        break;
      }
    }
  }

  // Check elements (text has id = strokeId; shapes are frontend-only, delete locally)
  for (const el of elements) {
    if (!el.complete) continue;
    const bounds = getElementBounds(el);
    // Expand bounds by eraser radius and check if any eraser point is inside
    const expanded = {
      minX: bounds.minX - eraserRadius,
      minY: bounds.minY - eraserRadius,
      maxX: bounds.maxX + eraserRadius,
      maxY: bounds.maxY + eraserRadius,
    };
    for (const ep of eraserPoints) {
      if (pointInBounds(ep.x, ep.y, expanded)) {
        if (!seen.has(el.id)) {
          seen.add(el.id);
          ids.push(el.id); // For text, id = strokeId; for shapes, we'll handle in store
        }
        break;
      }
    }
  }

  return ids;
}

/**
 * Get the bounding box of all content (strokes + elements).
 * Returns null if there is no content.
 */
export function getContentBounds(
  strokes: Stroke[],
  elements: DrawingElement[]
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasContent = false;

  for (const stroke of strokes) {
    if (stroke.points.length < 1) continue;
    const b = getStrokeBounds(stroke);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
    hasContent = true;
  }

  for (const el of elements) {
    const b = getElementBounds(el);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
    hasContent = true;
  }

  if (!hasContent) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Get bounds for a stroke or element by ID (for drawing selection highlight).
 */
export function getBoundsForSelection(
  id: string,
  type: 'stroke' | 'element',
  strokes: Stroke[],
  elements: DrawingElement[]
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (type === 'stroke') {
    const stroke = strokes.find((s) => s.strokeId === id);
    return stroke ? getStrokeBounds(stroke) : null;
  }
  const element = elements.find((e) => e.id === id);
  return element ? getElementBounds(element) : null;
}
