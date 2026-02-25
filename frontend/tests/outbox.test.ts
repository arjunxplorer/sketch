/**
 * Unit tests for outbox throttling and batching.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Outbox } from '../src/lib/outbox';

describe('Outbox cursor throttling', () => {
  let outbox: Outbox;
  let sendFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    sendFn = vi.fn(() => true);
    outbox = new Outbox(sendFn, 50); // 50ms throttle
  });

  afterEach(() => {
    outbox.clear();
    vi.useRealTimers();
  });

  it('should send first cursor move immediately', () => {
    outbox.queueCursorMove(100, 200);

    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(sendFn).toHaveBeenCalledWith(
      expect.stringContaining('"type":"cursor_move"')
    );
  });

  it('should throttle rapid cursor moves', () => {
    outbox.queueCursorMove(100, 200);
    outbox.queueCursorMove(110, 210);
    outbox.queueCursorMove(120, 220);

    // Only first should be sent immediately
    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  it('should send throttled cursor after delay', async () => {
    outbox.queueCursorMove(100, 200);
    outbox.queueCursorMove(110, 210);
    outbox.queueCursorMove(120, 220);

    // First sent immediately
    expect(sendFn).toHaveBeenCalledTimes(1);

    // After throttle period, last position should be sent
    await vi.advanceTimersByTimeAsync(50);

    expect(sendFn).toHaveBeenCalledTimes(2);
    // Should contain the last queued position
    expect(sendFn.mock.calls[1]?.[0]).toContain('"x":120');
    expect(sendFn.mock.calls[1]?.[0]).toContain('"y":220');
  });

  it('should send immediately after throttle period passes', async () => {
    outbox.queueCursorMove(100, 200);
    
    await vi.advanceTimersByTimeAsync(50);
    
    outbox.queueCursorMove(110, 210);

    // Second should be sent immediately since throttle period passed
    expect(sendFn).toHaveBeenCalledTimes(2);
  });

  it('should flush pending cursor on demand', () => {
    outbox.queueCursorMove(100, 200);
    outbox.queueCursorMove(110, 210);

    expect(sendFn).toHaveBeenCalledTimes(1);

    outbox.flush();

    expect(sendFn).toHaveBeenCalledTimes(2);
  });

  it('should clear pending cursor without sending', () => {
    outbox.queueCursorMove(100, 200);
    outbox.queueCursorMove(110, 210);

    expect(sendFn).toHaveBeenCalledTimes(1);

    outbox.clear();

    // Advance time - nothing should be sent
    vi.advanceTimersByTime(100);

    expect(sendFn).toHaveBeenCalledTimes(1);
  });
});

describe('Outbox stroke batching', () => {
  let outbox: Outbox;
  let sendFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    sendFn = vi.fn(() => true);
    outbox = new Outbox(sendFn);
  });

  afterEach(() => {
    outbox.clear();
    vi.useRealTimers();
  });

  it('should batch stroke points', async () => {
    outbox.queueStrokePoint('stroke-1', 100, 200);
    outbox.queueStrokePoint('stroke-1', 110, 210);
    outbox.queueStrokePoint('stroke-1', 120, 220);

    // Nothing sent yet
    expect(sendFn).toHaveBeenCalledTimes(0);

    // After batch interval
    await vi.advanceTimersByTimeAsync(20);

    expect(sendFn).toHaveBeenCalledTimes(1);
    const msg = JSON.parse(sendFn.mock.calls[0]?.[0] ?? '{}');
    expect(msg.data.points).toHaveLength(3);
  });

  it('should flush stroke points on demand', () => {
    outbox.queueStrokePoint('stroke-1', 100, 200);
    outbox.queueStrokePoint('stroke-1', 110, 210);

    expect(sendFn).toHaveBeenCalledTimes(0);

    outbox.flushStroke('stroke-1');

    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple strokes separately', async () => {
    outbox.queueStrokePoint('stroke-1', 100, 200);
    outbox.queueStrokePoint('stroke-2', 300, 400);
    outbox.queueStrokePoint('stroke-1', 110, 210);
    outbox.queueStrokePoint('stroke-2', 310, 410);

    await vi.advanceTimersByTimeAsync(20);

    // Should send 2 messages, one per stroke
    expect(sendFn).toHaveBeenCalledTimes(2);
  });
});

