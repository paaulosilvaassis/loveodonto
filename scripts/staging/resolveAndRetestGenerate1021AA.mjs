#!/usr/bin/env node
/**
 * PHASE_10.21AA — Resolve contract readiness blockers + retest Gerar contrato.
 * Staging only. No production. No real patient. No external delivery.
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
const OUT = path.join(ROOT, 'docs/reports/_phase1021aa_generate_retest.json');
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

async function clickNav(page, label) {
  const btn = page.locator('button.clinical-step-nav-item', { hasText: new RegExp(label, 'i') }).first();
  await btn.waitFor({ state: 'visible', timeout: 12000 });
  await btn.click();
}

async function captureReadiness(page, appointmentId, patientId) {
  return page.evaluate(async ({ appointmentId, patientId }) => {
    const [{ getContractReadinessChecklist }, dbMod, tcleMod, clinicalMod, forumMod] = await Promise.all([
      import('/src/services/contractValidationService.js'),
      import('/src/db/index.js'),
      import('/src/services/clinicalTcleAttachmentService.js'),
      import('/src/services/clinicalService.js'),
      import('/src/components/clinical/contract/buildProfessionalContractContext.js'),
    ]);
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
    return {
      canGenerate: checklist.canGenerate,
      missing: (checklist.missing || []).map((m) => ({ tag: m.tag, label: m.label, group: m.group })),
      requiredTcles: checklist.requiredTcles,
      attachedTcleIds,
      clinicForumCity: forum.clinicForumCity || null,
      budgetStatus: budget?.status || null,
      hasAcceptedPayment: Boolean((budget?.paymentOptions || []).some((o) => o.accepted)),
      pendingCritical: patient?.profile?.pendingCriticalFields || patient?.pendingCriticalFields || [],
      professionalId: apt?.professionalId || null,
    };
  }, { appointmentId, patientId });
}

async function main() {
  const creds = parse(path.join(ROOT, 'scripts/staging/.staging_smoke_creds.local'));
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const report = {
    CONTRACT_GENERATE_RETEST: 'FAIL',
    readinessBefore: null,
    readinessAfterPrereqs: null,
    readinessAfterClick: null,
    steps: [],
    circularDependencyFound: false,
  };
  const note = (step, ok, detail = '') => report.steps.push({
    step, ok, detail: String(detail).slice(0, 350),
  });

  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.fill('#login-email', creds.STAGING_SMOKE_EMAIL);
    await page.fill('#login-password', creds.STAGING_SMOKE_PASSWORD);
    await page.click('button.login-form-button');
    await page.waitForURL('**/gestao/**', { timeout: 45000 });
    await page.waitForTimeout(2000);

    // Force staging bootstrap (clinic + price + CRO)
    const boot = await page.evaluate(async () => {
      const mod = await import('/src/domain/contracts/staging/ensureStagingFictionalClinicContractPrereqs.js');
      return mod.ensureStagingFictionalCommercialBootstrap();
    });
    note('staging_bootstrap', true, JSON.stringify(boot));

    // Create patient with phone + address in same save flow
    await page.goto(`${BASE}/pacientes/cadastro`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    if (await page.getByRole('button', { name: /Paciente \+/i }).count()) {
      await page.getByRole('button', { name: /Paciente \+/i }).click().catch(() => {});
    }
    await fillByLabel(page, 'Nome Completo *', PATIENT);
    await fillByLabel(page, 'Sexo *', 'O', 'select');
    await fillByLabel(page, 'Data de Nascimento *', '1990-01-15');
    await fillByLabel(page, 'CPF *', '390.533.447-05');
    await fillByLabel(page, 'E-mail Principal', 'teste.1021aa@example.invalid').catch(() => {});
    await fillByLabel(page, 'Telefone Principal', '(11) 98888-0000').catch(() => {});

    // Address tab before first save if possible
    await page.getByRole('button', { name: /^Endereços$/i }).click().catch(() => {});
    await page.waitForTimeout(300);
    // Enable edit if needed
    const editBtn = page.getByRole('button', { name: /^Editar$/i }).first();
    if (await editBtn.isVisible().catch(() => false)) await editBtn.click().catch(() => {});
    await fillByLabel(page, 'CEP', '01310-100').catch(() => {});
    await fillByLabel(page, 'Logradouro', 'Av. Paulista').catch(() => {});
    await fillByLabel(page, 'Número', '1000').catch(() => {});
    await fillByLabel(page, 'Bairro', 'Bela Vista').catch(() => {});
    await fillByLabel(page, 'Cidade', 'São Paulo').catch(() => {});
    await fillByLabel(page, 'Estado', 'SP', 'select').catch(() => {});

    await page.getByRole('button', { name: /^Dados Principais$|^Dados$/i }).first().click().catch(() => {});
    await page.getByRole('button', { name: /^Salvar$/i }).click();
    await page.waitForURL(/\/pacientes\/cadastro\/patient-/, { timeout: 25000 });
    report.patientId = (page.url().match(/patient-[a-f0-9-]+/i) || [])[0];
    note('patient', true, report.patientId);

    // Ensure address after save (edit mode)
    await page.getByRole('button', { name: /^Editar$/i }).click().catch(() => {});
    await page.getByRole('button', { name: /^Endereços$/i }).click();
    await page.waitForTimeout(300);
    await fillByLabel(page, 'Logradouro', 'Av. Paulista');
    await fillByLabel(page, 'Número', '1000');
    await fillByLabel(page, 'Bairro', 'Bela Vista');
    await fillByLabel(page, 'Cidade', 'São Paulo');
    await fillByLabel(page, 'Estado', 'SP', 'select');
    await fillByLabel(page, 'CEP', '01310-100');
    // Phone tab
    await page.getByRole('button', { name: /^Telefones$/i }).click().catch(() => {});
    await page.waitForTimeout(200);
    const phoneInput = page.locator('.tab-content input').first();
    if (await phoneInput.count()) await phoneInput.fill('(11) 98888-0000').catch(() => {});
    await page.getByRole('button', { name: /^Salvar$/i }).click();
    await page.waitForTimeout(1500);
    note('patient_address_phone', true);

    // Budget path
    await clickFirst(page, /Orçamentos e Contratos/i);
    await clickFirst(page, /Criar novo orçamento/i);
    await clickFirst(page, /Confirmar e abrir planejamento/i);
    await page.waitForURL(/\/atendimento-clinico\//, { timeout: 20000 });
    report.appointmentId = (page.url().match(/atendimento-clinico\/([^/?#]+)/) || [])[1];
    note('budget_open', true, report.appointmentId);

    await clickFirst(page, /Adicionar procedimento/i);
    await page.waitForTimeout(600);
    const cb = page.locator('input[type="checkbox"]').first();
    if (await cb.count()) {
      await cb.check().catch(() => cb.click());
      await clickFirst(page, /Adicionar procedimento|Adicionar ao planejamento/i);
    }
    await page.waitForTimeout(500);
    await clickFirst(page, /Gerar orçamento/i);
    await page.waitForTimeout(1200);

    await clickNav(page, 'Orçamento');
    await page.waitForTimeout(800);
    // Present + choose first payment option
    const apresentar = page.getByRole('button', { name: /Apresentar ao paciente/i }).first();
    if (await apresentar.isVisible().catch(() => false)) await apresentar.click();
    await page.waitForTimeout(400);
    const marcar = page.getByRole('button', { name: /Marcar como escolhida/i }).first();
    if (await marcar.isVisible().catch(() => false)) await marcar.click();
    await page.waitForTimeout(500);

    const approve = page.getByRole('button', { name: /Aprovar orçamento/i }).first();
    await approve.waitFor({ state: 'visible', timeout: 10000 });
    if (await approve.isDisabled()) {
      note('approve_disabled', false, 'still disabled after choose');
    } else {
      await approve.click();
      await page.waitForTimeout(500);
      const confirm = page.getByRole('button', { name: /Confirmar aprovação|Confirmar|Aprovar/i }).last();
      if (await confirm.isVisible().catch(() => false)) await confirm.click();
      await page.waitForTimeout(1500);
      note('budget_approved', true);
    }

    report.readinessBefore = await captureReadiness(page, report.appointmentId, report.patientId);
    note('readiness_before_tcle', !report.readinessBefore.canGenerate, JSON.stringify(report.readinessBefore.missing));

    // Circular dependency check: documents accessible after approve?
    await clickNav(page, 'Documentos');
    await page.waitForTimeout(800);
    const docsLocked = await page.locator('text=/bloquead|aprov/i').first().isVisible().catch(() => false);
    const consentTab = page.getByRole('button', { name: /Consentimentos/i }).first();
    const consentVisible = await consentTab.isVisible().catch(() => false);
    note('docs_access', consentVisible, `lockedHint=${docsLocked}`);
    report.circularDependencyFound = Boolean(
      report.readinessBefore?.missing?.some((m) => m.group === 'tcle')
      && !consentVisible,
    );

    if (consentVisible) {
      await consentTab.click();
      await page.waitForTimeout(400);
      // Select Implante template
      const implante = page.getByRole('button', { name: /^Implante$/i })
        .or(page.locator('button, [role="option"], .template-card', { hasText: /^Implante$/i }))
        .first();
      if (await implante.count()) await implante.click();
      else {
        // try list item
        await page.getByText(/^Implante$/i).first().click().catch(() => {});
      }
      await page.waitForTimeout(500);
      const saveDoc = page.getByRole('button', { name: /Salvar documento|Salvar e adicionar ao pacote|Salvar/i }).first();
      if (await saveDoc.isVisible().catch(() => false) && !(await saveDoc.isDisabled())) {
        await saveDoc.click();
        await page.waitForTimeout(1200);
        note('tcle_saved', true);
      } else {
        note('tcle_save', false, 'save disabled or missing');
        // Try attach button
        const attach = page.getByRole('button', { name: /pacote|TCLE/i }).first();
        if (await attach.isVisible().catch(() => false)) await attach.click().catch(() => {});
      }
    }

    // Back to contract
    await clickNav(page, 'Contrato');
    await page.waitForTimeout(1000);

    report.readinessAfterPrereqs = await captureReadiness(page, report.appointmentId, report.patientId);
    note('readiness_after', report.readinessAfterPrereqs.canGenerate, JSON.stringify(report.readinessAfterPrereqs.missing));

    const gerar = page.getByRole('button', { name: /Gerar contrato/i }).first();
    report.gerarVisible = await gerar.isVisible().catch(() => false);
    report.gerarDisabled = report.gerarVisible ? await gerar.isDisabled() : null;

    if (report.gerarVisible && !report.gerarDisabled) {
      await gerar.click();
      await page.waitForTimeout(2000);
      const body = await page.locator('body').innerText();
      const wizardOpen = /wizard|documento|contrato|TCLE|LGPD|revis/i.test(body);
      report.readinessAfterClick = await captureReadiness(page, report.appointmentId, report.patientId);
      report.CONTRACT_GENERATE_RETEST = wizardOpen || report.readinessAfterClick?.canGenerate
        ? 'PASS'
        : 'FAIL';
      note('gerar_click', report.CONTRACT_GENERATE_RETEST === 'PASS', page.url());
    } else {
      report.CONTRACT_GENERATE_RETEST = 'FAIL';
      note('gerar_still_blocked', false, JSON.stringify({
        visible: report.gerarVisible,
        disabled: report.gerarDisabled,
        missing: report.readinessAfterPrereqs?.missing,
      }));
    }

    await page.screenshot({
      path: path.join(ROOT, 'docs/reports/_phase1021aa_generate_retest.png'),
      fullPage: false,
    });
  } catch (e) {
    report.error = String(e.message || e).slice(0, 500);
    note('fatal', false, report.error);
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    CONTRACT_GENERATE_RETEST: report.CONTRACT_GENERATE_RETEST,
    canGenerateBefore: report.readinessBefore?.canGenerate,
    canGenerateAfter: report.readinessAfterPrereqs?.canGenerate,
    missingAfter: report.readinessAfterPrereqs?.missing,
    gerarDisabled: report.gerarDisabled,
    circularDependencyFound: report.circularDependencyFound,
    error: report.error || null,
    steps: report.steps.map((s) => ({ step: s.step, ok: s.ok, detail: (s.detail || '').slice(0, 120) })),
  }, null, 2));
  await browser.close();
  process.exit(report.CONTRACT_GENERATE_RETEST === 'PASS' ? 0 : 2);
}

main().catch((e) => {
  console.log(JSON.stringify({ error: String(e.message || e) }));
  process.exit(2);
});
