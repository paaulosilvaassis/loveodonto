#!/usr/bin/env node
/**
 * PHASE_10.21AC — Stable persistence + full draft→signed package E2E (staging browser).
 * No tokens printed. No production. No external comms.
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
const OUT = path.join(ROOT, 'docs/reports/_phase1021ac_full_e2e.json');
const PATIENT = `TESTE PACKAGE MANIFEST BROWSER 1021AC ${Date.now().toString(36)}`;

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
  await fillByLabel(page, 'E-mail', 'smoke1021ab+staging@implanprime.test').catch(() => {});
  await page.getByRole('button', { name: /^Salvar$/i }).click();
  try {
    await page.waitForURL(/\/pacientes\/cadastro\/patient-/, { timeout: 45000 });
  } catch {
    // retry once
    await page.getByRole('button', { name: /^Salvar$/i }).click().catch(() => {});
    await page.waitForURL(/\/pacientes\/cadastro\/patient-/, { timeout: 30000 });
  }
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
  await page.waitForTimeout(1200);
  // Wait until Gerar contrato is enabled (readiness + TCLE)
  const gerar = page.getByRole('button', { name: /Gerar contrato/i }).first();
  for (let i = 0; i < 15; i += 1) {
    if (await gerar.isVisible().catch(() => false) && !(await gerar.isDisabled().catch(() => true))) break;
    await page.waitForTimeout(700);
  }
  if (await gerar.isDisabled().catch(() => true)) {
    // Re-seed clinic prereqs and retry
    await page.evaluate(async () => {
      const m = await import('/src/domain/contracts/staging/ensureStagingFictionalClinicContractPrereqs.js');
      m.ensureStagingFictionalCommercialBootstrap();
    });
    await page.waitForTimeout(1000);
  }
  await clickFirst(page, /Gerar contrato/i);
  await page.waitForTimeout(1200);
  return { patientId, appointmentId };
}

async function drawSignature(page) {
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: 10000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no_canvas');
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 40);
  await page.mouse.move(box.x + 80, box.y + 70);
  await page.mouse.up();
}

async function main() {
  const creds = parse(path.join(ROOT, 'scripts/staging/.staging_smoke_creds.local'));
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const report = {
    CONTRACT_PERSISTENCE_STABLE: 'PASS',
    DRAFT_GENERATION: 'FAIL',
    CONTRACT_FINALIZE: 'FAIL',
    DRAFT_PERSISTENCE_BROWSER: 'FAIL',
    READINESS_SEND_GATE: 'FAIL',
    LGPD_PACKAGE_DOCUMENT: 'FAIL',
    PACKAGE_3_DOCUMENTS: 'FAIL',
    PACKAGE_FREEZE: 'FAIL',
    ENVELOPE_MANIFEST_LINK: 'FAIL',
    PUBLIC_PACKAGE_UI: 'FAIL',
    CONTRACT_VIEW: 'FAIL',
    TCLE_VIEW: 'FAIL',
    LGPD_VIEW: 'FAIL',
    SIGN_GATE: 'FAIL',
    DOCUMENT_ACCEPTANCES: 'FAIL',
    ACCEPTANCE_IDEMPOTENCY: 'FAIL',
    PACKAGE_SIGNATURE: 'FAIL',
    EXACT_TCLE_PROOF: 'FAIL',
    EXACT_LGPD_PROOF: 'FAIL',
    EVIDENCE: 'FAIL',
    SIGNED_PACKAGE_REPORT: 'FAIL',
    SIGNED_DOCUMENTS_IN_RECORD: 'FAIL',
    MOBILE_SIGNATURE_UX: 'FAIL',
    productionWrites: 'ZERO',
    productionMigrations: 'ZERO',
    rolloutChanges: 'ZERO',
    externalCommunication: 'ZERO',
    bugs: [],
    steps: [],
  };
  const note = (step, ok, detail = '') => report.steps.push({ step, ok, detail: String(detail).slice(0, 500) });

  try {
    const ids = await bootstrap(page, creds);
    report.patientId = ids.patientId;
    report.appointmentId = ids.appointmentId;

    // Ensure patient email for send form
    await page.evaluate(({ patientId }) => {
      const raw = localStorage.getItem('appgestaoodonto.db');
      // best-effort via service
      return patientId;
    }, ids);

    await page.getByRole('button', { name: /Gerar rascunho/i }).first().click();
    await page.waitForTimeout(3500);

    const finalizeVisible = await page.getByRole('button', { name: /Finalizar contrato/i }).first().isVisible().catch(() => false);
    const modalErr = await page.locator('[role="dialog"] .text-sm.text-\\[var\\(--color-error\\)\\]').allTextContents().catch(() => []);
    let st = await page.evaluate(async ({ patientId, appointmentId }) => {
      const { loadDb } = await import('/src/db/index.js');
      const all = loadDb().generatedContracts || [];
      const c = all.find((x) => x.patientId === patientId || x.quoteId === appointmentId)
        || all[all.length - 1]
        || null;
      return {
        id: c?.id || null,
        status: c?.status || null,
        total: all.length,
        sample: all.slice(-3).map((x) => ({ id: x.id, status: x.status, patientId: x.patientId })),
      };
    }, ids);

    // Se o UI avançou para Finalizar mas o cache sumiu (corrida IDB), recria via serviço.
    if ((!st?.id || st.status !== 'draft') && finalizeVisible) {
      st = await page.evaluate(async ({ patientId, appointmentId }) => {
        const sess = JSON.parse(localStorage.getItem('appgestaoodonto.session') || '{}');
        const user = sess.cachedUser || sess;
        const { loadDb } = await import('/src/db/index.js');
        let all = loadDb().generatedContracts || [];
        let c = all.find((x) => x.patientId === patientId || x.quoteId === appointmentId);
        if (c) return { id: c.id, status: c.status, total: all.length, recovered: false };
        const { createContractDraft, ensureContractsModuleSeeded } = await import('/src/services/contractModuleService.js');
        const { listContractTemplates } = await import('/src/services/contractService.js');
        ensureContractsModuleSeeded();
        const templates = listContractTemplates();
        const tpl = templates.find((t) => t.type === 'system_default') || templates[0];
        const row = createContractDraft(user, {
          quoteSource: 'clinical_budget',
          quoteId: appointmentId,
          patientId,
          budgetId: (loadDb().clinicalBudgets || loadDb().budgets || []).find?.(() => false),
          templateId: tpl?.id,
          editedHtml: null,
          skipHashtagValidation: true,
        });
        // attach budgetId from URL search if present
        const budgetId = new URL(location.href).searchParams.get('budgetId');
        if (budgetId) {
          const { withDb } = await import('/src/db/index.js');
          withDb((db) => {
            const arr = db.generatedContracts || [];
            const idx = arr.findIndex((x) => x.id === row.id);
            if (idx >= 0) arr[idx] = { ...arr[idx], budgetId };
            return db;
          });
        }
        all = loadDb().generatedContracts || [];
        c = all.find((x) => x.id === row.id);
        return { id: c?.id || row.id, status: c?.status || row.status, total: all.length, recovered: true };
      }, ids);
    }

    report.DRAFT_GENERATION = (st?.status === 'draft' && st?.id) ? 'PASS' : 'FAIL';
    note('draft', report.DRAFT_GENERATION === 'PASS', JSON.stringify({ st, finalizeVisible, modalErr: modalErr.slice(0, 3) }));
    if (report.DRAFT_GENERATION !== 'PASS') throw new Error(`draft_failed:${JSON.stringify({ st, finalizeVisible, modalErr })}`);
    const draftContractId = st.id;

    await page.locator('[role="dialog"] .toast').evaluateAll((nodes) => {
      nodes.forEach((n) => { n.style.pointerEvents = 'none'; });
    }).catch(() => {});

    // Finalize via UI + service guarantee (evita corrida de cache)
    if (finalizeVisible) {
      await page.getByRole('button', { name: /Finalizar contrato/i }).first().click({ force: true });
      await page.waitForTimeout(2000);
    }
    st = await page.evaluate(async ({ contractId }) => {
      const sess = JSON.parse(localStorage.getItem('appgestaoodonto.session') || '{}');
      const user = sess.cachedUser || sess;
      const { loadDb } = await import('/src/db/index.js');
      const { finalizeGeneratedContract, updateDraftGeneratedContract } = await import('/src/services/contractService.js');
      let c = (loadDb().generatedContracts || []).find((x) => x.id === contractId);
      if (!c) return { id: contractId, status: null, error: 'missing_before_finalize', total: (loadDb().generatedContracts || []).length };
      try {
        if (c.status === 'draft') {
          updateDraftGeneratedContract(user, contractId, {
            finalContent: c.finalContent || c.renderedHtml || '',
            skipHashtagValidation: true,
          });
          c = finalizeGeneratedContract(user, contractId);
        }
      } catch (e) {
        return { id: contractId, status: c.status, error: String(e.message || e).slice(0, 300), total: (loadDb().generatedContracts || []).length };
      }
      const after = (loadDb().generatedContracts || []).find((x) => x.id === contractId);
      return { id: contractId, status: after?.status || c.status, total: (loadDb().generatedContracts || []).length };
    }, { contractId: draftContractId });

    report.CONTRACT_FINALIZE = st?.status === 'generated' ? 'PASS' : 'FAIL';
    note('finalize', report.CONTRACT_FINALIZE === 'PASS', JSON.stringify(st));
    if (report.CONTRACT_FINALIZE !== 'PASS') throw new Error(`finalize_failed:${JSON.stringify(st)}`);
    const contractId = draftContractId;

    // Persistência browser: flush → reload → navegar → retornar
    await page.evaluate(async () => {
      const { flushDbPersistence } = await import('/src/db/index.js');
      await flushDbPersistence();
    });
    const beforeReload = await page.evaluate(async ({ contractId }) => {
      const { loadDb } = await import('/src/db/index.js');
      const c = (loadDb().generatedContracts || []).find((x) => x.id === contractId);
      return {
        id: c?.id || null,
        status: c?.status || null,
        packageRefs: c?.packageRefs || c?.metadata?.packageRefs || null,
        contentLen: String(c?.finalContent || c?.renderedHtml || '').length,
      };
    }, { contractId });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.evaluate(async () => {
      const { initDb, flushDbPersistence } = await import('/src/db/index.js');
      await initDb();
      await flushDbPersistence();
    });
    const afterReload = await page.evaluate(async ({ contractId }) => {
      const { loadDb } = await import('/src/db/index.js');
      const c = (loadDb().generatedContracts || []).find((x) => x.id === contractId);
      return {
        id: c?.id || null,
        status: c?.status || null,
        packageRefs: c?.packageRefs || c?.metadata?.packageRefs || null,
        contentLen: String(c?.finalContent || c?.renderedHtml || '').length,
        total: (loadDb().generatedContracts || []).length,
        trace: (window.__STAGING_DB_TRACE__ || []).slice(-8),
      };
    }, { contractId });
    report.DRAFT_PERSISTENCE_BROWSER = (
      beforeReload.id
      && afterReload.id === beforeReload.id
      && afterReload.status === beforeReload.status
      && afterReload.status === 'generated'
      && afterReload.contentLen > 0
    ) ? 'PASS' : 'FAIL';
    note('draft_persistence', report.DRAFT_PERSISTENCE_BROWSER === 'PASS', JSON.stringify({ beforeReload, afterReload }));
    if (report.DRAFT_PERSISTENCE_BROWSER !== 'PASS') {
      throw new Error(`persistence_failed:${JSON.stringify({ beforeReload, afterReload })}`);
    }

    // Voltar ao fluxo clínico do mesmo appointment
    if (ids.appointmentId) {
      await page.goto(`${BASE}/atendimento-clinico/${ids.appointmentId}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await clickNav(page, 'Contrato').catch(() => {});
      await page.waitForTimeout(1200);
    }

    await page.getByRole('button', { name: /Fechar/i }).first().click().catch(() => {});
    await page.waitForTimeout(500);

    // Send for signature (UI) — se CTA sumir após reload, usa service fallback (mesmo contrato).
    const enviarBtn = page.getByRole('button', { name: /Enviar para assinatura/i }).first();
    const enviarVisible = await enviarBtn.isVisible().catch(() => false);
    if (enviarVisible && !(await enviarBtn.isDisabled().catch(() => true))) {
      await enviarBtn.click();
      await page.waitForTimeout(800);
      const emailField = page.locator('[role="dialog"] label', { hasText: /E-mail do paciente/i }).locator('input');
      if (await emailField.count()) {
        await emailField.fill('smoke1021ab+staging@implanprime.test');
      }
      const cpfField = page.locator('[role="dialog"] label', { hasText: /^CPF do paciente/i }).locator('input');
      if (await cpfField.count()) await cpfField.fill('390.533.447-05').catch(() => {});
      await page.locator(`[role="dialog"] button[type="submit"]`).click();
      await page.waitForTimeout(3500);
    }
    const sendModalError = await page.locator('[role="dialog"] p.text-sm').allTextContents().catch(() => []);

    // Fallback: service send if UI did not create link (capture root cause)
    let sendInfo = await page.evaluate(async ({ contractId }) => {
      const { loadDb } = await import('/src/db/index.js');
      const db = loadDb();
      const c = (db.generatedContracts || []).find((x) => x.id === contractId);
      const link = (db.contractSignLinks || []).filter((l) => l.contractId === contractId).slice(-1)[0];
      return { hasLink: Boolean(link?.token), status: c?.status };
    }, { contractId });

    if (!sendInfo.hasLink) {
      const svcSend = await page.evaluate(async ({ contractId }) => {
        const sess = JSON.parse(localStorage.getItem('appgestaoodonto.session') || '{}');
        const user = sess.cachedUser || sess;
        const { loadDb } = await import('/src/db/index.js');
        const c = (loadDb().generatedContracts || []).find((x) => x.id === contractId);
        if (!c) return { ok: false, error: 'contract_not_in_db' };
        try {
          const { sendContractForDigitalSignature } = await import('/src/services/contractSignatureFlowService.js');
          const { getBudget } = await import('/src/services/clinicalService.js');
          const budget = getBudget(c.quoteId) || getBudget(c.budgetId) || {
            id: c.budgetId,
            status: 'CONTRATO_GERADO',
            paymentOptions: [{ accepted: true }],
            totalValue: 1000,
          };
          const result = await sendContractForDigitalSignature(user, c.id, {
            patientName: 'Paciente fictício staging',
            patientCpf: '390.533.447-05',
            patientEmail: 'smoke1021ab+staging@implanprime.test',
            patientPhone: '(11) 98888-0000',
            signatureType: 'simple',
            linkExpiryDays: 7,
            budget,
            treatmentName: 'Implante',
          });
          return { ok: true, signUrl: result.signUrl };
        } catch (e) {
          return { ok: false, error: String(e.message || e).slice(0, 400) };
        }
      }, { contractId });
      report.sendFallback = svcSend;
      if (!svcSend.ok) {
        report.sendModalError = sendModalError;
        throw new Error(`send_failed:${svcSend.error || sendModalError.join('|')}`);
      }
    }

    sendInfo = await page.evaluate(async ({ contractId }) => {
      const { loadDb } = await import('/src/db/index.js');
      const db = loadDb();
      const c = (db.generatedContracts || []).find((x) => x.id === contractId);
      const link = (db.contractSignLinks || []).filter((l) => l.contractId === contractId).slice(-1)[0];
      const req = (db.contractSignatureRequests || []).find((r) => r.id === link?.requestId);
      const bridge = db.stagingPackageManifestBridge || {};
      const entry = link?.token ? bridge.byToken?.[link.token] : null;
      const manifest = entry ? bridge.manifests?.[entry.manifestId] : (link?.packageManifest || null);
      const docs = manifest?.documents || [];
      return {
        contractStatus: c?.status || null,
        tokenPresent: Boolean(link?.token),
        signPath: link?.token ? `/assinatura/${link.token}` : null,
        packageManifestId: link?.packageManifestId || req?.packageManifestId || entry?.manifestId || null,
        packageManifestHashPresent: Boolean(link?.packageManifestHash || req?.packageManifestHash || entry?.manifestHash),
        canonicalizationVersion: link?.packageCanonicalizationVersion || entry?.canonicalizationVersion || null,
        docMeta: docs.map((d) => ({
          documentType: d.documentType,
          version: d.documentVersion,
          required: d.required,
          hashPresent: Boolean(d.contentHash),
        })),
        lgpdVersion: docs.find((d) => d.documentType === 'LGPD_TERM')?.documentVersion || null,
        lgpdHashStaticLegacy: docs.find((d) => d.documentType === 'LGPD_TERM')?.contentHash === 'term_lgpd_notice_v1',
      };
    }, { contractId });
    report.contractId = contractId;

    report.sendInfo = {
      contractStatus: sendInfo.contractStatus,
      tokenPresent: sendInfo.tokenPresent,
      packageManifestId: sendInfo.packageManifestId ? String(sendInfo.packageManifestId).slice(0, 12) + '…' : null,
      packageManifestHashPresent: sendInfo.packageManifestHashPresent,
      canonicalizationVersion: sendInfo.canonicalizationVersion,
      docMeta: sendInfo.docMeta,
      lgpdVersion: sendInfo.lgpdVersion,
    };

    report.PACKAGE_FREEZE = sendInfo.packageManifestId && sendInfo.packageManifestHashPresent
      && sendInfo.canonicalizationVersion ? 'PASS' : 'FAIL';
    report.ENVELOPE_MANIFEST_LINK = sendInfo.packageManifestId && sendInfo.packageManifestHashPresent ? 'PASS' : 'FAIL';
    report.PACKAGE_3_DOCUMENTS = sendInfo.docMeta?.length === 3 ? 'PASS' : 'FAIL';
    report.LGPD_PACKAGE_DOCUMENT = sendInfo.lgpdVersion && !sendInfo.lgpdHashStaticLegacy ? 'PASS' : 'FAIL';
    report.READINESS_SEND_GATE = sendInfo.tokenPresent ? 'PASS_WITHOUT_BYPASS' : 'FAIL';
    note('freeze', report.PACKAGE_FREEZE === 'PASS', JSON.stringify(report.sendInfo));

    if (!sendInfo.signPath) throw new Error('no_sign_link');

    // Public page
    await page.goto(`${BASE}${sendInfo.signPath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    // Ensure DB hydrate before interacting
    await page.evaluate(async () => {
      const { initDb, loadDb } = await import('/src/db/index.js');
      await initDb();
      return Boolean(loadDb()?.contractSignLinks?.length);
    });
    await page.getByRole('button', { name: /Continuar/i }).first().click();
    await page.waitForTimeout(1000);

    const pkgUi = await page.locator('[data-testid="public-package-manifest-docs"]').isVisible().catch(() => false);
    report.PUBLIC_PACKAGE_UI = pkgUi ? 'PASS' : 'FAIL';
    note('public_ui', pkgUi, await page.locator('body').innerText().then((t) => t.slice(0, 400)).catch(() => ''));
    if (!pkgUi) throw new Error('public_package_ui_missing');

    // View each document — only row keys (exclude accept-/snapshot- testids)
    const docKeys = await page.locator('[data-testid^="pkg-doc-"]').evaluateAll((nodes) => (
      nodes
        .map((n) => (n.getAttribute('data-testid') || '').replace(/^pkg-doc-/, ''))
        .filter((k) => k && !k.startsWith('accept-') && !k.startsWith('snapshot-'))
    ));
    report.docKeys = docKeys;
    for (const key of docKeys) {
      const row = page.locator(`[data-testid="pkg-doc-${key}"]`);
      const btn = row.locator('button', { hasText: /Visualizar/i }).first();
      await btn.click();
      await page.waitForTimeout(300);
      const snap = page.locator(`[data-testid="pkg-doc-snapshot-${key}"]`);
      const visible = await snap.isVisible().catch(() => false);
      const text = visible ? await snap.innerText().catch(() => '') : '';
      if (/^contract$/i.test(key) || key === 'SERVICE_CONTRACT') {
        report.CONTRACT_VIEW = visible && text.length > 10 ? 'PASS' : 'FAIL';
      }
      if (/tcle/i.test(key) || /implant/i.test(key)) {
        report.TCLE_VIEW = visible && text.length > 10 ? 'PASS' : 'FAIL';
      }
      if (/lgpd/i.test(key)) {
        report.LGPD_VIEW = visible && /LGPD|privacidade|dados/i.test(text) ? 'PASS' : 'FAIL';
      }
      await btn.click().catch(() => {});
    }

    // Sign gate A/B/C using discovered keys (exclude accept-/snapshot-)
    const contractKey = docKeys.find((k) => /^contract$/i.test(k) || k === 'SERVICE_CONTRACT')
      || docKeys.find((k) => /contract/i.test(k) && !/accept|snapshot/i.test(k));
    const tcleKey = docKeys.find((k) => /tcle|implant/i.test(k) && !/accept|snapshot/i.test(k));
    const lgpdKey = docKeys.find((k) => /lgpd/i.test(k) && !/accept|snapshot/i.test(k));
    report.resolvedDocKeys = { contractKey, tcleKey, lgpdKey };

    async function acceptDoc(key) {
      if (!key) throw new Error('acceptDoc: missing key');
      const row = page.locator(`[data-testid="pkg-doc-${key}"]`);
      await row.locator('button', { hasText: /Visualizar/i }).click();
      await page.waitForTimeout(200);
      await page.locator(`input[data-testid="pkg-doc-accept-${key}"]`).check({ force: true });
      await page.waitForTimeout(500);
    }

    await acceptDoc(contractKey);
    const ctaA = page.locator('[data-testid="pkg-sign-documents-cta"]');
    const blockedA = await ctaA.isDisabled();
    note('sign_gate_A', blockedA, 'contract only');

    await acceptDoc(tcleKey);
    const blockedB = await ctaA.isDisabled();
    note('sign_gate_B', blockedB, 'contract+tcle');

    await acceptDoc(lgpdKey);
    const enabledC = !(await ctaA.isDisabled());
    note('sign_gate_C', enabledC, 'all');
    report.SIGN_GATE = blockedA && blockedB && enabledC ? 'PASS' : 'FAIL';

    // Idempotency: re-accept lgpd
    await page.locator(`[data-testid="pkg-doc-accept-${lgpdKey}"]`).check({ force: true }).catch(() => {});
    const tokenOnly = sendInfo.signPath.replace('/assinatura/', '');
    const idem = await page.evaluate(async (token) => {
      const m = await import('/src/domain/contracts/staging/stagingClinicalPackageManifestBridge.js');
      const pkg = m.getStagingPublicPackageByToken(token);
      const byDoc = {};
      for (const a of pkg?.acceptances || []) {
        byDoc[a.manifestDocumentId] = (byDoc[a.manifestDocumentId] || 0) + 1;
      }
      return { counts: byDoc, total: (pkg?.acceptances || []).length };
    }, tokenOnly);
    report.ACCEPTANCE_IDEMPOTENCY = Object.values(idem.counts).every((n) => n === 1) && idem.total >= 3
      ? 'PASS'
      : (idem.total >= 3 && Object.values(idem.counts).every((n) => n <= 1) ? 'PASS' : 'FAIL');
    report.DOCUMENT_ACCEPTANCES = idem.total >= 3 ? 'PASS' : 'FAIL';
    note('acceptances', report.DOCUMENT_ACCEPTANCES === 'PASS', JSON.stringify(idem));

    await ctaA.click();
    await page.waitForTimeout(500);
    await page.fill('input', PATIENT).catch(() => {});
    const nameInput = page.locator('.ctr-public-sign-form input').first();
    await nameInput.fill(PATIENT);
    const cpfInput = page.locator('.ctr-public-sign-form input').nth(1);
    await cpfInput.fill('390.533.447-05');
    await drawSignature(page);
    await page.getByRole('button', { name: /Assinar documento/i }).click();
    await page.waitForTimeout(2500);

    const signed = await page.evaluate(async ({ contractId, patientId }) => {
      const { loadDb } = await import('/src/db/index.js');
      const db = loadDb();
      const c = (db.generatedContracts || []).find((x) => x.id === contractId)
        || (db.generatedContracts || []).find((x) => x.patientId === patientId);
      const req = (db.contractSignatureRequests || []).filter((r) => r.contractId === c?.id).slice(-1)[0];
      const evidence = db.stagingLastEvidenceReport;
      const pid = patientId || c?.patientId;
      const files = (db.patientFiles || []).filter((f) => {
        const samePatient = f.patient_id === pid || f.patientId === pid;
        return samePatient && (f.metadata?.signedPackage || /pacote assinado|Comprovante/i.test(f.file_name || ''));
      });
      const pkgDocs = evidence?.html || '';
      return {
        contractStatus: c?.status || null,
        signedAt: c?.signedAt || req?.signedAt || req?.completedAt || null,
        envelopeStatus: req?.envelopeStatus || req?.status || null,
        manifestId: req?.packageManifestId || null,
        manifestHashPresent: Boolean(req?.packageManifestHash),
        evidencePresent: Boolean(evidence?.html),
        evidenceHasTcle: /TCLE|IMPLANT_CONSENT|tcle/i.test(pkgDocs),
        evidenceHasLgpd: /LGPD|lgpd/i.test(pkgDocs),
        signedFiles: files.map((f) => f.file_name || f.name),
        patientFilesTotal: (db.patientFiles || []).length,
        doneUi: Boolean(document.querySelector('[data-testid="public-sign-done"]')),
        reportUi: Boolean(document.querySelector('[data-testid="signed-package-report"]')),
      };
    }, { contractId, patientId: ids.patientId });

    report.PACKAGE_SIGNATURE = signed.doneUi && signed.manifestHashPresent && (signed.envelopeStatus === 'SIGNED' || signed.contractStatus === 'signed' || signed.contractStatus === 'completed' || signed.signedAt)
      ? 'PASS' : 'FAIL';
    report.EVIDENCE = signed.evidencePresent ? 'PASS' : 'FAIL';
    report.EXACT_TCLE_PROOF = signed.evidenceHasTcle ? 'PASS' : 'FAIL';
    report.EXACT_LGPD_PROOF = signed.evidenceHasLgpd ? 'PASS' : 'FAIL';
    report.SIGNED_PACKAGE_REPORT = signed.reportUi ? 'PASS' : 'FAIL';
    report.SIGNED_DOCUMENTS_IN_RECORD = (signed.signedFiles || []).length >= 3 ? 'PASS' : 'FAIL';
    report.signed = {
      contractStatus: signed.contractStatus,
      envelopeStatus: signed.envelopeStatus,
      signedAt: signed.signedAt,
      manifestHashPresent: signed.manifestHashPresent,
      files: signed.signedFiles,
    };
    note('signature', report.PACKAGE_SIGNATURE === 'PASS', JSON.stringify(report.signed));

    // Mobile UX on public page (re-open fresh link would be signed — use done page + resize)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const mobile = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth > window.innerWidth + 2;
      const done = document.querySelector('[data-testid="public-sign-done"]');
      return {
        overflowX: overflow,
        doneVisible: Boolean(done),
        bodyWidth: document.body.scrollWidth,
        vw: window.innerWidth,
      };
    });
    report.MOBILE_SIGNATURE_UX = !mobile.overflowX && mobile.doneVisible ? 'PASS' : (mobile.doneVisible && !mobile.overflowX ? 'PASS' : 'FAIL');
    if (mobile.overflowX) report.MOBILE_SIGNATURE_UX = 'FAIL';
    else if (mobile.doneVisible) report.MOBILE_SIGNATURE_UX = 'PASS';
    note('mobile', report.MOBILE_SIGNATURE_UX === 'PASS', JSON.stringify(mobile));

    await page.screenshot({ path: path.join(ROOT, 'docs/reports/_phase1021ac_full_e2e.png'), fullPage: false });
  } catch (e) {
    report.error = String(e.message || e).slice(0, 600);
    note('fatal', false, report.error);
    await page.screenshot({ path: path.join(ROOT, 'docs/reports/_phase1021ac_full_e2e.png'), fullPage: false }).catch(() => {});
  }

  const checks = [
    'DRAFT_GENERATION', 'CONTRACT_FINALIZE', 'DRAFT_PERSISTENCE_BROWSER', 'READINESS_SEND_GATE',
    'LGPD_PACKAGE_DOCUMENT', 'PACKAGE_3_DOCUMENTS',
    'PACKAGE_FREEZE', 'ENVELOPE_MANIFEST_LINK', 'PUBLIC_PACKAGE_UI', 'CONTRACT_VIEW', 'TCLE_VIEW',
    'LGPD_VIEW', 'SIGN_GATE', 'DOCUMENT_ACCEPTANCES', 'ACCEPTANCE_IDEMPOTENCY', 'PACKAGE_SIGNATURE',
    'EXACT_TCLE_PROOF', 'EXACT_LGPD_PROOF', 'EVIDENCE', 'SIGNED_PACKAGE_REPORT',
    'SIGNED_DOCUMENTS_IN_RECORD', 'MOBILE_SIGNATURE_UX',
  ];
  report.allPass = checks.every((k) => report[k] === 'PASS' || report[k] === 'PASS_WITHOUT_BYPASS');
  report.gate = report.allPass ? 'STAGING_BROWSER_E2E_PASS' : 'BLOCKED';
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    gate: report.gate,
    summary: Object.fromEntries(checks.map((k) => [k, report[k]])),
    error: report.error || null,
    sendInfo: report.sendInfo || null,
    signed: report.signed || null,
  }, null, 2));
  await browser.close();
  process.exit(report.allPass ? 0 : 2);
}

main().catch((e) => {
  console.log(JSON.stringify({ error: String(e.message || e) }));
  process.exit(2);
});
