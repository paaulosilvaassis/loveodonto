/**
 * Adapter de escrita Pacientes — CLOUD.3 dual-write + CLOUD.7 WRITE_PRIMARY.
 *
 * Dual (WRITE + DUAL_WRITE, sem WRITE_PRIMARY):
 *   IDB legado → microtask remote best-effort
 *
 * Primary (WRITE + WRITE_PRIMARY):
 *   remote commit await → atualizar cache IDB → sucesso UI
 *   falha remota → sem sucesso local / sem toast
 *   falha de cache pós-remote → cloud permanece SSOT (sem rollback destrutivo)
 */
import { withDb } from '../db/index.js';
import { mapCoreToIndexedDbMirror } from '../repositories/patient/patientMapper.ts';
import { normalizeTenantId } from './tenantIsolation.js';
import {
  getPatientRepositoryForRead,
  schedulePatientCacheRehydrate,
  schedulePatientShadowRead,
  shouldUsePatientRepositoryWrite,
  shouldUsePatientRepositoryWritePrimary,
} from './patientRepositoryBridge.js';

const SAAS_TENANT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PatientRemoteWriteError extends Error {
  constructor(message, code = 'PATIENT_REMOTE_WRITE_FAILED') {
    super(message);
    this.name = 'PatientRemoteWriteError';
    this.code = code;
  }
}

function logPatientWriteAdapterDev(event, payload) {
  if (!import.meta.env?.DEV) return;
  console.debug('[PATIENT_WRITE]', event, payload);
}

async function runDualWriteSafe(runner, context) {
  try {
    await runner();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || 'dual-write failed');
    logPatientWriteAdapterDev(context.event, {
      ...context,
      ok: false,
      error: message,
      rollback: 'indexeddb-preserved',
    });
    return { ok: false, error: message };
  }
}

function resolveTenantId(user, patient) {
  return normalizeTenantId(
    patient?.tenant_id || patient?.tenantId || user?.tenantId || user?.tenant_id,
  );
}

function assertWritePrimaryTenant(tenantId) {
  const tid = normalizeTenantId(tenantId);
  if (!tid || !SAAS_TENANT_UUID_RE.test(tid)) {
    throw new PatientRemoteWriteError(
      'tenant UUID SaaS obrigatório para WRITE_PRIMARY.',
      'TENANT_UUID_REQUIRED',
    );
  }
  return tid;
}

function toRepoUser(user, tenantId) {
  return {
    id: user?.id || 'unknown',
    tenantId,
    tenant_id: tenantId,
  };
}

function mapPatientToCreateDto(patient) {
  return {
    legacyId: patient.id,
    fullName: patient.full_name,
    nickname: patient.nickname || '',
    socialName: patient.social_name || '',
    sex: patient.sex || '',
    birthDate: patient.birth_date || '',
    cpf: patient.cpf || '',
    guid: patient.guid,
    leadSource: patient.lead_source || '',
    hasFinancialResponsible: Boolean(patient.has_financial_responsible),
    dependentFullName: patient.dependent_full_name || '',
    tags: Array.isArray(patient.tags) ? patient.tags : [],
  };
}

function mapPatientToUpdateDto(patient, partial = {}) {
  return {
    fullName: partial.full_name ?? partial.fullName ?? patient.full_name,
    nickname: partial.nickname ?? patient.nickname,
    socialName: partial.social_name ?? partial.socialName ?? patient.social_name,
    sex: partial.sex ?? patient.sex,
    birthDate: partial.birth_date ?? partial.birthDate ?? patient.birth_date,
    cpf: partial.cpf ?? patient.cpf,
    status: partial.status ?? patient.status,
    blocked: partial.blocked ?? patient.blocked,
    tags: partial.tags ?? patient.tags,
    leadSource: partial.lead_source ?? partial.leadSource ?? patient.lead_source,
    hasFinancialResponsible:
      partial.has_financial_responsible ?? partial.hasFinancialResponsible
        ?? patient.has_financial_responsible,
    dependentFullName:
      partial.dependent_full_name ?? partial.dependentFullName
        ?? patient.dependent_full_name,
  };
}

/**
 * Aplica espelho canônico no IDB. Nunca limpa o DB.
 * Soft-delete: remove da listagem ativa local (row física remota preservada).
 */
function applyCacheFromRemoteCore(core, { softDeleted = false } = {}) {
  if (!core?.legacyId) return false;
  withDb((db) => {
    if (!Array.isArray(db.patients)) db.patients = [];
    const idx = db.patients.findIndex((row) => row?.id === core.legacyId);
    if (softDeleted || core.deletedAt) {
      if (idx >= 0) {
        db.patients[idx] = {
          ...db.patients[idx],
          status: 'inactive',
          deleted_at: core.deletedAt || new Date().toISOString(),
          updated_at: core.updatedAt || new Date().toISOString(),
        };
      }
      return db;
    }
    const mirror = mapCoreToIndexedDbMirror(core);
    if (idx >= 0) {
      db.patients[idx] = { ...db.patients[idx], ...mirror };
    } else {
      db.patients.push(mirror);
    }
    return db;
  });
  return true;
}

