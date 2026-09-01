/**
 * PHASE_10.21AC — Concorrência / estabilidade de generatedContracts (IndexedDB).
 * CONTRACT_PERSISTENCE_STABLE
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Resolvers que liberam cada saveFullDb mockado (FIFO). */
const saveBlockers = [];
const getBlockers = [];
let memoryStore = new Map();
let saveCallCount = 0;
/** Quando true, getFullDb espera release (simula IDB lento / corrida com save). */
let blockGetFullDb = false;

vi.mock('../db/idbStorage.js', () => {
  const META = '__db_meta__';
  const keysOf = (defaultState) => Object.keys(defaultState || {}).filter((key) => key !== META);
  const revisionOf = () => {
    const meta = memoryStore.get(META);
    const revision = Number(meta?.revision);
    return Number.isFinite(revision) && revision > 0 ? Math.floor(revision) : 0;
  };
  const readDb = (defaultState) => {
    const result = { ...defaultState };
    for (const key of keysOf(defaultState)) {
      if (memoryStore.has(key)) result[key] = memoryStore.get(key);
    }
    return result;
  };

  return {
    async getFullDb(defaultState) {
      if (blockGetFullDb) {
        await new Promise((resolve) => {
          getBlockers.push(resolve);
        });
      }
      return readDb(defaultState);
    },
    async getFullDbSnapshot(defaultState) {
      if (blockGetFullDb) {
        await new Promise((resolve) => {
          getBlockers.push(resolve);
        });
      }
      return { db: readDb(defaultState), revision: revisionOf() };
    },
    async saveFullDb(db, defaultState, options = {}) {
      saveCallCount += 1;
      await new Promise((resolve) => {
        saveBlockers.push(resolve);
      });
      const expectedRevision = Number.isFinite(Number(options.expectedRevision))
        ? Number(options.expectedRevision)
        : 0;
      const actualRevision = revisionOf();
      if (actualRevision !== expectedRevision) {
        const error = new Error('IndexedDB snapshot is stale; another tab committed a newer revision.');
        error.name = 'IDB_STALE_SNAPSHOT';
        error.expectedRevision = expectedRevision;
        error.actualRevision = actualRevision;
        error.timestamp = new Date().toISOString();
        throw error;
      }
      for (const key of keysOf(defaultState)) {
        const value = db[key];
        memoryStore.set(key, value === undefined ? defaultState[key] : value);
      }
      const revision = actualRevision + 1;
      memoryStore.set(META, { revision, committedAt: new Date().toISOString() });
      return { revision };
    },
    async clearIdb() {
      memoryStore = new Map();
      while (saveBlockers.length) saveBlockers.shift()();
    },
    async migrateFromLocalStorage() {
      return false;
    },
    openDb: async () => null,
  };
});

const {
  initDb,
  resetDb,
  withDb,
  loadDb,
  saveDb,
  flushDbPersistence,
} = await import('../db/index.js');

/** Espera o flush chegar a saveFullDb (microtasks da cadeia). */
async function waitForBlockedSave(timeoutMs = 1000) {
  const start = Date.now();
  while (saveBlockers.length === 0) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timeout waiting for blocked saveFullDb');
    }
    await Promise.resolve();
  }
}

async function releaseOneSave() {
  await waitForBlockedSave();
  const release = saveBlockers.shift();
  release();
  await Promise.resolve();
  await Promise.resolve();
}

/** Drena toda a fila de persistência (libera gates + await flush). */
async function drainPersistence() {
  for (let guard = 0; guard < 40; guard += 1) {
    await Promise.resolve();
    if (saveBlockers.length) {
      await releaseOneSave();
      continue;
    }
    // Cadeia pode estar entre iterações coalescidas — dá um tick e confere de novo.
    const pending = flushDbPersistence();
    const raced = Promise.race([
      pending.then(() => 'done'),
      Promise.resolve().then(() => Promise.resolve()).then(() => {
        if (saveBlockers.length) return 'blocked';
        return 'idle-check';
      }),
    ]);
    const state = await raced;
    if (state === 'done') return;
    if (state === 'blocked') continue;
    // idle-check: se ainda não done, espera um pouco mais por novo enqueue
    await Promise.resolve();
    if (!saveBlockers.length) {
      await pending;
      return;
    }
  }
  throw new Error('drainPersistence: too many iterations');
}

function seedTenant(db, tenantId = 'tenant-ac') {
  db.tenants = [{ id: tenantId, name: `Clinic ${tenantId}` }];
  db.clinicProfile = {
    id: 'clinic-1',
    nomeFantasia: 'AC Clinic',
    tenant_id: tenantId,
  };
  return db;
}

