/**
 * Phase 5.11 — Financial Repository Foundation (structural tests only).
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb } from '../db/index.js';
import { FinancialRepository } from '../repositories/financial/financialRepository.ts';
import { createFinancialCache, FINANCIAL_CACHE_TTL_MS } from '../repositories/financial/financialCache.ts';
import {
  getFinancialRepositoryFlags,
  isFinancialReadPrimaryEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/financial/financialRepositoryFlags.ts';
import {
  mapLegacyRowToReceivableCore,
  mapServerRowToReceivableCore,
  mapCoreToReceivableLegacyRow,
  mapLegacyRowToPayableCore,
  mapServerRowToPayableCore,
  mapLegacyRowToFinancingCore,
} from '../repositories/financial/financialMapper.ts';
import { financialIndexedDbRepository } from '../repositories/financial/financialIndexedDbRepository.ts';
import {
  __setFinancialRepositoryFactoryForTest,
  __setFinancialServiceBridgeFlagsForTest,
  shouldUseFinancialRepositoryRead,
  getFinancialRepositoryForRead,
} from '../services/financialRepositoryBridge.js';
import {
  readListReceivables,
  readGetReceivable,
  readListPayables,
  readListFinancings,
} from '../services/financialReadAdapter.js';
import { FINANCIAL_TEST_FLAG_CONTRACT } from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const RECEIVABLE_ID = 'ar-foundation-001';
const PAYABLE_ID = 'ap-foundation-001';
const FINANCING_ID = 'fin-foundation-001';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../repositories/financial');

const EXPECTED_FINANCIAL_REPO_FILES = [
  'financialAdminApiRepository.ts',
  'financialCache.ts',
  'financialIndexedDbRepository.ts',
  'financialMapper.ts',
  'financialRepository.ts',
  'financialRepositoryFlags.ts',
  'financialRepositorySync.ts',
  'financialTypes.ts',
  'financialWriteAudit.ts',
  'financialWriteIdempotency.ts',
  'financialWriteSoak.ts',
].sort();

function seedFinancialContext() {
  withDb((db) => {
    db.clinicProfile = { tenant_id: TENANT };
    db.accountsReceivable = [{
      id: RECEIVABLE_ID,
      tenant_id: TENANT,
      patient_id: 'pat-001',
      origin_type: 'manual_entry',
      description: 'Consulta foundation',
      issue_date: '2026-07-09',
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
      id: PAYABLE_ID,
      tenant_id: TENANT,
      description: 'Aluguel foundation',
      due_date: '2026-07-20',
      amount: 2000,
      paid_amount: 0,
      status: 'open',
      expense_type: 'fixed',
    }];
    db.financings = [{
      id: FINANCING_ID,
      tenant_id: TENANT,
      patient_id: 'pat-001',
      status: 'active',
      approval_status: 'approved',
      total_amount: 5000,
      entry_amount: 1000,
      installments_count: 10,
    }];
    return db;
  });
}

describe('financialRepositoryFoundation — flags', () => {
  it('contrato vitest mantém flags Financeiro OFF', () => {
    expect(FINANCIAL_TEST_FLAG_CONTRACT.VITE_FINANCIAL_READ).toBe('false');
    expect(FINANCIAL_TEST_FLAG_CONTRACT.VITE_FINANCIAL_READ_PRIMARY).toBe('false');
    expect(FINANCIAL_TEST_FLAG_CONTRACT.VITE_FINANCIAL_SHADOW).toBe('false');
    expect(FINANCIAL_TEST_FLAG_CONTRACT.VITE_FINANCIAL_COMPARE).toBe('false');
    expect(FINANCIAL_TEST_FLAG_CONTRACT.VITE_FINANCIAL_WRITE).toBe('false');
    expect(FINANCIAL_TEST_FLAG_CONTRACT.VITE_FINANCIAL_DUAL_WRITE).toBe('false');
  });

  it('WRITE exige FINANCIAL_READ', () => {
    expect(() => getFinancialRepositoryFlags({
      overrides: { FINANCIAL_WRITE: true, FINANCIAL_READ: false },
    })).toThrow(/FINANCIAL_WRITE/);
  });

  it('WRITE_PRIMARY exige FINANCIAL_WRITE', () => {
    expect(() => getFinancialRepositoryFlags({
      overrides: { FINANCIAL_WRITE_PRIMARY: true, FINANCIAL_WRITE: false, FINANCIAL_READ: true },
    })).toThrow(/FINANCIAL_WRITE_PRIMARY/);
  });

  it('READ_PRIMARY exige FINANCIAL_READ', () => {
    expect(() => getFinancialRepositoryFlags({
      overrides: { FINANCIAL_READ_PRIMARY: true, FINANCIAL_READ: false },
    })).toThrow(/FINANCIAL_READ_PRIMARY/);
  });

  it('COMPARE exige path de leitura', () => {
    expect(() => getFinancialRepositoryFlags({
      overrides: { FINANCIAL_COMPARE: true, FINANCIAL_READ: false, FINANCIAL_SHADOW: false },
    })).toThrow(/FINANCIAL_COMPARE/);
  });

  it('build PROD trava READ_PRIMARY e READ', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getFinancialRepositoryFlags({
        overrides: {
          FINANCIAL_READ: true,
          FINANCIAL_READ_PRIMARY: true,
        },
      });
      expect(flags.FINANCIAL_READ_PRIMARY).toBe(false);
      expect(flags.FINANCIAL_READ).toBe(false);
      expect(isFinancialReadPrimaryEnabled()).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd;
    }
  });

  it('host Supabase produção bloqueia READ_PRIMARY e READ', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getFinancialRepositoryFlags({
      overrides: { FINANCIAL_READ: true, FINANCIAL_READ_PRIMARY: true },
    });
    expect(flags.FINANCIAL_READ_PRIMARY).toBe(false);
    expect(flags.FINANCIAL_READ).toBe(false);
    vi.unstubAllEnvs();
  });

  it('defaults — repository read desligado', () => {
    expect(shouldUseFinancialRepositoryRead()).toBe(false);
  });
});

describe('financialRepositoryFoundation — mapper', () => {
  it('mapLegacyRowToReceivableCore preserva campos core', () => {
    const core = mapLegacyRowToReceivableCore({
      id: RECEIVABLE_ID,
      tenant_id: TENANT,
      patient_id: 'pat-001',
      description: 'Consulta',
      due_date: '2026-07-15',
      net_amount: 500,
      status: 'open',
    });
    expect(core?.legacyId).toBe(RECEIVABLE_ID);
    expect(core?.tenantId).toBe(TENANT);
    expect(core?.netAmount).toBe(500);
  });

  it('mapServerRowToReceivableCore aceita snake_case remoto', () => {
    const core = mapServerRowToReceivableCore({
      tenant_id: TENANT,
      id: RECEIVABLE_ID,
      patient_id: 'pat-001',
      due_date: '2026-07-20',
      net_amount: 600,
      status: 'paid',
      description: 'Remoto',
    });
    expect(core?.legacyId).toBe(RECEIVABLE_ID);
    expect(core?.status).toBe('paid');
    expect(core?.netAmount).toBe(600);
  });

  it('mapCoreToReceivableLegacyRow roundtrip básico', () => {
    const core = mapLegacyRowToReceivableCore({
      id: RECEIVABLE_ID,
      tenant_id: TENANT,
      due_date: '2026-07-15',
      net_amount: 500,
      status: 'open',
    });
    expect(core).toBeTruthy();
    const legacy = mapCoreToReceivableLegacyRow(core);
    expect(legacy.id).toBe(RECEIVABLE_ID);
    expect(legacy.tenant_id).toBe(TENANT);
  });

  it('mapLegacyRowToPayableCore preserva amount', () => {
    const core = mapLegacyRowToPayableCore({
      id: PAYABLE_ID,
      tenant_id: TENANT,
      amount: 2000,
      status: 'open',
    });
    expect(core?.amount).toBe(2000);
  });

  it('mapServerRowToPayableCore aceita snake_case', () => {
    const core = mapServerRowToPayableCore({
      tenant_id: TENANT,
      id: PAYABLE_ID,
      amount: 1500,
      status: 'paid',
    });
    expect(core?.amount).toBe(1500);
    expect(core?.status).toBe('paid');
  });

  it('mapLegacyRowToFinancingCore preserva total_amount', () => {
    const core = mapLegacyRowToFinancingCore({
      id: FINANCING_ID,
      tenant_id: TENANT,
      total_amount: 5000,
      installments_count: 10,
      status: 'active',
    });
    expect(core?.totalAmount).toBe(5000);
    expect(core?.installmentsCount).toBe(10);
  });
});

describe('financialRepositoryFoundation — cache', () => {
  it('TTL e namespace exportados', () => {
    expect(FINANCIAL_CACHE_TTL_MS).toBe(5 * 60 * 1000);
  });

  it('cache set/get receivable por tenant e legacyId', () => {
    const cache = createFinancialCache();
    const core = mapLegacyRowToReceivableCore({
      id: RECEIVABLE_ID,
      tenant_id: TENANT,
      net_amount: 500,
      status: 'open',
    });
    expect(core).toBeTruthy();
    cache.setReceivable(TENANT, core);
    expect(cache.getReceivable(TENANT, RECEIVABLE_ID)?.netAmount).toBe(500);
    cache.invalidateTenant(TENANT);
    expect(cache.getReceivable(TENANT, RECEIVABLE_ID)).toBeNull();
  });

  it('cache suporta payable e financing', () => {
    const cache = createFinancialCache();
    const payable = mapLegacyRowToPayableCore({
      id: PAYABLE_ID,
      tenant_id: TENANT,
      amount: 2000,
      status: 'open',
    });
    const financing = mapLegacyRowToFinancingCore({
      id: FINANCING_ID,
      tenant_id: TENANT,
      total_amount: 5000,
      status: 'active',
    });
    expect(payable).toBeTruthy();
    expect(financing).toBeTruthy();
    cache.setPayable(TENANT, payable);
    cache.setFinancing(TENANT, financing);
    expect(cache.getPayable(TENANT, PAYABLE_ID)?.amount).toBe(2000);
    expect(cache.getFinancing(TENANT, FINANCING_ID)?.totalAmount).toBe(5000);
  });
});

describe('financialRepositoryFoundation — IDB reader + repository contracts', () => {
  beforeEach(async () => {
    await resetDb();
    await initDb();
    seedFinancialContext();
  });

  it('indexedDb listReceivablesLegacySync filtra por tenant', () => {
    const rows = financialIndexedDbRepository.listReceivablesLegacySync({ tenantId: TENANT });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(RECEIVABLE_ID);
  });

  it('indexedDb listPayablesLegacySync retorna payables', () => {
    const rows = financialIndexedDbRepository.listPayablesLegacySync({ tenantId: TENANT });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(PAYABLE_ID);
  });

  it('repository listReceivablesCore com flags default retorna indexeddb', async () => {
    const repo = new FinancialRepository();
    const result = await repo.listReceivablesCore(TENANT);
    expect(result.source).toBe('indexeddb');
    expect(result.total).toBe(1);
    expect(result.domain).toBe('receivable');
  });

  it('repository getReceivableCore com flags default retorna indexeddb', async () => {
    const repo = new FinancialRepository();
    const result = await repo.getReceivableCore(TENANT, RECEIVABLE_ID);
    expect(result.source).toBe('indexeddb');
    expect(result.core?.legacyId).toBe(RECEIVABLE_ID);
  });

  it('syncCacheFromRemote retorna 0 quando READ_PRIMARY off', async () => {
    const repo = new FinancialRepository();
    expect(await repo.syncCacheFromRemote(TENANT)).toBe(0);
  });

  it('compareIdbVsRemote retorna null quando COMPARE off', async () => {
    const repo = new FinancialRepository();
    expect(await repo.compareIdbVsRemote(TENANT)).toBeNull();
  });
});

describe('financialRepositoryFoundation — bridge + read adapter wiring', () => {
  afterEach(() => {
    __setFinancialServiceBridgeFlagsForTest(null);
    __setFinancialRepositoryFactoryForTest(null);
  });

  it('read adapter retorna null com flags default', () => {
    expect(readListReceivables({ tenantId: TENANT })).toBeNull();
    expect(readGetReceivable(RECEIVABLE_ID, TENANT)).toBeNull();
    expect(readListPayables({ tenantId: TENANT })).toBeNull();
    expect(readListFinancings({ tenantId: TENANT })).toBeNull();
  });

  it('bridge factory injetável em testes', () => {
    const mockRepo = {
      listReceivablesLegacySync: vi.fn(() => []),
      getReceivableLegacySync: vi.fn(() => null),
      listPayablesLegacySync: vi.fn(() => []),
      getPayableLegacySync: vi.fn(() => null),
      listFinancingsLegacySync: vi.fn(() => []),
      getFinancingLegacySync: vi.fn(() => null),
      listReceivablesCore: vi.fn(),
      getReceivableCore: vi.fn(),
      listPayablesCore: vi.fn(),
      getPayableCore: vi.fn(),
      listFinancingsCore: vi.fn(),
      getFinancingCore: vi.fn(),
      syncCacheFromRemote: vi.fn(),
      compareIdbVsRemote: vi.fn(),
    };
    __setFinancialRepositoryFactoryForTest(() => mockRepo);
    expect(getFinancialRepositoryForRead()).toBe(mockRepo);
  });
});

describe('financialRepositoryFoundation — inventário de arquivos', () => {
  it('módulo financial contém apenas arquivos esperados da foundation', () => {
    const files = readdirSync(REPO_ROOT).sort();
    expect(files).toEqual(EXPECTED_FINANCIAL_REPO_FILES);
  });
});

describe('financialRepositoryFoundation — services wired (Phase 5.12)', () => {
  it('receivablesService importa financialReadAdapter', async () => {
    const content = await import('node:fs').then((fs) => fs.readFileSync(
      path.resolve(__dirname, '../services/receivablesService.js'),
      'utf8',
    ));
    expect(content).toContain('financialReadAdapter');
    expect(content).toContain('readListReceivables');
  });

  it('payablesService importa financialReadAdapter', async () => {
    const content = await import('node:fs').then((fs) => fs.readFileSync(
      path.resolve(__dirname, '../services/payablesService.js'),
      'utf8',
    ));
    expect(content).toContain('financialReadAdapter');
  });

  it('financingsService importa financialReadAdapter', async () => {
    const content = await import('node:fs').then((fs) => fs.readFileSync(
      path.resolve(__dirname, '../services/financingsService.js'),
      'utf8',
    ));
    expect(content).toContain('financialReadAdapter');
  });

  it('receivablesService importa financialWriteAdapter (Phase 5.13)', async () => {
    const content = await import('node:fs').then((fs) => fs.readFileSync(
      path.resolve(__dirname, '../services/receivablesService.js'),
      'utf8',
    ));
    expect(content).toContain('financialWriteAdapter');
    expect(content).toContain('scheduleFinancialDualWriteCreateReceivable');
  });
});
