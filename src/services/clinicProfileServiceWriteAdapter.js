/**
 * Adapter de escrita Clinic Profile — Phase 5.6 dual-write controlado.
 * IDB legado permanece autoridade imediata; Admin API/Supabase quando WRITE=true.
 *
 * Fluxo WRITE=true:
 *   IDB (clinicService) → Repository.updateCore → Admin API → hydrate IDB mirror → shadow opcional
 * Rollback: falha remota → IDB preservado → warning DEV
 */
import { normalizeTenantId } from './tenantIsolation.js';
import { mapLegacyProfileToUpdateDto } from '../repositories/clinicProfile/clinicProfileMapper.ts';
import {
  getClinicProfileRepositoryForRead,
  scheduleClinicProfileShadowCompare,
  shouldRunClinicProfileShadowRead,
  shouldUseClinicProfileRepositoryWrite,
} from './clinicProfileServiceRepositoryBridge.js';

function logClinicProfileWriteDev(event, payload) {
  if (!import.meta.env?.DEV) return;
  console.debug('[CLINIC_PROFILE_WRITE]', event, payload);
}

async function runDualWriteUpdate(user, profile, tenantId, logoUrl) {
  const repo = getClinicProfileRepositoryForRead();
  const dto = mapLegacyProfileToUpdateDto(profile, logoUrl);
  await repo.updateCore(tenantId, dto);
  if (shouldRunClinicProfileShadowRead()) {
    scheduleClinicProfileShadowCompare(tenantId, 'dualWriteUpdate');
  }
  logClinicProfileWriteDev('update', {
    tenantId,
    userId: user?.id,
    ok: true,
  });
}

async function runDualWriteSafe(runner, context) {
  try {
    await runner();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || 'dual-write failed');
    logClinicProfileWriteDev(context.event, {
      ...context,
      ok: false,
      error: message,
      rollback: 'indexeddb-preserved',
    });
    return { ok: false, error: message };
  }
}

/**
 * Dual-write assíncrono pós-update IDB — não bloqueia caller legado.
 * @param {object} user
 * @param {object} profile — row IDB atualizado
 * @param {string} tenantId
 * @param {string|null|undefined} logoUrl — URL http(s) resolvida para API
 */
export function scheduleClinicProfileDualWriteUpdate(user, profile, tenantId, logoUrl) {
  if (!shouldUseClinicProfileRepositoryWrite()) return;
  const normalized = normalizeTenantId(tenantId || profile?.tenant_id || user?.tenantId);
  if (!normalized) return;

  queueMicrotask(() => {
    void runDualWriteSafe(
      () => runDualWriteUpdate(user, profile, normalized, logoUrl),
      { event: 'update', tenantId: normalized, userId: user?.id },
    );
  });
}

/** Apenas testes — executa dual-write update de forma awaitable. */
export async function __runClinicProfileDualWriteUpdateForTest(user, profile, tenantId, logoUrl) {
  if (!shouldUseClinicProfileRepositoryWrite()) return { ok: false, skipped: true };
  const normalized = normalizeTenantId(tenantId || profile?.tenant_id || user?.tenantId);
  if (!normalized) return { ok: false, skipped: true };
  return runDualWriteSafe(
    () => runDualWriteUpdate(user, profile, normalized, logoUrl),
    { event: 'update', tenantId: normalized, userId: user?.id },
  );
}

export { mapLegacyProfileToUpdateDto };
