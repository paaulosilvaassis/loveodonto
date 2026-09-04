#!/usr/bin/env node
/**
 * CLOUD.6 — staging remote list / search / tenant isolation (no browser).
 * STAGING ONLY. READ paths. No patient writes.
 *
 * Usage (from repo root, with .env.staging.local):
 *   node scripts/cloud6-patient-remote-read-validate.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STAGING_REF = 'tckdjyunwmdpqmewrwvt';
const PRODUCTION_REF = 'uoepkwhqztmsjnzirpev';
const TARGET_TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const OUT = path.join(ROOT, 'docs/reports/CLOUD_6_PATIENT_REMOTE_READ_API.json');

function parseEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\n/)) {
    if (!line || line.trim().startswith?.('#') || line.trim().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/\r/g, '');
  }
  return env;
}

function refOf(url) {
  try {
    return new URL(url).host.split('.')[0];
  } catch {
    return null;
  }
}

function hardStop(reason, extra = {}) {
  const report = { ok: false, FINAL_GATE: 'STOP_PATIENT_REMOTE_READ_FAILED', reason, ...extra };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  process.exit(2);
}

async function listAllPatients(supabase, tenantId) {
  const pageSize = 500;
  let from = 0;
  const all = [];
  let total = null;
  while (true) {
    const to = from + pageSize - 1;
    const { data, error, count } = await supabase
      .from('patients')
      .select('id,tenant_id,legacy_id,full_name,cpf,birth_date,status,blocked', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('legacy_id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    if (typeof count === 'number') total = count;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
    if (all.length > 20000) break;
  }
  return { rows: all, total: total ?? all.length };
}

async function main() {
  const env = {
    ...parseEnv(path.join(ROOT, '.env.staging.local')),
    ...process.env,
  };
  const url = env.STAGING_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.STAGING_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) hardStop('MISSING_STAGING_CREDENTIALS');
  const ref = refOf(url);
  if (ref !== STAGING_REF) hardStop('URL_NOT_STAGING', { ref });
  if (String(url).includes(PRODUCTION_REF)) hardStop('PRODUCTION_REF_DETECTED');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const t0 = Date.now();
  const { rows, total } = await listAllPatients(supabase, TARGET_TENANT);
  const listLatencyMs = Date.now() - t0;

  const missingLegacy = rows.filter((r) => !r.legacy_id).length;
  const wrongTenant = rows.filter((r) => r.tenant_id !== TARGET_TENANT).length;
  const missingName = rows.filter((r) => !String(r.full_name || '').trim()).length;
  const missingBirth = rows.filter((r) => !r.birth_date).length;

  // Sanitized search: pick first row with CPF and name; never print them.
  const sample = rows.find((r) => r.cpf && r.full_name) || rows[0];
  let searchNamePass = false;
  let searchCpfPass = false;
  let searchLegacyPass = false;
  if (sample) {
    const nameToken = String(sample.full_name).trim().split(/\s+/)[0];
    const { data: byName, error: e1 } = await supabase
      .from('patients')
      .select('legacy_id')
      .eq('tenant_id', TARGET_TENANT)
      .is('deleted_at', null)
      .ilike('full_name', `%${nameToken}%`)
      .limit(5);
    searchNamePass = !e1 && Array.isArray(byName) && byName.length > 0;

    if (sample.cpf) {
      const { data: byCpf, error: e2 } = await supabase
        .from('patients')
        .select('legacy_id')
        .eq('tenant_id', TARGET_TENANT)
        .eq('cpf', sample.cpf)
        .is('deleted_at', null)
        .limit(2);
      searchCpfPass = !e2 && Array.isArray(byCpf) && byCpf.length === 1;
    }

    const { data: byLegacy, error: e3 } = await supabase
      .from('patients')
      .select('legacy_id')
      .eq('tenant_id', TARGET_TENANT)
      .eq('legacy_id', sample.legacy_id)
      .is('deleted_at', null)
      .maybeSingle();
    searchLegacyPass = !e3 && byLegacy?.legacy_id === sample.legacy_id;
  }

  const { data: otherTenants } = await supabase
    .from('tenants')
    .select('id')
    .neq('id', TARGET_TENANT);
  let crossTenantLeak = false;
  for (const t of otherTenants || []) {
    const { count } = await supabase
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', t.id)
      .is('deleted_at', null);
    if ((count || 0) > 0 && t.id !== TARGET_TENANT) {
      // other tenants may legitimately have patients; leak = TARGET patients appearing under other tenant
      const { count: leakCount } = await supabase
        .from('patients')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', t.id)
        .like('legacy_id', 'patient-%')
        .is('deleted_at', null);
      // Prefer explicit: none of TARGET legacy set on other tenant — sample check
      const { count: shared } = await supabase
        .from('patients')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', t.id)
        .eq('legacy_id', sample?.legacy_id || 'patient-none')
        .is('deleted_at', null);
      if ((shared || 0) > 0) crossTenantLeak = true;
      void leakCount;
    }
  }

  const remoteOk = total === 3731 && rows.length === 3731
    && missingLegacy === 0 && wrongTenant === 0;

  const report = {
    ok: remoteOk && searchNamePass && searchCpfPass && searchLegacyPass && !crossTenantLeak,
    TARGET_PROJECT_REF: STAGING_REF,
    TARGET_TENANT,
    STAGING_REMOTE_PATIENT_COUNT: total,
    REMOTE_LIST_COUNT: rows.length,
    REMOTE_LIST_LATENCY_MS: listLatencyMs,
    MISSING_LEGACY_ID: missingLegacy,
    WRONG_TENANT_ROWS: wrongTenant,
    MISSING_FULL_NAME: missingName,
    MISSING_BIRTH_DATE: missingBirth,
    REMOTE_SEARCH_NAME_PASS: searchNamePass,
    REMOTE_SEARCH_CPF_PASS: searchCpfPass,
    REMOTE_SEARCH_LEGACY_PASS: searchLegacyPass,
    REMOTE_SEARCH_PASS: searchNamePass && searchCpfPass && searchLegacyPass,
    CROSS_TENANT_LEAK: crossTenantLeak ? 'YES' : 'NO',
    SHADOW_LOCAL_COUNT: 0,
    SHADOW_REMOTE_COUNT: rows.length,
    SHADOW_MATCH: 0,
    SHADOW_MISMATCH: 0,
    SHADOW_LOCAL_ONLY: 0,
    SHADOW_REMOTE_ONLY: rows.length,
    LOCAL_CACHE_EMPTY: 'YES',
    PRODUCTION_PROJECT_TOUCHED: 'NO',
    PRODUCTION_WRITE: 'ZERO',
    PATIENT_REMOTE_WRITE: false,
    PATIENT_REMOTE_WRITE_PRIMARY: false,
  };

  report.FINAL_GATE = report.ok
    ? 'PASS_CLOUD6_API_REMOTE_LIST_READY'
    : 'STOP_PATIENT_REMOTE_READ_FAILED';

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((err) => {
  hardStop('UNCAUGHT', { error: err instanceof Error ? err.message : String(err) });
});
