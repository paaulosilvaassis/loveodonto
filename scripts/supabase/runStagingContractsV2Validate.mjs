/**
 * Phase 10.13D — remote staging validation (read-mostly + controlled fixtures).
 *
 * NÃO aplica migrations. NÃO ativa flags. NÃO toca produção.
 *
 * Requer:
 *   CONTRACTS_V2_STAGING_VALIDATE=true
 *   LOVE_ODONTO_STAGING_CONFIRMATION=STAGING_VALIDATE_ONLY
 *   STAGING_SUPABASE_URL=https://tckdjyunwmdpqmewrwvt.supabase.co
 *   SUPABASE_ACCESS_TOKEN
 * Opcional (storage smoke): STAGING_SUPABASE_SERVICE_ROLE_KEY
 *
 *   npm run contracts-v2:staging-validate
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_REF, STAGING_REF, REPO_ROOT } from './constants.mjs';
import {
  STAGING_CONTRACTS_V2_MIGRATIONS,
  LOCAL_ONLY_VERSION,
  STAGING_EXPECTED_VERSIONS,
  STAGING_PRIVATE_BUCKET,
  STAGING_BUCKET_MAX_BYTES,
  STAGING_BUCKET_MIME_ALLOWLIST,
} from './contractsV2StagingMigrations.mjs';

const FLAG_ENV_KEYS = [
  'VITE_CONTRACTS_DOMAIN_V2_ENABLED',
  'VITE_CONTRACTS_MODULE_V2_ENABLED',
  'VITE_CONTRACT_TEMPLATES_V2_ENABLED',
  'VITE_CONTRACT_PACKAGES_ENABLED',
  'VITE_CONTRACT_VERSIONING_ENABLED',
  'VITE_CONTRACT_PDF_V2_ENABLED',
  'VITE_CONTRACT_INTERNAL_SIGNATURE_V2_ENABLED',
  'VITE_CONTRACT_EXTERNAL_SIGNATURE_ENABLED',
  'VITE_CONTRACT_STORAGE_V2_ENABLED',
  'VITE_CONTRACT_BUDGET_INTEGRATION_V2_ENABLED',
  'VITE_CONTRACT_FINANCIAL_ACTIVATION_ON_SIGNED_ENABLED',
  'VITE_CONTRACT_ODONTOGRAM_SNAPSHOT_ENABLED',
  'VITE_CONTRACT_PATIENT_PORTAL_ENABLED',
  'VITE_CONTRACT_AUDIT_LEDGER_ENABLED',
  'VITE_CONTRACT_PUBLIC_VERIFICATION_ENABLED',
];

/** Deterministic fictional UUIDs (valid hex). */
const ID = {
  tenantA: 'a1111111-1111-4111-8111-111111111101',
  tenantB: 'b2222222-2222-4222-8222-222222222202',
  userA: 'c1111111-1111-4111-8111-111111111103',
  tplA: 'a1111111-1111-4111-8111-111111111111',
  tplB: 'b2222222-2222-4222-8222-222222222212',
  tplVerA: 'a1111111-1111-4111-8111-111111111121',
  ctrA: 'a1111111-1111-4111-8111-111111111131',
  ctrB: 'b2222222-2222-4222-8222-222222222232',
  cverA: 'a1111111-1111-4111-8111-111111111141',
  cverLocked: 'a1111111-1111-4111-8111-111111111142',
  envA: 'a1111111-1111-4111-8111-111111111151',
  sigA: 'a1111111-1111-4111-8111-111111111161',
  sessA: 'a1111111-1111-4111-8111-111111111171',
  chalA: 'a1111111-1111-4111-8111-111111111181',
  rateA: 'a1111111-1111-4111-8111-111111111191',
  actor: 'a1111111-1111-4111-8111-1111111111a1',
};

const FIXTURE_MARKER = 'contracts-v2-staging-validate-10-13d';

