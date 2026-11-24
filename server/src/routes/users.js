import { Router } from 'express';
import { db, publicUser } from '../db.js';
import { requireAuth } from '../auth.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get('/', (req, res) => {
  const query = String(req.query.q || '').trim();
  if (query.length < 2) return res.json({ users: [] });
  const rows = db.prepare(`
    SELECT * FROM users
    WHERE id != ? AND (username LIKE ? OR email LIKE ?)
    ORDER BY username LIMIT 30
  `).all(req.user.id, `%${query}%`, `%${query}%`);
  res.json({ users: rows.map(publicUser) });
});

usersRouter.get('/presence', (req, res) => {
  const rows = db.prepare('SELECT id, status, last_seen FROM users').all();
  res.json({
    presence: Object.fromEntries(rows.map((row) => [
      row.id,
      { status: row.status, lastSeen: row.last_seen },
    ])),
  });
});

usersRouter.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json({ user: publicUser(row) });
});
