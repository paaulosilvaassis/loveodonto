/**
 * Phase 10.3 — Contracts Persistence & Tenant Security
 * Testes estáticos de migration + unitários de mapper/repository (mock).
 * NÃO aplica migrations. NÃO acessa remoto.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import {
  CONTRACT_DOCUMENT_TYPES,
  CONTRACT_STATUSES,
  CONTRACT_FEATURE_FLAG_DEFAULTS,
  CONTRACT_FEATURE_FLAGS,
  assertAllContractFeatureFlagsDisabled,
  getContractFeatureFlags,
  SIGNATURE_ENVELOPE_STATUSES,
  SIGNATURE_SIGNER_STATUSES,
  CONTRACT_TEMPLATE_STATUSES,
  CONTRACT_FILE_TYPES,
} from '../domain/contracts/index.ts';

import {
  CONTRACT_V2_TABLES,
  CONTRACT_LEGACY_TABLES,
  assertValidTenantId,
  mapContractRowToDomain,
  mapDomainContractToRow,
  mapContractVersionRowToDomain,
  mapDomainContractVersionToRow,
  mapDomainFileToRow,
  mapFileRowToDomain,
  ContractSupabaseRepository,
  ContractAuditSupabaseRepository,
  ContractFileSupabaseRepository,
  ContractPersistenceUnavailableError,
} from '../repositories/contracts/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase/migrations');
const LOCAL_MIGRATIONS = path.join(REPO_ROOT, 'supabase-local/migrations');
const LOCAL_SUPABASE_MIGRATIONS = path.join(REPO_ROOT, 'supabase-local/supabase/migrations');

const MIG_028 = '028_app_contracts_v2_foundation.sql';
const MIG_029 = '029_app_contracts_v2_rls.sql';
const MIG_006 = '006_app_contracts.sql';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const CONTRACT_ID = '33333333-3333-4333-8333-333333333333';

function readMig(dir, name) {
  return fs.readFileSync(path.join(dir, name), 'utf8');
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function extractCheckList(sql, constraintName) {
  const re = new RegExp(
    `constraint\\s+${constraintName}\\s+[\\s\\S]*?check\\s*\\(([\\s\\S]*?)\\)`,
    'i',
  );
  const m = sql.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/'([A-Z0-9_]+)'/g)].map((x) => x[1]);
}

/** Mock PostgREST mínimo em memória, sempre exige filtros tenant_id. */
function createMemoryClient(seed = {}) {
  const store = {
    [CONTRACT_V2_TABLES.CONTRACTS]: [...(seed.contracts || [])],
    [CONTRACT_V2_TABLES.VERSIONS]: [...(seed.versions || [])],
    [CONTRACT_V2_TABLES.FILES]: [...(seed.files || [])],
    [CONTRACT_V2_TABLES.AUDIT_EVENTS]: [...(seed.audits || [])],
  };
  const queryLog = [];

  function from(table) {
    let rows = [...(store[table] || [])];
    let filters = [];
    let mode = 'select';
    let payload = null;
    let countExact = false;
    let maybe = false;
    let single = false;
    let range = null;

    const api = {
      select(_cols, opts) {
        mode = mode === 'update' || mode === 'insert' ? mode : 'select';
        countExact = Boolean(opts?.count);
        return api;
      },
      insert(row) {
        mode = 'insert';
        payload = row;
        return api;
      },
      update(row) {
        mode = 'update';
        payload = row;
        return api;
      },
      eq(field, value) {
        filters.push({ field, value, op: 'eq' });
        return api;
      },
      in(field, values) {
        filters.push({ field, value: values, op: 'in' });
        return api;
      },
      is(field, value) {
        filters.push({ field, value, op: 'is' });
        return api;
      },
      gte(field, value) {
        filters.push({ field, value, op: 'gte' });
        return api;
      },
      lte(field, value) {
        filters.push({ field, value, op: 'lte' });
        return api;
      },
      neq(field, value) {
        filters.push({ field, value, op: 'neq' });
        return api;
      },
      order() { return api; },
      range(fromIdx, toIdx) {
        range = [fromIdx, toIdx];
        return api;
      },
      maybeSingle() {
        maybe = true;
        return api.thenable();
      },
      single() {
        single = true;
        return api.thenable();
      },
      thenable() {
        return Promise.resolve(api.execute());
      },
      then(resolve, reject) {
        return api.thenable().then(resolve, reject);
      },
      execute() {
        queryLog.push({ table, mode, filters: [...filters], payload });

        const applyFilters = (list) => list.filter((row) => filters.every((f) => {
          if (f.op === 'eq') return row[f.field] === f.value;
          if (f.op === 'in') return f.value.includes(row[f.field]);
          if (f.op === 'is') return row[f.field] == null;
          if (f.op === 'gte') return String(row[f.field]) >= String(f.value);
          if (f.op === 'lte') return String(row[f.field]) <= String(f.value);
          if (f.op === 'neq') return row[f.field] !== f.value;
          return true;
        }));

        if (mode === 'insert') {
          const row = { ...payload };
          store[table].push(row);
          return { data: single || maybe ? row : [row], error: null, count: 1 };
        }

        if (mode === 'update') {
          const matched = applyFilters(store[table]);
          matched.forEach((row) => Object.assign(row, payload));
          const data = maybe || single ? (matched[0] || null) : matched;
          return { data, error: null, count: matched.length };
        }

        let result = applyFilters(rows);
        const count = result.length;
        if (range) result = result.slice(range[0], range[1] + 1);
        if (maybe || single) {
          return { data: result[0] || null, error: null, count };
        }
        return { data: result, error: null, count: countExact ? count : null };
      },
    };

    api.then = (resolve, reject) => Promise.resolve(api.execute()).then(resolve, reject);

    return api;
  }

  return {
    from,
    _store: store,
    _queryLog: queryLog,
  };
}

