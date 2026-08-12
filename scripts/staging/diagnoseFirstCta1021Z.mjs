#!/usr/bin/env node
/**
 * PHASE_10.21Z — Diagnose first failing CTA after patient (staging only).
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
const OUT = path.join(ROOT, 'docs/reports/_phase1021z_first_cta_diag.json');
const PATIENT_ID = 'patient-f07a81f4-8438-4e1e-85a5-375df41d43e7';
const PATIENT = 'TESTE PACKAGE MANIFEST BROWSER 1021Y';

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
  const logs = [];
  const http = [];

  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') logs.push({ t, text: msg.text().slice(0, 300) });
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('127.0.0.1:3011') || url.includes('supabase.co')) {
      http.push({
        url: url.replace(/eyJ[a-zA-Z0-9_-]+/g, '[REDACTED]').slice(0, 200),
        status: res.status(),
        method: res.request().method(),
      });
    }
  });

  const diag = {
    firstFailingCta: null,
    rootCauseClass: null,
    observations: [],
    http,
    logs,
  };

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.fill('#login-email', creds.STAGING_SMOKE_EMAIL);
  await page.fill('#login-password', creds.STAGING_SMOKE_PASSWORD);
  await page.click('button.login-form-button');
  await page.waitForURL('**/gestao/**', { timeout: 45000 });

  // Open patient cadastro directly
  await page.goto(`${BASE}/pacientes/cadastro/${PATIENT_ID}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  const body1 = await page.locator('body').innerText();
  diag.observations.push({
    step: 'open_patient',
    url: page.url(),
    hasPatientName: body1.includes(PATIENT) || body1.includes('TESTE PACKAGE'),
    snippet: body1.slice(0, 400),
  });

  // CTA 0: tab Orçamentos e Contratos
  const tab = page.getByRole('button', { name: /Orçamentos e Contratos/i });
  const tabVisible = await tab.isVisible().catch(() => false);
  diag.observations.push({ step: 'tab_visible', tabVisible });
  if (!tabVisible) {
    // try text click
    const alt = page.locator('button.tab-item', { hasText: /Orçamentos/i });
    diag.observations.push({ step: 'tab_alt_count', count: await alt.count() });
    if (await alt.count()) {
      await alt.first().click();
    } else {
      diag.firstFailingCta = 'Tab Orçamentos e Contratos';
      diag.rootCauseClass = 'N';
      fs.writeFileSync(OUT, JSON.stringify(diag, null, 2));
      console.log(JSON.stringify({ firstFailingCta: diag.firstFailingCta, rootCauseClass: diag.rootCauseClass }));
      await browser.close();
      process.exit(2);
    }
  } else {
    await tab.click();
  }
  await page.waitForTimeout(1000);

  const body2 = await page.locator('body').innerText();
  diag.observations.push({
    step: 'after_tab',
    url: page.url(),
    hasCreateBtn: /Criar novo orçamento/i.test(body2),
    hasInactiveMsg: /Jornada do Paciente|atendimento clínico/i.test(body2),
    snippet: body2.slice(0, 600),
  });

  // CTA 1: Criar novo orçamento
  const createBtn = page.getByRole('button', { name: /Criar novo orçamento/i });
  const createVisible = await createBtn.isVisible().catch(() => false);
  const createDisabled = createVisible ? await createBtn.isDisabled().catch(() => false) : null;
  diag.observations.push({ step: 'create_btn', createVisible, createDisabled });

  if (!createVisible) {
    diag.firstFailingCta = 'Criar novo orçamento (não visível)';
    diag.rootCauseClass = createDisabled === null ? 'N' : 'N';
    // permission?
    if (/sem permiss|não tem permiss/i.test(body2)) diag.rootCauseClass = 'K';
    fs.writeFileSync(OUT, JSON.stringify(diag, null, 2));
    console.log(JSON.stringify({ firstFailingCta: diag.firstFailingCta, rootCauseClass: diag.rootCauseClass, createVisible }));
    await browser.close();
    process.exit(2);
  }

  await createBtn.click();
  await page.waitForTimeout(800);
  // Modal confirm?
  const modalConfirm = page.getByRole('button', { name: /confirmar|criar|iniciar|continuar/i });
  if (await modalConfirm.count()) {
    const texts = await modalConfirm.allTextContents();
    diag.observations.push({ step: 'modal_buttons', texts: texts.slice(0, 8) });
    // Prefer explicit confirm in modal
    const confirm = page.locator('.modal button, [role="dialog"] button').filter({ hasText: /criar|confirmar|iniciar/i }).first();
    if (await confirm.count()) await confirm.click().catch(() => modalConfirm.first().click());
    else await modalConfirm.first().click();
  }
  await page.waitForTimeout(2000);

  const urlAfter = page.url();
  const body3 = await page.locator('body').innerText();
  const errVisible = await page.locator('.clinical-inline-error').textContent().catch(() => '');
  diag.observations.push({
    step: 'after_create_click',
    url: urlAfter,
    error: String(errVisible || '').slice(0, 300),
    navigatedToClinical: /atendimento-clinico/.test(urlAfter),
    navigatedToJourney: /jornada-do-paciente/.test(urlAfter),
    snippet: body3.slice(0, 500),
  });

  if (/jornada-do-paciente/.test(urlAfter) || /Inicie o atendimento clínico/i.test(errVisible) || /Inicie o atendimento clínico/i.test(body3)) {
    diag.firstFailingCta = 'Criar novo orçamento';
    diag.rootCauseClass = 'I'; // appointmentId perdido / ausente
    diag.rootCauseDetail = 'InactiveClinicalSessionError: requer atendimento clínico ativo (appointmentId) antes de criar orçamento';
  } else if (/atendimento-clinico/.test(urlAfter)) {
    diag.firstFailingCta = null;
    diag.rootCauseClass = null;
    diag.createBudgetPass = true;
  } else if (errVisible) {
    diag.firstFailingCta = 'Criar novo orçamento';
    diag.rootCauseClass = 'D';
    diag.rootCauseDetail = errVisible;
  } else {
    diag.firstFailingCta = 'Criar novo orçamento';
    diag.rootCauseClass = 'P';
    diag.rootCauseDetail = 'Clique não navegou nem mostrou erro claro';
  }

  await page.screenshot({ path: path.join(ROOT, 'docs/reports/_phase1021z_first_cta.png'), fullPage: false });
  fs.writeFileSync(OUT, JSON.stringify(diag, null, 2));
  console.log(JSON.stringify({
    firstFailingCta: diag.firstFailingCta,
    rootCauseClass: diag.rootCauseClass,
    detail: diag.rootCauseDetail || null,
    urlAfter,
    createBudgetPass: Boolean(diag.createBudgetPass),
  }));
  await browser.close();
  process.exit(diag.createBudgetPass ? 0 : 2);
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 300) }));
  process.exit(2);
});
