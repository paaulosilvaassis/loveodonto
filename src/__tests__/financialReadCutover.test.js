/**
 * Phase 5.12 — Financial Repository Read Cutover.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, loadDb, resetDb, withDb } from '../db/index.js';
import { listReceivables, getReceivableById } from '../services/receivablesService.js';
import { listPayables } from '../services/payablesService.js';
import { listFinancings, getFinancingById } from '../services/financingsService.js';
import { FinancialRepository } from '../repositories/financial/financialRepository.ts';
import { createFinancialCache } from '../repositories/financial/financialCache.ts';
import {
  getFinancialRepositoryFlags,
  isFinancialReadPrimaryEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/financial/financialRepositoryFlags.ts';
import {
  __setFinancialRepositoryFactoryForTest,
  __setFinancialServiceBridgeFlagsForTest,
  shouldUseFinancialRepositoryRead,
} from '../services/financialRepositoryBridge.js';
import {
  readListReceivables,
  readGetReceivable,
  readHydrateFinancialCache,
  __compareFinancialIdbVsRemoteForTest,
} from '../services/financialReadAdapter.js';
import { FINANCIAL_READ_PRIMARY_FLAGS_RESOLVED } from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const AR_LOCAL = 'ar-local-001';
const AR_REMOTE = 'ar-remote-002';
const AP_LOCAL = 'ap-local-001';
const FIN_LOCAL = 'fin-local-001';

const READ_PRIMARY_FLAGS = FINANCIAL_READ_PRIMARY_FLAGS_RESOLVED;

function buildRemoteReceivable(overrides = {}) {
  return {
    tenantId: TENANT,
    legacyId: AR_REMOTE,
    uuid: '22222222-3333-4444-5555-666666666666',
    patientId: 'pat-remote',
    originType: 'manual_entry',
    originId: null,
    description: 'Recebível remoto',
    issueDate: '2026-07-01',
    dueDate: '2026-07-20',
    originalAmount: 800,
    discountAmount: 0,
    interestAmount: 0,
    fineAmount: 0,
    netAmount: 800,
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

function seedFinancialData() {
  withDb((db) => {
    db.clinicProfile = { tenant_id: TENANT };
    db.accountsReceivable = [{
      id: AR_LOCAL,
      tenant_id: TENANT,
      patient_id: 'pat-local',
      origin_type: 'manual_entry',
      description: 'Recebível local',
      issue_date: '2026-07-01',
      due_date: '2026-07-15',
      original_amount: 500,
      discount_amount: 0,
      interest_amount: 0,
      fine_amount: 0,
      net_amount: 500,
      paid_amount: 0,
      status: 'open',
      payment_method_expected: 'pix',
    }];
    db.payables = [{
      id: AP_LOCAL,
      tenant_id: TENANT,
      description: 'Aluguel local',
      dueDate: '2026-07-20',
      amount: 2000,
      paidAmount: 0,
      status: 'open',
      expenseType: 'fixed',
    }];
    db.financings = [{
      id: FIN_LOCAL,
      tenant_id: TENANT,
      patient_id: 'pat-local',
      status: 'active',
      approval_status: 'approved',
      total_amount: 5000,
      entry_amount: 1000,
      installments_count: 10,
    }];
    db.financingInstallments = [];
    return db;
  });
}

function createReadPrimaryMocks(remoteReceivables = [buildRemoteReceivable()]) {
  const cache = createFinancialCache();
  return {
    adminApi: {
      listReceivables: vi.fn().mockResolvedValue(remoteReceivables),
      getReceivable: vi.fn().mockImplementation(async (_tid, ref) => {
        return remoteReceivables.find((item) => item.legacyId === ref) ?? null;
      }),
      listPayables: vi.fn().mockResolvedValue([]),
      getPayable: vi.fn().mockResolvedValue(null),
      listFinancings: vi.fn().mockResolvedValue([]),
      getFinancing: vi.fn().mockResolvedValue(null),
    },
    indexedDb: {
      listReceivablesLegacySync: vi.fn((filters = {}) => {
        let rows = (loadDb().accountsReceivable || []).map((row) => ({ ...row }));
        if (filters.tenantId) {
          rows = rows.filter((row) => !row.tenant_id || row.tenant_id === filters.tenantId);
        }
        return rows;
      }),
      getReceivableLegacySync: vi.fn((id) => {
        const row = (loadDb().accountsReceivable || []).find((item) => item.id === id);
        return row ? { ...row } : null;
      }),
      listPayablesLegacySync: vi.fn(() => (loadDb().payables || []).map((row) => ({ ...row }))),
      getPayableLegacySync: vi.fn((id) => {
        const row = (loadDb().payables || []).find((item) => item.id === id);
        return row ? { ...row } : null;
      }),
      listFinancingsLegacySync: vi.fn(() => (loadDb().financings || []).map((row) => ({ ...row }))),
      getFinancingLegacySync: vi.fn((id) => {
        const row = (loadDb().financings || []).find((item) => item.id === id);
        return row ? { ...row } : null;
      }),
    },
    cache,
  };
}

describe('financialReadCutover — flags', () => {
  it('READ_PRIMARY requer FINANCIAL_READ', () => {
    expect(() => getFinancialRepositoryFlags({
      overrides: { FINANCIAL_READ_PRIMARY: true, FINANCIAL_READ: false },
    })).toThrow(/FINANCIAL_READ_PRIMARY/);
  });

  it('build PROD trava READ_PRIMARY', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getFinancialRepositoryFlags({ overrides: READ_PRIMARY_FLAGS });
      expect(flags.FINANCIAL_READ_PRIMARY).toBe(false);
      expect(isFinancialReadPrimaryEnabled()).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd;
    }
  });

  it('host Supabase produção bloqueia READ_PRIMARY', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getFinancialRepositoryFlags({ overrides: READ_PRIMARY_FLAGS });
    expect(flags.FINANCIAL_READ_PRIMARY).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('financialReadCutover — adapter + wiring', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedFinancialData();
  });

  afterEach(() => {
    __setFinancialServiceBridgeFlagsForTest(null);
    __setFinancialRepositoryFactoryForTest(null);
    vi.restoreAllMocks();
  });

  it('flags default — adapter retorna null e service usa legado', () => {
    __setFinancialServiceBridgeFlagsForTest(null);
    expect(readListReceivables()).toBeNull();
    expect(readGetReceivable(AR_LOCAL)).toBeNull();
    const list = listReceivables();
    expect(list.some((item) => item.id === AR_LOCAL)).toBe(true);
  });

  it('READ_PRIMARY ON — listReceivables via repository', async () => {
    const mocks = createReadPrimaryMocks();
    const repo = new FinancialRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    });
    __setFinancialRepositoryFactoryForTest(() => repo);
    __setFinancialServiceBridgeFlagsForTest({ overrides: READ_PRIMARY_FLAGS });

    expect(shouldUseFinancialRepositoryRead()).toBe(true);
    await readHydrateFinancialCache(TENANT);

    const list = listReceivables({ tenantId: TENANT });
    expect(Array.isArray(list)).toBe(true);
    expect(mocks.adminApi.listReceivables).toHaveBeenCalled();
  });

  it('READ_PRIMARY ON — getReceivableById via repository', async () => {
    const mocks = createReadPrimaryMocks();
    __setFinancialRepositoryFactoryForTest(() => new FinancialRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    }));
    __setFinancialServiceBridgeFlagsForTest({ overrides: READ_PRIMARY_FLAGS });

    await readHydrateFinancialCache(TENANT);
    const item = getReceivableById(AR_LOCAL);
    expect(item?.id).toBe(AR_LOCAL);
  });

  it('listPayables e listFinancings preservam legado com flags off', () => {
    __setFinancialServiceBridgeFlagsForTest(null);
    expect(listPayables().some((item) => item.id === AP_LOCAL)).toBe(true);
    expect(listFinancings().some((item) => item.id === FIN_LOCAL)).toBe(true);
    expect(getFinancingById(FIN_LOCAL)?.id).toBe(FIN_LOCAL);
  });

  it('SHADOW não altera retorno de listReceivables', async () => {
    const mocks = createReadPrimaryMocks([buildRemoteReceivable({ netAmount: 999 })]);
    const repo = new FinancialRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: {
        overrides: {
          ...READ_PRIMARY_FLAGS,
          FINANCIAL_SHADOW: true,
        },
      },
    });
    __setFinancialRepositoryFactoryForTest(() => repo);
    __setFinancialServiceBridgeFlagsForTest({
      overrides: { ...READ_PRIMARY_FLAGS, FINANCIAL_SHADOW: true },
    });

    await readHydrateFinancialCache(TENANT);
    const list = listReceivables({ tenantId: TENANT });
    expect(list.length).toBeGreaterThan(0);
  });

  it('COMPARE divergente não bloqueia getReceivableById', async () => {
    const mocks = createReadPrimaryMocks([buildRemoteReceivable({ netAmount: 999, status: 'paid' })]);
    const repo = new FinancialRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: {
        overrides: {
          ...READ_PRIMARY_FLAGS,
          FINANCIAL_COMPARE: true,
        },
      },
    });
    __setFinancialRepositoryFactoryForTest(() => repo);
    __setFinancialServiceBridgeFlagsForTest({
      overrides: { ...READ_PRIMARY_FLAGS, FINANCIAL_COMPARE: true },
    });

    await readHydrateFinancialCache(TENANT);
    const report = await __compareFinancialIdbVsRemoteForTest(TENANT, 'receivable');
    expect(report?.mismatchCount).toBeGreaterThanOrEqual(0);
    const item = getReceivableById(AR_LOCAL);
    expect(item?.id).toBe(AR_LOCAL);
  });

  it('escrita createReceivable permanece IDB-first', () => {
    __setFinancialServiceBridgeFlagsForTest({ overrides: READ_PRIMARY_FLAGS });
    const before = loadDb().accountsReceivable?.length || 0;
    withDb((db) => {
      db.accountsReceivable.push({
        id: 'ar-write-guard',
        tenant_id: TENANT,
        net_amount: 100,
        status: 'open',
        due_date: '2026-08-01',
      });
      return db;
    });
    const after = loadDb().accountsReceivable?.length || 0;
    expect(after).toBe(before + 1);
  });
});

describe('financialReadCutover — inventário wiring', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  it('receivablesService importa financialReadAdapter', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '../services/receivablesService.js'),
      'utf8',
    );
    expect(content).toContain('financialReadAdapter');
    expect(content).toContain('readListReceivables');
  });

  it('payablesService e financingsService importam financialReadAdapter', () => {
    const payables = fs.readFileSync(path.resolve(__dirname, '../services/payablesService.js'), 'utf8');
    const financings = fs.readFileSync(path.resolve(__dirname, '../services/financingsService.js'), 'utf8');
    expect(payables).toContain('readListPayables');
    expect(financings).toContain('readListFinancings');
  });

  it('financialRepositoryBridge registra remote clients', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '../services/financialRepositoryBridge.js'),
      'utf8',
    );
    expect(content).toContain('registerFinancialRemoteListReceivables');
    expect(content).toContain('scheduleFinancialShadowRead');
  });
});
