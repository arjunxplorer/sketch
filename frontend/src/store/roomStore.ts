/**
 * Zustand store for room state management.
 * Central state container for the collaborative whiteboard.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  BaseMessage,
  UserInfo,
  CursorState,
  Stroke,
  DrawingElement,
  StrokeElement,
  LineElement,
  ArrowElement,
  RectangleElement,
  EllipseElement,
  DiamondElement,
  TextElement,
  ToolType,
  ToolTypeValue,
  MessageType,
  WelcomeData,
  UserJoinedData,
  UserLeftData,
  ServerCursorMoveData,
  ServerStrokeStartData,
  ServerStrokeAddData,
  ServerStrokeEndData,
  ServerStrokeMoveData,
  RoomStateData,
  ErrorData,
  createJoinRoomMessage,
  createStrokeStartMessage,
  createStrokeEndMessage,
  createStrokeMoveMessage,
  ProtocolConstants,
} from '../lib/protocol';
import { WsClient, ConnectionStatus } from '../lib/wsClient';
import { Outbox } from '../lib/outbox';
import { Inbox } from '../lib/inbox';
import { generateUUID } from '../utils/idGenerator';
import { hitTest } from '../utils/hitTest';

// =============================================================================
// State Interface
// =============================================================================

export interface RoomState {
  // Connection
  connectionStatus: ConnectionStatus;
  lastError: string | null;
  wsClient: WsClient | null;
  outbox: Outbox | null;
  inbox: Inbox | null;

  // Identity
  userId: string | null;
  userName: string | null;
  userColor: string | null;
  roomId: string | null;

  // Participants
  users: Map<string, UserInfo>;
  cursors: Map<string, CursorState>;

  // Board - Legacy strokes for backward compatibility
  strokes: Stroke[];
  activeStroke: Stroke | null;
  currentStrokeId: string | null;

  // Elements - New unified element system
  elements: DrawingElement[];
  activeElement: DrawingElement | null;
  currentElementId: string | null;

  // Tool selection
  activeTool: ToolTypeValue;

  // Selection (for Select tool)
  selectedStrokeId: string | null;
  selectedElementId: string | null;

  // Drawing settings
  penColor: string;
  penWidth: number;
  fillColor: string | null;
  fontSize: number;

  // Actions
  connect: (wsUrl: string, roomId: string, userName: string, password?: string) => void;
  disconnect: () => void;
  handleMessage: (msg: BaseMessage) => void;
  
  // Cursor
  sendCursorMove: (x: number, y: number) => void;
  updateRemoteCursor: (userId: string, x: number, y: number) => void;
  
  // Drawing
  startStroke: (isEraser?: boolean) => void;
  addStrokePoint: (x: number, y: number) => void;
  endStroke: () => void;
  
  // Settings
  setPenColor: (color: string) => void;
  setPenWidth: (width: number) => void;
  setFillColor: (color: string | null) => void;
  setFontSize: (size: number) => void;
  setActiveTool: (tool: ToolTypeValue) => void;

  // Element operations
  startElement: (x: number, y: number) => void;
  updateElement: (x: number, y: number) => void;
  finishElement: () => void;
  addTextElement: (x: number, y: number, text: string) => void;

  // Selection operations
  selectObjectAt: (x: number, y: number) => void;
  moveSelectedObject: (dx: number, dy: number) => void;
  sendStrokeMove: (strokeId: string, dx: number, dy: number) => void;
  clearSelection: () => void;
  
  // Internal
  setConnectionStatus: (status: ConnectionStatus) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate intermediate points along a line for straight edge rendering.
 */
function interpolatePoints(
  x1: number, y1: number, 
  x2: number, y2: number, 
  numPoints: number
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    points.push({
      x: x1 + (x2 - x1) * t,
      y: y1 + (y2 - y1) * t,
    });
  }
  return points;
}

/**
 * Convert a drawing element to a series of points for stroke-based syncing.
 * Uses many intermediate points to ensure straight edges render correctly.
 */
