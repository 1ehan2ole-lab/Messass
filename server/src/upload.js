import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { config } from './config.js';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(config.dataDir, 'uploads')),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});

export function fileUrl(req, filename) {
  const base = config.publicUrl || `${req.protocol}://${req.get('host')}`;
  return `${base}/uploads/${encodeURIComponent(filename)}`;
}
