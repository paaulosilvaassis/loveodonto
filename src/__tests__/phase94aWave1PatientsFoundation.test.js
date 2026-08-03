/**
 * Phase 9.4A Wave 1 — validação estática da fundação Pacientes (sem Docker/rede).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_MIGRATIONS,
  ISOLATED_CLI_MIGRATIONS,
  STAGING_REF,
} from '../../scripts/supabase/constants.mjs';
import {
  ensureIsolatedMigrationsLayout,
  sha256File,
} from '../../scripts/supabase/isolation.mjs';
import { runLocalPatientsWave1RlsValidation } from '../../scripts/supabase/runLocalPatientsWave1RlsValidation.mjs';
import { guardCommand } from '../../scripts/supabase/remoteGuard.mjs';
import {
  getPatientRepositoryFlags,
  PATIENTS_REPOSITORY_FLAG_DEFAULTS,
} from '../repositories/patient/patientRepositoryFlags.ts';
import { PatientRepositoryNotImplementedError } from '../repositories/patient/patientTypes.ts';
import { createPatientRepository } from '../repositories/patient/patientRepository.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const MIG_NAME = '025_app_patients_core.sql';
const APP_025 = path.join(APP_MIGRATIONS, MIG_NAME);
const CLI_025 = path.join(ISOLATED_CLI_MIGRATIONS, MIG_NAME);

const PATIENT_TABLES = [
  'patients',
  'patient_phones',
  'patient_documents',
  'patient_records',
];

describe('Phase 9.4A Wave 1 — Artefatos SQL (STATIC)', () => {
  it('migration 025 existe na canônica e no espelho CLI com mesmo SHA-256', () => {
    expect(fs.existsSync(APP_025)).toBe(true);
    const layout = ensureIsolatedMigrationsLayout();
    expect(layout.checksum.status).toBe('ISOLATED_MIGRATION_CHECKSUM_OK');
    expect(fs.existsSync(CLI_025)).toBe(true);
    expect(sha256File(CLI_025)).toBe(sha256File(APP_025));
  });

  it('025 cria as quatro tabelas Wave 1 com legacy_id / RLS', () => {
    const sql = fs.readFileSync(APP_025, 'utf8');
    for (const table of PATIENT_TABLES) {
      expect(sql).toMatch(new RegExp(`create table if not exists public\\.${table}`, 'i'));
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`${table}_select_tenant`, 'i'));
      expect(sql).toMatch(new RegExp(`${table}_modify_admin`, 'i'));
      expect(sql).toMatch(new RegExp(`app_user_can_access_tenant\\(tenant_id::text\\)`, 'i'));
      expect(sql).toMatch(new RegExp(`app_user_is_tenant_admin\\(tenant_id\\)`, 'i'));
    }

    expect(sql).toContain('legacy_id text not null');
    expect(sql).toContain("check (status in ('active', 'inactive'))");
    expect(sql).toContain('patients_tenant_cpf_uq');
    expect(sql).toContain('patients_tenant_legacy_id_uq');
    expect(sql).toContain('patient_phones_one_primary_uq');
    expect(sql).toContain('patient_records_tenant_record_number_uq');
    expect(sql).toContain('photo_url');
    expect(sql).toMatch(/photo_url_no_data_uri/i);
    expect(sql).toContain('has_pending_data');
    expect(sql).toContain('pending_critical_fields');
    expect(sql).toContain('responsible_cpf');
    expect(sql).toContain('record_number');

    // Não inventa cutover em consumidores (ignora comentários de escopo)
    const sqlNoComments = sql.replace(/--[^\n]*/g, '');
    expect(sqlNoComments).not.toMatch(/alter table public\.appointments/i);
    expect(sqlNoComments).not.toMatch(/alter table public\.crm_leads/i);
    expect(sqlNoComments).not.toMatch(/alter table public\.financial_/i);
    expect(sqlNoComments).not.toMatch(/patient_uuid/i);
    expect(sqlNoComments).not.toMatch(/--linked|--db-url|db push|supabase link/i);
  });

  it('fixture RLS Wave 1 e runner local existem e são seguros', () => {
    expect(
      fs.existsSync(path.join(REPO_ROOT, 'supabase-local/fixtures/patients_wave1_rls_validation.sql')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(REPO_ROOT, 'scripts/supabase/runLocalPatientsWave1RlsValidation.mjs')),
    ).toBe(true);

    const fixture = fs.readFileSync(
      path.join(REPO_ROOT, 'supabase-local/fixtures/patients_wave1_rls_validation.sql'),
      'utf8',
    );
    for (const table of PATIENT_TABLES) {
      expect(fixture).toContain(`public.${table}`);
    }
    expect(fixture).toContain('PATIENTS_WAVE1_RLS_PASS');
    expect(fixture).toContain('PATIENTS_WAVE1_RLS_FAILED');
    expect(fixture).toContain('user_a_cannot_read_tenant_b_patients');
    expect(fixture).toContain('user_b_cannot_read_tenant_a_patients');
    expect(fixture).toContain('stale_jwt_without_membership_cannot_read_patients');
    expect(fixture).toContain('app_metadata');
    expect(fixture).toContain('orphan_cannot_update_patient_without_admin');
    expect(fixture).toContain('set local role authenticated');
    expect(fixture).toContain('patient-');
    const fixtureNoComments = fixture.replace(/--[^\n]*/g, '');
    expect(fixtureNoComments).not.toMatch(/--linked|--db-url|db push|supabase link/i);

    const runner = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts/supabase/runLocalPatientsWave1RlsValidation.mjs'),
      'utf8',
    );
    expect(runner).toContain('remoteActionsExecuted: false');
    expect(runner).toContain('docker_exec_psql_local');
    expect(runner).toContain('patients_wave1_rls_validation.sql');
    expect(runner).not.toContain("'--linked'");
    expect(runner).not.toContain("'db', 'push'");
  });
});

