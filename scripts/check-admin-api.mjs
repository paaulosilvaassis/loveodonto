#!/usr/bin/env node
/**
 * Smoke test do backend SaaS / Admin API.
 *
 * Uso:
 *   node scripts/check-admin-api.mjs <URL_BASE>
 *
 * Exemplos:
 *   node scripts/check-admin-api.mjs https://love-odonto-api.up.railway.app
 *   node scripts/check-admin-api.mjs http://127.0.0.1:3001
 *
 * Saída:
 *   - exit code 0 → /health respondeu 200 com payload esperado
 *   - exit code 1 → URL inválida, timeout, status != 200 ou payload incorreto
 *
 * Pensado para usar em CI, pós-deploy do Railway e validação manual antes
 * de configurar VITE_PLATFORM_API_BASE_URL na Vercel.
 */

const TIMEOUT_MS = 10_000;
const REQUIRED_FIELDS = ['ok', 'service'];

function fail(message, details) {
  process.stderr.write(`\u001b[31m\u2717 ${message}\u001b[0m\n`);
  if (details) process.stderr.write(`${details}\n`);
  process.exit(1);
}

function info(message) {
  process.stdout.write(`\u001b[36m\u2192 ${message}\u001b[0m\n`);
}

function ok(message) {
  process.stdout.write(`\u001b[32m\u2713 ${message}\u001b[0m\n`);
}

const rawArg = process.argv[2];
if (!rawArg) {
  fail(
    'URL base não informada.',
    'Uso: node scripts/check-admin-api.mjs <URL_BASE>',
  );
}

let baseUrl;
try {
  baseUrl = new URL(rawArg);
} catch {
  fail(`URL inválida: ${rawArg}`);
}

if (!['http:', 'https:'].includes(baseUrl.protocol)) {
  fail(`Protocolo não suportado: ${baseUrl.protocol} (use http/https)`);
}

const healthUrl = new URL('/health', baseUrl.origin).toString();
info(`GET ${healthUrl}`);

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

let response;
try {
  response = await fetch(healthUrl, {
    method: 'GET',
    signal: controller.signal,
    headers: { Accept: 'application/json' },
  });
} catch (err) {
  clearTimeout(timer);
  const reason = err?.name === 'AbortError' ? `timeout (${TIMEOUT_MS}ms)` : err?.message;
  fail(`Falha de rede: ${reason}`, 'Verifique se o backend está publicado e acessível pela internet.');
}
clearTimeout(timer);

const status = response.status;
const bodyText = await response.text().catch(() => '');

if (status !== 200) {
  if (bodyText.includes('Application not found')) {
    fail(
      `HTTP ${status} — Railway: "Application not found".`,
      'O serviço não existe nesse domínio (foi removido, despausado ou a URL está errada). Republique o server/ no Railway.',
    );
  }
  fail(`HTTP ${status} — backend respondeu mas não com 200.`, bodyText.slice(0, 400));
}

let payload;
try {
  payload = JSON.parse(bodyText);
} catch {
  fail('Resposta 200 mas corpo não é JSON válido.', bodyText.slice(0, 400));
}

const missing = REQUIRED_FIELDS.filter((field) => !(field in payload));
if (missing.length) {
  fail(`Payload incompleto. Faltando: ${missing.join(', ')}`, JSON.stringify(payload, null, 2));
}

if (payload.ok !== true) {
  fail(`Backend respondeu mas "ok" não é true.`, JSON.stringify(payload, null, 2));
}

ok(`Backend acessível: ${payload.service} (${baseUrl.origin})`);
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

const probeUrl = new URL('/internal/platform/tenants/probe/resend-access', baseUrl.origin).toString();
info(`POST ${probeUrl} (probe rota resend-access)`);
const probeResponse = await fetch(probeUrl, { method: 'POST', headers: { Accept: 'application/json' } });
const probeText = await probeResponse.text().catch(() => '');
const probeIsJson = probeText.trim().startsWith('{');
if (!probeIsJson && probeText.toLowerCase().includes('cannot post')) {
  fail(
    'Rota POST /internal/platform/tenants/:id/resend-access ausente no backend publicado.',
    'Faça redeploy do serviço server/ no Railway (Root Directory = server) com o commit mais recente da main.',
  );
}
ok(`Rota resend-access presente (HTTP ${probeResponse.status}, resposta JSON)`);

process.stdout.write(`\nPróximos passos:\n`);
process.stdout.write(`  1. Vercel → Project Settings → Environment Variables (Production)\n`);
process.stdout.write(`     VITE_PLATFORM_API_BASE_URL = ${baseUrl.origin}\n`);
process.stdout.write(`  2. Vercel → Deployments → "Redeploy" o último build (a env Vite só entra em build time).\n`);
process.stdout.write(`  3. Abrir https://loveodonto.com.br/login e tentar autenticar.\n`);
process.exit(0);
