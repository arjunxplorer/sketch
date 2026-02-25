/**
 * Modal for joining a room.
 */

import { useState, FormEvent } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

interface JoinModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

export function JoinModal({ isOpen, onClose }: JoinModalProps) {
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const { connect, connectionStatus, lastError } = useWebSocket();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    
    if (!roomId.trim() || !userName.trim()) {
      return;
    }

    connect(roomId.trim(), userName.trim(), password || undefined);
  };

  const isLoading = connectionStatus === 'connecting';

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <h2>Join Room</h2>
          <p className="modal-subtitle">Enter a room to start collaborating</p>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="roomId">Room ID</label>
            <input
              id="roomId"
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter room ID or create new"
              autoFocus
              disabled={isLoading}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="userName">Your Name</label>
            <input
              id="userName"
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your display name"
              disabled={isLoading}
              required
              maxLength={20}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">
              Password <span className="optional">(optional)</span>
            </label>
            <div className="password-input">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Room password"
                disabled={isLoading}
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {lastError && (
            <div className="form-error">
              {lastError}
            </div>
          )}

          <div className="form-actions">
            {onClose && (
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                disabled={isLoading}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="btn-primary"
              disabled={isLoading || !roomId.trim() || !userName.trim()}
            >
              {isLoading ? (
                <>
                  <span className="spinner" />
                  Joining...
                </>
              ) : (
                'Join Room'
              )}
            </button>
          </div>
        </form>

        <div className="modal-footer">
          <p>
            Tip: Share the room ID with others to collaborate together
          </p>
        </div>
      </div>
    </div>
  );
}

