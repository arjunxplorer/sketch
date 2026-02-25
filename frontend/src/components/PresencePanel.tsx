/**
 * Panel showing online users in the room.
 */

import { useState } from 'react';
import { useUsers, useUserColor, useUserName, useUserCount } from '../store/selectors';
import { ProtocolConstants } from '../lib/protocol';

export function PresencePanel() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const users = useUsers();
  const myColor = useUserColor();
  const myName = useUserName();
  const userCount = useUserCount();

  return (
    <div className={`presence-panel ${isCollapsed ? 'collapsed' : ''}`}>
      <button
        className="panel-toggle"
        onClick={() => setIsCollapsed(!isCollapsed)}
        title={isCollapsed ? 'Expand' : 'Collapse'}
      >
        {isCollapsed ? '◀' : '▶'}
      </button>

      {!isCollapsed && (
        <div className="panel-content">
          <div className="panel-header">
            <h3>
              Users
              <span className="user-count">
                {userCount}/{ProtocolConstants.MaxUsersPerRoom}
              </span>
            </h3>
          </div>

          <div className="user-list">
            {/* Current user first */}
            {myName && (
              <div className="user-item current-user">
                <div
                  className="user-avatar"
                  style={{ backgroundColor: myColor ?? '#888' }}
                >
                  {myName.charAt(0).toUpperCase()}
                </div>
                <div className="user-info">
                  <span className="user-name">{myName}</span>
                  <span className="user-badge">You</span>
                </div>
              </div>
            )}

            {/* Other users */}
            {users.map((user) => (
              <div key={user.userId} className="user-item">
                <div
                  className="user-avatar"
                  style={{ backgroundColor: user.color }}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="user-info">
                  <span className="user-name">{user.name}</span>
                </div>
              </div>
            ))}

            {users.length === 0 && myName && (
              <div className="empty-state">
                <p>You're the only one here</p>
                <p className="hint">Share the room ID to invite others</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

