#!/usr/bin/env node
/**
 * PHASE_10.21AB — Diagnose finalize failure after draft (staging).
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
const OUT = path.join(ROOT, 'docs/reports/_phase1021ab_finalize_diag.json');

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

async function clickFirst(page, nameRe, timeout = 15000) {
  const btn = page.getByRole('button', { name: nameRe }).first();
  await btn.waitFor({ state: 'visible', timeout });
  if (await btn.isDisabled()) throw new Error(`disabled:${String(nameRe)}`);
  await btn.click();
}

async function clickNav(page, label) {
  const btn = page.locator('button.clinical-step-nav-item', { hasText: new RegExp(label, 'i') }).first();
  await btn.waitFor({ state: 'visible', timeout: 15000 });
  await btn.click();
}

async function bootstrap(page, creds) {
  const PATIENT = `TESTE AB FINALIZE DIAG ${Date.now().toString(36)}`;
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.fill('#login-email', creds.STAGING_SMOKE_EMAIL);
  await page.fill('#login-password', creds.STAGING_SMOKE_PASSWORD);
  await page.click('button.login-form-button');
  await page.waitForURL('**/gestao/**', { timeout: 45000 });
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const m = await import('/src/domain/contracts/staging/ensureStagingFictionalClinicContractPrereqs.js');
    m.ensureStagingFictionalCommercialBootstrap();
  });

  await page.goto(`${BASE}/pacientes/cadastro`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  if (await page.getByRole('button', { name: /Paciente \+/i }).count()) {
    await page.getByRole('button', { name: /Paciente \+/i }).click().catch(() => {});
  }
  await fillByLabel(page, 'Nome Completo *', PATIENT);
  await fillByLabel(page, 'Sexo *', 'O', 'select');
  await fillByLabel(page, 'Data de Nascimento *', '1990-01-15');
  await fillByLabel(page, 'CPF *', '390.533.447-05');
  await page.getByRole('button', { name: /^Salvar$/i }).click();
  await page.waitForURL(/\/pacientes\/cadastro\/patient-/, { timeout: 20000 });
  const patientId = (page.url().match(/patient-[a-f0-9-]+/i) || [])[0];

  await page.getByRole('button', { name: /^Editar$/i }).click().catch(() => {});
  await page.getByRole('button', { name: /^Endereços$/i }).click();
  await fillByLabel(page, 'Logradouro', 'Av. Paulista');
  await fillByLabel(page, 'Número', '1000');
  await fillByLabel(page, 'Bairro', 'Bela Vista');
  await fillByLabel(page, 'Cidade', 'São Paulo');
  await fillByLabel(page, 'Estado', 'SP', 'select');
  await fillByLabel(page, 'CEP', '01310-100');
  await page.getByRole('button', { name: /^Telefones$/i }).click().catch(() => {});
  const phoneInput = page.locator('.tab-content input').first();
  if (await phoneInput.count()) await phoneInput.fill('(11) 98888-0000').catch(() => {});
  await page.getByRole('button', { name: /^Salvar$/i }).click();
  await page.waitForTimeout(1000);

  await clickFirst(page, /Orçamentos e Contratos/i);
  await clickFirst(page, /Criar novo orçamento/i);
  await clickFirst(page, /Confirmar e abrir planejamento/i);
  await page.waitForURL(/\/atendimento-clinico\//, { timeout: 20000 });
  const appointmentId = (page.url().match(/atendimento-clinico\/([^/?#]+)/) || [])[1];

  await clickFirst(page, /Adicionar procedimento/i);
  await page.waitForTimeout(500);
  const cb = page.locator('input[type="checkbox"]').first();
  if (await cb.count()) {
    await cb.check().catch(() => cb.click());
    await clickFirst(page, /Adicionar procedimento|Adicionar ao planejamento/i);
  }
  await clickFirst(page, /Gerar orçamento/i);
  await page.waitForTimeout(800);
  await clickNav(page, 'Orçamento');
  await page.waitForTimeout(600);
  const apresentar = page.getByRole('button', { name: /Apresentar ao paciente/i }).first();
  if (await apresentar.isVisible().catch(() => false)) await apresentar.click();
  await page.waitForTimeout(300);
  const marcar = page.getByRole('button', { name: /Marcar como escolhida/i }).first();
  if (await marcar.isVisible().catch(() => false)) await marcar.click();
  await page.waitForTimeout(400);
  await clickFirst(page, /Aprovar orçamento/i);
  await page.waitForTimeout(400);
  const confirm = page.getByRole('button', { name: /Confirmar aprovação|Confirmar|Aprovar/i }).last();
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.waitForTimeout(1000);

  await clickNav(page, 'Documentos');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Consentimentos/i }).click();
  await page.waitForTimeout(300);
  await page.getByText(/^Implante$/i).first().click().catch(() => {});
  await page.waitForTimeout(400);
  const saveDoc = page.getByRole('button', { name: /Salvar documento|Salvar e adicionar ao pacote|Salvar/i }).first();
  if (await saveDoc.isVisible().catch(() => false) && !(await saveDoc.isDisabled())) await saveDoc.click();
  await page.waitForTimeout(1000);

  await clickNav(page, 'Contrato');
  await page.waitForTimeout(800);
  await clickFirst(page, /Gerar contrato/i);
  await page.waitForTimeout(1200);
  return { patientId, appointmentId };
}

async function main() {
  const creds = parse(path.join(ROOT, 'scripts/staging/.staging_smoke_creds.local'));
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleLogs = [];
  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error' || t === 'warning' || /finalize|hashtag|pendên|erro/i.test(msg.text())) {
      consoleLogs.push({ type: t, text: msg.text().slice(0, 400) });
    }
  });
  page.on('pageerror', (e) => consoleLogs.push({ type: 'pageerror', text: String(e.message || e).slice(0, 400) }));

  const report = { ok: false };
  try {
    const ids = await bootstrap(page, creds);
    report.ids = ids;

    await page.getByRole('button', { name: /Gerar rascunho/i }).first().click();
    await page.waitForTimeout(2500);

    const pre = await page.evaluate(async ({ patientId, appointmentId }) => {
      const [{ loadDb }, { findUnknownHashtags }, { getContractReadinessChecklist }] = await Promise.all([
        import('/src/db/index.js'),
        import('/src/contracts/hashtagRegistry.js'),
        import('/src/services/contractValidationService.js'),
      ]);
      const db = loadDb();
      const c = (db.generatedContracts || []).find((x) => x.patientId === patientId) || null;
      const html = c?.finalContent || c?.renderedHtml || '';
      const unknown = findUnknownHashtags(html);
      const sess = JSON.parse(localStorage.getItem('appgestaoodonto.session') || '{}');
      const user = sess.cachedUser || sess;
      const readiness = getContractReadinessChecklist({
        quoteSource: c?.quoteSource || 'clinical_budget',
        quoteId: c?.quoteId || appointmentId,
        patientId,
        currentUser: user,
        htmlPreview: '',
        attachedTcleIds: c?.metadata?.attachedTcleIds || [],
        strict: true,
      });
      return {
        contractId: c?.id || null,
        status: c?.status || null,
        htmlLen: html.length,
        unknownTags: unknown.slice(0, 20),
        unknownCount: unknown.length,
        readinessOk: readiness?.ok ?? readiness?.canGenerate ?? null,
        readinessMissing: (readiness?.missing || readiness?.items?.filter?.((i) => !i.ok) || []).slice?.(0, 8) || readiness,
        user: { role: user?.role, isMaster: user?.isMaster, id: user?.id || null },
        modalError: document.querySelector('[role="dialog"] .text-sm.text-\\[var\\(--color-error\\)\\]')?.textContent || null,
      };
    }, ids);
    report.pre = pre;

    // Service-layer finalize probe (exact root cause)
    const svc = await page.evaluate(async ({ contractId }) => {
      const sess = JSON.parse(localStorage.getItem('appgestaoodonto.session') || '{}');
      const user = sess.cachedUser || sess;
      const out = { update: null, finalize: null, afterStatus: null };
      try {
        const { loadDb } = await import('/src/db/index.js');
        const c0 = (loadDb().generatedContracts || []).find((x) => x.id === contractId);
        const html = c0?.finalContent || '';
        const { updateDraftGeneratedContract, finalizeGeneratedContract } = await import('/src/services/contractService.js');
        try {
          updateDraftGeneratedContract(user, contractId, { finalContent: html });
          out.update = { ok: true };
        } catch (e) {
          out.update = { ok: false, error: String(e?.message || e).slice(0, 400) };
        }
        try {
          const fin = finalizeGeneratedContract(user, contractId);
          out.finalize = { ok: true, status: fin?.status || null };
        } catch (e) {
          out.finalize = { ok: false, error: String(e?.message || e).slice(0, 400) };
        }
        const c1 = (loadDb().generatedContracts || []).find((x) => x.id === contractId);
        out.afterStatus = c1?.status || null;
      } catch (e) {
        out.fatal = String(e?.message || e).slice(0, 400);
      }
      return out;
    }, { contractId: pre.contractId });
    report.serviceProbe = svc;

    // UI click path (fresh page state may already be generated if svc succeeded — skip if so)
    if (svc.afterStatus !== 'generated') {
      await page.locator('[role="dialog"] .toast').evaluateAll((nodes) => {
        nodes.forEach((n) => { n.style.pointerEvents = 'none'; });
      }).catch(() => {});
      const finBtn = page.getByRole('button', { name: /Finalizar contrato/i }).first();
      if (await finBtn.isVisible().catch(() => false) && !(await finBtn.isDisabled())) {
        await finBtn.click({ force: true });
        await page.waitForTimeout(2000);
      }
      report.uiError = await page.locator('[role="dialog"] p.text-sm').allTextContents().catch(() => []);
      report.modalText = (await page.locator('[role="dialog"]').innerText().catch(() => '')).slice(0, 800);
    }

    report.consoleLogs = consoleLogs.slice(0, 30);
    report.ok = svc.finalize?.ok === true && svc.afterStatus === 'generated';
  } catch (e) {
    report.error = String(e.message || e).slice(0, 500);
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => {
  console.log(JSON.stringify({ error: String(e.message || e) }));
  process.exit(2);
});
