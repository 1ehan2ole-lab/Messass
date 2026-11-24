import { Router } from 'express';
import { db, now, publicUser } from '../db.js';
import { hashPassword, signToken, verifyPassword, requireAuth } from '../auth.js';

export const authRouter = Router();

function validateCredentials(username, email, password) {
  if (!username || username.trim().length < 2 || username.trim().length > 32) {
    return 'Имя пользователя должно быть от 2 до 32 символов';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) {
    return 'Введите корректный email';
  }
  if (!password || password.length < 6 || password.length > 128) {
    return 'Пароль должен быть от 6 до 128 символов';
  }
  return null;
}

authRouter.post('/register', (req, res) => {
  const { username, email, password } = req.body || {};
  const error = validateCredentials(username, email, password);
  if (error) return res.status(400).json({ error });

  const normalizedEmail = String(email).trim().toLowerCase();
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (exists) return res.status(409).json({ error: 'Этот email уже занят' });

  const colors = ['#5865f2', '#eb459e', '#57f287', '#fee75c', '#ed4245', '#00b0f4', '#9b59b6'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const timestamp = now();

  const result = db.prepare(`
    INSERT INTO users (username, email, password_hash, avatar_color, created_at, last_seen)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(String(username).trim(), normalizedEmail, hashPassword(password), color, timestamp, timestamp);

  const user = publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid));
  res.status(201).json({ token: signToken(user), user });
});

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  if (!row || !verifyPassword(String(password || ''), row.password_hash)) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(now(), row.id);
  const user = publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(row.id));
  res.json({ token: signToken(user), user });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.patch('/me', requireAuth, (req, res) => {
  const { username, bio, avatarColor, status, newPassword, currentPassword } = req.body || {};
  const user = req.user;

  if (username !== undefined) {
    if (String(username).trim().length < 2 || String(username).trim().length > 32) {
      return res.status(400).json({ error: 'Имя пользователя должно быть от 2 до 32 символов' });
    }
  }
  if (status !== undefined && !['online', 'idle', 'dnd', 'invisible'].includes(status)) {
    return res.status(400).json({ error: 'Неизвестный статус' });
  }

  if (newPassword) {
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
    if (!verifyPassword(String(currentPassword || ''), row.password_hash)) {
      return res.status(401).json({ error: 'Текущий пароль неверен' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'Новый пароль слишком короткий' });
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(hashPassword(String(newPassword)), user.id);
  }

  db.prepare(`
    UPDATE users
    SET username = COALESCE(?, username),
        bio = COALESCE(?, bio),
        avatar_color = COALESCE(?, avatar_color),
        status = COALESCE(?, status)
    WHERE id = ?
  `).run(
    username === undefined ? null : String(username).trim(),
    bio === undefined ? null : String(bio).slice(0, 200),
    avatarColor === undefined ? null : String(avatarColor),
    status === undefined ? null : String(status),
    user.id,
  );

  const updated = publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id));
  req.app.get('io')?.emit('presence:update', {
    userId: updated.id,
    status: updated.status,
    lastSeen: db.prepare('SELECT last_seen FROM users WHERE id = ?').get(user.id).last_seen,
  });
  res.json({ user: updated });
});