async function hydrateCacheAfterRemote(tenantId, core, options = {}) {
  try {
    if (options.softDeleted) {
      applyCacheFromRemoteCore(
        {
          ...core,
          legacyId: core?.legacyId || options.legacyId,
          deletedAt: core?.deletedAt || new Date().toISOString(),
          status: 'inactive',
        },
        { softDeleted: true },
      );
      return { cacheUpdated: true };
    }
    const repo = getPatientRepositoryForRead();
    await repo.hydratePatients([core], { tenantId });
    return { cacheUpdated: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || 'cache failed');
    logPatientWriteAdapterDev('cache-after-remote-failed', {
      tenantId,
      legacyId: core?.legacyId || options.legacyId,
      error: message,
      remoteCommitted: true,
      rollbackRemote: false,
    });
    schedulePatientCacheRehydrate(tenantId);
    return { cacheUpdated: false, cacheError: message };
  }
}

/**
 * Dual-write assíncrono pós-create IDB — no-op se flags off / WRITE_PRIMARY.
 */
export function schedulePatientDualWriteCreate(user, patient) {
  if (!shouldUsePatientRepositoryWrite()) return;
  const tenantId = resolveTenantId(user, patient);
  if (!tenantId) return;
  queueMicrotask(() => {
    void runDualWriteSafe(
      async () => {
        const repo = getPatientRepositoryForRead();
        await repo.createCore(
          toRepoUser(user, tenantId),
          mapPatientToCreateDto(patient),
        );
        schedulePatientShadowRead(tenantId);
        logPatientWriteAdapterDev('create', { tenantId, legacyId: patient?.id, ok: true });
      },
      { event: 'create', tenantId, legacyId: patient?.id, userId: user?.id },
    );
  });
}

export function schedulePatientDualWriteUpdate(user, patient, partial = {}) {
  if (!shouldUsePatientRepositoryWrite()) return;
  const tenantId = resolveTenantId(user, patient);
  if (!tenantId) return;
  queueMicrotask(() => {
    void runDualWriteSafe(
      async () => {
        const repo = getPatientRepositoryForRead();
        await repo.updateCore(
          toRepoUser(user, tenantId),
          patient.id,
          mapPatientToUpdateDto(patient, partial),
        );
        schedulePatientShadowRead(tenantId);
        logPatientWriteAdapterDev('update', { tenantId, legacyId: patient?.id, ok: true });
      },
      { event: 'update', tenantId, legacyId: patient?.id, userId: user?.id },
    );
  });
}

export function schedulePatientDualWriteSoftDelete(user, patient) {
  if (!shouldUsePatientRepositoryWrite()) return;
  const tenantId = resolveTenantId(user, patient);
  if (!tenantId) return;
  queueMicrotask(() => {
    void runDualWriteSafe(
      async () => {
        const repo = getPatientRepositoryForRead();
        await repo.softDeleteCore(toRepoUser(user, tenantId), patient.id);
        schedulePatientShadowRead(tenantId);
        logPatientWriteAdapterDev('softDelete', { tenantId, legacyId: patient?.id, ok: true });
      },
      { event: 'softDelete', tenantId, legacyId: patient?.id, userId: user?.id },
    );
  });
}

/**
 * CLOUD.7 — CREATE remote-first.
 * @returns {Promise<{ ok: true, remoteCommitted: true, cacheUpdated: boolean, core: object, profile: object }>}
 */
export async function commitPatientWritePrimaryCreate(user, patient) {
  if (!shouldUsePatientRepositoryWritePrimary()) {
    throw new PatientRemoteWriteError('WRITE_PRIMARY desabilitado.', 'WRITE_PRIMARY_OFF');
  }
  const tenantId = assertWritePrimaryTenant(resolveTenantId(user, patient));
  const repo = getPatientRepositoryForRead();
  let remote;
  try {
    remote = await repo.createCore(toRepoUser(user, tenantId), mapPatientToCreateDto(patient));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || 'remote create failed');
    logPatientWriteAdapterDev('create-primary-failed', { tenantId, legacyId: patient?.id, error: message });
    throw new PatientRemoteWriteError(message, 'REMOTE_CREATE_FAILED');
  }
  const cache = await hydrateCacheAfterRemote(tenantId, remote);
  schedulePatientShadowRead(tenantId);
  const profile = mapCoreToIndexedDbMirror(remote);
  logPatientWriteAdapterDev('create-primary', {
    tenantId,
    legacyId: remote.legacyId,
    ok: true,
    cacheUpdated: cache.cacheUpdated,
  });
  return {
    ok: true,
    remoteCommitted: true,
    cacheUpdated: Boolean(cache.cacheUpdated),
    cacheError: cache.cacheError || null,
    core: remote,
    profile,
  };
}

/**
 * CLOUD.7 — UPDATE remote-first.
 */
