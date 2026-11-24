import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { config } from './config.js';
import './db.js';
import { attachUser } from './auth.js';
import { authRouter } from './routes/auth.js';
import { serversRouter } from './routes/servers.js';
import { dmsRouter } from './routes/dms.js';
import { messagesRouter } from './routes/messages.js';
import { usersRouter } from './routes/users.js';
import { setupSocket } from './socket.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(cors({ origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((s) => s.trim()) }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(attachUser);
app.use('/uploads', express.static(path.join(config.dataDir, 'uploads'), {
  maxAge: '7d',
  immutable: true,
}));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'messass' }));
app.use('/api/auth', authRouter);
app.use('/api/servers', serversRouter);
app.use('/api/dms', dmsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/users', usersRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Маршрут не найден' }));

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '..', '..', 'client', 'dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Файл слишком большой (максимум 25 МБ)' });
  }
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const server = http.createServer(app);
const io = setupSocket(server, config.corsOrigin);
app.set('io', io);

server.listen(config.port, '0.0.0.0', () => {
  console.log(`Messass API running on http://localhost:${config.port}`);
  if (config.jwtSecret.startsWith('messass-development')) {
    console.warn('WARNING: using default JWT_SECRET. Set a real secret in production.');
  }
});

export default app;
