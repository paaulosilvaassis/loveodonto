#!/usr/bin/env node
/**
 * PHASE_10.21AB — Draft → Finalize browser smoke (staging).
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
const OUT = path.join(ROOT, 'docs/reports/_phase1021ab_draft_finalize.json');
const PATIENT = `TESTE PACKAGE MANIFEST BROWSER 1021AB ${Date.now().toString(36)}`;

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

async function bootstrapToGenerateModal(page, creds) {
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
  const report = {
    DRAFT_GENERATION: 'FAIL',
    CONTRACT_FINALIZE: 'FAIL',
    steps: [],
    draft: null,
    finalize: null,
    userPerms: null,
    nextSurface: null,
  };
  const note = (step, ok, detail = '') => report.steps.push({ step, ok, detail: String(detail).slice(0, 400) });

  try {
    const ids = await bootstrapToGenerateModal(page, creds);
    report.patientId = ids.patientId;
    report.appointmentId = ids.appointmentId;
    note('modal_open', true, page.url());

    report.userPerms = await page.evaluate(() => {
      try {
        const s = JSON.parse(localStorage.getItem('appgestaoodonto.session') || '{}');
        return {
          role: s.role || null,
          isMaster: Boolean(s.isMaster),
          id: s.id || null,
          tenant_id: s.tenant_id || s.tenantId || null,
        };
      } catch {
        return null;
      }
    });

    // DRAFT
    const draftBtn = page.getByRole('button', { name: /Gerar rascunho/i }).first();
    const draftVisible = await draftBtn.isVisible().catch(() => false);
    const draftDisabled = draftVisible ? await draftBtn.isDisabled() : null;
    note('draft_btn', draftVisible && !draftDisabled, `visible=${draftVisible} disabled=${draftDisabled}`);
    if (!draftVisible || draftDisabled) {
      const modalText = await page.locator('[role="dialog"]').innerText().catch(() => '');
      report.draft = { error: 'button_blocked', modalText: modalText.slice(0, 500) };
      throw new Error(`Gerar rascunho blocked: visible=${draftVisible} disabled=${draftDisabled}`);
    }

    await draftBtn.click();
    await page.waitForTimeout(2500);

    const afterDraft = await page.evaluate(async ({ appointmentId, patientId }) => {
      const [{ loadDb }, { getBudget }] = await Promise.all([
        import('/src/db/index.js'),
        import('/src/services/clinicalService.js'),
      ]);
      const db = loadDb();
      const contracts = (db.generatedContracts || []).filter(
        (c) => c.patientId === patientId || c.quoteId === appointmentId,
      );
      const last = contracts[contracts.length - 1] || null;
      const budget = getBudget?.(appointmentId);
      return {
        contractCount: contracts.length,
        last: last ? {
          id: last.id,
          status: last.status,
          quoteId: last.quoteId,
          patientId: last.patientId,
          budgetId: last.budgetId || null,
          hasHtml: Boolean(last.editedHtml || last.finalContent || last.renderedHtml),
          contractNumber: last.contractNumber || null,
        } : null,
        budgetId: budget?.id || null,
        budgetStatus: budget?.status || null,
        modalTextHint: document.body?.innerText?.slice(0, 300) || '',
      };
    }, ids);

    report.draft = afterDraft;
    report.DRAFT_GENERATION = afterDraft.last?.status === 'draft' || afterDraft.last?.id
      ? 'PASS'
      : 'FAIL';
    note('draft_result', report.DRAFT_GENERATION === 'PASS', JSON.stringify(afterDraft.last));

    if (report.DRAFT_GENERATION !== 'PASS') {
      const err = await page.locator('[role="dialog"] .text-\\[var\\(--color-error\\)\\], [role="dialog"] .error, [role="dialog"] p').allTextContents().catch(() => []);
      report.draft.errorUi = err.slice(0, 5);
      throw new Error('DRAFT_GENERATION failed');
    }

    // FINALIZE
    const finBtn = page.getByRole('button', { name: /Finalizar contrato/i }).first();
    const finVisible = await finBtn.isVisible().catch(() => false);
    const finDisabled = finVisible ? await finBtn.isDisabled() : null;
    note('finalize_btn', finVisible && !finDisabled, `visible=${finVisible} disabled=${finDisabled}`);

    // Toast de sucesso não deve bloquear o CTA (pointer-events + force).
    await page.locator('[role="dialog"] .toast').evaluateAll((nodes) => {
      nodes.forEach((n) => { n.style.pointerEvents = 'none'; });
    }).catch(() => {});

    if (finVisible && !finDisabled) {
      await finBtn.click({ force: true });
      await page.waitForTimeout(2500);
    } else if (finVisible && finDisabled) {
      report.finalize = { error: 'finalize_disabled', userPerms: report.userPerms };
      // capture why
      const modalText = await page.locator('[role="dialog"]').innerText().catch(() => '');
      report.finalize.modalText = modalText.slice(0, 600);
      throw new Error('Finalizar contrato disabled');
    } else {
      throw new Error('Finalizar contrato not visible');
    }

    const afterFin = await page.evaluate(async ({ appointmentId, patientId }) => {
      const { loadDb } = await import('/src/db/index.js');
      const db = loadDb();
      const contracts = (db.generatedContracts || []).filter(
        (c) => c.patientId === patientId || c.quoteId === appointmentId,
      );
      const last = contracts[contracts.length - 1] || null;
      return {
        last: last ? {
          id: last.id,
          status: last.status,
          generatedAt: last.generatedAt || null,
          hasRenderedHtml: Boolean(last.renderedHtml),
          attachedTcleIds: last.metadata?.attachedTcleIds || [],
        } : null,
        errorUi: Array.from(document.querySelectorAll('[role="dialog"] p'))
          .map((el) => el.textContent || '')
          .filter((t) => /erro|pendên|não pode|permiss/i.test(t))
          .slice(0, 5),
      };
    }, ids);

    report.finalize = afterFin;
    report.CONTRACT_FINALIZE = afterFin.last?.status === 'generated' ? 'PASS' : 'FAIL';
    note('finalize_result', report.CONTRACT_FINALIZE === 'PASS', JSON.stringify(afterFin.last));

    // Probe next CTAs after finalize
    await page.waitForTimeout(500);
    const body = await page.locator('body').innerText();
    report.nextSurface = {
      hasSend: /Enviar para assinatura/i.test(body),
      hasPackage: /pacote|package|documentos do tratamento/i.test(body),
      hasFreeze: /congelar|freeze|fechar pacote/i.test(body),
      hasWizard: /wizard|próximo|continuar/i.test(body),
      snippet: body.slice(0, 800),
    };

    // Close modal and check clinical contract section
    await page.getByRole('button', { name: /Fechar/i }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    const sendBtn = page.getByRole('button', { name: /Enviar para assinatura/i }).first();
    report.nextSurface.sendVisible = await sendBtn.isVisible().catch(() => false);
    report.nextSurface.sendDisabled = report.nextSurface.sendVisible
      ? await sendBtn.isDisabled().catch(() => null)
      : null;

    await page.screenshot({
      path: path.join(ROOT, 'docs/reports/_phase1021ab_draft_finalize.png'),
      fullPage: false,
    });
  } catch (e) {
    report.error = String(e.message || e).slice(0, 500);
    note('fatal', false, report.error);
    await page.screenshot({
      path: path.join(ROOT, 'docs/reports/_phase1021ab_draft_finalize.png'),
      fullPage: false,
    }).catch(() => {});
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    DRAFT_GENERATION: report.DRAFT_GENERATION,
    CONTRACT_FINALIZE: report.CONTRACT_FINALIZE,
    draft: report.draft?.last || report.draft,
    finalize: report.finalize?.last || report.finalize,
    userPerms: report.userPerms,
    nextSurface: report.nextSurface,
    error: report.error || null,
    steps: report.steps,
  }, null, 2));
  await browser.close();
  const ok = report.DRAFT_GENERATION === 'PASS' && report.CONTRACT_FINALIZE === 'PASS';
  process.exit(ok ? 0 : 2);
}

main().catch((e) => {
  console.log(JSON.stringify({ error: String(e.message || e) }));
  process.exit(2);
});
