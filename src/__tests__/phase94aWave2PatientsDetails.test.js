/**
 * Phase 9.4A Wave 2 — testes estáticos (migration 027, repository, mappers, guards).
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
import { guardCommand } from '../../scripts/supabase/remoteGuard.mjs';
import { runLocalPatientsWave2RlsValidation } from '../../scripts/supabase/runLocalPatientsWave2RlsValidation.mjs';
import {
  PATIENTS_REPOSITORY_FLAG_DEFAULTS,
  getPatientRepositoryFlags,
} from '../repositories/patient/patientRepositoryFlags.ts';
import { createPatientRepository } from '../repositories/patient/patientRepository.ts';
import { createPatientSupabaseRepository } from '../repositories/patient/patientSupabaseRepository.ts';
import {
  mapBirthCoreToLegacy,
  mapBirthLegacyToCore,
  mapBirthSupabaseToCore,
  mapAddressLegacyToCore,
  mapAddressSupabaseToCore,
  mapCoreToIndexedDbMirror,
  mapLegacyRowToPatientCore,
  mapSupabaseRowToPatientCore,
} from '../repositories/patient/patientMapper.ts';
import { PatientRepositoryRemoteReadDisabledError } from '../repositories/patient/patientTypes.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MIG = '027_app_patient_details.sql';
const APP_027 = path.join(APP_MIGRATIONS, MIG);
const CLI_027 = path.join(ISOLATED_CLI_MIGRATIONS, MIG);

const WAVE2_TABLES = [
  'patient_birth_details',
  'patient_education',
  'patient_addresses',
  'patient_relationships',
  'patient_insurances',
  'patient_access',
  'patient_activity_summary',
];

const REQUIRED_OPS = [
  'listPatients',
  'getPatientById',
  'getPatientByLegacyId',
  'searchPatients',
  'createPatient',
  'updatePatient',
  'softDeletePatient',
  'listPatientPhones',
  'createPatientPhone',
  'updatePatientPhone',
  'removePatientPhone',
  'getPatientDocuments',
  'upsertPatientDocuments',
  'getPatientRecord',
  'upsertPatientRecord',
  'getPatientBirthDetails',
  'upsertPatientBirthDetails',
  'getPatientEducation',
  'upsertPatientEducation',
  'listPatientAddresses',
  'createPatientAddress',
  'updatePatientAddress',
  'removePatientAddress',
  'getPatientRelationships',
  'upsertPatientRelationships',
  'listPatientInsurances',
  'createPatientInsurance',
  'updatePatientInsurance',
  'removePatientInsurance',
  'getPatientAccess',
  'upsertPatientAccess',
  'getPatientActivitySummary',
  'upsertPatientActivitySummary',
  'getPatientBundle',
];

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

describe('Phase 9.4A Wave 2 — Migration 027 (STATIC)', () => {
  it('027 existe na canônica e no espelho CLI com mesmo SHA-256', () => {
    expect(fs.existsSync(APP_027)).toBe(true);
    const layout = ensureIsolatedMigrationsLayout();
    expect(layout.checksum.status).toBe('ISOLATED_MIGRATION_CHECKSUM_OK');
    expect(fs.existsSync(CLI_027)).toBe(true);
    expect(sha256File(CLI_027)).toBe(sha256File(APP_027));
  });

  it('027 cria tabelas Wave 2 com cardinalidade, FK, RLS e policies', () => {
    const sql = read(`supabase/migrations/${MIG}`);
    for (const table of WAVE2_TABLES) {
      expect(sql).toMatch(new RegExp(`create table if not exists public\\.${table}`, 'i'));
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`force row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`${table}_select_tenant`, 'i'));
      expect(sql).toMatch(new RegExp(`${table}_modify_admin`, 'i'));
      expect(sql).toContain('app_user_can_access_tenant');
      expect(sql).toContain('app_user_is_tenant_admin');
    }
    expect(sql).toContain('patient_birth_details_tenant_patient_uq');
    expect(sql).toContain('patient_education_tenant_patient_uq');
    expect(sql).toContain('patient_addresses_one_primary_uq');
    expect(sql).toContain('patient_relationships_tenant_patient_uq');
    expect(sql).toContain('patient_access_tenant_patient_uq');
    expect(sql).toContain('patient_activity_summary_tenant_patient_uq');
    expect(sql).toMatch(/grant select, insert, update on table public\.patient_addresses/i);
    expect(sql).not.toMatch(/grant[^;]*delete on table public\.patient_addresses/i);
    expect(sql).toContain('tenant_id é imutável');
    expect(sql).toContain('deve coincidir com patients.tenant_id');

    const noComments = sql.replace(/--[^\n]*/g, '');
    expect(noComments).not.toMatch(/--linked|--db-url|db push|supabase link/i);
    expect(noComments).not.toMatch(/create table if not exists public\.patient_charts/i);
    expect(noComments).not.toMatch(/create table if not exists public\.budgets/i);
  });
});