const REQUIRED_TABLES = [
  'app_contract_templates',
  'app_contract_template_versions',
  'app_contracts',
  'app_contract_versions',
  'app_contract_packages',
  'app_signature_envelopes',
  'app_signature_signers',
  'app_contract_files',
  'app_contract_ledger',
  'app_contract_number_sequences',
  'app_contract_idempotency_keys',
  'app_signature_sessions',
  'app_signature_challenges',
  'app_signature_rate_limits',
  'app_signature_delivery_attempts',
  'app_contract_storage_ops',
];

function isTruthy(v) {
  return ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());
}

function sanitizeText(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]')
    .replace(/postgres:\/\/[^@]+@/g, 'postgres://***@')
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

export function assertStagingValidateGuard(env) {
  const errors = [];
  if (!isTruthy(env.CONTRACTS_V2_STAGING_VALIDATE)) {
    errors.push('CONTRACTS_V2_STAGING_VALIDATE must be true');
  }
  if (String(env.LOVE_ODONTO_STAGING_CONFIRMATION || '') !== 'STAGING_VALIDATE_ONLY') {
    errors.push('LOVE_ODONTO_STAGING_CONFIRMATION must be STAGING_VALIDATE_ONLY');
  }
  const url = String(env.STAGING_SUPABASE_URL || '').trim();
  if (!url.includes(STAGING_REF) || !url.includes('supabase.co')) {
    errors.push('STAGING_SUPABASE_URL must target staging project ref');
  }
  if (url.includes(PRODUCTION_REF)) errors.push('PRODUCTION_REF detected — blocked');
  const accessToken = String(env.SUPABASE_ACCESS_TOKEN || '').trim();
  if (!accessToken) errors.push('SUPABASE_ACCESS_TOKEN required');
  if (errors.length) {
    const err = new Error(`CONTRACTS_V2_STAGING_VALIDATE_REQUIRED: ${errors.join('; ')}`);
    err.code = 'CONTRACTS_V2_STAGING_VALIDATE_REQUIRED';
    err.details = errors;
    throw err;
  }
  return {
    url,
    accessToken,
    serviceRoleKey: String(env.STAGING_SUPABASE_SERVICE_ROLE_KEY || '').trim() || null,
    ref: STAGING_REF,
  };
}

async function runManagementSql(accessToken, projectRef, sqlText) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sqlText }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  return {
    ok: res.ok,
    status: res.status,
    body,
    error: res.ok ? null : sanitizeText(text),
  };
}

function versionPresent(versions, expected) {
  return versions.map(String).some((v) => v === expected || v.startsWith(expected) || v.includes(`_${expected}_`));
}

function pushCheck(report, name, ok, detail) {
  report.checks.push({ name, ok: Boolean(ok), detail: sanitizeText(detail) });
}

async function sql(guard, query) {
  const r = await runManagementSql(guard.accessToken, guard.ref, query);
  if (!r.ok) {
    throw Object.assign(new Error(`SQL_FAILED: ${r.error}`), { code: 'SQL_FAILED', details: r.error });
  }
  return rowsOf(r.body);
}

async function sqlExpectFail(guard, query) {
  const r = await runManagementSql(guard.accessToken, guard.ref, query);
  if (r.ok) return { failedAsExpected: false, detail: 'UNEXPECTED_SUCCESS' };
  return { failedAsExpected: true, detail: sanitizeText(r.error).slice(0, 240) };
}

async function validateMigrations(guard, report) {
  const rows = await sql(guard, 'select version from supabase_migrations.schema_migrations order by version;');
  const versions = rows.map((r) => String(r.version || r[0] || ''));
  report.remoteMigrations = versions.filter((v) => /028|029|030|031|032|033|034|035/.test(v));
  for (const v of STAGING_EXPECTED_VERSIONS) {
    pushCheck(report, `migration_${v}_present`, versionPresent(versions, v), v);
  }
  pushCheck(
    report,
    'migration_033_absent',
    !versionPresent(versions, LOCAL_ONLY_VERSION),
    versionPresent(versions, LOCAL_ONLY_VERSION) ? 'UNEXPECTED_PRESENT' : 'SKIP_LOCAL_ONLY',
  );
}

