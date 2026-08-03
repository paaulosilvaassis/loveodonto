#!/usr/bin/env node
/**
 * Backfill seguro de collaborator_id — Supabase (server-side).
 * LEGACY_RC01: script one-off RC-01.4 — remoção planejada RC-03.
 *
 * SEMPRE executa dry-run por padrão. Nenhuma mutação sem --apply explícito.
 *
 * Uso:
 *   node scripts/collaborator-id-backfill.mjs --tenant-id <uuid>
 *   node scripts/collaborator-id-backfill.mjs --tenant-id <uuid> --rh-export ./collaborators.json
 *   node scripts/collaborator-id-backfill.mjs --tenant-id <uuid> --apply --confirm APPLY
 *
 * Rollback:
 *   node scripts/collaborator-id-backfill.mjs --rollback ./scripts/reports/collaborator-id-backfill-backup-*.json
 *
 * Requer: server/.env ou raiz .env com SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  ACTIONS,
  COLLABORATOR_ID_TABLES,
  LOCAL_ONLY_COLLABORATOR_REFS,
  applyBackfillPlan,
  buildBackfillPlan,
  buildTableImpactPreview,
  formatReportTable,
  rollbackFromBackup,
} from '../server/lib/collaboratorIdBackfill.js';
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
  const args = {
    tenantId: null,
    rhExport: null,
    apply: false,
    confirm: null,
    rollback: null,
    json: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--tenant-id') args.tenantId = argv[++i];
    else if (arg === '--rh-export') args.rhExport = argv[++i];
    else if (arg === '--confirm') args.confirm = argv[++i];
    else if (arg === '--rollback') args.rollback = argv[++i];
  }
  return args;
}

function printHelp() {
  process.stdout.write(`
collaborator-id-backfill — reconcilia collaborator_id no Supabase

Flags:
  --tenant-id <uuid>     Clínica alvo (obrigatório exceto em --rollback)
  --rh-export <path>     JSON exportado do IndexedDB ({ collaborators: [...] })
  --apply                Aplica alterações (exige --confirm APPLY)
  --confirm APPLY        Confirmação explícita para produção
  --rollback <backup>    Restaura backup gerado no --apply
  --json                 Saída JSON no stdout

Tabelas Supabase alteradas com --apply:
  tenant_users, invitations, identities, identity_events

Tabelas locais (IndexedDB) — NÃO alteradas por este script:
  ${LOCAL_ONLY_COLLABORATOR_REFS.join(', ')}

`);
}

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

function loadRhExport(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.collaborators)) return parsed.collaborators;
  throw new Error('RH export inválido: esperado { collaborators: [...] } ou array.');
}

function createSupabaseAdmin() {
  const env = loadMergedEnv();
  const url = getBackendSupabaseUrl() || String(env.SUPABASE_URL || '').trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios (server/.env ou raiz .env).');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function fetchTenantData(supabase, tenantId) {
  const queries = {
    tenantUsers: supabase
      .from('tenant_users')
      .select('id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug, is_active, status, has_system_access, invitation_status, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .order('full_name', { ascending: true }),
    invitations: supabase
      .from('invitations')
      .select('id, tenant_id, tenant_user_id, collaborator_id, email, profile_role, status, accepted_at, sent_at, created_at, updated_at')
      .eq('tenant_id', tenantId),
    identities: supabase
      .from('identities')
      .select('id, tenant_id, tenant_user_id, collaborator_id, email, full_name, role_slug, status, invitation_status, updated_at')
      .eq('tenant_id', tenantId),
    identityEvents: supabase
      .from('identity_events')
      .select('id, tenant_id, collaborator_id, identity_id, action, created_at')
      .eq('tenant_id', tenantId),
  };

  const [tuRes, invRes, idRes, evRes] = await Promise.all([
    queries.tenantUsers,
    queries.invitations,
    queries.identities,
    queries.identityEvents,
  ]);

  if (tuRes.error) throw tuRes.error;

  return {
    tenantUsers: tuRes.data || [],
    invitations: invRes.error ? [] : (invRes.data || []),
    identities: idRes.error ? [] : (idRes.data || []),
    identityEvents: evRes.error ? [] : (evRes.data || []),
    fetchWarnings: [
      invRes.error ? `invitations: ${invRes.error.message}` : null,
      idRes.error ? `identities: ${idRes.error.message}` : null,
      evRes.error ? `identity_events: ${evRes.error.message}` : null,
    ].filter(Boolean),
  };
}

const SQL_AUDIT = `-- Queries de auditoria (substitua :tenant_id)
SELECT id, tenant_id, collaborator_id, user_id, email, role_slug, invitation_status, status, updated_at
FROM tenant_users WHERE tenant_id = :tenant_id ORDER BY email;

SELECT id, tenant_id, email, collaborator_id, status, profile_role, accepted_at
FROM invitations WHERE tenant_id = :tenant_id ORDER BY email, created_at DESC;

SELECT id, tenant_id, tenant_user_id, email, collaborator_id, role_slug, status
FROM identities WHERE tenant_id = :tenant_id ORDER BY email;

SELECT table_name FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'collaborator_id';
`;

async function runDryRun(args) {
  const supabase = createSupabaseAdmin();
  const { tenantUsers, invitations, identities, identityEvents, fetchWarnings } = await fetchTenantData(supabase, args.tenantId);

  let rhCollaborators = [];
  if (args.rhExport) {
    rhCollaborators = loadRhExport(path.resolve(args.rhExport));
    rhCollaborators = rhCollaborators.filter(
      (c) => String(c.tenant_id || c.tenantId || '') === args.tenantId,
    );
  }

  const plan = buildBackfillPlan({
    tenantUsers,
    invitations,
    identities,
    rhCollaborators,
  });
  plan.tenant_id = args.tenantId;
  plan.rh_export_rows = rhCollaborators.length;
  plan.fetch_warnings = fetchWarnings;
  plan.impact_preview = buildTableImpactPreview(plan, { invitations, identities, identityEvents });
  plan.sql_audit = SQL_AUDIT;
  plan.apply_required_flag = '--apply --confirm APPLY';

  ensureReportsDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(REPORTS_DIR, `collaborator-id-backfill-dryrun-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(plan, null, 2), 'utf8');

  if (args.json) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } else {
    process.stdout.write('\n=== collaborator_id backfill — DRY-RUN (nenhuma alteração aplicada) ===\n\n');
    process.stdout.write(`Tenant: ${args.tenantId}\n`);
    process.stdout.write(`Linhas tenant_users: ${tenantUsers.length}\n`);
    process.stdout.write(`RH export: ${rhCollaborators.length} colaboradores\n`);
    process.stdout.write(`Resumo: ${JSON.stringify(plan.summary)}\n\n`);
    process.stdout.write(`${formatReportTable(plan.rows)}\n\n`);
    if (plan.impact_preview.length > 0) {
      process.stdout.write('Impacto previsto (--apply):\n');
      for (const imp of plan.impact_preview) {
        process.stdout.write(`  ${imp.email}: ${imp.old_collaborator_id} → ${imp.new_collaborator_id} `
          + `(inv=${imp.invitations}, id=${imp.identities}, ev=${imp.identity_events})\n`);
      }
    }
    process.stdout.write(`\nTabelas em escopo: ${COLLABORATOR_ID_TABLES.join(', ')}\n`);
    process.stdout.write(`Relatório salvo: ${reportPath}\n`);
    process.stdout.write('\nPara aplicar após aprovação:\n');
    process.stdout.write(`  node scripts/collaborator-id-backfill.mjs --tenant-id ${args.tenantId}`
      + `${args.rhExport ? ` --rh-export "${args.rhExport}"` : ''} --apply --confirm APPLY\n`);
  }

  return { plan, reportPath };
}

async function runApply(args) {
  if (args.confirm !== 'APPLY') {
    throw new Error('Flag --confirm APPLY é obrigatória para mutações.');
  }

  const { plan, reportPath } = await runDryRun({ ...args, json: false });
  const applicable = (plan.rows || []).filter((r) => r.action === ACTIONS.UPDATE_PROPOSED);
  if (applicable.length === 0) {
    process.stdout.write('\nNenhuma linha UPDATE_PROPOSED — nada a aplicar.\n');
    return;
  }

  const blocked = (plan.rows || []).filter((r) => [ACTIONS.AMBIGUOUS, ACTIONS.CONFLICT].includes(r.action));
  if (blocked.length > 0) {
    throw new Error(
      `Existem ${blocked.length} linha(s) AMBIGUOUS/CONFLICT. Resolva manualmente antes do --apply.`,
    );
  }

  const supabase = createSupabaseAdmin();
  const { tenantUsers, invitations, identities, identityEvents } = await fetchTenantData(supabase, args.tenantId);

  process.stdout.write(`\nAplicando ${applicable.length} atualização(ões)...\n`);
  const result = await applyBackfillPlan(supabase, plan, {
    invitations,
    identities,
    identityEvents,
    onProgress: (p) => {
      if (p.status === 'applied') {
        process.stdout.write(`  ✓ ${p.email}: ${p.oldId} → ${p.newId}\n`);
      } else if (p.status === 'error') {
        process.stdout.write(`  ✗ ${p.email}: ${p.error}\n`);
      }
    },
  });

  ensureReportsDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(REPORTS_DIR, `collaborator-id-backfill-backup-${stamp}.json`);
  const applyReport = {
    applied_at: new Date().toISOString(),
    tenant_id: args.tenantId,
    dry_run_report: reportPath,
    applied: result.applied,
    errors: result.errors,
    backup: result.backup,
    rollback_command: `node scripts/collaborator-id-backfill.mjs --rollback "${backupPath}"`,
  };
  fs.writeFileSync(backupPath, JSON.stringify(applyReport, null, 2), 'utf8');

  process.stdout.write(`\nAplicadas: ${result.applied}\n`);
  if (result.errors.length) {
    process.stdout.write(`Erros: ${result.errors.length}\n`);
    for (const e of result.errors) process.stdout.write(`  - ${e.email}: ${e.message}\n`);
  }
  process.stdout.write(`Backup para rollback: ${backupPath}\n`);
}

async function runRollback(backupPath) {
  const resolved = path.resolve(backupPath);
  if (!fs.existsSync(resolved)) throw new Error(`Backup não encontrado: ${resolved}`);
  const payload = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const entries = payload.backup || payload;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Backup vazio ou formato inválido.');
  }
  const supabase = createSupabaseAdmin();
  const result = await rollbackFromBackup(supabase, entries);
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
    await runRollback(args.rollback);
    process.exit(0);
  }

  if (!args.tenantId) {
    process.stderr.write('Erro: --tenant-id é obrigatório.\n');
    printHelp();
    process.exit(1);
  }

  if (args.apply) {
    await runApply(args);
  } else {
    await runDryRun(args);
    process.stdout.write('\n✓ Confirmação: nenhuma alteração foi aplicada (modo dry-run).\n');
  }
}

main().catch((err) => {
  process.stderr.write(`\nErro: ${err?.message || err}\n`);
  process.exit(1);
});
