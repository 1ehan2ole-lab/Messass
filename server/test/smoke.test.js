import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3001/api';

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  return { status: response.status, data };
}

const suffix = Date.now().toString(36);
const userA = { username: `alice${suffix}`, email: `alice${suffix}@example.com`, password: 'secret123' };
const userB = { username: `bob${suffix}`, email: `bob${suffix}@example.com`, password: 'secret123' };

test('health check', async () => {
  const { status, data } = await request('/health');
  assert.equal(status, 200);
  assert.equal(data.ok, true);
});

let tokenA;
let tokenB;

test('registration and login', async () => {
  const a = await request('/auth/register', { method: 'POST', body: userA });
  assert.equal(a.status, 201);
  tokenA = a.data.token;
  const b = await request('/auth/register', { method: 'POST', body: userB });
  assert.equal(b.status, 201);
  tokenB = b.data.token;

  const login = await request('/auth/login', { method: 'POST', body: { email: userA.email, password: 'secret123' } });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.username, userA.username);
  const bad = await request('/auth/login', { method: 'POST', body: { email: userA.email, password: 'wrong' } });
  assert.equal(bad.status, 401);
});

let serverId;
let channelId;
let messageId;

test('server, channel and messages', async () => {
  const created = await request('/servers', { method: 'POST', token: tokenA, body: { name: 'Test Server' } });
  assert.equal(created.status, 201);
  serverId = created.data.server.id;
  channelId = created.data.server.channels[0].id;

  const joined = await request('/servers/join', { method: 'POST', token: tokenB, body: { code: created.data.server.inviteCode } });
  assert.equal(joined.status, 200);

  const sent = await request('/messages', {
    method: 'POST', token: tokenA,
    body: { channelId, content: 'Привет **мир**' },
  });
  assert.equal(sent.status, 201);
  messageId = sent.data.message.id;
  assert.equal(sent.data.message.author.username, userA.username);

  const listed = await request(`/messages?channelId=${channelId}`, { token: tokenB });
  assert.equal(listed.status, 200);
  assert.equal(listed.data.messages.at(-1).id, messageId);

  const reacted = await request(`/messages/${messageId}/react`, { method: 'POST', token: tokenB, body: { emoji: '👍' } });
  assert.equal(reacted.status, 200);
  const bob = await request('/auth/me', { token: tokenB });
  assert.deepEqual(reacted.data.message.reactions['👍'], [bob.data.user.id]);

  const edited = await request(`/messages/${messageId}`, { method: 'PATCH', token: tokenA, body: { content: 'Изменено' } });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.message.content, 'Изменено');

  const searched = await request('/messages/search?q=Изменено', { token: tokenB });
  assert.equal(searched.status, 200);
  assert.ok(searched.data.messages.some((m) => m.id === messageId));

  const deleted = await request(`/messages/${messageId}`, { method: 'DELETE', token: tokenA });
  assert.equal(deleted.status, 200);
});

test('direct messages', async () => {
  const me = await request('/auth/me', { token: tokenA });
  const dm = await request('/dms', { method: 'POST', token: tokenB, body: { userId: me.data.user.id } });
  assert.equal(dm.status, 200);
  const sent = await request('/messages', {
    method: 'POST', token: tokenB,
    body: { dmId: dm.data.dm.id, content: 'Личное сообщение' },
  });
  assert.equal(sent.status, 201);
  const list = await request(`/messages?dmId=${dm.data.dm.id}`, { token: tokenA });
  assert.equal(list.data.messages.at(-1).content, 'Личное сообщение');
});

test('access control', async () => {
  const anonymous = await request(`/messages?channelId=${channelId}`);
  assert.equal(anonymous.status, 401);

  const outsider = await request('/auth/register', {
    method: 'POST',
    body: {
      username: `outsider${suffix}`,
      email: `outsider${suffix}@example.com`,
      password: 'secret123',
    },
  });
  const denied = await request(`/messages?channelId=${channelId}`, { token: outsider.data.token });
  assert.equal(denied.status, 403);
});
