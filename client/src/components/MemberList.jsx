import React from 'react';
import { useStore } from '../store.js';
import { Avatar } from './Avatar.jsx';
import Icon from './Icon.jsx';

const ROLE_LABELS = { owner: 'Владелец', admin: 'Администратор', member: 'Участник' };

export default function MemberList({ server }) {
  const presence = useStore((s) => s.presence);
  const user = useStore((s) => s.user);
  const openModal = useStore((s) => s.openModal);
  const viewerRole = server.ownerId === user?.id ? 'owner' : server.members?.find((m) => m.id === user?.id)?.role;

  const sorted = [...(server.members || [])].sort((a, b) => {
    const online = (m) => (presence[m.id]?.status || m.status) === 'online' ? 0 : 1;
    return online(a) - online(b) || a.username.localeCompare(b.username);
  });

  return (
    <aside className="members-panel">
      <h3>Участники — {sorted.length}</h3>
      <div className="members-scroll">
        {sorted.map((member) => {
          const status = presence[member.id]?.status || member.status;
          return (
            <button
              key={member.id}
              className="member-row"
              onClick={() => openModal('member', { member, server })}
            >
              <Avatar user={{ ...member, status }} size={34} showStatus />
              <span className="member-info">
                <strong className={member.id === user?.id ? 'self' : ''}>
                  {member.username}{member.id === server.ownerId && <Icon name="shield" size={13} className="owner-icon" />}
                </strong>
                <small>{ROLE_LABELS[member.role] || 'Участник'} · {status === 'online' ? 'в сети' : 'не в сети'}</small>
              </span>
            </button>
          );
        })}
      </div>
      {['owner', 'admin'].includes(viewerRole) && (
        <button className="panel-action" onClick={() => openModal('invite', server)}>
          <Icon name="plus" size={16} /> Пригласить участника
        </button>
      )}
    </aside>
  );
}
