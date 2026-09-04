#!/usr/bin/env node
/**
 * CLOUD.7 — Staging WRITE_PRIMARY validation (synthetic patient only).
 * STAGING ONLY. Never touches production. Never mutates the 3731 imported set.
 *
 * Usage (API :3011 + Vite :5188 running with WRITE_PRIMARY staging flags):
 *   node scripts/cloud7-patient-remote-write-validate.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/reports/CLOUD_7_PATIENT_REMOTE_WRITE.json');
const BASE = process.env.STAGING_BROWSER_BASE || 'http://127.0.0.1:5188';
const API = process.env.STAGING_API_BASE || 'http://127.0.0.1:3011';
const STAGING_REF = 'tckdjyunwmdpqmewrwvt';
const PRODUCTION_REF = 'uoepkwhqztmsjnzirpev';
const TARGET_TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const EXPECTED_ACTIVE = 3731;
const SYNTHETIC_TAG = 'cloud7-synthetic';
const SYNTHETIC_NAME = 'CLOUD7 TEST PATIENT';

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

function writeReport(report) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

function hardStop(reason, extra = {}) {
  const report = {
    ok: false,
    FINAL_GATE: reason.startsWith('STOP_') ? reason : 'STOP_PATIENT_WRITE_NOT_REMOTE_FIRST',
    reason,
    PRODUCTION_PROJECT_TOUCHED: 'NO',
    PRODUCTION_ENV_CHANGED: 'NO',
    PRODUCTION_WRITE: 'ZERO',
    PR15_MERGED: 'NO',
    ...extra,
  };
  writeReport(report);
  process.exit(2);
}

function refOf(url) {
  try {
    return new URL(url).host.split('.')[0];
  } catch {
    return null;
  }
}

function hashLegacyIds(ids) {
  const sorted = [...ids].sort();
  return crypto.createHash('sha256').update(sorted.join('\n')).digest('hex');
}

async function listActiveLegacyIds(supabase, tenantId) {
  const pageSize = 500;
  let from = 0;
  const ids = [];
  while (true) {
    const { data, error } = await supabase
      .from('patients')
      .select('legacy_id,updated_at')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('legacy_id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    for (const row of rows) ids.push(row.legacy_id);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}

async function countPhysical(supabase, tenantId) {
  const { count, error } = await supabase
    .from('patients')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  if (error) throw error;
  return count ?? 0;
}

async function countActive(supabase, tenantId) {
  const { count, error } = await supabase
    .from('patients')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);
  if (error) throw error;
  return count ?? 0;
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
      /* next */
    }
  }
  throw new Error('playwright-core not found');
}

function resolveChromeExecutable(pw) {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  try {
    const bundled = pw.chromium.executablePath();
    if (bundled && fs.existsSync(bundled)) candidates.unshift(bundled);
  } catch {
    /* ignore */
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('No Chrome/Chromium executable found');
}

async function loginPage(page, creds) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('#login-email', creds.STAGING_SMOKE_EMAIL);
  await page.fill('#login-password', creds.STAGING_SMOKE_PASSWORD);
  await page.click('button.login-form-button');
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (!page.url().includes('/login')) break;
    const hasSession = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('appgestaoodonto.session');
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return Boolean(parsed?.userId || parsed?.cachedUser?.id);
      } catch {
        return false;
      }
    }).catch(() => false);
    if (hasSession && !page.url().includes('/login')) break;
    if (hasSession) break;
    await page.waitForTimeout(500);
  }
  const sessionOk = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('appgestaoodonto.session');
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Boolean(parsed?.userId || parsed?.cachedUser?.id);
    } catch {
      return false;
    }
  }).catch(() => false);
  if (!sessionOk) throw new Error('LOGIN_FAILED');
}

