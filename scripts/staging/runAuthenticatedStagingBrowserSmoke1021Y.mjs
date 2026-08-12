#!/usr/bin/env node
/**
 * PHASE_10.21Y — Authenticated staging browser E2E smoke (Playwright).
 * HARD RULES: staging only; no production; no external delivery; no secrets in report.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/tmp/pw1021y/node_modules/playwright-core');
const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'docs/reports/_phase1021y_browser_smoke_result.json');
const BASE = process.env.STAGING_BROWSER_BASE || 'http://127.0.0.1:5188';
const API = process.env.STAGING_API_BASE || 'http://127.0.0.1:3011';
const STAGING_REF = 'tckdjyunwmdpqmewrwvt';
const PRODUCTION_REF = 'uoepkwhqztmsjnzirpev';
const PATIENT = 'TESTE PACKAGE MANIFEST BROWSER 1021Y';

function parseEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/\r/g, '');
  }
  return env;
}

function hardStop(summary, extra = {}) {
  const report = { ok: false, gate: 'BLOCKED', at: new Date().toISOString(), ...summary, ...extra };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: false, gate: 'BLOCKED', reason: summary.reason || summary.error || 'blocked' }));
  process.exit(2);
}

async function main() {
  const health = await fetch(`${API}/health`).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
  if (!health?.ok) hardStop({ reason: 'STAGING_API_DOWN', api: API, health });

  const creds = parseEnv(path.join(ROOT, 'scripts/staging/.staging_smoke_creds.local'));
  const email = creds.STAGING_SMOKE_EMAIL;
  const password = creds.STAGING_SMOKE_PASSWORD;
  if (!email || !password) hardStop({ reason: 'MISSING_STAGING_SMOKE_CREDS' });

  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const report = {
    ok: false,
    environment: 'STAGING',
    browserBase: BASE,
    apiBase: API,
    browserProject: null,
    productionDetected: false,
    login: false,
    banner: false,
    patient: false,
    budget: false,
    contract: false,
    tcle: false,
    lgpd: false,
    package: false,
    freeze: false,
    publicPage: false,
    signGate: false,
    mobile: false,
    signature: false,
    evidence: false,
    prontuario: false,
    externalCommunication: 'disabled',
    bugs: [],
    steps: [],
  };

  const note = (step, ok, detail = '') => {
    report.steps.push({ step, ok, detail: String(detail).slice(0, 240) });
  };

  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });

    // Banner + project checks
    const banner = page.getByTestId('staging-test-mode-banner');
    report.banner = await banner.isVisible().catch(() => false);
    const bodyText = await page.locator('body').innerText();
    if (bodyText.includes(PRODUCTION_REF) || bodyText.includes('uoepkwhqztmsjnzirpev')) {
      report.productionDetected = true;
      hardStop({ reason: 'PRODUCTION_REF_IN_UI', report });
    }
    if (!report.banner || !bodyText.includes('STAGING — DADOS FICTÍCIOS')) {
      // soft: continue but mark
      report.bugs.push({ sev: 'high', msg: 'Banner STAGING ausente ou texto incompleto' });
    }
    note('banner', report.banner);

    // Probe injected env via page evaluate
    const envProbe = await page.evaluate(() => {
      const e = import.meta.env || {};
      return {
        mode: e.MODE,
        staging: e.VITE_STAGING_TEST_MODE,
        appUrl: e.VITE_SUPABASE_APP_URL,
        platformUrl: e.VITE_SUPABASE_PLATFORM_URL,
        api: e.VITE_PLATFORM_API_BASE_URL,
        ref: e.VITE_SUPABASE_PROJECT_REF,
      };
    }).catch(() => null);

    // In browser page context import.meta.env may not be available from evaluate on login document.
    // Fallback: read from any script content already loaded is hard; use fetch of module.
    const mod = await page.request.get(`${BASE}/src/App.jsx`);
    const modText = await mod.text();
    if (modText.includes(`${PRODUCTION_REF}.supabase.co`)) {
      report.productionDetected = true;
      hardStop({ reason: 'PRODUCTION_IN_VITE_BUNDLE', report });
    }
    if (modText.includes(STAGING_REF)) report.browserProject = STAGING_REF;
    if (modText.includes('3011')) note('api_base_3011', true);
    note('env_probe', Boolean(report.browserProject), JSON.stringify(envProbe));

    // Login
    await page.fill('#login-email', email);
    await page.fill('#login-password', password);
    await page.click('button.login-form-button');
    await page.waitForTimeout(2500);

    const urlAfter = page.url();
    const loginError = await page.locator('.login-form-error').textContent().catch(() => '');
    report.login = !urlAfter.includes('/login') || await page.getByText(/dashboard|gestão|agenda|pacientes/i).first().isVisible().catch(() => false);
    if (!report.login) {
      // maybe still on login with error
      note('login', false, loginError || urlAfter);
      hardStop({ reason: 'LOGIN_FAILED', loginError, urlAfter, report });
    }
    note('login', true, urlAfter);

    // Navigate to patients / create
    await page.goto(`${BASE}/pacientes/cadastro`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);

    // Fill patient name fields flexibly
    const nameSelectors = [
      'input[name="name"]',
      'input[name="fullName"]',
      'input[name="nome"]',
      '#name',
      '#patient-name',
      'input[placeholder*="Nome"]',
    ];
    let filledName = false;
    for (const sel of nameSelectors) {
      const loc = page.locator(sel).first();
      if (await loc.count() && await loc.isVisible().catch(() => false)) {
        await loc.fill(PATIENT);
        filledName = true;
        break;
      }
    }
    // Fallback: first text input in form
    if (!filledName) {
      const inputs = page.locator('form input[type="text"], form input:not([type])');
      if (await inputs.count()) {
        await inputs.first().fill(PATIENT);
        filledName = true;
      }
    }

    // Fake contacts
    for (const [sel, val] of [
      ['input[name="email"], input[type="email"]', 'teste.1021y@example.invalid'],
      ['input[name="phone"], input[name="telefone"], input[type="tel"]', '11999990000'],
      ['input[name="cpf"]', '00000000000'],
    ]) {
      const loc = page.locator(sel).first();
      if (await loc.count() && await loc.isVisible().catch(() => false)) {
        await loc.fill(val).catch(() => {});
      }
    }

    // Save patient
    const saveBtn = page.getByRole('button', { name: /salvar|cadastrar|criar/i }).first();
    if (await saveBtn.count()) {
      await saveBtn.click().catch(() => {});
      await page.waitForTimeout(2000);
    }
    report.patient = filledName && (await page.getByText(PATIENT).first().isVisible().catch(() => false) || page.url().includes('/pacientes/'));
    note('patient', report.patient, page.url());

    // Try budget / clinical paths — capture available UI for report if blocked
    const navCandidates = [
      '/pacientes/busca',
      '/gestao/dashboard',
      '/comercial/orcamentos',
      '/clinico/atendimentos',
    ];
    for (const route of navCandidates) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(800);
      const visiblePatient = await page.getByText(PATIENT).first().isVisible().catch(() => false);
      if (visiblePatient) {
        note(`route:${route}`, true, 'patient visible');
        break;
      }
      note(`route:${route}`, false, page.url());
    }

    // Mobile viewport check on current page
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    report.mobile = !hasHScroll;
    note('mobile_no_hscroll', report.mobile);

    // Desktop restore
    await page.setViewportSize({ width: 1440, height: 900 });

    // Screenshot evidence (no PII beyond fictional)
    const shotDir = path.join(ROOT, 'docs/reports/_phase1021y_shots');
    fs.mkdirSync(shotDir, { recursive: true });
    await page.screenshot({ path: path.join(shotDir, 'after-login-desktop.png'), fullPage: false });

    // Final gate decision: full contract/package path may still be blocked by UX complexity
    const criticalPathDone = report.login && report.banner && report.browserProject === STAGING_REF && !report.productionDetected;
    report.ok = criticalPathDone && report.patient && report.signGate && report.signature && report.evidence;
    report.gate = report.ok ? 'STAGING_BROWSER_E2E_PASS' : 'BLOCKED';
    report.reason = report.ok
      ? null
      : 'Fluxo visual autenticado parcial — login/banner/project OK; package/sign path não concluído automaticamente nesta sessão';

    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      ok: report.ok,
      gate: report.gate,
      login: report.login,
      banner: report.banner,
      browserProject: report.browserProject,
      patient: report.patient,
      productionDetected: report.productionDetected,
      out: OUT,
    }));
    await browser.close();
    process.exit(report.ok ? 0 : 2);
  } catch (e) {
    await browser.close().catch(() => {});
    hardStop({ reason: 'PLAYWRIGHT_EXCEPTION', error: String(e?.message || e).slice(0, 300), report });
  }
}

main();
