#!/usr/bin/env node
/** Inspect IndexedDB seed after staging login (rooms, collaborators, patients, appointments). */
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
  await page.waitForTimeout(2000);

  const snap = await page.evaluate(async () => {
    // Prefer window.__LOVE_DB__ or localStorage keys; IndexedDB via app globals if any
    const keys = Object.keys(localStorage);
    let dbHint = null;
    for (const k of keys) {
      if (/clinic|love|odonto|db/i.test(k)) {
        try {
          const v = localStorage.getItem(k);
          dbHint = { key: k, len: (v || '').length, preview: String(v || '').slice(0, 120) };
          if (v && v.includes('patients')) break;
        } catch {}
      }
    }
    // Try idb
    const dbs = await indexedDB.databases?.() || [];
    return {
      localStorageKeys: keys.slice(0, 40),
      dbHint,
      indexedDBs: dbs,
      hasWindowDb: Boolean(window.__db || window.__LOVE_DB__ || window.db),
    };
  });

  // Probe through React by navigating and reading UI counts from Journey
  await page.goto(`${BASE}/gestao-comercial/jornada-do-paciente`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const journeyText = await page.locator('body').innerText();

  // Create patient quickly then try to inspect via page.evaluate on Dexie
  const idb = await page.evaluate(async () => {
    const names = (await indexedDB.databases?.())?.map((d) => d.name) || [];
    const result = { names };
    for (const name of names) {
      try {
        const db = await new Promise((resolve, reject) => {
          const req = indexedDB.open(name);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result);
        });
        result[name] = { stores: [...db.objectStoreNames] };
        db.close();
      } catch (e) {
        result[name] = { error: String(e.message || e) };
      }
    }
    return result;
  });

  console.log(JSON.stringify({ snap, journeySnippet: journeyText.slice(0, 350), idb }, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
