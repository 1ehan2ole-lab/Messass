import React, { useState } from 'react';
import { useStore } from '../store.js';
import { Avatar, StatusDot } from './Avatar.jsx';
import Icon from './Icon.jsx';

function ServerSidebar({ server }) {
  const activeChannelId = useStore((s) => s.activeChannelId);
  const unread = useStore((s) => s.unread);
  const user = useStore((s) => s.user);
  const selectChannel = useStore((s) => s.loadMessages);
  const setActive = useStore((s) => s.setActiveChannel);
  const openModal = useStore((s) => s.openModal);
  const canManage = server.ownerId === user?.id || server.members?.find((m) => m.id === user?.id)?.role === 'admin';

  const openChannel = (channel) => {
    setActive(channel.id);
    selectChannel({ channelId: channel.id });
  };

  return (
    <>
      <header className="sidebar-header">
        <div>
          <h2>{server.name}</h2>
          {server.description && <p>{server.description}</p>}
        </div>
        <button className="icon-btn" onClick={() => openModal('serverMenu')} title="Меню сервера">
          <Icon name="chevron" size={20} />
        </button>
      </header>

      <div className="sidebar-scroll">
        <div className="section-label">
          <span>КАНАЛЫ</span>
          {canManage && (
            <button className="mini-btn" onClick={() => openModal('createChannel')} title="Создать канал">
              <Icon name="plus" size={16} />
            </button>
          )}
        </div>
        {(server.channels || []).map((channel) => {
          const count = unread[`channel:${channel.id}`] || 0;
          return (
            <button
              key={channel.id}
              className={`sidebar-item ${activeChannelId === channel.id ? 'active' : ''} ${count ? 'has-unread' : ''}`}
              onClick={() => openChannel(channel)}
              onContextMenu={(event) => {
                event.preventDefault();
                if (canManage && channel.name !== 'general') openModal('deleteChannel', channel);
              }}
            >
              <Icon name={channel.type === 'voice' ? 'users' : 'hash'} size={18} />
              <span className="item-name">{channel.name}</span>
              {count > 0 && <span className="unread-pill">{count > 99 ? '99+' : count}</span>}
            </button>
          );
        })}
        <div className="section-label with-gap">
          <span>ИНВИТЕ</span>
          {canManage && (
            <button className="mini-btn" onClick={() => openModal('invite', server)} title="Пригласить друзей">
              <Icon name="plus" size={16} />
            </button>
          )}
        </div>
        <button className="sidebar-item ghost" onClick={() => openModal('invite', server)}>
          <Icon name="users" size={18} />
          <span className="item-name">Пригласить друзей</span>
        </button>
      </div>
    </>
  );
}

function DmSidebar() {
  const dms = useStore((s) => s.dms);
  const activeDmId = useStore((s) => s.activeDmId);
  const unread = useStore((s) => s.unread);
  const presence = useStore((s) => s.presence);
  const selectDm = useStore((s) => s.selectDm);
  const openModal = useStore((s) => s.openModal);

  return (
    <>
      <header className="sidebar-header">
        <div>
          <h2>Личные сообщения</h2>
        </div>
        <button className="icon-btn" onClick={() => openModal('newDm')} title="Новое сообщение">
          <Icon name="plus" size={20} />
        </button>
      </header>
      <div className="sidebar-scroll">
        <button className="sidebar-item ghost" onClick={() => openModal('newDm')}>
          <Icon name="plus" size={18} />
          <span className="item-name">Новое сообщение</span>
        </button>
        <div className="section-label"><span>ЧАТЫ</span></div>
        {dms.length === 0 && <p className="empty-hint">Пока нет личных чатов. Нажми «+», чтобы начать.</p>}
        {dms.map((dm) => {
          const count = unread[`dm:${dm.id}`] || 0;
          const status = presence[dm.user.id]?.status || dm.user.status;
          return (
            <button
              key={dm.id}
              className={`sidebar-item dm-item ${activeDmId === dm.id ? 'active' : ''} ${count ? 'has-unread' : ''}`}
              onClick={() => selectDm(dm.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                openModal('deleteDm', dm);
              }}
            >
              <span className="dm-avatar"><Avatar user={{ ...dm.user, status }} size={32} showStatus /></span>
              <span className="item-name">{dm.user.username}</span>
              {count > 0 && <span className="unread-pill">{count > 99 ? '99+' : count}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

function UserPanel() {
  const user = useStore((s) => s.user);
  const presence = useStore((s) => s.presence);
  const setPresence = useStore((s) => s.setPresence);
  const openModal = useStore((s) => s.openModal);
  const logout = useStore((s) => s.logout);
  const [statusOpen, setStatusOpen] = useState(false);
  const status = presence[user?.id]?.status || user?.status || 'online';

  const statuses = [
    ['online', 'В сети'],
    ['idle', 'Нет на месте'],
    ['dnd', 'Не беспокоить'],
    ['invisible', 'Невидимый'],
  ];

  return (
    <div className="user-panel">
      {statusOpen && (
        <div className="status-menu">
          {statuses.map(([value, label]) => (
            <button key={value} onClick={() => { setPresence(value); setStatusOpen(false); }}>
              <StatusDot status={value} /> {label}
            </button>
          ))}
          <div className="status-menu-divider" />
          <button onClick={() => { logout(); setStatusOpen(false); }}>
            <Icon name="logout" size={14} /> Выйти
          </button>
        </div>
      )}
      <button className="user-panel-main" onClick={() => setStatusOpen((v) => !v)}>
        <Avatar user={{ ...user, status }} size={36} showStatus />
        <span className="user-panel-info">
          <strong>{user?.username}</strong>
          <small>{statuses.find(([value]) => value === status)?.[1] || 'В сети'}</small>
        </span>
      </button>
      <button className="icon-btn" onClick={() => openModal('settings')} title="Настройки">
        <Icon name="settings" size={19} />
      </button>
    </div>
  );
}

export default function Sidebar() {
  const servers = useStore((s) => s.servers);
  const activeServerId = useStore((s) => s.activeServerId);
  const server = servers.find((s) => s.id === activeServerId);

  return (
    <aside className="sidebar">
      {server ? <ServerSidebar server={server} /> : <DmSidebar />}
      <UserPanel />
    </aside>
  );
}
