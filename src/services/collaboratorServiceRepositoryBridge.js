/**
 * Ponte controlada entre collaboratorService (legado IDB) e collaboratorRepository V3.
 * Sprint 1B — Ticket 1.6
 *
 * Regras:
 * - Flags default → todos os gates retornam false.
 * - Shadow read é fire-and-forget; nunca altera retorno das funções legadas.
 * - Erros no shadow são engolidos (log DEV apenas).
 */
import { normalizeTenantId } from './tenantIsolation.js';
import {
  createCollaboratorRepository,
  registerCollaboratorRhOnlineCacheSync,
  rehydrateCollaboratorRhCacheIfPrimary,
} from '../repositories/collaborator/collaboratorRepository.ts';
import {
  generateShadowReport,
  logRhShadowDev,
  runWithShadowTimeout,
  RH_SHADOW_DEFAULT_TIMEOUT_MS,
} from '../repositories/collaborator/collaboratorShadowValidation.ts';
import {
  getCollaboratorRepositoryFlags,
  isRhSupabaseReadPrimaryEnabled,
  isRhSupabaseWriteEnabled,
  shouldCompareIdbVsSupabase,
} from '../repositories/collaborator/collaboratorRepositoryFlags.ts';

/** @type {import('../repositories/collaborator/collaboratorRepositoryFlags.ts').CollaboratorRepositoryFlagsInput | null} */
let flagsInputOverride = null;

/** @type {(() => import('../repositories/collaborator/collaboratorTypes.ts').ICollaboratorRepository) | null} */
let repositoryFactoryOverride = null;

/**
 * Apenas testes — injeta overrides de flags sem alterar env.
 * @param {import('../repositories/collaborator/collaboratorRepositoryFlags.ts').CollaboratorRepositoryFlagsInput | null} input
 */
export function __setCollaboratorServiceBridgeFlagsForTest(input) {
  flagsInputOverride = input;
}

/**
 * Apenas testes — injeta factory do repository (mock).
 * @param {(() => import('../repositories/collaborator/collaboratorTypes.ts').ICollaboratorRepository) | null} factory
 */
export function __setCollaboratorRepositoryFactoryForTest(factory) {
  repositoryFactoryOverride = factory;
}

/** @returns {import('../repositories/collaborator/collaboratorRepositoryFlags.ts').CollaboratorRepositoryFlagsInput} */
function bridgeFlagsInput() {
  return flagsInputOverride ?? {};
}

function getRepository() {
  const factory = repositoryFactoryOverride ?? createCollaboratorRepository;
  return factory();
}

/** Porta de leitura oficial — collaboratorServiceReadAdapter (Ticket 1.8). */
export function getCollaboratorRepositoryForRead() {
  return getRepository();
}

/**
 * Quando true (RC-02), leitura primária delega ao repository/Supabase com cache IDB.
 */
export function shouldUseCollaboratorRepositoryRead() {
  return isRhSupabaseReadPrimaryEnabled(bridgeFlagsInput());
}

/**
 * Quando true (futuro Sprint 1B+), escrita delega ao repository dual-write.
 * Default: false — sem write remoto.
 */
export function shouldUseCollaboratorRepositoryWrite() {
  return isRhSupabaseWriteEnabled(bridgeFlagsInput());
}

/**
 * Shadow compare IDB vs Supabase em background.
 * Default: false.
 */
export function shouldRunCollaboratorShadowRead() {
  return shouldCompareIdbVsSupabase(bridgeFlagsInput());
}

/**
 * Placeholder seguro — create/update/delete ainda não delegam ao repository (Ticket 1.6).
 * @returns {boolean}
 */
export function collaboratorRepositoryWriteGateActive() {
  return shouldUseCollaboratorRepositoryWrite();
}

async function runShadowReadSafe(tenantId, context) {
  const started = performance.now();
  try {
    const result = await runWithShadowTimeout(
      getRepository().compareIdbVsSupabase(tenantId),
      RH_SHADOW_DEFAULT_TIMEOUT_MS,
    );
    const durationMs = Math.round(performance.now() - started);
    if (result.shadow) {
      logRhShadowDev(generateShadowReport(result.shadow, durationMs), context);
      return;
    }
    logRhShadowDev(
      generateShadowReport({ tenantId, error: 'shadow details ausentes no compare' }, durationMs),
      context,
    );
  } catch (err) {
    const durationMs = Math.round(performance.now() - started);
    const message = String(err?.message || err || 'shadow read failed');
    const timedOut = /timeout/i.test(message);
    logRhShadowDev(
      generateShadowReport(
        { tenantId, error: message, durationMs, timedOut },
        durationMs,
      ),
      context,
    );
  }
}

/**
 * Agenda shadow read sem bloquear caller nem alterar retorno legado.
 * @param {string | null | undefined} tenantId
 * @param {string} [context]
 */
export function scheduleCollaboratorShadowRead(tenantId, context = 'read') {
  if (!shouldRunCollaboratorShadowRead()) return;
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return;

  queueMicrotask(() => {
    void runShadowReadSafe(normalized, context);
  });
}

/** Expõe flags resolvidas para testes/diagnóstico DEV. */
export function getCollaboratorServiceBridgeFlagsSnapshot() {
  return getCollaboratorRepositoryFlags(bridgeFlagsInput());
}

let rhOnlineSyncRegistered = false;

/**
 * RC-02: registra listener `online` para reidratar cache IDB (read-primary).
 * @param {() => string | null | undefined} getTenantId
 */
export function initCollaboratorRhOnlineCacheSync(getTenantId) {
  if (rhOnlineSyncRegistered || typeof window === 'undefined') return;
  rhOnlineSyncRegistered = true;
  registerCollaboratorRhOnlineCacheSync(getTenantId);
}

/**
 * RC-02: hidratação não bloqueante pós-login/bootstrap quando read-primary ativo.
 * @param {string | null | undefined} tenantId
 */
export function scheduleCollaboratorRhCacheRehydrate(tenantId) {
  if (!isRhSupabaseReadPrimaryEnabled(bridgeFlagsInput())) return;
  const normalized = String(tenantId || '').trim();
  if (!normalized) return;

  queueMicrotask(() => {
    void rehydrateCollaboratorRhCacheIfPrimary(normalized).catch((err) => {
      if (import.meta.env?.DEV) {
        console.debug(
          '[RH] cache rehydrate skipped:',
          err instanceof Error ? err.message : err,
        );
      }
    });
  });
}