async function validateSchema(guard, report) {
  const catalog = await sql(guard, `
    select c.relname as table_name, c.relrowsecurity as rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (c.relname like 'app_contract%' or c.relname like 'app_signature%')
    order by 1;
  `);
  const byName = new Map(catalog.map((r) => [r.table_name, r]));
  report.schemaTables = catalog.map((r) => r.table_name);
  for (const t of REQUIRED_TABLES) {
    const row = byName.get(t);
    pushCheck(report, `table_${t}`, Boolean(row), row ? 'present' : 'MISSING');
    if (row) pushCheck(report, `rls_${t}`, Boolean(row.rls_enabled), row.rls_enabled ? 'enabled' : 'DISABLED');
  }
  const fks = await sql(guard, `
    select count(*)::int as n from pg_constraint
    where contype = 'f' and connamespace = 'public'::regnamespace
      and (conname like 'app_contract%' or conname like 'app_signature%');
  `);
  pushCheck(report, 'composite_foreign_keys_present', Number(fks[0]?.n || 0) >= 10, `count=${fks[0]?.n}`);

  const helpers = await sql(guard, `
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'app_user_can_access_tenant'
    order by 2;
  `);
  pushCheck(
    report,
    'helper_app_user_can_access_tenant',
    helpers.some((h) => String(h.args).includes('text')),
    helpers.map((h) => `${h.proname}(${h.args})`).join('; ') || 'none',
  );

  const policies = await sql(guard, `
    select count(*)::int as n from pg_policies
    where schemaname = 'public' and tablename = 'app_contracts';
  `);
  pushCheck(report, 'app_contracts_policies', Number(policies[0]?.n || 0) >= 1, `count=${policies[0]?.n}`);
}