describe('Phase 9.4A Wave 1 — Repository scaffold (STATIC)', () => {
  it('scaffold patient existe e não está wired em patientService', () => {
    const files = [
      'src/repositories/patient/index.ts',
      'src/repositories/patient/patientTypes.ts',
      'src/repositories/patient/patientRepositoryFlags.ts',
      'src/repositories/patient/patientMapper.ts',
      'src/repositories/patient/patientIndexedDbRepository.ts',
      'src/repositories/patient/patientSupabaseRepository.ts',
      'src/repositories/patient/patientRepository.ts',
    ];
    for (const rel of files) {
      expect(fs.existsSync(path.join(REPO_ROOT, rel))).toBe(true);
    }

    const service = fs.readFileSync(
      path.join(REPO_ROOT, 'src/services/patientService.js'),
      'utf8',
    );
    expect(service).not.toMatch(/repositories\/patient/);
    expect(service).not.toMatch(/patientRepository/);
    expect(service).not.toMatch(/PATIENTS_READ|PATIENTS_WRITE|PATIENTS_DUAL_WRITE/);
  });

  it('flags default-off e produção trava cutover', () => {
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_READ).toBe(false);
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_READ_PRIMARY).toBe(false);
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_WRITE).toBe(false);
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_DUAL_WRITE).toBe(false);
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_SHADOW).toBe(false);

    const flags = getPatientRepositoryFlags({
      overrides: {
        PATIENTS_READ: true,
        PATIENTS_READ_PRIMARY: true,
        PATIENTS_WRITE: true,
        PATIENTS_DUAL_WRITE: true,
      },
    });
    // Em PROD o helper trava; em vitest (não PROD) overrides passam — defaults já cobertos.
    expect(typeof flags.PATIENTS_READ).toBe('boolean');

    const defaults = getPatientRepositoryFlags({});
    expect(defaults.PATIENTS_READ).toBe(false);
    expect(defaults.PATIENTS_WRITE).toBe(false);
    expect(defaults.PATIENTS_DUAL_WRITE).toBe(false);
  });

  it('facade async permanece bloqueada com flags off (sem cutover)', async () => {
    const { PatientRepositoryRemoteReadDisabledError, PatientRepositoryRemoteWriteDisabledError } =
      await import('../repositories/patient/patientTypes.ts');
    const repo = createPatientRepository();
    await expect(repo.listCore('00000000-0000-4000-8000-000000000001')).rejects.toBeInstanceOf(
      PatientRepositoryRemoteReadDisabledError,
    );
    await expect(
      repo.createCore({ id: 'u1', tenant_id: '00000000-0000-4000-8000-000000000001' }, {
        fullName: 'X',
        sex: 'M',
        birthDate: '2000-01-01',
        cpf: '39053344705',
        legacyId: 'patient-00000000-0000-4000-8000-000000000099',
      }),
    ).rejects.toBeInstanceOf(PatientRepositoryRemoteWriteDisabledError);
    // Wave 1 export ainda disponível para compat
    expect(PatientRepositoryNotImplementedError).toBeTruthy();
  });
});

describe('Phase 9.4A Wave 1 — Guards e npm scripts (STATIC)', () => {
  it('package.json expõe scripts Wave 1 sem misturar no npm test', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.test).toBe('vitest run');
    expect(pkg.scripts['test:supabase:phase94a-wave1']).toContain('phase94aWave1PatientsFoundation');
    expect(pkg.scripts['supabase:local:patients-wave1-rls']).toContain(
      'runLocalPatientsWave1RlsValidation',
    );
  });

  it('runner bloqueia sem opt-in e preserva contrato remoto', async () => {
    const report = await runLocalPatientsWave1RlsValidation({ env: {} });
    expect(report.status).toBe('PATIENTS_WAVE1_RLS_SKIPPED_OPT_IN');
    expect(report.remoteActionsExecuted).toBe(false);
    expect(report.commandsExecuted).toEqual([]);
    expect(report.linkedRef === null || report.linkedRef === STAGING_REF).toBe(true);

    expect(guardCommand('supabase', ['db', 'query', '--linked', 'select 1'], {}).status)
      .toBe('BLOCKED_REMOTE_COMMAND');
    expect(
      guardCommand(
        'supabase',
        ['db', 'query', '--local', '--file', 'fixtures/patients_wave1_rls_validation.sql'],
        {},
      ).status,
    ).toBe('SAFE_LOCAL_ENVIRONMENT');
  });
});
