#!/usr/bin/env node
/**
 * Backfill RH: IndexedDB export → Supabase (collaborators + tenant_users.collaborator_uuid).
 *
 * SEMPRE dry-run por padrão. Mutações somente com --apply --confirm APPLY.
 * Não cria tenant_users. Não apaga dados. Não altera collaborator_id text.
 *
 * Uso dry-run:
 *   node scripts/rh-backfill-to-supabase.mjs --tenant-id <uuid> --rh-export ./collaborators-export.json
 *
 * Uso apply:
 *   node scripts/rh-backfill-to-supabase.mjs --tenant-id <uuid> --rh-export ./collaborators-export.json --apply --confirm APPLY
 *
 * Rollback:
 *   node scripts/rh-backfill-to-supabase.mjs --rollback ./scripts/reports/rh-backfill-backup-*.json
 *
 * Requer credenciais Supabase (uma das opções):
 *   STAGING_SUPABASE_URL + STAGING_SUPABASE_SERVICE_ROLE_KEY (recomendado staging)
 *   --supabase-url + --service-role-key
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server/.env — somente se staging não definido)
 * Pré-requisito: migrations 014, 015, 016, 017, 019 aplicadas.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  ACTIONS,
  POST_APPLY_VALIDATION_SQL,
  applyRhBackfillPlan,
  buildRhBackfillPlan,
  canApplyPlan,
  formatPlanTable,
  rollbackRhBackfillFromBackup,
  validateSchemaReady,
} from '../server/lib/rhBackfillToSupabase.js';
import { parseEnvFile, REPO_ROOT, getBackendSupabaseUrl } from './preflight-local.mjs';
import {
  PROD_PROJECT_REF,
  assertStagingSupabaseUrl,
  extractProjectRef,
  remapRhExportForStaging,
} from '../server/lib/stagingSeedImplanprime.js';

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
  const args = {
    tenantId: null,
    rhExport: null,
    apply: false,
    confirm: null,
    rollback: null,
    json: false,
    help: false,
    skipSchemaCheck: false,
    supabaseUrl: null,
    serviceRoleKey: null,
    remapExportForStaging: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--skip-schema-check') args.skipSchemaCheck = true;
    else if (arg === '--tenant-id') args.tenantId = argv[++i];
    else if (arg === '--rh-export') args.rhExport = argv[++i];
    else if (arg === '--confirm') args.confirm = argv[++i];
    else if (arg === '--rollback') args.rollback = argv[++i];
    else if (arg === '--supabase-url') args.supabaseUrl = argv[++i];
    else if (arg === '--service-role-key') args.serviceRoleKey = argv[++i];
    else if (arg === '--remap-export-for-staging') args.remapExportForStaging = true;
  }
  return args;
}

function printHelp() {
  process.stdout.write(`
rh-backfill-to-supabase — migra RH do IndexedDB para Supabase (Fase 1)

Flags obrigatórias (exceto rollback):
  --tenant-id <uuid>       Clínica alvo
  --rh-export <path>       JSON { "collaborators": [...] } ou array

Flags de mutação:
  --apply                  Aplica alterações (exige --confirm APPLY)
  --confirm APPLY          Confirmação explícita

Outros:
  --supabase-url <url>     Override URL (staging: tckdjyunwmdpqmewrwvt)
  --service-role-key <key> Override service role
  --remap-export-for-staging  Reescreve tenant_id/e-mails do export para o tenant staging seed
  --rollback <backup.json> Restaura backup gerado no apply
  --json                   Saída JSON no stdout
  --skip-schema-check      Apenas emergência (não recomendado)

Alterações com --apply:
  INSERT/UPDATE em public.collaborators
  UPDATE tenant_users.collaborator_uuid (somente quando NULL e match seguro)

Nunca altera:
  tenant_users.collaborator_id (text legado)
  Não cria tenant_users
  Não DELETE

`);
}

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
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

function resolveSupabaseConfig(args) {
  const env = { ...loadMergedEnv(), ...process.env };
  const stagingUrl = String(args.supabaseUrl || env.STAGING_SUPABASE_URL || '').trim();
  const stagingKey = String(args.serviceRoleKey || env.STAGING_SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (stagingUrl || stagingKey) {
    if (!stagingUrl || !stagingKey) {
      throw new Error(
        'Credenciais staging incompletas. Informe STAGING_SUPABASE_URL + STAGING_SUPABASE_SERVICE_ROLE_KEY '
        + 'ou --supabase-url + --service-role-key.',
      );
    }
    const projectRef = assertStagingSupabaseUrl(stagingUrl);
    return { url: stagingUrl, key: stagingKey, projectRef, prod_touched: false };
  }

  const url = getBackendSupabaseUrl() || String(env.SUPABASE_URL || '').trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios (server/.env ou raiz .env).');
  }
  const projectRef = extractProjectRef(url);
  if (projectRef === PROD_PROJECT_REF) {
    return { url, key, projectRef, prod_touched: false };
  }
  return { url, key, projectRef, prod_touched: false };
}

function createSupabaseAdmin(args = {}) {
  const config = resolveSupabaseConfig(args);
  return {
    client: createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    config,
  };
}

async function assertSchemaReady(supabase) {
  const result = await validateSchemaReady(supabase);
  if (!result.ok) {
    const lines = result.errors.map(
      (e) => `  - [${e.migration}] ${e.label}: ${e.message}`,
    );
    throw new Error(
      `Schema incompleto — migrations 014–019 não detectadas.\n${lines.join('\n')}\n`
      + 'Aplique supabase/migrations/014–019 antes do backfill.',
    );
  }
  return result;
}

async function fetchRemoteState(supabase, tenantId) {
  const [collabRes, tuRes] = await Promise.all([
    supabase
      .from('collaborators')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null),
    supabase
      .from('tenant_users')
      .select('id, tenant_id, email, collaborator_id, collaborator_uuid, full_name, role, role_slug, updated_at, has_system_access')
      .eq('tenant_id', tenantId),
  ]);

  if (collabRes.error) throw collabRes.error;
  if (tuRes.error) throw tuRes.error;

  return {
    remoteCollaborators: collabRes.data || [],
    tenantUsers: tuRes.data || [],
  };
}

function writeReport(filename, payload) {
  ensureReportsDir();
  const reportPath = path.join(REPORTS_DIR, filename);
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2), 'utf8');
  return reportPath;
}

async function runDryRun(args) {
  const { client: supabase, config } = createSupabaseAdmin(args);

  if (!args.skipSchemaCheck) {
    await assertSchemaReady(supabase);
  }

  const exportRowsRaw = loadRhExport(args.rhExport);
  let exportRows = exportRowsRaw;
  let exportRemapMeta = { enabled: false };
  if (args.remapExportForStaging) {
    assertStagingSupabaseUrl(config.url);
    exportRows = remapRhExportForStaging(exportRowsRaw, args.tenantId);
    exportRemapMeta = {
      enabled: true,
      source_rows: exportRowsRaw.length,
      target_tenant_id: args.tenantId,
      staging_emails_applied: true,
    };
  }

  const { remoteCollaborators, tenantUsers } = await fetchRemoteState(supabase, args.tenantId);

  const plan = buildRhBackfillPlan({
    tenantId: args.tenantId,
    exportRows,
    remoteCollaborators,
    tenantUsers,
  });
  plan.export_remap = exportRemapMeta;

  const gate = canApplyPlan(plan);
  plan.mode = 'dry-run';
  plan.supabase_project_ref = config.projectRef;
  plan.supabase_url_host = config.url ? `${extractProjectRef(config.url) || config.url}.supabase.co` : null;
  plan.prod_touched = false;
  plan.migration_018_applied = false;
  plan.apply_gate = gate;
  plan.post_apply_validation_sql = POST_APPLY_VALIDATION_SQL;
  const credFlags = [
    args.supabaseUrl ? `--supabase-url "${args.supabaseUrl}" --service-role-key "<redacted>"` : '',
    args.remapExportForStaging ? '--remap-export-for-staging' : '',
  ].filter(Boolean).join(' ');
  plan.apply_command = `node scripts/rh-backfill-to-supabase.mjs --tenant-id ${args.tenantId} --rh-export "${args.rhExport}" ${credFlags} --apply --confirm APPLY`.trim();

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = writeReport(`rh-backfill-dryrun-${stamp}.json`, plan);

  if (args.json) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } else {
    process.stdout.write('\n=== RH backfill → Supabase — DRY-RUN (nenhuma alteração) ===\n\n');
    process.stdout.write(`Projeto: ${config.projectRef || '(desconhecido)'}\n`);
    process.stdout.write(`Tenant: ${args.tenantId}\n`);
    process.stdout.write(`Export: ${exportRows.length} colaborador(es)\n`);
    process.stdout.write(`Supabase collaborators: ${remoteCollaborators.length}\n`);
    process.stdout.write(`tenant_users: ${tenantUsers.length}\n\n`);
    process.stdout.write(`Resumo geral: ${JSON.stringify(plan.summary)}\n`);
    process.stdout.write(`Colaboradores: ${JSON.stringify(plan.collaborator_summary)}\n`);
    process.stdout.write(`Vínculos: ${JSON.stringify(plan.link_summary)}\n\n`);
    process.stdout.write(`${formatPlanTable([...plan.collaborator_rows, ...plan.link_rows])}\n\n`);
    process.stdout.write(`Gate apply: ${gate.ok ? 'LIBERADO' : 'BLOQUEADO'} (${gate.blocking_count} bloqueio(s))\n`);
    if (!gate.ok) {
      for (const row of gate.blocking_rows.slice(0, 10)) {
        process.stdout.write(`  ✗ ${row.action} ${row.legacy_id || row.tenant_user_id}: ${row.reason}\n`);
      }
    }
    process.stdout.write(`\nNOT_FOUND (documentado): ${JSON.stringify(plan.not_found_documentation)}\n`);
    process.stdout.write(`Relatório: ${reportPath}\n`);
    process.stdout.write(`\nPara aplicar:\n  ${plan.apply_command}\n`);
  }

  return { plan, reportPath, gate };
}

async function runApply(args) {
  if (args.confirm !== 'APPLY') {
    throw new Error('Mutações exigem --apply --confirm APPLY');
  }

  const { plan, reportPath, gate } = await runDryRun({ ...args, json: false });
  if (!gate.ok) {
    throw new Error(
      `Apply bloqueado: AMBIGUOUS/CONFLICT/ERROR devem ser 0. Ver relatório: ${reportPath}`,
    );
  }

  const applicableCollabs = (plan.collaborator_rows || []).filter(
    (r) => [ACTIONS.INSERT_PROPOSED, ACTIONS.UPDATE_PROPOSED, ACTIONS.SKIP_BASE64_PHOTO].includes(r.action),
  );
  const applicableLinks = (plan.link_rows || []).filter((r) => r.action === ACTIONS.LINK_PROPOSED);
  if (applicableCollabs.length === 0 && applicableLinks.length === 0) {
    process.stdout.write('\nNenhuma mutação proposta — nada a aplicar.\n');
    return;
  }

  const supabase = createSupabaseAdmin(args).client;
  const preBackupPath = writeReport(`rh-backfill-pre-apply-snapshot-${Date.now()}.json`, {
    captured_at: new Date().toISOString(),
    tenant_id: args.tenantId,
    dry_run_report: reportPath,
    plan,
  });

  process.stdout.write(`\nSnapshot pré-apply: ${preBackupPath}\n`);
  process.stdout.write(`Aplicando ${applicableCollabs.length} colaborador(es), ${applicableLinks.length} vínculo(s)...\n`);

  const result = await applyRhBackfillPlan(supabase, plan, {
    onProgress: (p) => {
      if (p.type === 'collaborator') {
        process.stdout.write(`  [${p.action}] ${p.legacy_id} → ${p.id || p.error || ''}\n`);
      } else if (p.type === 'link') {
        process.stdout.write(`  [link] tenant_user ${p.tenant_user_id} → ${p.collaborator_uuid}\n`);
      }
    },
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = writeReport(`rh-backfill-backup-${stamp}.json`, {
    applied_at: new Date().toISOString(),
    tenant_id: args.tenantId,
    dry_run_report: reportPath,
    pre_apply_snapshot: preBackupPath,
    inserts: result.inserts,
    updates: result.updates,
    links: result.links,
    errors: result.errors,
    backup: result.backup,
    rollback_command: `node scripts/rh-backfill-to-supabase.mjs --rollback "${path.join(REPORTS_DIR, `rh-backfill-backup-${stamp}.json`)}"`,
    post_apply_validation_sql: POST_APPLY_VALIDATION_SQL,
  });

  process.stdout.write(`\nInserts: ${result.inserts} | Updates: ${result.updates} | Links: ${result.links}\n`);
  if (result.errors.length) {
    process.stdout.write(`Erros (${result.errors.length}):\n`);
    for (const e of result.errors) process.stdout.write(`  - ${JSON.stringify(e)}\n`);
  }
  process.stdout.write(`Backup rollback: ${backupPath}\n`);
  process.stdout.write('\nExecute as queries post_apply_validation_sql antes de VALIDATE CONSTRAINT (018).\n');
}

async function runRollback(backupPath, args = {}) {
  const resolved = path.resolve(backupPath);
  if (!fs.existsSync(resolved)) throw new Error(`Backup não encontrado: ${resolved}`);
  const payload = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const entries = payload.backup;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Backup vazio ou formato inválido (campo backup[]).');
  }

  const supabase = createSupabaseAdmin(args).client;
  const result = await rollbackRhBackfillFromBackup(supabase, entries);
  process.stdout.write(`Restaurados: ${result.restored.length}\n`);
  if (result.errors.length) {
    for (const e of result.errors) process.stdout.write(`  ✗ ${e.table}/${e.id}: ${e.message}\n`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.rollback) {
    await runRollback(args.rollback, args);
    process.exit(0);
  }

  if (!args.tenantId || !args.rhExport) {
    process.stderr.write('Erro: --tenant-id e --rh-export são obrigatórios.\n');
    printHelp();
    process.exit(1);
  }

  if (args.apply) {
    await runApply(args);
  } else {
    await runDryRun(args);
    process.stdout.write('\n✓ Nenhuma alteração aplicada (dry-run).\n');
  }
}

main().catch((err) => {
  process.stderr.write(`\nErro: ${err?.message || err}\n`);
  process.exit(1);
});
