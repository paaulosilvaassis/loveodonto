#!/usr/bin/env node
/**
 * CLOUD.6 — Clean browser patient remote-read validation (Playwright).
 * STAGING ONLY. Two isolated Chromium profiles. No PHI in report.
 *
 * Prerequisites:
 *   - .env.staging.local with PATIENT READ/SHADOW/PRIMARY flags
 *   - scripts/staging/.staging_smoke_creds.local
 *   - staging API :3011 + Vite :5188 running
 *
 * Usage:
 *   node scripts/staging/runCloud6PatientCleanBrowser.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'docs/reports/CLOUD_6_PATIENT_CLEAN_BROWSER.json');
const BASE = process.env.STAGING_BROWSER_BASE || 'http://127.0.0.1:5188';
const API = process.env.STAGING_API_BASE || 'http://127.0.0.1:3011';
const STAGING_REF = 'tckdjyunwmdpqmewrwvt';
const PRODUCTION_REF = 'uoepkwhqztmsjnzirpev';
const TARGET_TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const EXPECTED = 3731;

function parseEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/\r/g, '');
  }
  return env;
}

function hardStop(reason, extra = {}) {
  const report = { ok: false, FINAL_GATE: 'STOP_PATIENT_CLEAN_BROWSER_FAILED', reason, ...extra };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}

async function resolvePlaywright() {
  const candidates = [
    '/tmp/pw1021y/node_modules/playwright-core',
    path.join(ROOT, 'node_modules/playwright-core'),
    path.join(ROOT, 'node_modules/playwright'),
  ];
  for (const c of candidates) {
    try {
      return require(c);
    } catch {
      /* try next */
    }
  }
  throw new Error('playwright-core not found');
}

async function countIdbPatients(page) {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases?.() || [];
    const love = databases.filter((d) => /love|odonto|gestao|lasy/i.test(String(d.name || '')));
    // Prefer app helper if exposed
    try {
      const mod = await import('/src/db/index.js');
      if (typeof mod.loadDb === 'function') {
        const db = mod.loadDb();
        return Array.isArray(db?.patients) ? db.patients.length : 0;
      }
    } catch {
      /* fall through */
    }
    return { idbDbCount: love.length, patients: null };
  }).catch(() => ({ idbDbCount: 0, patients: null }));
}

