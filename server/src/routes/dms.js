import { Router } from 'express';
import { db, now } from '../db.js';
import { requireAuth } from '../auth.js';
import { serializeDm } from '../serialize.js';

export const dmsRouter = Router();
dmsRouter.use(requireAuth);

dmsRouter.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM dms WHERE user1 = ? OR user2 = ? ORDER BY created_at DESC
  `).all(req.user.id, req.user.id);
  res.json({ dms: rows.map((row) => serializeDm(row, req.user.id)) });
});

dmsRouter.post('/', (req, res) => {
  const otherId = Number(req.body?.userId);
  if (!otherId || otherId === req.user.id) {
    return res.status(400).json({ error: 'Выберите другого пользователя' });
  }
  const other = db.prepare('SELECT id FROM users WHERE id = ?').get(otherId);
  if (!other) return res.status(404).json({ error: 'Пользователь не найден' });

  const [first, second] = [req.user.id, otherId].sort((a, b) => a - b);
  let dm = db.prepare('SELECT * FROM dms WHERE user1 = ? AND user2 = ?').get(first, second);
  if (!dm) {
    const result = db.prepare('INSERT INTO dms (user1, user2, created_at) VALUES (?, ?, ?)')
      .run(first, second, now());
    dm = db.prepare('SELECT * FROM dms WHERE id = ?').get(result.lastInsertRowid);
  }
  res.json({ dm: serializeDm(dm, req.user.id) });
});

dmsRouter.delete('/:id', (req, res) => {
  const dm = db.prepare('SELECT * FROM dms WHERE id = ?').get(req.params.id);
  if (!dm || ![dm.user1, dm.user2].includes(req.user.id)) {
    return res.status(404).json({ error: 'Чат не найден' });
  }
  db.prepare('DELETE FROM dms WHERE id = ?').run(dm.id);
  res.json({ ok: true });
});

dmsRouter.get('/unread', (req, res) => {
  const rows = db.prepare(`
    SELECT d.id AS dm_id,
           COALESCE(r.last_read_id, 0) AS last_read_id,
           (SELECT MAX(id) FROM messages WHERE dm_id = d.id) AS last_message_id
    FROM dms d
    LEFT JOIN dm_reads r ON r.dm_id = d.id AND r.user_id = ?
    WHERE d.user1 = ? OR d.user2 = ?
  `).all(req.user.id, req.user.id, req.user.id);
  res.json({
    unread: Object.fromEntries(rows.map((row) => [
      row.dm_id,
      Math.max(0, (row.last_message_id || 0) - row.last_read_id),
    ])),
  });
});
