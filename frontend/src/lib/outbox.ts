/**
 * Outbox for throttling and batching outgoing messages.
 * Implements 50ms throttle for cursor updates and point batching for strokes.
 */

import {
  ProtocolConstants,
  createCursorMoveMessage,
  createStrokeAddMessage,
  serializeMessage,
} from './protocol';

export type SendFunction = (message: string) => boolean;

interface ThrottledValue {
  x: number;
  y: number;
  pending: boolean;
}

interface PendingStrokePoints {
  strokeId: string;
  points: [number, number][];
}

export class Outbox {
  private sendFn: SendFunction;
  private cursorThrottleMs: number;
  
  // Cursor throttling state
  private pendingCursor: ThrottledValue | null = null;
  private cursorTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastCursorSend = 0;

  // Stroke batching state
  private pendingStrokePoints: Map<string, PendingStrokePoints> = new Map();
  private strokeBatchTimeout: ReturnType<typeof setTimeout> | null = null;
  private strokeBatchIntervalMs = 16; // ~60fps batching

  constructor(sendFn: SendFunction, cursorThrottleMs: number = ProtocolConstants.CursorThrottleMs) {
    this.sendFn = sendFn;
    this.cursorThrottleMs = cursorThrottleMs;
  }

  /**
   * Update the send function (e.g., after reconnect).
   */
  setSendFunction(sendFn: SendFunction): void {
    this.sendFn = sendFn;
  }

  /**
   * Queue a cursor move for throttled sending.
   * Only the latest position is kept; intermediate positions are dropped.
   */
  queueCursorMove(x: number, y: number): void {
    const now = Date.now();
    const timeSinceLastSend = now - this.lastCursorSend;

    // If enough time has passed, send immediately
    if (timeSinceLastSend >= this.cursorThrottleMs) {
      this.sendCursorNow(x, y);
      return;
    }

    // Otherwise, queue for later (replace any pending)
    this.pendingCursor = { x, y, pending: true };

    // Schedule send if not already scheduled
    if (!this.cursorTimeout) {
      const delay = this.cursorThrottleMs - timeSinceLastSend;
      this.cursorTimeout = setTimeout(() => {
        this.flushCursor();
      }, delay);
    }
  }

  /**
   * Queue stroke points for batched sending.
   * Points are accumulated and sent together.
   */
  queueStrokePoint(strokeId: string, x: number, y: number): void {
    let pending = this.pendingStrokePoints.get(strokeId);
    if (!pending) {
      pending = { strokeId, points: [] };
      this.pendingStrokePoints.set(strokeId, pending);
    }
    pending.points.push([x, y]);

    // Schedule batch send if not already scheduled
    if (!this.strokeBatchTimeout) {
      this.strokeBatchTimeout = setTimeout(() => {
        this.flushStrokePoints();
      }, this.strokeBatchIntervalMs);
    }
  }

  /**
   * Force flush all pending stroke points for a specific stroke.
   * Call this on stroke end.
   */
  flushStroke(strokeId: string): void {
    const pending = this.pendingStrokePoints.get(strokeId);
    if (pending && pending.points.length > 0) {
      this.sendStrokePointsNow(pending.strokeId, pending.points);
      this.pendingStrokePoints.delete(strokeId);
    }
  }

  /**
   * Flush all pending messages.
   */
  flush(): void {
    this.flushCursor();
    this.flushStrokePoints();
  }

  /**
   * Clear all pending messages without sending.
   */
  clear(): void {
    if (this.cursorTimeout) {
      clearTimeout(this.cursorTimeout);
      this.cursorTimeout = null;
    }
    if (this.strokeBatchTimeout) {
      clearTimeout(this.strokeBatchTimeout);
      this.strokeBatchTimeout = null;
    }
    this.pendingCursor = null;
    this.pendingStrokePoints.clear();
  }

  private sendCursorNow(x: number, y: number): void {
    const msg = createCursorMoveMessage(x, y);
    this.sendFn(serializeMessage(msg));
    this.lastCursorSend = Date.now();
    this.pendingCursor = null;
  }

  private flushCursor(): void {
    if (this.cursorTimeout) {
      clearTimeout(this.cursorTimeout);
      this.cursorTimeout = null;
    }

    if (this.pendingCursor) {
      this.sendCursorNow(this.pendingCursor.x, this.pendingCursor.y);
    }
  }

  private sendStrokePointsNow(strokeId: string, points: [number, number][]): void {
    if (points.length === 0) return;
    const msg = createStrokeAddMessage(strokeId, points);
    this.sendFn(serializeMessage(msg));
  }

  private flushStrokePoints(): void {
    if (this.strokeBatchTimeout) {
      clearTimeout(this.strokeBatchTimeout);
      this.strokeBatchTimeout = null;
    }

    for (const pending of this.pendingStrokePoints.values()) {
      if (pending.points.length > 0) {
        this.sendStrokePointsNow(pending.strokeId, pending.points);
        pending.points = [];
      }
    }
  }
}

// Singleton instance
let outboxInstance: Outbox | null = null;

export function getOutbox(sendFn?: SendFunction): Outbox {
  if (!outboxInstance && sendFn) {
    outboxInstance = new Outbox(sendFn);
  }
  if (!outboxInstance) {
    throw new Error('Outbox not initialized. Call getOutbox with send function first.');
  }
  return outboxInstance;
}

export function resetOutbox(): void {
  if (outboxInstance) {
    outboxInstance.clear();
    outboxInstance = null;
  }
}

