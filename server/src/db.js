import { config } from './config.js';

// Two SQLite drivers are supported:
//   better-sqlite3  — fastest, used on desktop/servers (installed by default)
//   node:sqlite     — built into Node.js 22+, no native build, works on Android/Termux
async function openDatabase() {
  if (process.env.DB_DRIVER !== 'node:sqlite') {
    try {
      const { default: Database } = await import('better-sqlite3');
      return { raw: new Database(config.databasePath), driver: 'better-sqlite3' };
    } catch (error) {
      if (process.env.DB_DRIVER === 'better-sqlite3') throw error;
      console.warn('better-sqlite3 unavailable, falling back to node:sqlite');
    }
  }
  const { DatabaseSync } = await import('node:sqlite');
  return { raw: new DatabaseSync(config.databasePath), driver: 'node:sqlite' };
}

const { raw, driver } = await openDatabase();
export const dbDriver = driver;

// Normalize the small API differences between the two drivers.
export const db = {
  exec: raw.exec.bind(raw),
  close: raw.close.bind(raw),
  transaction(fn) {
    return (...args) => {
      raw.exec('BEGIN');
      try {
        const result = fn(...args);
        raw.exec('COMMIT');
        return result;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    };
  },
  prepare(sql) {
    const statement = raw.prepare(sql);
    return {
      get: (...params) => statement.get(...params),
      all: (...params) => statement.all(...params),
      run(...params) {
        const result = statement.run(...params);
        return {
          changes: Number(result.changes || 0),
          lastInsertRowid: result.lastInsertRowid === undefined
            ? undefined
            : Number(result.lastInsertRowid),
        };
      },
    };
  },
};

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  avatar_color  TEXT NOT NULL DEFAULT '#5865f2',
  status        TEXT NOT NULL DEFAULT 'online',
  bio           TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  last_seen     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS servers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  icon_color   TEXT NOT NULL DEFAULT '#5865f2',
  owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code  TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS server_members (
  server_id  INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',
  joined_at  TEXT NOT NULL,
  PRIMARY KEY (server_id, user_id)
);

CREATE TABLE IF NOT EXISTS channels (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id  INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'text',
  topic      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user1      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (user1, user2)
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id  INTEGER REFERENCES servers(id) ON DELETE CASCADE,
  channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
  dm_id      INTEGER REFERENCES dms(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL DEFAULT '',
  file_url   TEXT,
  file_name  TEXT,
  file_type  TEXT,
  file_size  INTEGER,
  reply_to   INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  edited_at  TEXT
);

CREATE TABLE IF NOT EXISTS reactions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS channel_reads (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id   INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  last_read_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, channel_id)
);

CREATE TABLE IF NOT EXISTS dm_reads (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dm_id        INTEGER NOT NULL REFERENCES dms(id) ON DELETE CASCADE,
  last_read_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, dm_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, id);
CREATE INDEX IF NOT EXISTS idx_messages_dm ON messages(dm_id, id);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON server_members(user_id);
CREATE INDEX IF NOT EXISTS idx_dm_participants ON dms(user1, user2);
`);

export const now = () => new Date().toISOString();

export function makeInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export const publicUser = (row) => ({
  id: row.id,
  username: row.username,
  avatarColor: row.avatar_color,
  status: row.status,
  bio: row.bio,
  createdAt: row.created_at,
});
