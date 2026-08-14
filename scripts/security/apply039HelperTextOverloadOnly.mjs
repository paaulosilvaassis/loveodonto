/**
 * PHASE_10.21AF — apply ONLY 039 helper text overload via Management API.
 * Requires: SUPABASE_ACCESS_TOKEN in the shell (never logged).
 *
 *   node scripts/security/apply039HelperTextOverloadOnly.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REF = 'uoepkwhqztmsjnzirpev';
const MIGRATION = path.join(
  ROOT,
  'supabase/migrations/039_app_user_can_access_tenant_text_overload.sql',
);
const OUT = path.join(ROOT, 'docs/reports/_phase1021af_apply_result.json');

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

function assertOnly039(sql) {
  if (/028_app_contracts|029_app_contracts|036_app_package|create table|alter table/i.test(sql)) {
    throw new Error('REFUSING_APPLY: SQL contains foundation/table mutation content');
  }
  if (!/app_user_can_access_tenant\(row_tenant_id text\)/i.test(sql)) {
    throw new Error('REFUSING_APPLY: missing text overload definition');
  }
  if (/create or replace function public\.app_user_can_access_tenant\s*\(\s*row_tenant_id\s+uuid/i.test(sql)) {
    throw new Error('REFUSING_APPLY: must not redefine uuid overload');
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
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    console.error(JSON.stringify({
      ok: false,
      error: 'SUPABASE_ACCESS_TOKEN_MISSING_IN_THIS_SHELL',
    }));
    process.exit(2);
  }

  const dotenv = loadDotEnvLocal();
  const url = process.env.SUPABASE_URL || dotenv.SUPABASE_URL;
  if (url) {
    const host = new URL(url).host;
    if (!host.startsWith(REF)) {
      console.error(JSON.stringify({ ok: false, error: 'PROJECT_REF_MISMATCH', host }));
      process.exit(2);
    }
  }

  const sql = fs.readFileSync(MIGRATION, 'utf8');
  assertOnly039(sql);
  const sha = crypto.createHash('sha256').update(sql).digest('hex');

  const before = await managementSql(
    accessToken,
    `select pg_get_function_identity_arguments(p.oid) as args
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='app_user_can_access_tenant'
     order by 1`,
  );

  const apply = await managementSql(accessToken, sql);

  const after = await managementSql(
    accessToken,
    `select pg_get_function_identity_arguments(p.oid) as args
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='app_user_can_access_tenant'
     order by 1`,
  );

  const probes = await managementSql(
    accessToken,
    `select
       public.app_user_can_access_tenant(null::text) as null_text,
       public.app_user_can_access_tenant(''::text) as empty_text,
       public.app_user_can_access_tenant('not-a-uuid'::text) as invalid_text,
       public.app_user_can_access_tenant('b721c2c9-d924-41ee-8911-dc00c8208326'::text) as valid_text_unauth,
       public.app_user_can_access_tenant('b721c2c9-d924-41ee-8911-dc00c8208326'::uuid) as valid_uuid_unauth,
       to_regprocedure('public.app_user_can_access_tenant(text)') is not null as text_overload_exists,
       to_regprocedure('public.app_user_can_access_tenant(uuid)') is not null as uuid_overload_exists`,
  );

  const report = {
    phase: 'PHASE_10_21AF',
    projectRef: REF,
    method: 'management_api_database_query_single_sql_039',
    sha256: sha,
    beforeArgs: before.body,
    applyOk: apply.ok,
    applyStatus: apply.status,
    applyBodySanitized: apply.ok ? 'ok' : apply.body,
    afterArgs: after.body,
    probes: probes.body,
    foundationMigrationsApplied: false,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: apply.ok && Array.isArray(after.body) && after.body.some((r) => r.args === 'row_tenant_id text'),
    out: OUT,
    sha256Prefix: sha.slice(0, 12),
  }));
  if (!apply.ok) process.exit(1);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message || err).slice(0, 200) }));
  process.exit(1);
});
