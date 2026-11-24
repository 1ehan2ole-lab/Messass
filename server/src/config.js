import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const here = path.dirname(fileURLToPath(import.meta.url));

function resolveDataDir() {
  const configured = process.env.DATA_DIR?.trim();
  const dir = configured
    ? path.resolve(configured)
    : path.resolve(here, '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true });
  return dir;
}

export const config = {
  port: Number(process.env.PORT || 3001),
  jwtSecret: process.env.JWT_SECRET || 'messass-development-secret-change-me',
  dataDir: resolveDataDir(),
  databasePath: undefined,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/$/, ''),
  maxUploadBytes: 25 * 1024 * 1024,
};

config.databasePath = path.join(config.dataDir, 'messass.db');
