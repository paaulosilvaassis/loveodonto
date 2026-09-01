/**
 * PATCH B.2Y — NO_CHANGE / no-op automatic persistence (Y01–Y14).
 * Sem stringify do banco inteiro. Sem write de produção.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as idb from '../db/idbStorage.js';
import { defaultDbState } from '../db/schema.js';
import {
  createEmptyDbRuntime,
  useDbRuntime,
  resetDb,
  withDb,
  saveDb,
  loadDb,
  flushDbPersistence,
  getDbPersistenceStatus,
  reloadDbFromPersistence,
  DB_NO_CHANGE,
} from '../db/index.js';
import { IDB_STALE_SNAPSHOT } from '../db/idbRevision.js';
import { syncTenantClinicProfileToLocalDb } from '../services/tenantClinicProfileSync.js';
import { ensureFinancialPartnersSeeded } from '../services/financialPartnersService.js';
import { ensureClinicalGuidesSeeded } from '../services/clinicalGuide/clinicalGuideService.js';
import { cancelUnsignedContract } from '../services/contractLifecycleCommandService.js';

const TENANT_ID = 'b2f95268-101c-42cb-8a8e-8d3681aa7dfa';
const SERVER_PROFILE = {
  id: 'uuid-y',
  tenant_id: TENANT_ID,
  clinic_id: 'clinic-b2f95268',
  name: 'Implanprime Odontologia e Estética',
  fantasy_name: 'Implanprime Odontologia e Estética',
  legal_name: 'Prime Gestão Odontologica',
  logo_url: 'https://cdn.example/logo-y.png',
  email: 'contato@implanprime.com.br',
  cnpj: '12.345.678/0001-99',
  status: 'active',
};

const admin = {
  id: 'user-y-admin',
  role: 'admin',
  tenant_id: 'tenant-y',
  tenantId: 'tenant-y',
  name: 'Admin Y',
};

async function bootClean() {
  useDbRuntime(createEmptyDbRuntime());
  resetDb();
  await idb.clearIdb();
  saveDb(defaultDbState());
  await flushDbPersistence();
}

async function persistedRevision() {
  const snap = await idb.getFullDbSnapshot(defaultDbState());
  return snap.revision;
}

describe('PHASE_10.23Y — no-op automatic persistence', () => {
  let saveSpy;
  let updatedEvents;

  beforeEach(async () => {
    updatedEvents = [];
    const prevDispatch = globalThis.window.dispatchEvent.bind(globalThis.window);
    vi.spyOn(globalThis.window, 'dispatchEvent').mockImplementation((event) => {
      if (event && event.type === 'db:updated') updatedEvents.push(event);
      return prevDispatch(event);
    });
    saveSpy = vi.spyOn(idb, 'saveFullDb');
    await bootClean();
    saveSpy.mockClear();
    updatedEvents.length = 0;
  });

  afterEach(async () => {
    await flushDbPersistence().catch(() => {});
    resetDb();
    await idb.clearIdb();
    vi.restoreAllMocks();
  });

  it('Y01 explicit NO_CHANGE withDb does not increment saveEpoch', async () => {
    const before = getDbPersistenceStatus().saveEpoch;
    const result = withDb(() => DB_NO_CHANGE);
    expect(result).toBe(DB_NO_CHANGE);
    expect(getDbPersistenceStatus().saveEpoch).toBe(before);
  });

  it('Y02 NO_CHANGE does not create latestPersistPayload', async () => {
    await flushDbPersistence();
    expect(getDbPersistenceStatus().pending).toBe(false);
    withDb(() => DB_NO_CHANGE);
    expect(getDbPersistenceStatus().pending).toBe(false);
    expect(getDbPersistenceStatus().dirty).toBe(false);
  });

  it('Y03 NO_CHANGE does not call saveFullDb', async () => {
    saveSpy.mockClear();
    withDb(() => DB_NO_CHANGE);
    await flushDbPersistence();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('Y04 NO_CHANGE does not increment persisted revision', async () => {
    const before = await persistedRevision();
    withDb(() => DB_NO_CHANGE);
    await flushDbPersistence();
    expect(await persistedRevision()).toBe(before);
    expect(getDbPersistenceStatus().lastCommittedRevision).toBe(before);
  });

  it('Y05 NO_CHANGE does not dispatch db:updated', () => {
    updatedEvents.length = 0;
    withDb(() => DB_NO_CHANGE);
    expect(updatedEvents).toHaveLength(0);
  });

  it('Y06 TenantProvider/profile sync with identical meaningful data = NO_CHANGE', async () => {
    syncTenantClinicProfileToLocalDb(SERVER_PROFILE, TENANT_ID);
    await flushDbPersistence();
    const epoch = getDbPersistenceStatus().saveEpoch;
    const rev = await persistedRevision();
    saveSpy.mockClear();
    updatedEvents.length = 0;
    syncTenantClinicProfileToLocalDb(SERVER_PROFILE, TENANT_ID);
    await flushDbPersistence();
    expect(getDbPersistenceStatus().saveEpoch).toBe(epoch);
    expect(await persistedRevision()).toBe(rev);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(updatedEvents).toHaveLength(0);
  });

  it('Y07 periodic identical tenant sync repeated N times = zero additional commits', async () => {
    syncTenantClinicProfileToLocalDb(SERVER_PROFILE, TENANT_ID);
    await flushDbPersistence();
    const rev = await persistedRevision();
    saveSpy.mockClear();
    for (let i = 0; i < 5; i += 1) {
      syncTenantClinicProfileToLocalDb(SERVER_PROFILE, TENANT_ID);
    }
    await flushDbPersistence();
    expect(await persistedRevision()).toBe(rev);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('Y08 actual tenant profile field change = exactly one commit', async () => {
    syncTenantClinicProfileToLocalDb(SERVER_PROFILE, TENANT_ID);
    await flushDbPersistence();
    const rev = await persistedRevision();
    saveSpy.mockClear();
    syncTenantClinicProfileToLocalDb({
      ...SERVER_PROFILE,
      email: 'novo@implanprime.com.br',
    }, TENANT_ID);
    await flushDbPersistence();
    expect(await persistedRevision()).toBe(rev + 1);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(loadDb().clinicProfile.emailPrincipal).toBe('novo@implanprime.com.br');
  });

  it('Y09 financial seed already present = zero commit', async () => {
    ensureFinancialPartnersSeeded();
    await flushDbPersistence();
    const rev = await persistedRevision();
    saveSpy.mockClear();
    ensureFinancialPartnersSeeded();
    await flushDbPersistence();
    expect(await persistedRevision()).toBe(rev);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('Y10 missing financial seed = legitimate commit', async () => {
    withDb((db) => {
      db.financialPartners = [];
      return db;
    });
    await flushDbPersistence();
    const rev = await persistedRevision();
    saveSpy.mockClear();
    ensureFinancialPartnersSeeded();
    await flushDbPersistence();
    expect(await persistedRevision()).toBe(rev + 1);
    expect((loadDb().financialPartners || []).length).toBeGreaterThan(0);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('Y11 clinical guide seed already present = zero commit', async () => {
    ensureClinicalGuidesSeeded();
    await flushDbPersistence();
    const rev = await persistedRevision();
    saveSpy.mockClear();
    ensureClinicalGuidesSeeded();
    await flushDbPersistence();
    expect(await persistedRevision()).toBe(rev);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('Y12 real patient mutation still commits and increments revision', async () => {
    const rev = await persistedRevision();
    saveSpy.mockClear();
    withDb((db) => {
      db.patients = Array.isArray(db.patients) ? db.patients : [];
      db.patients.push({
        id: 'patient-y12',
        tenant_id: 'tenant-1',
        full_name: 'Paciente Y12',
        created_at: '2026-09-01T00:00:00.000Z',
      });
      return db;
    });
    await flushDbPersistence();
    expect(await persistedRevision()).toBe(rev + 1);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect((loadDb().patients || []).some((p) => p.id === 'patient-y12')).toBe(true);
  });

  it('Y13 real contract lifecycle mutation still commits and increments revision', async () => {
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-y13',
        contractNumber: 'CTR-Y-13',
        clinicId: 'clinic-1',
        tenantId: 'tenant-y',
        tenant_id: 'tenant-y',
        patientId: 'pat-y',
        status: 'draft',
      }];
      return db;
    });
    await flushDbPersistence();
    const rev = await persistedRevision();
    saveSpy.mockClear();
    const result = cancelUnsignedContract({
      user: admin,
      contractId: 'gctr-y13',
      reason: 'teste y13 lifecycle still persists',
    });
    await flushDbPersistence();
    expect(result.ok).toBe(true);
    expect(result.action).toBe('CANCEL_UNSIGNED');
    expect(await persistedRevision()).toBe(rev + 1);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(loadDb().generatedContracts.find((c) => c.id === 'gctr-y13').status).toBe('canceled');
  });

  it('Y14 two tabs with real concurrent writes still produce IDB_STALE_SNAPSHOT', async () => {
    const tabA = createEmptyDbRuntime();
    const tabB = createEmptyDbRuntime();
    useDbRuntime(tabA);
    await reloadDbFromPersistence({ discardLocalRuntime: true });
    useDbRuntime(tabB);
    await reloadDbFromPersistence({ discardLocalRuntime: true });

    useDbRuntime(tabA);
    withDb((db) => {
      db.patients = [...(db.patients || []), { id: 'patient-y14-a', tenant_id: 'tenant-1' }];
      return db;
    });
    await flushDbPersistence();
    expect(getDbPersistenceStatus().lastCommittedRevision).toBeGreaterThan(0);

    useDbRuntime(tabB);
    withDb((db) => {
      db.appointments = [...(db.appointments || []), { id: 'appt-y14-b', tenant_id: 'tenant-1' }];
      return db;
    });
    await expect(flushDbPersistence()).rejects.toMatchObject({ name: IDB_STALE_SNAPSHOT });
  });
});