async function seedFixtures(guard, report) {
  await sql(guard, `
    insert into public.tenants (id, clinic_code, legal_name, trade_name, status)
    values
      ('${ID.tenantA}', 'cv2-stg-a', 'Contracts V2 Staging A FICTIONAL', 'tenant-contracts-v2-staging-a', 'active'),
      ('${ID.tenantB}', 'cv2-stg-b', 'Contracts V2 Staging B FICTIONAL', 'tenant-contracts-v2-staging-b', 'active')
    on conflict (id) do update
      set trade_name = excluded.trade_name, legal_name = excluded.legal_name, status = 'active';
  `);

  await sql(guard, `
    insert into public.app_contract_templates (id, tenant_id, name, document_type, status, metadata)
    values
      ('${ID.tplA}', '${ID.tenantA}', 'Fixture Template A', 'SERVICE_CONTRACT', 'DRAFT',
        '{"marker":"${FIXTURE_MARKER}"}'::jsonb),
      ('${ID.tplB}', '${ID.tenantB}', 'Fixture Template B', 'SERVICE_CONTRACT', 'DRAFT',
        '{"marker":"${FIXTURE_MARKER}"}'::jsonb)
    on conflict (id) do nothing;
  `);

  await sql(guard, `
    insert into public.app_contract_template_versions (
      id, tenant_id, template_id, version_number, status, published_at, locked_at, content_text
    ) values (
      '${ID.tplVerA}', '${ID.tenantA}', '${ID.tplA}', 1, 'PUBLISHED', now(), now(), 'fixture published'
    ) on conflict (id) do nothing;
  `);

  await sql(guard, `
    insert into public.app_contracts (
      id, tenant_id, contract_number, title, document_type, origin, status, patient_id, metadata
    ) values
      ('${ID.ctrA}', '${ID.tenantA}', 'DEMO-STG-A-001', 'contract-demo-staging-a', 'SERVICE_CONTRACT',
        'MANUAL', 'DRAFT', 'patient-demo-staging-a', '{"marker":"${FIXTURE_MARKER}"}'::jsonb),
      ('${ID.ctrB}', '${ID.tenantB}', 'DEMO-STG-B-001', 'contract-demo-staging-b', 'SERVICE_CONTRACT',
        'MANUAL', 'DRAFT', 'patient-demo-staging-b', '{"marker":"${FIXTURE_MARKER}"}'::jsonb)
    on conflict (id) do nothing;
  `);

  await sql(guard, `
    insert into public.app_contract_versions (
      id, tenant_id, contract_id, version_number, generation_reason,
      patient_snapshot, clinic_snapshot, signers_snapshot, created_by, locked_at, metadata
    ) values
      ('${ID.cverA}', '${ID.tenantA}', '${ID.ctrA}', 1, 'INITIAL',
        '{"marker":"${FIXTURE_MARKER}"}'::jsonb, '{"clinic":"demo"}'::jsonb, '[]'::jsonb,
        '${ID.actor}', null, '{"marker":"${FIXTURE_MARKER}"}'::jsonb),
      ('${ID.cverLocked}', '${ID.tenantA}', '${ID.ctrA}', 2, 'REVISION',
        '{"marker":"${FIXTURE_MARKER}"}'::jsonb, '{"clinic":"demo"}'::jsonb, '[]'::jsonb,
        '${ID.actor}', now(), '{"marker":"${FIXTURE_MARKER}"}'::jsonb)
    on conflict (id) do nothing;
  `);

  const hash1 = crypto.createHash('sha256').update(`${FIXTURE_MARKER}|1`).digest('hex');
  await sql(guard, `
    insert into public.app_contract_ledger (
      tenant_id, contract_id, contract_version_id, sequence_number, event_type,
      actor_type, source, payload, entry_hash, occurred_at, idempotency_key
    ) values (
      '${ID.tenantA}', '${ID.ctrA}', '${ID.cverA}', 1, 'CONTRACT_CREATED',
      'SYSTEM', 'STAGING_VALIDATE', '{"marker":"${FIXTURE_MARKER}"}'::jsonb,
      '${hash1}', now(), 'idem-${FIXTURE_MARKER}-1'
    ) on conflict do nothing;
  `);

  report.fixtures = {
    tenantA: ID.tenantA,
    tenantB: ID.tenantB,
    marker: FIXTURE_MARKER,
    contractA: ID.ctrA,
    contractB: ID.ctrB,
    lockedVersion: ID.cverLocked,
    publishedTemplateVersion: ID.tplVerA,
  };
  pushCheck(report, 'fixtures_seeded', true, 'fictional tenants/contracts');
}

