/**
 * React hook for WebSocket connection management.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useRoomStore } from '../store/roomStore';
import { useConnectionStatus, useLastError } from '../store/selectors';

interface UseWebSocketOptions {
  wsUrl?: string;
  autoConnect?: boolean;
}

interface UseWebSocketReturn {
  connectionStatus: ReturnType<typeof useConnectionStatus>;
  lastError: ReturnType<typeof useLastError>;
  connect: (roomId: string, userName: string, password?: string) => void;
  disconnect: () => void;
  isConnected: boolean;
}

function getDefaultWsUrl(): string {
  // Use VITE_WS_URL in production (set at build time)
  const envUrl = import.meta.env.VITE_WS_URL;
  if (typeof envUrl === 'string' && envUrl) return envUrl;
  return 'ws://localhost:8080';
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { wsUrl = getDefaultWsUrl() } = options;
  
  const connectionStatus = useConnectionStatus();
  const lastError = useLastError();
  const storeConnect = useRoomStore((state) => state.connect);
  const storeDisconnect = useRoomStore((state) => state.disconnect);
  
  const wsUrlRef = useRef(wsUrl);
  wsUrlRef.current = wsUrl;

  const connect = useCallback((roomId: string, userName: string, password?: string) => {
    storeConnect(wsUrlRef.current, roomId, userName, password);
  }, [storeConnect]);

  const disconnect = useCallback(() => {
    storeDisconnect();
  }, [storeDisconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't disconnect on unmount - let the store handle lifecycle
    };
  }, []);

  return {
    connectionStatus,
    lastError,
    connect,
    disconnect,
    isConnected: connectionStatus === 'connected',
  };
}

/**
 * Hook that provides just the connection state.
 */
export function useConnectionState() {
  const connectionStatus = useConnectionStatus();
  const lastError = useLastError();
  
  return {
    status: connectionStatus,
    error: lastError,
    isConnected: connectionStatus === 'connected',
    isConnecting: connectionStatus === 'connecting',
    isDisconnected: connectionStatus === 'disconnected',
    hasError: connectionStatus === 'error' || lastError !== null,
  };
}

