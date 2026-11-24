import { demoApi } from './demo.js';

const TOKEN_KEY = 'messass_token';

export const isDemoMode =
  import.meta.env.VITE_DEMO_MODE === 'true' ||
  (typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io'));

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, headers = {}, ...rest } = {}) {
  const token = getToken();
  const isForm = body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body
      ? isForm
        ? body
        : JSON.stringify(body)
      : undefined,
    ...rest,
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new ApiError(data?.error || 'Ошибка запроса', response.status);
  }
  return data;
}

const serverApi = {
  register: (data) => request('/auth/register', { method: 'POST', body: data }),
  login: (data) => request('/auth/login', { method: 'POST', body: data }),
  me: () => request('/auth/me'),
  updateMe: (data) => request('/auth/me', { method: 'PATCH', body: data }),

  getServers: () => request('/servers'),
  getServer: (id) => request(`/servers/${id}`),
  createServer: (data) => request('/servers', { method: 'POST', body: data }),
  joinServer: (code) => request('/servers/join', { method: 'POST', body: { code } }),
  updateServer: (id, data) => request(`/servers/${id}`, { method: 'PATCH', body: data }),
  deleteServer: (id) => request(`/servers/${id}`, { method: 'DELETE' }),
  regenerateInvite: (id) => request(`/servers/${id}/invite`, { method: 'POST' }),
  createChannel: (id, data) => request(`/servers/${id}/channels`, { method: 'POST', body: data }),
  deleteChannel: (id, channelId) => request(`/servers/${id}/channels/${channelId}`, { method: 'DELETE' }),
  updateMemberRole: (id, userId, role) => request(`/servers/${id}/members/${userId}`, { method: 'PATCH', body: { role } }),
  kickMember: (id, userId) => request(`/servers/${id}/members/${userId}`, { method: 'DELETE' }),
  getUnread: (id) => request(`/servers/${id}/messages/unread`),

  getDms: () => request('/dms'),
  createDm: (userId) => request('/dms', { method: 'POST', body: { userId } }),
  deleteDm: (id) => request(`/dms/${id}`, { method: 'DELETE' }),
  getDmUnread: () => request('/dms/unread'),

  getMessages: (conversation, before) => {
    const query = new URLSearchParams();
    if (conversation.channelId) query.set('channelId', conversation.channelId);
    if (conversation.dmId) query.set('dmId', conversation.dmId);
    if (before) query.set('before', before);
    return request(`/messages?${query}`);
  },
  sendMessage: (conversation, data) => {
    const form = new FormData();
    if (conversation.channelId) form.append('channelId', conversation.channelId);
    if (conversation.dmId) form.append('dmId', conversation.dmId);
    if (data.content) form.append('content', data.content);
    if (data.replyTo) form.append('replyTo', data.replyTo);
    if (data.file) form.append('file', data.file);
    return request('/messages', { method: 'POST', body: form });
  },
  editMessage: (id, content) => request(`/messages/${id}`, { method: 'PATCH', body: { content } }),
  deleteMessage: (id) => request(`/messages/${id}`, { method: 'DELETE' }),
  react: (id, emoji) => request(`/messages/${id}/react`, { method: 'POST', body: { emoji } }),
  markRead: (conversation, messageId) => request('/messages/read', {
    method: 'POST',
    body: {
      ...(conversation.channelId ? { channelId: conversation.channelId } : {}),
      ...(conversation.dmId ? { dmId: conversation.dmId } : {}),
      messageId,
    },
  }),
  search: (q) => request(`/messages/search?q=${encodeURIComponent(q)}`),
  searchUsers: (q) => request(`/users?q=${encodeURIComponent(q)}`),
  getPresence: () => request('/users/presence'),
};

export const api = isDemoMode ? demoApi : serverApi;
