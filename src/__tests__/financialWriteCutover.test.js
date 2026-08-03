/**
 * Phase 5.13 — Financial Repository Write Cutover (dual-write wave 1).
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initDb, loadDb, resetDb, withDb } from '../db/index.js';
import { createReceivable, updateReceivable } from '../services/receivablesService.js';
import { createPayable, deletePayable, updatePayable } from '../services/payablesService.js';
import { createFinancingProposal, updateFinancingTerms } from '../services/financingsService.js';
import { FinancialRepository } from '../repositories/financial/financialRepository.ts';
import { createFinancialCache } from '../repositories/financial/financialCache.ts';
import {
  getFinancialRepositoryFlags,
  isFinancialDualWriteEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/financial/financialRepositoryFlags.ts';
import {
  __setFinancialRepositoryFactoryForTest,
  __setFinancialServiceBridgeFlagsForTest,
  shouldUseFinancialRepositoryWrite,
} from '../services/financialRepositoryBridge.js';
import {
  __runFinancialDualWriteCreatePayableForTest,
  __runFinancialDualWriteCreateReceivableForTest,
  __runFinancialDualWriteDeletePayableForTest,
  __runFinancialDualWriteUpdateReceivableForTest,
} from '../services/financialWriteAdapter.js';
import {
  __clearFinancialWriteAuditForTest,
  getFinancialWriteAuditLog,
} from '../repositories/financial/financialWriteAudit.ts';
import {
  __clearFinancialWriteIdempotencyForTest,
  shouldSkipDuplicateFinancialWrite,
  markFinancialWriteIdempotent,
  buildFinancialIdempotencyKey,
} from '../repositories/financial/financialWriteIdempotency.ts';
import { FINANCIAL_DUAL_WRITE_FLAGS_RESOLVED, FINANCIAL_TEST_FLAG_CONTRACT } from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const WRITE_FLAGS = FINANCIAL_DUAL_WRITE_FLAGS_RESOLVED;

const financeUser = {
  id: 'user-finance',
  role: 'admin',
  tenantId: TENANT,
  permissions: { 'finance:write': true, 'financeiro_financiamentos:edit': true },
};

function seedContext() {
  withDb((db) => {
    db.clinicProfile = { tenant_id: TENANT };
    db.patients = [{ id: 'pat-001', tenant_id: TENANT, full_name: 'Paciente' }];
    db.accountsReceivable = [];
    db.payables = [];
    db.financings = [];
    return db;
  });
}

function buildRemoteReceivable(legacyId, overrides = {}) {
  return {
    tenantId: TENANT,
    legacyId,
    uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    patientId: 'pat-001',
    originType: 'manual_entry',
    originId: null,
    description: 'Remoto',
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
    ...overrides,
  };
}

function createWriteMocks() {
  const cache = createFinancialCache();
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
      createPayable: vi.fn().mockImplementation(async (_tid, dto) => ({
        tenantId: TENANT,
        legacyId: dto.legacyId,
        uuid: 'pay-uuid',
        supplierId: null,
        categoryId: null,
        description: dto.description,
        dueDate: dto.dueDate,
        amount: dto.amount,
        paidAmount: 0,
        status: 'open',
        expenseType: dto.expenseType,
        recurrenceFrequency: null,
      })),
      updatePayable: vi.fn(),
      deletePayable: vi.fn().mockResolvedValue(true),
      createFinancing: vi.fn().mockImplementation(async (_tid, dto) => ({
        tenantId: TENANT,
        legacyId: dto.legacyId,
        uuid: 'fin-uuid',
        patientId: dto.patientId,
        contractId: null,
        budgetId: null,
        status: 'draft',
        approvalStatus: 'pending',
        totalAmount: dto.totalAmount,
        entryAmount: dto.entryAmount,
        installmentsCount: dto.installmentsCount,
        partnerId: null,
      })),
      updateFinancing: vi.fn(),
    },
    indexedDb: {
      listReceivablesLegacySync: vi.fn(() => loadDb().accountsReceivable.map((r) => ({ ...r }))),
      getReceivableLegacySync: vi.fn((id) => {
        const row = loadDb().accountsReceivable.find((item) => item.id === id);
        return row ? { ...row } : null;
      }),
      listPayablesLegacySync: vi.fn(() => loadDb().payables.map((r) => ({ ...r }))),
      getPayableLegacySync: vi.fn((id) => {
        const row = loadDb().payables.find((item) => item.id === id);
        return row ? { ...row } : null;
      }),
      listFinancingsLegacySync: vi.fn(() => loadDb().financings.map((r) => ({ ...r }))),
      getFinancingLegacySync: vi.fn((id) => {
        const row = loadDb().financings.find((item) => item.id === id);
        return row ? { ...row } : null;
      }),
    },
    cache,
  };
}

describe('financialWriteCutover — flags', () => {
  it('contrato vitest mantém flags write OFF', () => {
    expect(FINANCIAL_TEST_FLAG_CONTRACT.VITE_FINANCIAL_WRITE).toBe('false');
    expect(FINANCIAL_TEST_FLAG_CONTRACT.VITE_FINANCIAL_DUAL_WRITE).toBe('false');
    expect(FINANCIAL_TEST_FLAG_CONTRACT.VITE_FINANCIAL_WRITE_PRIMARY).toBe('false');
    expect(FINANCIAL_TEST_FLAG_CONTRACT.VITE_FINANCIAL_WRITE_COMPARE).toBe('false');
  });

  it('DUAL_WRITE exige FINANCIAL_WRITE e FINANCIAL_READ', () => {
    expect(() => getFinancialRepositoryFlags({
      overrides: { FINANCIAL_DUAL_WRITE: true, FINANCIAL_WRITE: false, FINANCIAL_READ: true },
    })).toThrow(/FINANCIAL_DUAL_WRITE/);
    expect(() => getFinancialRepositoryFlags({
      overrides: { FINANCIAL_DUAL_WRITE: true, FINANCIAL_WRITE: true, FINANCIAL_READ: false },
    })).toThrow(/FINANCIAL_WRITE/);
  });

  it('flags OFF — shouldUseFinancialRepositoryWrite false', () => {
    __setFinancialServiceBridgeFlagsForTest(null);
    expect(shouldUseFinancialRepositoryWrite()).toBe(false);
    expect(isFinancialDualWriteEnabled()).toBe(false);
  });

  it('build PROD trava flags write', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getFinancialRepositoryFlags({ overrides: WRITE_FLAGS });
      expect(flags.FINANCIAL_DUAL_WRITE).toBe(false);
      expect(flags.FINANCIAL_WRITE).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd;
    }
  });

  it('host Supabase produção bloqueia write flags', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getFinancialRepositoryFlags({ overrides: WRITE_FLAGS });
    expect(flags.FINANCIAL_DUAL_WRITE).toBe(false);
    expect(flags.FINANCIAL_WRITE).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('financialWriteCutover — legacy preservation', () => {
  beforeEach(() => {
    resetDb();
    initDb();
    seedContext();
    __setFinancialServiceBridgeFlagsForTest({ overrides: WRITE_FLAGS });
    __clearFinancialWriteAuditForTest();
    __clearFinancialWriteIdempotencyForTest();
    const mocks = createWriteMocks();
    __setFinancialRepositoryFactoryForTest(() => new FinancialRepository({
      ...mocks,
      flagsInput: { overrides: WRITE_FLAGS },
    }));
  });

  afterEach(() => {
    __setFinancialServiceBridgeFlagsForTest(null);
    __setFinancialRepositoryFactoryForTest(null);
    __clearFinancialWriteAuditForTest();
    __clearFinancialWriteIdempotencyForTest();
  });

  it('flags OFF — createReceivable não chama remote', async () => {
    __setFinancialServiceBridgeFlagsForTest(null);
    const mocks = createWriteMocks();
    __setFinancialRepositoryFactoryForTest(() => new FinancialRepository({ ...mocks }));
    const record = createReceivable(financeUser, {
      patient_id: 'pat-001',
      description: 'Local only',
      original_amount: 200,
      due_date: '2026-07-20',
    });
    const result = await __runFinancialDualWriteCreateReceivableForTest(financeUser, record);
    expect(result.skipped).toBe(true);
    expect(mocks.adminApi.createReceivable).not.toHaveBeenCalled();
    expect(loadDb().accountsReceivable.some((r) => r.id === record.id)).toBe(true);
  });

  it('dual-write create receivable — IDB preservado mesmo com remote ok', async () => {
    const record = createReceivable(financeUser, {
      patient_id: 'pat-001',
      description: 'Dual write',
      original_amount: 300,
      due_date: '2026-07-21',
    });
    const before = loadDb().accountsReceivable.length;
    const result = await __runFinancialDualWriteCreateReceivableForTest(financeUser, record);
    expect(result.ok).toBe(true);
    expect(loadDb().accountsReceivable.length).toBe(before);
    expect(getFinancialWriteAuditLog().some((e) => e.legacyId === record.id)).toBe(true);
  });

  it('dual-write update receivable — fallback quando remote falha', async () => {
    const record = createReceivable(financeUser, {
      patient_id: 'pat-001',
      description: 'Update test',
      original_amount: 400,
      due_date: '2026-07-22',
    });
    const mocks = createWriteMocks();
    mocks.adminApi.updateReceivable.mockRejectedValue(new Error('remote down'));
    __setFinancialRepositoryFactoryForTest(() => new FinancialRepository({
      ...mocks,
      flagsInput: { overrides: WRITE_FLAGS },
    }));
    const updated = updateReceivable(financeUser, record.id, { description: 'Updated local' });
    const result = await __runFinancialDualWriteUpdateReceivableForTest(financeUser, updated);
    expect(result.ok).toBe(false);
    expect(loadDb().accountsReceivable.find((r) => r.id === record.id)?.description).toBe('Updated local');
  });

  it('dual-write payable create/delete', async () => {
    const payable = createPayable(financeUser, {
      description: 'Fornecedor',
      amount: 150,
      dueDate: '2026-07-25',
      paymentMethod: 'pix',
    });
    const createResult = await __runFinancialDualWriteCreatePayableForTest(financeUser, payable);
    expect(createResult.ok).toBe(true);
    deletePayable(financeUser, payable.id);
    const deleteResult = await __runFinancialDualWriteDeletePayableForTest(financeUser, payable.id, TENANT);
    expect(deleteResult.ok).toBe(true);
    expect(loadDb().payables.some((p) => p.id === payable.id)).toBe(false);
  });

  it('idempotência evita duplicidade em retry', () => {
    const key = buildFinancialIdempotencyKey('receivable', TENANT, 'recv-1', 'create');
    expect(shouldSkipDuplicateFinancialWrite(key)).toBe(false);
    markFinancialWriteIdempotent(key);
    expect(shouldSkipDuplicateFinancialWrite(key)).toBe(true);
  });
});

describe('financialWriteCutover — financing wiring', () => {
  beforeEach(() => {
    resetDb();
    initDb();
    seedContext();
    __setFinancialServiceBridgeFlagsForTest(null);
  });

  afterEach(() => {
    __setFinancialServiceBridgeFlagsForTest(null);
  });

  it('createFinancingProposal grava IDB sem dual-write com flags OFF', () => {
    const record = createFinancingProposal(financeUser, {
      patient_id: 'pat-001',
      description: 'Financiamento teste',
      total_amount: 1000,
      entry_amount: 200,
      installments_count: 4,
    });
    expect(record.id).toBeTruthy();
    expect(loadDb().financings.some((f) => f.id === record.id)).toBe(true);
  });

  it('updateFinancingTerms altera somente IDB com flags OFF', () => {
    const record = createFinancingProposal(financeUser, {
      patient_id: 'pat-001',
      description: 'Financiamento edit',
      total_amount: 1000,
      entry_amount: 100,
      installments_count: 3,
    });
    const updated = updateFinancingTerms(financeUser, record.id, { entry_amount: 150 });
    expect(updated.entry_amount).toBe(150);
  });
});
