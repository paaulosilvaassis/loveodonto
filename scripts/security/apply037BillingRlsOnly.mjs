/**
 * PHASE_SECURITY_01D — apply ONLY 037 via Management API database/query.
 * Requires env: SUPABASE_ACCESS_TOKEN (never logged).
 * Also uses .env.local for SUPABASE_URL + service/anon keys for probes.
 *
 * Usage (in the Terminal where the token is already exported):
 *   node scripts/security/apply037BillingRlsOnly.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REF = 'uoepkwhqztmsjnzirpev';
const PILOT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const MIGRATION = path.join(ROOT, 'supabase/migrations/037_platform_billing_rls_security_fix.sql');
const OUT = path.join(ROOT, 'docs/reports/_security01d_apply_result.json');

const TABLES = [
  'platform_subscriptions',
  'platform_invoices',
  'platform_billing_events',
  'platform_billing_alerts',
];

function loadDotEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return {};
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

function assertNo036(sql) {
  if (/036_app_package_manifest|app_package_manifests/i.test(sql)) {
    throw new Error('REFUSING_APPLY: SQL contains 036/package manifest content');
  }
}

async function managementSql(accessToken, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  return { ok: res.ok, status: res.status, body };
}

async function probe(url, key, role, table) {
  const r = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
  });
  const range = r.headers.get('content-range');
  const count = range && range.includes('/') ? range.split('/')[1] : null;
  let code = null;
  let message = null;
  if (r.status >= 400) {
    try {
      const j = await r.json();
      code = j.code || null;
      message = j.message || null;
    } catch { /* ignore */ }
  }
  return {
    table,
    role,
    status: r.status,
    readable: r.status >= 200 && r.status < 300,
    count,
    code,
    message: message ? String(message).slice(0, 120) : null,
  };
}

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    console.error(JSON.stringify({
      ok: false,
      error: 'SUPABASE_ACCESS_TOKEN_MISSING_IN_THIS_SHELL',
      hint: 'Run this script in the Terminal session where the token was exported.',
    }));
    process.exit(2);
  }

  const dotenv = loadDotEnvLocal();
  const url = process.env.SUPABASE_URL || dotenv.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || dotenv.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_PLATFORM_ANON_KEY || dotenv.VITE_SUPABASE_PLATFORM_ANON_KEY;
  if (!url || !serviceKey || !anonKey) {
    console.error(JSON.stringify({ ok: false, error: 'MISSING_SUPABASE_URL_OR_KEYS_IN_ENV_LOCAL' }));
    process.exit(2);
  }
  const host = new URL(url).host;
  if (!host.startsWith(REF)) {
    console.error(JSON.stringify({ ok: false, error: 'PROJECT_REF_MISMATCH', host }));
    process.exit(2);
  }

  const sql = fs.readFileSync(MIGRATION, 'utf8');
  assertNo036(sql);
  if (!sql.includes('platform_invoices') || !sql.includes('enable row level security')) {
    console.error(JSON.stringify({ ok: false, error: '037_SQL_UNEXPECTED_CONTENT' }));
    process.exit(2);
  }

  const report = {
    projectRef: REF,
    method: 'management_api_database_query_single_sql_037',
    migrationFile: 'supabase/migrations/037_platform_billing_rls_security_fix.sql',
    applied036: false,
    before: [],
    apply: null,
    rls: null,
    policies: null,
    afterAnon: [],
    afterService: [],
    grants: null,
    rollout: null,
    at: new Date().toISOString(),
  };

  for (const t of TABLES) {
    report.before.push(await probe(url, anonKey, 'anon', t));
    report.before.push(await probe(url, serviceKey, 'service', t));
  }

  // APPLY exactly 037 SQL — not migration chain
  const applyRes = await managementSql(accessToken, sql);
  report.apply = {
    ok: applyRes.ok,
    status: applyRes.status,
    // never include token; sanitize body
    bodySummary: applyRes.ok
      ? { success: true }
      : {
        error: typeof applyRes.body === 'object'
          ? (applyRes.body.message || applyRes.body.error || applyRes.body.raw || 'APPLY_FAILED')
          : String(applyRes.body).slice(0, 300),
      },
  };

  if (!applyRes.ok) {
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.error(JSON.stringify({ ok: false, stage: 'APPLY', status: applyRes.status }));
    process.exit(3);
  }

  // RLS catalog
  const rlsQ = await managementSql(accessToken, `
    select c.relname as table_name,
           c.relrowsecurity as rls_enabled,
           c.relforcerowsecurity as rls_forced
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in (
        'platform_subscriptions','platform_invoices',
        'platform_billing_events','platform_billing_alerts'
      )
    order by 1;
  `);
  report.rls = { ok: rlsQ.ok, status: rlsQ.status, rows: rlsQ.ok ? rlsQ.body : null };

  const polQ = await managementSql(accessToken, `
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'platform_subscriptions','platform_invoices',
        'platform_billing_events','platform_billing_alerts'
      )
    order by tablename, policyname;
  `);
  report.policies = { ok: polQ.ok, status: polQ.status, rows: polQ.ok ? polQ.body : null };

  const grantQ = await managementSql(accessToken, `
    select table_name, grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'platform_subscriptions','platform_invoices',
        'platform_billing_events','platform_billing_alerts'
      )
      and grantee in ('anon','authenticated','public','service_role')
    order by table_name, grantee, privilege_type;
  `);
  report.grants = { ok: grantQ.ok, status: grantQ.status, rows: grantQ.ok ? grantQ.body : null };

  for (const t of TABLES) {
    report.afterAnon.push(await probe(url, anonKey, 'anon', t));
    report.afterService.push(await probe(url, serviceKey, 'service', t));
  }

  // Rollout flags (no PUT)
  const flagsRes = await fetch(`${url}/rest/v1/feature_flags?select=flag_key,scope_type,scope_ref,enabled&or=(flag_key.eq.contracts_operational_ux_global_enabled,flag_key.eq.contracts_operational_ux_enabled)&limit=20`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  const flags = await flagsRes.json();
  report.rollout = {
    status: flagsRes.status,
    rows: Array.isArray(flags)
      ? flags.map((f) => ({
        flag_key: f.flag_key,
        scope_type: f.scope_type,
        scope_ref: f.scope_ref,
        enabled: f.enabled,
      }))
      : { error: flags?.message || 'flags_failed' },
    pilot: PILOT,
  };

  // Confirm 036 objects absent
  const m036 = await managementSql(accessToken, `
    select to_regclass('public.app_package_manifests') as manifests,
           to_regclass('public.app_package_manifest_documents') as docs,
           to_regclass('public.app_package_document_acceptances') as acceptances;
  `);
  report.packageManifest036Tables = m036.ok ? m036.body : { error: true };

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: true,
    out: OUT,
    applyOk: report.apply.ok,
    anonReadableAfter: report.afterAnon.filter((r) => r.readable).map((r) => r.table),
    serviceCounts: report.afterService.map((r) => ({ table: r.table, count: r.count })),
  }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err && err.message || err).slice(0, 300) }));
  process.exit(1);
});
