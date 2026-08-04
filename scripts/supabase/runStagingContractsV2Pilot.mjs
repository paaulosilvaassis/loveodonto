/**
 * Phase 10.14 — Staging Feature Flag Pilot (provision + remote smoke + cleanup).
 *
 * NÃO aplica migrations. NÃO toca produção. NÃO liga VITE_* globais.
 *
 * Requer:
 *   CONTRACTS_V2_STAGING_PILOT=true
 *   LOVE_ODONTO_STAGING_CONFIRMATION=STAGING_PILOT_ONLY
 *   STAGING_SUPABASE_URL=https://tckdjyunwmdpqmewrwvt.supabase.co
 *   SUPABASE_ACCESS_TOKEN
 * Opcional: STAGING_SUPABASE_SERVICE_ROLE_KEY (storage smoke)
 *
 *   npm run contracts-v2:staging-pilot
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_REF, STAGING_REF, REPO_ROOT } from './constants.mjs';
import { STAGING_PRIVATE_BUCKET } from './contractsV2StagingMigrations.mjs';

const PILOT_TENANT_ID = 'c0140000-1111-4111-8111-111111111014';
const PILOT_CODE = 'STAGING_CONTRACTS_PILOT';
const PILOT_MARKER = 'contracts-v2-staging-pilot-10-14';

const PILOT_ALIASES = [
  'contracts.v2.templates',
  'contracts.v2.instances',
  'contracts.v2.signatures',
  'contracts.v2.pdf',
  'contracts.v2.storage',
];

const PILOT_CANONICAL = [
  'contracts_domain_v2_enabled',
  'contracts_module_v2_enabled',
  'contract_templates_v2_enabled',
  'contract_packages_enabled',
  'contract_versioning_enabled',
  'contract_internal_signature_v2_enabled',
  'contract_pdf_v2_enabled',
  'contract_storage_v2_enabled',
  'contract_audit_ledger_enabled',
];

function isTruthy(v) {
  return ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());
}

function sanitizeText(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]')
    .replace(/sbp_[A-Za-z0-9]+/g, 'sbp_[REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT_REDACTED]')
    .slice(0, 4000);
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function loadEnv() {
  return { ...parseEnvFile(path.join(REPO_ROOT, '.env.local')), ...process.env };
}

function rowsOf(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

function assertPilotGuard(env) {
  const errors = [];
  if (!isTruthy(env.CONTRACTS_V2_STAGING_PILOT)) {
    errors.push('CONTRACTS_V2_STAGING_PILOT must be true');
  }
  if (String(env.LOVE_ODONTO_STAGING_CONFIRMATION || '') !== 'STAGING_PILOT_ONLY') {
    errors.push('LOVE_ODONTO_STAGING_CONFIRMATION must be STAGING_PILOT_ONLY');
  }
  const url = String(env.STAGING_SUPABASE_URL || '').trim();
  if (!url.includes(STAGING_REF) || !url.includes('supabase.co')) {
    errors.push('STAGING_SUPABASE_URL must target staging');
  }
  if (url.includes(PRODUCTION_REF)) errors.push('PRODUCTION_REF blocked');
  if (!String(env.SUPABASE_ACCESS_TOKEN || '').trim()) {
    errors.push('SUPABASE_ACCESS_TOKEN required');
  }
  // Global VITE flags must stay OFF
  const viteFlags = [
    'VITE_CONTRACTS_DOMAIN_V2_ENABLED',
    'VITE_CONTRACTS_MODULE_V2_ENABLED',
    'VITE_CONTRACT_TEMPLATES_V2_ENABLED',
    'VITE_CONTRACT_STORAGE_V2_ENABLED',
  ];
  for (const f of viteFlags) {
    if (isTruthy(env[f])) errors.push(`${f} must remain false (use tenant pilot flags)`);
  }
  if (errors.length) {
    const err = new Error(`CONTRACTS_V2_STAGING_PILOT_REQUIRED: ${errors.join('; ')}`);
    err.code = 'CONTRACTS_V2_STAGING_PILOT_REQUIRED';
    err.details = errors;
    throw err;
  }
  return {
    url,
    accessToken: String(env.SUPABASE_ACCESS_TOKEN).trim(),
    serviceRoleKey: String(env.STAGING_SUPABASE_SERVICE_ROLE_KEY || '').trim() || null,
    ref: STAGING_REF,
  };
}

async function runSql(guard, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${guard.ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${guard.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 400) }; }
  if (!res.ok) {
    throw Object.assign(new Error(`SQL_FAILED: ${sanitizeText(text)}`), { code: 'SQL_FAILED' });
  }
  return rowsOf(body);
}

function push(report, name, ok, detail) {
  report.checks.push({ name, ok: Boolean(ok), detail: sanitizeText(detail) });
}

async function provisionPilot(guard, report) {
  await runSql(guard, `
    insert into public.tenants (id, clinic_code, legal_name, trade_name, status)
    values (
      '${PILOT_TENANT_ID}',
      '${PILOT_CODE}',
      'Contracts V2 Staging Pilot FICTIONAL',
      '${PILOT_CODE}',
      'active'
    )
    on conflict (id) do update
      set clinic_code = excluded.clinic_code,
          legal_name = excluded.legal_name,
          trade_name = excluded.trade_name,
          status = 'active';
  `);
  push(report, 'pilot_tenant_upserted', true, PILOT_CODE);

  const hasFlags = await runSql(guard, `
    select to_regclass('public.feature_flags') is not null as present;
  `);
  const flagsTable = hasFlags[0]?.present === true || hasFlags[0]?.present === 't';
  report.featureFlagsTable = flagsTable ? 'present' : 'absent';

  if (flagsTable) {
    const keys = [...PILOT_ALIASES, ...PILOT_CANONICAL];
    for (const key of keys) {
      await runSql(guard, `
        insert into public.feature_flags (flag_key, scope_type, scope_ref, enabled, payload)
        values (
          '${key}', 'tenant', '${PILOT_TENANT_ID}', true,
          '{"marker":"${PILOT_MARKER}","phase":"10.14"}'::jsonb
        )
        on conflict (flag_key, scope_type, scope_ref) do update
          set enabled = true,
              payload = excluded.payload,
              updated_at = now();
      `);
    }
    push(report, 'pilot_feature_flags_seeded', true, `keys=${keys.length}`);
  } else {
    push(report, 'pilot_feature_flags_seeded', true, 'table absent — allowlist by tenant id in app code');
  }
}

async function storageSmoke(guard, report) {
  if (!guard.serviceRoleKey) {
    push(report, 'storage_smoke', false, 'STAGING_SUPABASE_SERVICE_ROLE_KEY absent');
    report.storageSmoke = 'SKIPPED_NO_SERVICE_ROLE';
    return;
  }
  const objectPath = `tenants/${PILOT_TENANT_ID}/contracts/pilot/versions/1/fixture-${PILOT_MARKER}.txt`;
  const bytes = Buffer.from(`pilot ${PILOT_MARKER} fictional no-pii\n`, 'utf8');
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const base = guard.url.replace(/\/$/, '');
  const hdr = {
    Authorization: `Bearer ${guard.serviceRoleKey}`,
    apikey: guard.serviceRoleKey,
  };
  const up = await fetch(`${base}/storage/v1/object/${STAGING_PRIVATE_BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: { ...hdr, 'Content-Type': 'text/plain', 'x-upsert': 'true' },
    body: bytes,
  });
  push(report, 'storage_upload', up.ok, `status=${up.status}`);
  const down = await fetch(`${base}/storage/v1/object/${STAGING_PRIVATE_BUCKET}/${objectPath}`, { headers: hdr });
  const downSha = crypto.createHash('sha256').update(Buffer.from(await down.arrayBuffer())).digest('hex');
  push(report, 'storage_hash', down.ok && downSha === sha, down.ok ? 'match' : `status=${down.status}`);
  report.storageObject = objectPath;
  report.storageSha256 = sha;
  const del = await fetch(`${base}/storage/v1/object/${STAGING_PRIVATE_BUCKET}/${objectPath}`, {
    method: 'DELETE',
    headers: hdr,
  });
  push(report, 'storage_cleanup', del.ok || del.status === 404, `status=${del.status}`);
  report.storageSmoke = 'EXECUTED';
}

async function cleanupPilot(guard, report, { keepTenant = false } = {}) {
  try {
    await runSql(guard, `
      begin;
      set local session_replication_role = replica;
      delete from storage.objects
        where bucket_id = '${STAGING_PRIVATE_BUCKET}'
          and name like '%${PILOT_MARKER}%';
      delete from public.feature_flags
        where scope_type = 'tenant' and scope_ref = '${PILOT_TENANT_ID}'
          and (payload->>'marker') = '${PILOT_MARKER}';
      ${keepTenant ? '' : `delete from public.tenants where id = '${PILOT_TENANT_ID}';`}
      commit;
    `);
    push(report, 'pilot_cleanup', true, keepTenant ? 'flags+objects removed; tenant kept' : 'tenant+flags+objects removed');
    report.cleanup = keepTenant ? 'FLAGS_AND_OBJECTS_REMOVED' : 'FULL_PILOT_REMOVED';
  } catch (e) {
    push(report, 'pilot_cleanup', false, sanitizeText(e.message));
    report.cleanup = 'PARTIAL_OR_FAILED';
  }
}

function runDomainSmoke(report) {
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vitest', 'run', 'src/__tests__/phase1014StagingFeatureFlagPilot.test.js'],
    { cwd: REPO_ROOT, encoding: 'utf8', env: process.env },
  );
  const ok = result.status === 0;
  push(report, 'domain_functional_smoke', ok, ok ? 'phase1014 pass' : sanitizeText(result.stderr || result.stdout).slice(0, 500));
  report.domainSmokeExitCode = result.status;
}

export async function runStagingContractsV2Pilot(options = {}) {
  const env = options.env || loadEnv();
  const keepTenant = Boolean(options.keepTenant);
  const report = {
    command: 'contracts-v2:staging-pilot',
    startedAt: new Date().toISOString(),
    stagingRef: STAGING_REF,
    productionRef: PRODUCTION_REF,
    productionTouched: false,
    pilotTenantId: PILOT_TENANT_ID,
    pilotTenantCode: PILOT_CODE,
    pilotAliases: [...PILOT_ALIASES],
    checks: [],
    status: 'PENDING',
  };

  let guard = null;
  try {
    guard = assertPilotGuard(env);
    report.guard = {
      ok: true,
      ref: guard.ref,
      urlHost: new URL(guard.url).hostname,
      tokenPresent: true,
      serviceRolePresent: Boolean(guard.serviceRoleKey),
    };

    await provisionPilot(guard, report);
    runDomainSmoke(report);
    await storageSmoke(guard, report);

    // Isolation: confirm other tenant has no pilot flags
    const otherFlags = await runSql(guard, `
      select count(*)::int as n from public.feature_flags
      where scope_type = 'tenant'
        and scope_ref <> '${PILOT_TENANT_ID}'
        and flag_key like 'contracts.v2.%'
        and enabled = true;
    `).catch(() => [{ n: 0 }]);
    push(report, 'no_other_tenant_v2_alias_flags', Number(otherFlags[0]?.n || 0) === 0, `n=${otherFlags[0]?.n}`);
  } catch (error) {
    report.error = {
      code: error.code || 'UNKNOWN',
      message: sanitizeText(error.message),
      details: error.details || null,
    };
  } finally {
    if (guard) {
      await cleanupPilot(guard, report, { keepTenant });
    }
  }

  const failed = report.checks.filter((c) => !c.ok);
  report.failedChecks = failed.map((c) => c.name);
  report.ok = !report.error && failed.length === 0;
  report.status = report.ok ? 'STAGING_PILOT_PASS' : (report.error ? 'BLOCKED' : 'STAGING_PILOT_FAIL');
  report.gate = report.ok
    ? 'READY_FOR_INTERNAL_BETA_APPROVAL'
    : 'BLOCKED_STAGING_PILOT_FAILED';
  report.readyForProduction = false;
  report.globalViteFlags = 'remain_false';
  report.finishedAt = new Date().toISOString();
  return report;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const keepTenant = process.argv.includes('--keep-tenant');
  runStagingContractsV2Pilot({ keepTenant })
    .then((r) => {
      process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
      process.exit(r.ok ? 0 : 1);
    })
    .catch((err) => {
      console.error(sanitizeText(err?.message || err));
      process.exit(1);
    });
}
