/**
 * PHASE_10.21AH — apply ONLY 040 production private storage via Management API.
 * Requires SUPABASE_ACCESS_TOKEN in the shell (never logged).
 *
 *   node scripts/security/apply040ProductionPrivateStorageOnly.mjs
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
  'supabase/migrations/040_app_contract_private_storage_production.sql',
);
const OUT = path.join(ROOT, 'docs/reports/_phase1021ah_apply_result.json');
// Canonical LF file sha256 (supabase/migrations/040_…). Historical CRLF copy was
// 7e48c1699d0c4a6f7644d37ade598beee2a456448ce0a26809423c3d51751760 — SQL identical.
// Do not re-run this script to reconcile checksums.
const EXPECTED_SHA256 =
  '70667817ce3207ebc7d76852e25cc26014b80bb3d4f43925bcc0e77953814410';
const PROD_BUCKET = 'contracts-v2-private-production';

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

function assertOnly040(sql) {
  if (!sql.includes(PROD_BUCKET)) {
    throw new Error('REFUSING_APPLY: missing production bucket name');
  }
  const insertIdx = sql.toLowerCase().indexOf('insert into storage.buckets');
  if (insertIdx < 0) throw new Error('REFUSING_APPLY: missing bucket insert');
  const insertBlock = sql.slice(insertIdx, insertIdx + 900);
  if (insertBlock.includes('contracts-v2-private-local') || insertBlock.includes('contracts-v2-private-staging')) {
    throw new Error('REFUSING_APPLY: 040 must not insert local/staging bucket');
  }
  if (/using\s*\(\s*true\s*\)/i.test(sql) || /with check\s*\(\s*true\s*\)/i.test(sql)) {
    throw new Error('REFUSING_APPLY: open USING/WITH CHECK true');
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
    console.error(JSON.stringify({ ok: false, error: 'SUPABASE_ACCESS_TOKEN_MISSING_IN_THIS_SHELL' }));
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
  assertOnly040(sql);
  const sha = crypto.createHash('sha256').update(sql).digest('hex');
  if (sha !== EXPECTED_SHA256) {
    console.error(JSON.stringify({ ok: false, error: 'CHECKSUM_MISMATCH', expectedPrefix: EXPECTED_SHA256.slice(0, 12), actualPrefix: sha.slice(0, 12) }));
    process.exit(2);
  }

  const before = await managementSql(
    accessToken,
    `select exists(select 1 from storage.buckets where id = '${PROD_BUCKET}') as bucket_exists,
            exists(select 1 from supabase_migrations.schema_migrations where name ilike '%private_storage_production%' or name ilike '%040%') as m040`,
  );

  const apply = await managementSql(accessToken, sql);

  const after = await managementSql(
    accessToken,
    `select id, public, file_size_limit, allowed_mime_types
     from storage.buckets where id = '${PROD_BUCKET}';`,
  );

  const report = {
    phase: 'PHASE_10_21AH',
    projectRef: REF,
    method: 'management_api_database_query_single_sql_040',
    sha256: sha,
    before: before.body,
    applyOk: apply.ok,
    applyStatus: apply.status,
    applyError: apply.ok ? null : apply.body,
    afterBucket: after.body,
    appliedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: apply.ok,
    out: 'docs/reports/_phase1021ah_apply_result.json',
    sha256Prefix: sha.slice(0, 12),
    applyStatus: apply.status,
    errorHint: apply.ok ? null : JSON.stringify(apply.body).slice(0, 240),
  }));
  process.exit(apply.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message || err).slice(0, 200) }));
  process.exit(1);
});
