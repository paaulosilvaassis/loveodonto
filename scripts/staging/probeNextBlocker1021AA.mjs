#!/usr/bin/env node
/**
 * PHASE_10.21AA — After Gerar contrato PASS, probe next blocker (one step).
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
const OUT = path.join(ROOT, 'docs/reports/_phase1021aa_next_blocker.json');
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

async function main() {
  const creds = parse(path.join(ROOT, 'scripts/staging/.staging_smoke_creds.local'));
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const report = { nextBlocker: null, reached: {}, steps: [] };
  const note = (s, ok, d = '') => report.steps.push({ step: s, ok, detail: String(d).slice(0, 280) });

  try {
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
    await page.waitForTimeout(2000);
    report.reached.generate = true;
    note('generate', true, page.url());

    const body = await page.locator('body').innerText();
    report.bodySnippet = body.slice(0, 2000);

    // Probe wizard / operational CTAs
    const probes = [
      { key: 'wizard', re: /Continuar|Próximo|Avançar|Revisar/i },
      { key: 'tcle', re: /TCLE|Consentimento/i },
      { key: 'lgpd', re: /LGPD|Privacidade/i },
      { key: 'package', re: /Pacote|Package|Adicionar ao package|Documentos do tratamento/i },
      { key: 'freeze', re: /Congelar|Freeze|Fechar pacote|Finalizar pacote/i },
      { key: 'public', re: /Link público|Abrir página|Copiar link|Enviar link/i },
      { key: 'sign', re: /Assinar|Assinatura/i },
    ];
    for (const p of probes) {
      const el = page.getByRole('button', { name: p.re }).first();
      const visible = await el.isVisible().catch(() => false);
      const disabled = visible ? await el.isDisabled().catch(() => false) : null;
      note(`probe_${p.key}`, visible && !disabled, `visible=${visible} disabled=${disabled}`);
      report.reached[p.key] = visible && !disabled;
      if (visible && disabled && !report.nextBlocker) {
        report.nextBlocker = { cta: p.key, class: 'N', detail: 'visible but disabled' };
      }
    }

    // If Continuar available, click once and see
    const next = page.getByRole('button', { name: /Continuar|Próximo|Avançar/i }).first();
    if (await next.isVisible().catch(() => false) && !(await next.isDisabled())) {
      await next.click();
      await page.waitForTimeout(1200);
      note('wizard_next', true, page.url());
      const body2 = await page.locator('body').innerText();
      report.afterNextSnippet = body2.slice(0, 1200);
    } else if (!report.nextBlocker) {
      // Look for error / pending in contract modal
      const modal = page.locator('[role="dialog"], .modal, .operational-wizard').first();
      const modalText = await modal.innerText().catch(() => '');
      if (modalText) {
        report.nextBlocker = {
          cta: 'post-generate wizard',
          class: /pendente|bloque|falt|obrigat/i.test(modalText) ? 'A' : 'P',
          detail: modalText.slice(0, 300),
        };
      } else if (!report.reached.wizard) {
        report.nextBlocker = {
          cta: 'post-generate surface',
          class: 'P',
          detail: body.slice(0, 300),
        };
      }
    }

    await page.screenshot({
      path: path.join(ROOT, 'docs/reports/_phase1021aa_next_blocker.png'),
      fullPage: false,
    });
  } catch (e) {
    report.error = String(e.message || e).slice(0, 400);
    if (!report.nextBlocker) report.nextBlocker = { cta: 'flow', class: 'P', detail: report.error };
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    nextBlocker: report.nextBlocker,
    reached: report.reached,
    error: report.error || null,
    steps: report.steps.slice(-12),
  }, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.log(JSON.stringify({ error: String(e.message || e) }));
  process.exit(2);
});
