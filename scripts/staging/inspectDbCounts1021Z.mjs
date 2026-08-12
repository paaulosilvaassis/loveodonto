#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/tmp/pw1021y/node_modules/playwright-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'http://127.0.0.1:5188';

function parse(p) {
  const o = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    o[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/\r/g, '');
  }
  return o;
}

async function main() {
  const creds = parse(path.join(ROOT, 'scripts/staging/.staging_smoke_creds.local'));
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#login-email', creds.STAGING_SMOKE_EMAIL);
  await page.fill('#login-password', creds.STAGING_SMOKE_PASSWORD);
  await page.click('button.login-form-button');
  await page.waitForURL('**/gestao/**', { timeout: 45000 });
  await page.waitForTimeout(2500);

  const data = await page.evaluate(async () => {
    const openDb = () => new Promise((resolve, reject) => {
      const req = indexedDB.open('appgestaoodonto');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
    const db = await openDb();
    const tx = db.transaction('data', 'readonly');
    const store = tx.objectStore('data');
    const all = await new Promise((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    const row = all?.[0] || all?.find?.((x) => x?.patients) || all?.[0];
    // storage may be { key, value } or raw
    const payload = row?.value || row?.data || row;
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    return {
      keys: row ? Object.keys(row) : [],
      patients: (parsed?.patients || []).length,
      appointments: (parsed?.appointments || []).length,
      collaborators: (parsed?.collaborators || []).slice(0, 3).map((c) => ({
        id: c.id,
        name: c.nomeCompleto || c.name,
        active: c.active,
        role: c.role,
      })),
      collaboratorsCount: (parsed?.collaborators || []).length,
      rooms: (parsed?.rooms || []).map((r) => ({ id: r.id, name: r.name, active: r.active })),
      tenants: (parsed?.tenants || []).slice(0, 2).map((t) => t.id),
    };
  });
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
