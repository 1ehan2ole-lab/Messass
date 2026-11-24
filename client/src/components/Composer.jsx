import React, { useEffect, useRef, useState } from 'react';
import { useStore, activeConversation, conversationKey } from '../store.js';
import { emitTyping } from '../socket.js';
import Icon from './Icon.jsx';

const EMOJIS = ['😀', '😂', '🥰', '😎', '🤔', '😭', '🥳', '😴', '👍', '👎', '👏', '🙌', '🔥', '✨', '🎉', '❤️', '💯', '🚀', '🐱', '🍕', '☕', '💬', '✅', '👀'];

export default function Composer({ placeholder }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const typingTimer = useRef(null);

  const sendMessage = useStore((s) => s.sendMessage);
  const replyTo = useStore((s) => s.replyTo);
  const setReplyTo = useStore((s) => s.setReplyTo);
  const conversation = activeConversation(useStore.getState());
  const key = conversationKey(conversation);
  const reply = replyTo[key];

  useEffect(() => {
    inputRef.current?.focus();
  }, [key]);

  const onTyping = (value) => {
    emitTyping(conversation, Boolean(value));
    clearTimeout(typingTimer.current);
    if (value) typingTimer.current = setTimeout(() => emitTyping(conversation, false), 2500);
  };

  const change = (event) => {
    setText(event.target.value);
    onTyping(event.target.value);
    const el = event.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const submit = async (event) => {
    event?.preventDefault();
    if (!text.trim() && !file) return;
    await sendMessage(text.trim(), file);
    setText('');
    setFile(null);
    if (inputRef.current) inputRef.current.style.height = 'auto';
    emitTyping(conversation, false);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
    if (event.key === 'Escape' && reply) setReplyTo(conversation, null);
  };

  return (
    <div className="composer-area">
      {reply && (
        <div className="composer-reply">
          <Icon name="reply" size={16} />
          <span><strong>{reply.author.username}:</strong> {reply.content.slice(0, 80) || 'Вложение'}</span>
          <button className="mini-btn" onClick={() => setReplyTo(conversation, null)} title="Отменить ответ">
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {file && (
        <div className="composer-file">
          <Icon name="paperclip" size={16} />
          <span>{file.name}</span>
          <button className="mini-btn" onClick={() => setFile(null)}><Icon name="close" size={15} /></button>
        </div>
      )}
      <form className="composer" onSubmit={submit}>
        <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()} title="Прикрепить файл">
          <Icon name="paperclip" size={21} />
        </button>
        <input ref={fileRef} type="file" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={change}
          onKeyDown={onKeyDown}
          placeholder={placeholder || 'Написать сообщение…'}
        />
        <div className="composer-right">
          <button type="button" className="icon-btn" onClick={() => setEmojiOpen((v) => !v)} title="Эмодзи">
            <Icon name="smile" size={21} />
          </button>
          <button type="submit" className="send-btn" disabled={!text.trim() && !file} title="Отправить">
            <Icon name="send" size={19} />
          </button>
        </div>
        {emojiOpen && (
          <div className="emoji-grid">
            {EMOJIS.map((emoji) => (
              <button
                type="button"
                key={emoji}
                onClick={() => {
                  setText((current) => current + emoji);
                  inputRef.current?.focus();
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </form>
      <div className="composer-hint">Enter — отправить · Shift+Enter — новая строка</div>
    </div>
  );
}
