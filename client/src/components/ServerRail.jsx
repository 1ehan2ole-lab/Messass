import React from 'react';
import { useStore } from '../store.js';
import Icon from './Icon.jsx';

export default function ServerRail() {
  const servers = useStore((s) => s.servers);
  const activeServerId = useStore((s) => s.activeServerId);
  const activeDmId = useStore((s) => s.activeDmId);
  const unread = useStore((s) => s.unread);
  const selectServer = useStore((s) => s.selectServer);
  const selectDmHome = useStore((s) => s.selectDmHome);
  const openModal = useStore((s) => s.openModal);

  const serverUnread = (server) =>
    (server.channels || []).reduce((sum, channel) => sum + (unread[`channel:${channel.id}`] || 0), 0);
  const dmUnread = Object.entries(unread)
    .filter(([key]) => key.startsWith('dm:'))
    .reduce((sum, [, count]) => sum + count, 0);

  return (
    <nav className="server-rail" aria-label="Серверы">
      <button
        className={`rail-button home ${!activeServerId && !activeDmId ? 'active' : ''}`}
        onClick={selectDmHome}
        title="Личные сообщения"
      >
        <Icon name="dm" size={24} />
        {dmUnread > 0 && <span className="rail-badge">{dmUnread}</span>}
      </button>
      <div className="rail-divider" />
      <div className="rail-scroll">
        {servers.map((server) => {
          const count = serverUnread(server);
          return (
            <button
              key={server.id}
              className={`rail-button ${activeServerId === server.id ? 'active' : ''}`}
              style={{ '--rail-color': server.iconColor }}
              onClick={() => selectServer(server.id)}
              title={server.name}
            >
              <span className="rail-initial">{server.name.slice(0, 1).toUpperCase()}</span>
              {count > 0 && <span className="rail-badge">{count}</span>}
            </button>
          );
        })}
        <button className="rail-button add" onClick={() => openModal('createServer')} title="Создать сервер">
          <Icon name="plus" size={24} />
        </button>
        <button className="rail-button add" onClick={() => openModal('joinServer')} title="Присоединиться по коду">
          <Icon name="spy" size={22} />
        </button>
      </div>
    </nav>
  );
}
