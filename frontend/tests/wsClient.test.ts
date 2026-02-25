/**
 * Unit tests for WebSocket client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1000, reason: 'Normal closure' });
  });
}

// @ts-expect-error - Mock global WebSocket
global.WebSocket = MockWebSocket;

import { WsClient } from '../src/lib/wsClient';

describe('WsClient', () => {
  let client: WsClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new WsClient({ url: 'ws://localhost:8080' });
  });

  afterEach(() => {
    client.disconnect();
    vi.useRealTimers();
  });

  it('should start in disconnected state', () => {
    expect(client.getStatus()).toBe('disconnected');
    expect(client.isConnected()).toBe(false);
  });

  it('should transition to connecting when connect is called', () => {
    client.connect();
    expect(client.getStatus()).toBe('connecting');
  });

  it('should transition to connected after WebSocket opens', async () => {
    const statusChanges: string[] = [];
    client.on('onStatusChange', (status) => statusChanges.push(status));

    client.connect();
    await vi.runAllTimersAsync();

    expect(client.getStatus()).toBe('connected');
    expect(client.isConnected()).toBe(true);
    expect(statusChanges).toContain('connecting');
    expect(statusChanges).toContain('connected');
  });

  it('should call onOpen handler when connected', async () => {
    const onOpen = vi.fn();
    client.on('onOpen', onOpen);

    client.connect();
    await vi.runAllTimersAsync();

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('should handle disconnect', async () => {
    client.connect();
    await vi.runAllTimersAsync();

    client.disconnect();

    expect(client.getStatus()).toBe('disconnected');
    expect(client.isConnected()).toBe(false);
  });

  it('should send messages when connected', async () => {
    client.connect();
    await vi.runAllTimersAsync();

    const result = client.send({ type: 'test', seq: 1, data: {} });

    expect(result).toBe(true);
  });

  it('should not send messages when disconnected', () => {
    const result = client.send({ type: 'test', seq: 1, data: {} });
    expect(result).toBe(false);
  });
});

describe('WsClient reconnection', () => {
  it('should attempt reconnection on disconnect', async () => {
    const client = new WsClient({ 
      url: 'ws://localhost:8080',
      autoReconnect: true,
    });

    client.connect();
    await vi.runAllTimersAsync();

    // Simulate disconnect
    // @ts-expect-error - accessing private for testing
    client.ws?.onclose?.({ code: 1006, reason: 'Abnormal closure' });

    // Fast forward reconnection delay
    await vi.advanceTimersByTimeAsync(1000);

    // Should attempt to reconnect
    expect(client.getStatus()).toBe('connecting');

    client.disconnect();
  });
});

