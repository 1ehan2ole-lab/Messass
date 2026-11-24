import React, { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { Avatar, StatusDot } from './Avatar.jsx';
import Icon from './Icon.jsx';
import { formatTime } from '../utils.jsx';

const COLORS = ['#5865f2', '#eb459e', '#57f287', '#fee75c', '#ed4245', '#00b0f4', '#9b59b6', '#e67e22'];

function Modal({ title, children, onClose, wide = false }) {
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={20} /></button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function CreateServer({ onClose }) {
  const createServer = useStore((s) => s.createServer);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  return (
    <Modal title="Создать сервер" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) createServer({ name, description, iconColor: color }); }}>
        <label className="field"><span>Название сервера</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Мой сервер" /></label>
        <label className="field"><span>Описание</span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Небольшое описание" /></label>
        <div className="field"><span>Цвет иконки</span><div className="color-picker">
          {COLORS.map((c) => <button key={c} type="button" className={color === c ? 'selected' : ''} style={{ background: c }} onClick={() => setColor(c)} />)}
        </div></div>
        <button className="primary-btn full" type="submit" disabled={!name.trim()}>Создать</button>
      </form>
    </Modal>
  );
}

function JoinServer({ onClose, initialCode }) {
  const joinServer = useStore((s) => s.joinServer);
  const [code, setCode] = useState(initialCode || '');
  return (
    <Modal title="Присоединиться к серверу" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) joinServer(code.trim()); }}>
        <p className="modal-note">Введите код приглашения, который вам дал друг.</p>
        <label className="field"><span>Код приглашения</span><input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC12DEF" /></label>
        <button className="primary-btn full" type="submit" disabled={!code.trim()}>Присоединиться</button>
      </form>
    </Modal>
  );
}

function CreateChannel({ onClose, serverId }) {
  const createChannel = useStore((s) => s.createChannel);
  const [name, setName] = useState('');
  const [type, setType] = useState('text');
  const [topic, setTopic] = useState('');
  return (
    <Modal title="Создать канал" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) createChannel(serverId, { name, type, topic }); }}>
        <div className="field"><span>Тип канала</span>
          <div className="segmented">
            <button type="button" className={type === 'text' ? 'active' : ''} onClick={() => setType('text')}><Icon name="hash" size={15} /> Текстовый</button>
            <button type="button" className={type === 'voice' ? 'active' : ''} onClick={() => setType('voice')}><Icon name="users" size={15} /> Голосовой</button>
          </div>
        </div>
        <label className="field"><span>Название</span><input autoFocus value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder="general" /></label>
        <label className="field"><span>Тема</span><input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="О чём этот канал" /></label>
        <button className="primary-btn full" type="submit" disabled={!name.trim()}>Создать канал</button>
      </form>
    </Modal>
  );
}

function InviteModal({ onClose, server }) {
  const regenerateInvite = useStore((s) => s.regenerateInvite);
  const showToast = useStore((s) => s.showToast);
  const code = server?.inviteCode || '';
  const link = `${window.location.origin}/?invite=${code}`;
  const copy = (value) => {
    navigator.clipboard?.writeText(value).then(() => showToast('Скопировано', 'success')).catch(() => showToast('Не удалось скопировать', 'error'));
  };
  return (
    <Modal title={`Пригласить в «${server?.name}»`} onClose={onClose}>
      <p className="modal-note">Отправьте код или ссылку другу. По коду можно присоединиться к серверу.</p>
      <label className="field"><span>Код приглашения</span>
        <div className="copy-row"><input readOnly value={code} /><button className="secondary-btn" onClick={() => copy(code)}><Icon name="copy" size={16} /></button></div>
      </label>
      <label className="field"><span>Ссылка</span>
        <div className="copy-row"><input readOnly value={link} /><button className="secondary-btn" onClick={() => copy(link)}><Icon name="copy" size={16} /></button></div>
      </label>
      <button className="secondary-btn full" onClick={async () => { const next = await regenerateInvite(server.id); if (next) showToast('Код обновлён', 'success'); }}>
        Создать новый код
      </button>
    </Modal>
  );
}

