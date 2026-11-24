import { Server } from 'socket.io';
import { db, now, publicUser } from './db.js';
import { verifyToken } from './auth.js';
import { conversationsOfUser } from './routes/messages.js';

export function setupSocket(httpServer, corsOrigin) {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map((s) => s.trim()),
      methods: ['GET', 'POST'],
    },
  });

  const presence = () => Object.fromEntries(
    db.prepare('SELECT id, status, last_seen FROM users').all().map((row) => [
      row.id,
      { status: row.status, lastSeen: row.last_seen },
    ]),
  );

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const userId = token ? verifyToken(token) : null;
    if (!userId) return next(new Error('Unauthorized'));
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row) return next(new Error('Unauthorized'));
    socket.data.user = publicUser(row);
    next();
  });

  io.on('connection', async (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`);
    for (const room of conversationsOfUser(user.id)) socket.join(room);

    db.prepare("UPDATE users SET status = 'online', last_seen = ? WHERE id = ? AND status IN ('offline', 'online')")
      .run(now(), user.id);
    const current = db.prepare('SELECT status FROM users WHERE id = ?').get(user.id);
    socket.emit('presence:snapshot', presence());
    socket.broadcast.emit('presence:update', {
      userId: user.id,
      status: current.status,
      lastSeen: now(),
    });

    socket.on('typing', ({ channelId, dmId, isTyping } = {}) => {
      const room = channelId ? `channel:${channelId}` : dmId ? `dm:${dmId}` : null;
      if (!room) return;
      socket.to(room).emit('typing', {
        userId: user.id,
        username: user.username,
        channelId: channelId || null,
        dmId: dmId || null,
        isTyping: Boolean(isTyping),
      });
    });

    socket.on('presence:set', ({ status } = {}) => {
      if (!['online', 'idle', 'dnd', 'invisible'].includes(status)) return;
      db.prepare('UPDATE users SET status = ?, last_seen = ? WHERE id = ?')
        .run(status, now(), user.id);
      io.emit('presence:update', { userId: user.id, status, lastSeen: now() });
    });

    socket.on('disconnect', () => {
      const row = db.prepare('SELECT status FROM users WHERE id = ?').get(user.id);
      if (row && row.status !== 'invisible') {
        db.prepare('UPDATE users SET status = ?, last_seen = ? WHERE id = ?')
          .run('offline', now(), user.id);
        io.emit('presence:update', { userId: user.id, status: 'offline', lastSeen: now() });
      }
    });
  });

  return io;
}

export function broadcastToServerMembers(io, serverId, event, payload) {
  const members = db.prepare('SELECT user_id FROM server_members WHERE server_id = ?')
    .all(serverId);
  for (const member of members) {
    io.to(`user:${member.user_id}`).emit(event, payload);
  }
}
