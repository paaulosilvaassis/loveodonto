#!/usr/bin/env node
/**
 * Seed anonimizado Implanprime → staging (tckdjyunwmdpqmewrwvt).
 *
 * SEMPRE dry-run por padrão. Mutações somente com --apply --confirm APPLY.
 * ABORT se SUPABASE URL apontar para produção (uoepkwhqztmsjnzirpev).
 *
 * Credenciais staging (obrigatórias para dry-run/apply):
 *   STAGING_SUPABASE_URL=https://tckdjyunwmdpqmewrwvt.supabase.co
 *   STAGING_SUPABASE_SERVICE_ROLE_KEY=<service_role staging>
 *
 * Dry-run:
 *   node scripts/staging-seed-implanprime.mjs
 *
 * Apply:
 *   node scripts/staging-seed-implanprime.mjs --apply --confirm APPLY
 *
 * Reutilizar tenant_id do relatório dry-run:
 *   node scripts/staging-seed-implanprime.mjs --tenant-id <uuid> --apply --confirm APPLY
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  STAGING_PROJECT_REF,
  PROD_PROJECT_REF,
  assertStagingSupabaseUrl,
  assertNewStagingTenantId,
  buildApplyCommand,
  buildRhBackfillDryRunCommand,
  buildSeedPlan,
  applySeedPlan,
  validatePreApply,
} from '../server/lib/stagingSeedImplanprime.js';
import { parseEnvFile, REPO_ROOT } from './preflight-local.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(REPO_ROOT, 'scripts', 'reports');

function loadMergedEnv() {
  return {
    ...parseEnvFile(path.join(REPO_ROOT, 'server', '.env')),
    ...parseEnvFile(path.join(REPO_ROOT, 'server', '.env.local')),
    ...parseEnvFile(path.join(REPO_ROOT, '.env')),
    ...parseEnvFile(path.join(REPO_ROOT, '.env.local')),
    ...process.env,
  };
}

function parseArgs(argv) {
  const args = {
    apply: false,
    confirm: null,
    tenantId: null,
    supabaseUrl: null,
    serviceRoleKey: null,
    json: false,
    help: false,
    rhExport: './collaborators-export.json',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--tenant-id') args.tenantId = argv[++i];
    else if (arg === '--confirm') args.confirm = argv[++i];
    else if (arg === '--supabase-url') args.supabaseUrl = argv[++i];
    else if (arg === '--service-role-key') args.serviceRoleKey = argv[++i];
    else if (arg === '--rh-export') args.rhExport = argv[++i];
  }
  return args;
}

function printHelp() {
  process.stdout.write(`
staging-seed-implanprime — snapshot mínimo anonimizado (staging only)

Guard rails:
  • URL deve conter ${STAGING_PROJECT_REF}
  • ABORT se URL contiver ${PROD_PROJECT_REF}
  • tenant_id novo (nunca o UUID de produção Implanprime)
  • Não aplica migration 018

Credenciais (preferir variáveis dedicadas staging):
  STAGING_SUPABASE_URL
  STAGING_SUPABASE_SERVICE_ROLE_KEY

Flags:
  --tenant-id <uuid>       Fixar UUID do tenant (dry-run + apply)
  --supabase-url <url>     Override URL (deve ser staging)
  --service-role-key <key> Override service role staging
  --rh-export <path>       Caminho export RH pós-seed (default: ./collaborators-export.json)
  --apply --confirm APPLY  Aplica mutações

Dry-run (padrão):
  node scripts/staging-seed-implanprime.mjs

Apply staging:
  node scripts/staging-seed-implanprime.mjs --apply --confirm APPLY

`);
}

function resolveSupabaseConfig(args) {
  const env = loadMergedEnv();
  const url = String(
    args.supabaseUrl
    || env.STAGING_SUPABASE_URL
    || '',
  ).trim();
  const key = String(
    args.serviceRoleKey
    || env.STAGING_SUPABASE_SERVICE_ROLE_KEY
    || '',
  ).trim();

  if (!url || !key) {
    throw new Error(
      'STAGING_SUPABASE_URL e STAGING_SUPABASE_SERVICE_ROLE_KEY são obrigatórios.\n'
      + 'Não use SUPABASE_URL de produção — defina credenciais staging dedicadas.',
    );
  }

  const projectRef = assertStagingSupabaseUrl(url);
  return { url, key, projectRef };
}

function createSupabaseAdmin(config) {
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

function writeReport(filename, payload) {
  ensureReportsDir();
  const reportPath = path.join(REPORTS_DIR, filename);
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2), 'utf8');
  return reportPath;
}

async function runDryRun(args, config) {
  const supabase = createSupabaseAdmin(config);
  const tenantId = args.tenantId || randomUUID();
  assertNewStagingTenantId(tenantId);

  const plan = buildSeedPlan({ tenantId });
  const preApply = await validatePreApply(supabase, plan);

  const report = {
    ...plan,
    mode: 'dry-run',
    supabase_project_ref: config.projectRef,
    supabase_url_host: `${config.projectRef}.supabase.co`,
    prod_touched: false,
    migration_018_applied: false,
    pre_apply_validation: preApply,
    apply_gate: {
      ok: preApply.ok,
      blocking_count: preApply.issues.length,
      issues: preApply.issues,
    },
    apply_command: buildApplyCommand(tenantId),
    next_steps: {
      rh_backfill_dry_run: buildRhBackfillDryRunCommand(tenantId, args.rhExport),
    },
    test_users: plan.users.map((u) => ({
      key: u.key,
      email: u.email,
      collaborator_id: u.collaborator_id,
      collaborator_id_alignment: u.collaborator_id_alignment,
      export_legacy_id: u.export_legacy_id || u.collaborator_id,
    })),
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = writeReport(`staging-seed-implanprime-${stamp}.json`, report);

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write('\n=== Staging seed Implanprime — DRY-RUN ===\n\n');
    process.stdout.write(`Projeto: ${config.projectRef} (staging)\n`);
    process.stdout.write(`Tenant planejado: ${tenantId}\n`);
    process.stdout.write(`Clinic code: ${plan.tenant.clinic_code}\n\n`);
    process.stdout.write(`Resumo: ${JSON.stringify(plan.summary)}\n`);
    process.stdout.write(`Cenário alinhado (legacy export): ${plan.scenario.aligned_collaborator_id.join(', ')}\n`);
    process.stdout.write(`Cenário divergente (link e-mail): ${plan.scenario.divergent_collaborator_id.join(', ')}\n\n`);
    process.stdout.write('Usuários de teste (senha no apply: StagingTest2026!):\n');
    for (const u of report.test_users) {
      process.stdout.write(
        `  • ${u.key}: ${u.email} | collaborator_id=${u.collaborator_id} (${u.collaborator_id_alignment})\n`,
      );
    }
    process.stdout.write(`\nGate apply: ${report.apply_gate.ok ? 'LIBERADO' : 'BLOQUEADO'}\n`);
    if (!report.apply_gate.ok) {
      for (const issue of preApply.issues) {
        process.stdout.write(`  ✗ [${issue.scope}] ${issue.message}\n`);
      }
    }
    process.stdout.write(`\nRelatório: ${reportPath}\n`);
    process.stdout.write(`\nApply:\n  ${report.apply_command}\n`);
    process.stdout.write(`\nPróximo passo (backfill dry-run):\n  ${report.next_steps.rh_backfill_dry_run}\n`);
  }

  return { report, reportPath, preApply };
}

async function runApply(args, config) {
  if (args.confirm !== 'APPLY') {
    throw new Error('Mutações exigem --apply --confirm APPLY');
  }

  const { report, reportPath, preApply } = await runDryRun(args, config);
  if (!preApply.ok) {
    throw new Error(`Apply bloqueado. Corrija issues e reexecute. Relatório: ${reportPath}`);
  }

  const supabase = createSupabaseAdmin(config);
  process.stdout.write(`\nAplicando seed no staging ${config.projectRef}...\n`);

  const applied = await applySeedPlan(supabase, report);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const applyReportPath = writeReport(`staging-seed-implanprime-applied-${stamp}.json`, {
    mode: 'apply',
    applied_at: new Date().toISOString(),
    dry_run_report: reportPath,
    supabase_project_ref: config.projectRef,
    prod_touched: false,
    migration_018_applied: false,
    tenant_id: report.tenant_id,
    applied,
    rh_backfill_dry_run: buildRhBackfillDryRunCommand(report.tenant_id, args.rhExport),
  });

  process.stdout.write(`\n✓ Seed aplicado.\n`);
  process.stdout.write(`Tenant: ${report.tenant_id}\n`);
  process.stdout.write(`Auth users: ${applied.auth_users.length}\n`);
  process.stdout.write(`tenant_users: ${applied.tenant_users.length}\n`);
  process.stdout.write(`Relatório apply: ${applyReportPath}\n`);
  process.stdout.write(`\nBackfill RH (dry-run):\n  ${buildRhBackfillDryRunCommand(report.tenant_id, args.rhExport)}\n`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const config = resolveSupabaseConfig(args);

  if (args.apply) {
    await runApply(args, config);
  } else {
    await runDryRun(args, config);
    process.stdout.write('\n✓ Nenhuma alteração aplicada (dry-run).\n');
  }
}

main().catch((err) => {
  process.stderr.write(`\nErro: ${err?.message || err}\n`);
  process.exit(1);
});
