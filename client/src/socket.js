import { io } from 'socket.io-client';
import { getToken } from './api.js';

let socket = null;

export function connectSocket(handlers) {
  disconnectSocket();
  const token = getToken();
  if (!token) return null;

  socket = io({ auth: { token }, transports: ['websocket', 'polling'] });

  const register = (event, handler) => {
    if (typeof handler === 'function') socket.on(event, handler);
  };

  register('message:new', handlers.onMessageNew);
  register('message:edit', handlers.onMessageEdit);
  register('message:delete', handlers.onMessageDelete);
  register('reaction:update', handlers.onReactionUpdate);
  register('typing', handlers.onTyping);
  register('presence:snapshot', handlers.onPresenceSnapshot);
  register('presence:update', handlers.onPresenceUpdate);
  register('server:updated', handlers.onServerUpdated);
  register('server:deleted', handlers.onServerDeleted);
  register('connect', handlers.onConnect);
  register('disconnect', handlers.onDisconnect);

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function emitTyping(conversation, isTyping) {
  if (!socket?.connected) return;
  socket.emit('typing', {
    channelId: conversation?.channelId || null,
    dmId: conversation?.dmId || null,
    isTyping,
  });
}

export function setPresence(status) {
  socket?.emit('presence:set', { status });
}