function elementToPoints(element: DrawingElement): { x: number; y: number }[] {
  const POINTS_PER_EDGE = 10; // Enough points to make edges straight
  
  switch (element.type) {
    case 'stroke': {
      const stroke = element as StrokeElement;
      return stroke.points;
    }

    case 'line': {
      const line = element as LineElement;
      return interpolatePoints(line.x, line.y, line.endX, line.endY, POINTS_PER_EDGE);
    }

    case 'arrow': {
      const arrow = element as ArrowElement;
      const headLen = 15;
      const dx = arrow.endX - arrow.x;
      const dy = arrow.endY - arrow.y;
      const angle = Math.atan2(dy, dx);
      
      // Main line with interpolated points
      const linePoints = interpolatePoints(arrow.x, arrow.y, arrow.endX, arrow.endY, POINTS_PER_EDGE);
      
      // Arrowhead points
      const headLeft = {
        x: arrow.endX - headLen * Math.cos(angle - Math.PI / 6),
        y: arrow.endY - headLen * Math.sin(angle - Math.PI / 6),
      };
      const headRight = {
        x: arrow.endX - headLen * Math.cos(angle + Math.PI / 6),
        y: arrow.endY - headLen * Math.sin(angle + Math.PI / 6),
      };
      
      // Line + arrowhead (left side, back to tip, right side)
      return [
        ...linePoints,
        ...interpolatePoints(arrow.endX, arrow.endY, headLeft.x, headLeft.y, 3),
        { x: arrow.endX, y: arrow.endY },
        ...interpolatePoints(arrow.endX, arrow.endY, headRight.x, headRight.y, 3),
      ];
    }

    case 'rectangle': {
      const rect = element as RectangleElement;
      const x1 = rect.x;
      const y1 = rect.y;
      const x2 = rect.x + rect.width;
      const y2 = rect.y + rect.height;
      
      // Rectangle with interpolated edges
      const points: { x: number; y: number }[] = [];
      // Top edge
      points.push(...interpolatePoints(x1, y1, x2, y1, POINTS_PER_EDGE));
      // Right edge
      points.push(...interpolatePoints(x2, y1, x2, y2, POINTS_PER_EDGE));
      // Bottom edge
      points.push(...interpolatePoints(x2, y2, x1, y2, POINTS_PER_EDGE));
      // Left edge (close)
      points.push(...interpolatePoints(x1, y2, x1, y1, POINTS_PER_EDGE));
      
      return points;
    }

    case 'ellipse': {
      const ellipse = element as EllipseElement;
      const cx = ellipse.x + ellipse.width / 2;
      const cy = ellipse.y + ellipse.height / 2;
      const rx = Math.abs(ellipse.width / 2);
      const ry = Math.abs(ellipse.height / 2);
      
      // Generate points along ellipse
      const points: { x: number; y: number }[] = [];
      const segments = 48; // More segments for smoother ellipse
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push({
          x: cx + rx * Math.cos(angle),
          y: cy + ry * Math.sin(angle),
        });
      }
      return points;
    }

    case 'diamond': {
      const diamond = element as DiamondElement;
      const cx = diamond.x + diamond.width / 2;
      const cy = diamond.y + diamond.height / 2;
      
      const top = { x: cx, y: diamond.y };
      const right = { x: diamond.x + diamond.width, y: cy };
      const bottom = { x: cx, y: diamond.y + diamond.height };
      const left = { x: diamond.x, y: cy };
      
      // Diamond with interpolated edges
      const points: { x: number; y: number }[] = [];
      // Top to right
      points.push(...interpolatePoints(top.x, top.y, right.x, right.y, POINTS_PER_EDGE));
      // Right to bottom
      points.push(...interpolatePoints(right.x, right.y, bottom.x, bottom.y, POINTS_PER_EDGE));
      // Bottom to left
      points.push(...interpolatePoints(bottom.x, bottom.y, left.x, left.y, POINTS_PER_EDGE));
      // Left to top (close)
      points.push(...interpolatePoints(left.x, left.y, top.x, top.y, POINTS_PER_EDGE));
      
      return points;
    }

    default:
      return [];
  }
}

