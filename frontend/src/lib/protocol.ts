/**
 * Protocol definitions matching backend message_types.hpp
 * This file mirrors the C++ backend protocol for type-safe communication.
 */

// =============================================================================
// Message Types
// =============================================================================

export const MessageType = {
  // Control messages (reliable, low frequency)
  JoinRoom: 'join_room',
  Welcome: 'welcome',
  UserJoined: 'user_joined',
  UserLeft: 'user_left',

  // Presence messages (loss-tolerant, high frequency)
  CursorMove: 'cursor_move',

  // Drawing messages (reliable, event-driven)
  StrokeStart: 'stroke_start',
  StrokeAdd: 'stroke_add',
  StrokeEnd: 'stroke_end',
  StrokeMove: 'stroke_move',

  // State messages (reliable, on-demand)
  RoomState: 'room_state',

  // Heartbeat messages (reliable, periodic)
  Ping: 'ping',
  Pong: 'pong',

  // Error messages
  Error: 'error',
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

// =============================================================================
// Error Codes
// =============================================================================

export const ErrorCode = {
  // Room errors
  RoomNotFound: 'ROOM_NOT_FOUND',
  RoomFull: 'ROOM_FULL',
  InvalidPassword: 'INVALID_PASSWORD',

  // Message errors
  MalformedMessage: 'MALFORMED_MESSAGE',
  InvalidMessageType: 'INVALID_MESSAGE_TYPE',
  MissingField: 'MISSING_FIELD',
  InvalidField: 'INVALID_FIELD',

  // Rate limiting
  RateLimited: 'RATE_LIMITED',

  // Drawing errors
  InvalidStroke: 'INVALID_STROKE',
  StrokeTooLarge: 'STROKE_TOO_LARGE',

  // Connection errors
  NotInRoom: 'NOT_IN_ROOM',
  AlreadyInRoom: 'ALREADY_IN_ROOM',

  // Internal errors
  InternalError: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

// =============================================================================
// Protocol Constants
// =============================================================================

export const ProtocolConstants = {
  // Room limits
  MaxUsersPerRoom: 15,
  MaxStrokesPerRoom: 1000,
  SnapshotStrokeLimit: 500,
  SnapshotStrokeLimitSmall: 200,

  // Message limits
  MaxMessageSize: 64 * 1024, // 64 KB
  MaxPointsPerStroke: 10000,

  // Timing (in milliseconds)
  HeartbeatIntervalMs: 10000, // 10 seconds
  HeartbeatTimeoutMs: 30000, // 30 seconds
  GhostCursorTimeoutMs: 3000, // 3 seconds
  RateLimitMuteDurationMs: 10000, // 10 seconds
  CursorThrottleMs: 50, // 20 Hz

  // Rate limiting
  CursorUpdatesPerSecond: 20.0,
  RateLimitBurstSize: 5.0,

  // Reconnection
  ReconnectBaseDelayMs: 1000,
  ReconnectMaxDelayMs: 30000,
} as const;

// =============================================================================
// Tool Types
// =============================================================================

export const ToolType = {
  Select: 'select',
  Pan: 'pan',
  Pen: 'pen',
  Line: 'line',
  Arrow: 'arrow',
  Rectangle: 'rectangle',
  Ellipse: 'ellipse',
  Diamond: 'diamond',
  Text: 'text',
  Eraser: 'eraser',
} as const;

export type ToolTypeValue = (typeof ToolType)[keyof typeof ToolType];

// =============================================================================
// Element Types
// =============================================================================

export const ElementType = {
  Stroke: 'stroke',
  Line: 'line',
  Arrow: 'arrow',
  Rectangle: 'rectangle',
  Ellipse: 'ellipse',
  Diamond: 'diamond',
  Text: 'text',
} as const;

export type ElementTypeValue = (typeof ElementType)[keyof typeof ElementType];

// =============================================================================
// Data Types
// =============================================================================

export interface Point {
  x: number;
  y: number;
}

export interface UserInfo {
  userId: string;
  name: string;
  color: string;
}

export interface CursorState {
  userId: string;
  x: number;
  y: number;
  displayX: number;
  displayY: number;
  lastUpdate: number;
  userName: string;
  color: string;
}

// Base element interface
export interface BaseElement {
  id: string;
  type: ElementTypeValue;
  userId: string;
  x: number;
  y: number;
  color: string;
  strokeWidth: number;
  complete: boolean;
}

// Freehand stroke
export interface StrokeElement extends BaseElement {
  type: 'stroke';
  points: Point[];
}

// Straight line
export interface LineElement extends BaseElement {
  type: 'line';
  endX: number;
  endY: number;
}

// Arrow
export interface ArrowElement extends BaseElement {
  type: 'arrow';
  endX: number;
  endY: number;
}

// Rectangle
export interface RectangleElement extends BaseElement {
  type: 'rectangle';
  width: number;
  height: number;
  fill?: string;
}

// Ellipse
export interface EllipseElement extends BaseElement {
  type: 'ellipse';
  width: number;
  height: number;
  fill?: string;
}

// Diamond
export interface DiamondElement extends BaseElement {
  type: 'diamond';
  width: number;
  height: number;
  fill?: string;
}

// Text
export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
}

// Union type for all elements
export type DrawingElement = 
  | StrokeElement 
  | LineElement 
  | ArrowElement 
  | RectangleElement 
  | EllipseElement 
  | DiamondElement 
  | TextElement;

// Legacy Stroke type for backward compatibility
export interface Stroke {
  strokeId: string;
  userId: string;
  points: Point[];
  color: string;
  width: number;
  complete: boolean;
}

// =============================================================================
// Message Payloads (Client -> Server)
// =============================================================================

export interface JoinRoomData {
  roomId: string;
  userName: string;
  password?: string;
}

export interface CursorMoveData {
  x: number;
  y: number;
}

export interface StrokeStartData {
  strokeId: string;
  color: string;
  width: number;
}

export interface StrokeAddData {
  strokeId: string;
  points: [number, number][];
}

export interface StrokeEndData {
  strokeId: string;
}

export interface StrokeMoveData {
  strokeId: string;
  dx: number;
  dy: number;
}

// =============================================================================
// Message Payloads (Server -> Client)
// =============================================================================

export interface WelcomeData {
  userId: string;
  color: string;
  users: UserInfo[];
}

export interface UserJoinedData {
  userId: string;
  name: string;
  color: string;
}

export interface UserLeftData {
  userId: string;
}

export interface ServerCursorMoveData {
  userId: string;
  x: number;
  y: number;
}

export interface ServerStrokeStartData {
  strokeId: string;
  userId: string;
  color: string;
  width: number;
}

export interface ServerStrokeAddData {
  strokeId: string;
  userId: string;
  points: [number, number][];
}

export interface ServerStrokeEndData {
  strokeId: string;
  userId: string;
}

export interface ServerStrokeMoveData {
  strokeId: string;
  userId: string;
  dx: number;
  dy: number;
}

export interface RoomStateData {
  strokes: Array<{
    strokeId: string;
    userId: string;
    points: [number, number][];
    color: string;
    width: number;
    complete: boolean;
  }>;
  snapshotSeq: number;
}

export interface ErrorData {
  code: ErrorCodeValue;
  message: string;
}

// =============================================================================
// Message Envelope
// =============================================================================

export interface BaseMessage {
  type: MessageTypeValue;
  seq: number;
  timestamp: number;
  data: unknown;
}

export interface ClientMessage<T = unknown> {
  type: MessageTypeValue;
  seq: number;
  data: T;
}

export interface ServerMessage<T = unknown> extends BaseMessage {
  data: T;
}

// =============================================================================
// Type Guards
// =============================================================================

export function isWelcomeMessage(msg: BaseMessage): msg is ServerMessage<WelcomeData> {
  return msg.type === MessageType.Welcome;
}

export function isUserJoinedMessage(msg: BaseMessage): msg is ServerMessage<UserJoinedData> {
  return msg.type === MessageType.UserJoined;
}

export function isUserLeftMessage(msg: BaseMessage): msg is ServerMessage<UserLeftData> {
  return msg.type === MessageType.UserLeft;
}

export function isCursorMoveMessage(msg: BaseMessage): msg is ServerMessage<ServerCursorMoveData> {
  return msg.type === MessageType.CursorMove;
}

export function isStrokeStartMessage(msg: BaseMessage): msg is ServerMessage<ServerStrokeStartData> {
  return msg.type === MessageType.StrokeStart;
}

export function isStrokeAddMessage(msg: BaseMessage): msg is ServerMessage<ServerStrokeAddData> {
  return msg.type === MessageType.StrokeAdd;
}

export function isStrokeEndMessage(msg: BaseMessage): msg is ServerMessage<ServerStrokeEndData> {
  return msg.type === MessageType.StrokeEnd;
}

export function isRoomStateMessage(msg: BaseMessage): msg is ServerMessage<RoomStateData> {
  return msg.type === MessageType.RoomState;
}

export function isPongMessage(msg: BaseMessage): msg is ServerMessage<Record<string, never>> {
  return msg.type === MessageType.Pong;
}

export function isErrorMessage(msg: BaseMessage): msg is ServerMessage<ErrorData> {
  return msg.type === MessageType.Error;
}

// =============================================================================
// Message Creators
// =============================================================================

let clientSeq = 0;

export function createClientMessage<T>(type: MessageTypeValue, data: T): ClientMessage<T> {
  return {
    type,
    seq: ++clientSeq,
    data,
  };
}

export function createJoinRoomMessage(roomId: string, userName: string, password?: string): ClientMessage<JoinRoomData> {
  return createClientMessage(MessageType.JoinRoom, { roomId, userName, password });
}

export function createCursorMoveMessage(x: number, y: number): ClientMessage<CursorMoveData> {
  return createClientMessage(MessageType.CursorMove, { x, y });
}

export function createStrokeStartMessage(strokeId: string, color: string, width: number): ClientMessage<StrokeStartData> {
  return createClientMessage(MessageType.StrokeStart, { strokeId, color, width });
}

export function createStrokeAddMessage(strokeId: string, points: [number, number][]): ClientMessage<StrokeAddData> {
  return createClientMessage(MessageType.StrokeAdd, { strokeId, points });
}

export function createStrokeEndMessage(strokeId: string): ClientMessage<StrokeEndData> {
  return createClientMessage(MessageType.StrokeEnd, { strokeId });
}

export function createStrokeMoveMessage(strokeId: string, dx: number, dy: number): ClientMessage<StrokeMoveData> {
  return createClientMessage(MessageType.StrokeMove, { strokeId, dx, dy });
}

export function createPingMessage(): ClientMessage<Record<string, never>> {
  return createClientMessage(MessageType.Ping, {});
}

// =============================================================================
// Message Parsing
// =============================================================================

export function parseServerMessage(raw: string): BaseMessage | null {
  try {
    const msg = JSON.parse(raw) as BaseMessage;
    if (typeof msg.type !== 'string' || typeof msg.seq !== 'number') {
      console.warn('Invalid message format:', raw);
      return null;
    }
    return msg;
  } catch (e) {
    console.error('Failed to parse message:', e);
    return null;
  }
}

export function serializeMessage<T>(msg: ClientMessage<T>): string {
  return JSON.stringify(msg);
}

