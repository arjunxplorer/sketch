/**
 * Linear interpolation utilities for smooth cursor animation.
 */

/**
 * Linear interpolation between two values.
 * @param start - Starting value
 * @param end - Target value
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated value
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Calculate lerp factor based on delta time.
 * Provides framerate-independent smoothing.
 * @param deltaMs - Time since last frame in milliseconds
 * @param smoothingMs - Target smoothing duration in milliseconds
 * @returns Lerp factor (0-1)
 */
export function lerpFactor(deltaMs: number, smoothingMs: number = 100): number {
  return Math.min(1, deltaMs / smoothingMs);
}

/**
 * 2D point interpolation.
 * @param start - Starting point
 * @param end - Target point
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated point
 */
export function lerp2D(
  start: { x: number; y: number },
  end: { x: number; y: number },
  t: number
): { x: number; y: number } {
  return {
    x: lerp(start.x, end.x, t),
    y: lerp(start.y, end.y, t),
  };
}

/**
 * Exponential smoothing for cursor positions.
 * Provides natural-feeling cursor movement.
 * @param current - Current display position
 * @param target - Target position
 * @param deltaMs - Time since last update
 * @param speed - Smoothing speed (higher = faster, default 10)
 * @returns New display position
 */
export function smoothPosition(
  current: { x: number; y: number },
  target: { x: number; y: number },
  deltaMs: number,
  speed: number = 10
): { x: number; y: number } {
  const t = Math.min(1, deltaMs * speed / 1000);
  return lerp2D(current, target, t);
}

/**
 * Calculate distance between two points.
 */
export function distance(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

