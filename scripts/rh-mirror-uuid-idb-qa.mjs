#!/usr/bin/env node
/**
 * RH UUID Mirror QA — Sprint 1C Ticket 1.13.
 *
 * Read-only Supabase staging + espelhamento local controlado.
 *
 * Modos:
 *   --dry-run (default)     Plano + relatório sem escrita
 *   --apply-to-export       Grava `uuid` no collaborators-export.json (simula pós-mirror IDB)
 *
 * Browser IDB real: scripts/snippets/rh-mirror-uuid-idb-browser-snippet.js
 *
 * Uso:
 *   node scripts/rh-mirror-uuid-idb-qa.mjs
 *   node scripts/rh-mirror-uuid-idb-qa.mjs --apply-to-export
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseEnvFile, REPO_ROOT } from './preflight-local.mjs';
import {
  assertStagingSupabaseUrl,
  remapRhExportForStaging,
} from '../server/lib/stagingSeedImplanprime.js';
import {
  buildCollaboratorUuidMirrorPlan,
  applyUuidMirrorToExportRows,
  mergeUuidMirrorPlanIntoReport,
  summarizeMirrorPlanForExport,
} from '../server/lib/collaboratorUuidMirror.js';
import { STAGING_SHADOW_QA_TENANT } from '../server/lib/rhShadowReadQa.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(REPO_ROOT, 'scripts', 'reports');
const DEFAULT_EXPORT = path.join(REPO_ROOT, 'collaborators-export.json');

function loadMergedEnv() {
  return {
    ...parseEnvFile(path.join(REPO_ROOT, 'server', '.env')),
    ...parseEnvFile(path.join(REPO_ROOT, 'server', '.env.local')),
    ...parseEnvFile(path.join(REPO_ROOT, '.env')),
    ...parseEnvFile(path.join(REPO_ROOT, '.env.local')),
  };
}

function parseArgs(argv) {
  const args = {
    tenantId: STAGING_SHADOW_QA_TENANT,
    rhExport: DEFAULT_EXPORT,
    applyToExport: false,
    dryRun: true,
    json: false,
    help: false,
    supabaseUrl: null,
    serviceRoleKey: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--apply-to-export') {
      args.applyToExport = true;
      args.dryRun = false;
    }
    else if (arg === '--tenant-id') args.tenantId = argv[++i];
    else if (arg === '--rh-export') args.rhExport = argv[++i];
    else if (arg === '--supabase-url') args.supabaseUrl = argv[++i];
    else if (arg === '--service-role-key') args.serviceRoleKey = argv[++i];
  }
  return args;
}

function printHelp() {
  process.stdout.write(`
rh-mirror-uuid-idb-qa — espelha collaborator_uuid no export/IDB (Ticket 1.13)

Somente staging. Zero writes Supabase.

  --dry-run (default)       Plano sem escrita local
  --apply-to-export         Grava uuid no collaborators-export.json
  --tenant-id <uuid>        Tenant staging
  --rh-export <path>        Export IDB JSON
  --json                    Saída JSON completa
  --help                    Esta ajuda

Browser IDB: scripts/snippets/rh-mirror-uuid-idb-browser-snippet.js

`);
}

function loadRhExport(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`RH export não encontrado: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return { rows: parsed, wrapper: null, path: resolved };
  if (Array.isArray(parsed?.collaborators)) {
    return { rows: parsed.collaborators, wrapper: parsed, path: resolved };
  }
  throw new Error('RH export inválido.');
}

function resolveStagingSupabaseConfig(args) {
  const env = { ...loadMergedEnv(), ...process.env };
  const url = String(args.supabaseUrl || env.STAGING_SUPABASE_URL || '').trim();
  const key = String(args.serviceRoleKey || env.STAGING_SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    throw new Error('STAGING_SUPABASE_URL + STAGING_SUPABASE_SERVICE_ROLE_KEY obrigatórios.');
  }
  const projectRef = assertStagingSupabaseUrl(url);
  return { url, key, projectRef };
}

async function fetchRemoteCollaborators(supabase, tenantId) {
  const { data, error } = await supabase
    .from('collaborators')
    .select('id, legacy_id, tenant_id')
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`Erro read-only Supabase: ${error.message}`);
  return data ?? [];
}

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const config = resolveStagingSupabaseConfig(args);
  const exportData = loadRhExport(args.rhExport);
  const remappedRows = remapRhExportForStaging(exportData.rows, args.tenantId);

  const supabase = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const remoteRows = await fetchRemoteCollaborators(supabase, args.tenantId);

  const plan = buildCollaboratorUuidMirrorPlan(args.tenantId, remappedRows, remoteRows);
  const report = mergeUuidMirrorPlanIntoReport(args.tenantId, plan);

  for (const item of plan) {
    if (item.action === 'update') {
      report.updated.push({
        legacyId: item.legacyId,
        uuid: item.uuid,
        previousUuid: item.previousUuid,
      });
    }
  }

  const summary = summarizeMirrorPlanForExport(plan);

  if (args.applyToExport) {
    const mirrored = applyUuidMirrorToExportRows(remappedRows, remoteRows);
    if (exportData.wrapper) {
      exportData.wrapper.collaborators = mirrored;
      fs.writeFileSync(exportData.path, `${JSON.stringify(exportData.wrapper, null, 2)}\n`, 'utf8');
    } else {
      fs.writeFileSync(exportData.path, `${JSON.stringify(mirrored, null, 2)}\n`, 'utf8');
    }
    report.exportFile = exportData.path;
    report.exportWrite = true;
  } else {
    report.exportWrite = false;
  }

  report.meta = {
    method: 'cli-rh-mirror-uuid-idb-qa',
    supabaseProjectRef: config.projectRef,
    dryRun: args.dryRun,
    productionTouched: false,
    supabaseWritesExecuted: false,
    summary,
  };

  ensureReportsDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(REPORTS_DIR, `rh-mirror-uuid-idb-qa-${stamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  process.stdout.write('[RH_UUID_MIRROR] QA Report\n');
  process.stdout.write(`tenant: ${args.tenantId}\n`);
  process.stdout.write(`wouldUpdate: ${summary.wouldUpdate}\n`);
  process.stdout.write(`wouldSkip: ${summary.wouldSkip}\n`);
  process.stdout.write(`notFound: ${summary.notFound}\n`);
  process.stdout.write(`conflicts: ${summary.conflicts}\n`);
  process.stdout.write(`applyToExport: ${args.applyToExport}\n`);
  process.stdout.write(`supabaseWritesExecuted: false\n`);
  process.stdout.write(`reportFile: ${reportPath}\n`);

  if (args.json) {
    process.stdout.write(`\n${JSON.stringify(report, null, 2)}\n`);
  }

  if (summary.conflicts > 0) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  process.stderr.write(`[RH_UUID_MIRROR] QA falhou: ${err.message}\n`);
  process.exit(1);
});
