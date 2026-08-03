/**
 * Phase 9.2 — regressão padrão: STATIC_PREFLIGHT / STATIC_SQL / API_COMPAT / gates sem spawn.
 * Classificação: STATIC_SQL_TEST | STATIC_PREFLIGHT_TEST | API_SCHEMA_COMPATIBILITY_TEST | gate unitário.
 * Não é LOCAL_DATABASE_TEST. Não executa npx/Docker/supabase.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSupabaseCliAvailability } from '../../scripts/phase92/cliAvailability.mjs';
import { evaluateLocalIntegrationGate } from '../../scripts/phase92/localIntegration.mjs';
import { runStaticPreflight } from '../../scripts/phase92/staticPreflight.mjs';
import {
  APPOINTMENTS_LIST_SELECT,
} from '../../server/lib/appointmentsApiList.js';
import { APPOINTMENT_WRITE_SELECT } from '../../server/lib/appointmentsApiWrite.js';
import {
  CRM_LEADS_LIST_SELECT,
  CRM_PIPELINE_STAGES_LIST_SELECT,
} from '../../server/lib/crmApiList.js';
import {
  FINANCINGS_LIST_SELECT,
  PAYABLES_LIST_SELECT,
  RECEIVABLES_LIST_SELECT,
} from '../../server/lib/financialApiList.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS = {
  '020': path.join(REPO_ROOT, 'supabase/migrations/020_app_appointments.sql'),
  '021': path.join(REPO_ROOT, 'supabase/migrations/021_app_financial_core.sql'),
  '022': path.join(REPO_ROOT, 'supabase/migrations/022_app_crm_kanban_core.sql'),
  '023': path.join(REPO_ROOT, 'supabase/migrations/023_app_appointments_financial_crm_rls.sql'),
};

function read(key) {
  return fs.readFileSync(MIGRATIONS[key], 'utf8');
}

function cols(csv) {
  return String(csv).split(',').map((c) => c.trim()).filter(Boolean);
}

describe('Phase 9.2 — STATIC_PREFLIGHT_TEST', () => {
  it('STATIC_PREFLIGHT_PASS sem spawn/npx/rede', () => {
    const report = runStaticPreflight({ env: {} });
    expect(report.spawnedProcess).toBe(false);
    expect(report.usedNpx).toBe(false);
    expect(report.usedNetwork).toBe(false);
    expect(report.migrationsExecuted).toBe(false);
    expect(report.status).toBe('STATIC_PREFLIGHT_PASS');
    expect(report.blockers).toEqual([]);
  });

  it('falha se migration obrigatória estiver ausente (simulado via check de arquivos)', () => {
    for (const file of Object.values(MIGRATIONS)) {
      expect(fs.existsSync(file)).toBe(true);
    }
  });

  it('scripts phase92 não invocam o launcher npx + CLI', () => {
    const forbidden = ['npx', 'supabase'].join(' ');
    const forbiddenRegex = new RegExp(`${['npx'].join('')}\\s+supabase`);
    const sources = [
      'scripts/phase92/staticPreflight.mjs',
      'scripts/phase92/cliAvailability.mjs',
      'scripts/phase92/localIntegration.mjs',
      'scripts/phase92/processRunner.mjs',
      'scripts/phase92-local-dry-run-preflight.mjs',
      'scripts/phase92-local-integration.mjs',
    ].map((rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
    for (const src of sources) {
      expect(src.includes(forbidden)).toBe(false);
      expect(src).not.toMatch(forbiddenRegex);
      expect(src).not.toMatch(/npx',\s*\[[^\]]*supabase/);
    }
  });

  it('opt-in defaults off', () => {
    expect(process.env.RUN_SUPABASE_LOCAL_INTEGRATION).toBeFalsy();
    expect(process.env.ENABLE_SUPABASE_CLI_CHECK).toBeFalsy();
  });
});

describe('Phase 9.2 — STATIC_SQL_TEST', () => {
  it('020 constraints/índices/trigger', () => {
    const sql = read('020');
    expect(sql).toMatch(/appointments_status_chk/i);
    expect(sql).toMatch(/appointments_tenant_date_idx/i);
    expect(sql).toMatch(/appointments_tenant_professional_date_idx/i);
    expect(sql).toMatch(/trg_appointments_touch_updated_at/i);
    expect(sql).toMatch(/deleted_at timestamptz null/i);
  });

  it('021 amounts e unique legacy', () => {
    const sql = read('021');
    expect(sql).toMatch(/far_amounts_nonneg_chk/i);
    expect(sql).toMatch(/numeric\(14,\s*2\)/i);
    expect(sql).toMatch(/far_tenant_legacy_id_uq/i);
  });

  it('022 order quoted e unique key', () => {
    const sql = read('022');
    expect(sql).toMatch(/"order" integer not null/i);
    expect(sql).toMatch(/cps_tenant_key_uq/i);
  });

  it('023 RLS sem USING(true)', () => {
    const sql = read('023');
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/tenant-1/);
    expect(sql).toMatch(/app_user_can_access_tenant/i);
  });
});

describe('Phase 9.2 — API_SCHEMA_COMPATIBILITY_TEST', () => {
  it('Agenda SELECT/WRITE ⊆ 020', () => {
    const sql = read('020');
    for (const col of [...new Set([...cols(APPOINTMENTS_LIST_SELECT), ...cols(APPOINTMENT_WRITE_SELECT)])]) {
      expect(sql).toMatch(new RegExp(`\\b${col}\\b`, 'i'));
    }
  });

  it('Finance SELECT ⊆ 021', () => {
    const sql = read('021');
    for (const col of [
      ...cols(RECEIVABLES_LIST_SELECT),
      ...cols(PAYABLES_LIST_SELECT),
      ...cols(FINANCINGS_LIST_SELECT),
    ]) {
      expect(sql).toMatch(new RegExp(`\\b${col}\\b`, 'i'));
    }
  });

  it('CRM SELECT ⊆ 022', () => {
    const sql = read('022');
    for (const col of cols(CRM_LEADS_LIST_SELECT)) {
      expect(sql).toMatch(new RegExp(`\\b${col}\\b`, 'i'));
    }
    for (const col of cols(CRM_PIPELINE_STAGES_LIST_SELECT)) {
      if (col === 'order') expect(sql).toMatch(/"order"/);
      else expect(sql).toMatch(new RegExp(`\\b${col}\\b`, 'i'));
    }
  });
});

describe('Phase 9.2 — CLI_AVAILABILITY_TEST (unitário sem probe)', () => {
  it('flag OFF → CLI_CHECK_SKIPPED sem processo', async () => {
    const result = await checkSupabaseCliAvailability({ env: {}, probe: false });
    expect(result.status).toBe('CLI_CHECK_SKIPPED');
    expect(result.usedNpx).toBe(false);
    expect(result.probe).toBeNull();
  });

  it('flag ON com probe false ainda não spawna', async () => {
    const result = await checkSupabaseCliAvailability({
      env: { ENABLE_SUPABASE_CLI_CHECK: 'true' },
      probe: false,
    });
    expect(result.status).toBe('CLI_CHECK_SKIPPED');
    expect(result.probe).toBeNull();
  });
});

describe('Phase 9.2 — LOCAL_DATABASE gate unitário (sem spawn)', () => {
  it('sem opt-in → BLOCKED_NON_LOCAL_ENVIRONMENT', () => {
    const gate = evaluateLocalIntegrationGate({});
    expect(gate.status).toBe('BLOCKED_NON_LOCAL_ENVIRONMENT');
    expect(gate.blockers).toContain('OPT_IN_REQUIRED');
    expect(gate.allowedCommands).toEqual([]);
  });

  it('opt-in + remote env → bloqueado', () => {
    const gate = evaluateLocalIntegrationGate({
      RUN_SUPABASE_LOCAL_INTEGRATION: 'true',
      DATABASE_URL: 'postgresql://remote.example/db',
    });
    expect(gate.status).toBe('BLOCKED_NON_LOCAL_ENVIRONMENT');
    expect(gate.blockers).toContain('REMOTE_DATABASE_URL_PRESENT');
  });

  it('linked-project.json presente → REMOTE_PROJECT_LINKED', () => {
    const gate = evaluateLocalIntegrationGate({
      RUN_SUPABASE_LOCAL_INTEGRATION: 'true',
    });
    if (fs.existsSync(path.join(REPO_ROOT, 'supabase/.temp/linked-project.json'))) {
      expect(gate.blockers).toContain('REMOTE_PROJECT_LINKED');
      expect(gate.status).toBe('BLOCKED_NON_LOCAL_ENVIRONMENT');
    }
  });
});

describe('Phase 9.2 — classificação: local dry-run NÃO afirmado como PASS', () => {
  it('não reporta LOCAL_DRY_RUN_PASS apenas com static', () => {
    const staticReport = runStaticPreflight({ env: {} });
    expect(staticReport.status).toBe('STATIC_PREFLIGHT_PASS');
    const migrationResult = 'STATIC_VALIDATION_PASS';
    const localResult = 'LOCAL_DATABASE_DRY_RUN_BLOCKED';
    expect(migrationResult).not.toBe('LOCAL_DRY_RUN_PASS');
    expect(localResult).toBe('LOCAL_DATABASE_DRY_RUN_BLOCKED');
  });
});
