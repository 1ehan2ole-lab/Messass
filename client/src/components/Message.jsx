import React, { useState } from 'react';
import { useStore, activeConversation, conversationKey } from '../store.js';
import { Avatar } from './Avatar.jsx';
import Icon from './Icon.jsx';
import { formatTime, formatSize, renderContent } from '../utils.jsx';

const QUICK_REACTIONS = ['👍', '❤️', '😄', '🎉', '👀', '🔥'];

export default function Message({ message, grouped }) {
  const user = useStore((s) => s.user);
  const showModal = useStore((s) => s.openModal);
  const react = useStore((s) => s.react);
  const setReplyTo = useStore((s) => s.setReplyTo);
  const editMessage = useStore((s) => s.editMessage);
  const deleteMessage = useStore((s) => s.deleteMessage);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  const mine = message.author.id === user?.id;
  const conversation = activeConversation(useStore.getState());
  const replyTarget = useStore((s) => s.replyTo[conversationKey(conversation)]);

  const saveEdit = () => {
    if (!draft.trim()) return;
    editMessage(message.id, draft.trim());
    setEditing(false);
  };

  return (
    <div className={`message ${grouped ? 'grouped' : ''} ${mine ? 'mine' : ''}`}>
      <div className="message-avatar">
        {!grouped && <Avatar user={message.author} size={38} onClick={() => showModal('profile', message.author)} />}
      </div>
      <div className="message-body">
        {!grouped && (
          <div className="message-head">
            <button className="author-name" onClick={() => showModal('profile', message.author)}>
              {message.author.username}
            </button>
            <span className="message-time">{formatTime(message.createdAt)}</span>
            {message.editedAt && <span className="edited">(изменено)</span>}
          </div>
        )}
        {message.replyTo && (
          <button className="reply-preview" onClick={() => showModal('profile', message.replyTo.author)}>
            <span className="reply-line" />
            <strong>{message.replyTo.author.username}</strong>
            <span>{message.replyTo.content || 'Вложение'}</span>
          </button>
        )}
        {editing ? (
          <div className="edit-box">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit();
                if (e.key === 'Escape') setEditing(false);
              }}
            />
            <button className="mini-btn" onClick={saveEdit} title="Сохранить"><Icon name="check" size={16} /></button>
            <button className="mini-btn" onClick={() => setEditing(false)} title="Отмена"><Icon name="close" size={16} /></button>
          </div>
        ) : (
          <>
            {message.content && <div className="message-text">{renderContent(message.content)}</div>}
            {message.attachment && (
              /^image\//.test(message.attachment.type || '') ? (
                <a href={message.attachment.url} target="_blank" rel="noreferrer" className="message-image">
                  <img src={message.attachment.url} alt={message.attachment.name} loading="lazy" />
                </a>
              ) : (
                <a href={message.attachment.url} target="_blank" rel="noreferrer" className="file-card">
                  <span className="file-icon"><Icon name="file" size={22} /></span>
                  <span className="file-info">
                    <strong>{message.attachment.name}</strong>
                    <small>{formatSize(message.attachment.size)}</small>
                  </span>
                  <Icon name="reply" size={16} className="file-download" />
                </a>
              )
            )}
          </>
        )}

        {Object.entries(message.reactions || {}).length > 0 && (
          <div className="reactions">
            {Object.entries(message.reactions).map(([emoji, users]) => (
              <button
                key={emoji}
                className={`reaction ${users.includes(user?.id) ? 'selected' : ''}`}
                onClick={() => react(message.id, emoji)}
                title={users.map((id) => (id === user?.id ? 'Вы' : `Пользователь ${id}`)).join(', ')}
              >
                <span>{emoji}</span> {users.length}
              </button>
            ))}
            <button className="reaction add" onClick={() => setEmojiOpen((v) => !v)} title="Добавить реакцию">
              <Icon name="smile" size={14} />
            </button>
          </div>
        )}

        {emojiOpen && (
          <div className="emoji-popover">
            {QUICK_REACTIONS.map((emoji) => (
              <button key={emoji} onClick={() => { react(message.id, emoji); setEmojiOpen(false); }}>{emoji}</button>
            ))}
          </div>
        )}
      </div>

      <div className="message-actions">
        <button onClick={() => setEmojiOpen((v) => !v)} title="Реакция"><Icon name="smile" size={18} /></button>
        <button onClick={() => setReplyTo(conversation, replyTarget?.id === message.id ? null : message)} title="Ответить">
          <Icon name="reply" size={18} />
        </button>
        {mine && <button onClick={() => { setDraft(message.content); setEditing(true); }} title="Изменить"><Icon name="edit" size={18} /></button>}
        {(mine || (conversation?.channelId && (() => {
          const server = useStore.getState().servers.find((s) => s.id === useStore.getState().activeServerId);
          return server?.ownerId === user?.id || server?.members?.find((m) => m.id === user?.id)?.role === 'admin';
        })())) && (
          <button className="danger" onClick={() => showModal('confirmDelete', { messageId: message.id })} title="Удалить">
            <Icon name="trash" size={18} />
          </button>
        )}
        <button onClick={() => setMenuOpen((v) => !v)} title="Ещё"><Icon name="more" size={18} /></button>
        {menuOpen && (
          <div className="message-menu">
            <button onClick={() => { navigator.clipboard?.writeText(message.content); setMenuOpen(false); }}>Копировать текст</button>
            <button onClick={() => { react(message.id, '👍'); setMenuOpen(false); }}>👍 Быстрая реакция</button>
            <button onClick={() => { setReplyTo(conversation, message); setMenuOpen(false); }}>Ответить</button>
          </div>
        )}
      </div>
    </div>
  );
}