// =============================================================================
// Initial State
// =============================================================================

const initialState = {
  connectionStatus: 'disconnected' as ConnectionStatus,
  lastError: null,
  wsClient: null,
  outbox: null,
  inbox: null,
  userId: null,
  userName: null,
  userColor: null,
  roomId: null,
  users: new Map<string, UserInfo>(),
  cursors: new Map<string, CursorState>(),
  strokes: [] as Stroke[],
  activeStroke: null as Stroke | null,
  currentStrokeId: null as string | null,
  elements: [] as DrawingElement[],
  activeElement: null as DrawingElement | null,
  currentElementId: null as string | null,
  activeTool: ToolType.Pen as ToolTypeValue,
  selectedStrokeId: null as string | null,
  selectedElementId: null as string | null,
  penColor: '#ffffff',
  penWidth: 4,
  fillColor: null as string | null,
  fontSize: 20,
};

// =============================================================================
// Store
// =============================================================================

export const useRoomStore = create<RoomState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // =========================================================================
    // Connection
    // =========================================================================

    connect: (wsUrl: string, roomId: string, userName: string, password?: string) => {
      const state = get();
      
      // Clean up existing connection
      if (state.wsClient) {
        state.wsClient.disconnect();
      }

      // Create new WebSocket client
      const wsClient = new WsClient({ url: wsUrl });

      // Create outbox with send function
      const outbox = new Outbox((msg) => wsClient.sendRaw(msg));

      // Create inbox with message handler
      const inbox = new Inbox((msg) => get().handleMessage(msg));

      // Set up event handlers
      wsClient.on('onStatusChange', (status) => {
        set({ connectionStatus: status });
      });

      wsClient.on('onOpen', () => {
        // Send join room message
        const joinMsg = createJoinRoomMessage(roomId, userName, password);
        wsClient.send(joinMsg);
      });

      wsClient.on('onMessage', (msg) => {
        inbox.receive(msg);
      });

      wsClient.on('onClose', (_code, reason) => {
        console.log('WebSocket closed:', reason);
      });

      wsClient.on('onError', (error) => {
        console.error('WebSocket error:', error);
        set({ lastError: 'Connection error' });
      });

      // Update state and connect
      set({
        wsClient,
        outbox,
        inbox,
        roomId,
        userName,
        lastError: null,
      });

      wsClient.connect();
    },

    disconnect: () => {
      const { wsClient, outbox } = get();
      
      if (outbox) {
        outbox.clear();
      }
      
      if (wsClient) {
        wsClient.disconnect();
      }

      set({
        ...initialState,
        penColor: get().penColor,
        penWidth: get().penWidth,
      });
    },

    setConnectionStatus: (status: ConnectionStatus) => {
      set({ connectionStatus: status });
    },

    setError: (error: string | null) => {
      set({ lastError: error });
    },

    reset: () => {
      const { wsClient, outbox } = get();
      outbox?.clear();
      wsClient?.disconnect();
      set(initialState);
    },

    // =========================================================================
    // Message Handling
    // =========================================================================

    handleMessage: (msg: BaseMessage) => {
      const state = get();

      switch (msg.type) {
        case MessageType.Welcome: {
          const data = msg.data as WelcomeData;
          const usersMap = new Map<string, UserInfo>();
          
          for (const user of data.users) {
            if (user.userId !== data.userId) {
              usersMap.set(user.userId, user);
            }
          }

          set({
            userId: data.userId,
            userColor: data.color,
            users: usersMap,
            lastError: null,
          });
          break;
        }

        case MessageType.UserJoined: {
          const data = msg.data as UserJoinedData;
          const users = new Map(state.users);
          users.set(data.userId, {
            userId: data.userId,
            name: data.name,
            color: data.color,
          });
          set({ users });
          break;
        }

        case MessageType.UserLeft: {
          const data = msg.data as UserLeftData;
          const users = new Map(state.users);
          const cursors = new Map(state.cursors);
          users.delete(data.userId);
          cursors.delete(data.userId);
          set({ users, cursors });
          break;
        }

        case MessageType.CursorMove: {
          const data = msg.data as ServerCursorMoveData;
          // Don't update our own cursor
          if (data.userId === state.userId) break;
          
          state.updateRemoteCursor(data.userId, data.x, data.y);
          break;
        }

        case MessageType.StrokeStart: {
          const data = msg.data as ServerStrokeStartData;
          // Don't add our own strokes from server
          if (data.userId === state.userId) break;

          // Check if this is a text element (strokeId starts with "txt:")
          if (data.strokeId.startsWith('txt:')) {
            try {
              const encodedData = data.strokeId.slice(4); // Remove "txt:" prefix
              const textData = JSON.parse(atob(encodedData)) as { text: string; fontSize: number; x: number; y: number };
              
              const textElement: TextElement = {
                id: data.strokeId,
                type: 'text',
                userId: data.userId,
                x: textData.x,
                y: textData.y,
                text: textData.text,
                color: data.color,
                strokeWidth: 1,
                fontSize: textData.fontSize,
                complete: true, // Text elements are immediately complete
              };
              
              set((s) => ({ elements: [...s.elements, textElement] }));
            } catch (e) {
              console.error('Failed to decode text element:', e);
            }
            break;
          }

          const newStroke: Stroke = {
            strokeId: data.strokeId,
            userId: data.userId,
            points: [],
            color: data.color,
            width: data.width,
            complete: false,
          };
          
          set({ strokes: [...state.strokes, newStroke] });
          break;
        }

        case MessageType.StrokeAdd: {
          const data = msg.data as ServerStrokeAddData;
          // Don't add our own strokes from server
          if (data.userId === state.userId) break;
          // Skip text strokes (they're handled in StrokeStart)
          if (data.strokeId.startsWith('txt:')) break;

          const strokes = state.strokes.map((stroke) => {
            if (stroke.strokeId === data.strokeId) {
              const newPoints = data.points.map(([x, y]) => ({ x, y }));
              return {
                ...stroke,
                points: [...stroke.points, ...newPoints],
              };
            }
            return stroke;
          });
          
          set({ strokes });
          break;
        }

        case MessageType.StrokeEnd: {
          const data = msg.data as ServerStrokeEndData;
          // Don't process our own stroke_end - we already marked it complete locally
          if (data.userId === state.userId) break;
          // Skip text strokes (they're already complete from StrokeStart)
          if (data.strokeId.startsWith('txt:')) break;
          
          const strokes = state.strokes.map((stroke) => {
            if (stroke.strokeId === data.strokeId) {
              return { ...stroke, complete: true };
            }
            return stroke;
          });
          
          set({ strokes });
          break;
        }

        case MessageType.StrokeMove: {
          const data = msg.data as ServerStrokeMoveData;
          // Don't process our own stroke_move - we already applied locally
          if (data.userId === state.userId) break;

          const strokes = state.strokes.map((s) => {
            if (s.strokeId !== data.strokeId) return s;
            return {
              ...s,
              points: s.points.map((p) => ({ x: p.x + data.dx, y: p.y + data.dy })),
            };
          });
          set({ strokes });
          break;
        }

        case MessageType.RoomState: {
          const data = msg.data as RoomStateData;
          
          const strokes: Stroke[] = data.strokes.map((s) => ({
            strokeId: s.strokeId,
            userId: s.userId,
            points: s.points.map(([x, y]) => ({ x, y })),
            color: s.color,
            width: s.width,
            complete: s.complete,
          }));
          
          set({ strokes });
          break;
        }

        case MessageType.Error: {
          const data = msg.data as ErrorData;
          console.error('[RoomStore] Server error:', data.code, data.message);
          set({ lastError: data.message });
          break;
        }

        case MessageType.Pong:
          // Heartbeat handled by wsClient
          break;

        default:
          console.warn('Unknown message type:', msg.type);
      }
    },

    // =========================================================================
    // Cursor
    // =========================================================================

    sendCursorMove: (x: number, y: number) => {
      const { outbox, connectionStatus } = get();
      if (outbox && connectionStatus === 'connected') {
        outbox.queueCursorMove(x, y);
      }
    },

    updateRemoteCursor: (userId: string, x: number, y: number) => {
      const state = get();
      const user = state.users.get(userId);
      const now = Date.now();
      
      const cursors = new Map(state.cursors);
      const existing = cursors.get(userId);
      
      cursors.set(userId, {
        userId,
        x,
        y,
        displayX: existing?.displayX ?? x,
        displayY: existing?.displayY ?? y,
        lastUpdate: now,
        userName: user?.name ?? 'Unknown',
        color: user?.color ?? '#888888',
      });
      
      set({ cursors });
    },

    // =========================================================================
    // Drawing
    // =========================================================================

    startStroke: (isEraser?: boolean) => {
      const { wsClient, connectionStatus, penColor, penWidth } = get();
      
      if (!wsClient || connectionStatus !== 'connected') return;

      // Eraser uses the canvas background color
      const ERASER_COLOR = '#2a2a2a';
      const strokeColor = isEraser ? ERASER_COLOR : penColor;
      const strokeWidth = isEraser ? 20 : penWidth; // Eraser is thicker

      const strokeId = generateUUID();
      const activeStroke: Stroke = {
        strokeId,
        userId: get().userId ?? '',
        points: [],
        color: strokeColor,
        width: strokeWidth,
        complete: false,
      };

      // Send stroke start to server
      const msg = createStrokeStartMessage(strokeId, strokeColor, strokeWidth);
      wsClient.send(msg);

      set({ activeStroke, currentStrokeId: strokeId });
    },

    addStrokePoint: (x: number, y: number) => {
      const { activeStroke, outbox, currentStrokeId } = get();
      
      if (!activeStroke || !outbox || !currentStrokeId) return;

      // Add point to local stroke
      const newPoints = [...activeStroke.points, { x, y }];
      set({
        activeStroke: {
          ...activeStroke,
          points: newPoints,
        },
      });

      // Queue point for batched sending
      outbox.queueStrokePoint(currentStrokeId, x, y);
    },

    endStroke: () => {
      const { activeStroke, wsClient, outbox, currentStrokeId } = get();
      
      if (!activeStroke || !wsClient || !currentStrokeId) return;

      // Flush any pending points
      outbox?.flushStroke(currentStrokeId);

      // Send stroke end
      const msg = createStrokeEndMessage(currentStrokeId);
      wsClient.send(msg);

      // Move active stroke to completed strokes - use callback to get latest state
      const completedStroke: Stroke = {
        ...activeStroke,
        complete: true,
      };

      set((state) => ({
        strokes: [...state.strokes, completedStroke],
        activeStroke: null,
        currentStrokeId: null,
      }));
    },

    // =========================================================================
    // Settings
    // =========================================================================

    setPenColor: (color: string) => {
      set({ penColor: color });
    },

    setPenWidth: (width: number) => {
      set({ penWidth: width });
    },

    setFillColor: (color: string | null) => {
      set({ fillColor: color });
    },

    setFontSize: (size: number) => {
      set({ fontSize: size });
    },

    setActiveTool: (tool: ToolTypeValue) => {
      set({ activeTool: tool });
    },

    // =========================================================================
    // Element Operations
    // =========================================================================

    startElement: (x: number, y: number) => {
      const { activeTool, penColor, penWidth, fillColor, userId } = get();
      
      if (!userId) return;

      const elementId = generateUUID();
      let element: DrawingElement | null = null;

      switch (activeTool) {
        case ToolType.Pen:
          element = {
            id: elementId,
            type: 'stroke',
            userId,
            x: 0,
            y: 0,
            color: penColor,
            strokeWidth: penWidth,
            complete: false,
            points: [{ x, y }],
          } as StrokeElement;
          break;

        case ToolType.Line:
          element = {
            id: elementId,
            type: 'line',
            userId,
            x,
            y,
            endX: x,
            endY: y,
            color: penColor,
            strokeWidth: penWidth,
            complete: false,
          } as LineElement;
          break;

        case ToolType.Arrow:
          element = {
            id: elementId,
            type: 'arrow',
            userId,
            x,
            y,
            endX: x,
            endY: y,
            color: penColor,
            strokeWidth: penWidth,
            complete: false,
          } as ArrowElement;
          break;

        case ToolType.Rectangle:
          element = {
            id: elementId,
            type: 'rectangle',
            userId,
            x,
            y,
            width: 0,
            height: 0,
            color: penColor,
            strokeWidth: penWidth,
            fill: fillColor ?? undefined,
            complete: false,
          } as RectangleElement;
          break;

        case ToolType.Ellipse:
          element = {
            id: elementId,
            type: 'ellipse',
            userId,
            x,
            y,
            width: 0,
            height: 0,
            color: penColor,
            strokeWidth: penWidth,
            fill: fillColor ?? undefined,
            complete: false,
          } as EllipseElement;
          break;

        case ToolType.Diamond:
          element = {
            id: elementId,
            type: 'diamond',
            userId,
            x,
            y,
            width: 0,
            height: 0,
            color: penColor,
            strokeWidth: penWidth,
            fill: fillColor ?? undefined,
            complete: false,
          } as DiamondElement;
          break;

        default:
          return;
      }

      if (element) {
        set({ activeElement: element, currentElementId: elementId });
      }
    },

    updateElement: (x: number, y: number) => {
      const { activeElement } = get();
      
      if (!activeElement) return;

      let updated: DrawingElement;

      switch (activeElement.type) {
        case 'stroke': {
          const stroke = activeElement as StrokeElement;
          updated = {
            ...stroke,
            points: [...stroke.points, { x, y }],
          };
          break;
        }

        case 'line':
        case 'arrow': {
          const line = activeElement as LineElement | ArrowElement;
          updated = {
            ...line,
            endX: x,
            endY: y,
          };
          break;
        }

        case 'rectangle':
        case 'ellipse':
        case 'diamond': {
          const shape = activeElement as RectangleElement | EllipseElement | DiamondElement;
          updated = {
            ...shape,
            width: x - shape.x,
            height: y - shape.y,
          };
          break;
        }

        default:
          return;
      }

      set({ activeElement: updated });
    },

    finishElement: () => {
      const { activeElement, wsClient, outbox } = get();
      
      if (!activeElement || !wsClient) return;

      // Convert element to stroke points for syncing
      const points = elementToPoints(activeElement);
      
      if (points.length < 2) {
        set({ activeElement: null, currentElementId: null });
        return;
      }

      // Create and send stroke via backend
      const strokeId = generateUUID();
      const stroke: Stroke = {
        strokeId,
        userId: activeElement.userId,
        points,
        color: activeElement.color,
        width: activeElement.strokeWidth,
        complete: true,
      };

      // Send stroke start
      const startMsg = createStrokeStartMessage(strokeId, activeElement.color, activeElement.strokeWidth);
      wsClient.send(startMsg);

      // Send all points
      if (outbox) {
        for (const point of points) {
          outbox.queueStrokePoint(strokeId, point.x, point.y);
        }
        outbox.flushStroke(strokeId);
      }

      // Send stroke end
      const endMsg = createStrokeEndMessage(strokeId);
      wsClient.send(endMsg);

      // Add to local strokes - use callback to get latest state
      set((state) => ({
        strokes: [...state.strokes, stroke],
        activeElement: null,
        currentElementId: null,
      }));
    },

    addTextElement: (x: number, y: number, text: string) => {
      const { penColor, fontSize, userId, wsClient, outbox } = get();
      
      if (!userId || !text.trim() || !wsClient) return;

      // Use white if penColor is too dark (for visibility on dark background)
      const textColor = penColor === '#000000' ? '#ffffff' : penColor;

      // Encode text data in strokeId for syncing (workaround since backend only supports strokes)
      // Format: txt:<base64_encoded_json>
      const textData = { text: text.trim(), fontSize, x, y };
      const encodedData = btoa(JSON.stringify(textData));
      const strokeId = `txt:${encodedData}`;
      
      // Create a minimal marker stroke (we need at least 2 points for the backend)
      const points = [
        { x, y },
        { x: x + 1, y: y + 1 },
      ];

      // Send via backend
      const startMsg = createStrokeStartMessage(strokeId, textColor, 1);
      wsClient.send(startMsg);

      if (outbox) {
        for (const point of points) {
          outbox.queueStrokePoint(strokeId, point.x, point.y);
        }
        outbox.flushStroke(strokeId);
      }

      const endMsg = createStrokeEndMessage(strokeId);
      wsClient.send(endMsg);

      // Store text locally for rendering
      const element: TextElement = {
        id: strokeId,
        type: 'text',
        userId,
        x,
        y,
        text: text.trim(),
        color: textColor,
        strokeWidth: 1,
        fontSize,
        complete: true,
      };

      set((state) => ({ 
        elements: [...state.elements, element],
      }));
    },

    // =========================================================================
    // Selection Operations
    // =========================================================================

    selectObjectAt: (x: number, y: number) => {
      const { strokes, elements } = get();
      const completedStrokes = strokes.filter((s) => s.complete);
      const completedElements = elements.filter((e) => e.complete);
      const hit = hitTest(x, y, completedStrokes, completedElements);
      if (hit) {
        set({
          selectedStrokeId: hit.type === 'stroke' ? hit.id : null,
          selectedElementId: hit.type === 'element' ? hit.id : null,
        });
      } else {
        set({ selectedStrokeId: null, selectedElementId: null });
      }
    },

    moveSelectedObject: (dx: number, dy: number) => {
      const { selectedStrokeId, selectedElementId, strokes, elements } = get();
      if (selectedStrokeId) {
        const updated = strokes.map((s) => {
          if (s.strokeId !== selectedStrokeId) return s;
          return {
            ...s,
            points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
          };
        });
        set({ strokes: updated });
      } else if (selectedElementId) {
        const updated = elements.map((el) => {
          if (el.id !== selectedElementId) return el;
          const moved = { ...el, x: el.x + dx, y: el.y + dy };
          if ('endX' in el && 'endY' in el) {
            (moved as LineElement | ArrowElement).endX = el.endX + dx;
            (moved as LineElement | ArrowElement).endY = el.endY + dy;
          }
          return moved;
        });
        set({ elements: updated });
      }
    },

    sendStrokeMove: (strokeId: string, dx: number, dy: number) => {
      const { wsClient, userId } = get();
      if (!wsClient || !userId) return;
      const msg = createStrokeMoveMessage(strokeId, dx, dy);
      wsClient.send(msg);
    },

    clearSelection: () => {
      set({ selectedStrokeId: null, selectedElementId: null });
    },
  }))
);

// =============================================================================
// Ghost Cursor Cleanup
// =============================================================================

// Clean up ghost cursors every second
if (typeof window !== 'undefined') {
  setInterval(() => {
    const state = useRoomStore.getState();
    const now = Date.now();
    const cursors = new Map(state.cursors);
    let changed = false;

    for (const [userId, cursor] of cursors) {
      if (now - cursor.lastUpdate > ProtocolConstants.GhostCursorTimeoutMs * 2) {
        cursors.delete(userId);
        changed = true;
      }
    }

    if (changed) {
      useRoomStore.setState({ cursors });
    }
  }, 1000);
}