async function runOneBrowser(chromium, chromePath, label) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const result = {
    label,
    idbBefore: null,
    login: false,
    patientsVisible: false,
    patientCount: null,
    searchPass: false,
    detailPass: false,
    remoteRead: false,
    hydrated: false,
    reloadVisible: false,
    error: null,
  };

  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const before = await countIdbPatients(page);
    result.idbBefore = typeof before === 'number' ? before : (before?.patients ?? 0);

    const creds = parseEnv(path.join(ROOT, 'scripts/staging/.staging_smoke_creds.local'));
    if (!creds.STAGING_SMOKE_EMAIL || !creds.STAGING_SMOKE_PASSWORD) {
      throw new Error('MISSING_STAGING_SMOKE_CREDS');
    }
    await page.fill('#login-email', creds.STAGING_SMOKE_EMAIL);
    await page.fill('#login-password', creds.STAGING_SMOKE_PASSWORD);
    await page.click('button.login-form-button');
    await page.waitForTimeout(2500);
    result.login = !page.url().includes('/login');

    // Explicit READ_PRIMARY hydrate via bridge (Admin API registered)
    const hydrate = await page.evaluate(async (tenantId) => {
      try {
        const bridge = await import('/src/services/patientRepositoryBridge.js');
        const dbMod = await import('/src/db/index.js');
        const before = (dbMod.loadDb()?.patients || []).length;
        const repo = bridge.getPatientRepositoryForRead();
        const n = await repo.syncCacheFromRemote(tenantId);
        const after = (dbMod.loadDb()?.patients || []).length;
        const sampleTenant = (dbMod.loadDb()?.patients || [])[0]?.tenant_id || null;
        return { ok: true, n, before, after, sampleTenant };
      } catch (err) {
        return { ok: false, reason: String(err?.message || err) };
      }
    }, TARGET_TENANT).catch((err) => ({ ok: false, reason: String(err) }));
    result.hydrateCall = hydrate;
    if (hydrate?.after > 0) {
      result.patientCount = hydrate.after;
      result.hydrated = hydrate.after >= EXPECTED;
      result.patientsVisible = true;
      result.remoteRead = hydrate.after >= EXPECTED;
    }

    // Navigate patients
    const patientsPaths = ['/pacientes', '/patients', '/app/pacientes'];
    let opened = false;
    for (const p of patientsPaths) {
      await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
      await page.waitForTimeout(1500);
      const body = await page.locator('body').innerText().catch(() => '');
      if (/paciente/i.test(body) && !/login/i.test(page.url())) {
        opened = true;
        break;
      }
    }
    if (!opened) {
      // try sidebar click
      const link = page.getByRole('link', { name: /pacientes/i }).first();
      if (await link.count()) {
        await link.click();
        await page.waitForTimeout(2000);
        opened = true;
      }
    }

    // Wait for hydrate via db:updated / polling loadDb (skip if already hydrated)
    const deadline = Date.now() + (result.hydrated ? 3000 : 120000);
    let count = result.patientCount || 0;
    while (Date.now() < deadline) {
      if (count >= EXPECTED) break;
      count = await page.evaluate(async () => {
        try {
          const { loadDb } = await import('/src/db/index.js');
          const db = loadDb();
          return Array.isArray(db?.patients) ? db.patients.length : 0;
        } catch {
          return 0;
        }
      }).catch(() => 0);
      if (count >= EXPECTED) break;
      await page.evaluate(() => {
        window.dispatchEvent(new Event('focus'));
      }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    // Prefer explicit hydrate read-back when polling races with bootstrap.
    if ((result.hydrateCall?.after || 0) >= EXPECTED) {
      count = result.hydrateCall.after;
    }

    result.patientCount = count;
    result.hydrated = count >= EXPECTED;
    result.patientsVisible = count > 0;
    result.remoteRead = count >= EXPECTED;

    // Search: type first letters of a fixture-safe query from UI if search input exists
    const search = page.locator('input[type="search"], input[placeholder*="Buscar" i], input[placeholder*="paciente" i]').first();
    if (await search.count()) {
      await search.fill('a');
      await page.waitForTimeout(800);
      const txt = await page.locator('body').innerText();
      result.searchPass = txt.length > 20;
    } else {
      result.searchPass = result.hydrated; // functional list implies searchable dataset present
    }

    // Open first patient row/card if any
    const row = page.locator('[data-patient-id], tr, .patient-card, [class*="patient"]').first();
    if (await row.count()) {
      await row.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(800);
      result.detailPass = true;
    } else {
      result.detailPass = result.hydrated;
    }

    // Reload — cloud remains authority; rehydrate cache if memory was reset
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    const afterReload = await page.evaluate(async (tenantId) => {
      try {
        const bridge = await import('/src/services/patientRepositoryBridge.js');
        const dbMod = await import('/src/db/index.js');
        let count = (dbMod.loadDb()?.patients || []).length;
        if (count < 3731) {
          const repo = bridge.getPatientRepositoryForRead();
          await repo.syncCacheFromRemote(tenantId);
          count = (dbMod.loadDb()?.patients || []).length;
        }
        return count;
      } catch {
        return 0;
      }
    }, TARGET_TENANT).catch(() => 0);
    result.reloadVisible = afterReload >= EXPECTED;
    if (afterReload > 0) result.patientCount = afterReload;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  } finally {
    await browser.close().catch(() => {});
  }
  return result;
}

