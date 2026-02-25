/**
 * Inbox for message ordering and gap detection.
 * Ensures messages are processed in sequence order.
 */

import { BaseMessage, ProtocolConstants } from './protocol';

export type MessageHandler = (message: BaseMessage) => void;

interface QueuedMessage {
  message: BaseMessage;
  receivedAt: number;
}

export class Inbox {
  private handler: MessageHandler;
  private lastSeq = 0;
  private messageQueue: Map<number, QueuedMessage> = new Map();
  private maxQueueSize = 100;
  private maxQueueAgeMs = 5000;
  private processTimeout: ReturnType<typeof setTimeout> | null = null;

  // Separate sequence tracking for different message categories
  private lastControlSeq = 0;
  private lastPresenceSeq = 0;
  private lastDrawingSeq = 0;

  constructor(handler: MessageHandler) {
    this.handler = handler;
  }

  /**
   * Update the message handler.
   */
  setHandler(handler: MessageHandler): void {
    this.handler = handler;
  }

  /**
   * Process an incoming message.
   * Messages are processed immediately for real-time responsiveness.
   * Sequence numbers are tracked but gaps don't block processing.
   */
  receive(message: BaseMessage): void {
    const seq = message.seq;

    // Categorize message for logging/tracking
    const category = this.getMessageCategory(message.type);

    switch (category) {
      case 'presence':
        // Presence messages (cursor) - only process if newer
        if (seq > this.lastPresenceSeq) {
          this.lastPresenceSeq = seq;
          this.handler(message);
        }
        break;

      case 'drawing':
        // Drawing messages - process immediately for real-time feel
        if (seq > this.lastDrawingSeq) {
          this.lastDrawingSeq = seq;
        }
        this.handler(message);
        break;

      case 'control':
        // Control messages (welcome, user_joined, user_left, error)
        // Process immediately - can't wait for gaps since different users
        // receive different messages with different sequence numbers
        if (seq > this.lastControlSeq) {
          this.lastControlSeq = seq;
        }
        this.handler(message);
        break;

      case 'state':
        // Room state messages - process immediately
        if (seq > this.lastSeq) {
          this.lastSeq = seq;
        }
        this.handler(message);
        break;

      default:
        // Unknown category, just process
        this.handler(message);
    }
  }

  /**
   * Reset sequence tracking (e.g., on reconnect).
   */
  reset(): void {
    this.lastSeq = 0;
    this.lastControlSeq = 0;
    this.lastPresenceSeq = 0;
    this.lastDrawingSeq = 0;
    this.messageQueue.clear();
    
    if (this.processTimeout) {
      clearTimeout(this.processTimeout);
      this.processTimeout = null;
    }
  }

  /**
   * Check if there's a sequence gap.
   */
  hasGap(): boolean {
    return this.messageQueue.size > 0;
  }

  /**
   * Get the expected next sequence number.
   */
  getExpectedSeq(): number {
    return this.lastSeq + 1;
  }

  private getMessageCategory(type: string): 'control' | 'presence' | 'drawing' | 'state' | 'unknown' {
    switch (type) {
      case 'welcome':
      case 'user_joined':
      case 'user_left':
      case 'error':
        return 'control';
      
      case 'cursor_move':
        return 'presence';
      
      case 'stroke_start':
      case 'stroke_add':
      case 'stroke_end':
      case 'stroke_move':
        return 'drawing';
      
      case 'room_state':
        return 'state';
      
      case 'pong':
        return 'control';
      
      default:
        return 'unknown';
    }
  }

  private processOrderedMessage(message: BaseMessage): void {
    const seq = message.seq;

    // If this is the next expected message, process immediately
    if (seq === this.lastSeq + 1) {
      this.lastSeq = seq;
      this.handler(message);
      this.processQueuedMessages();
      return;
    }

    // If this is an old/duplicate message, ignore
    if (seq <= this.lastSeq) {
      return;
    }

    // We have a gap - queue this message
    if (this.messageQueue.size < this.maxQueueSize) {
      this.messageQueue.set(seq, {
        message,
        receivedAt: Date.now(),
      });

      // Schedule queue processing
      this.scheduleQueueProcessing();
    } else {
      // Queue is full, force process to catch up
      console.warn('Message queue full, forcing processing');
      this.forceProcessQueue();
      this.handler(message);
      this.lastSeq = seq;
    }
  }

  private processQueuedMessages(): void {
    // Process any sequential messages that are now ready
    let nextSeq = this.lastSeq + 1;
    let queued = this.messageQueue.get(nextSeq);

    while (queued) {
      this.messageQueue.delete(nextSeq);
      this.lastSeq = nextSeq;
      this.handler(queued.message);
      nextSeq++;
      queued = this.messageQueue.get(nextSeq);
    }
  }

  private scheduleQueueProcessing(): void {
    if (this.processTimeout) return;

    this.processTimeout = setTimeout(() => {
      this.processTimeout = null;
      this.cleanupOldMessages();
      
      // If we still have a gap after timeout, force process
      if (this.messageQueue.size > 0) {
        console.warn('Message gap timeout, forcing processing');
        this.forceProcessQueue();
      }
    }, this.maxQueueAgeMs);
  }

  private cleanupOldMessages(): void {
    const now = Date.now();
    const toDelete: number[] = [];

    for (const [seq, queued] of this.messageQueue) {
      if (now - queued.receivedAt > this.maxQueueAgeMs) {
        toDelete.push(seq);
      }
    }

    for (const seq of toDelete) {
      this.messageQueue.delete(seq);
    }
  }

  private forceProcessQueue(): void {
    // Sort queued messages by sequence and process them all
    const sorted = Array.from(this.messageQueue.entries())
      .sort((a, b) => a[0] - b[0]);

    for (const [seq, queued] of sorted) {
      this.handler(queued.message);
      this.lastSeq = Math.max(this.lastSeq, seq);
    }

    this.messageQueue.clear();
  }
}

// Singleton instance
let inboxInstance: Inbox | null = null;

export function getInbox(handler?: MessageHandler): Inbox {
  if (!inboxInstance && handler) {
    inboxInstance = new Inbox(handler);
  }
  if (!inboxInstance) {
    throw new Error('Inbox not initialized. Call getInbox with handler first.');
  }
  return inboxInstance;
}

export function resetInbox(): void {
  if (inboxInstance) {
    inboxInstance.reset();
    inboxInstance = null;
  }
}

