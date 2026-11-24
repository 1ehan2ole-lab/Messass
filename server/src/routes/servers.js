import { Router } from 'express';
import { db, now, makeInviteCode } from '../db.js';
import { requireAuth } from '../auth.js';
import { serializeServer } from '../serialize.js';

export const serversRouter = Router();
serversRouter.use(requireAuth);

function getServer(serverId) {
  return db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
}

function notify(req, serverId, event, payload, extraUserIds = []) {
  const io = req.app.get('io');
  if (!io) return;
  const members = [
    ...db.prepare('SELECT user_id FROM server_members WHERE server_id = ?').all(serverId),
    ...extraUserIds.map((id) => ({ user_id: id })),
  ];
  for (const member of members) io.to(`user:${member.user_id}`).emit(event, payload);
}

export function isMember(serverId, userId) {
  return Boolean(db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?')
    .get(serverId, userId));
}

function canManage(serverId, userId) {
  const member = db.prepare('SELECT role FROM server_members WHERE server_id = ? AND user_id = ?')
    .get(serverId, userId);
  return member && ['owner', 'admin'].includes(member.role);
}

function requireMember(req, res, next) {
  if (!isMember(req.params.id, req.user.id)) {
    return res.status(403).json({ error: 'Вы не участник этого сервера' });
  }
  next();
}

function requireManager(req, res, next) {
  if (!canManage(req.params.id, req.user.id)) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }
  next();
}

