/**
 * Phase 9.3A — testes estáticos do runner functional E2E (sem Docker/rede).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHASE_9_3A_DOMAIN_MAP } from '../../scripts/supabase/phase93aDomainMap.mjs';
import { runLocalFunctionalE2eValidation } from '../../scripts/supabase/runLocalFunctionalE2eValidation.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

describe('Phase 9.3A — Artefatos (STATIC)', () => {
  it('fixture e runner existem', () => {
    expect(
      fs.existsSync(path.join(REPO_ROOT, 'supabase-local/fixtures/functional_e2e_validation.sql')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(REPO_ROOT, 'scripts/supabase/runLocalFunctionalE2eValidation.mjs')),
    ).toBe(true);
  });

  it('fixture cobre dois tenants e isolamento cross-tenant', () => {
    const sql = fs.readFileSync(
      path.join(REPO_ROOT, 'supabase-local/fixtures/functional_e2e_validation.sql'),
      'utf8',
    );
    expect(sql).toContain('implanprime-local');
    expect(sql).toContain('clinica-teste-isolada');
    expect(sql).toContain('Implanprime Local');
    expect(sql).toContain('Clínica Teste Isolada');
    expect(sql).toContain('Meta Ads');
    expect(sql).toContain('FUNCTIONAL_E2E_PASS');
    expect(sql).toContain('iso_a_cannot_read_b_lead');
    expect(sql).toContain('iso_b_cannot_read_a_appt');
    expect(sql).toContain('patients_wave1_foundation_present');
    expect(sql).not.toContain('out_of_scope_patients_table_absent');
    expect(sql).toContain('set local role authenticated');
    const sqlNoComments = sql.replace(/--[^\n]*/g, '');
    expect(sqlNoComments).not.toMatch(/--linked|--db-url|db push|supabase link/i);
  });

  it('domain map: patients Wave1 foundation in-scope; budgets/journey fora', () => {
    const patients = PHASE_9_3A_DOMAIN_MAP.find((d) => d.domain === 'patients');
    const budgets = PHASE_9_3A_DOMAIN_MAP.find((d) => d.domain === 'budgets_quotes');
    const journey = PHASE_9_3A_DOMAIN_MAP.find((d) => d.domain === 'patient_journey');
    expect(patients?.inScopeSqlE2e).toBe(true);
    expect(patients?.table).toMatch(/patients/i);
    expect(budgets?.inScopeSqlE2e).toBe(false);
    expect(journey?.inScopeSqlE2e).toBe(false);
    expect(PHASE_9_3A_DOMAIN_MAP.some((d) => d.domain === 'appointments' && d.inScopeSqlE2e)).toBe(true);
  });

  it('package.json expõe functional-e2e', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['supabase:local:functional-e2e']).toContain('runLocalFunctionalE2eValidation');
  });

  it('runner bloqueia sem opt-in e não usa remoto', async () => {
    const src = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts/supabase/runLocalFunctionalE2eValidation.mjs'),
      'utf8',
    );
    expect(src).toContain('remoteActionsExecuted: false');
    expect(src).toContain('docker_exec_psql_local');
    expect(src).not.toContain("'--linked'");
    expect(src).not.toContain("'db', 'push'");

    const report = await runLocalFunctionalE2eValidation({ env: {} });
    expect(report.status).toBe('FUNCTIONAL_E2E_SKIPPED_OPT_IN');
    expect(report.remoteActionsExecuted).toBe(false);
    expect(report.commandsExecuted).toEqual([]);
  });
});
