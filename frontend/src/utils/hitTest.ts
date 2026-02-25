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
      // Approximate text width: ~0.6 * fontSize per character
      const approxWidth = text.text.length * text.fontSize * 0.6;
      const approxHeight = text.fontSize * 1.2;
      return {
        minX: text.x - padding,
        minY: text.y - padding,
        maxX: text.x + approxWidth + padding,
        maxY: text.y + approxHeight + padding,
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