serversRouter.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT s.* FROM servers s
    JOIN server_members m ON m.server_id = s.id
    WHERE m.user_id = ? ORDER BY s.name
  `).all(req.user.id);
  res.json({ servers: rows.map(serializeServer) });
});

serversRouter.post('/', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (name.length < 2 || name.length > 50) {
    return res.status(400).json({ error: 'Название сервера должно быть от 2 до 50 символов' });
  }

  const create = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO servers (name, description, icon_color, owner_id, invite_code, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, String(req.body?.description || '').slice(0, 200),
      String(req.body?.iconColor || '#5865f2'), req.user.id, makeInviteCode(), now());

    const serverId = Number(result.lastInsertRowid);
    db.prepare('INSERT INTO server_members (server_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .run(serverId, req.user.id, 'owner', now());
    db.prepare('INSERT INTO channels (server_id, name, type, topic, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(serverId, 'general', 'text', 'Общий чат', now());
    return serverId;
  });

  const serverId = create();
  res.status(201).json({ server: serializeServer(getServer(serverId)) });
});

serversRouter.post('/join', (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  const server = db.prepare('SELECT * FROM servers WHERE invite_code = ?').get(code);
  if (!server) return res.status(404).json({ error: 'Приглашение не найдено' });
  if (isMember(server.id, req.user.id)) {
    return res.json({ server: serializeServer(server) });
  }

  db.prepare('INSERT INTO server_members (server_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
    .run(server.id, req.user.id, 'member', now());
  res.json({ server: serializeServer(server) });
});

serversRouter.get('/:id', requireMember, (req, res) => {
  const server = getServer(req.params.id);
  if (!server) return res.status(404).json({ error: 'Сервер не найден' });
  res.json({ server: serializeServer(server) });
});

serversRouter.patch('/:id', requireMember, requireManager, (req, res) => {
  const server = getServer(req.params.id);
  const name = req.body?.name === undefined ? server.name : String(req.body.name).trim();
  if (name.length < 2 || name.length > 50) {
    return res.status(400).json({ error: 'Название сервера должно быть от 2 до 50 символов' });
  }
  db.prepare(`
    UPDATE servers SET name = ?, description = ?, icon_color = ? WHERE id = ?
  `).run(
    name,
    req.body?.description === undefined ? server.description : String(req.body.description).slice(0, 200),
    req.body?.iconColor === undefined ? server.icon_color : String(req.body.iconColor),
    server.id,
  );
  notify(req, server.id, 'server:updated', { serverId: server.id });
  res.json({ server: serializeServer(getServer(server.id)) });
});

serversRouter.delete('/:id', requireMember, (req, res) => {
  const server = getServer(req.params.id);
  if (!server) return res.status(404).json({ error: 'Сервер не найден' });
  if (server.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Удалить сервер может только владелец' });
  }
  notify(req, server.id, 'server:deleted', { serverId: server.id });
  db.prepare('DELETE FROM servers WHERE id = ?').run(server.id);
  res.json({ ok: true });
});

serversRouter.post('/:id/invite', requireMember, requireManager, (req, res) => {
  const code = makeInviteCode();
  db.prepare('UPDATE servers SET invite_code = ? WHERE id = ?').run(code, req.params.id);
  notify(req, req.params.id, 'server:updated', { serverId: Number(req.params.id) });
  res.json({ code });
});

serversRouter.post('/:id/channels', requireMember, requireManager, (req, res) => {
  const name = String(req.body?.name || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (!/^[a-z0-9-_]{2,32}$/.test(name)) {
    return res.status(400).json({ error: 'Название канала: 2-32 символа, латиница, цифры, - и _' });
  }
  const duplicate = db.prepare('SELECT id FROM channels WHERE server_id = ? AND name = ?')
    .get(req.params.id, name);
  if (duplicate) return res.status(409).json({ error: 'Такой канал уже есть' });

  const type = req.body?.type === 'voice' ? 'voice' : 'text';
  const result = db.prepare(`
    INSERT INTO channels (server_id, name, type, topic, created_at) VALUES (?, ?, ?, ?, ?)
  `).run(req.params.id, name, type, String(req.body?.topic || '').slice(0, 200), now());
  notify(req, req.params.id, 'server:updated', { serverId: Number(req.params.id) });
  res.status(201).json({ channelId: Number(result.lastInsertRowid) });
});

serversRouter.delete('/:id/channels/:channelId', requireMember, requireManager, (req, res) => {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ? AND server_id = ?')
    .get(req.params.channelId, req.params.id);
  if (!channel) return res.status(404).json({ error: 'Канал не найден' });
  if (channel.name === 'general') {
    return res.status(400).json({ error: 'Нельзя удалить главный канал' });
  }
  db.prepare('DELETE FROM channels WHERE id = ?').run(channel.id);
  notify(req, channel.server_id, 'server:updated', { serverId: channel.server_id });
  res.json({ ok: true });
});

serversRouter.patch('/:id/members/:userId', requireMember, requireManager, (req, res) => {
  const role = String(req.body?.role || '');
  if (!['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'Неизвестная роль' });
  }
  const server = getServer(req.params.id);
  if (Number(req.params.userId) === server.owner_id) {
    return res.status(400).json({ error: 'Роль владельца менять нельзя' });
  }
  const updated = db.prepare('UPDATE server_members SET role = ? WHERE server_id = ? AND user_id = ?')
    .run(role, server.id, req.params.userId);
  if (!updated.changes) return res.status(404).json({ error: 'Участник не найден' });
  notify(req, server.id, 'server:updated', { serverId: server.id });
  res.json({ ok: true });
});

serversRouter.delete('/:id/members/:userId', requireMember, requireManager, (req, res) => {
  const server = getServer(req.params.id);
  if (Number(req.params.userId) === server.owner_id) {
    return res.status(400).json({ error: 'Владельца нельзя исключить' });
  }
  db.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?')
    .run(server.id, req.params.userId);
  notify(req, server.id, 'server:deleted', { serverId: server.id }, [Number(req.params.userId)]);
  res.json({ ok: true });
});

serversRouter.get('/:id/messages/unread', requireMember, (req, res) => {
  const rows = db.prepare(`
    SELECT c.id AS channel_id,
           COALESCE(r.last_read_id, 0) AS last_read_id,
           (SELECT MAX(id) FROM messages WHERE channel_id = c.id) AS last_message_id
    FROM channels c
    LEFT JOIN channel_reads r ON r.channel_id = c.id AND r.user_id = ?
    WHERE c.server_id = ? AND c.type = 'text'
  `).all(req.user.id, req.params.id);
  res.json({
    unread: Object.fromEntries(rows.map((row) => [
      row.channel_id,
      Math.max(0, (row.last_message_id || 0) - row.last_read_id),
    ])),
  });
});

export { canManage };
