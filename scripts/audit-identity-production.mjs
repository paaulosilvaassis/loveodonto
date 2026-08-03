#!/usr/bin/env node
/**
 * Auditoria da Admin API em produção — módulo Identity + convites.
 *
 * Uso:
 *   node scripts/audit-identity-production.mjs <URL_BASE>
 *
 * Exemplo:
 *   node scripts/audit-identity-production.mjs https://sua-api.up.railway.app
 */

const TIMEOUT_MS = 12_000;

const IDENTITY_ROUTES = [
  { method: 'GET', path: '/internal/app/identities' },
  { method: 'GET', path: '/internal/app/identity-health' },
  { method: 'POST', path: '/internal/app/identities/provision' },
  { method: 'POST', path: '/internal/app/identities/00000000-0000-0000-0000-000000000001/resend-invite' },
  { method: 'POST', path: '/internal/app/identities/00000000-0000-0000-0000-000000000001/reset-password' },
  { method: 'POST', path: '/internal/app/identities/00000000-0000-0000-0000-000000000001/repair' },
  { method: 'POST', path: '/internal/app/identities/00000000-0000-0000-0000-000000000001/deactivate' },
  { method: 'POST', path: '/internal/app/identities/00000000-0000-0000-0000-000000000001/reactivate' },
];

function ok(msg) { process.stdout.write(`✓ ${msg}\n`); }
function bad(msg) { process.stdout.write(`✗ ${msg}\n`); }
function info(msg) { process.stdout.write(`→ ${msg}\n`); }

async function fetchJson(url, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
    return { status: response.status, text, json, isJson: Boolean(json) };
  } finally {
    clearTimeout(timer);
  }
}

const rawArg = process.argv[2];
if (!rawArg) {
  bad('Informe a URL base da Admin API (Railway).');
  process.exit(1);
}

let baseUrl;
try {
  baseUrl = new URL(rawArg);
} catch {
  bad(`URL inválida: ${rawArg}`);
  process.exit(1);
}

const report = { correct: [], incorrect: [], warnings: [] };

info(`Auditoria Identity — ${baseUrl.origin}\n`);

const health = await fetchJson(new URL('/health', baseUrl).toString());
if (health.status === 404 && health.text.includes('Application not found')) {
  bad('Railway: Application not found — serviço inexistente ou URL errada.');
  report.incorrect.push('API Railway inacessível (404 Application not found)');
  process.exit(1);
}

if (health.status !== 200 || !health.json?.ok) {
  bad(`/health falhou (HTTP ${health.status})`);
  report.incorrect.push(`/health não responde 200 ok`);
} else {
  ok(`/health OK — service=${health.json.service}, version=${health.json.version || '?'}`);
  report.correct.push('/health responde');

  if (health.json.features?.identityService) {
    ok('features.identityService = true');
    report.correct.push('Build declara identityService');
  } else {
    bad('features.identityService ausente ou false — deploy desatualizado');
    report.incorrect.push('Deploy sem flag identityService no /health');
  }

  if (health.json.build?.identityModule) {
    ok('build.identityModule = true');
    report.correct.push('Módulo identity no build');
  } else {
    bad('build.identityModule ausente — versão antiga de index.js');
    report.incorrect.push('Versão antiga (sem build.identityModule)');
  }

  if (health.json.features?.supabaseAuthPublicClient) {
    ok('SUPABASE_ANON_KEY resolvida no backend');
    report.correct.push('SUPABASE_ANON_KEY configurada');
  } else {
    bad('SUPABASE_ANON_KEY ausente — convites SMTP Supabase falham');
    report.incorrect.push('SUPABASE_ANON_KEY ausente no Railway');
  }

  if (health.json.features?.transactionalEmail) {
    ok('EMAIL_API_KEY configurada (Resend/SendGrid)');
    report.correct.push('E-mail transacional configurado');
  } else {
    bad('EMAIL_API_KEY ausente — depende de SMTP Supabase');
    report.warnings.push('Sem e-mail transacional; depende de Supabase SMTP + anon key');
  }
}

info('\nRotas Identity (sem token — esperado 401/400/501, nunca 404 HTML):');
for (const route of IDENTITY_ROUTES) {
  const url = new URL(route.path, baseUrl).toString();
  const result = await fetchJson(url, {
    method: route.method,
    body: route.method === 'POST' ? { tenant_id: 'probe' } : undefined,
  });
  const isHtml = result.text.trim().toLowerCase().startsWith('<!doctype')
    || result.text.toLowerCase().includes('cannot get')
    || result.text.toLowerCase().includes('cannot post');
  if (result.status === 404 && isHtml) {
    bad(`${route.method} ${route.path} → 404 (rota AUSENTE no deploy)`);
    report.incorrect.push(`Rota ausente: ${route.method} ${route.path}`);
  } else if (result.status === 501 && result.json?.message?.includes('008_app_identities')) {
    bad(`${route.method} ${route.path} → 501 migration identities pendente`);
    report.incorrect.push('Migration 008_app_identities não aplicada no Supabase de produção');
  } else if ([401, 400, 403, 501].includes(result.status) && result.isJson) {
    ok(`${route.method} ${route.path} → ${result.status} JSON (registrada)`);
    report.correct.push(`Rota registrada: ${route.path}`);
  } else {
    bad(`${route.method} ${route.path} → HTTP ${result.status} (inesperado)`);
    report.warnings.push(`${route.method} ${route.path} → ${result.status}`);
  }
}

process.stdout.write('\n--- Resumo ---\n');
process.stdout.write(`Corretos: ${report.correct.length}\n`);
process.stdout.write(`Incorretos: ${report.incorrect.length}\n`);
process.stdout.write(`Avisos: ${report.warnings.length}\n`);

if (report.incorrect.length) {
  process.stdout.write('\nAções recomendadas:\n');
  process.stdout.write('1. Railway → serviço server/ → Root Directory = server\n');
  process.stdout.write('2. Redeploy com commit mais recente (identity + env vars)\n');
  process.stdout.write('3. Variáveis: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,\n');
  process.stdout.write('   APP_URL, APP_INVITE_REDIRECT_TO, APP_PASSWORD_RESET_REDIRECT_TO\n');
  process.stdout.write('4. Vercel: VITE_PLATFORM_API_BASE_URL = URL pública do Railway\n');
  process.exit(1);
}

process.exit(0);