export async function commitPatientWritePrimaryUpdate(user, patientId, patient, partial = {}) {
  if (!shouldUsePatientRepositoryWritePrimary()) {
    throw new PatientRemoteWriteError('WRITE_PRIMARY desabilitado.', 'WRITE_PRIMARY_OFF');
  }
  const tenantId = assertWritePrimaryTenant(resolveTenantId(user, patient));
  const repo = getPatientRepositoryForRead();
  let remote;
  try {
    remote = await repo.updateCore(
      toRepoUser(user, tenantId),
      patientId,
      mapPatientToUpdateDto(patient, partial),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || 'remote update failed');
    logPatientWriteAdapterDev('update-primary-failed', { tenantId, legacyId: patientId, error: message });
    throw new PatientRemoteWriteError(message, 'REMOTE_UPDATE_FAILED');
  }
  const cache = await hydrateCacheAfterRemote(tenantId, remote);
  schedulePatientShadowRead(tenantId);
  const profile = mapCoreToIndexedDbMirror(remote);
  logPatientWriteAdapterDev('update-primary', {
    tenantId,
    legacyId: patientId,
    ok: true,
    cacheUpdated: cache.cacheUpdated,
  });
  return {
    ok: true,
    remoteCommitted: true,
    cacheUpdated: Boolean(cache.cacheUpdated),
    cacheError: cache.cacheError || null,
    core: remote,
    profile,
  };
}

/**
 * CLOUD.7 — SOFT DELETE remote-first.
 */
export async function commitPatientWritePrimarySoftDelete(user, patient) {
  if (!shouldUsePatientRepositoryWritePrimary()) {
    throw new PatientRemoteWriteError('WRITE_PRIMARY desabilitado.', 'WRITE_PRIMARY_OFF');
  }
  const tenantId = assertWritePrimaryTenant(resolveTenantId(user, patient));
  const legacyId = patient?.id || patient?.legacyId;
  const repo = getPatientRepositoryForRead();
  try {
    await repo.softDeleteCore(toRepoUser(user, tenantId), legacyId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || 'remote soft-delete failed');
    logPatientWriteAdapterDev('softDelete-primary-failed', { tenantId, legacyId, error: message });
    throw new PatientRemoteWriteError(message, 'REMOTE_SOFT_DELETE_FAILED');
  }
  const cache = await hydrateCacheAfterRemote(
    tenantId,
    {
      legacyId,
      tenantId,
      deletedAt: new Date().toISOString(),
      status: 'inactive',
      fullName: patient?.full_name || '',
      nickname: patient?.nickname || '',
      socialName: patient?.social_name || '',
      sex: patient?.sex || '',
      birthDate: patient?.birth_date || '',
      cpf: patient?.cpf || '',
      guid: patient?.guid || '',
      photoUrl: patient?.photo_url || null,
      blocked: Boolean(patient?.blocked),
      blockReason: patient?.block_reason || '',
      blockAt: patient?.block_at || null,
      tags: Array.isArray(patient?.tags) ? patient.tags : [],
      leadSource: patient?.lead_source || '',
      hasFinancialResponsible: Boolean(patient?.has_financial_responsible),
      dependentFullName: patient?.dependent_full_name || '',
      hasPendingData: false,
      pendingFields: [],
      pendingCriticalFields: [],
      createdAt: patient?.created_at || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      uuid: patient?.uuid || '',
    },
    { softDeleted: true, legacyId },
  );
  schedulePatientShadowRead(tenantId);
  logPatientWriteAdapterDev('softDelete-primary', {
    tenantId,
    legacyId,
    ok: true,
    cacheUpdated: cache.cacheUpdated,
  });
  return {
    ok: true,
    remoteCommitted: true,
    cacheUpdated: Boolean(cache.cacheUpdated),
    cacheError: cache.cacheError || null,
    legacyId,
  };
}

/** Apenas testes — dual-write create awaitable. */
export async function __runPatientDualWriteCreateForTest(user, patient) {
  if (!shouldUsePatientRepositoryWrite()) return { ok: false, skipped: true };
  const tenantId = resolveTenantId(user, patient);
  if (!tenantId) return { ok: false, skipped: true };
  return runDualWriteSafe(
    async () => {
      const repo = getPatientRepositoryForRead();
      await repo.createCore(toRepoUser(user, tenantId), mapPatientToCreateDto(patient));
    },
    { event: 'create', tenantId, legacyId: patient?.id, userId: user?.id },
  );
}

/** Apenas testes — primary create awaitable. */
export async function __runPatientPrimaryWriteCreateForTest(user, patient) {
  if (!shouldUsePatientRepositoryWritePrimary()) return { ok: false, skipped: true };
  return commitPatientWritePrimaryCreate(user, patient);
}

/** Apenas testes — primary update awaitable. */
export async function __runPatientPrimaryWriteUpdateForTest(user, patientId, patient, partial = {}) {
  if (!shouldUsePatientRepositoryWritePrimary()) return { ok: false, skipped: true };
  return commitPatientWritePrimaryUpdate(user, patientId, patient, partial);
}

/** Apenas testes — primary soft-delete awaitable. */
export async function __runPatientPrimaryWriteSoftDeleteForTest(user, patient) {
  if (!shouldUsePatientRepositoryWritePrimary()) return { ok: false, skipped: true };
  return commitPatientWritePrimarySoftDelete(user, patient);
}
