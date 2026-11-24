import { db, publicUser } from './db.js';

export function serializeMessage(row) {
  if (!row) return null;

  const author = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  const reactions = db.prepare(`
    SELECT user_id, emoji FROM reactions WHERE message_id = ? ORDER BY rowid
  `).all(row.id).reduce((acc, reaction) => {
    acc[reaction.emoji] = acc[reaction.emoji] || [];
    acc[reaction.emoji].push(reaction.user_id);
    return acc;
  }, {});

  let replyTo = null;
  if (row.reply_to) {
    const replyRow = db.prepare('SELECT * FROM messages WHERE id = ?').get(row.reply_to);
    if (replyRow) {
      const replyAuthor = db.prepare('SELECT * FROM users WHERE id = ?').get(replyRow.user_id);
      replyTo = {
        id: replyRow.id,
        content: replyRow.content.slice(0, 200),
        author: publicUser(replyAuthor),
      };
    }
  }

  return {
    id: row.id,
    channelId: row.channel_id,
    dmId: row.dm_id,
    content: row.content,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    author: publicUser(author),
    replyTo,
    reactions,
    attachment: row.file_url
      ? {
          url: row.file_url,
          name: row.file_name,
          type: row.file_type,
          size: row.file_size,
        }
      : null,
  };
}

export function serializeServer(row) {
  const channels = db.prepare('SELECT * FROM channels WHERE server_id = ? ORDER BY created_at, id')
    .all(row.id)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      topic: channel.topic,
    }));

  const members = db.prepare(`
    SELECT u.*, m.role, m.joined_at
    FROM server_members m JOIN users u ON u.id = m.user_id
    WHERE m.server_id = ? ORDER BY u.username
  `).all(row.id).map((member) => ({
    ...publicUser(member),
    role: member.role,
    joinedAt: member.joined_at,
  }));

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    iconColor: row.icon_color,
    ownerId: row.owner_id,
    inviteCode: row.invite_code,
    createdAt: row.created_at,
    channels,
    members,
  };
}

export function serializeDm(row, currentUserId) {
  const otherId = row.user1 === currentUserId ? row.user2 : row.user1;
  const other = db.prepare('SELECT * FROM users WHERE id = ?').get(otherId);
  return {
    id: row.id,
    createdAt: row.created_at,
    user: publicUser(other),
  };
}
