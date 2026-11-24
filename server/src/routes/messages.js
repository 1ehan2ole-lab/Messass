import { Router } from 'express';
import { db, now } from '../db.js';
import { requireAuth } from '../auth.js';
import { serializeMessage } from '../serialize.js';
import { upload, fileUrl } from '../upload.js';
import { isMember, canManage } from './servers.js';

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

function conversationFor(req, body = {}) {
  const channelId = body.channelId ?? req.query.channelId;
  const dmId = body.dmId ?? req.query.dmId;
  if (channelId) {
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (!channel) return { error: 'Канал не найден', status: 404 };
    if (!isMember(channel.server_id, req.user.id)) {
      return { error: 'Нет доступа к каналу', status: 403 };
    }
    return { channelId: channel.id, serverId: channel.server_id, room: `channel:${channel.id}` };
  }
  if (dmId) {
    const dm = db.prepare('SELECT * FROM dms WHERE id = ?').get(dmId);
    if (!dm) return { error: 'Чат не найден', status: 404 };
    if (![dm.user1, dm.user2].includes(req.user.id)) {
      return { error: 'Нет доступа к чату', status: 403 };
    }
    return { dmId: dm.id, room: `dm:${dm.id}` };
  }
  return { error: 'Укажите channelId или dmId', status: 400 };
}

function emit(req, event, conversation, payload) {
  req.app.get('io')?.to(conversation.room).emit(event, payload);
}

messagesRouter.get('/', (req, res) => {
  const conversation = conversationFor(req);
  if (conversation.error) return res.status(conversation.status).json({ error: conversation.error });

  const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);
  const before = Number(req.query.before) || 0;
  const column = conversation.channelId ? 'channel_id' : 'dm_id';
  const id = conversation.channelId || conversation.dmId;

  const rows = db.prepare(`
    SELECT * FROM messages
    WHERE ${column} = ? AND (? = 0 OR id < ?)
    ORDER BY id DESC LIMIT ?
  `).all(id, before, before, limit);

  res.json({ messages: rows.reverse().map(serializeMessage) });
});

