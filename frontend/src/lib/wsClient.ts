/**
 * WebSocket client with automatic reconnection and event handling.
 */

import {
  BaseMessage,
  parseServerMessage,
  createPingMessage,
  serializeMessage,
  ProtocolConstants,
} from './protocol';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WsClientEvents {
  onOpen: () => void;
  onClose: (code: number, reason: string) => void;
  onError: (error: Event) => void;
  onMessage: (message: BaseMessage) => void;
  onStatusChange: (status: ConnectionStatus) => void;
}

export interface WsClientOptions {
  url: string;
  autoReconnect?: boolean;
  maxReconnectDelay?: number;
  pingInterval?: number;
}

export class WsClient {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastPongTime = 0;
  private events: Partial<WsClientEvents> = {};
  private options: Required<WsClientOptions>;
  private intentionalClose = false;

  constructor(options: WsClientOptions) {
    this.options = {
      autoReconnect: true,
      maxReconnectDelay: ProtocolConstants.ReconnectMaxDelayMs,
      pingInterval: ProtocolConstants.HeartbeatIntervalMs,
      ...options,
    };
  }

  /**
   * Set event handlers.
   */
  on<K extends keyof WsClientEvents>(event: K, handler: WsClientEvents[K]): void {
    this.events[event] = handler;
  }

  /**
   * Get current connection status.
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.status === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Connect to WebSocket server.
   */
  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.intentionalClose = false;
    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(this.options.url);
      this.setupEventHandlers();
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.setStatus('error');
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from server.
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.cleanup();
    this.setStatus('disconnected');
  }

  /**
   * Send a message to the server.
   */
  send<T>(message: { type: string; seq: number; data: T }): boolean {
    if (!this.isConnected()) {
      console.warn('Cannot send message: not connected');
      return false;
    }

    try {
      const raw = serializeMessage(message);
      this.ws!.send(raw);
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      return false;
    }
  }

  /**
   * Send raw string message.
   */
  sendRaw(message: string): boolean {
    if (!this.isConnected()) {
      console.warn('Cannot send message: not connected');
      return false;
    }

    try {
      this.ws!.send(message);
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      return false;
    }
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.setStatus('connected');
      this.reconnectAttempts = 0;
      this.lastPongTime = Date.now();
      this.startPingInterval();
      this.events.onOpen?.();
    };

    this.ws.onclose = (event) => {
      this.stopPingInterval();
      
      if (!this.intentionalClose) {
        this.setStatus('disconnected');
        this.events.onClose?.(event.code, event.reason);
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (event) => {
      console.error('WebSocket error:', event);
      this.events.onError?.(event);
    };

    this.ws.onmessage = (event) => {
      const message = parseServerMessage(event.data);
      if (message) {
        // Track pong for heartbeat
        if (message.type === 'pong') {
          this.lastPongTime = Date.now();
        }
        this.events.onMessage?.(message);
      }
    };
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.events.onStatusChange?.(status);
    }
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        // Check for heartbeat timeout
        const timeSinceLastPong = Date.now() - this.lastPongTime;
        if (timeSinceLastPong > ProtocolConstants.HeartbeatTimeoutMs) {
          console.warn('Heartbeat timeout, reconnecting...');
          this.ws?.close();
          return;
        }

        // Send ping
        const pingMsg = createPingMessage();
        this.send(pingMsg);
      }
    }, this.options.pingInterval);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (!this.options.autoReconnect || this.intentionalClose) {
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, ... up to max
    const delay = Math.min(
      ProtocolConstants.ReconnectBaseDelayMs * Math.pow(2, this.reconnectAttempts),
      this.options.maxReconnectDelay
    );

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private cleanup(): void {
    this.stopPingInterval();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }

    this.reconnectAttempts = 0;
  }
}

// Singleton instance for the app
let clientInstance: WsClient | null = null;

export function getWsClient(url?: string): WsClient {
  if (!clientInstance && url) {
    clientInstance = new WsClient({ url });
  }
  if (!clientInstance) {
    throw new Error('WsClient not initialized. Call getWsClient with URL first.');
  }
  return clientInstance;
}

export function resetWsClient(): void {
  if (clientInstance) {
    clientInstance.disconnect();
    clientInstance = null;
  }
}

