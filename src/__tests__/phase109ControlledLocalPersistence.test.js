/**
 * Phase 10.9 — Controlled Local Persistence Wiring and Database Validation
 * Testes estáticos sempre; integração local apenas com opt-in completo.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  CONTRACT_FEATURE_FLAG_DEFAULTS,
  isContractFeatureEnabled,
} from '../domain/contracts/contract-feature-flags.ts';
import {
  CONTRACT_V2_TABLES,
  createContractsV2Repositories,
  assessContractsV2DatabaseEnvironment,
  assertContractsV2LocalDatabase,
  CONTRACTS_V2_LOCAL_DATABASE_REQUIRED,
  createContractsV2TransactionManager,
  createMemoryTransactionManager,
  ContractLedgerPostgresRepository,
  ContractPersistenceConflictError,
} from '../repositories/contracts/index.ts';
import { ContractMemoryRepository } from '../domain/contracts/application/contract-memory.repository.ts';
import { ContractLedgerMemoryRepository } from '../domain/contracts/ledger/contract-ledger.repository.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function sha256(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

describe('Phase 10.9 — flags OFF', () => {
  it('todas as flags v2 permanecem false', () => {
    for (const [flag, value] of Object.entries(CONTRACT_FEATURE_FLAG_DEFAULTS)) {
      expect(value).toBe(false);
      expect(isContractFeatureEnabled(flag)).toBe(false);
    }
  });
});

describe('Phase 10.9 — environment guard', () => {
  it('memory/unavailable sempre ok', () => {
    expect(assessContractsV2DatabaseEnvironment({ mode: 'memory' }).ok).toBe(true);
    expect(assessContractsV2DatabaseEnvironment({ mode: 'unavailable' }).ok).toBe(true);
  });

  it('postgres-test sem marcadores aborta com CONTRACTS_V2_LOCAL_DATABASE_REQUIRED', () => {
    const a = assessContractsV2DatabaseEnvironment({
      mode: 'postgres-test',
      env: {},
    });
    expect(a.ok).toBe(false);
    expect(a.code).toBe(CONTRACTS_V2_LOCAL_DATABASE_REQUIRED);
    expect(() => assertContractsV2LocalDatabase({ mode: 'postgres-test', env: {} }))
      .toThrow(/CONTRACTS_V2_LOCAL_DATABASE_REQUIRED/);
  });

  it('bloqueia host remoto mesmo com opt-in', () => {
    const a = assessContractsV2DatabaseEnvironment({
      mode: 'postgres-test',
      env: {
        CONTRACTS_V2_LOCAL_DATABASE: 'true',
        RUN_SUPABASE_LOCAL_INTEGRATION: 'true',
        LOVE_ODONTO_LOCAL_DB_CONFIRMATION: 'LOCAL_DISPOSABLE_ONLY',
      },
      supabaseUrl: 'https://uoepkwhqztmsjnzirpev.supabase.co',
      projectRef: 'uoepkwhqztmsjnzirpev',
    });
    expect(a.ok).toBe(false);
    expect(a.reasons.some((r) => r.includes('production') || r.includes('host') || r.includes('ref'))).toBe(true);
  });

  it('aceita localhost com opt-in completo e sem env proibido', () => {
    const a = assessContractsV2DatabaseEnvironment({
      mode: 'postgres-test',
      env: {
        CONTRACTS_V2_LOCAL_DATABASE: 'true',
        RUN_SUPABASE_LOCAL_INTEGRATION: 'true',
        LOVE_ODONTO_LOCAL_DB_CONFIRMATION: 'LOCAL_DISPOSABLE_ONLY',
      },
      supabaseUrl: 'http://127.0.0.1:54321',
      projectId: 'love-odonto-local-disposable',
      explicitLocalMarker: true,
    });
    expect(a.ok).toBe(true);
  });
});

describe('Phase 10.9 — factory wiring', () => {
  it('default unavailable não usa Postgres automaticamente', async () => {
    const repos = createContractsV2Repositories({ mode: 'unavailable' });
    expect(repos.unavailable).toBe(true);
    await expect(repos.ledger.getLatestEntry('t', 'c')).rejects.toBeTruthy();
  });

  it('memory mode wiring + transaction manager único', async () => {
    const repos = createContractsV2Repositories({ mode: 'memory' });
    expect(repos.mode).toBe('memory');
    expect(repos.transactionManager).toBeTruthy();
    let nested = 0;
    await repos.transactionManager.withTransaction(async () => {
      nested += 1;
      await repos.transactionManager.withTransaction(async () => {
        nested += 1;
      });
    });
    expect(nested).toBe(2);
  });

  it('postgres-test sem client falha unavailable após guard', () => {
    expect(() => createContractsV2Repositories({
      mode: 'postgres-test',
      env: {
        CONTRACTS_V2_LOCAL_DATABASE: 'true',
        RUN_SUPABASE_LOCAL_INTEGRATION: 'true',
        LOVE_ODONTO_LOCAL_DB_CONFIRMATION: 'LOCAL_DISPOSABLE_ONLY',
      },
      explicitLocalMarker: true,
      projectId: 'love-odonto-local-disposable',
      supabaseUrl: 'http://127.0.0.1:54321',
      client: null,
    })).toThrow();
  });
});

describe('Phase 10.9 — nested transaction resolution', () => {
  it('memory manager faz rollback único em falha intermediária', async () => {
    const contracts = new ContractMemoryRepository();
    const ledger = new ContractLedgerMemoryRepository();
    const tx = createMemoryTransactionManager([contracts, ledger]);
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const contractId = '33333333-3333-4333-8333-333333333333';

    await expect(tx.withTransaction(async () => {
      await contracts.create(tenantId, {
        id: contractId,
        tenantId,
        contractNumber: 'CTR-2026-000001',
        documentType: 'SERVICE_CONTRACT',
        title: 'Demo',
        patientId: 'p1',
        origin: 'MANUAL',
        status: 'DRAFT',
        createdBy: 'u1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rowVersion: 1,
      });
      throw new Error('SIMULATED');
    })).rejects.toThrow('SIMULATED');

    expect(await contracts.findById(tenantId, contractId)).toBeNull();
  });

  it('createContractsV2TransactionManager reutiliza contexto (sem nested BEGIN)', async () => {
    let begins = 0;
    const client = {
      from() { throw new Error('no'); },
      async query(sql) {
        if (String(sql).toUpperCase() === 'BEGIN') begins += 1;
        return { rows: [], rowCount: 0 };
      },
    };
    const tx = createContractsV2TransactionManager(client);
    await tx.withTransaction(async () => {
      await tx.withTransaction(async () => {});
    });
    expect(begins).toBe(1);
  });
});

describe('Phase 10.9 — migration mirrors', () => {
  it('028/029/030/031 têm SHA-256 idênticos nos espelhos', () => {
    const names = [
      '028_app_contracts_v2_foundation.sql',
      '029_app_contracts_v2_rls.sql',
      '030_app_contract_ledger.sql',
      '031_app_contract_number_sequences.sql',
    ];
    for (const name of names) {
      const a = path.join(ROOT, 'supabase/migrations', name);
      const b = path.join(ROOT, 'supabase-local/migrations', name);
      const c = path.join(ROOT, 'supabase-local/supabase/migrations', name);
      expect(fs.existsSync(a)).toBe(true);
      expect(fs.existsSync(b)).toBe(true);
      expect(fs.existsSync(c)).toBe(true);
      expect(sha256(a)).toBe(sha256(b));
      expect(sha256(a)).toBe(sha256(c));
    }
  });

  it('031 contém sequences e scopes de idempotência', () => {
    const sql = fs.readFileSync(
      path.join(ROOT, 'supabase/migrations/031_app_contract_number_sequences.sql'),
      'utf8',
    );
    expect(sql).toMatch(/app_contract_number_sequences/);
    expect(sql).toMatch(/app_contract_next_number/);
    expect(sql).toMatch(/COMPLETE_CONTRACT_SIGNING/);
    expect(sql).toMatch(/NÃO EXECUTAR|nao executar/i);
  });

  it('CONTRACT_V2_TABLES inclui ledger e sequences', () => {
    expect(CONTRACT_V2_TABLES.LEDGER).toBe('app_contract_ledger');
    expect(CONTRACT_V2_TABLES.NUMBER_SEQUENCES).toBe('app_contract_number_sequences');
  });
});

describe('Phase 10.9 — concurrency error alias', () => {
  it('ContractPersistenceConflictError expõe CONTRACTS_V2_CONCURRENCY_CONFLICT', () => {
    const err = new ContractPersistenceConflictError();
    expect(err.code).toBe('OPTIMISTIC_CONCURRENCY_CONFLICT');
    expect(err.concurrencyCode).toBe('CONTRACTS_V2_CONCURRENCY_CONFLICT');
  });
});

describe('Phase 10.9 — ledger postgres stub sem client', () => {
  it('indisponível sem client', async () => {
    const repo = new ContractLedgerPostgresRepository(null);
    await expect(repo.listByContract('t', 'c')).rejects.toBeTruthy();
  });
});

describe('Phase 10.9 — fixture e runner presentes', () => {
  it('fixture SQL e runner existem', () => {
    expect(fs.existsSync(path.join(ROOT, 'supabase-local/fixtures/contracts_v2_phase109_validation.sql'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'scripts/supabase/runLocalContractsV2Validation.mjs'))).toBe(true);
    const fixture = fs.readFileSync(
      path.join(ROOT, 'supabase-local/fixtures/contracts_v2_phase109_validation.sql'),
      'utf8',
    );
    expect(fixture).toMatch(/CONTRACTS_V2_LOCAL_PASS/);
    expect(fixture).toMatch(/fk_version_cross_tenant/);
    expect(fixture).toMatch(/ledger_no_update/);
    expect(fixture).toMatch(/rls_member_a_blocked_b/);
  });
});

const integrationEnabled = process.env.RUN_SUPABASE_LOCAL_INTEGRATION === 'true'
  && process.env.LOVE_ODONTO_LOCAL_DB_CONFIRMATION === 'LOCAL_DISPOSABLE_ONLY'
  && process.env.APPLY_LOCAL_DB_RESET === 'true'
  && process.env.CONTRACTS_V2_LOCAL_DATABASE === 'true';

describe.runIf(integrationEnabled)('Phase 10.9 — integração local (opt-in)', () => {
  it('runner local passa com reset/reapply', async () => {
    const { runLocalContractsV2Validation } = await import(
      '../../scripts/supabase/runLocalContractsV2Validation.mjs'
    );
    const report = await runLocalContractsV2Validation({ env: process.env, json: false });
    expect(report.migrationsAppliedRemotely).toBe(false);
    expect(report.status).toBe('CONTRACTS_V2_LOCAL_PASS');
    expect(report.reproducibility).toBe(true);
  }, 1_200_000);
});
