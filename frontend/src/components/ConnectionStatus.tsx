/**
 * Connection status indicator component.
 * Shows WebSocket connection health.
 */

import { useConnectionState } from '../hooks/useWebSocket';

export function ConnectionStatus() {
  const { status, error, isConnecting } = useConnectionState();

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'var(--success)';
      case 'connecting':
        return 'var(--warning)';
      case 'error':
        return 'var(--error)';
      default:
        return 'var(--text-muted)';
    }
  };

  const getStatusText = () => {
    if (error) return error;
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Connection Error';
      default:
        return 'Disconnected';
    }
  };

  return (
    <div className="connection-status">
      <div
        className={`status-indicator ${isConnecting ? 'pulse' : ''}`}
        style={{ backgroundColor: getStatusColor() }}
      />
      <span className="status-text">{getStatusText()}</span>
    </div>
  );
}