function ServerMenu({ onClose, server }) {
  const updateServer = useStore((s) => s.updateServer);
  const deleteServer = useStore((s) => s.deleteServer);
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description);
  const [color, setColor] = useState(server.iconColor);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <Modal title="Настройки сервера" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); updateServer(server.id, { name, description, iconColor: color }); }}>
        <label className="field"><span>Название</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Описание</span><input value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <div className="field"><span>Цвет</span><div className="color-picker">
          {COLORS.map((c) => <button key={c} type="button" className={color === c ? 'selected' : ''} style={{ background: c }} onClick={() => setColor(c)} />)}
        </div></div>
        <button className="primary-btn full" type="submit">Сохранить</button>
      </form>
      {server.ownerId === useStore.getState().user?.id && (
        <div className="danger-zone">
          {confirmDelete ? (
            <>
              <p>Удалить сервер «{server.name}»? Это нельзя отменить.</p>
              <div className="row">
                <button className="danger-btn" onClick={() => deleteServer(server.id)}>Да, удалить</button>
                <button className="secondary-btn" onClick={() => setConfirmDelete(false)}>Отмена</button>
              </div>
            </>
          ) : (
            <button className="danger-btn ghost" onClick={() => setConfirmDelete(true)}>Удалить сервер</button>
          )}
        </div>
      )}
    </Modal>
  );
}

function SettingsModal({ onClose }) {
  const user = useStore((s) => s.user);
  const updateProfile = useStore((s) => s.updateProfile);
  const showToast = useStore((s) => s.showToast);
  const [form, setForm] = useState({
    username: user.username, bio: user.bio || '', avatarColor: user.avatarColor,
    currentPassword: '', newPassword: '',
  });
  const change = (key) => (e) => setForm((c) => ({ ...c, [key]: e.target.value }));
  return (
    <Modal title="Настройки профиля" onClose={onClose} wide>
      <form onSubmit={(e) => { e.preventDefault(); updateProfile(form); }}>
        <div className="settings-preview">
          <Avatar user={{ ...user, ...form }} size={64} showStatus />
          <div><strong>{form.username}</strong><p>{form.bio || 'Расскажите о себе'}</p></div>
        </div>
        <div className="settings-grid">
          <div>
            <label className="field"><span>Имя пользователя</span><input value={form.username} onChange={change('username')} /></label>
            <label className="field"><span>О себе</span><textarea rows={3} value={form.bio} onChange={change('bio')} maxLength={200} /></label>
            <div className="field"><span>Цвет аватара</span><div className="color-picker">
              {COLORS.map((c) => <button key={c} type="button" className={form.avatarColor === c ? 'selected' : ''} style={{ background: c }} onClick={() => setForm((v) => ({ ...v, avatarColor: c }))} />)}
            </div></div>
          </div>
          <div className="settings-security">
            <h3>Безопасность</h3>
            <label className="field"><span>Текущий пароль</span><input type="password" value={form.currentPassword} onChange={change('currentPassword')} autoComplete="current-password" /></label>
            <label className="field"><span>Новый пароль</span><input type="password" value={form.newPassword} onChange={change('newPassword')} autoComplete="new-password" placeholder="Оставьте пустым, чтобы не менять" /></label>
            <p className="modal-note">Пароль меняется только если указан новый пароль.</p>
          </div>
        </div>
        <button className="primary-btn" type="submit">Сохранить изменения</button>
      </form>
      <div className="danger-zone">
        <h3>Уведомления</h3>
        <p className="modal-note">Разрешите уведомления браузера, чтобы получать сообщения, когда вкладка неактивна.</p>
        <button className="secondary-btn" onClick={async () => {
          if (!('Notification' in window)) return showToast('Уведомления не поддерживаются', 'error');
          const permission = await Notification.requestPermission();
          showToast(permission === 'granted' ? 'Уведомления включены' : 'Уведомления отклонены', permission === 'granted' ? 'success' : 'error');
        }}>Включить уведомления</button>
      </div>
    </Modal>
  );
}

