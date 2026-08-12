#!/usr/bin/env node
/**
 * PHASE_10.21Z — Extended flow after first CTA (one step at a time).
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
const OUT = path.join(ROOT, 'docs/reports/_phase1021z_flow_continue.json');
const PATIENT = `TESTE PACKAGE MANIFEST BROWSER 1021Z ${Date.now().toString(36)}`;

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

async function clickFirst(page, nameRe, timeout = 10000) {
  const btn = page.getByRole('button', { name: nameRe }).first();
  await btn.waitFor({ state: 'visible', timeout });
  if (await btn.isDisabled()) throw new Error(`disabled:${String(nameRe)}`);
  await btn.click();
}

async function main() {
  // Hard reload so main.jsx seed runs
  const creds = parse(path.join(ROOT, 'scripts/staging/.staging_smoke_creds.local'));
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const steps = [];
  const note = (step, ok, detail = '') => steps.push({
    step, ok, detail: String(detail).slice(0, 320), url: page.url(),
  });
  const report = {
    FIRST_CTA_RETEST: 'FAIL',
    secondBlocker: null,
    reached: {},
    steps,
  };

  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.fill('#login-email', creds.STAGING_SMOKE_EMAIL);
    await page.fill('#login-password', creds.STAGING_SMOKE_PASSWORD);
    await page.click('button.login-form-button');
    await page.waitForURL('**/gestao/**', { timeout: 45000 });
    await page.waitForTimeout(1500);

    const catalog = await page.evaluate(async () => {
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
      const tables = await get('priceTables') || [];
      const procs = await get('priceTableProcedures') || [];
      return { tables: tables.length, procs: procs.length };
    });
    note('price_seed', catalog.procs > 0, JSON.stringify(catalog));
    report.reached.priceSeed = catalog.procs > 0;

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
    note('patient', true, report.patientId);

    await clickFirst(page, /Orçamentos e Contratos/i);
    await clickFirst(page, /Criar novo orçamento/i);
    await clickFirst(page, /Confirmar e abrir planejamento/i);
    await page.waitForURL(/\/atendimento-clinico\//, { timeout: 20000 });
    report.appointmentId = (page.url().match(/atendimento-clinico\/([^/?#]+)/) || [])[1];
    report.FIRST_CTA_RETEST = 'PASS';
    report.reached.budgetOpen = true;
    note('first_cta', true, report.appointmentId);

    // Add procedure
    await clickFirst(page, /Adicionar procedimento/i);
    await page.waitForTimeout(700);
    const row = page.locator('.procedure-selector-table tbody tr, table tbody tr').first();
    if (await row.count()) {
      await row.locator('input[type="checkbox"], button, td').first().click().catch(async () => {
        await row.click();
      });
      // Prefer checkbox aria
      const cb = page.locator('input[type="checkbox"]').first();
      if (await cb.count()) await cb.check().catch(() => cb.click());
      await page.waitForTimeout(300);
      await clickFirst(page, /Adicionar procedimento|Adicionar ao planejamento/i);
      await page.waitForTimeout(800);
      note('add_procedure', true);
      report.reached.procedureAdded = true;
    } else {
      const modalText = await page.locator('[role="dialog"], .modal').innerText().catch(() => '');
      note('add_procedure', false, modalText.slice(0, 200));
      report.secondBlocker = {
        cta: 'Adicionar procedimento',
        class: 'L',
        detail: `Catálogo vazio no modal. seed=${JSON.stringify(catalog)}`,
      };
      throw new Error('no_procedure_rows');
    }

    // Generate budget
    const genBudget = page.getByRole('button', { name: /Gerar orçamento/i }).first();
    if (await genBudget.isVisible().catch(() => false)) {
      await genBudget.click();
      await page.waitForTimeout(1200);
      note('gerar_orcamento', true, page.url());
      report.reached.budgetGenerated = true;
    } else {
      note('gerar_orcamento', false, 'button missing');
      // navigate to Orçamento tab
      await page.getByRole('button', { name: /^Orçamento$/i }).first().click().catch(() => {});
    }

    // Choose payment + approve
    await page.getByRole('button', { name: /^Orçamento$/i }).first().click().catch(() => {});
    await page.waitForTimeout(800);

    const choose = page.getByRole('button', { name: /Escolher|Marcar como escolhida|Selecionar condição|Escolhida/i }).first();
    if (await choose.isVisible().catch(() => false)) {
      await choose.click();
      await page.waitForTimeout(500);
      note('choose_payment', true);
    } else {
      // try radio / present buttons
      const present = page.getByRole('button', { name: /Apresentar|À vista|PIX/i }).first();
      if (await present.isVisible().catch(() => false)) {
        await present.click();
        await page.waitForTimeout(400);
      }
      note('choose_payment', false, 'no explicit choose CTA');
    }

    const approve = page.getByRole('button', { name: /Aprovar orçamento/i }).first();
    if (await approve.isVisible().catch(() => false)) {
      const disabled = await approve.isDisabled();
      note('aprovar_visible', true, `disabled=${disabled}`);
      if (!disabled) {
        await approve.click();
        await page.waitForTimeout(500);
        const confirm = page.getByRole('button', { name: /Confirmar|Aprovar/i }).last();
        if (await confirm.isVisible().catch(() => false)) await confirm.click();
        await page.waitForTimeout(1200);
        note('aprovar', true);
        report.reached.budgetApproved = true;
      } else if (!report.secondBlocker) {
        report.secondBlocker = {
          cta: 'Aprovar orçamento',
          class: 'N',
          detail: 'disabled — condição de pagamento não escolhida',
        };
      }
    } else {
      note('aprovar_visible', false);
      if (!report.secondBlocker) {
        report.secondBlocker = {
          cta: 'Aprovar orçamento',
          class: 'N',
          detail: 'CTA não visível após gerar orçamento',
        };
      }
    }

    // Ir para Contrato / Gerar contrato
    const irContrato = page.getByRole('button', { name: /Ir para Contrato|^Contrato$/i }).first();
    if (await irContrato.isVisible().catch(() => false)) {
      await irContrato.click();
      await page.waitForTimeout(800);
      note('nav_contrato', true);
      report.reached.contractSection = true;
    }

    const gerarContrato = page.getByRole('button', { name: /Gerar contrato/i }).first();
    if (await gerarContrato.isVisible().catch(() => false)) {
      const disabled = await gerarContrato.isDisabled();
      note('gerar_contrato', !disabled, `disabled=${disabled}`);
      if (!disabled) {
        await gerarContrato.click();
        await page.waitForTimeout(1500);
        report.reached.contractGeneratedAttempt = true;
      } else if (!report.secondBlocker) {
        report.secondBlocker = { cta: 'Gerar contrato', class: 'N', detail: 'disabled' };
      }
    } else {
      note('gerar_contrato', false);
      const body = await page.locator('body').innerText();
      if (!report.secondBlocker) {
        report.secondBlocker = {
          cta: 'Gerar contrato',
          class: /bloquead|pendente|obrigat/i.test(body) ? 'O' : 'N',
          detail: body.slice(0, 240),
        };
      }
    }

    await page.screenshot({
      path: path.join(ROOT, 'docs/reports/_phase1021z_flow_continue.png'),
      fullPage: false,
    });
  } catch (e) {
    note('fatal', false, e.message || e);
    if (!report.secondBlocker) {
      report.secondBlocker = { cta: 'flow', class: 'P', detail: String(e.message || e).slice(0, 300) };
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    FIRST_CTA_RETEST: report.FIRST_CTA_RETEST,
    reached: report.reached,
    secondBlocker: report.secondBlocker,
    steps: steps.map((s) => ({ step: s.step, ok: s.ok, detail: (s.detail || '').slice(0, 100) })),
  }, null, 2));
  await browser.close();
  process.exit(report.FIRST_CTA_RETEST === 'PASS' ? 0 : 2);
}

main().catch((e) => {
  console.log(JSON.stringify({ error: String(e.message || e) }));
  process.exit(2);
});
