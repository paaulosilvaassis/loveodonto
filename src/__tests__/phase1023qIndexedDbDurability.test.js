/**
 * PATCH B.2Q — IndexedDB durability: commit visível, payload não se perde, gerações seguras.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const saveBlockers = [];
let memoryStore = new Map();
let saveCallCount = 0;
let nextSaveResult = 'succeed';
const committedEpochMarkers = [];

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
      return readDb(defaultState);
    },
    async getFullDbSnapshot(defaultState) {
      return { db: readDb(defaultState), revision: revisionOf() };
    },
    async saveFullDb(db, defaultState, options = {}) {
      saveCallCount += 1;
      const marker = db?.__persistMarker || db?.generatedContracts?.[0]?.id || `save-${saveCallCount}`;
      if (nextSaveResult === 'block') {
        await new Promise((resolve, reject) => {
          saveBlockers.push({ resolve, reject, db, marker });
        });
      } else if (nextSaveResult === 'fail') {
        const error = new Error('transaction failed');
        error.name = 'UnknownError';
        throw error;
      } else if (nextSaveResult === 'abort') {
        const error = new Error('transaction aborted');
        error.name = 'AbortError';
        throw error;
      }
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
      committedEpochMarkers.push(marker);
      return { revision };
    },
    async clearIdb() {
      memoryStore = new Map();
      while (saveBlockers.length) {
        saveBlockers.shift().resolve();
      }
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
  getDbPersistenceStatus,
} = await import('../db/index.js');

async function waitForBlockedSave(timeoutMs = 1000) {
  const start = Date.now();
  while (saveBlockers.length === 0) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timeout waiting for blocked saveFullDb');
    }
    await Promise.resolve();
  }
}

function snapshotWithMarker(marker, extra = {}) {
  const base = loadDb();
  return {
    ...JSON.parse(JSON.stringify(base)),
    __persistMarker: marker,
    generatedContracts: [{ id: marker, status: extra.status || 'draft' }],
    ...extra,
  };
}

describe('PHASE_10.23Q — IndexedDB durability flush', () => {
  beforeEach(async () => {
    saveBlockers.length = 0;
    memoryStore = new Map();
    saveCallCount = 0;
    nextSaveResult = 'succeed';
    committedEpochMarkers.length = 0;
    resetDb();
    nextSaveResult = 'succeed';
    await initDb();
    await flushDbPersistence().catch(() => {});
    committedEpochMarkers.length = 0;
    saveCallCount = 0;
  });

  afterEach(async () => {
    nextSaveResult = 'succeed';
    while (saveBlockers.length) saveBlockers.shift().resolve();
    await flushDbPersistence().catch(() => {});
    resetDb();
  });

  it('Q01 successful flush resolves only after transaction commit', async () => {
    nextSaveResult = 'block';
    saveDb(snapshotWithMarker('q01'));
    const flushP = flushDbPersistence();
    let resolved = false;
    flushP.then(() => { resolved = true; });
    await waitForBlockedSave();
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(getDbPersistenceStatus().inFlight).toBe(true);
    expect(getDbPersistenceStatus().dirty).toBe(true);

    saveBlockers.shift().resolve();
    await flushP;
    expect(resolved).toBe(true);
    expect(committedEpochMarkers).toContain('q01');
    expect(committedEpochMarkers.filter((m) => m === 'q01')).toHaveLength(1);
    expect(getDbPersistenceStatus().dirty).toBe(false);
    expect(getDbPersistenceStatus().pending).toBe(false);
  });

  it('Q02 transaction failure rejects flush', async () => {
    nextSaveResult = 'fail';
    saveDb(snapshotWithMarker('q02'));
    await expect(flushDbPersistence()).rejects.toMatchObject({
      message: 'transaction failed',
    });
    expect(committedEpochMarkers).not.toContain('q02');
  });

  it('Q03 transaction abort rejects flush', async () => {
    nextSaveResult = 'abort';
    saveDb(snapshotWithMarker('q03'));
    await expect(flushDbPersistence()).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(committedEpochMarkers).not.toContain('q03');
  });

  it('Q04 failed payload is not silently discarded', async () => {
    nextSaveResult = 'fail';
    saveDb(snapshotWithMarker('q04'));
    await expect(flushDbPersistence()).rejects.toBeTruthy();
    const status = getDbPersistenceStatus();
    expect(status.pending).toBe(true);
    expect(status.dirty).toBe(true);
    expect(loadDb().generatedContracts[0].id).toBe('q04');
    expect((memoryStore.get('generatedContracts') || []).map((c) => c.id)).not.toContain('q04');
  });

  it('Q05 newer payload arriving during older in-flight commit survives', async () => {
    nextSaveResult = 'block';
    saveDb(snapshotWithMarker('q05-old'));
    await waitForBlockedSave();
    saveDb(snapshotWithMarker('q05-new'));
    expect(getDbPersistenceStatus().pending).toBe(true);

    nextSaveResult = 'succeed';
    saveBlockers.shift().resolve();
    await flushDbPersistence();
    expect(committedEpochMarkers[committedEpochMarkers.length - 1]).toBe('q05-new');
    expect((memoryStore.get('generatedContracts') || []).map((c) => c.id)).toEqual(['q05-new']);
  });

  it('Q06 older success cannot clear newer pending payload', async () => {
    nextSaveResult = 'block';
    saveDb(snapshotWithMarker('q06-a'));
    const firstFlush = flushDbPersistence();
    await waitForBlockedSave();
    saveDb(snapshotWithMarker('q06-b'));
    expect(getDbPersistenceStatus().pending).toBe(true);
    nextSaveResult = 'succeed';
    saveBlockers.shift().resolve();
    await firstFlush;
    expect((memoryStore.get('generatedContracts') || []).map((c) => c.id)).toEqual(['q06-b']);
    expect(loadDb().generatedContracts[0].id).toBe('q06-b');
  });

  it('Q07 older failure cannot overwrite newer pending payload with stale state', async () => {
    nextSaveResult = 'block';
    saveDb(snapshotWithMarker('q07-old'));
    const firstFlush = flushDbPersistence();
    await waitForBlockedSave();
    saveDb(snapshotWithMarker('q07-new'));
    saveBlockers.shift().reject(Object.assign(new Error('old failed'), { name: 'UnknownError' }));
    await expect(firstFlush).rejects.toBeTruthy();
    expect(getDbPersistenceStatus().pending).toBe(true);
    expect(loadDb().generatedContracts[0].id).toBe('q07-new');

    nextSaveResult = 'succeed';
    await flushDbPersistence();
    expect((memoryStore.get('generatedContracts') || []).map((c) => c.id)).toEqual(['q07-new']);
    expect(committedEpochMarkers).not.toContain('q07-old');
  });

  it('Q08 retry after failure can persist newest payload', async () => {
    nextSaveResult = 'fail';
    saveDb(snapshotWithMarker('q08'));
    await expect(flushDbPersistence()).rejects.toBeTruthy();
    expect(getDbPersistenceStatus().pending).toBe(true);

    nextSaveResult = 'succeed';
    await flushDbPersistence();
    expect((memoryStore.get('generatedContracts') || []).map((c) => c.id)).toEqual(['q08']);
    expect(getDbPersistenceStatus().dirty).toBe(false);
    expect(getDbPersistenceStatus().pending).toBe(false);
  });

  it('Q09 flush with no pending work resolves safely', async () => {
    await expect(flushDbPersistence()).resolves.toBeUndefined();
    expect(getDbPersistenceStatus().pending).toBe(false);
    expect(getDbPersistenceStatus().inFlight).toBe(false);
  });

  it('Q10 multiple coalesced saves persist newest state', async () => {
    nextSaveResult = 'block';
    saveDb(snapshotWithMarker('q10-a'));
    saveDb(snapshotWithMarker('q10-b'));
    saveDb(snapshotWithMarker('q10-c'));
    await waitForBlockedSave();
    saveBlockers.shift().resolve();
    await flushDbPersistence();
    expect((memoryStore.get('generatedContracts') || []).map((c) => c.id)).toEqual(['q10-c']);
    expect(committedEpochMarkers[committedEpochMarkers.length - 1]).toBe('q10-c');
  });

  it('Q11 lastPersistError populated on failure', async () => {
    nextSaveResult = 'fail';
    saveDb(snapshotWithMarker('q11'));
    await expect(flushDbPersistence()).rejects.toBeTruthy();
    const err = getDbPersistenceStatus().lastPersistError;
    expect(err).toBeTruthy();
    expect(err.name).toBe('UnknownError');
    expect(err.message).toBe('transaction failed');
    expect(err.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof err.epoch).toBe('number');
    expect(typeof err.generation).toBe('number');
    expect(err).not.toHaveProperty('payload');
    expect(JSON.stringify(err)).not.toMatch(/q11-secret|full_name/);
  });

  it('Q12 lastPersistError cleared after successful retry', async () => {
    nextSaveResult = 'fail';
    saveDb(snapshotWithMarker('q12'));
    await expect(flushDbPersistence()).rejects.toBeTruthy();
    expect(getDbPersistenceStatus().lastPersistError).toBeTruthy();

    nextSaveResult = 'succeed';
    await flushDbPersistence();
    expect(getDbPersistenceStatus().lastPersistError).toBeNull();
  });

  it('Q13 lastCommittedEpoch advances only after actual commit', async () => {
    nextSaveResult = 'block';
    const before = getDbPersistenceStatus().lastCommittedEpoch;
    saveDb(snapshotWithMarker('q13'));
    const mid = getDbPersistenceStatus();
    expect(mid.lastCommittedEpoch).toBe(before);
    expect(mid.saveEpoch).toBeGreaterThan(before);
    expect(mid.dirty).toBe(true);

    const flushP = flushDbPersistence();
    await waitForBlockedSave();
    expect(getDbPersistenceStatus().lastCommittedEpoch).toBe(before);
    saveBlockers.shift().resolve();
    await flushP;
    expect(getDbPersistenceStatus().lastCommittedEpoch).toBe(getDbPersistenceStatus().saveEpoch);
  });

  it('Q14 cachedDb may be ahead of persisted DB but runtime exposes dirty state', async () => {
    nextSaveResult = 'block';
    saveDb(snapshotWithMarker('q14'));
    expect(loadDb().generatedContracts[0].id).toBe('q14');
    await waitForBlockedSave();
    expect((memoryStore.get('generatedContracts') || []).map((c) => c.id)).not.toContain('q14');
    expect(getDbPersistenceStatus().dirty).toBe(true);
    saveBlockers.shift().resolve();
    await flushDbPersistence();
    expect(getDbPersistenceStatus().dirty).toBe(false);
  });

  it('Q15 persistence failure cannot be mistaken for durable success', async () => {
    nextSaveResult = 'fail';
    saveDb(snapshotWithMarker('q15'));
    const result = await flushDbPersistence().then(
      () => 'resolved',
      () => 'rejected',
    );
    expect(result).toBe('rejected');
    const status = getDbPersistenceStatus();
    expect(status.dirty).toBe(true);
    expect(status.lastPersistError).toBeTruthy();
    expect(status.lastCommittedEpoch).toBeLessThan(status.saveEpoch);
    expect((memoryStore.get('generatedContracts') || []).map((c) => c.id)).not.toContain('q15');
  });

  it('withDb remains synchronous and does not await IDB', () => {
    nextSaveResult = 'block';
    const returned = withDb((db) => {
      db.generatedContracts = [{ id: 'sync-domain' }];
      return db;
    });
    expect(returned?.generatedContracts?.[0]?.id || loadDb().generatedContracts[0].id).toBe('sync-domain');
    expect(getDbPersistenceStatus().dirty).toBe(true);
  });
});
