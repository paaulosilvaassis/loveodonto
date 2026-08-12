#!/usr/bin/env node
/**
 * PHASE_10.21Z — Retest first failing CTA after root-cause fix.
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
const OUT = path.join(ROOT, 'docs/reports/_phase1021z_first_cta_retest.json');
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
  if (kind === 'select') {
    await field.locator('select').selectOption(value);
  } else {
    await field.locator('input,textarea').first().fill(value);
  }
  return true;
}

async function main() {
  const creds = parse(path.join(ROOT, 'scripts/staging/.staging_smoke_creds.local'));
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const result = {
    firstFailingCta: 'Criar novo orçamento',
    FIRST_CTA_RETEST: 'FAIL',
    patientId: null,
    appointmentId: null,
    urlAfter: null,
    trace: [],
    error: null,
  };

  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.fill('#login-email', creds.STAGING_SMOKE_EMAIL);
    await page.fill('#login-password', creds.STAGING_SMOKE_PASSWORD);
    await page.click('button.login-form-button');
    await page.waitForURL('**/gestao/**', { timeout: 45000 });

    await page.goto(`${BASE}/pacientes/cadastro`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1200);
    const pacientePlus = page.getByRole('button', { name: /Paciente \+/i });
    if (await pacientePlus.count()) await pacientePlus.click().catch(() => {});
    await page.waitForTimeout(400);

    await fillByLabel(page, 'Nome Completo *', PATIENT);
    await fillByLabel(page, 'Sexo *', 'O', 'select');
    await fillByLabel(page, 'Data de Nascimento *', '1990-01-15');
    await fillByLabel(page, 'CPF *', '390.533.447-05');

    await page.getByRole('button', { name: /^Salvar$/i }).click();
    await page.waitForTimeout(2500);
    await page.waitForURL(/\/pacientes\/cadastro\/patient-/, { timeout: 20000 });

    result.patientId = (page.url().match(/patient-[a-f0-9-]+/i) || [])[0] || null;
    if (!result.patientId) throw new Error(`patient_not_saved url=${page.url()}`);

    await page.getByRole('button', { name: /Orçamentos e Contratos/i }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: /Criar novo orçamento/i }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Confirmar e abrir planejamento/i }).click();

    await page.waitForURL(/\/atendimento-clinico\//, { timeout: 20000 });
    result.urlAfter = page.url();
    result.appointmentId = (page.url().match(/atendimento-clinico\/([^/?#]+)/) || [])[1] || null;
    result.trace = await page.evaluate(() => window.__STAGING_CTA_TRACE__ || []);
    result.FIRST_CTA_RETEST = result.appointmentId && !/jornada-do-paciente/.test(result.urlAfter)
      ? 'PASS'
      : 'FAIL';

    await page.screenshot({
      path: path.join(ROOT, 'docs/reports/_phase1021z_first_cta_retest.png'),
      fullPage: false,
    });
  } catch (e) {
    result.error = String(e.message || e).slice(0, 500);
    result.urlAfter = page.url();
    result.trace = await page.evaluate(() => window.__STAGING_CTA_TRACE__ || []).catch(() => []);
    await page.screenshot({
      path: path.join(ROOT, 'docs/reports/_phase1021z_first_cta_retest.png'),
      fullPage: false,
    }).catch(() => {});
  }

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    FIRST_CTA_RETEST: result.FIRST_CTA_RETEST,
    patientId: result.patientId,
    appointmentId: result.appointmentId,
    urlAfter: result.urlAfter,
    error: result.error,
    traceEvents: (result.trace || []).map((t) => t.event),
  }));
  await browser.close();
  process.exit(result.FIRST_CTA_RETEST === 'PASS' ? 0 : 2);
}

main().catch((e) => {
  console.log(JSON.stringify({ FIRST_CTA_RETEST: 'FAIL', error: String(e.message || e).slice(0, 300) }));
  process.exit(2);
});