function NewDm({ onClose }) {
  const createDm = useStore((s) => s.createDm);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  useEffect(() => {
    if (query.trim().length < 2) return setUsers([]);
    let alive = true;
    api.searchUsers(query).then((r) => alive && setUsers(r.users)).catch(() => {});
    return () => { alive = false; };
  }, [query]);
  return (
    <Modal title="Новое личное сообщение" onClose={onClose}>
      <label className="field"><span>Найти пользователя</span><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Имя или email" /></label>
      <div className="user-results">
        {query.trim().length < 2 && <p className="empty-hint">Введите минимум 2 символа</p>}
        {users.map((user) => (
          <button key={user.id} className="user-result" onClick={() => createDm(user.id)}>
            <Avatar user={user} size={38} showStatus />
            <span><strong>{user.username}</strong><small>{user.bio || 'Пользователь Messass'}</small></span>
            <Icon name="dm" size={18} />
          </button>
        ))}
        {query.trim().length >= 2 && users.length === 0 && <p className="empty-hint">Никого не найдено</p>}
      </div>
    </Modal>
  );
}

function SearchModal({ onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (query.trim().length < 2) return setResults([]);
    let alive = true;
    api.search(query).then((r) => alive && setResults(r.messages)).catch(() => {});
    return () => { alive = false; };
  }, [query]);
  return (
    <Modal title="Поиск по сообщениям" onClose={onClose} wide>
      <label className="field"><span>Запрос</span><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Что ищете?" /></label>
      <div className="search-results">
        {results.map((message) => (
          <div key={message.id} className="search-result">
            <Avatar user={message.author} size={32} />
            <div><strong>{message.author.username}</strong><span className="message-time">{formatTime(message.createdAt)}</span>
              <p>{message.content || 'Вложение'}</p></div>
          </div>
        ))}
        {query.trim().length >= 2 && results.length === 0 && <p className="empty-hint">Ничего не найдено</p>}
      </div>
    </Modal>
  );
}

function ProfileModal({ onClose, user: profile }) {
  const [dm, setDm] = useState([]);
  const createDm = useStore((s) => s.createDm);
  const status = useStore((s) => s.presence[profile?.id]?.status || profile?.status);
  const [bio, setBio] = useState(profile?.bio || '');
  const [saved, setSaved] = useState(false);
  const updateProfile = useStore((s) => s.updateProfile);
  const me = useStore((s) => s.user);
  const isMe = me?.id === profile?.id;
  return (
    <Modal title="Профиль" onClose={onClose}>
      <div className="profile-card">
        <Avatar user={{ ...profile, status }} size={72} showStatus />
        <h3>{profile.username}</h3>
        <p className="profile-status"><StatusDot status={status} /> {status === 'online' ? 'В сети' : status === 'idle' ? 'Нет на месте' : status === 'dnd' ? 'Не беспокоить' : 'Не в сети'}</p>
        {isMe ? (
          <form onSubmit={(e) => { e.preventDefault(); updateProfile({ bio }); setSaved(true); }}>
            <label className="field"><span>О себе</span><textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={200} /></label>
            <button className="primary-btn full" type="submit">{saved ? 'Сохранено' : 'Сохранить'}</button>
          </form>
        ) : (
          <>
            <p className="profile-bio">{profile.bio || 'Пользователь пока не рассказал о себе.'}</p>
            <button className="primary-btn full" onClick={() => createDm(profile.id)}><Icon name="dm" size={17} /> Написать сообщение</button>
          </>
        )}
      </div>
    </Modal>
  );
}