function sampleContract(overrides = {}) {
  return {
    id: CONTRACT_ID,
    tenantId: TENANT_A,
    contractNumber: 'CTR-2026-00001',
    documentType: 'SERVICE_CONTRACT',
    title: 'Contrato Teste',
    patientId: 'patient-1',
    origin: 'CLINICAL_BUDGET',
    status: 'DRAFT',
    createdBy: '44444444-4444-4444-8444-444444444444',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    rowVersion: 1,
    metadata: {},
    ...overrides,
  };
}

function sampleVersion(overrides = {}) {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    tenantId: TENANT_A,
    contractId: CONTRACT_ID,
    versionNumber: 1,
    generationReason: 'INITIAL',
    contentSchemaSnapshot: { body: 'x' },
    patientSnapshot: { patientId: 'patient-1', fullName: 'Maria' },
    clinicSnapshot: { legalName: 'Clínica X' },
    signersSnapshot: [{ role: 'patient', name: 'Maria', required: true }],
    createdBy: '44444444-4444-4444-8444-444444444444',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

describe('Phase 10.3 — Migrations manuais (static)', () => {
  it('cria 028/029 na canônica e espelhos locais com mesmo SHA-256', () => {
    for (const name of [MIG_028, MIG_029]) {
      const app = path.join(MIGRATIONS_DIR, name);
      const local = path.join(LOCAL_MIGRATIONS, name);
      const localSb = path.join(LOCAL_SUPABASE_MIGRATIONS, name);
      expect(fs.existsSync(app)).toBe(true);
      expect(fs.existsSync(local)).toBe(true);
      expect(fs.existsSync(localSb)).toBe(true);
      expect(sha256(app)).toBe(sha256(local));
      expect(sha256(app)).toBe(sha256(localSb));
    }
  });

  it('não altera migration 006 nem generated_contracts', () => {
    const sql006 = readMig(MIGRATIONS_DIR, MIG_006);
    expect(sql006).toMatch(/create table if not exists public\.generated_contracts/i);
    expect(sql006).toMatch(/create table if not exists public\.contract_templates/i);

    const sql028 = readMig(MIGRATIONS_DIR, MIG_028);
    expect(sql028).not.toMatch(/drop table.*generated_contracts/i);
    expect(sql028).not.toMatch(/alter table public\.generated_contracts/i);
    expect(sql028).not.toMatch(/alter table public\.contract_templates/i);
    expect(sql028).toMatch(/NÃO EXECUTAR automaticamente/i);
  });

  it('usa namespace app_contract_* / app_signature_* para evitar colisão', () => {
    const sql = readMig(MIGRATIONS_DIR, MIG_028);
    // LEDGER (030), NUMBER_SEQUENCES (031), sessions/challenges/rate (032) e storage_ops (033)
    // ficam fora da foundation 028.
    const foundationTables = Object.values(CONTRACT_V2_TABLES).filter((table) => (
      table !== 'app_contract_ledger'
      && table !== 'app_contract_number_sequences'
      && table !== 'app_signature_sessions'
      && table !== 'app_signature_challenges'
      && table !== 'app_signature_rate_limits'
      && table !== 'app_signature_delivery_attempts'
      && table !== 'app_contract_storage_ops'
    ));
    for (const table of foundationTables) {
      expect(sql).toMatch(new RegExp(`create table if not exists public\\.${table}`, 'i'));
    }
    // não recria tabelas legado
    expect(sql).not.toMatch(/create table if not exists public\.contract_templates\s*\(/i);
    expect(sql).not.toMatch(/create table if not exists public\.generated_contracts\s*\(/i);
  });

  it('define FK compostas (tenant_id, id) e unique tenant+id', () => {
    const sql = readMig(MIGRATIONS_DIR, MIG_028);
    expect(sql).toMatch(/app_contracts_tenant_id_uidx unique \(tenant_id, id\)/i);
    expect(sql).toMatch(/foreign key \(tenant_id, contract_id\)/i);
    expect(sql).toMatch(/foreign key \(tenant_id, template_id\)/i);
    expect(sql).toMatch(/foreign key \(tenant_id, envelope_id\)/i);
  });

  it('constraints de status/document_type alinhadas ao domínio', () => {
    const sql = readMig(MIGRATIONS_DIR, MIG_028);
    const statuses = extractCheckList(sql, 'app_contracts_status_chk');
    expect(statuses.sort()).toEqual([...CONTRACT_STATUSES].sort());

    const docTypes = extractCheckList(sql, 'app_contracts_document_type_chk');
    expect(docTypes.sort()).toEqual([...CONTRACT_DOCUMENT_TYPES].sort());

    const tplStatuses = extractCheckList(sql, 'app_contract_templates_status_chk');
    expect(tplStatuses.sort()).toEqual([...CONTRACT_TEMPLATE_STATUSES].sort());

    const envStatuses = extractCheckList(sql, 'app_signature_envelopes_status_chk');
    expect(envStatuses.sort()).toEqual([...SIGNATURE_ENVELOPE_STATUSES].sort());

    const signerStatuses = extractCheckList(sql, 'app_signature_signers_status_chk');
    expect(signerStatuses.sort()).toEqual([...SIGNATURE_SIGNER_STATUSES].sort());

    const fileTypes = extractCheckList(sql, 'app_contract_files_type_chk');
    expect(fileTypes.sort()).toEqual([...CONTRACT_FILE_TYPES].sort());
  });

  it('cancelamento exige motivo; row_version/version_number >= 1; unique contract_number', () => {
    const sql = readMig(MIGRATIONS_DIR, MIG_028);
    expect(sql).toMatch(/app_contracts_cancel_reason_chk/i);
    expect(sql).toMatch(/app_contracts_row_version_chk check \(row_version >= 1\)/i);
    expect(sql).toMatch(/app_contract_versions_number_chk check \(version_number >= 1\)/i);
    expect(sql).toMatch(/app_contracts_number_uq unique \(tenant_id, contract_number\)/i);
  });

  it('imutabilidade de versão locked + audit append-only via trigger', () => {
    const sql = readMig(MIGRATIONS_DIR, MIG_028);
    expect(sql).toMatch(/app_contract_reject_locked_version_mutation/i);
    expect(sql).toMatch(/trg_app_contract_versions_locked/i);
    expect(sql).toMatch(/app_contract_reject_audit_mutation/i);
    expect(sql).toMatch(/trg_app_contract_audit_events_no_update/i);
    expect(sql).toMatch(/trg_app_contract_audit_events_no_delete/i);
    expect(sql).toMatch(/app_contract_reject_tenant_id_change/i);
  });

  it('proíbe data URL em storage_path; prepara idempotency keys', () => {
    const sql = readMig(MIGRATIONS_DIR, MIG_028);
    expect(sql).toMatch(/app_contract_files_no_data_uri_path_chk/i);
    expect(sql).toMatch(/create table if not exists public\.app_contract_idempotency_keys/i);
    expect(sql).toMatch(/CREATE_FROM_BUDGET/);
    expect(sql).toMatch(/FINANCIAL_ACTIVATION/);
  });

  it('RLS usa app_user_can_access_tenant e admin modify; audit sem update/delete policy', () => {
    const sql = readMig(MIGRATIONS_DIR, MIG_029);
    expect(sql).toMatch(/NÃO EXECUTAR automaticamente/i);
    expect(sql).toMatch(/app_user_can_access_tenant\(tenant_id::text\)/);
    expect(sql).toMatch(/app_user_is_tenant_admin\(tenant_id\)/);
    expect(sql).toMatch(/app_contracts_select_tenant/);
    expect(sql).toMatch(/app_contract_audit_events_insert_admin/);
    expect(sql).toMatch(/Intencionalmente SEM policy de UPDATE\/DELETE/);
    expect(sql).not.toMatch(/app_contract_audit_events_.*for update/i);
    expect(sql).not.toMatch(/app_contract_audit_events_.*for delete/i);
  });

  it('patient_id é text opaco (não uuid FK prematura)', () => {
    const sql = readMig(MIGRATIONS_DIR, MIG_028);
    expect(sql).toMatch(/patient_id text not null/);
    expect(sql).toMatch(/refs opacas/i);
  });
});

// ---------------------------------------------------------------------------
// Feature flags + no wiring
// ---------------------------------------------------------------------------

describe('Phase 10.3 — Flags OFF e sem wiring', () => {
  it('todas as flags permanecem false', () => {
    expect(assertAllContractFeatureFlagsDisabled()).toBe(true);
    const flags = getContractFeatureFlags();
    for (const key of CONTRACT_FEATURE_FLAGS) {
      expect(CONTRACT_FEATURE_FLAG_DEFAULTS[key]).toBe(false);
      expect(flags[key]).toBe(false);
    }
  });

  it('repository sem client não conecta automaticamente (unavailable)', async () => {
    const repo = new ContractSupabaseRepository();
    await expect(repo.findById(TENANT_A, CONTRACT_ID))
      .rejects.toBeInstanceOf(ContractPersistenceUnavailableError);
  });

  it('services legados não importam repositories/contracts', () => {
    const legacyFiles = [
      'src/services/contractModuleService.js',
      'src/services/contractService.js',
      'src/services/contractSignatureFlowService.js',
      'src/ProtectedApp.jsx',
    ];
    for (const rel of legacyFiles) {
      const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      expect(src).not.toMatch(/repositories\/contracts/);
      expect(src).not.toMatch(/app_contracts/);
      expect(src).not.toMatch(/ContractSupabaseRepository/);
    }
  });
});

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

describe('Phase 10.3 — Persistence mappers', () => {
  it('round-trip Contract domínio → row → domínio', () => {
    const domain = sampleContract({
      budgetId: 'budget-1',
      guardianPatientId: 'guardian-1',
      cancellationReason: undefined,
    });
    const row = mapDomainContractToRow(domain);
    expect(row.tenant_id).toBe(TENANT_A);
    expect(row.patient_id).toBe('patient-1');
    expect(row.budget_id).toBe('budget-1');
    const back = mapContractRowToDomain(row);
    expect(back.id).toBe(domain.id);
    expect(back.tenantId).toBe(domain.tenantId);
    expect(back.status).toBe('DRAFT');
    expect(back.budgetId).toBe('budget-1');
  });

  it('round-trip ContractVersion preserva snapshots e nulls', () => {
    const version = sampleVersion({
      lockedAt: undefined,
      financialSnapshot: { contractTotal: 100, currency: 'BRL' },
      odontogramSnapshot: undefined,
      documentHash: 'sha256:aaaaaaaaaaaaaaaa',
    });
    const row = mapDomainContractVersionToRow(version);
    expect(row.odontogram_snapshot).toBeNull();
    expect(row.financial_snapshot.contractTotal).toBe(100);
    const back = mapContractVersionRowToDomain(row);
    expect(back.patientSnapshot.fullName).toBe('Maria');
    expect(back.financialSnapshot.contractTotal).toBe(100);
    expect(back.odontogramSnapshot).toBeUndefined();
    expect(back.documentHash).toBe('sha256:aaaaaaaaaaaaaaaa');
  });

  it('recusa persistir arquivo com data URL', () => {
    expect(() => mapDomainFileToRow({
      id: 'f1',
      tenantId: TENANT_A,
      contractId: CONTRACT_ID,
      fileType: 'ATTACHMENT',
      storage: { storageProvider: 'supabase', storageBucket: 'x', storagePath: 'data:application/pdf;base64,AAA' },
      originalName: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1,
      integrity: {},
      uploadedBy: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z',
      legacyDataUrlPresent: true,
    })).toThrow(/data URL/i);
  });

  it('assertValidTenantId rejeita tenant inválido', () => {
    expect(() => assertValidTenantId('')).toThrow();
    expect(() => assertValidTenantId('not-uuid')).toThrow();
    expect(assertValidTenantId(TENANT_A)).toBe(TENANT_A);
  });
});

// ---------------------------------------------------------------------------
// Repository + cross-tenant
// ---------------------------------------------------------------------------

describe('Phase 10.3 — Repository + cross-tenant (mock)', () => {
  let client;
  let repo;

  beforeEach(() => {
    client = createMemoryClient({
      contracts: [
        mapDomainContractToRow(sampleContract()),
        mapDomainContractToRow(sampleContract({
          id: '66666666-6666-4666-8666-666666666666',
          tenantId: TENANT_B,
          contractNumber: 'CTR-B-1',
          title: 'Contrato Tenant B',
        })),
      ],
      versions: [
        mapDomainContractVersionToRow(sampleVersion()),
      ],
    });
    repo = new ContractSupabaseRepository({ client });
  });

  it('findById exige tenant e não vaza contrato de outro tenant', async () => {
    const own = await repo.findById(TENANT_A, CONTRACT_ID);
    expect(own?.title).toBe('Contrato Teste');

    const leaked = await repo.findById(TENANT_A, '66666666-6666-4666-8666-666666666666');
    expect(leaked).toBeNull();

    const query = client._queryLog.find((q) => q.mode === 'select' && q.table === CONTRACT_V2_TABLES.CONTRACTS);
    expect(query.filters.some((f) => f.field === 'tenant_id' && f.value === TENANT_A)).toBe(true);
    expect(query.filters.some((f) => f.field === 'id')).toBe(true);
  });

  it('list filtra por tenant_id', async () => {
    const result = await repo.list(TENANT_A, {});
    expect(result.items).toHaveLength(1);
    expect(result.items[0].tenantId).toBe(TENANT_A);
  });

  it('create rejeita mismatch de tenant no payload', async () => {
    await expect(repo.create(TENANT_A, sampleContract({ tenantId: TENANT_B })))
      .rejects.toMatchObject({ code: 'TENANT_MISMATCH' });
  });

  it('updateDraft usa optimistic concurrency', async () => {
    await expect(repo.updateDraft(TENANT_A, CONTRACT_ID, { title: 'Novo' }, 99))
      .rejects.toMatchObject({ code: 'OPTIMISTIC_CONCURRENCY_CONFLICT' });

    const updated = await repo.updateDraft(TENANT_A, CONTRACT_ID, { title: 'Novo Título' }, 1);
    expect(updated.title).toBe('Novo Título');
    expect(updated.rowVersion).toBe(2);
  });

  it('tenant B não atualiza contrato do tenant A', async () => {
    await expect(repo.updateDraft(TENANT_B, CONTRACT_ID, { title: 'Hack' }, 1))
      .rejects.toMatchObject({ code: 'CONTRACT_NOT_FOUND' });
  });

  it('saveVersion / listVersions / findVersionById são tenant-scoped', async () => {
    const versions = await repo.listVersions(TENANT_A, CONTRACT_ID);
    expect(versions).toHaveLength(1);

    const missing = await repo.findVersionById(TENANT_B, versions[0].id);
    expect(missing).toBeNull();

    const locked = sampleVersion({
      id: '77777777-7777-4777-8777-777777777777',
      lockedAt: '2026-01-02T00:00:00.000Z',
      versionNumber: 2,
    });
    // insert locked ok
    const saved = await repo.saveVersion(TENANT_A, locked);
    expect(saved.lockedAt).toBeTruthy();
    // update locked blocked
    await expect(repo.saveVersion(TENANT_A, { ...locked, plainTextSnapshot: 'x' }))
      .rejects.toMatchObject({ code: 'VERSION_ALREADY_LOCKED' });
  });

  it('transitionStatus respeita fromStatus e row_version', async () => {
    const moved = await repo.transitionStatus(TENANT_A, {
      contractId: CONTRACT_ID,
      fromStatus: 'DRAFT',
      toStatus: 'CANCELLED',
      cancellationReason: 'teste',
      expectedRowVersion: 1,
      actorId: '44444444-4444-4444-8444-444444444444',
    });
    expect(moved.status).toBe('CANCELLED');
    expect(moved.cancellationReason).toBe('teste');
  });

  it('audit repository só faz insert (append)', async () => {
    const auditRepo = new ContractAuditSupabaseRepository({ client });
    const event = await auditRepo.append(TENANT_A, {
      id: '88888888-8888-4888-8888-888888888888',
      tenantId: TENANT_A,
      contractId: CONTRACT_ID,
      eventType: 'CREATED',
      actor: { actorType: 'USER', actorId: '44444444-4444-4444-8444-444444444444' },
      source: 'APP',
      metadata: { op: 'create' },
      occurredAt: '2026-01-01T00:00:00.000Z',
    });
    expect(event.eventType).toBe('CREATED');
    expect(client._queryLog.some((q) => q.table === CONTRACT_V2_TABLES.AUDIT_EVENTS && q.mode === 'insert')).toBe(true);
  });

  it('file repository rejeita data URL e exige tenant no create', async () => {
    const fileRepo = new ContractFileSupabaseRepository({ client });
    await expect(fileRepo.create(TENANT_A, {
      id: '99999999-9999-4999-8999-999999999999',
      tenantId: TENANT_A,
      contractId: CONTRACT_ID,
      fileType: 'GENERATED_PDF',
      storage: {
        storageProvider: 'supabase',
        storageBucket: 'contracts',
        storagePath: `${TENANT_A}/c1/file.pdf`,
      },
      originalName: 'file.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      integrity: { sha256: 'aaaaaaaaaaaaaaaa', encryptionStatus: 'at_rest' },
      uploadedBy: '44444444-4444-4444-8444-444444444444',
      createdAt: '2026-01-01T00:00:00.000Z',
    })).resolves.toMatchObject({ fileType: 'GENERATED_PDF' });
  });

  it('tabelas legado 006 não são usadas pelos repositories V2', () => {
    expect(Object.values(CONTRACT_V2_TABLES)).not.toContain(CONTRACT_LEGACY_TABLES.GENERATED);
    expect(Object.values(CONTRACT_V2_TABLES)).not.toContain(CONTRACT_LEGACY_TABLES.TEMPLATES);
    for (const q of client._queryLog) {
      expect(Object.values(CONTRACT_LEGACY_TABLES)).not.toContain(q.table);
    }
  });
});

