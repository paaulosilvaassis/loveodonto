#!/usr/bin/env node
/** PHASE_10.21AC — Diagnóstico rápido: createContractDraft permanece no cache após save. */
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
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.fill('#login-email', creds.STAGING_SMOKE_EMAIL);
  await page.fill('#login-password', creds.STAGING_SMOKE_PASSWORD);
  await page.click('button.login-form-button');
  await page.waitForURL('**/gestao/**', { timeout: 45000 });
  await page.waitForTimeout(1000);

  const result = await page.evaluate(async () => {
    const { initDb, loadDb, flushDbPersistence, withDb } = await import('/src/db/index.js');
    await initDb();

    withDb((db) => {
      const now = new Date().toISOString();
      const tenantId = db.tenants?.[0]?.id || 'tenant-1';
      if (!Array.isArray(db.tenants) || db.tenants.length === 0) {
        db.tenants = [{ id: tenantId, name: 'Diag AC', status: 'active', created_at: now, updated_at: now }];
      }
      if (!Array.isArray(db.patients)) db.patients = [];
      if (!db.patients.some((p) => p.id === 'patient-diag-ac')) {
        db.patients.push({
          id: 'patient-diag-ac',
          guid: crypto.randomUUID(),
          full_name: 'Paciente Diag AC',
          status: 'active',
          tenant_id: tenantId,
          created_at: now,
          updated_at: now,
        });
      }
      return db;
    });
    await flushDbPersistence();

    const patientsAfterSeed = (loadDb().patients || []).map((p) => p.id);
    const before = (loadDb().generatedContracts || []).length;

    const sess = JSON.parse(localStorage.getItem('appgestaoodonto.session') || '{}');
    const user = sess.cachedUser || sess;
    const { getPatient } = await import('/src/services/patientService.js');
    const patientCheck = getPatient('patient-diag-ac');

    const { createContractDraft, ensureContractsModuleSeeded } = await import('/src/services/contractModuleService.js');
    const { listContractTemplates } = await import('/src/services/contractService.js');
    ensureContractsModuleSeeded();
    const patientsAfterSeed2 = (loadDb().patients || []).map((p) => p.id);
    const templates = listContractTemplates();
    const tpl = templates.find((t) => t.type === 'system_default') || templates[0];

    let row = null;
    let createError = null;
    try {
      row = createContractDraft(user, {
        quoteSource: 'clinical_budget',
        quoteId: 'appt-diag-ac',
        patientId: 'patient-diag-ac',
        budgetId: 'budget-diag-ac',
        templateId: tpl?.id,
        editedHtml: '<p>diag</p>',
        skipHashtagValidation: true,
      });
    } catch (e) {
      createError = String(e.message || e).slice(0, 300);
    }

    const mid = loadDb().generatedContracts || [];
    const foundMid = row ? mid.find((c) => c.id === row.id) : null;

    await flushDbPersistence();
    const afterFlush = loadDb().generatedContracts || [];
    const foundFlush = row ? afterFlush.find((c) => c.id === row.id) : null;

    await initDb();
    const afterInit = loadDb().generatedContracts || [];
    const foundInit = row ? afterInit.find((c) => c.id === row.id) : null;

    if (row) {
      withDb((db) => {
        const arr = db.generatedContracts || [];
        const idx = arr.findIndex((c) => c.id === row.id);
        if (idx >= 0) arr[idx] = { ...arr[idx], metadata: { ...(arr[idx].metadata || {}), nested: true } };
        withDb((inner) => {
          inner.contractEvents = inner.contractEvents || [];
          inner.contractEvents.push({ id: 'evt-diag', contractId: row.id });
          return inner;
        });
        return db;
      });
    }
    await flushDbPersistence();
    const afterNested = row
      ? (loadDb().generatedContracts || []).find((c) => c.id === row.id)
      : null;

    return {
      patientsAfterSeed,
      patientsAfterSeed2,
      patientCheck: Boolean(patientCheck?.profile),
      createError,
      before,
      rowId: row?.id || null,
      rowStatus: row?.status || null,
      midTotal: mid.length,
      foundMid: Boolean(foundMid),
      afterFlushTotal: afterFlush.length,
      foundFlush: Boolean(foundFlush),
      afterInitTotal: afterInit.length,
      foundInit: Boolean(foundInit),
      nestedOk: Boolean(afterNested?.metadata?.nested),
      eventsHas: (loadDb().contractEvents || []).some((e) => e.id === 'evt-diag'),
      trace: (window.__STAGING_DB_TRACE__ || []).slice(-10),
    };
  });

  console.log(JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(ROOT, 'docs/reports/_phase1021ac_persist_probe.json'), JSON.stringify(result, null, 2));
  await browser.close();
  const ok = result.foundMid && result.foundFlush && result.foundInit && result.nestedOk && !result.createError;
  process.exit(ok ? 0 : 2);
}

main().catch((e) => {
  console.log(JSON.stringify({ error: String(e.message || e) }));
  process.exit(2);
});
