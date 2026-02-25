/**
 * Unit tests for Zustand room store.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useRoomStore } from '../src/store/roomStore';
import { MessageType } from '../src/lib/protocol';

describe('RoomStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useRoomStore.getState().reset();
  });

  describe('initial state', () => {
    it('should have correct initial values', () => {
      const state = useRoomStore.getState();

      expect(state.connectionStatus).toBe('disconnected');
      expect(state.userId).toBeNull();
      expect(state.roomId).toBeNull();
      expect(state.users.size).toBe(0);
      expect(state.strokes).toHaveLength(0);
    });
  });

  describe('pen settings', () => {
    it('should update pen color', () => {
      const state = useRoomStore.getState();
      state.setPenColor('#FF0000');

      expect(useRoomStore.getState().penColor).toBe('#FF0000');
    });

    it('should update pen width', () => {
      const state = useRoomStore.getState();
      state.setPenWidth(8);

      expect(useRoomStore.getState().penWidth).toBe(8);
    });
  });

  describe('message handling', () => {
    it('should handle welcome message', () => {
      const state = useRoomStore.getState();

      state.handleMessage({
        type: MessageType.Welcome,
        seq: 1,
        timestamp: Date.now(),
        data: {
          userId: 'user-123',
          color: '#FF5733',
          users: [
            { userId: 'user-456', name: 'Bob', color: '#33FF57' },
          ],
        },
      });

      const newState = useRoomStore.getState();
      expect(newState.userId).toBe('user-123');
      expect(newState.userColor).toBe('#FF5733');
      expect(newState.users.size).toBe(1);
      expect(newState.users.get('user-456')?.name).toBe('Bob');
    });

    it('should handle user_joined message', () => {
      const state = useRoomStore.getState();

      state.handleMessage({
        type: MessageType.UserJoined,
        seq: 2,
        timestamp: Date.now(),
        data: {
          userId: 'user-789',
          name: 'Alice',
          color: '#3357FF',
        },
      });

      const newState = useRoomStore.getState();
      expect(newState.users.size).toBe(1);
      expect(newState.users.get('user-789')?.name).toBe('Alice');
    });

    it('should handle user_left message', () => {
      const state = useRoomStore.getState();

      // First add a user
      state.handleMessage({
        type: MessageType.UserJoined,
        seq: 1,
        timestamp: Date.now(),
        data: {
          userId: 'user-789',
          name: 'Alice',
          color: '#3357FF',
        },
      });

      expect(useRoomStore.getState().users.size).toBe(1);

      // Then remove them
      state.handleMessage({
        type: MessageType.UserLeft,
        seq: 2,
        timestamp: Date.now(),
        data: {
          userId: 'user-789',
        },
      });

      expect(useRoomStore.getState().users.size).toBe(0);
    });

    it('should handle cursor_move message for other users', () => {
      const state = useRoomStore.getState();

      // Add a user first
      state.handleMessage({
        type: MessageType.UserJoined,
        seq: 1,
        timestamp: Date.now(),
        data: {
          userId: 'user-456',
          name: 'Bob',
          color: '#33FF57',
        },
      });

      // Now update their cursor
      state.handleMessage({
        type: MessageType.CursorMove,
        seq: 2,
        timestamp: Date.now(),
        data: {
          userId: 'user-456',
          x: 100,
          y: 200,
        },
      });

      const cursor = useRoomStore.getState().cursors.get('user-456');
      expect(cursor).toBeDefined();
      expect(cursor?.x).toBe(100);
      expect(cursor?.y).toBe(200);
    });

    it('should handle room_state message', () => {
      const state = useRoomStore.getState();

      state.handleMessage({
        type: MessageType.RoomState,
        seq: 1,
        timestamp: Date.now(),
        data: {
          strokes: [
            {
              strokeId: 'stroke-1',
              userId: 'user-123',
              points: [[10, 20], [30, 40]],
              color: '#000000',
              width: 2,
              complete: true,
            },
          ],
          snapshotSeq: 100,
        },
      });

      const newState = useRoomStore.getState();
      expect(newState.strokes).toHaveLength(1);
      expect(newState.strokes[0]?.strokeId).toBe('stroke-1');
      expect(newState.strokes[0]?.points).toHaveLength(2);
    });

    it('should handle error message', () => {
      const state = useRoomStore.getState();

      state.handleMessage({
        type: MessageType.Error,
        seq: 1,
        timestamp: Date.now(),
        data: {
          code: 'ROOM_FULL',
          message: 'Room has reached maximum capacity',
        },
      });

      expect(useRoomStore.getState().lastError).toBe('Room has reached maximum capacity');
    });
  });

  describe('stroke handling from server', () => {
    beforeEach(() => {
      // Set up initial state with userId
      useRoomStore.setState({ userId: 'current-user' });
    });

    it('should add remote strokes from stroke_start', () => {
      const state = useRoomStore.getState();

      state.handleMessage({
        type: MessageType.StrokeStart,
        seq: 1,
        timestamp: Date.now(),
        data: {
          strokeId: 'stroke-remote',
          userId: 'other-user',
          color: '#FF0000',
          width: 4,
        },
      });

      const strokes = useRoomStore.getState().strokes;
      expect(strokes).toHaveLength(1);
      expect(strokes[0]?.strokeId).toBe('stroke-remote');
      expect(strokes[0]?.complete).toBe(false);
    });

    it('should add points from stroke_add', () => {
      const state = useRoomStore.getState();

      // First create the stroke
      state.handleMessage({
        type: MessageType.StrokeStart,
        seq: 1,
        timestamp: Date.now(),
        data: {
          strokeId: 'stroke-remote',
          userId: 'other-user',
          color: '#FF0000',
          width: 4,
        },
      });

      // Then add points
      state.handleMessage({
        type: MessageType.StrokeAdd,
        seq: 2,
        timestamp: Date.now(),
        data: {
          strokeId: 'stroke-remote',
          userId: 'other-user',
          points: [[10, 20], [30, 40], [50, 60]],
        },
      });

      const strokes = useRoomStore.getState().strokes;
      expect(strokes[0]?.points).toHaveLength(3);
    });

    it('should mark stroke complete from stroke_end', () => {
      const state = useRoomStore.getState();

      // Create and complete stroke
      state.handleMessage({
        type: MessageType.StrokeStart,
        seq: 1,
        timestamp: Date.now(),
        data: {
          strokeId: 'stroke-remote',
          userId: 'other-user',
          color: '#FF0000',
          width: 4,
        },
      });

      state.handleMessage({
        type: MessageType.StrokeEnd,
        seq: 2,
        timestamp: Date.now(),
        data: {
          strokeId: 'stroke-remote',
          userId: 'other-user',
        },
      });

      expect(useRoomStore.getState().strokes[0]?.complete).toBe(true);
    });

    it('should ignore own strokes from server', () => {
      const state = useRoomStore.getState();

      state.handleMessage({
        type: MessageType.StrokeStart,
        seq: 1,
        timestamp: Date.now(),
        data: {
          strokeId: 'my-stroke',
          userId: 'current-user', // Same as our userId
          color: '#FF0000',
          width: 4,
        },
      });

      // Should not add to strokes (we handle our own locally)
      expect(useRoomStore.getState().strokes).toHaveLength(0);
    });
  });
});

