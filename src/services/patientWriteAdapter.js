/**
 * Adapter de escrita Pacientes — CLOUD.3 dual-write controlado.
 * Default OFF: PATIENTS_DUAL_WRITE + PATIENTS_WRITE → no-op.
 * IDB legado permanece autoridade imediata.
 */
import { normalizeTenantId } from './tenantIsolation.js';
import {
  getPatientRepositoryForRead,
  schedulePatientShadowRead,
  shouldUsePatientRepositoryWrite,
} from './patientRepositoryBridge.js';

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

/**
 * Dual-write assíncrono pós-create IDB — no-op se flags off.
 * @param {object} user
 * @param {object} patient
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
          { id: user?.id || 'unknown', tenantId, tenant_id: tenantId },
          {
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
          },
        );
        schedulePatientShadowRead(tenantId);
        logPatientWriteAdapterDev('create', { tenantId, legacyId: patient?.id, ok: true });
      },
      { event: 'create', tenantId, legacyId: patient?.id, userId: user?.id },
    );
  });
}

/**
 * Dual-write assíncrono pós-update IDB — no-op se flags off.
 * @param {object} user
 * @param {object} patient
 * @param {Record<string, unknown>} [partial]
 */
export function schedulePatientDualWriteUpdate(user, patient, partial = {}) {
  if (!shouldUsePatientRepositoryWrite()) return;
  const tenantId = resolveTenantId(user, patient);
  if (!tenantId) return;
  queueMicrotask(() => {
    void runDualWriteSafe(
      async () => {
        const repo = getPatientRepositoryForRead();
        const dto = {
          fullName: partial.full_name ?? partial.fullName ?? patient.full_name,
          nickname: partial.nickname ?? patient.nickname,
          socialName: partial.social_name ?? partial.socialName ?? patient.social_name,
          sex: partial.sex ?? patient.sex,
          birthDate: partial.birth_date ?? partial.birthDate ?? patient.birth_date,
          cpf: partial.cpf ?? patient.cpf,
          status: partial.status ?? patient.status,
          blocked: partial.blocked ?? patient.blocked,
        };
        await repo.updateCore(
          { id: user?.id || 'unknown', tenantId, tenant_id: tenantId },
          patient.id,
          dto,
        );
        schedulePatientShadowRead(tenantId);
        logPatientWriteAdapterDev('update', { tenantId, legacyId: patient?.id, ok: true });
      },
      { event: 'update', tenantId, legacyId: patient?.id, userId: user?.id },
    );
  });
}

/**
 * Dual-write soft-delete — no-op se flags off.
 * @param {object} user
 * @param {object} patient
 */
export function schedulePatientDualWriteSoftDelete(user, patient) {
  if (!shouldUsePatientRepositoryWrite()) return;
  const tenantId = resolveTenantId(user, patient);
  if (!tenantId) return;
  queueMicrotask(() => {
    void runDualWriteSafe(
      async () => {
        const repo = getPatientRepositoryForRead();
        await repo.softDeleteCore(
          { id: user?.id || 'unknown', tenantId, tenant_id: tenantId },
          patient.id,
        );
        schedulePatientShadowRead(tenantId);
        logPatientWriteAdapterDev('softDelete', { tenantId, legacyId: patient?.id, ok: true });
      },
      { event: 'softDelete', tenantId, legacyId: patient?.id, userId: user?.id },
    );
  });
}

/** Apenas testes — executa dual-write create awaitable. */
export async function __runPatientDualWriteCreateForTest(user, patient) {
  if (!shouldUsePatientRepositoryWrite()) return { ok: false, skipped: true };
  const tenantId = resolveTenantId(user, patient);
  if (!tenantId) return { ok: false, skipped: true };
  return runDualWriteSafe(
    async () => {
      schedulePatientDualWriteCreate(user, patient);
    },
    { event: 'create', tenantId, legacyId: patient?.id, userId: user?.id },
  );
}