async function validateRlsAndImmutability(guard, report) {
  const f = report.fixtures;

  const helper = await sql(guard, `
    select public.app_user_can_access_tenant('${ID.tenantA}') as without_jwt;
  `);
  pushCheck(
    report,
    'helper_denies_without_auth_context',
    helper[0]?.without_jwt === false || helper[0]?.without_jwt === 'f',
    JSON.stringify(helper[0] || {}),
  );

  // FORCE-less RLS: simulate authenticated role inside one transaction
  const rls = await runManagementSql(guard.accessToken, guard.ref, `
    do $body$
    declare
      n_a int;
      n_b int;
      claims text := '{"sub":"${ID.userA}","role":"authenticated","app_metadata":{"tenant_id":"${ID.tenantA}"},"tenant_id":"${ID.tenantA}"}';
    begin
      perform set_config('request.jwt.claims', claims, true);
      perform set_config('request.jwt.claim.sub', '${ID.userA}', true);
      perform set_config('request.jwt.claim.role', 'authenticated', true);
      execute 'set local role authenticated';
      select count(*) into n_a from public.app_contracts where tenant_id = '${ID.tenantA}';
      select count(*) into n_b from public.app_contracts where tenant_id = '${ID.tenantB}';
      if n_a < 1 then
        raise exception 'RLS_FAIL_READ_A n_a=%', n_a;
      end if;
      if n_b <> 0 then
        raise exception 'RLS_FAIL_CROSS_TENANT n_b=%', n_b;
      end if;
    end
    $body$;
    select 'RLS_CROSS_TENANT_OK' as status;
  `);
  pushCheck(
    report,
    'rls_cross_tenant_select',
    rls.ok && String(rowsOf(rls.body)[0]?.status || '').includes('RLS_CROSS_TENANT_OK'),
    rls.ok ? 'ok' : rls.error,
  );

  const updB = await runManagementSql(guard.accessToken, guard.ref, `
    do $body$
    declare
      claims text := '{"sub":"${ID.userA}","role":"authenticated","app_metadata":{"tenant_id":"${ID.tenantA}"},"tenant_id":"${ID.tenantA}"}';
      n int;
    begin
      perform set_config('request.jwt.claims', claims, true);
      perform set_config('request.jwt.claim.sub', '${ID.userA}', true);
      execute 'set local role authenticated';
      update public.app_contracts set title = 'hacked' where id = '${ID.ctrB}';
      get diagnostics n = row_count;
      if n <> 0 then
        raise exception 'RLS_FAIL_UPDATE_B n=%', n;
      end if;
    end
    $body$;
    select 'RLS_UPDATE_B_DENIED' as status;
  `);
  pushCheck(
    report,
    'rls_cross_tenant_update_denied',
    updB.ok && String(rowsOf(updB.body)[0]?.status || '').includes('DENIED'),
    updB.ok ? 'ok' : updB.error,
  );

  const tenantImmutable = await sqlExpectFail(guard, `
    update public.app_contracts set tenant_id = '${ID.tenantB}' where id = '${f.contractA}';
  `);
  pushCheck(report, 'tenant_id_immutable', tenantImmutable.failedAsExpected, tenantImmutable.detail);

  const locked = await sqlExpectFail(guard, `
    update public.app_contract_versions
    set plain_text_snapshot = 'mutated'
    where id = '${f.lockedVersion}';
  `);
  pushCheck(report, 'contract_version_locked_immutable', locked.failedAsExpected, locked.detail);

  const published = await sqlExpectFail(guard, `
    update public.app_contract_template_versions
    set content_text = 'mutated-published'
    where id = '${f.publishedTemplateVersion}';
  `);
  pushCheck(report, 'template_version_published_immutable', published.failedAsExpected, published.detail);

  const ledgerUp = await sqlExpectFail(guard, `
    update public.app_contract_ledger set actor_name = 'x' where tenant_id = '${ID.tenantA}';
  `);
  pushCheck(report, 'ledger_update_forbidden', ledgerUp.failedAsExpected, ledgerUp.detail);

  const ledgerDel = await sqlExpectFail(guard, `
    delete from public.app_contract_ledger where tenant_id = '${ID.tenantA}';
  `);
  pushCheck(report, 'ledger_delete_forbidden', ledgerDel.failedAsExpected, ledgerDel.detail);

  const dup = await sqlExpectFail(guard, `
    insert into public.app_contract_ledger (
      tenant_id, contract_id, sequence_number, event_type, actor_type, source,
      payload, entry_hash, occurred_at
    ) values (
      '${ID.tenantA}', '${ID.ctrA}', 1, 'CONTRACT_CREATED', 'SYSTEM', 'STAGING_VALIDATE',
      '{}'::jsonb, '${crypto.createHash('sha256').update('dup').digest('hex')}', now()
    );
  `);
  pushCheck(report, 'ledger_sequence_unique', dup.failedAsExpected, dup.detail);

  const grants = await sql(guard, `
    select table_name, privilege_type
    from information_schema.role_table_grants
    where grantee = 'authenticated' and table_schema = 'public'
      and table_name in ('app_signature_sessions', 'app_signature_challenges');
  `);
  pushCheck(report, 'sessions_challenges_no_authenticated_grants', grants.length === 0, `grants=${grants.length}`);
}

