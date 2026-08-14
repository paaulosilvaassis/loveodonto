/**
 * PHASE_10.21AE — apply ONE Contracts V2 foundation migration to PRODUCTION.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=... node scripts/security/applyAeProductionMigrationOne.mjs 028
 *
 * Guards:
 *   - only allowed ids: 028,029,030,031,032,034,036
 *   - refuses 033/035
 *   - refuses db push
 *   - target fixed to uoepkwhqztmsjnzirpev
 *   - never prints token
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REF = 'uoepkwhqztmsjnzirpev';

const ALLOWED = {
  '028': {
    file: '028_app_contracts_v2_foundation.sql',
    name: 'app_contracts_v2_foundation',
    sha256: 'db0a515a6e89bae8b1b6b03e3edf2174d983ce48a09f2ce10c16cbf779cdbc91',
  },
  '029': {
    file: '029_app_contracts_v2_rls.sql',
    name: 'app_contracts_v2_rls',
    sha256: 'e02207797c2d275f31675b44ce80b5ab8acca72da188dfac10c378e0bfe5e41c',
  },
  '030': {
    file: '030_app_contract_ledger.sql',
    name: 'app_contract_ledger',
    sha256: 'ad2d20a2e79971a78798fd8f61be42f49ec106b92f824150091597671d0e7722',
  },
  '031': {
    file: '031_app_contract_number_sequences.sql',
    name: 'app_contract_number_sequences',
    sha256: '91107b00f12d313dc51901fa8b3d4364ab5f53908f4f988c99480b6d2b4f88b9',
  },
  '032': {
    file: '032_app_signature_sessions_and_challenges.sql',
    name: 'app_signature_sessions_and_challenges',
    sha256: 'faa509987ad2bf276d8f441209629aef1dee5d2434d770f9e8dbd85a7dee61ae',
  },
  '034': {
    file: '034_app_signature_delivery_attempts.sql',
    name: 'app_signature_delivery_attempts',
    sha256: '3c4dc98836cdc4148f73a9c59d6f3d76f5db1cf76f71e1807d659ac5b480b80c',
  },
  '036': {
    file: '036_app_package_manifest_foundation.sql',
    name: 'app_package_manifest_foundation',
    sha256: '026109d37d11315b1a2ffe814efeddb4fc2a0c362fa79dea1694beef60655226',
  },
};

const id = String(process.argv[2] || '').trim();
if (!ALLOWED[id]) {
  console.error(JSON.stringify({ ok: false, error: 'ID_NOT_ALLOWED', id, allowed: Object.keys(ALLOWED) }));
  process.exit(2);
}
if (id === '033' || id === '035') {
  console.error(JSON.stringify({ ok: false, error: 'SKIP_ONLY_ID' }));
  process.exit(2);
}

const meta = ALLOWED[id];
const abs = path.join(ROOT, 'supabase/migrations', meta.file);
const sql = fs.readFileSync(abs, 'utf8');
const sha = crypto.createHash('sha256').update(sql).digest('hex');
if (sha !== meta.sha256) {
  console.error(JSON.stringify({ ok: false, error: 'CHECKSUM_MISMATCH', expected: meta.sha256, actual: sha }));
  process.exit(2);
}
if (/033_app_contract_private_storage_local|035_app_contract_private_storage_staging|contracts-v2-private-staging|contracts-v2-private-local/.test(sql) && id !== '034') {
  // 034 may mention delivery; still block storage buckets from 033/035
}
if (id !== '036' && /create table[\s\S]*app_package_manifests/i.test(sql) && id !== '036') {
  /* noop */
}
if (/db push/i.test(sql)) {
  console.error(JSON.stringify({ ok: false, error: 'REFUSE_DB_PUSH_IN_SQL' }));
  process.exit(2);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error(JSON.stringify({ ok: false, error: 'SUPABASE_ACCESS_TOKEN_MISSING' }));
  process.exit(2);
}

const outDir = path.join(ROOT, 'docs/reports/_ae_apply');
fs.mkdirSync(outDir, { recursive: true });

async function managementSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 800) };
  }
  return { ok: res.ok, status: res.status, body };
}

const apply = await managementSql(sql);
const report = {
  phase: 'PHASE_10_21AE',
  projectRef: REF,
  migrationId: id,
  file: meta.file,
  name: meta.name,
  sha256: sha,
  method: 'management_api_database_query_single_sql',
  applyOk: apply.ok,
  applyStatus: apply.status,
  applyError: apply.ok ? null : apply.body,
  appliedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(outDir, `${id}_apply.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  ok: apply.ok,
  id,
  status: apply.status,
  out: `docs/reports/_ae_apply/${id}_apply.json`,
  errorHint: apply.ok ? null : JSON.stringify(apply.body).slice(0, 300),
}));
process.exit(apply.ok ? 0 : 1);
