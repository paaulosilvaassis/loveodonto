#!/usr/bin/env node
/**
 * RH Shadow Read QA — Sprint 1C Ticket 1.10.
 *
 * Compara IndexedDB export (local) vs Supabase staging (remote) — SOMENTE LEITURA.
 * Não altera app, IDB, Supabase ou produção.
 *
 * Uso:
 *   node scripts/rh-shadow-read-qa.mjs
 *   node scripts/rh-shadow-read-qa.mjs --tenant-id 7aba7127-409c-4ea4-8dbc-807efc5e189c --rh-export ./collaborators-export.json --remap-export-for-staging
 *
 * Credenciais (staging obrigatório):
 *   STAGING_SUPABASE_URL + STAGING_SUPABASE_SERVICE_ROLE_KEY
 *   ou --supabase-url + --service-role-key
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseEnvFile, REPO_ROOT } from './preflight-local.mjs';
import {
  PROD_PROJECT_REF,
  assertStagingSupabaseUrl,
  extractProjectRef,
  remapRhExportForStaging,
} from '../server/lib/stagingSeedImplanprime.js';
import {
  STAGING_SHADOW_QA_TENANT,
  STAGING_SHADOW_QA_FLAGS,
  mapIdbExportRowToCore,
  mapSupabaseRowToCore,
  compareCollaboratorsForQa,
  generateRhShadowQaReport,
  formatRhShadowQaConsole,
} from '../server/lib/rhShadowReadQa.js';

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
    remapExportForStaging: true,
    json: false,
    help: false,
    supabaseUrl: null,
    serviceRoleKey: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--no-remap-export-for-staging') args.remapExportForStaging = false;
    else if (arg === '--tenant-id') args.tenantId = argv[++i];
    else if (arg === '--rh-export') args.rhExport = argv[++i];
    else if (arg === '--supabase-url') args.supabaseUrl = argv[++i];
    else if (arg === '--service-role-key') args.serviceRoleKey = argv[++i];
  }
  return args;
}

function printHelp() {
  process.stdout.write(`
rh-shadow-read-qa — Shadow Read QA RH (Ticket 1.10)

Somente leitura. Zero writes. Staging obrigatório.

Flags:
  --tenant-id <uuid>              Tenant staging (default: ${STAGING_SHADOW_QA_TENANT})
  --rh-export <path>              Export IDB (default: ./collaborators-export.json)
  --remap-export-for-staging      Remapeia tenant/e-mails do export (default: on)
  --no-remap-export-for-staging   Usa export sem remap
  --supabase-url <url>            Override STAGING_SUPABASE_URL
  --service-role-key <key>        Override STAGING_SUPABASE_SERVICE_ROLE_KEY
  --json                          Saída JSON no stdout (além do arquivo)
  --help                          Esta ajuda

Flags de teste documentadas (app — VITE_*):
  VITE_RH_SUPABASE_READ=true
  VITE_RH_SHADOW_READ=true
  VITE_RH_COMPARE_IDB_SUPABASE=true
  VITE_RH_SUPABASE_READ_PRIMARY=false
  VITE_RH_SUPABASE_WRITE=false

`);
}

function loadRhExport(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`RH export não encontrado: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.collaborators)) return parsed.collaborators;
  throw new Error('RH export inválido: esperado { collaborators: [...] } ou array.');
}

function resolveStagingSupabaseConfig(args) {
  const env = { ...loadMergedEnv(), ...process.env };
  const url = String(args.supabaseUrl || env.STAGING_SUPABASE_URL || '').trim();
  const key = String(args.serviceRoleKey || env.STAGING_SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !key) {
    throw new Error(
      'Credenciais staging obrigatórias: STAGING_SUPABASE_URL + STAGING_SUPABASE_SERVICE_ROLE_KEY '
      + 'ou --supabase-url + --service-role-key.',
    );
  }

  const projectRef = assertStagingSupabaseUrl(url);
  if (projectRef === PROD_PROJECT_REF) {
    throw new Error('PRODUÇÃO detectada — operação abortada.');
  }

  return { url, key, projectRef };
}

async function fetchRemoteCollaborators(supabase, tenantId) {
  const { data, error } = await supabase
    .from('collaborators')
    .select(
      'id, legacy_id, tenant_id, email, nome_completo, status, cargo, rh_categoria, agenda_enabled, updated_at',
    )
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(`Erro ao ler collaborators (read-only): ${error.message}`);
  }
  return data ?? [];
}

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

function writeReportFile(report) {
  ensureReportsDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(REPORTS_DIR, `rh-shadow-read-qa-${stamp}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return filePath;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const started = Date.now();
  const config = resolveStagingSupabaseConfig(args);

  let exportRows = loadRhExport(args.rhExport);
  if (args.remapExportForStaging) {
    exportRows = remapRhExportForStaging(exportRows, args.tenantId);
  }

  const localCores = exportRows.map((row) => mapIdbExportRowToCore(row, args.tenantId));

  const supabase = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const remoteRows = await fetchRemoteCollaborators(supabase, args.tenantId);
  const remoteCores = remoteRows.map(mapSupabaseRowToCore);

  const details = compareCollaboratorsForQa(args.tenantId, localCores, remoteCores);
  const durationMs = Date.now() - started;
  const report = generateRhShadowQaReport(details, durationMs);

  report.meta = {
    method: 'cli-rh-shadow-read-qa',
    supabaseProjectRef: config.projectRef,
    rhExportPath: path.resolve(args.rhExport),
    remapExportForStaging: args.remapExportForStaging,
    readOnly: true,
    writesExecuted: false,
    productionTouched: false,
    functionalChanges: false,
    gitCommit: false,
  };

  const reportPath = writeReportFile(report);

  process.stdout.write(`${formatRhShadowQaConsole(report)}\n`);
  process.stdout.write(`reportFile: ${reportPath}\n`);
  process.stdout.write(`supabaseProjectRef: ${config.projectRef}\n`);
  process.stdout.write(`flags: ${JSON.stringify(STAGING_SHADOW_QA_FLAGS)}\n`);

  if (args.json) {
    process.stdout.write(`\n${JSON.stringify(report, null, 2)}\n`);
  }

  if (report.blockingDiffCount > 0) {
    process.stderr.write('\n[RH_SHADOW] Blockers detectados — ver promotionBlockers no report JSON.\n');
    process.exitCode = 2;
  } else if (report.diffCount > 0) {
    process.stderr.write('\n[RH_SHADOW] Divergências transitórias/informativas — promoção read primary permitida.\n');
  }
}

main().catch((err) => {
  process.stderr.write(`[RH_SHADOW] QA falhou: ${err.message}\n`);
  process.exit(1);
});