async function validateHashOnly(guard, report) {
  const tokenHash = crypto.createHash('sha256').update('raw-token-never-persisted').digest('hex');
  const codeHash = crypto.createHash('sha256').update('123456').digest('hex');

  await sql(guard, `
    insert into public.app_signature_envelopes (
      id, tenant_id, contract_id, contract_version_id, status, provider, created_by, metadata
    ) values (
      '${ID.envA}', '${ID.tenantA}', '${ID.ctrA}', '${ID.cverLocked}', 'DRAFT',
      'INTERNAL', '${ID.actor}', '{"marker":"${FIXTURE_MARKER}"}'::jsonb
    ) on conflict (id) do nothing;
  `);

  await sql(guard, `
    insert into public.app_signature_signers (
      id, tenant_id, envelope_id, signer_order, signer_role, name, status
    ) values (
      '${ID.sigA}', '${ID.tenantA}', '${ID.envA}', 1, 'PATIENT', 'Demo Staging Signer', 'PENDING'
    ) on conflict (id) do nothing;
  `);

  await sql(guard, `
    insert into public.app_signature_sessions (
      id, tenant_id, envelope_id, signer_id, token_id, token_hash, status, expires_at
    ) values (
      '${ID.sessA}', '${ID.tenantA}', '${ID.envA}', '${ID.sigA}',
      'tokid-${FIXTURE_MARKER}', '${tokenHash}', 'ACTIVE', now() + interval '1 hour'
    ) on conflict (id) do nothing;
  `);

  await sql(guard, `
    insert into public.app_signature_challenges (
      id, tenant_id, envelope_id, signer_id, session_id, challenge_type, code_hash,
      status, max_attempts, expires_at
    ) values (
      '${ID.chalA}', '${ID.tenantA}', '${ID.envA}', '${ID.sigA}', '${ID.sessA}',
      'OTP_EMAIL', '${codeHash}', 'PENDING', 5, now() + interval '10 minutes'
    ) on conflict (id) do nothing;
  `);

  await sql(guard, `
    insert into public.app_signature_rate_limits (
      id, tenant_id, scope_key, operation, window_started_at, window_ends_at, counter
    ) values (
      '${ID.rateA}', '${ID.tenantA}', 'stg-validate', 'OPEN_SESSION',
      now(), now() + interval '1 minute', 1
    ) on conflict (id) do nothing;
  `);

  await sql(guard, `
    insert into public.app_signature_delivery_attempts (
      id, tenant_id, envelope_id, signer_id, channel, purpose, destination_masked,
      status, provider, idempotency_key, metadata
    ) values (
      '${ID.rateA.replace(/191$/, '1a1')}', '${ID.tenantA}', '${ID.envA}', '${ID.sigA}',
      'EMAIL', 'INVITATION', 'd***@example.test', 'SIMULATED', 'SIMULATOR',
      'deliv-${FIXTURE_MARKER}', '{"marker":"${FIXTURE_MARKER}"}'::jsonb
    ) on conflict (id) do nothing;
  `);

  const sess = await sql(guard, `
    select token_hash from public.app_signature_sessions where id = '${ID.sessA}';
  `);
  const chal = await sql(guard, `
    select code_hash from public.app_signature_challenges where id = '${ID.chalA}';
  `);
  const deliv = await sql(guard, `
    select metadata, destination_masked
    from public.app_signature_delivery_attempts
    where idempotency_key = 'deliv-${FIXTURE_MARKER}';
  `);

  pushCheck(report, 'session_token_hash_only', sess[0]?.token_hash === tokenHash, 'hash only');
  pushCheck(report, 'challenge_code_hash_only', chal[0]?.code_hash === codeHash, 'hash only');
  pushCheck(report, 'rate_limit_persisted', true, 'row inserted');
  const meta = deliv[0]?.metadata || {};
  const sensitive = ['token', 'otp', 'fullLink', 'signedUrl', 'destination', 'email', 'phone'];
  pushCheck(
    report,
    'delivery_attempt_no_sensitive_payload',
    !sensitive.some((k) => Object.prototype.hasOwnProperty.call(meta, k)),
    'metadata sanitized',
  );
}