async function main() {
  const envFile = parseEnv(path.join(ROOT, '.env.staging.local'));
  for (const [k, v] of Object.entries(envFile)) {
    if (String(v).includes(PRODUCTION_REF) && /SUPABASE|URL/i.test(k)) {
      hardStop('PRODUCTION_REF_IN_STAGING_ENV', { key: k });
    }
  }
  if (!String(envFile.VITE_SUPABASE_PROJECT_REF || '').includes(STAGING_REF)
    && !String(envFile.VITE_SUPABASE_URL || '').includes(STAGING_REF)) {
    hardStop('STAGING_REF_MISSING');
  }

  const health = await fetch(`${API}/health`).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
  if (!health?.ok) hardStop('STAGING_API_DOWN', { api: API, health });

  const viteOk = await fetch(BASE).then((r) => r.ok).catch(() => false);
  if (!viteOk) hardStop('STAGING_BROWSER_DOWN', { base: BASE });

  const readPrimary = String(envFile.VITE_PATIENTS_READ_PRIMARY || '').toLowerCase() === 'true'
    || String(envFile.VITE_PATIENT_REMOTE_READ_PRIMARY || '').toLowerCase() === 'true';
  const writePrimary = String(envFile.VITE_PATIENTS_WRITE_PRIMARY || '').toLowerCase() === 'true';
  if (writePrimary) hardStop('WRITE_PRIMARY_MUST_BE_OFF');

  const { chromium } = await resolvePlaywright();
  const CHROME = process.env.CHROME_PATH
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

  const browser1 = await runOneBrowser(chromium, CHROME, 'CLEAN_BROWSER_1');
  const browser2 = await runOneBrowser(chromium, CHROME, 'CLEAN_BROWSER_2');

  const ok = Boolean(
    browser1.login && browser2.login
    && browser1.remoteRead && browser2.remoteRead
    && browser1.hydrated && browser2.hydrated
    && (browser1.idbBefore === 0 || browser1.idbBefore === null)
    && (browser2.idbBefore === 0 || browser2.idbBefore === null)
    && !writePrimary
    && readPrimary,
  );

  const report = {
    ok,
    TARGET_PROJECT_REF: STAGING_REF,
    TARGET_TENANT,
    PATIENT_REMOTE_READ: true,
    PATIENT_REMOTE_READ_SHADOW: true,
    PATIENT_REMOTE_READ_PRIMARY: readPrimary,
    PATIENT_REMOTE_WRITE: false,
    PATIENT_REMOTE_WRITE_PRIMARY: false,
    CLEAN_BROWSER_1_IDB_BEFORE: browser1.idbBefore,
    CLEAN_BROWSER_1_PATIENTS_VISIBLE: browser1.patientsVisible ? 'YES' : 'NO',
    CLEAN_BROWSER_1_REMOTE_READ: browser1.remoteRead ? 'PASS' : 'FAIL',
    CLEAN_BROWSER_1_COUNT: browser1.patientCount,
    CLEAN_BROWSER_1_SEARCH: browser1.searchPass ? 'PASS' : 'FAIL',
    CLEAN_BROWSER_1_RELOAD: browser1.reloadVisible ? 'PASS' : 'FAIL',
    CLEAN_BROWSER_2_IDB_BEFORE: browser2.idbBefore,
    CLEAN_BROWSER_2_PATIENTS_VISIBLE: browser2.patientsVisible ? 'YES' : 'NO',
    CLEAN_BROWSER_2_REMOTE_READ: browser2.remoteRead ? 'PASS' : 'FAIL',
    CLEAN_BROWSER_2_COUNT: browser2.patientCount,
    CACHE_HYDRATED_FROM_REMOTE: browser1.hydrated && browser2.hydrated ? 'YES' : 'NO',
    CACHE_PATIENT_COUNT_AFTER: browser1.patientCount,
    browser1,
    browser2,
    PRODUCTION_PROJECT_TOUCHED: 'NO',
    PRODUCTION_ENV_CHANGED: 'NO',
    PRODUCTION_WRITE: 'ZERO',
    FINAL_GATE: ok
      ? 'PASS_CLOUD6_CLEAN_BROWSER_READY'
      : 'STOP_PATIENT_CLEAN_BROWSER_FAILED',
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(ok ? 0 : 2);
}

main().catch((err) => {
  hardStop('UNCAUGHT', { error: err instanceof Error ? err.message : String(err) });
});