function makeContract(overrides = {}) {
  return {
    id: overrides.id || 'gc-ac-1',
    patientId: overrides.patientId || 'patient-ac-1',
    budgetId: overrides.budgetId || 'budget-ac-1',
    appointmentId: overrides.appointmentId || 'appt-ac-1',
    status: overrides.status || 'generated',
    clinicId: overrides.clinicId || 'clinic-1',
    tenant_id: overrides.tenant_id || 'tenant-ac',
    packageRefs: overrides.packageRefs || { contract: true, tcle: true, lgpd: true },
    contractNumber: overrides.contractNumber || 'C-AC-1',
    finalContent: overrides.finalContent || '<p>contrato</p>',
    ...overrides,
  };
}

describe('PHASE_10.21AC — contract persistence concurrency', () => {
  beforeEach(async () => {
    saveBlockers.length = 0;
    getBlockers.length = 0;
    blockGetFullDb = false;
    memoryStore = new Map();
    saveCallCount = 0;
    resetDb();
    await initDb();
    withDb((db) => seedTenant(db));
    await drainPersistence();
  }, 15000);

  afterEach(async () => {
    await drainPersistence().catch(() => {});
    resetDb();
  }, 15000);

  it('A — create → save → immediate hydrate: contrato permanece', async () => {
    const contract = makeContract();
    withDb((db) => {
      db.generatedContracts = [contract];
      return db;
    });
    expect(loadDb().generatedContracts.map((c) => c.id)).toEqual([contract.id]);

    const hydrate = initDb();
    await drainPersistence();
    await hydrate;

    expect(loadDb().generatedContracts).toHaveLength(1);
    expect(loadDb().generatedContracts[0].id).toBe(contract.id);
    expect(loadDb().generatedContracts[0].status).toBe('generated');
  }, 15000);

  it('B — create → initDb novamente: contrato permanece', async () => {
    withDb((db) => {
      db.generatedContracts = [makeContract({ id: 'gc-b' })];
      return db;
    });
    await drainPersistence();
    await initDb();
    await initDb();
    expect(loadDb().generatedContracts.map((c) => c.id)).toEqual(['gc-b']);
  }, 15000);

  it('C — create → route/reload via init com cache vivo: contrato permanece', async () => {
    withDb((db) => {
      db.generatedContracts = [makeContract({ id: 'gc-c', budgetId: 'b-c' })];
      return db;
    });
    await drainPersistence();
    await initDb();
    expect(loadDb().generatedContracts[0]).toMatchObject({
      id: 'gc-c',
      budgetId: 'b-c',
      patientId: 'patient-ac-1',
      appointmentId: 'appt-ac-1',
    });
  }, 15000);

  it('D — duas saveDb concorrentes (async IDB) não perdem generatedContracts', async () => {
    const base = loadDb();
    const withA = {
      ...JSON.parse(JSON.stringify(base)),
      generatedContracts: [makeContract({ id: 'gc-a-only' })],
    };
    const withAB = {
      ...JSON.parse(JSON.stringify(base)),
      generatedContracts: [
        makeContract({ id: 'gc-a-only' }),
        makeContract({ id: 'gc-b-also', patientId: 'patient-ac-2', budgetId: 'budget-2' }),
      ],
    };

    saveCallCount = 0;
    saveDb(withA);
    saveDb(withAB);

    await waitForBlockedSave();
    expect(saveBlockers.length).toBeGreaterThanOrEqual(1);

    await drainPersistence();

    const idsInMemory = (memoryStore.get('generatedContracts') || []).map((c) => c.id);
    expect(idsInMemory).toEqual(['gc-a-only', 'gc-b-also']);
    expect(loadDb().generatedContracts.map((c) => c.id)).toEqual(['gc-a-only', 'gc-b-also']);
    // Coalesce: não deve persistir o snapshot A sozinho como versão final.
    expect(idsInMemory).not.toEqual(['gc-a-only']);
  }, 15000);

  it('E — HMR-like reinit: cache vivo não é limpo por hydrate stale', async () => {
    withDb((db) => {
      db.generatedContracts = [makeContract({ id: 'gc-hmr' })];
      return db;
    });
    memoryStore.set('generatedContracts', []);

    const again = await initDb();
    expect(again.generatedContracts.map((c) => c.id)).toEqual(['gc-hmr']);
    expect(loadDb().generatedContracts[0].id).toBe('gc-hmr');

    await drainPersistence();
  }, 15000);

  it('F — contrato A não sobrescreve B (withDb sequencial + flush)', async () => {
    withDb((db) => {
      db.generatedContracts = [makeContract({ id: 'gc-A', patientId: 'pA' })];
      return db;
    });
    withDb((db) => {
      db.generatedContracts = [
        ...(db.generatedContracts || []),
        makeContract({ id: 'gc-B', patientId: 'pB', budgetId: 'bB' }),
      ];
      return db;
    });
    await drainPersistence();
    const ids = loadDb().generatedContracts.map((c) => c.id).sort();
    expect(ids).toEqual(['gc-A', 'gc-B']);
  }, 15000);

  it('G — tenant A não mistura B', async () => {
    withDb((db) => {
      seedTenant(db, 'tenant-A');
      db.generatedContracts = [
        makeContract({ id: 'gc-tA', tenant_id: 'tenant-A', clinicId: 'clinic-A' }),
      ];
      return db;
    });
    withDb((db) => {
      if (!db.tenants.some((t) => t.id === 'tenant-B')) {
        db.tenants.push({ id: 'tenant-B', name: 'B' });
      }
      db.generatedContracts = [
        ...(db.generatedContracts || []),
        makeContract({ id: 'gc-tB', tenant_id: 'tenant-B', clinicId: 'clinic-B', patientId: 'pB' }),
      ];
      return db;
    });
    await drainPersistence();
    const rows = loadDb().generatedContracts;
    expect(rows.find((c) => c.id === 'gc-tA').tenant_id).toBe('tenant-A');
    expect(rows.find((c) => c.id === 'gc-tB').tenant_id).toBe('tenant-B');
    expect(rows).toHaveLength(2);
  }, 15000);

  it('H — generatedContract conserva campos críticos', async () => {
    const contract = makeContract({
      id: 'gc-h',
      patientId: 'patient-h',
      budgetId: 'budget-h',
      appointmentId: 'appt-h',
      status: 'generated',
      packageRefs: { contractDocId: 'd1', tcleDocId: 'd2', lgpdDocId: 'd3' },
    });
    withDb((db) => {
      db.generatedContracts = [contract];
      return db;
    });
    await drainPersistence();
    const row = loadDb().generatedContracts[0];
    expect(row).toMatchObject({
      id: 'gc-h',
      patientId: 'patient-h',
      budgetId: 'budget-h',
      appointmentId: 'appt-h',
      status: 'generated',
      packageRefs: { contractDocId: 'd1', tcleDocId: 'd2', lgpdDocId: 'd3' },
    });
  }, 15000);

  it('corrida clássica: save durante init não é apagado por hydrate vazio', async () => {
    resetDb();
    memoryStore = new Map();
    saveBlockers.length = 0;
    getBlockers.length = 0;
    blockGetFullDb = true;

    const initP = initDb();
    const start = Date.now();
    while (getBlockers.length === 0) {
      if (Date.now() - start > 1000) throw new Error('getFullDb não bloqueou');
      await Promise.resolve();
    }

    withDb((db) => {
      seedTenant(db);
      db.generatedContracts = [makeContract({ id: 'gc-race' })];
      return db;
    });
    expect(loadDb().generatedContracts.map((c) => c.id)).toContain('gc-race');

    memoryStore.set('generatedContracts', []);
    getBlockers.shift()();
    await drainPersistence();
    await initP;

    blockGetFullDb = false;
    expect(loadDb().generatedContracts.map((c) => c.id)).toContain('gc-race');
  }, 15000);

  it('nested withDb não grava snapshot intermediário (registerEvent-like)', async () => {
    withDb((db) => {
      db.generatedContracts = [makeContract({ id: 'gc-nested' })];
      withDb((inner) => {
        inner.contractEvents = inner.contractEvents || [];
        inner.contractEvents.push({ id: 'evt-1', contractId: 'gc-nested' });
        return inner;
      });
      return db;
    });
    await drainPersistence();
    expect(loadDb().generatedContracts.map((c) => c.id)).toEqual(['gc-nested']);
    expect((loadDb().contractEvents || []).some((e) => e.id === 'evt-1')).toBe(true);
  }, 15000);
});

describe('PHASE_10.21AC — readiness warnings sem soft-bypass', () => {
  it('sendContractForSignature não contém soft-bypass de warnings', () => {
    const file = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../services/contractSignatureFlowService.js',
    );
    const src = fs.readFileSync(file, 'utf8');
    expect(src).not.toMatch(/isStagingTestModeEnabled/);
    expect(src).not.toMatch(/Warnings informativos não bloqueiam envio em STAGING/);
    expect(src).toMatch(/if \(!readiness\.ok\)/);
  });
});
