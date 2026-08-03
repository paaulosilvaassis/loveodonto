/**
 * Adapter de escrita RH — Phase 5.3 dual-write controlado.
 * IDB legado permanece autoridade imediata; Supabase quando WRITE=true.
 *
 * Fluxo WRITE=true:
 *   IDB (service legado) → Repository → Supabase → hydrate IDB mirror → shadow opcional
 * Rollback: falha Supabase → IDB preservado → warning DEV
 */
import { normalizeTenantId } from './tenantIsolation.js';
import {
  getCollaboratorRepositoryForRead,
  scheduleCollaboratorShadowRead,
  shouldRunCollaboratorShadowRead,
  shouldUseCollaboratorRepositoryWrite,
} from './collaboratorServiceRepositoryBridge.js';

function logRhWriteDev(event, payload) {
  if (!import.meta.env?.DEV) return;
  console.debug('[RH_WRITE]', event, payload);
}

function toRepositoryUser(user, tenantId) {
  return {
    id: String(user?.id || 'unknown'),
    tenantId: normalizeTenantId(tenantId || user?.tenantId || user?.tenant_id),
  };
}

/** @param {Record<string, unknown>} row */
export function mapLegacyRowToCreateDto(row) {
  return {
    legacyId: String(row.id || '').trim(),
    apelido: String(row.apelido || '').trim(),
    nomeCompleto: String(row.nomeCompleto || '').trim(),
    rhCategoria: String(row.rhCategoria || '').trim(),
    cargo: String(row.cargo || '').trim(),
    tipoVinculo: String(row.tipoVinculo || '').trim(),
    setor: String(row.setor || '').trim(),
    status: row.status === 'inativo' ? 'inativo' : 'ativo',
    nomeSocial: row.nomeSocial ? String(row.nomeSocial) : null,
    sexo: row.sexo ? String(row.sexo) : null,
    dataNascimento: row.dataNascimento ? String(row.dataNascimento) : null,
    email: row.email ? String(row.email) : null,
    fotoUrl: row.fotoUrl ? String(row.fotoUrl) : null,
    rhFuncaoDescricao: row.rhFuncaoDescricao ? String(row.rhFuncaoDescricao) : null,
    especialidades: Array.isArray(row.especialidades) ? [...row.especialidades] : [],
    registroProfissional: row.registroProfissional ? String(row.registroProfissional) : null,
    conselhoNome: row.conselhoNome ? String(row.conselhoNome) : null,
    conselhoUf: row.conselhoUf ? String(row.conselhoUf) : null,
  };
}

/** @param {Record<string, unknown>} next @param {Record<string, unknown>|null} [prev] */
export function mapLegacyRowToUpdateDto(next, prev = null) {
  const dto = mapLegacyRowToCreateDto(next);
  if (!prev) return dto;
  const patch = {};
  for (const key of Object.keys(dto)) {
    if (key === 'legacyId') continue;
    const prevVal = prev[key];
    const nextVal = dto[key];
    if (JSON.stringify(prevVal) !== JSON.stringify(nextVal)) {
      patch[key] = nextVal;
    }
  }
  return patch;
}

async function runDualWriteCreate(user, collaborator, tenantId) {
  const repo = getCollaboratorRepositoryForRead();
  const repoUser = toRepositoryUser(user, tenantId);
  const dto = mapLegacyRowToCreateDto(collaborator);
  await repo.createCore(repoUser, dto);
  if (shouldRunCollaboratorShadowRead()) {
    scheduleCollaboratorShadowRead(tenantId, 'dualWriteCreate');
  }
  logRhWriteDev('create', { collaboratorId: collaborator.id, tenantId, ok: true });
}

async function runDualWriteUpdate(user, collaboratorId, nextRow, prevRow, tenantId) {
  const repo = getCollaboratorRepositoryForRead();
  const repoUser = toRepositoryUser(user, tenantId);
  const becameInactive = nextRow.status === 'inativo' && prevRow?.status !== 'inativo';
  const canonicalUuid = String(nextRow.uuid || prevRow?.uuid || '').trim();

  if (becameInactive && canonicalUuid) {
    await repo.softDeleteCore(repoUser, collaboratorId);
  } else {
    const dto = mapLegacyRowToUpdateDto(nextRow, prevRow);
    await repo.updateCore(repoUser, collaboratorId, dto);
  }

  if (shouldRunCollaboratorShadowRead()) {
    scheduleCollaboratorShadowRead(tenantId, 'dualWriteUpdate');
  }
  logRhWriteDev('update', { collaboratorId, tenantId, ok: true, softDelete: becameInactive });
}

async function runDualWriteSafe(runner, context) {
  try {
    await runner();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || 'dual-write failed');
    logRhWriteDev(context.event, {
      ...context,
      ok: false,
      error: message,
      rollback: 'indexeddb-preserved',
    });
    return { ok: false, error: message };
  }
}

/**
 * Dual-write assíncrono pós-create IDB — não bloqueia caller legado.
 * @param {object} user
 * @param {object} collaborator
 */
export function scheduleCollaboratorDualWriteCreate(user, collaborator) {
  if (!shouldUseCollaboratorRepositoryWrite()) return;
  const tenantId = normalizeTenantId(
    collaborator?.tenant_id || user?.tenantId || user?.tenant_id,
  );
  if (!tenantId) return;

  queueMicrotask(() => {
    void runDualWriteSafe(
      () => runDualWriteCreate(user, collaborator, tenantId),
      { event: 'create', collaboratorId: collaborator.id, tenantId },
    );
  });
}

/**
 * Dual-write assíncrono pós-update IDB.
 * @param {object} user
 * @param {string} collaboratorId
 * @param {object} nextRow
 * @param {object|null} prevRow
 */
export function scheduleCollaboratorDualWriteUpdate(user, collaboratorId, nextRow, prevRow) {
  if (!shouldUseCollaboratorRepositoryWrite()) return;
  const tenantId = normalizeTenantId(
    nextRow?.tenant_id || prevRow?.tenant_id || user?.tenantId || user?.tenant_id,
  );
  if (!tenantId) return;

  queueMicrotask(() => {
    void runDualWriteSafe(
      () => runDualWriteUpdate(user, collaboratorId, nextRow, prevRow, tenantId),
      { event: 'update', collaboratorId, tenantId },
    );
  });
}

/** Apenas testes — executa dual-write create de forma awaitable. */
export async function __runCollaboratorDualWriteCreateForTest(user, collaborator) {
  if (!shouldUseCollaboratorRepositoryWrite()) return { ok: false, skipped: true };
  const tenantId = normalizeTenantId(
    collaborator?.tenant_id || user?.tenantId || user?.tenant_id,
  );
  if (!tenantId) return { ok: false, skipped: true };
  return runDualWriteSafe(
    () => runDualWriteCreate(user, collaborator, tenantId),
    { event: 'create', collaboratorId: collaborator.id, tenantId },
  );
}

/** Apenas testes — executa dual-write update de forma awaitable. */
export async function __runCollaboratorDualWriteUpdateForTest(user, collaboratorId, nextRow, prevRow) {
  if (!shouldUseCollaboratorRepositoryWrite()) return { ok: false, skipped: true };
  const tenantId = normalizeTenantId(
    nextRow?.tenant_id || prevRow?.tenant_id || user?.tenantId || user?.tenant_id,
  );
  if (!tenantId) return { ok: false, skipped: true };
  return runDualWriteSafe(
    () => runDualWriteUpdate(user, collaboratorId, nextRow, prevRow, tenantId),
    { event: 'update', collaboratorId, tenantId },
  );
}