async function browserEvalWrite(page, action, payload) {
  return page.evaluate(async ({ action, payload, tenantId }) => {
    const bridge = await import('/src/services/patientRepositoryBridge.js');
    bridge.__setPatientServiceBridgeFlagsForTest?.({
      overrides: {
        PATIENTS_READ: true,
        PATIENTS_READ_PRIMARY: true,
        PATIENTS_SHADOW: true,
        PATIENTS_WRITE: true,
        PATIENTS_WRITE_PRIMARY: true,
        PATIENTS_DUAL_WRITE: false,
      },
    });
    // Ensure remote clients registered
    bridge.getPatientRepositoryForRead?.();

    const svc = await import('/src/services/patientService.js');
    const { loadDb } = await import('/src/db/index.js');

    let user = null;
    try {
      const authStorage = await import('/src/auth/saasAuthStorage.js');
      const raw = localStorage.getItem(authStorage.SESSION_KEY);
      if (raw) {
        const stored = JSON.parse(raw);
        const cached = stored?.cachedUser || stored?.user || null;
        if (cached?.id || stored?.userId) {
          user = {
            ...(cached || {}),
            id: cached?.id || stored.userId,
            tenantId: stored.tenantId || cached?.tenantId,
            tenant_id: stored.tenantId || cached?.tenantId,
            role: cached?.role || 'admin',
            isMaster: Boolean(cached?.isMaster),
          };
        }
      }
    } catch {
      /* ignore */
    }
    if (!user?.id) {
      return { ok: false, error: 'NO_USER_IN_BROWSER' };
    }
    user = {
      ...user,
      tenantId: user.tenantId || user.tenant_id || tenantId,
      tenant_id: user.tenant_id || user.tenantId || tenantId,
      role: user.role || 'admin',
      isMaster: user.isMaster === true || ['admin', 'master', 'owner', 'gerente'].includes(String(user.role || '')),
    };

    const beforeIds = new Set((loadDb().patients || []).map((p) => p.id));

    try {
      if (action === 'create') {
        const created = await svc.createPatientQuick(user, payload, { allowNullCpf: true });
        const after = loadDb().patients || [];
        const inCache = after.some((p) => p.id === created.patientId);
        return {
          ok: true,
          legacyId: created.patientId,
          remoteCommitted: Boolean(created.remoteCommitted),
          cacheUpdated: Boolean(created.cacheUpdated ?? inCache),
          uiSuccessAfterRemote: Boolean(created.remoteCommitted),
          inCache,
        };
      }
      if (action === 'update') {
        const updated = await svc.updatePatientProfile(user, payload.patientId, {
          nickname: payload.nickname,
          tags: payload.tags,
        }, { allowNullCpf: true });
        const row = (loadDb().patients || []).find((p) => p.id === payload.patientId);
        return {
          ok: true,
          legacyId: payload.patientId,
          remoteCommitted: Boolean(updated.remoteCommitted),
          cacheUpdated: Boolean(updated.cacheUpdated ?? row?.nickname === payload.nickname),
          nickname: row?.nickname || updated.nickname,
        };
      }
      if (action === 'softDelete') {
        const deleted = await svc.softDeletePatient(user, payload.patientId);
        const row = (loadDb().patients || []).find((p) => p.id === payload.patientId);
        return {
          ok: true,
          legacyId: payload.patientId,
          remoteCommitted: Boolean(deleted.remoteCommitted),
          cacheUpdated: Boolean(deleted.cacheUpdated),
          status: row?.status,
          deletedAt: row?.deleted_at || null,
        };
      }
      if (action === 'failCreate') {
        // Force repository create to fail via factory override if possible
        const origFactory = null;
        bridge.__setPatientRepositoryFactoryForTest(() => ({
          createCore: async () => {
            throw new Error('CLOUD7_FORCED_REMOTE_FAIL');
          },
          hydratePatients: async () => 0,
        }));
        let threw = false;
        let localCommitted = false;
        try {
          await svc.createPatientQuick(user, {
            full_name: 'CLOUD7 SHOULD FAIL',
            sex: 'NI',
            birth_date: '2000-01-01',
            tags: [SYNTHETIC_TAG],
          }, { allowNullCpf: true });
        } catch {
          threw = true;
        }
        bridge.__setPatientRepositoryFactoryForTest(origFactory);
        const afterIds = new Set((loadDb().patients || []).map((p) => p.id));
        for (const id of afterIds) {
          if (!beforeIds.has(id)) {
            const p = (loadDb().patients || []).find((x) => x.id === id);
            if (p?.full_name === 'CLOUD7 SHOULD FAIL') localCommitted = true;
          }
        }
        return {
          ok: true,
          threw,
          localCommitted,
          uiSuccess: false,
        };
      }
      if (action === 'findByLegacy') {
        const row = (loadDb().patients || []).find((p) => p.id === payload.patientId);
        let remotePresent = null;
        try {
          const repo = bridge.getPatientRepositoryForRead();
          const remote = await repo.getCore(tenantId, payload.patientId);
          remotePresent = Boolean(remote && !remote.deletedAt);
        } catch {
          remotePresent = null;
        }
        const localActive = Boolean(row && row.status !== 'inactive' && !row.deleted_at);
        return {
          ok: true,
          found: remotePresent === false ? false : (remotePresent === true ? true : localActive),
          nickname: row?.nickname || null,
          status: row?.status || null,
          fullName: row?.full_name || null,
          localActive,
          remotePresent,
          deletedAt: row?.deleted_at || null,
        };
      }
      if (action === 'rehydrate') {
        const repo = bridge.getPatientRepositoryForRead();
        const n = await repo.syncCacheFromRemote(tenantId);
        return { ok: true, hydrated: n };
      }
      return { ok: false, error: 'UNKNOWN_ACTION' };
    } catch (err) {
      return { ok: false, error: err?.message || String(err), code: err?.code || null };
    }
  }, { action, payload, tenantId: TARGET_TENANT });
}