describe('Phase 9.4A Wave 2 — Repository + mappers (STATIC)', () => {
  it('repository Supabase implementa operações e não é stub', () => {
    const src = read('src/repositories/patient/patientSupabaseRepository.ts');
    expect(src).not.toContain('PatientRepositoryNotImplementedError');
    expect(src).toContain('supabaseAppClient');
    const srcNoComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(srcNoComments).not.toMatch(/SERVICE_ROLE|service_role|serviceRole/i);
    expect(srcNoComments).not.toMatch(/indexedDb|loadDb|patientService/i);
    for (const op of REQUIRED_OPS) {
      expect(src).toContain(op);
    }
    const repo = createPatientSupabaseRepository({
      client: {
        from() {
          throw new Error('mock-not-used-in-this-assert');
        },
      },
    });
    for (const op of REQUIRED_OPS) {
      expect(typeof repo[op]).toBe('function');
    }
  });

  it('repository rejeita tenant UI divergente e exige tenant', async () => {
    const calls = [];
    const client = {
      from(table) {
        const api = {
          select() { return api; },
          insert(row) { calls.push({ table, row }); return api; },
          update() { return api; },
          eq() { return api; },
          is() { return api; },
          order() { return Promise.resolve({ data: [], error: null }); },
          maybeSingle() { return Promise.resolve({ data: null, error: null }); },
          single() {
            return Promise.resolve({
              data: {
                id: '11111111-1111-4111-8111-111111111111',
                tenant_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
                legacy_id: 'patient-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
                guid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
                full_name: 'Test',
                nickname: '',
                social_name: '',
                sex: 'M',
                birth_date: '2000-01-01',
                cpf: '39053344705',
                photo_url: null,
                status: 'active',
                blocked: false,
                block_reason: '',
                block_at: null,
                tags: [],
                lead_source: '',
                has_financial_responsible: false,
                dependent_full_name: '',
                has_pending_data: false,
                pending_fields: [],
                pending_critical_fields: [],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                created_by: null,
                updated_by: null,
                deleted_at: null,
              },
              error: null,
            });
          },
        };
        return api;
      },
    };
    const repo = createPatientSupabaseRepository({ client });
    await expect(
      repo.createPatient('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', {
        tenant_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
        legacy_id: 'patient-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        full_name: 'X',
      }),
    ).rejects.toThrow(/tenant_id do payload/);

    await expect(repo.listPatients('')).rejects.toThrow(/tenant_id/);
  });

  it('mappers preservam legacy_id e round-trip birth/address', () => {
    const tenant = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    const legacyPatient = 'patient-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    const idb = {
      id: legacyPatient,
      tenant_id: tenant,
      guid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      full_name: 'Ana',
      nickname: 'A',
      social_name: '',
      sex: 'F',
      birth_date: '1990-01-01',
      cpf: '390.533.447-05',
      status: 'active',
      blocked: false,
      tags: ['vip'],
      hasPendingData: false,
      pendingFields: [],
      pendingCriticalFields: [],
      created_at: '2020-01-01T00:00:00.000Z',
      updated_at: '2020-01-02T00:00:00.000Z',
    };
    const core = mapLegacyRowToPatientCore(idb, { uuid: '11111111-1111-4111-8111-111111111111' });
    expect(core.legacyId).toBe(legacyPatient);
    expect(core.cpf).toBe('39053344705');
    const mirror = mapCoreToIndexedDbMirror(core);
    expect(mirror.id).toBe(legacyPatient);
    expect(mirror.tenant_id).toBe(tenant);

    const birthLegacy = { patient_id: legacyPatient, nationality: 'BR', birth_city: 'SP', birth_state: 'sp' };
    const birthCore = mapBirthLegacyToCore(birthLegacy, core.uuid, tenant);
    const birthSql = mapBirthSupabaseToCore({
      id: '22222222-2222-4222-8222-222222222222',
      tenant_id: tenant,
      patient_id: core.uuid,
      nationality: birthCore.nationality,
      birth_city: birthCore.birthCity,
      birth_state: birthCore.birthState,
      created_at: '2020-01-01T00:00:00.000Z',
      updated_at: '2020-01-01T00:00:00.000Z',
      deleted_at: null,
    });
    const back = mapBirthCoreToLegacy(birthSql, legacyPatient);
    expect(back.patient_id).toBe(legacyPatient);
    expect(back.birth_state).toBe('SP');

    const addrLegacy = {
      id: 'addr-1',
      patient_id: legacyPatient,
      cep: '01310-100',
      city: 'São Paulo',
      state: 'sp',
      is_primary: true,
    };
    const addrCore = mapAddressLegacyToCore(addrLegacy, core.uuid, tenant);
    expect(addrCore.legacyId).toBe('addr-1');
    expect(addrCore.cep).toBe('01310100');
    const addrSql = mapAddressSupabaseToCore({
      id: '33333333-3333-4333-8333-333333333333',
      tenant_id: tenant,
      patient_id: core.uuid,
      legacy_id: 'addr-1',
      type: '',
      cep: '01310100',
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: 'São Paulo',
      state: 'SP',
      is_primary: true,
      created_at: '2020-01-01T00:00:00.000Z',
      updated_at: '2020-01-01T00:00:00.000Z',
      deleted_at: null,
    });
    expect(addrSql.legacyId).toBe('addr-1');
    expect(mapSupabaseRowToPatientCore({
      id: core.uuid,
      tenant_id: tenant,
      legacy_id: legacyPatient,
      guid: core.guid,
      full_name: core.fullName,
      nickname: core.nickname,
      social_name: '',
      sex: 'F',
      birth_date: '1990-01-01',
      cpf: '39053344705',
      photo_url: null,
      status: 'active',
      blocked: false,
      block_reason: '',
      block_at: null,
      tags: [],
      lead_source: '',
      has_financial_responsible: false,
      dependent_full_name: '',
      has_pending_data: false,
      pending_fields: [],
      pending_critical_fields: [],
      created_at: core.createdAt,
      updated_at: core.updatedAt,
      created_by: null,
      updated_by: null,
      deleted_at: null,
    }).legacyId).toBe(legacyPatient);
  });

  it('facade flags off, readiness CLOUD.3 wired, patientService só via adapter', async () => {
    const flags = getPatientRepositoryFlags({});
    expect(flags.PATIENTS_READ).toBe(false);
    expect(flags.PATIENTS_WRITE).toBe(false);
    expect(flags.PATIENTS_DUAL_WRITE).toBe(false);
    expect(flags.PATIENTS_SHADOW).toBe(false);
    expect(PATIENTS_REPOSITORY_FLAG_DEFAULTS.PATIENTS_READ).toBe(false);

    const repo = createPatientRepository();
    const readiness = repo.getReadiness();
    expect(readiness.supabaseRepositoryImplemented).toBe(true);
    expect(readiness.indexedDbSsot).toBe(true);
    expect(readiness.wiredToPatientService).toBe(true);
    expect(readiness.wave).toBe('CLOUD.3');
    expect(readiness.readEnabled).toBe(false);

    await expect(repo.listCore('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')).rejects.toBeInstanceOf(
      PatientRepositoryRemoteReadDisabledError,
    );

    const service = read('src/services/patientService.js');
    expect(service).not.toMatch(/repositories\/patient/);
    expect(service).not.toMatch(/PATIENTS_READ|PATIENTS_WRITE|PATIENTS_DUAL_WRITE/);
    expect(service).toMatch(/schedulePatientShadowRead|patientReadAdapter/);
  });

  it('Agenda/CRM/Contratos/Financeiro e Wave 3 não foram alterados nesta wave', () => {
    // Guardas de escopo: migration 027 não toca domínios externos
    const sql = read(`supabase/migrations/${MIG}`);
    const body = sql.replace(/--[^\n]*/g, '');
    expect(body).not.toMatch(/alter table public\.appointments/i);
    expect(body).not.toMatch(/alter table public\.crm_/i);
    expect(body).not.toMatch(/alter table public\.generated_contracts/i);
    expect(body).not.toMatch(/alter table public\.financial_/i);
    expect(body).not.toMatch(/patient_charts|patient_odontogram|patient_files|journey/i);
  });
});

