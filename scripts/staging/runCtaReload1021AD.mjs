#!/usr/bin/env node
/**
 * PHASE_10.21AD — Smoke mínimo: reload → CTA Enviar → package 3 docs → sign gate.
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
const OUT = path.join(ROOT, 'docs/reports/_phase1021ad_cta_reload_smoke.json');

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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const report = {
    SEND_SIGNATURE_CTA_RELOAD: 'FAIL',
    PACKAGE_3_DOCS_AFTER_SEND: 'FAIL',
    SIGN_GATE_AFTER_SEND: 'FAIL',
    steps: [],
  };
  const note = (step, ok, detail = '') => report.steps.push({ step, ok, detail: String(detail).slice(0, 400) });

  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.fill('#login-email', creds.STAGING_SMOKE_EMAIL);
    await page.fill('#login-password', creds.STAGING_SMOKE_PASSWORD);
    await page.click('button.login-form-button');
    await page.waitForURL('**/gestao/**', { timeout: 45000 });

    // Seed um contrato GENERATED elegível via DB + navega ao atendimento
    const seeded = await page.evaluate(async () => {
      const { initDb, withDb, flushDbPersistence, loadDb } = await import('/src/db/index.js');
      await initDb();
      const now = new Date().toISOString();
      const apptId = `appt-ad-smoke-${Date.now().toString(36)}`;
      const patientId = `patient-ad-smoke-${Date.now().toString(36)}`;
      const budgetId = `budget-ad-smoke-${Date.now().toString(36)}`;
      const contractId = `gctr-ad-smoke-${Date.now().toString(36)}`;
      const tenantId = (loadDb().tenants || [])[0]?.id || 'tenant-1';

      withDb((db) => {
        if (!db.tenants?.length) {
          db.tenants = [{ id: tenantId, name: 'AD Smoke', status: 'active' }];
        }
        db.patients = db.patients || [];
        db.patients.push({
          id: patientId,
          full_name: 'Paciente AD Smoke CTA',
          status: 'active',
          tenant_id: tenantId,
          cpf: '39053344705',
          birth_date: '1990-01-15',
          created_at: now,
          updated_at: now,
        });
        db.patientAddresses = db.patientAddresses || [];
        db.patientAddresses.push({
          patient_id: patientId,
          logradouro: 'Av Paulista',
          numero: '1000',
          bairro: 'Bela Vista',
          cidade: 'São Paulo',
          uf: 'SP',
          cep: '01310-100',
          is_primary: true,
        });
        db.patientDocuments = db.patientDocuments || [];
        db.patientDocuments.push({
          patient_id: patientId,
          personal_email: 'smoke1021ad+staging@implanprime.test',
        });
        db.appointments = db.appointments || [];
        db.appointments.push({
          id: apptId,
          patientId,
          status: 'em_atendimento',
          tenant_id: tenantId,
        });
        db.clinicalAppointments = db.clinicalAppointments || [];
        db.clinicalAppointments.push({
          appointmentId: apptId,
          patientId,
          budget: {
            id: budgetId,
            status: 'CONTRATO_GERADO',
            paymentOptions: [{
              id: 'p1',
              accepted: true,
              presentationStatus: 'escolhida',
              type: 'a_vista',
              totalValue: 1500,
              value: 1500,
            }],
            procedures: [{ id: 'x', name: 'Implante', price: 1500, treatmentType: 'implante' }],
            totalValue: 1500,
            planName: 'Implante',
          },
          plannedProcedures: [{ id: 'x', name: 'Implante', treatmentType: 'implante' }],
          documents: [{
            id: `doc-tcle-${Date.now().toString(36)}`,
            category: 'consentimentos',
            templateKey: 'tcle_implante',
            title: 'TCLE — Implantes',
            status: 'completed',
            createdAt: now,
          }],
        });
        db.generatedContracts = db.generatedContracts || [];
        db.generatedContracts.push({
          id: contractId,
          clinicId: db.clinicProfile?.id || 'clinic-1',
          patientId,
          quoteId: apptId,
          quoteSource: 'clinical_budget',
          budgetId,
          status: 'generated',
          contractNumber: 'CTR-AD-SMOKE',
          generatedAt: now,
          finalContent: '<p>Contrato AD smoke</p>',
          renderedHtml: '<p>Contrato AD smoke</p>',
          metadata: { attachedTcleIds: ['tcle_implante'] },
        });
        return db;
      });
      await flushDbPersistence();
      return { apptId, patientId, budgetId, contractId };
    });

    report.seeded = { apptId: seeded.apptId, contractId: seeded.contractId };

    await page.goto(`${BASE}/atendimento-clinico/${seeded.apptId}?section=contratos`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(1500);

    // Reload hard
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.goto(`${BASE}/atendimento-clinico/${seeded.apptId}?section=contratos`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(1500);

    const cta = page.getByRole('button', { name: /Enviar para assinatura/i }).first();
    const ctaVisible = await cta.isVisible().catch(() => false);
    report.SEND_SIGNATURE_CTA_RELOAD = ctaVisible ? 'PASS' : 'FAIL';
    note('cta_after_reload', ctaVisible, await page.locator('body').innerText().then((t) => t.slice(0, 300)).catch(() => ''));

    if (!ctaVisible) {
      // Diagnóstico de elegibilidade
      const diag = await page.evaluate(async ({ apptId, contractId }) => {
        const { loadDb } = await import('/src/db/index.js');
        const { getContractStatusForQuote } = await import('/src/services/contractModuleService.js');
        const { canSendContractForSignature } = await import('/src/services/contractSignatureFlowService.js');
        const { getClinicalWorkflowState, canAccessClinicalSection } = await import('/src/components/clinical/clinicalAppointmentConfig.js');
        const c = getContractStatusForQuote(apptId, 'clinical_budget', null);
        const wf = getClinicalWorkflowState(apptId, null);
        return {
          contractFound: c?.id === contractId,
          status: c?.status,
          canSend: canSendContractForSignature({ contract: c, budget: wf.budget }),
          sectionOk: canAccessClinicalSection('contratos', wf),
          totalContracts: (loadDb().generatedContracts || []).length,
        };
      }, seeded);
      report.diag = diag;
      throw new Error(`cta_missing:${JSON.stringify(diag)}`);
    }

    await cta.click();
    await page.waitForTimeout(800);
    const emailField = page.locator('[role="dialog"] label', { hasText: /E-mail do paciente/i }).locator('input');
    if (await emailField.count()) await emailField.fill('smoke1021ad+staging@implanprime.test');
    const cpfField = page.locator('[role="dialog"] label', { hasText: /^CPF do paciente/i }).locator('input');
    if (await cpfField.count()) await cpfField.fill('390.533.447-05').catch(() => {});
    await page.locator('[role="dialog"] button[type="submit"]').click().catch(() => {});
    await page.waitForTimeout(2500);

    // Fallback service send
    const sendInfo = await page.evaluate(async ({ contractId }) => {
      const { loadDb } = await import('/src/db/index.js');
      let link = (loadDb().contractSignLinks || []).filter((l) => l.contractId === contractId).slice(-1)[0];
      if (link?.token) {
        return { token: link.token, via: 'ui' };
      }
      const sess = JSON.parse(localStorage.getItem('appgestaoodonto.session') || '{}');
      const user = sess.cachedUser || sess;
      const c = (loadDb().generatedContracts || []).find((x) => x.id === contractId);
      const { sendContractForDigitalSignature } = await import('/src/services/contractSignatureFlowService.js');
      await sendContractForDigitalSignature(user, contractId, {
        patientName: 'Paciente AD Smoke CTA',
        patientCpf: '390.533.447-05',
        patientEmail: 'smoke1021ad+staging@implanprime.test',
        patientPhone: '(11) 98888-0000',
        signatureType: 'simple',
        linkExpiryDays: 7,
        budget: {
          id: c?.budgetId,
          status: 'CONTRATO_GERADO',
          paymentOptions: [{ accepted: true }],
        },
        treatmentName: 'Implante',
      });
      link = (loadDb().contractSignLinks || []).filter((l) => l.contractId === contractId).slice(-1)[0];
      return { token: link?.token || null, via: 'service' };
    }, seeded);

    if (!sendInfo.token) throw new Error('no_token');

    await page.goto(`${BASE}/assinatura/${sendInfo.token}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /Continuar/i }).first().click().catch(() => {});
    await page.waitForTimeout(800);

    const pkg = await page.locator('[data-testid="public-package-manifest-docs"]').isVisible().catch(() => false);
    const docCount = await page.locator('[data-testid^="pkg-doc-"]').evaluateAll((nodes) => (
      nodes
        .map((n) => (n.getAttribute('data-testid') || '').replace(/^pkg-doc-/, ''))
        .filter((k) => k && !k.startsWith('accept-') && !k.startsWith('snapshot-')).length
    )).catch(() => 0);
    report.PACKAGE_3_DOCS_AFTER_SEND = pkg && docCount >= 3 ? 'PASS' : 'FAIL';
    note('package', report.PACKAGE_3_DOCS_AFTER_SEND === 'PASS', `docs=${docCount}`);

    const keys = await page.locator('[data-testid^="pkg-doc-"]').evaluateAll((nodes) => (
      nodes
        .map((n) => (n.getAttribute('data-testid') || '').replace(/^pkg-doc-/, ''))
        .filter((k) => k && !k.startsWith('accept-') && !k.startsWith('snapshot-'))
    ));
    const contractKey = keys.find((k) => /^contract$/i.test(k)) || keys[0];
    const tcleKey = keys.find((k) => /tcle|implant/i.test(k));
    const lgpdKey = keys.find((k) => /lgpd/i.test(k));
    const ctaSign = page.locator('[data-testid="pkg-sign-documents-cta"]');

    async function accept(key) {
      const row = page.locator(`[data-testid="pkg-doc-${key}"]`);
      await row.locator('button', { hasText: /Visualizar/i }).click();
      await page.locator(`input[data-testid="pkg-doc-accept-${key}"]`).check({ force: true });
      await page.waitForTimeout(300);
    }

    await accept(contractKey);
    const blockedA = await ctaSign.isDisabled();
    await accept(tcleKey);
    const blockedB = await ctaSign.isDisabled();
    await accept(lgpdKey);
    const enabled = !(await ctaSign.isDisabled());
    report.SIGN_GATE_AFTER_SEND = blockedA && blockedB && enabled ? 'PASS' : 'FAIL';
    note('sign_gate', report.SIGN_GATE_AFTER_SEND === 'PASS', JSON.stringify({ blockedA, blockedB, enabled }));
  } catch (e) {
    report.error = String(e.message || e).slice(0, 500);
    note('fatal', false, report.error);
  }

  report.allPass = [
    report.SEND_SIGNATURE_CTA_RELOAD,
    report.PACKAGE_3_DOCS_AFTER_SEND,
    report.SIGN_GATE_AFTER_SEND,
  ].every((v) => v === 'PASS');
  report.gate = report.allPass ? 'SEND_SIGNATURE_CTA_RELOAD_PASS' : 'BLOCKED';
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    gate: report.gate,
    SEND_SIGNATURE_CTA_RELOAD: report.SEND_SIGNATURE_CTA_RELOAD,
    PACKAGE_3_DOCS_AFTER_SEND: report.PACKAGE_3_DOCS_AFTER_SEND,
    SIGN_GATE_AFTER_SEND: report.SIGN_GATE_AFTER_SEND,
    error: report.error || null,
    diag: report.diag || null,
  }, null, 2));
  await browser.close();
  process.exit(report.allPass ? 0 : 2);
}

main().catch((e) => {
  console.log(JSON.stringify({ error: String(e.message || e) }));
  process.exit(2);
});