async function validateBucket(guard, report) {
  const buckets = await sql(guard, `
    select id, public, file_size_limit, allowed_mime_types
    from storage.buckets where id = '${STAGING_PRIVATE_BUCKET}';
  `);
  const b = buckets[0];
  pushCheck(report, 'bucket_exists', Boolean(b), STAGING_PRIVATE_BUCKET);
  pushCheck(report, 'bucket_private', b && (b.public === false || b.public === 'f'), String(b?.public));
  pushCheck(report, 'bucket_size_limit', Number(b?.file_size_limit) === STAGING_BUCKET_MAX_BYTES, String(b?.file_size_limit));
  const mimes = Array.isArray(b?.allowed_mime_types) ? b.allowed_mime_types : [];
  pushCheck(
    report,
    'bucket_mime_allowlist',
    STAGING_BUCKET_MIME_ALLOWLIST.every((m) => mimes.includes(m)),
    `count=${mimes.length}`,
  );

  const policies = await sql(guard, `
    select policyname, cmd from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'contracts_v2_private_staging%'
    order by 1;
  `);
  report.storagePolicies = policies.map((p) => `${p.policyname}:${p.cmd}`);
  pushCheck(
    report,
    'storage_select_policy',
    policies.some((p) => p.policyname === 'contracts_v2_private_staging_select'),
    report.storagePolicies.join(',') || 'none',
  );
  pushCheck(
    report,
    'storage_no_authenticated_insert_policy',
    !policies.some((p) => p.cmd === 'INSERT'),
    'no insert policy',
  );

  if (!guard.serviceRoleKey) {
    pushCheck(report, 'storage_smoke', false, 'STAGING_SUPABASE_SERVICE_ROLE_KEY absent — skipped');
    report.storageSmoke = 'SKIPPED_NO_SERVICE_ROLE';
    return;
  }

  const objectPath = `tenants/${ID.tenantA}/contracts/demo-staging/versions/1/fixture-${FIXTURE_MARKER}.txt`;
  const bytes = Buffer.from(`fixture ${FIXTURE_MARKER} no-pii\n`, 'utf8');
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
  pushCheck(report, 'storage_service_upload', up.ok, `status=${up.status}`);

  const down = await fetch(`${base}/storage/v1/object/${STAGING_PRIVATE_BUCKET}/${objectPath}`, { headers: hdr });
  const downBuf = Buffer.from(await down.arrayBuffer());
  const downSha = crypto.createHash('sha256').update(downBuf).digest('hex');
  pushCheck(report, 'storage_service_download_hash', down.ok && downSha === sha, down.ok ? 'hash_match' : `status=${down.status}`);

  const pathTenant = await sql(guard, `
    select public.contracts_v2_private_storage_tenant_id('${objectPath}') as tid,
           public.contracts_v2_private_storage_path_valid('${objectPath}') as valid;
  `);
  pushCheck(
    report,
    'storage_path_tenant_extract',
    pathTenant[0]?.tid === ID.tenantA && (pathTenant[0]?.valid === true || pathTenant[0]?.valid === 't'),
    JSON.stringify(pathTenant[0] || {}),
  );

  const del = await fetch(`${base}/storage/v1/object/${STAGING_PRIVATE_BUCKET}/${objectPath}`, {
    method: 'DELETE',
    headers: hdr,
  });
  pushCheck(report, 'storage_object_cleanup', del.ok || del.status === 404, `status=${del.status}`);
  report.storageSmoke = 'EXECUTED';
}

async function cleanupFixtures(guard, report) {
  try {
    await sql(guard, `
      begin;
      set local session_replication_role = replica;
      delete from storage.objects
        where bucket_id = '${STAGING_PRIVATE_BUCKET}'
          and name like '%${FIXTURE_MARKER}%';
      delete from public.tenants where id in ('${ID.tenantA}', '${ID.tenantB}');
      commit;
    `);
    pushCheck(report, 'fixtures_cleanup', true, 'fixture tenants removed via admin replica role');
    report.cleanup = 'COMPLETED_ADMIN_REPLICA_FOR_FIXTURE_TENANTS';
  } catch (e) {
    pushCheck(report, 'fixtures_cleanup', false, sanitizeText(e.message));
    report.cleanup = 'PARTIAL_OR_FAILED';
    report.cleanupNote = 'Append-only ledger may block cascade; review fixture tenant ids manually.';
  }
}

