import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, activeConversation, conversationKey } from '../store.js';
import Message from './Message.jsx';
import Composer from './Composer.jsx';
import MemberList from './MemberList.jsx';
import { Avatar } from './Avatar.jsx';
import Icon from './Icon.jsx';
import { formatDate } from '../utils.jsx';

export default function ChatView() {
  const servers = useStore((s) => s.servers);
  const activeServerId = useStore((s) => s.activeServerId);
  const activeChannelId = useStore((s) => s.activeChannelId);
  const activeDmId = useStore((s) => s.activeDmId);
  const dms = useStore((s) => s.dms);
  const messages = useStore((s) => s.messages);
  const hasMore = useStore((s) => s.hasMore);
  const typing = useStore((s) => s.typing);
  const presence = useStore((s) => s.presence);
  const openModal = useStore((s) => s.openModal);
  const loadMessages = useStore((s) => s.loadMessages);

  const [showMembers, setShowMembers] = useState(true);
  const listRef = useRef(null);
  const pinnedBottom = useRef(true);

  const server = servers.find((s) => s.id === activeServerId);
  const channel = server?.channels?.find((c) => c.id === activeChannelId);
  const dm = dms.find((d) => d.id === activeDmId);
  const conversation = activeConversation(useStore.getState());
  const key = conversationKey(conversation);
  const list = messages[key] || [];
  const typingUser = typing[key];

  const title = dm ? dm.user.username : channel ? `# ${channel.name}` : 'Выберите канал';
  const subtitle = channel?.topic || (dm ? 'Личная беседа' : '');
  const titleStatus = dm ? presence[dm.user.id]?.status || dm.user.status : null;

  const dateGroups = useMemo(() => {
    const groups = [];
    let currentDate = null;
    list.forEach((message, index) => {
      const date = new Date(message.createdAt).toDateString();
      if (date !== currentDate) {
        currentDate = date;
        groups.push({ date: message.createdAt, messages: [] });
      }
      const previous = list[index - 1];
      const grouped = Boolean(
        previous &&
        previous.author.id === message.author.id &&
        new Date(message.createdAt) - new Date(previous.createdAt) < 5 * 60 * 1000 &&
        date === new Date(previous.createdAt).toDateString() &&
        !message.replyTo,
      );
      groups[groups.length - 1].messages.push({ message, grouped });
    });
    return groups;
  }, [list]);

  useEffect(() => {
    const el = listRef.current;
    if (el && pinnedBottom.current) el.scrollTop = el.scrollHeight;
  }, [list.length, key]);

  useEffect(() => {
    pinnedBottom.current = true;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [key]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    pinnedBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (el.scrollTop < 60 && hasMore[key] && list.length) {
      loadMessages(conversation, list[0].id);
    }
  };

  return (
    <section className="chat-view">
      <header className="chat-header">
        <div className="chat-title">
          {dm && <Avatar user={{ ...dm.user, status: titleStatus }} size={34} showStatus />}
          {channel && <span className="header-hash"><Icon name="hash" size={22} /></span>}
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
        </div>
        <div className="chat-header-actions">
          <button className="icon-btn" onClick={() => openModal('search')} title="Поиск по сообщениям">
            <Icon name="search" size={20} />
          </button>
          {server && (
            <button className="icon-btn" onClick={() => openModal('invite', server)} title="Пригласить">
              <Icon name="users" size={20} />
            </button>
          )}
          <button
            className={`icon-btn ${showMembers ? 'toggled' : ''}`}
            onClick={() => setShowMembers((v) => !v)}
            title="Список участников"
          >
            <Icon name="spy" size={20} />
          </button>
        </div>
      </header>

      <div className="chat-main">
        <div className="messages-scroll" ref={listRef} onScroll={onScroll}>
          {hasMore[key] && (
            <button className="load-more" onClick={() => loadMessages(conversation, list[0]?.id)}>
              Загрузить предыдущие сообщения
            </button>
          )}
          {!list.length && (
            <div className="empty-chat">
              <div className="empty-chat-icon"><Icon name={dm ? 'dm' : 'hash'} size={38} /></div>
              <h3>{dm ? `Начните беседу с ${dm.user.username}` : `Добро пожаловать в #${channel?.name || 'канал'}`}</h3>
              <p>Это начало переписки. Отправьте первое сообщение!</p>
            </div>
          )}
          {dateGroups.map((group) => (
            <React.Fragment key={group.date}>
              <div className="date-divider"><span>{formatDate(group.date)}</span></div>
              {group.messages.map(({ message, grouped }) => (
                <Message key={message.id} message={message} grouped={grouped} />
              ))}
            </React.Fragment>
          ))}
        </div>
        {showMembers && server && <MemberList server={server} />}
        {showMembers && dm && (
          <aside className="members-panel">
            <h3>Участники</h3>
            <div className="member-row">
              <Avatar user={{ ...dm.user, status: titleStatus }} size={34} showStatus />
              <span>{dm.user.username}</span>
            </div>
          </aside>
        )}
      </div>

      <div className="chat-bottom">
        {typingUser && (
          <div className="typing-indicator">
            <span className="typing-dots"><i /><i /><i /></span>
            {typingUser.username} печатает…
          </div>
        )}
        <Composer placeholder={dm ? `Сообщение для ${dm.user.username}` : `Сообщение в #${channel?.name || 'канал'}`} />
      </div>
    </section>
  );
}