messagesRouter.post('/', upload.single('file'), (req, res) => {
  let body = req.body || {};
  if (req.file && !body.channelId && !body.dmId) {
    body = { ...body, ...(req.query || {}) };
  }
  const conversation = conversationFor(req, body);
  if (conversation.error) return res.status(conversation.status).json({ error: conversation.error });

  const content = String(body.content || '').trim().slice(0, 5000);
  if (!content && !req.file) {
    return res.status(400).json({ error: 'Сообщение пустое' });
  }

  let replyTo = null;
  if (body.replyTo) {
    const reply = db.prepare('SELECT * FROM messages WHERE id = ?').get(body.replyTo);
    const sameConversation = conversation.channelId
      ? reply?.channel_id === conversation.channelId
      : reply?.dm_id === conversation.dmId;
    if (!sameConversation) return res.status(400).json({ error: 'Неверный ответ на сообщение' });
    replyTo = reply.id;
  }

  const attachment = req.file
    ? {
        url: fileUrl(req, req.file.filename),
        name: req.file.originalname,
        type: req.file.mimetype,
        size: req.file.size,
      }
    : null;

  const result = db.prepare(`
    INSERT INTO messages
      (server_id, channel_id, dm_id, user_id, content, file_url, file_name, file_type, file_size, reply_to, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    conversation.serverId || null,
    conversation.channelId || null,
    conversation.dmId || null,
    req.user.id,
    content,
    attachment?.url || null,
    attachment?.name || null,
    attachment?.type || null,
    attachment?.size || null,
    replyTo,
    now(),
  );

  const message = serializeMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid));
  emit(req, 'message:new', conversation, message);
  res.status(201).json({ message });
});

messagesRouter.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Сообщение не найдено' });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: 'Можно редактировать только свои сообщения' });

  const content = String(req.body?.content || '').trim().slice(0, 5000);
  if (!content) return res.status(400).json({ error: 'Сообщение пустое' });

  db.prepare('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?')
    .run(content, now(), row.id);
  const message = serializeMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(row.id));
  emit(req, 'message:edit', { room: row.channel_id ? `channel:${row.channel_id}` : `dm:${row.dm_id}` }, message);
  res.json({ message });
});

messagesRouter.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Сообщение не найдено' });

  const conversation = conversationFor(req, row.channel_id ? { channelId: row.channel_id } : { dmId: row.dm_id });
  if (conversation.error) return res.status(conversation.status).json({ error: conversation.error });

  let allowed = row.user_id === req.user.id;
  if (!allowed && row.channel_id) {
    allowed = canManage(conversation.serverId, req.user.id);
  }
  if (!allowed) return res.status(403).json({ error: 'Недостаточно прав' });

  db.prepare('DELETE FROM messages WHERE id = ?').run(row.id);
  emit(req, 'message:delete', conversation, { id: row.id });
  res.json({ ok: true });
});

messagesRouter.post('/:id/react', (req, res) => {
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Сообщение не найдено' });

  const conversation = conversationFor(req, row.channel_id ? { channelId: row.channel_id } : { dmId: row.dm_id });
  if (conversation.error) return res.status(conversation.status).json({ error: conversation.error });

  const emoji = String(req.body?.emoji || '').trim().slice(0, 16);
  if (!emoji) return res.status(400).json({ error: 'Укажите эмодзи' });

  const existing = db.prepare('SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
    .get(row.id, req.user.id, emoji);
  if (existing) {
    db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
      .run(row.id, req.user.id, emoji);
  } else {
    db.prepare('INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)')
      .run(row.id, req.user.id, emoji);
  }

  const message = serializeMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(row.id));
  emit(req, 'reaction:update', conversation, message);
  res.json({ message });
});

messagesRouter.post('/read', (req, res) => {
  const conversation = conversationFor(req, req.body || {});
  if (conversation.error) return res.status(conversation.status).json({ error: conversation.error });

  const lastReadId = Number(req.body?.messageId) || 0;
  if (conversation.channelId) {
    db.prepare(`
      INSERT INTO channel_reads (user_id, channel_id, last_read_id) VALUES (?, ?, ?)
      ON CONFLICT(user_id, channel_id) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)
    `).run(req.user.id, conversation.channelId, lastReadId);
  } else {
    db.prepare(`
      INSERT INTO dm_reads (user_id, dm_id, last_read_id) VALUES (?, ?, ?)
      ON CONFLICT(user_id, dm_id) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)
    `).run(req.user.id, conversation.dmId, lastReadId);
  }
  res.json({ ok: true });
});

messagesRouter.get('/search', (req, res) => {
  const query = String(req.query.q || '').trim();
  if (query.length < 2) return res.json({ messages: [] });

  const rows = db.prepare(`
    SELECT m.* FROM messages m
    WHERE m.content LIKE ? AND (
      m.channel_id IN (SELECT channel_id FROM channel_reads WHERE user_id = ?)
      OR m.channel_id IN (
        SELECT c.id FROM channels c JOIN server_members sm ON sm.server_id = c.server_id WHERE sm.user_id = ?
      )
      OR m.dm_id IN (SELECT dm_id FROM dm_reads WHERE user_id = ?)
      OR m.dm_id IN (SELECT id FROM dms WHERE user1 = ? OR user2 = ?)
    )
    ORDER BY m.id DESC LIMIT 50
  `).all(`%${query}%`, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);

  res.json({ messages: rows.map(serializeMessage) });
});

export function conversationsOfUser(userId) {
  const channels = db.prepare(`
    SELECT c.id FROM channels c
    JOIN server_members sm ON sm.server_id = c.server_id WHERE sm.user_id = ?
  `).all(userId).map((row) => `channel:${row.id}`);
  const dms = db.prepare('SELECT id FROM dms WHERE user1 = ? OR user2 = ?')
    .all(userId, userId).map((row) => `dm:${row.id}`);
  return [...channels, ...dms];
}
