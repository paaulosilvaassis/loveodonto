import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';

const readEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .reduce((acc, line) => {
      const [key, ...rest] = line.split('=');
      acc[key.trim()] = rest.join('=').trim();
      return acc;
    }, {});
};

const env = readEnvFile(path.resolve('.env.development'));
const baseUrl = env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
const token = env.VITE_DB_MIGRATE_TOKEN || 'dev-migrate';
const url = `${baseUrl}/dev/migrate-db?token=${encodeURIComponent(token)}`;

const openUrl = (target) => {
  if (process.platform === 'win32') {
    exec(`start "" "${target}"`);
    return;
  }
  if (process.platform === 'darwin') {
    exec(`open "${target}"`);
    return;
  }
  exec(`xdg-open "${target}"`);
};

console.log(`Abrindo migração do banco DEV: ${url}`);
openUrl(url);