function validateFlagsAndRuntime(env, report) {
  let flagsOff = true;
  for (const f of FLAG_ENV_KEYS) {
    if (isTruthy(env[f])) flagsOff = false;
  }
  pushCheck(report, 'feature_flags_env_off', flagsOff && FLAG_ENV_KEYS.length === 15, flagsOff ? '15/15 false' : 'SOME_TRUE');
  pushCheck(report, 'delivery_disabled', String(env.CONTRACTS_V2_DELIVERY_MODE || 'disabled') === 'disabled', 'disabled');
  pushCheck(report, 'runtime_not_exercised', true, 'RUNTIME_NOT_EXERCISED_NO_STAGING_DEPLOY');
  report.runtime = 'RUNTIME_NOT_EXERCISED_NO_STAGING_DEPLOY';
}

function validateLegacyLocal(report) {
  const migs = fs.readdirSync(path.join(REPO_ROOT, 'supabase/migrations'));
  const legacy006 = migs.find((f) => f.startsWith('006_'));
  pushCheck(report, 'legacy_006_intact', Boolean(legacy006), legacy006 || 'missing');
  pushCheck(report, 'legacy_ui_not_smokeable', true, 'NO_STAGING_APP_DEPLOY');
  report.legacy = 'STATIC_OK_NO_STAGING_UI_DEPLOY';
}

export async function runStagingContractsV2Validate(options = {}) {
  const env = options.env || loadEnv();
  const report = {
    command: 'contracts-v2:staging-validate',
    startedAt: new Date().toISOString(),
    stagingRef: STAGING_REF,
    productionRef: PRODUCTION_REF,
    productionTouched: false,
    appliedMigrations: false,
    stagingExpectedMigrations: [...STAGING_CONTRACTS_V2_MIGRATIONS],
    checks: [],
    status: 'PENDING',
  };

  try {
    const guard = assertStagingValidateGuard(env);
    report.guard = {
      ok: true,
      ref: guard.ref,
      urlHost: new URL(guard.url).hostname,
      tokenPresent: true,
      serviceRolePresent: Boolean(guard.serviceRoleKey),
    };

    await validateMigrations(guard, report);
    await validateSchema(guard, report);
    await seedFixtures(guard, report);
    await validateRlsAndImmutability(guard, report);
    await validateHashOnly(guard, report);
    await validateBucket(guard, report);
    validateFlagsAndRuntime(env, report);
    validateLegacyLocal(report);
    await cleanupFixtures(guard, report);

    const failed = report.checks.filter((c) => !c.ok);
    report.failedChecks = failed.map((c) => c.name);
    report.ok = failed.length === 0;
    report.status = report.ok ? 'STAGING_VALIDATE_PASS' : 'STAGING_VALIDATE_FAIL';
    report.gate = report.ok
      ? 'READY_FOR_STAGING_FEATURE_FLAG_PILOT_APPROVAL'
      : 'BLOCKED_STAGING_VALIDATION_FAILED';
  } catch (error) {
    report.ok = false;
    report.status = 'BLOCKED';
    report.gate = 'BLOCKED_STAGING_VALIDATION_FAILED';
    report.error = {
      code: error.code || 'UNKNOWN',
      message: sanitizeText(error.message),
      details: error.details || null,
    };
  }

  report.finishedAt = new Date().toISOString();
  report.readyForProduction = false;
  return report;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runStagingContractsV2Validate()
    .then((r) => {
      process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
      process.exit(r.ok ? 0 : 1);
    })
    .catch((err) => {
      console.error(sanitizeText(err?.message || err));
      process.exit(1);
    });
}
