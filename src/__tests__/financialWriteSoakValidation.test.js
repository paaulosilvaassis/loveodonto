/**
 * Phase 5.14 — Financial write soak validation (simulated).
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initDb, loadDb, resetDb, withDb } from '../db/index.js';
import { createReceivable } from '../services/receivablesService.js';
import { FinancialRepository } from '../repositories/financial/financialRepository.ts';
import { createFinancialCache } from '../repositories/financial/financialCache.ts';
import {
  getFinancialRepositoryFlags,
  isFinancialReadPrimaryEnabled,
  isFinancialWritePrimaryEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/financial/financialRepositoryFlags.ts';
import {
  __setFinancialRepositoryFactoryForTest,
  __setFinancialServiceBridgeFlagsForTest,
  shouldUseFinancialRepositoryWritePrimary,
} from '../services/financialRepositoryBridge.js';
import {
  __runFinancialDualWriteCreateReceivableForTest,
  __runFinancialSoakConsistencyReportForTest,
} from '../services/financialWriteAdapter.js';
import { __clearFinancialWriteSoakForTest } from '../repositories/financial/financialWriteSoak.ts';
import { FINANCIAL_STAGING_SOAK_FLAGS_RESOLVED } from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const SOAK_FLAGS = FINANCIAL_STAGING_SOAK_FLAGS_RESOLVED;

const financeUser = {
  id: 'user-finance',
  role: 'admin',
  tenantId: TENANT,
  permissions: { 'finance:write': true },
};

function seedContext() {
  withDb((db) => {
    db.clinicProfile = { tenant_id: TENANT };
    db.patients = [{ id: 'pat-001', tenant_id: TENANT, full_name: 'Paciente Soak' }];
    db.accountsReceivable = [];
    return db;
  });
}

function buildRemoteReceivable(legacyId) {
  return {
    tenantId: TENANT,
    legacyId,
    uuid: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
    patientId: 'pat-001',
    originType: 'manual_entry',
    originId: null,
    description: 'Soak remoto',
    issueDate: '2026-07-01',
    dueDate: '2026-07-15',
    originalAmount: 600,
    discountAmount: 0,
    interestAmount: 0,
    fineAmount: 0,
    netAmount: 600,
    paidAmount: 0,
    status: 'open',
    paymentMethodExpected: 'pix',
    contractId: null,
    budgetId: null,
    financingId: null,
    financingInstallmentId: null,
  };
}

function createSoakMocks() {
  const remoteRows = [];
  return {
    adminApi: {
      listReceivables: vi.fn().mockImplementation(async () => [...remoteRows]),
      getReceivable: vi.fn(),
      listPayables: vi.fn().mockResolvedValue([]),
      getPayable: vi.fn(),
      listFinancings: vi.fn().mockResolvedValue([]),
      getFinancing: vi.fn(),
      createReceivable: vi.fn().mockImplementation(async (_tid, dto) => {
        const core = buildRemoteReceivable(dto.legacyId);
        remoteRows.push(core);
        return core;
      }),
      updateReceivable: vi.fn(),
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

describe('financialWriteSoakValidation — contrato staging', () => {
  it('soak flags exigem READ + WRITE + WRITE_PRIMARY', () => {
    expect(SOAK_FLAGS.FINANCIAL_READ).toBe(true);
    expect(SOAK_FLAGS.FINANCIAL_WRITE).toBe(true);
    expect(SOAK_FLAGS.FINANCIAL_WRITE_PRIMARY).toBe(true);
  });

  it('produção bloqueia soak flags', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getFinancialRepositoryFlags({ overrides: SOAK_FLAGS });
      expect(flags.FINANCIAL_WRITE_PRIMARY).toBe(false);
      expect(flags.FINANCIAL_READ_PRIMARY).toBe(false);
      expect(isFinancialWritePrimaryEnabled()).toBe(false);
      expect(isFinancialReadPrimaryEnabled()).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd;
    }
  });

  it('host produção Supabase bloqueia soak', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getFinancialRepositoryFlags({ overrides: SOAK_FLAGS });
    expect(flags.FINANCIAL_WRITE).toBe(false);
    expect(flags.FINANCIAL_WRITE_PRIMARY).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('financialWriteSoakValidation — cenários simulados', () => {
  beforeEach(() => {
    resetDb();
    initDb();
    seedContext();
    __clearFinancialWriteSoakForTest();
    __setFinancialServiceBridgeFlagsForTest({ overrides: SOAK_FLAGS });
    const mocks = createSoakMocks();
    __setFinancialRepositoryFactoryForTest(() => new FinancialRepository({
      ...mocks,
      flagsInput: { overrides: SOAK_FLAGS },
    }));
  });

  afterEach(() => {
    __setFinancialServiceBridgeFlagsForTest(null);
    __setFinancialRepositoryFactoryForTest(null);
    __clearFinancialWriteSoakForTest();
  });

  it('M1 — primary write com hydrate e relatório de consistência', async () => {
    expect(shouldUseFinancialRepositoryWritePrimary()).toBe(true);
    const record = createReceivable(financeUser, {
      patient_id: 'pat-001',
      description: 'Soak M1',
      original_amount: 450,
      due_date: '2026-07-25',
    });
    const writeResult = await __runFinancialDualWriteCreateReceivableForTest(financeUser, record);
    expect(writeResult.ok).toBe(true);
    const report = await __runFinancialSoakConsistencyReportForTest(TENANT, 'receivable');
    expect(report?.tenantId).toBe(TENANT);
    expect(report?.metrics?.primaryOk).toBeGreaterThan(0);
    expect(report?.rollback).toContain('FINANCIAL_WRITE_PRIMARY');
  });

  it('M2 — pagamentos preparados sem ativação', async () => {
    const { scheduleFinancialPrimaryWriteRegisterPayment, scheduleFinancialPrimaryWriteReceiveInstallment } =
      await import('../services/financialWriteAdapter.js');
    expect(() => scheduleFinancialPrimaryWriteRegisterPayment()).not.toThrow();
    expect(() => scheduleFinancialPrimaryWriteReceiveInstallment()).not.toThrow();
  });
});
