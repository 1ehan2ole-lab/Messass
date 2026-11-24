// Browser-only mode used on GitHub Pages, where no Node.js backend can run.
// Data lives in localStorage and is synced between tabs via BroadcastChannel.

const STORAGE_KEY = 'messass_demo_db_v1';
const CHANNEL_NAME = 'messass-demo';
export const demoCredentials = { email: 'demo@messass.app', password: 'demo1234' };

class DemoError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const now = () => new Date().toISOString();
const uid = (prefix, list) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}_${(list.length + 1).toString(36)}`;

function hashPassword(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function seed() {
  const timestamp = now();
  const demo = { id: 'u_demo', username: 'Демо', email: demoCredentials.email, passwordHash: hashPassword(demoCredentials.password), avatarColor: '#5865f2', status: 'online', bio: 'Добро пожаловать в Messass!', createdAt: timestamp, lastSeen: timestamp };
  const alice = { id: 'u_alice', username: 'Алиса', email: 'alisa@messass.app', passwordHash: hashPassword('secret123'), avatarColor: '#eb459e', status: 'online', bio: 'Всегда на связи', createdAt: timestamp, lastSeen: timestamp };
  const bob = { id: 'u_bob', username: 'Боб', email: 'bob@messass.app', passwordHash: hashPassword('secret123'), avatarColor: '#57f287', status: 'idle', bio: 'Люблю кофе ☕', createdAt: timestamp, lastSeen: timestamp };

  const channels = [
    { id: 'ch_general', name: 'general', type: 'text', topic: 'Общий чат', createdAt: timestamp },
    { id: 'ch_flud', name: 'флудилка', type: 'text', topic: 'О чём угодно', createdAt: timestamp },
  ];
  const server = {
    id: 's_demo', name: 'Messass', description: 'Демонстрационный сервер', iconColor: '#5865f2',
    ownerId: demo.id, inviteCode: 'DEMO2026', createdAt: timestamp, channels,
    members: [
      { userId: demo.id, role: 'owner', joinedAt: timestamp },
      { userId: alice.id, role: 'member', joinedAt: timestamp },
      { userId: bob.id, role: 'admin', joinedAt: timestamp },
    ],
  };
  const dm = { id: 'dm_demo', user1: demo.id, user2: alice.id, createdAt: timestamp };

  const messages = [
    { id: 'm1', channelId: 'ch_general', userId: alice.id, content: 'Привет! Это демо-мессенджер 👋', createdAt: timestamp, editedAt: null, replyTo: null, reactions: {}, attachment: null },
    { id: 'm2', channelId: 'ch_general', userId: bob.id, content: 'Работают каналы, реакции, файлы и личные сообщения.', createdAt: timestamp, editedAt: null, replyTo: null, reactions: { '🔥': [bob.id, alice.id] }, attachment: null },
    { id: 'm3', channelId: 'ch_general', userId: demo.id, content: 'Напиши что-нибудь — я сохраню это в этом браузере.', createdAt: timestamp, editedAt: null, replyTo: null, reactions: {}, attachment: null },
    { id: 'm4', dmId: 'dm_demo', userId: alice.id, content: 'Привет! Это личка ✨', createdAt: timestamp, editedAt: null, replyTo: null, reactions: {}, attachment: null },
  ];

  return { users: [demo, alice, bob], servers: [server], dms: [dm], messages, reads: {}, nextId: 5 };
}

function loadDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupted storage -> reseed */ }
  const fresh = seed();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

let db = loadDb();

const listeners = new Map();
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
if (channel) {
  channel.onmessage = (event) => {
    db = loadDb();
    for (const handler of listeners.get(event.data?.event) || []) handler(event.data?.payload);
  };
}

function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
}

function emit(event, payload) {
  for (const handler of listeners.get(event) || []) handler(payload);
  channel?.postMessage({ event, payload });
}

function commit() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function currentUserId() {
  const token = localStorage.getItem('messass_token') || '';
  return token.startsWith('demo:') ? token.slice(5) : null;
}

function requireUser() {
  const id = currentUserId();
  const user = db.users.find((u) => u.id === id);
  if (!user) throw new DemoError('Требуется авторизация', 401);
  return user;
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, username: user.username, avatarColor: user.avatarColor, status: user.status, bio: user.bio, createdAt: user.createdAt };
}

function withStatus(user) {
  const presence = db.users.find((u) => u.id === user.id);
  return { ...publicUser(user), status: presence?.status || user.status };
}

function serializeMessage(row) {
  const author = db.users.find((u) => u.id === row.userId);
  let replyTo = null;
  if (row.replyTo) {
    const original = db.messages.find((m) => m.id === row.replyTo);
    if (original) replyTo = { id: original.id, content: String(original.content || '').slice(0, 200), author: publicUser(db.users.find((u) => u.id === original.userId)) };
  }
  return {
    id: row.id, channelId: row.channelId || null, dmId: row.dmId || null,
    content: row.content, createdAt: row.createdAt, editedAt: row.editedAt,
    author: publicUser(author), replyTo, reactions: row.reactions || {},
    attachment: row.attachment || null,
  };
}

function serializeServer(server) {
  return {
    id: server.id, name: server.name, description: server.description,
    iconColor: server.iconColor, ownerId: server.ownerId, inviteCode: server.inviteCode,
    createdAt: server.createdAt,
    channels: server.channels.map((c) => ({ id: c.id, name: c.name, type: c.type, topic: c.topic })),
    members: server.members.map((m) => ({ ...withStatus(db.users.find((u) => u.id === m.userId) || { id: m.userId, username: '?', avatarColor: '#80848e', bio: '', createdAt: '' }), role: m.role, joinedAt: m.joinedAt })),
  };
}

function serializeDm(dm, userId) {
  const otherId = dm.user1 === userId ? dm.user2 : dm.user1;
  return { id: dm.id, createdAt: dm.createdAt, user: withStatus(db.users.find((u) => u.id === otherId)) };
}

function conversationFilter(conversation) {
  if (conversation.channelId) return (m) => m.channelId === conversation.channelId;
  if (conversation.dmId) return (m) => m.dmId === conversation.dmId;
  throw new DemoError('Укажите channelId или dmId');
}

function checkConversation(conversation) {
  const me = requireUser();
  if (conversation.channelId) {
    const server = db.servers.find((s) => s.channels.some((c) => c.id === conversation.channelId));
    if (!server) throw new DemoError('Канал не найден', 404);
    if (!server.members.some((m) => m.userId === me.id)) throw new DemoError('Нет доступа к каналу', 403);
    return server;
  }
  if (conversation.dmId) {
    const dm = db.dms.find((d) => d.id === conversation.dmId);
    if (!dm) throw new DemoError('Чат не найден', 404);
    if (![dm.user1, dm.user2].includes(me.id)) throw new DemoError('Нет доступа к чату', 403);
  }
  return null;
}

function makeId(prefix) {
  db.nextId = String(Number(db.nextId) + 1);
  return `${prefix}${db.nextId}`;
}

function readKey(conversation) {
  return conversation.channelId ? `channel:${conversation.channelId}` : `dm:${conversation.dmId}`;
}

async function fileToAttachment(file) {
  if (!file) return null;
  const url = await new Promise((resolve) => {
    if (file.size > 1.5 * 1024 * 1024) return resolve(URL.createObjectURL(file));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(URL.createObjectURL(file));
    reader.readAsDataURL(file);
  });
  return { url, name: file.name, type: file.type, size: file.size };
}

export const demoApi = {
  async register({ username, email, password }) {
    if (String(username || '').trim().length < 2) throw new DemoError('Имя пользователя слишком короткое');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) throw new DemoError('Некорректный email');
    if (String(password || '').length < 6) throw new DemoError('Пароль слишком короткий');
    if (db.users.some((u) => u.email === String(email).toLowerCase())) throw new DemoError('Этот email уже занят', 409);
    const timestamp = now();
    const user = { id: makeId('u_'), username: String(username).trim(), email: String(email).toLowerCase(), passwordHash: hashPassword(password), avatarColor: '#5865f2', status: 'online', bio: '', createdAt: timestamp, lastSeen: timestamp };
    db.users.push(user);
    commit();
    emit('presence:update', { userId: user.id, status: 'online', lastSeen: timestamp });
    return { token: `demo:${user.id}`, user: publicUser(user) };
  },

  async login({ email, password }) {
    const user = db.users.find((u) => u.email === String(email || '').trim().toLowerCase());
    if (!user || user.passwordHash !== hashPassword(String(password || ''))) throw new DemoError('Неверный email или пароль', 401);
    user.status = 'online';
    commit();
    return { token: `demo:${user.id}`, user: publicUser(user) };
  },

  async me() {
    return { user: withStatus(requireUser()) };
  },

  async updateMe(data) {
    const user = requireUser();
    if (data.username !== undefined) user.username = String(data.username).trim();
    if (data.bio !== undefined) user.bio = String(data.bio).slice(0, 200);
    if (data.avatarColor !== undefined) user.avatarColor = String(data.avatarColor);
    if (data.status !== undefined) user.status = String(data.status);
    if (data.newPassword) {
      if (hashPassword(String(data.currentPassword || '')) !== user.passwordHash) throw new DemoError('Текущий пароль неверен', 401);
      user.passwordHash = hashPassword(String(data.newPassword));
    }
    commit();
    emit('presence:update', { userId: user.id, status: user.status, lastSeen: user.lastSeen });
    return { user: publicUser(user) };
  },

  async getServers() {
    const me = requireUser();
    return { servers: db.servers.filter((s) => s.members.some((m) => m.userId === me.id)).map(serializeServer) };
  },

  async getServer(id) {
    const me = requireUser();
    const server = db.servers.find((s) => s.id === id);
    if (!server || !server.members.some((m) => m.userId === me.id)) throw new DemoError('Сервер не найден', 404);
    return { server: serializeServer(server) };
  },

  async createServer({ name, description, iconColor }) {
    const me = requireUser();
    if (String(name || '').trim().length < 2) throw new DemoError('Название слишком короткое');
    const timestamp = now();
    const server = {
      id: makeId('s_'), name: String(name).trim(), description: String(description || '').slice(0, 200),
      iconColor: iconColor || '#5865f2', ownerId: me.id, inviteCode: Math.random().toString(36).slice(2, 10).toUpperCase(),
      createdAt: timestamp,
      channels: [{ id: makeId('ch_'), name: 'general', type: 'text', topic: 'Общий чат', createdAt: timestamp }],
      members: [{ userId: me.id, role: 'owner', joinedAt: timestamp }],
    };
    db.servers.push(server);
    commit();
    return { server: serializeServer(server) };
  },

  async joinServer(code) {
    const me = requireUser();
    const server = db.servers.find((s) => s.inviteCode === String(code || '').trim().toUpperCase());
    if (!server) throw new DemoError('Приглашение не найдено', 404);
    if (!server.members.some((m) => m.userId === me.id)) {
      server.members.push({ userId: me.id, role: 'member', joinedAt: now() });
      commit();
      emit('server:updated', { serverId: server.id });
    }
    return { server: serializeServer(server) };
  },

  async updateServer(id, data) {
    const server = db.servers.find((s) => s.id === id);
    if (!server) throw new DemoError('Сервер не найден', 404);
    if (data.name !== undefined) server.name = String(data.name).trim();
    if (data.description !== undefined) server.description = String(data.description).slice(0, 200);
    if (data.iconColor !== undefined) server.iconColor = String(data.iconColor);
    commit();
    emit('server:updated', { serverId: server.id });
    return { server: serializeServer(server) };
  },

  async deleteServer(id) {
    const me = requireUser();
    const server = db.servers.find((s) => s.id === id);
    if (!server || server.ownerId !== me.id) throw new DemoError('Удалить сервер может только владелец', 403);
    db.servers = db.servers.filter((s) => s.id !== id);
    db.messages = db.messages.filter((m) => !db.servers.some((s) => s.channels.some((c) => c.id === m.channelId)) && !m.channelId);
    commit();
    emit('server:deleted', { serverId: id });
    return { ok: true };
  },

  async regenerateInvite(id) {
    const server = db.servers.find((s) => s.id === id);
    if (!server) throw new DemoError('Сервер не найден', 404);
    server.inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase();
    commit();
    emit('server:updated', { serverId: id });
    return { code: server.inviteCode };
  },

  async createChannel(serverId, { name, type, topic }) {
    const server = db.servers.find((s) => s.id === serverId);
    if (!server) throw new DemoError('Сервер не найден', 404);
    const normalized = String(name || '').trim().toLowerCase().replace(/\s+/g, '-');
    if (!/^[a-z0-9-_]{2,32}$/.test(normalized)) throw new DemoError('Некорректное название канала');
    if (server.channels.some((c) => c.name === normalized)) throw new DemoError('Такой канал уже есть', 409);
    const channel = { id: makeId('ch_'), name: normalized, type: type === 'voice' ? 'voice' : 'text', topic: String(topic || '').slice(0, 200), createdAt: now() };
    server.channels.push(channel);
    commit();
    emit('server:updated', { serverId });
    return { channelId: channel.id };
  },

  async deleteChannel(serverId, channelId) {
    const server = db.servers.find((s) => s.id === serverId);
    const channel = server?.channels.find((c) => c.id === channelId);
    if (!channel) throw new DemoError('Канал не найден', 404);
    if (channel.name === 'general') throw new DemoError('Нельзя удалить главный канал');
    server.channels = server.channels.filter((c) => c.id !== channelId);
    db.messages = db.messages.filter((m) => m.channelId !== channelId);
    commit();
    emit('server:updated', { serverId });
    return { ok: true };
  },

  async updateMemberRole(serverId, userId, role) {
    const server = db.servers.find((s) => s.id === serverId);
    const member = server?.members.find((m) => m.userId === userId);
    if (!member || server.ownerId === userId) throw new DemoError('Нельзя изменить роль');
    member.role = role === 'admin' ? 'admin' : 'member';
    commit();
    emit('server:updated', { serverId });
    return { ok: true };
  },

  async kickMember(serverId, userId) {
    const server = db.servers.find((s) => s.id === serverId);
    if (!server || server.ownerId === userId) throw new DemoError('Владельца нельзя исключить');
    server.members = server.members.filter((m) => m.userId !== userId);
    commit();
    if (userId === currentUserId()) emit('server:deleted', { serverId });
    else emit('server:updated', { serverId });
    return { ok: true };
  },

  async getUnread(serverId) {
    const me = requireUser();
    const server = db.servers.find((s) => s.id === serverId);
    const result = {};
    for (const channel of server?.channels || []) {
      const last = db.messages.filter((m) => m.channelId === channel.id).at(-1);
      result[channel.id] = Math.max(0, (last ? Number(String(last.id).replace(/\D/g, '')) : 0) - Number(db.reads[`channel:${channel.id}`] || 0));
    }
    return { unread: result, _me: me.id };
  },

  async getDms() {
    const me = requireUser();
    return { dms: db.dms.filter((d) => [d.user1, d.user2].includes(me.id)).map((d) => serializeDm(d, me.id)) };
  },

  async createDm({ userId }) {
    const me = requireUser();
    if (!db.users.some((u) => u.id === userId) || userId === me.id) throw new DemoError('Пользователь не найден', 404);
    let dm = db.dms.find((d) => [d.user1, d.user2].includes(me.id) && [d.user1, d.user2].includes(userId));
    if (!dm) {
      dm = { id: makeId('dm_'), user1: me.id, user2: userId, createdAt: now() };
      db.dms.push(dm);
      commit();
    }
    return { dm: serializeDm(dm, me.id) };
  },

  async deleteDm(id) {
    db.dms = db.dms.filter((d) => d.id !== id);
    db.messages = db.messages.filter((m) => m.dmId !== id);
    commit();
    return { ok: true };
  },

  async getDmUnread() {
    const me = requireUser();
    const unread = {};
    for (const dm of db.dms.filter((d) => [d.user1, d.user2].includes(me.id))) {
      const messages = db.messages.filter((m) => m.dmId === dm.id);
      unread[dm.id] = Math.max(0, messages.length - Number(db.reads[`dm:${dm.id}`] || 0));
    }
    return { unread };
  },

  async getMessages(conversation, before) {
    requireUser();
    checkConversation(conversation);
    const filter = conversationFilter(conversation);
    let messages = db.messages.filter(filter).sort((a, b) => a.id.localeCompare(b.id));
    if (before) messages = messages.filter((m) => m.id < before);
    messages = messages.slice(-40);
    return { messages: messages.map(serializeMessage) };
  },

  async sendMessage(conversation, { content, file, replyTo }) {
    const me = requireUser();
    checkConversation(conversation);
    const text = String(content || '').trim().slice(0, 5000);
    const attachment = await fileToAttachment(file);
    if (!text && !attachment) throw new DemoError('Сообщение пустое');
    if (replyTo) {
      const original = db.messages.find((m) => m.id === replyTo);
      if (!original || !conversationFilter(conversation)(original)) throw new DemoError('Неверный ответ');
    }
    const message = {
      id: makeId('m_'), channelId: conversation.channelId || null, dmId: conversation.dmId || null,
      userId: me.id, content: text, createdAt: now(), editedAt: null, replyTo: replyTo || null,
      reactions: {}, attachment,
    };
    db.messages.push(message);
    commit();
    const serialized = serializeMessage(message);
    emit('message:new', serialized);
    return { message: serialized };
  },

  async editMessage(id, content) {
    const me = requireUser();
    const message = db.messages.find((m) => m.id === id);
    if (!message || message.userId !== me.id) throw new DemoError('Недостаточно прав', 403);
    message.content = String(content || '').trim().slice(0, 5000);
    message.editedAt = now();
    commit();
    const serialized = serializeMessage(message);
    emit('message:edit', serialized);
    return { message: serialized };
  },

  async deleteMessage(id) {
    const me = requireUser();
    const message = db.messages.find((m) => m.id === id);
    if (!message || message.userId !== me.id) throw new DemoError('Недостаточно прав', 403);
    db.messages = db.messages.filter((m) => m.id !== id);
    db.messages.forEach((m) => { if (m.replyTo === id) m.replyTo = null; });
    commit();
    emit('message:delete', { id });
    return { ok: true };
  },

  async react(id, emoji) {
    const me = requireUser();
    const message = db.messages.find((m) => m.id === id);
    if (!message) throw new DemoError('Сообщение не найдено', 404);
    message.reactions = message.reactions || {};
    const users = new Set(message.reactions[emoji] || []);
    if (users.has(me.id)) users.delete(me.id); else users.add(me.id);
    if (users.size) message.reactions[emoji] = [...users]; else delete message.reactions[emoji];
    commit();
    const serialized = serializeMessage(message);
    emit('reaction:update', serialized);
    return { message: serialized };
  },

  async markRead(conversation, messageId) {
    requireUser();
    db.reads[readKey(conversation)] = Math.max(Number(db.reads[readKey(conversation)] || 0), Number(String(messageId).replace(/\D/g, '')) || 0);
    commit();
    return { ok: true };
  },

  async search(query) {
    const me = requireUser();
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) return { messages: [] };
    const messages = db.messages
      .filter((m) => String(m.content || '').toLowerCase().includes(q))
      .filter((m) => {
        if (m.dmId) return db.dms.some((d) => d.id === m.dmId && [d.user1, d.user2].includes(me.id));
        return db.servers.some((s) => s.channels.some((c) => c.id === m.channelId) && s.members.some((member) => member.userId === me.id));
      })
      .sort((a, b) => b.id.localeCompare(a.id))
      .slice(0, 50)
      .map(serializeMessage);
    return { messages };
  },

  async searchUsers(query) {
    requireUser();
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) return { users: [] };
    return { users: db.users.filter((u) => u.username.toLowerCase().includes(q) || u.email.includes(q)).slice(0, 30).map(publicUser) };
  },

  async getPresence() {
    return { presence: Object.fromEntries(db.users.map((u) => [u.id, { status: u.status, lastSeen: u.lastSeen }])) };
  },
};

export function connectDemoSocket(handlers) {
  on('message:new', handlers.onMessageNew);
  on('message:edit', handlers.onMessageEdit);
  on('message:delete', (payload) => handlers.onMessageDelete?.(payload));
  on('reaction:update', handlers.onReactionUpdate);
  on('typing', handlers.onTyping);
  on('presence:update', handlers.onPresenceUpdate);
  on('server:updated', handlers.onServerUpdated);
  on('server:deleted', handlers.onServerDeleted);
  handlers.onPresenceSnapshot?.(Object.fromEntries(db.users.map((u) => [u.id, { status: u.status, lastSeen: u.lastSeen }])));
  handlers.onConnect?.();
  return { connected: true };
}

export function emitDemoTyping(conversation, isTyping) {
  const me = db.users.find((u) => u.id === currentUserId());
  if (!me || !conversation) return;
  emit('typing', {
    userId: me.id, username: me.username,
    channelId: conversation.channelId || null, dmId: conversation.dmId || null,
    isTyping: Boolean(isTyping),
  });
}

export function setDemoPresence(status) {
  const me = db.users.find((u) => u.id === currentUserId());
  if (!me) return;
  me.status = status;
  me.lastSeen = now();
  commit();
  emit('presence:update', { userId: me.id, status, lastSeen: me.lastSeen });
}
