#!/usr/bin/env node
/**
 * Backup completo pré-apply RH backfill (somente leitura).
 * Uso: node scripts/pre-apply-full-backup.mjs --tenant-id <uuid> [--dry-run-report <path>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseEnvFile, REPO_ROOT, getBackendSupabaseUrl } from './preflight-local.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(REPO_ROOT, 'scripts', 'reports');

function loadMergedEnv() {
  return {
    ...parseEnvFile(path.join(REPO_ROOT, 'server', '.env')),
    ...parseEnvFile(path.join(REPO_ROOT, 'server', '.env.local')),
    ...parseEnvFile(path.join(REPO_ROOT, '.env')),
    ...parseEnvFile(path.join(REPO_ROOT, '.env.local')),
  };
}

function parseArgs(argv) {
  const args = { tenantId: null, dryRunReport: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--tenant-id') args.tenantId = argv[++i];
    else if (argv[i] === '--dry-run-report') args.dryRunReport = argv[++i];
  }
  return args;
}

function createSupabaseAdmin() {
  const env = loadMergedEnv();
  const url = getBackendSupabaseUrl() || String(env.SUPABASE_URL || '').trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
  }
  return { supabase: createClient(url, key, { auth: { persistSession: false } }), url };
}

async function fetchTable(supabase, table, tenantId, { includeDeleted = false } = {}) {
  let query = supabase.from(table).select('*').eq('tenant_id', tenantId);
  if (!includeDeleted && table === 'collaborators') {
    query = query.is('deleted_at', null);
  }
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.tenantId) {
    throw new Error('--tenant-id é obrigatório');
  }

  const { supabase, url } = createSupabaseAdmin();
  const projectRef = (() => {
    try {
      return new URL(url).hostname.split('.')[0];
    } catch {
      return null;
    }
  })();

  const tenantId = args.tenantId;
  const [
    tenant_users,
    collaborators,
    collaborators_all,
    invitations,
    identities,
    identity_events,
    clinic_profiles,
    tenants,
  ] = await Promise.all([
    fetchTable(supabase, 'tenant_users', tenantId),
    fetchTable(supabase, 'collaborators', tenantId),
    supabase.from('collaborators').select('*').eq('tenant_id', tenantId).then(({ data, error }) => {
      if (error) throw new Error(`collaborators_all: ${error.message}`);
      return data || [];
    }),
    fetchTable(supabase, 'invitations', tenantId),
    fetchTable(supabase, 'identities', tenantId),
    fetchTable(supabase, 'identity_events', tenantId),
    fetchTable(supabase, 'clinic_profiles', tenantId),
    supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle().then(({ data, error }) => {
      if (error) throw new Error(`tenants: ${error.message}`);
      return data;
    }),
  ]);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const payload = {
    captured_at: new Date().toISOString(),
    purpose: 'pre-apply-full-backup-rh-backfill',
    supabase_project_ref: projectRef,
    supabase_url_host: url ? new URL(url).hostname : null,
    tenant_id: tenantId,
    dry_run_report: args.dryRunReport ? path.resolve(args.dryRunReport) : null,
    row_counts: {
      tenant_users: tenant_users.length,
      collaborators_active: collaborators.length,
      collaborators_including_deleted: collaborators_all.length,
      invitations: invitations.length,
      identities: identities.length,
      identity_events: identity_events.length,
      clinic_profiles: clinic_profiles.length,
    },
    tables: {
      tenants,
      tenant_users,
      collaborators,
      collaborators_including_deleted: collaborators_all,
      invitations,
      identities,
      identity_events,
      clinic_profiles,
    },
  };

  const outPath = path.join(REPORTS_DIR, `pre-apply-full-backup-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');

  process.stdout.write(`Backup completo: ${outPath}\n`);
  process.stdout.write(`Projeto: ${projectRef}\n`);
  process.stdout.write(`Contagens: ${JSON.stringify(payload.row_counts)}\n`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
