import React from 'react';

const statusColors = {
  online: '#23a55a',
  idle: '#f0b232',
  dnd: '#f23f43',
  invisible: '#80848e',
  offline: '#80848e',
};

export function Avatar({ user, size = 36, showStatus = false, onClick, title }) {
  if (!user) return null;
  const initials = (user.username || '?').slice(0, 2).toUpperCase();
  return (
    <button
      type="button"
      className={`avatar-wrap ${onClick ? 'clickable' : ''}`}
      style={{ width: size, height: size }}
      onClick={onClick}
      title={title}
      tabIndex={onClick ? 0 : -1}
    >
      <span className="avatar" style={{ background: user.avatarColor || '#5865f2', fontSize: size * 0.36 }}>
        {initials}
      </span>
      {showStatus && (
        <span
          className="status-dot"
          style={{ background: statusColors[user.status] || statusColors.offline, width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </button>
  );
}

export function StatusDot({ status, size = 10 }) {
  return <span className="status-dot static" style={{ background: statusColors[status] || statusColors.offline, width: size, height: size }} />;
}

export { statusColors };