async function main() {
  const env = {
    ...parseEnv(path.join(ROOT, '.env.staging.local')),
    ...process.env,
  };
  const url = env.STAGING_SUPABASE_URL || env.SUPABASE_URL || env.VITE_SUPABASE_APP_URL;
  const key = env.STAGING_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) hardStop('MISSING_STAGING_CREDENTIALS');
  if (refOf(url) !== STAGING_REF) hardStop('STOP_PATIENT_PRODUCTION_GUARD_FAILED', { ref: refOf(url) });
  if (String(url).includes(PRODUCTION_REF)) hardStop('STOP_PATIENT_PRODUCTION_GUARD_FAILED');

  const writeOn = env.VITE_PATIENTS_WRITE === 'true' || env.VITE_PATIENT_REMOTE_WRITE === 'true';
  const writePrimaryOn = env.VITE_PATIENTS_WRITE_PRIMARY === 'true'
    || env.VITE_PATIENT_REMOTE_WRITE_PRIMARY === 'true';
  if (!writeOn || !writePrimaryOn) {
    hardStop('STOP_PATIENT_WRITE_NOT_REMOTE_FIRST', {
      detail: 'Staging WRITE flags must be true before validation',
      VITE_PATIENTS_WRITE: env.VITE_PATIENTS_WRITE,
      VITE_PATIENTS_WRITE_PRIMARY: env.VITE_PATIENTS_WRITE_PRIMARY,
    });
  }

  // Health checks
  try {
    const apiHealth = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false);
    const viteHealth = await fetch(BASE).then((r) => r.ok).catch(() => false);
    if (!apiHealth || !viteHealth) {
      hardStop('STOP_PATIENT_WRITE_NOT_REMOTE_FIRST', {
        detail: 'API/Vite staging not running',
        apiHealth,
        viteHealth,
        API,
        BASE,
      });
    }
  } catch (err) {
    hardStop('STOP_PATIENT_WRITE_NOT_REMOTE_FIRST', { detail: String(err) });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const baselineIds = await listActiveLegacyIds(supabase, TARGET_TENANT);
  const baselineHash = hashLegacyIds(baselineIds);
  const baselineActive = baselineIds.length;
  const baselinePhysical = await countPhysical(supabase, TARGET_TENANT);

  if (baselineActive !== EXPECTED_ACTIVE) {
    hardStop('STOP_PATIENT_ORIGINAL_DATASET_CHANGED', {
      baselineActive,
      EXPECTED_ACTIVE,
    });
  }

  const creds = parseEnv(path.join(ROOT, 'scripts/staging/.staging_smoke_creds.local'));
  if (!creds.STAGING_SMOKE_EMAIL || !creds.STAGING_SMOKE_PASSWORD) {
    hardStop('MISSING_STAGING_SMOKE_CREDS');
  }

  const pw = await resolvePlaywright();
  const chromePath = resolveChromeExecutable(pw);
  const browserA = await pw.chromium.launch({ headless: true, executablePath: chromePath });
  const browserB = await pw.chromium.launch({ headless: true, executablePath: chromePath });
  const ctxA = await browserA.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browserB.newContext({ viewport: { width: 1440, height: 900 } });
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  let syntheticLegacyId = null;
  const report = {
    ok: false,
    STAGING_REF,
    TARGET_TENANT,
    PATIENT_REMOTE_READ_PRIMARY: true,
    PATIENT_REMOTE_WRITE: true,
    PATIENT_REMOTE_WRITE_PRIMARY: true,
    BASELINE_ACTIVE: baselineActive,
    BASELINE_PHYSICAL: baselinePhysical,
    BASELINE_HASH: baselineHash,
  };

  try {
    await loginPage(pageA, creds);
    await loginPage(pageB, creds);

    // Force hydrate browser B cache from remote (READ_PRIMARY)
    await browserEvalWrite(pageB, 'rehydrate', {});

    // CREATE — Browser A
    const createRes = await browserEvalWrite(pageA, 'create', {
      full_name: SYNTHETIC_NAME,
      sex: 'NI',
      birth_date: '2000-01-01',
      cpf: '',
      nickname: '',
      tags: [SYNTHETIC_TAG],
    });
    if (!createRes.ok || !createRes.remoteCommitted) {
      hardStop('STOP_PATIENT_CREATE_REMOTE_FAILED', { createRes });
    }
    syntheticLegacyId = createRes.legacyId;
    report.SYNTHETIC_LEGACY_ID = syntheticLegacyId;
    report.CREATE_REMOTE_COMMITTED = createRes.remoteCommitted ? 'YES' : 'NO';
    report.CREATE_UI_SUCCESS_AFTER_REMOTE = createRes.uiSuccessAfterRemote ? 'YES' : 'NO';
    report.CREATE_CACHE_UPDATED = createRes.cacheUpdated ? 'YES' : 'NO';

    // Prove row in Postgres
    const { data: createdRow, error: createdErr } = await supabase
      .from('patients')
      .select('legacy_id,full_name,cpf,deleted_at,tags,status')
      .eq('tenant_id', TARGET_TENANT)
      .eq('legacy_id', syntheticLegacyId)
      .maybeSingle();
    if (createdErr || !createdRow || createdRow.deleted_at) {
      hardStop('STOP_PATIENT_CREATE_REMOTE_FAILED', { createdRow, createdErr });
    }
    const activeAfterCreate = await countActive(supabase, TARGET_TENANT);
    if (activeAfterCreate !== EXPECTED_ACTIVE + 1) {
      hardStop('STOP_PATIENT_CREATE_REMOTE_FAILED', { activeAfterCreate });
    }

    // Browser B sees create via rehydrate
    await browserEvalWrite(pageB, 'rehydrate', {});
    const bCreate = await browserEvalWrite(pageB, 'findByLegacy', { patientId: syntheticLegacyId });
    report.BROWSER_B_CREATE_VISIBLE = bCreate.found ? 'YES' : 'NO';
    if (!bCreate.found) hardStop('STOP_PATIENT_MULTI_BROWSER_WRITE_FAILED', { bCreate });

    // UPDATE — Browser A
    const updateRes = await browserEvalWrite(pageA, 'update', {
      patientId: syntheticLegacyId,
      nickname: 'CLOUD7 UPDATED',
      tags: [SYNTHETIC_TAG],
    });
    if (!updateRes.ok || !updateRes.remoteCommitted) {
      hardStop('STOP_PATIENT_UPDATE_REMOTE_FAILED', { updateRes });
    }
    report.UPDATE_REMOTE_COMMITTED = 'YES';
    report.UPDATE_CACHE_UPDATED = updateRes.cacheUpdated ? 'YES' : 'NO';

    const { data: updatedRow } = await supabase
      .from('patients')
      .select('nickname')
      .eq('tenant_id', TARGET_TENANT)
      .eq('legacy_id', syntheticLegacyId)
      .maybeSingle();
    if (updatedRow?.nickname !== 'CLOUD7 UPDATED') {
      hardStop('STOP_PATIENT_UPDATE_REMOTE_FAILED', { updatedRow });
    }

    await browserEvalWrite(pageB, 'rehydrate', {});
    const bUpdate = await browserEvalWrite(pageB, 'findByLegacy', { patientId: syntheticLegacyId });
    report.BROWSER_B_UPDATE_VISIBLE = bUpdate.nickname === 'CLOUD7 UPDATED' ? 'YES' : 'NO';
    if (report.BROWSER_B_UPDATE_VISIBLE !== 'YES') {
      hardStop('STOP_PATIENT_MULTI_BROWSER_WRITE_FAILED', { bUpdate });
    }

    // Remote failure false-success check (Browser A, forced)
    const failRes = await browserEvalWrite(pageA, 'failCreate', {});
    report.REMOTE_FAILURE_FALSE_SUCCESS = failRes.threw && !failRes.uiSuccess ? 'NO' : 'YES';
    report.REMOTE_FAILURE_LOCAL_COMMITTED = failRes.localCommitted ? 'YES' : 'NO';
    if (report.REMOTE_FAILURE_FALSE_SUCCESS !== 'NO' || report.REMOTE_FAILURE_LOCAL_COMMITTED !== 'NO') {
      hardStop('STOP_PATIENT_REMOTE_FAILURE_FALSE_SUCCESS', { failRes });
    }

    // SOFT DELETE — Browser A
    const delRes = await browserEvalWrite(pageA, 'softDelete', { patientId: syntheticLegacyId });
    if (!delRes.ok || !delRes.remoteCommitted) {
      hardStop('STOP_PATIENT_DELETE_REMOTE_FAILED', { delRes });
    }
    report.SOFT_DELETE_REMOTE_COMMITTED = 'YES';

    const { data: deletedRow } = await supabase
      .from('patients')
      .select('legacy_id,deleted_at,status')
      .eq('tenant_id', TARGET_TENANT)
      .eq('legacy_id', syntheticLegacyId)
      .maybeSingle();
    report.SYNTHETIC_PHYSICAL_ROW_PRESERVED = deletedRow?.legacy_id ? 'YES' : 'NO';
    report.SYNTHETIC_HIDDEN_FROM_ACTIVE_READ = deletedRow?.deleted_at ? 'YES' : 'NO';
    if (!deletedRow?.deleted_at) hardStop('STOP_PATIENT_DELETE_REMOTE_FAILED', { deletedRow });

    await browserEvalWrite(pageB, 'rehydrate', {});
    const bDel = await browserEvalWrite(pageB, 'findByLegacy', { patientId: syntheticLegacyId });
    report.BROWSER_B_DELETE_VISIBLE = !bDel.found ? 'PASS' : 'FAIL';
    if (report.BROWSER_B_DELETE_VISIBLE !== 'PASS') {
      hardStop('STOP_PATIENT_MULTI_BROWSER_WRITE_FAILED', { bDel });
    }

    // Original dataset intact (exclude synthetic)
    const finalActiveIds = await listActiveLegacyIds(supabase, TARGET_TENANT);
    const finalWithoutSynthetic = finalActiveIds.filter((id) => id !== syntheticLegacyId);
    const finalHash = hashLegacyIds(finalWithoutSynthetic);
    const mutated = baselineIds.filter((id) => !finalWithoutSynthetic.includes(id))
      .concat(finalWithoutSynthetic.filter((id) => !baselineIds.includes(id)));

    report.ORIGINAL_PATIENT_COUNT = finalWithoutSynthetic.length;
    report.ORIGINAL_ID_PARITY = finalWithoutSynthetic.length === EXPECTED_ACTIVE
      && mutated.length === 0 ? 'PASS' : 'FAIL';
    report.ORIGINAL_HASH_PARITY = finalHash === baselineHash ? 'PASS' : 'FAIL';
    report.ORIGINAL_ROWS_MUTATED = mutated.length;
    report.ACTIVE_PATIENT_COUNT = await countActive(supabase, TARGET_TENANT);
    report.PHYSICAL_PATIENT_ROW_COUNT = await countPhysical(supabase, TARGET_TENANT);
    report.CACHE_CONTRACT_VALIDATED = (
      report.CREATE_CACHE_UPDATED === 'YES'
      && report.UPDATE_CACHE_UPDATED === 'YES'
      && report.BROWSER_B_DELETE_VISIBLE === 'PASS'
    ) ? 'YES' : 'NO';

    if (report.ORIGINAL_ID_PARITY !== 'PASS' || report.ORIGINAL_HASH_PARITY !== 'PASS') {
      hardStop('STOP_PATIENT_ORIGINAL_DATASET_CHANGED', { report });
    }
    if (report.ACTIVE_PATIENT_COUNT !== EXPECTED_ACTIVE) {
      hardStop('STOP_PATIENT_ORIGINAL_DATASET_CHANGED', {
        ACTIVE_PATIENT_COUNT: report.ACTIVE_PATIENT_COUNT,
      });
    }

    report.ok = true;
    report.FINAL_GATE = 'PASS_CLOUD7_PATIENT_REMOTE_WRITE_MULTI_BROWSER_VALIDATED';
    report.PRODUCTION_PROJECT_TOUCHED = 'NO';
    report.PRODUCTION_ENV_CHANGED = 'NO';
    report.PRODUCTION_WRITE = 'ZERO';
    report.PR15_MERGED = 'NO';
    writeReport(report);
  } catch (err) {
    // Best-effort cleanup of synthetic if left active
    if (syntheticLegacyId) {
      try {
        await supabase
          .from('patients')
          .update({ deleted_at: new Date().toISOString() })
          .eq('tenant_id', TARGET_TENANT)
          .eq('legacy_id', syntheticLegacyId)
          .is('deleted_at', null);
      } catch {
        /* ignore */
      }
    }
    hardStop('STOP_PATIENT_WRITE_NOT_REMOTE_FIRST', {
      error: err?.message || String(err),
      SYNTHETIC_LEGACY_ID: syntheticLegacyId,
      ...report,
    });
  } finally {
    await browserA.close().catch(() => {});
    await browserB.close().catch(() => {});
  }
}

main().catch((err) => {
  hardStop('STOP_PATIENT_WRITE_NOT_REMOTE_FIRST', { error: err?.message || String(err) });
});
