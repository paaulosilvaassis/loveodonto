/**
 * Phase 5.14 — Financial Write Primary + hydrate.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initDb, loadDb, resetDb, withDb } from '../db/index.js';
import { createReceivable, updateReceivable } from '../services/receivablesService.js';
import { createPayable } from '../services/payablesService.js';
import { FinancialRepository } from '../repositories/financial/financialRepository.ts';
import { createFinancialCache } from '../repositories/financial/financialCache.ts';
import {
  getFinancialRepositoryFlags,
  isFinancialWritePrimaryEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/financial/financialRepositoryFlags.ts';
import {
  __setFinancialRepositoryFactoryForTest,
  __setFinancialServiceBridgeFlagsForTest,
  shouldUseFinancialRepositoryWrite,
  shouldUseFinancialRepositoryWritePrimary,
} from '../services/financialRepositoryBridge.js';
import {
  __clearFinancialWriteIdempotencyForTest,
} from '../repositories/financial/financialWriteIdempotency.ts';
import {
  __clearFinancialWriteSoakForTest,
  getFinancialWriteSoakMetrics,
} from '../repositories/financial/financialWriteSoak.ts';
import {
  __clearFinancialWriteAuditForTest,
  getFinancialWriteAuditLog,
} from '../repositories/financial/financialWriteAudit.ts';
import {
  __runFinancialDualWriteUpdateReceivableForTest,
  __runFinancialPrimaryWriteCreateReceivableForTest,
} from '../services/financialWriteAdapter.js';
import { FINANCIAL_WRITE_PRIMARY_FLAGS_RESOLVED } from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const PRIMARY_FLAGS = FINANCIAL_WRITE_PRIMARY_FLAGS_RESOLVED;

const financeUser = {
  id: 'user-finance',
  role: 'admin',
  tenantId: TENANT,
  permissions: { 'finance:write': true },
};

function seedContext() {
  withDb((db) => {
    db.clinicProfile = { tenant_id: TENANT };
    db.patients = [{ id: 'pat-001', tenant_id: TENANT, full_name: 'Paciente' }];
    db.accountsReceivable = [];
    db.payables = [];
    return db;
  });
}

function buildRemoteReceivable(legacyId) {
  return {
    tenantId: TENANT,
    legacyId,
    uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    patientId: 'pat-001',
    originType: 'manual_entry',
    originId: null,
    description: 'Remoto primary',
    issueDate: '2026-07-01',
    dueDate: '2026-07-15',
    originalAmount: 500,
    discountAmount: 0,
    interestAmount: 0,
    fineAmount: 0,
    netAmount: 500,
    paidAmount: 0,
    status: 'open',
    paymentMethodExpected: 'pix',
    contractId: null,
    budgetId: null,
    financingId: null,
    financingInstallmentId: null,
  };
}

function createWriteMocks() {
  return {
    adminApi: {
      listReceivables: vi.fn().mockResolvedValue([]),
      getReceivable: vi.fn().mockResolvedValue(null),
      listPayables: vi.fn().mockResolvedValue([]),
      getPayable: vi.fn().mockResolvedValue(null),
      listFinancings: vi.fn().mockResolvedValue([]),
      getFinancing: vi.fn().mockResolvedValue(null),
      createReceivable: vi.fn().mockImplementation(async (_tid, dto) => buildRemoteReceivable(dto.legacyId)),
      updateReceivable: vi.fn().mockImplementation(async (_tid, ref) => buildRemoteReceivable(ref)),
      createPayable: vi.fn(),
      updatePayable: vi.fn(),
      deletePayable: vi.fn(),
      createFinancing: vi.fn(),
      updateFinancing: vi.fn(),
    },
    indexedDb: {
      listReceivablesLegacySync: vi.fn(() => loadDb().accountsReceivable.map((r) => ({ ...r }))),
      getReceivableLegacySync: vi.fn((id) => {
        const row = loadDb().accountsReceivable.find((item) => item.id === id);
        return row ? { ...row } : null;
      }),
      listPayablesLegacySync: vi.fn(() => []),
      getPayableLegacySync: vi.fn(() => null),
      listFinancingsLegacySync: vi.fn(() => []),
      getFinancingLegacySync: vi.fn(() => null),
    },
    cache: createFinancialCache(),
  };
}

describe('financialWritePrimary — flags', () => {
  it('WRITE_PRIMARY exige FINANCIAL_WRITE', () => {
    expect(() => getFinancialRepositoryFlags({
      overrides: { FINANCIAL_WRITE_PRIMARY: true, FINANCIAL_WRITE: false, FINANCIAL_READ: true },
    })).toThrow(/FINANCIAL_WRITE_PRIMARY/);
  });

  it('flags OFF — primary e dual desabilitados', () => {
    __setFinancialServiceBridgeFlagsForTest(null);
    expect(shouldUseFinancialRepositoryWritePrimary()).toBe(false);
    expect(shouldUseFinancialRepositoryWrite()).toBe(false);
    expect(isFinancialWritePrimaryEnabled()).toBe(false);
  });

  it('primary ON desabilita dual-write only path', () => {
    __setFinancialServiceBridgeFlagsForTest({ overrides: PRIMARY_FLAGS });
    expect(shouldUseFinancialRepositoryWritePrimary()).toBe(true);
    expect(shouldUseFinancialRepositoryWrite()).toBe(false);
  });

  it('build PROD trava WRITE_PRIMARY', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getFinancialRepositoryFlags({ overrides: PRIMARY_FLAGS });
      expect(flags.FINANCIAL_WRITE_PRIMARY).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd;
    }
  });

  it('host Supabase produção bloqueia WRITE_PRIMARY', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getFinancialRepositoryFlags({ overrides: PRIMARY_FLAGS });
    expect(flags.FINANCIAL_WRITE_PRIMARY).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('financialWritePrimary — hydrate e fallback', () => {
  beforeEach(() => {
    resetDb();
    initDb();
    seedContext();
    __setFinancialServiceBridgeFlagsForTest({ overrides: PRIMARY_FLAGS });
    __clearFinancialWriteAuditForTest();
    __clearFinancialWriteSoakForTest();
    __clearFinancialWriteIdempotencyForTest();
    const mocks = createWriteMocks();
    __setFinancialRepositoryFactoryForTest(() => new FinancialRepository({
      ...mocks,
      flagsInput: { overrides: PRIMARY_FLAGS },
    }));
  });

  afterEach(() => {
    __setFinancialServiceBridgeFlagsForTest(null);
    __setFinancialRepositoryFactoryForTest(null);
    __clearFinancialWriteAuditForTest();
    __clearFinancialWriteSoakForTest();
    __clearFinancialWriteIdempotencyForTest();
  });

  it('primary create hidrata IndexedDB após sucesso remoto', async () => {
    const record = createReceivable(financeUser, {
      patient_id: 'pat-001',
      description: 'Primary hydrate',
      original_amount: 250,
      due_date: '2026-07-20',
    });
    const result = await __runFinancialPrimaryWriteCreateReceivableForTest(financeUser, record);
    expect(result.ok).toBe(true);
    const audit = getFinancialWriteAuditLog().find((e) => e.legacyId === record.id);
    expect(audit?.syncResult).toBe('ok');
    expect(getFinancialWriteSoakMetrics().primaryOk).toBeGreaterThan(0);
  });

  it('fallback preserva legado quando remoto falha', async () => {
    const record = createReceivable(financeUser, {
      patient_id: 'pat-001',
      description: 'Fallback',
      original_amount: 180,
      due_date: '2026-07-21',
    });
    const mocks = createWriteMocks();
    mocks.adminApi.createReceivable.mockRejectedValue(new Error('remote unavailable'));
    __setFinancialRepositoryFactoryForTest(() => new FinancialRepository({
      ...mocks,
      flagsInput: { overrides: PRIMARY_FLAGS },
    }));
    const result = await __runFinancialPrimaryWriteCreateReceivableForTest(financeUser, record);
    expect(result.ok).toBe(false);
    expect(loadDb().accountsReceivable.some((r) => r.id === record.id)).toBe(true);
    expect(getFinancialWriteSoakMetrics().fallbackLegacy).toBeGreaterThan(0);
  });

  it('rollback por flag — primary OFF não chama remote', async () => {
    __setFinancialServiceBridgeFlagsForTest(null);
    const mocks = createWriteMocks();
    __setFinancialRepositoryFactoryForTest(() => new FinancialRepository({ ...mocks }));
    const record = createReceivable(financeUser, {
      patient_id: 'pat-001',
      description: 'Rollback flag',
      original_amount: 120,
      due_date: '2026-07-22',
    });
    const result = await __runFinancialPrimaryWriteCreateReceivableForTest(financeUser, record);
    expect(result.skipped).toBe(true);
    expect(mocks.adminApi.createReceivable).not.toHaveBeenCalled();
  });

  it('flags OFF — createPayable 100% legado', () => {
    __setFinancialServiceBridgeFlagsForTest(null);
    const payable = createPayable(financeUser, {
      description: 'Legado',
      amount: 90,
      dueDate: '2026-07-23',
      paymentMethod: 'pix',
    });
    expect(payable.id).toBeTruthy();
    expect(loadDb().payables.some((p) => p.id === payable.id)).toBe(true);
  });

  it('update com primary registra audit ok', async () => {
    __setFinancialServiceBridgeFlagsForTest(null);
    const record = createReceivable(financeUser, {
      patient_id: 'pat-001',
      description: 'Before update',
      original_amount: 300,
      due_date: '2026-07-24',
    });
    const updated = updateReceivable(financeUser, record.id, { description: 'After update' });
    __setFinancialServiceBridgeFlagsForTest({ overrides: PRIMARY_FLAGS });
    const mocks = createWriteMocks();
    __setFinancialRepositoryFactoryForTest(() => new FinancialRepository({
      ...mocks,
      flagsInput: { overrides: PRIMARY_FLAGS },
    }));
    __clearFinancialWriteIdempotencyForTest();
    __clearFinancialWriteAuditForTest();
    const result = await __runFinancialDualWriteUpdateReceivableForTest(financeUser, updated);
    expect(result.ok).toBe(true);
    const audit = getFinancialWriteAuditLog().find((e) => e.legacyId === record.id && e.syncResult === 'ok');
    expect(audit).toBeTruthy();
  });
});
