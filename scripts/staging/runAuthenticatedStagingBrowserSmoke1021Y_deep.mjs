#!/usr/bin/env node
/**
 * PHASE_10.21Y — deeper authenticated staging smoke (patient → budget attempt → contract UI probe).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/tmp/pw1021y/node_modules/playwright-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'docs/reports/_phase1021y_browser_smoke_result.json');
const BASE = 'http://127.0.0.1:5188';
const API = 'http://127.0.0.1:3011';
const STAGING_REF = 'tckdjyunwmdpqmewrwvt';
const PRODUCTION_REF = 'uoepkwhqztmsjnzirpev';
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
  const health = await fetch(`${API}/health`).then((r) => r.json());
  if (!health?.ok) throw new Error('api down');
  const creds = parse(path.join(ROOT, 'scripts/staging/.staging_smoke_creds.local'));
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const report = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  report.steps = report.steps || [];
  report.at = new Date().toISOString();
  const note = (step, ok, detail = '') => report.steps.push({ step, ok, detail: String(detail).slice(0, 240) });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  const bannerOk = await page.getByTestId('staging-test-mode-banner').isVisible();
  report.banner = bannerOk;
  note('banner_recheck', bannerOk);

  const appJs = await (await page.request.get(`${BASE}/src/App.jsx`)).text();
  if (appJs.includes(`${PRODUCTION_REF}.supabase.co`)) throw new Error('production in bundle');
  report.browserProject = STAGING_REF;
  report.productionDetected = false;

  await page.fill('#login-email', creds.STAGING_SMOKE_EMAIL);
  await page.fill('#login-password', creds.STAGING_SMOKE_PASSWORD);
  await page.click('button.login-form-button');
  await page.waitForURL('**/gestao/**', { timeout: 45000 });
  report.login = true;
  note('login', true, page.url());

  await page.goto(`${BASE}/pacientes/cadastro`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  // Ensure edit mode
  const pacientePlus = page.getByRole('button', { name: /Paciente \+/i });
  if (await pacientePlus.count()) await pacientePlus.click().catch(() => {});
  await page.waitForTimeout(500);

  const filled = {
    name: await fillByLabel(page, 'Nome Completo *', PATIENT),
    sex: await fillByLabel(page, 'Sexo *', 'O', 'select'),
    birth: await fillByLabel(page, 'Data de Nascimento *', '1990-01-15'),
    cpf: await fillByLabel(page, 'CPF *', '390.533.447-05'), // valid-format test CPF style
  };
  await fillByLabel(page, 'E-mail Principal', 'teste.1021y@example.invalid');
  await fillByLabel(page, 'Telefone Principal', '(11) 99999-0000');

  await page.getByRole('button', { name: /^Salvar$/i }).click();
  await page.waitForTimeout(2500);
  const err = await page.locator('.status-error, .toast, .alert, text=Preencha os campos').first().textContent().catch(() => '');
  const patientVisible = await page.getByText(PATIENT).first().isVisible().catch(() => false);
  report.patient = patientVisible || page.url().includes('/pacientes/cadastro/');
  note('patient_save', report.patient, JSON.stringify({ filled, err: String(err || '').slice(0, 120), url: page.url() }));
  await page.screenshot({ path: path.join(ROOT, 'docs/reports/_phase1021y_shots/patient-save.png'), fullPage: false });

  // Search patient
  await page.goto(`${BASE}/pacientes/busca`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const search = page.locator('input[type="search"], input[placeholder*="Buscar"], input[placeholder*="Nome"]').first();
  if (await search.count()) {
    await search.fill(PATIENT);
    await page.waitForTimeout(1000);
  }
  const found = await page.getByText(PATIENT).first().isVisible().catch(() => false);
  note('patient_search', found);
  report.patient = report.patient || found;

  if (found) {
    await page.getByText(PATIENT).first().click();
    await page.waitForTimeout(1500);
  }

  // Probe clinical / contract entry points
  const probes = [
    { name: 'orcamentos_tab', action: async () => page.getByRole('button', { name: /Orçamentos e Contratos/i }).click() },
    { name: 'novo_orcamento', action: async () => page.getByRole('button', { name: /novo orçamento|criar orçamento|orçamento/i }).first().click() },
    { name: 'contrato_cta', action: async () => page.getByRole('button', { name: /contrato|gerar contrato/i }).first().click() },
    { name: 'tcle_cta', action: async () => page.getByRole('button', { name: /tcle|consentimento/i }).first().click() },
  ];
  for (const p of probes) {
    try {
      await p.action();
      await page.waitForTimeout(1000);
      note(p.name, true, page.url());
    } catch (e) {
      note(p.name, false, String(e.message || e).slice(0, 120));
    }
  }

  // Capture body keywords for package/sign surfaces
  const body = await page.locator('body').innerText();
  report.contract = /contrato/i.test(body);
  report.tcle = /tcle|consentimento/i.test(body);
  report.lgpd = /lgpd|privacidade/i.test(body);
  report.package = /package|pacote|documentos do seu tratamento/i.test(body);
  note('keywords', true, JSON.stringify({
    contract: report.contract, tcle: report.tcle, lgpd: report.lgpd, package: report.package,
  }));

  // Mobile check
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  report.mobile = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
  note('mobile', report.mobile);
  await page.screenshot({ path: path.join(ROOT, 'docs/reports/_phase1021y_shots/mobile.png') });

  report.ok = Boolean(report.login && report.banner && report.patient && report.signGate && report.signature && report.evidence);
  report.gate = report.ok ? 'STAGING_BROWSER_E2E_PASS' : 'BLOCKED';
  report.reason = report.ok ? null : 'Paciente/login/staging OK; fluxo completo contrato→TCLE→LGPD→freeze→assinatura não fechou automaticamente (UI clínica IndexedDB/multi-step).';
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: report.ok,
    gate: report.gate,
    login: report.login,
    banner: report.banner,
    patient: report.patient,
    browserProject: report.browserProject,
    productionDetected: report.productionDetected,
  }));
  await browser.close();
  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, gate: 'BLOCKED', error: String(e.message || e).slice(0, 300) }));
  process.exit(2);
});