describe('Phase 9.4A Wave 2 — scripts e guards (STATIC)', () => {
  it('package.json expõe scripts Wave 2', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['test:supabase:phase94a-wave2']).toContain('phase94aWave2PatientsDetails');
    expect(pkg.scripts['supabase:local:patients-wave2-rls']).toContain('runLocalPatientsWave2RlsValidation');
    expect(pkg.scripts['supabase:local:patients-wave2-repo-e2e']).toContain(
      'runLocalPatientsWave2RepositoryE2e',
    );
  });

  it('fixtures e runners existem e são seguros', async () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'supabase-local/fixtures/patients_wave2_rls_validation.sql'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'supabase-local/fixtures/patients_wave2_repository_e2e.sql'))).toBe(true);
    const fixture = read('supabase-local/fixtures/patients_wave2_rls_validation.sql');
    expect(fixture).toContain('PATIENTS_WAVE2_RLS_PASS');
    expect(fixture).toContain('stale_jwt_without_membership_cannot_read_wave2');
    expect(fixture).toContain('birth_1to1_second_blocked');
    expect(fixture).toContain('address_one_primary_enforced');
    expect(fixture).toContain('cross_tenant_satellite_blocked');

    const report = await runLocalPatientsWave2RlsValidation({ env: {} });
    expect(report.status).toBe('PATIENTS_WAVE2_RLS_SKIPPED_OPT_IN');
    expect(report.remoteActionsExecuted).toBe(false);
    expect(report.linkedRef === null || report.linkedRef === STAGING_REF).toBe(true);

    expect(guardCommand('supabase', ['db', 'query', '--linked', 'select 1'], {}).status)
      .toBe('BLOCKED_REMOTE_COMMAND');
  });
});