function MemberModal({ onClose, member, server }) {
  const viewer = useStore((s) => s.user);
  const updateMemberRole = useStore((s) => s.updateMemberRole);
  const kickMember = useStore((s) => s.kickMember);
  const createDm = useStore((s) => s.createDm);
  const status = useStore((s) => s.presence[member.id]?.status || member.status);
  const viewerRole = server.ownerId === viewer?.id ? 'owner' : server.members?.find((m) => m.id === viewer?.id)?.role;
  const canManage = ['owner', 'admin'].includes(viewerRole) && member.id !== server.ownerId && member.id !== viewer?.id;
  return (
    <Modal title="Участник" onClose={onClose}>
      <div className="profile-card">
        <Avatar user={{ ...member, status }} size={64} showStatus />
        <h3>{member.username}</h3>
        <p className="profile-status"><StatusDot status={status} /> {status === 'online' ? 'В сети' : 'Не в сети'}</p>
        {member.id !== viewer?.id && <button className="primary-btn full" onClick={() => createDm(member.id)}><Icon name="dm" size={17} /> Написать сообщение</button>}
      </div>
      {canManage && (
        <div className="member-manage">
          <div className="field"><span>Роль</span>
            <div className="segmented">
              <button className={member.role === 'member' ? 'active' : ''} onClick={() => updateMemberRole(server.id, member.id, 'member')}>Участник</button>
              <button className={member.role === 'admin' ? 'active' : ''} onClick={() => updateMemberRole(server.id, member.id, 'admin')}>Администратор</button>
            </div>
          </div>
          <button className="danger-btn ghost full" onClick={() => kickMember(server.id, member.id)}>Исключить с сервера</button>
        </div>
      )}
    </Modal>
  );
}

function ConfirmDelete({ onClose, messageId }) {
  const deleteMessage = useStore((s) => s.deleteMessage);
  return (
    <Modal title="Удалить сообщение?" onClose={onClose}>
      <p className="modal-note">Сообщение будет удалено для всех участников беседы.</p>
      <div className="row">
        <button className="danger-btn" onClick={() => { deleteMessage(messageId); onClose(); }}>Удалить</button>
        <button className="secondary-btn" onClick={onClose}>Отмена</button>
      </div>
    </Modal>
  );
}

function DeleteDm({ onClose, dm }) {
  const deleteDm = useStore((s) => s.deleteDm);
  return (
    <Modal title="Удалить чат?" onClose={onClose}>
      <p className="modal-note">Чат с «{dm.user.username}» будет удалён только у вас.</p>
      <div className="row">
        <button className="danger-btn" onClick={() => deleteDm(dm.id)}>Удалить</button>
        <button className="secondary-btn" onClick={onClose}>Отмена</button>
      </div>
    </Modal>
  );
}

function DeleteChannel({ onClose, channel, serverId }) {
  const deleteChannel = useStore((s) => s.deleteChannel);
  return (
    <Modal title="Удалить канал?" onClose={onClose}>
      <p className="modal-note">Канал «{channel.name}» и все его сообщения будут удалены.</p>
      <div className="row">
        <button className="danger-btn" onClick={() => deleteChannel(serverId, channel.id)}>Удалить</button>
        <button className="secondary-btn" onClick={onClose}>Отмена</button>
      </div>
    </Modal>
  );
}

export default function Modals() {
  const modal = useStore((s) => s.modal);
  const modalData = useStore((s) => s.modalData);
  const closeModal = useStore((s) => s.closeModal);
  const servers = useStore((s) => s.servers);
  const activeServer = servers.find((s) => s.id === useStore.getState().activeServerId);
  if (!modal) return null;

  switch (modal) {
    case 'createServer': return <CreateServer onClose={closeModal} />;
    case 'joinServer': {
      const code = modalData || new URLSearchParams(window.location.search).get('invite') || '';
      return <JoinServer onClose={closeModal} initialCode={code} />;
    }
    case 'createChannel': return <CreateChannel onClose={closeModal} serverId={activeServer?.id} />;
    case 'invite': return <InviteModal onClose={closeModal} server={modalData || activeServer} />;
    case 'serverMenu': return <ServerMenu onClose={closeModal} server={modalData || activeServer} />;
    case 'settings': return <SettingsModal onClose={closeModal} />;
    case 'newDm': return <NewDm onClose={closeModal} />;
    case 'search': return <SearchModal onClose={closeModal} />;
    case 'profile': return <ProfileModal onClose={closeModal} user={modalData} />;
    case 'member': return <MemberModal onClose={closeModal} member={modalData?.member} server={modalData?.server} />;
    case 'confirmDelete': return <ConfirmDelete onClose={closeModal} messageId={modalData?.messageId} />;
    case 'deleteDm': return <DeleteDm onClose={closeModal} dm={modalData} />;
    case 'deleteChannel': return <DeleteChannel onClose={closeModal} channel={modalData} serverId={activeServer?.id} />;
    default: return null;
  }
}
