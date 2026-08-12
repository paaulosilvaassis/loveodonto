#!/usr/bin/env node
/**
 * PHASE_10.21AA — Capture contract readiness for staging smoke path.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/tmp/pw1021y/node_modules/playwright-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'http://127.0.0.1:5188';
const OUT = path.join(ROOT, 'docs/reports/_phase1021aa_readiness_capture.json');
const PATIENT = `TESTE PACKAGE MANIFEST BROWSER 1021AA ${Date.now().toString(36)}`;

function parse(p) {
  const o = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    o[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/\r/g, '');
  }
  return o;
}

async function fillByLabel(page, label, value, kind = 'input') {
  const field = page.locator('.form-field', { has: page.locator(`label:text-is("${label}")`) }).first();
  if (!(await field.count())) return false;
  if (kind === 'select') await field.locator('select').selectOption(value);
  else await field.locator('input,textarea').first().fill(value);
  return true;
}

async function clickFirst(page, nameRe, timeout = 12000) {
  const btn = page.getByRole('button', { name: nameRe }).first();
  await btn.waitFor({ state: 'visible', timeout });
  if (await btn.isDisabled()) throw new Error(`disabled:${String(nameRe)}`);
  await btn.click();
}

async function main() {
  const creds = parse(path.join(ROOT, 'scripts/staging/.staging_smoke_creds.local'));
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const report = { ok: false, steps: [] };
  const note = (step, ok, detail = '') => report.steps.push({ step, ok, detail: String(detail).slice(0, 400) });

  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.fill('#login-email', creds.STAGING_SMOKE_EMAIL);
    await page.fill('#login-password', creds.STAGING_SMOKE_PASSWORD);
    await page.click('button.login-form-button');
    await page.waitForURL('**/gestao/**', { timeout: 45000 });
    await page.waitForTimeout(1500);

    // Seed clinic + patient address data via page evaluate on IDB after login (official stores)
    // First capture current clinic profile emptiness
    const clinicSnap = await page.evaluate(async () => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('appgestaoodonto');
        r.onerror = () => rej(r.error);
        r.onsuccess = () => res(r.result);
      });
      const get = (k) => new Promise((res, rej) => {
        const tx = db.transaction('data', 'readonly');
        const req = tx.objectStore('data').get(k);
        req.onsuccess = () => res(req.result?.v);
        req.onerror = () => rej(req.error);
      });
      const clinicProfile = await get('clinicProfile') || {};
      const clinicDoc = await get('clinicDocumentation') || {};
      const clinicAddresses = await get('clinicAddresses') || [];
      const priceTables = await get('priceTables') || [];
      const procs = await get('priceTableProcedures') || [];
      return {
        hasClinicName: Boolean(clinicProfile.razaoSocial || clinicProfile.nomeFantasia || clinicProfile.name),
        hasCnpj: Boolean(clinicDoc.cnpj || clinicProfile.cnpj),
        hasCro: Boolean(clinicProfile.responsavelTecnicoNome || clinicDoc.responsavelTecnicoCRO || clinicProfile.cro),
        clinicAddresses: clinicAddresses.length,
        priceTables: priceTables.length,
        procs: procs.length,
        clinicKeys: Object.keys(clinicProfile || {}).slice(0, 20),
        docKeys: Object.keys(clinicDoc || {}).slice(0, 20),
      };
    });
    note('clinic_snap', true, JSON.stringify(clinicSnap));
    report.clinicSnap = clinicSnap;

    await page.goto(`${BASE}/pacientes/cadastro`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    if (await page.getByRole('button', { name: /Paciente \+/i }).count()) {
      await page.getByRole('button', { name: /Paciente \+/i }).click().catch(() => {});
    }
    await fillByLabel(page, 'Nome Completo *', PATIENT);
    await fillByLabel(page, 'Sexo *', 'O', 'select');
    await fillByLabel(page, 'Data de Nascimento *', '1990-01-15');
    await fillByLabel(page, 'CPF *', '390.533.447-05');
    await page.getByRole('button', { name: /^Salvar$/i }).click();
    await page.waitForURL(/\/pacientes\/cadastro\/patient-/, { timeout: 20000 });
    report.patientId = (page.url().match(/patient-[a-f0-9-]+/i) || [])[0];

    await clickFirst(page, /Orçamentos e Contratos/i);
    await clickFirst(page, /Criar novo orçamento/i);
    await clickFirst(page, /Confirmar e abrir planejamento/i);
    await page.waitForURL(/\/atendimento-clinico\//, { timeout: 20000 });
    report.appointmentId = (page.url().match(/atendimento-clinico\/([^/?#]+)/) || [])[1];

    // Add procedure if modal path works
    await clickFirst(page, /Adicionar procedimento/i).catch(() => {});
    await page.waitForTimeout(600);
    const cb = page.locator('input[type="checkbox"]').first();
    if (await cb.count()) {
      await cb.check().catch(() => cb.click());
      await clickFirst(page, /Adicionar procedimento|Adicionar ao planejamento/i);
    }
    await page.waitForTimeout(500);
    const genBudget = page.getByRole('button', { name: /Gerar orçamento/i }).first();
    if (await genBudget.isVisible().catch(() => false)) await genBudget.click();
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: /^Orçamento$/i }).first().click().catch(() => {});
    await page.waitForTimeout(700);
    const choose = page.getByRole('button', { name: /Escolher|Marcar como escolhida|Selecionar condição|Escolhida|Apresentar/i }).first();
    if (await choose.isVisible().catch(() => false)) await choose.click();
    await page.waitForTimeout(400);
    const approve = page.getByRole('button', { name: /Aprovar orçamento/i }).first();
    if (await approve.isVisible().catch(() => false) && !(await approve.isDisabled())) {
      await approve.click();
      await page.waitForTimeout(400);
      const confirm = page.getByRole('button', { name: /Confirmar|Aprovar/i }).last();
      if (await confirm.isVisible().catch(() => false)) await confirm.click();
      await page.waitForTimeout(1000);
    }

    await page.getByRole('button', { name: /^Contrato$/i }).first().click().catch(() => {});
    await page.waitForTimeout(1000);

    const gerar = page.getByRole('button', { name: /Gerar contrato/i }).first();
    report.gerarVisible = await gerar.isVisible().catch(() => false);
    report.gerarDisabled = report.gerarVisible ? await gerar.isDisabled() : null;

    // Capture checklist text from UI
    const body = await page.locator('body').innerText();
    report.uiSnippet = body.slice(0, 2500);
    const pendingItems = await page.locator('.contract-readiness li, .clinical-contract-block-reasons li, [data-testid="contract-readiness"] li').allTextContents().catch(() => []);
    report.pendingUiItems = pendingItems.slice(0, 30);

    // Inject evaluation of readiness using same services via dynamic import of source (Vite)
    const readiness = await page.evaluate(async ({ appointmentId, patientId }) => {
      // Prefer window hooks if present; else reconstruct from IDB + fetch modules
      const mods = await Promise.all([
        import('/src/services/contractValidationService.js'),
        import('/src/db/index.js'),
        import('/src/services/clinicalTcleAttachmentService.js'),
        import('/src/services/clinicalService.js'),
        import('/src/components/clinical/contract/buildProfessionalContractContext.js'),
        import('/src/components/clinical/ClinicalContractSection.jsx').catch(() => null),
      ]);
      const [{ getContractReadinessChecklist }, dbMod, tcleMod, clinicalMod, forumMod] = mods;
      await dbMod.initDb?.();
      const db = dbMod.loadDb();
      const budget = clinicalMod.getBudget?.(appointmentId) || null;
      const apt = (db.appointments || []).find((a) => a.id === appointmentId);
      const patient = (db.patients || []).find((p) => p.id === patientId);
      const attachedTcleIds = tcleMod.resolveAttachedTcleIdsFromClinicalDocuments?.({ patientId, appointmentId }) || [];
      const forum = forumMod.getClinicForumCityFromDb?.(db) || {};
      const checklist = getContractReadinessChecklist({
        quoteSource: 'clinical_budget',
        quoteId: appointmentId,
        patientId,
        currentUser: { id: 'smoke', role: 'admin', tenant_id: patient?.tenant_id },
        attachedTcleIds,
        strict: true,
      });
      const pendingCritical = patient?.profile?.pendingCriticalFields || patient?.pendingCriticalFields || [];
      const generateReadinessReasons = [];
      if (pendingCritical.length) generateReadinessReasons.push('Cadastro do paciente incompleto.');
      if (!apt?.professionalId) generateReadinessReasons.push('Profissional responsável não definido.');
      if (!forum.clinicForumCity) generateReadinessReasons.push('Forum/cidade clínica ausente');

      // redact map values that look like secrets - keep only emptiness flags
      const mapPresence = {};
      for (const [k, v] of Object.entries(checklist.map || {})) {
        mapPresence[k] = v == null || v === '' ? 'EMPTY' : 'PRESENT';
      }

      return {
        canGenerate: checklist.canGenerate,
        ok: checklist.ok,
        missing: checklist.missing,
        groups: Object.fromEntries(
          Object.entries(checklist.groups || {}).map(([g, items]) => [g, items.map((i) => ({ tag: i.tag, label: i.label }))]),
        ),
        requiredTcles: checklist.requiredTcles,
        attachedTcleIds,
        partyLabel: checklist.partyLabel,
        warnings: checklist.warnings,
        treatmentTypes: checklist.meta?.treatmentTypes || [],
        generateReadinessReasons,
        pendingCritical,
        professionalId: apt?.professionalId || null,
        clinicForumCity: forum.clinicForumCity || null,
        budgetId: budget?.id || null,
        budgetStatus: budget?.status || null,
        hasAcceptedPayment: Boolean((budget?.paymentOptions || []).some((o) => o.accepted)),
        mapPresence,
      };
    }, { appointmentId: report.appointmentId, patientId: report.patientId });

    report.readiness = readiness;
    report.ok = true;

    await page.screenshot({
      path: path.join(ROOT, 'docs/reports/_phase1021aa_contract_disabled.png'),
      fullPage: false,
    });
  } catch (e) {
    report.error = String(e.message || e).slice(0, 500);
    report.url = page.url();
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    gerarDisabled: report.gerarDisabled,
    canGenerate: report.readiness?.canGenerate,
    missing: report.readiness?.missing?.map((m) => m.label || m.tag),
    groups: report.readiness?.groups,
    generateReadinessReasons: report.readiness?.generateReadinessReasons,
    requiredTcles: report.readiness?.requiredTcles,
    attachedTcleIds: report.readiness?.attachedTcleIds,
    clinicForumCity: report.readiness?.clinicForumCity,
    error: report.error || null,
  }, null, 2));
  await browser.close();
  process.exit(report.readiness ? 0 : 2);
}

main().catch((e) => {
  console.log(JSON.stringify({ error: String(e.message || e) }));
  process.exit(2);
});
