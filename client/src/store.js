import { create } from 'zustand';
import { api, getToken, setToken, clearToken } from './api.js';
import { connectSocket, disconnectSocket, emitTyping, setPresence } from './socket.js';

export const conversationKey = (conversation) => {
  if (!conversation) return null;
  return conversation.channelId ? `channel:${conversation.channelId}` : `dm:${conversation.dmId}`;
};

export const activeConversation = (state) =>
  state.activeDmId ? { dmId: state.activeDmId } : state.activeChannelId ? { channelId: state.activeChannelId } : null;

const currentActiveKey = (state) => {
  const conversation = activeConversation(state);
  return conversation ? conversationKey(conversation) : null;
};

function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || document.visibilityState === 'visible') {
    return;
  }
  try {
    new Notification(title, { body: body?.slice(0, 120) || 'Вложение' });
  } catch {
    /* notifications can be blocked by the browser */
  }
}

export const useStore = create((set, get) => ({
  token: getToken(),
  user: null,
  booted: false,
  loading: false,
  error: '',

  servers: [],
  dms: [],
  activeServerId: null,
  activeChannelId: null,
  activeDmId: null,

  messages: {},
  hasMore: {},
  presence: {},
  typing: {},
  unread: {},

  modal: null,
  modalData: null,
  toast: null,
  searchQuery: '',

  setError: (error) => set({ error }),
  clearError: () => set({ error: '' }),
  openModal: (modal, modalData = null) => set({ modal, modalData }),
  closeModal: () => set({ modal: null, modalData: null }),
  showToast: (message, kind = 'info') => {
    set({ toast: { message, kind, id: Date.now() } });
    setTimeout(() => {
      if (get().toast?.message === message) set({ toast: null });
    }, 3500);
  },

  authenticate: async (mode, data) => {
    set({ loading: true, error: '' });
    try {
      const result = mode === 'login' ? await api.login(data) : await api.register(data);
      setToken(result.token);
      set({ token: result.token, user: result.user });
      await get().loadWorkspace();
      get().initSocket();
    } catch (error) {
      set({ error: error.message });
    } finally {
      set({ loading: false });
    }
  },

  boot: async () => {
    if (!get().token) {
      set({ booted: true });
      return;
    }
    set({ loading: true });
    try {
      const { user } = await api.me();
      set({ user });
      await get().loadWorkspace();
      get().initSocket();
    } catch {
      clearToken();
      set({ token: null, user: null });
    } finally {
      set({ loading: false, booted: true });
    }
  },

  logout: () => {
    disconnectSocket();
    clearToken();
    set({
      token: null,
      user: null,
      servers: [],
      dms: [],
      messages: {},
      presence: {},
      typing: {},
      unread: {},
      activeServerId: null,
      activeChannelId: null,
      activeDmId: null,
    });
  },

  loadWorkspace: async () => {
    const [serversResult, dmsResult, presenceResult, unreadResult] = await Promise.allSettled([
      api.getServers(),
      api.getDms(),
      api.getPresence(),
      api.getDmUnread(),
    ]);
    const servers = serversResult.status === 'fulfilled' ? serversResult.value.servers : [];
    const dms = dmsResult.status === 'fulfilled' ? dmsResult.value.dms : [];
    const presence = presenceResult.status === 'fulfilled' ? presenceResult.value.presence : {};
    const dmUnread = unreadResult.status === 'fulfilled' ? unreadResult.value.unread : {};
    const unread = Object.fromEntries(
      Object.entries(dmUnread).map(([id, count]) => [`dm:${id}`, count]),
    );

    set((state) => ({
      servers,
      dms,
      presence,
      unread: { ...state.unread, ...unread },
      activeServerId: state.activeServerId ?? (servers[0]?.id ?? null),
      activeChannelId:
        state.activeChannelId ??
        (state.activeDmId ? null : servers[0]?.channels?.[0]?.id ?? null),
    }));

    const state = get();
    if (state.activeChannelId && !state.activeDmId) {
      await get().loadMessages({ channelId: state.activeChannelId });
    } else if (state.activeDmId) {
      await get().loadMessages({ dmId: state.activeDmId });
    }
  },

  refreshServers: async () => {
    const { servers } = await api.getServers();
    set({ servers });
  },

  createServer: async (data) => {
    try {
      const { server } = await api.createServer(data);
      set((state) => ({
        servers: [...state.servers, server],
        activeServerId: server.id,
        activeDmId: null,
        activeChannelId: server.channels?.[0]?.id || null,
      }));
      await get().loadMessages({ channelId: server.channels?.[0]?.id });
      get().closeModal();
      get().showToast('Сервер создан', 'success');
    } catch (error) {
      get().showToast(error.message, 'error');
    }
  },

  joinServer: async (code) => {
    try {
      const { server } = await api.joinServer(code);
      await get().refreshServers();
      set({ activeServerId: server.id, activeDmId: null, activeChannelId: server.channels?.[0]?.id || null });
      await get().loadMessages({ channelId: server.channels?.[0]?.id });
      get().closeModal();
      get().showToast(`Вы присоединились к «${server.name}»`, 'success');
    } catch (error) {
      get().showToast(error.message, 'error');
    }
  },

  createChannel: async (serverId, data) => {
    try {
      await api.createChannel(serverId, data);
      await get().refreshServer(serverId);
      get().closeModal();
      get().showToast('Канал создан', 'success');
    } catch (error) {
      get().showToast(error.message, 'error');
    }
  },

  deleteChannel: async (serverId, channelId) => {
    try {
      await api.deleteChannel(serverId, channelId);
      if (get().activeChannelId === channelId) {
        const server = get().servers.find((s) => s.id === serverId);
        set({ activeChannelId: server?.channels?.find((c) => c.id !== channelId && c.type === 'text')?.id || null });
      }
      await get().refreshServer(serverId);
      get().closeModal();
      get().showToast('Канал удалён', 'success');
    } catch (error) {
      get().showToast(error.message, 'error');
    }
  },

  updateServer: async (serverId, data) => {
    try {
      await api.updateServer(serverId, data);
      await get().refreshServer(serverId);
      get().closeModal();
      get().showToast('Сервер обновлён', 'success');
    } catch (error) {
      get().showToast(error.message, 'error');
    }
  },

  deleteServer: async (serverId) => {
    try {
      await api.deleteServer(serverId);
      set((state) => ({
        servers: state.servers.filter((s) => s.id !== serverId),
        activeServerId: null,
        activeChannelId: null,
      }));
      get().closeModal();
      get().showToast('Сервер удалён', 'success');
    } catch (error) {
      get().showToast(error.message, 'error');
    }
  },

  regenerateInvite: async (serverId) => {
    try {
      const { code } = await api.regenerateInvite(serverId);
      set((state) => ({
        servers: state.servers.map((s) => (s.id === serverId ? { ...s, inviteCode: code } : s)),
      }));
      return code;
    } catch (error) {
      get().showToast(error.message, 'error');
      return null;
    }
  },

  updateMemberRole: async (serverId, userId, role) => {
    try {
      await api.updateMemberRole(serverId, userId, role);
      await get().refreshServer(serverId);
      get().closeModal();
      get().showToast('Роль обновлена', 'success');
    } catch (error) {
      get().showToast(error.message, 'error');
    }
  },

  kickMember: async (serverId, userId) => {
    try {
      await api.kickMember(serverId, userId);
      await get().refreshServer(serverId);
      get().closeModal();
      get().showToast('Участник исключён', 'success');
    } catch (error) {
      get().showToast(error.message, 'error');
    }
  },

  createDm: async (userId) => {
    try {
      const { dm } = await api.createDm(userId);
      set((state) => ({
        dms: state.dms.some((d) => d.id === dm.id) ? state.dms : [dm, ...state.dms],
      }));
      await get().selectDm(dm.id);
      get().closeModal();
    } catch (error) {
      get().showToast(error.message, 'error');
    }
  },

  deleteDm: async (dmId) => {
    try {
      await api.deleteDm(dmId);
      set((state) => ({
        dms: state.dms.filter((d) => d.id !== dmId),
        activeDmId: state.activeDmId === dmId ? null : state.activeDmId,
      }));
      get().closeModal();
      get().showToast('Чат удалён', 'success');
    } catch (error) {
      get().showToast(error.message, 'error');
    }
  },

  updateProfile: async (data) => {
    try {
      const { user } = await api.updateMe(data);
      set({ user });
      get().closeModal();
      get().showToast('Профиль сохранён', 'success');
    } catch (error) {
      get().showToast(error.message, 'error');
    }
  },

  refreshServer: async (serverId) => {
    try {
      const { server } = await api.getServer(serverId);
      set((state) => ({ servers: state.servers.map((s) => (s.id === server.id ? server : s)) }));
    } catch {
      await get().refreshServers();
    }
  },

  selectServer: async (serverId) => {
    const server = get().servers.find((s) => s.id === serverId);
    set({
      activeServerId: serverId,
      activeDmId: null,
      activeChannelId: server?.channels?.find((c) => c.type === 'text')?.id ?? null,
    });
    if (get().activeChannelId) {
      await get().loadMessages({ channelId: get().activeChannelId });
      get().markRead({ channelId: get().activeChannelId });
    }
  },

  setActiveChannel: (channelId) => set({ activeChannelId: channelId, activeDmId: null }),

  selectDmHome: () => set({ activeServerId: null, activeDmId: null, activeChannelId: null }),

  selectDm: async (dmId) => {
    set({ activeServerId: null, activeDmId: dmId, activeChannelId: null });
    await get().loadMessages({ dmId });
    get().markRead({ dmId });
  },

  loadMessages: async (conversation, before) => {
    if (!conversation) return;
    const key = conversationKey(conversation);
    try {
      const { messages } = await api.getMessages(conversation, before);
      set((state) => ({
        messages: {
          ...state.messages,
          [key]: before ? [...messages, ...(state.messages[key] || [])] : messages,
        },
        hasMore: { ...state.hasMore, [key]: messages.length === 40 },
        unread: { ...state.unread, [key]: 0 },
      }));
    } catch (error) {
      get().showToast(error.message, 'error');
    }
  },

  sendMessage: async (content, file) => {
    const conversation = activeConversation(get());
    if (!conversation || (!content?.trim() && !file)) return;
    const key = conversationKey(conversation);
    const replyTo = get().replyTo?.[key] || null;
    try {
      const { message } = await api.sendMessage(conversation, { content, file, replyTo });
      set((state) => {
        const list = state.messages[key] || [];
        if (list.some((m) => m.id === message.id)) return state;
        return { messages: { ...state.messages, [key]: [...list, message] } };
      });
      set((state) => ({ replyTo: { ...state.replyTo, [key]: null } }));
      emitTyping(conversation, false);
    } catch (error) {
      get().showToast(error.message, 'error');
    }
  },

  editMessage: async (messageId, content) => {
    try {
      const { message } = await api.editMessage(messageId, content);
      get().applyMessageEdit(message);
    } catch (error) {
      get().showToast(error.message, 'error');
    }
  },

  deleteMessage: async (messageId) => {
    try {
      await api.deleteMessage(messageId);
      get().applyMessageDelete(messageId);
    } catch (error) {
      get().showToast(error.message, 'error');
    }
  },

  react: async (messageId, emoji) => {
    try {
      const { message } = await api.react(messageId, emoji);
      get().applyReaction(message);
    } catch (error) {
      get().showToast(error.message, 'error');
    }
  },

  markRead: async (conversation) => {
    if (!conversation) return;
    const messages = get().messages[conversationKey(conversation)] || [];
    const lastId = messages[messages.length - 1]?.id;
    if (!lastId) return;
    set((state) => ({ unread: { ...state.unread, [conversationKey(conversation)]: 0 } }));
    try {
      await api.markRead(conversation, lastId);
    } catch {
      /* read receipts are best-effort */
    }
  },

  applyMessageNew: (message) => {
    const key = message.channelId ? `channel:${message.channelId}` : `dm:${message.dmId}`;
    const state = get();
    const isActive = currentActiveKey(state) === key;
    const mine = state.user?.id === message.author.id;

    set((current) => {
      const list = current.messages[key] || [];
      if (list.some((m) => m.id === message.id)) return current;
      return {
        messages: { ...current.messages, [key]: [...list, message] },
        unread: {
          ...current.unread,
          [key]: isActive || mine ? 0 : (current.unread[key] || 0) + 1,
        },
        typing: { ...current.typing, [key]: null },
      };
    });

    if (!isActive && !mine && conversationKey(activeConversation(state)) !== key) {
      notify(message.author.username, message.content);
    }
    if (message.dmId) {
      api.getDms().then(({ dms }) => set({ dms })).catch(() => {});
    }
    if (isActive && document.visibilityState === 'visible') {
      get().markRead(message.channelId ? { channelId: message.channelId } : { dmId: message.dmId });
    }
  },

  applyMessageEdit: (message) => {
    const key = message.channelId ? `channel:${message.channelId}` : `dm:${message.dmId}`;
    set((state) => ({
      messages: {
        ...state.messages,
        [key]: (state.messages[key] || []).map((m) => (m.id === message.id ? message : m)),
      },
    }));
  },

  applyMessageDelete: (messageId) => {
    set((state) => ({
      messages: Object.fromEntries(
        Object.entries(state.messages).map(([key, list]) => [
          key,
          list.filter((m) => m.id !== messageId),
        ]),
      ),
    }));
  },

  applyReaction: (message) => {
    const key = message.channelId ? `channel:${message.channelId}` : `dm:${message.dmId}`;
    set((state) => ({
      messages: {
        ...state.messages,
        [key]: (state.messages[key] || []).map((m) => (m.id === message.id ? message : m)),
      },
    }));
  },

  setTyping: (payload) => {
    if (payload.userId === get().user?.id) return;
    const key = payload.channelId ? `channel:${payload.channelId}` : `dm:${payload.dmId}`;
    set((state) => ({ typing: { ...state.typing, [key]: payload.isTyping ? payload : null } }));
    if (!payload.isTyping) {
      setTimeout(() => {
        const current = get().typing[key];
        if (current?.userId === payload.userId) set((s) => ({ typing: { ...s.typing, [key]: null } }));
      }, 4000);
    }
  },

  setPresence: async (status) => {
    setPresence(status);
    set((state) => ({
      user: state.user ? { ...state.user, status } : null,
      presence: { ...state.presence, [state.user?.id]: { ...state.presence[state.user?.id], status } },
    }));
    try {
      const { user } = await api.updateMe({ status });
      set({ user });
    } catch {
      /* socket already applied the change */
    }
  },

  initSocket: () => {
    connectSocket({
      onMessageNew: (message) => get().applyMessageNew(message),
      onMessageEdit: (message) => get().applyMessageEdit(message),
      onMessageDelete: ({ id }) => get().applyMessageDelete(id),
      onReactionUpdate: (message) => get().applyReaction(message),
      onTyping: (payload) => get().setTyping(payload),
      onPresenceSnapshot: (presence) => set({ presence }),
      onPresenceUpdate: ({ userId, status, lastSeen }) => set((state) => ({
        presence: { ...state.presence, [userId]: { ...state.presence[userId], status, lastSeen } },
      })),
      onServerUpdated: async ({ serverId }) => {
        await get().refreshServer(serverId);
      },
      onServerDeleted: ({ serverId }) => {
        set((state) => ({
          servers: state.servers.filter((s) => s.id !== serverId),
          activeServerId: state.activeServerId === serverId ? null : state.activeServerId,
          activeChannelId: state.activeServerId === serverId ? null : state.activeChannelId,
        }));
      },
      onConnect: () => {
        get().showToast('Соединение установлено', 'success');
      },
      onDisconnect: () => {
        get().showToast('Соединение потеряно. Переподключение…', 'error');
      },
    });
  },

  replyTo: {},
  setReplyTo: (conversation, message) => {
    set((state) => ({ replyTo: { ...state.replyTo, [conversationKey(conversation)]: message } }));
  },
}));
