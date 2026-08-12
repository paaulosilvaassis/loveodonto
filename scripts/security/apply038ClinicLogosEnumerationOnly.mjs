/**
 * PHASE_SECURITY_02C — apply ONLY 038 via Management API database/query.
 * Requires env: SUPABASE_ACCESS_TOKEN (never logged).
 * Uses .env.local for SUPABASE_URL + service/anon keys for probes.
 *
 * Usage (Terminal where token is exported):
 *   node scripts/security/apply038ClinicLogosEnumerationOnly.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REF = 'uoepkwhqztmsjnzirpev';
const PILOT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const OTHER = 'f2615848-d67d-4a87-96f1-508049953b84';
const MIGRATION = path.join(
  ROOT,
  'supabase/migrations/038_clinic_logos_storage_enumeration_security_fix.sql',
);
const OUT = path.join(ROOT, 'docs/reports/_security02c_apply_result.json');
const EXPECTED_SHA256 =
  'a4eeb152cebda808763cf0dd117330f30884d2cef530e48beee62f5ceb1eb7fa';

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
  if (/036_app_package_manifest|app_package_manifests|create table.*package_manifest/i.test(sql)) {
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
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { ok: res.ok, status: res.status, body };
}

function summarizeList(role, prefix, r, text) {
  let summary;
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j)) {
      summary = {
        operation: `list:${prefix || 'root'}`,
        role,
        status: r.status,
        allowed: r.status >= 200 && r.status < 300,
        count: j.length,
        // do not echo foreign tenant names / UUIDs
        hasEntries: j.length > 0,
      };
    } else {
      summary = {
        operation: `list:${prefix || 'root'}`,
        role,
        status: r.status,
        allowed: false,
        message: String(j.message || j.error || '').slice(0, 120),
        code: j.statusCode || j.error || null,
      };
    }
  } catch {
    summary = {
      operation: `list:${prefix || 'root'}`,
      role,
      status: r.status,
      allowed: false,
      body: text.slice(0, 80),
    };
  }
  return summary;
}

async function listObjects(url, key, role, prefix) {
  const r = await fetch(`${url}/storage/v1/object/list/clinic-logos`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix: prefix || '', limit: 20 }),
  });
  const text = await r.text();
  return summarizeList(role, prefix || 'root', r, text);
}

async function publicHead(url, objectPath) {
  const publicUrl = `${url}/storage/v1/object/public/clinic-logos/${objectPath}`;
  const r = await fetch(publicUrl, { method: 'HEAD' });
  return {
    operation: 'public_GET_HEAD',
    objectPathHint: objectPath.includes(PILOT) ? 'pilot/logo.*' : 'other/guess',
    status: r.status,
    allowed: r.status >= 200 && r.status < 300,
    contentType: r.headers.get('content-type'),
  };
}

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    console.error(JSON.stringify({
      ok: false,
      error: 'SUPABASE_ACCESS_TOKEN_MISSING_IN_THIS_SHELL',
      hint: 'Run in Terminal session where token was exported.',
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

  if (!fs.existsSync(MIGRATION)) {
    console.error(JSON.stringify({ ok: false, error: '038_FILE_MISSING' }));
    process.exit(2);
  }
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  const sha = crypto.createHash('sha256').update(sql).digest('hex');
  if (sha !== EXPECTED_SHA256) {
    console.error(JSON.stringify({
      ok: false,
      error: '038_SHA256_MISMATCH',
      expected: EXPECTED_SHA256,
      got: sha,
    }));
    process.exit(2);
  }
  assertNo036(sql);
  if (!sql.includes("clinic-logos") || !sql.includes('clinic_logos_storage_select')) {
    console.error(JSON.stringify({ ok: false, error: '038_SQL_UNEXPECTED_CONTENT' }));
    process.exit(2);
  }
  if (/public\s*=\s*false/i.test(sql)) {
    console.error(JSON.stringify({ ok: false, error: '038_WOULD_MAKE_BUCKET_PRIVATE' }));
    process.exit(2);
  }

  const report = {
    projectRef: REF,
    method: 'management_api_database_query_single_sql_038',
    migrationFile: '038_clinic_logos_storage_enumeration_security_fix.sql',
    sha256: sha,
    applied036: false,
    at: new Date().toISOString(),
    before: {},
    apply: null,
    after: {},
    policies: null,
    bucket: null,
    writesPolicies: null,
    package036Tables: null,
    rollout: null,
    gate: null,
  };

  // Resolve known object path via service list (names only for pilot)
  const servicePilotList = await listObjects(url, serviceKey, 'service', `${PILOT}/`);
  let objectPath = `${PILOT}/logo.webp`;
  // Try common extensions via HEAD if needed after probes
  report.before.listRootAnon = await listObjects(url, anonKey, 'anon', '');
  report.before.listPilotAnon = await listObjects(url, anonKey, 'anon', `${PILOT}/`);
  report.before.listOtherAnon = await listObjects(url, anonKey, 'anon', `${OTHER}/`);
  report.before.listRootService = await listObjects(url, serviceKey, 'service', '');

  for (const ext of ['webp', 'png', 'jpg', 'jpeg']) {
    const head = await publicHead(url, `${PILOT}/logo.${ext}`);
    if (head.allowed) {
      objectPath = `${PILOT}/logo.${ext}`;
      report.before.publicHead = head;
      break;
    }
    report.before.publicHead = head;
  }
  report.knownObjectExt = objectPath.split('.').pop();

  // clinic_profiles.logo_url shape (service) — path pattern only
  const cp = await fetch(
    `${url}/rest/v1/clinic_profiles?select=tenant_id,logo_url&tenant_id=eq.${PILOT}&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  const cpRows = await cp.json();
  const logoUrl = Array.isArray(cpRows) ? String(cpRows[0]?.logo_url || '') : '';
  let logoMeta = { empty: !logoUrl };
  try {
    const u = new URL(logoUrl);
    logoMeta = {
      host: u.host,
      isPublicClinicLogos: u.pathname.includes('/object/public/clinic-logos/'),
      hasSignedToken: u.search.includes('token=') || u.pathname.includes('/object/sign/'),
      endsWithKnownExt: /\.(webp|png|jpe?g)$/i.test(u.pathname),
    };
  } catch { /* ignore */ }
  report.before.logoUrlMeta = logoMeta;
  report.before.servicePilotListCount = servicePilotList.count ?? null;

  // APPLY only 038
  const apply = await managementSql(accessToken, sql);
  report.apply = {
    ok: apply.ok,
    status: apply.status,
    bodySummary: apply.ok
      ? { success: true }
      : {
        error: String(apply.body?.message || apply.body?.error || apply.body?.raw || 'apply_failed').slice(0, 200),
      },
  };
  if (!apply.ok) {
    report.gate = 'BLOCKED_APPLY_FAILED';
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.error(JSON.stringify({ ok: false, error: 'APPLY_FAILED', status: apply.status, out: OUT }));
    process.exit(1);
  }

  // AFTER probes
  report.after.listRootAnon = await listObjects(url, anonKey, 'anon', '');
  report.after.listPilotAnon = await listObjects(url, anonKey, 'anon', `${PILOT}/`);
  report.after.listOtherAnon = await listObjects(url, anonKey, 'anon', `${OTHER}/`);
  report.after.publicHead = await publicHead(url, objectPath);

  // Policy / bucket catalog
  report.bucket = await managementSql(accessToken, `
    select id, name, public
    from storage.buckets
    where id = 'clinic-logos';
  `);
  report.policies = await managementSql(accessToken, `
    select policyname, cmd, roles, qual, with_check
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        policyname ilike 'clinic_logos%'
        or coalesce(qual, '') ilike '%clinic-logos%'
        or coalesce(with_check, '') ilike '%clinic-logos%'
      )
    order by policyname, cmd;
  `);
  report.writesPolicies = await managementSql(accessToken, `
    select policyname, cmd,
           (qual ilike '%app_user_can_access_tenant%' or with_check ilike '%app_user_can_access_tenant%') as tenant_scoped
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'clinic_logos_storage_insert',
        'clinic_logos_storage_update',
        'clinic_logos_storage_delete',
        'clinic_logos_storage_select'
      )
    order by policyname;
  `);

  // 036 still absent
  report.package036Tables = await managementSql(accessToken, `
    select to_regclass('public.app_package_manifests')::text as app_package_manifests,
           to_regclass('public.app_package_manifest_documents')::text as app_package_manifest_documents;
  `);

  // Rollout read-only
  const flags = await fetch(
    `${url}/rest/v1/feature_flags?select=flag_key,scope_type,scope_ref,enabled&or=(flag_key.eq.contracts_operational_ux_global_enabled,flag_key.eq.contracts_operational_ux_enabled)`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  const flagRows = await flags.json();
  report.rollout = Array.isArray(flagRows)
    ? flagRows.map((r) => ({
      flag_key: r.flag_key,
      scope_type: r.scope_type,
      enabled: r.enabled,
      scope_ref: r.scope_type === 'tenant' ? (r.scope_ref === PILOT ? 'pilot' : 'other') : r.scope_ref,
    }))
    : { error: 'flags_fetch_failed', status: flags.status };

  // Derive gate
  const anonListDenied = report.after.listRootAnon?.allowed === false
    && report.after.listPilotAnon?.allowed === false;
  const publicGetOk = report.after.publicHead?.allowed === true;
  const bucketPublic = Array.isArray(report.bucket?.body)
    && report.bucket.body[0]?.public === true;
  const policies = Array.isArray(report.policies?.body) ? report.policies.body : [];
  const selectPol = policies.find((p) => p.policyname === 'clinic_logos_storage_select');
  const selectOk = selectPol
    && String(selectPol.cmd).toUpperCase() === 'SELECT'
    && String(selectPol.roles).includes('authenticated')
    && /app_user_can_access_tenant/i.test(String(selectPol.qual || ''))
    && !/using\s*\(\s*true\s*\)/i.test(String(selectPol.qual || ''));
  const anonSelectAbsent = !policies.some(
    (p) => p.policyname === 'clinic_logos_storage_select'
      && (String(p.roles).includes('anon') || String(p.roles) === '{public}'),
  );
  const openSelectGone = !policies.some(
    (p) => p.cmd === 'SELECT'
      && /bucket_id = 'clinic-logos'/i.test(String(p.qual || ''))
      && !/app_user_can_access_tenant/i.test(String(p.qual || '')),
  );
  const writesOk = Array.isArray(report.writesPolicies?.body)
    && report.writesPolicies.body.filter((p) => p.policyname !== 'clinic_logos_storage_select')
      .every((p) => p.tenant_scoped === true);
  const m036Absent = report.package036Tables?.ok
    && Array.isArray(report.package036Tables.body)
    && report.package036Tables.body[0]?.app_package_manifests == null;

  const globalOn = Array.isArray(report.rollout)
    && report.rollout.some((r) => r.flag_key === 'contracts_operational_ux_global_enabled' && r.enabled === true);
  const pilotOn = Array.isArray(report.rollout)
    && report.rollout.some((r) => r.flag_key === 'contracts_operational_ux_enabled' && r.scope_ref === 'pilot' && r.enabled === true);
  const othersOff = Array.isArray(report.rollout)
    && !report.rollout.some((r) => r.flag_key === 'contracts_operational_ux_enabled' && r.scope_ref === 'other' && r.enabled === true);

  report.checks = {
    anonListDenied,
    publicGetOk,
    bucketPublic,
    selectOk,
    anonSelectAbsent,
    openSelectGone,
    writesOk,
    m036Absent,
    rolloutUnchanged: globalOn && pilotOn && othersOff,
    beforeAnonListAllowed: report.before.listRootAnon?.allowed === true,
  };

  const allPass = Object.entries(report.checks)
    .filter(([k]) => k !== 'beforeAnonListAllowed')
    .every(([, v]) => v === true)
    && report.checks.beforeAnonListAllowed === true;

  if (allPass) {
    report.gate = 'SECURITY_02_CLOSED_PACKAGE_MANIFEST_CLEARED';
    report.SECURITY_02_STATUS = 'CLOSED';
    report.PACKAGE_MANIFEST_SECURITY_CLEARANCE = 'CLEARED';
  } else if (!anonListDenied) {
    report.gate = 'SECURITY_02_BLOCKED_ANON_LIST_STILL_ALLOWED';
    report.SECURITY_02_STATUS = 'BLOCKED';
    report.PACKAGE_MANIFEST_SECURITY_CLEARANCE = 'BLOCKED';
  } else if (!publicGetOk) {
    report.gate = 'SECURITY_02_BLOCKED_PUBLIC_GET_BROKEN';
    report.SECURITY_02_STATUS = 'BLOCKED';
    report.PACKAGE_MANIFEST_SECURITY_CLEARANCE = 'BLOCKED';
  } else {
    report.gate = 'SECURITY_02_BLOCKED_PARTIAL_CHECKS';
    report.SECURITY_02_STATUS = 'BLOCKED';
    report.PACKAGE_MANIFEST_SECURITY_CLEARANCE = 'BLOCKED';
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: allPass,
    gate: report.gate,
    SECURITY_02_STATUS: report.SECURITY_02_STATUS,
    PACKAGE_MANIFEST_SECURITY_CLEARANCE: report.PACKAGE_MANIFEST_SECURITY_CLEARANCE,
    checks: report.checks,
    beforeAnonList: report.before.listRootAnon,
    afterAnonList: report.after.listRootAnon,
    afterPublicGet: report.after.publicHead,
    out: OUT,
  }));
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 200) }));
  process.exit(1);
});
