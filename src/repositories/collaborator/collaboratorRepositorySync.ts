/**
 * @module repositories/collaborator/collaboratorRepositorySync
 * @description Sincronização IDB ← Supabase (RC-02 read-primary / offline-first).
 */

import { mapCoreToIndexedDbMirror } from './collaboratorMapper.js';
import type { ICollaboratorCache } from './collaboratorCache.js';
import type {
  CollaboratorCore,
  CollaboratorRepositoryFlags,
  ICollaboratorIndexedDbRepository,
} from './collaboratorTypes.js';
import { CollaboratorRepositorySupabaseUnavailableError } from './collaboratorTypes.js';

const NETWORK_ERROR_PATTERN = /fetch|network|failed to fetch|timeout|aborted|offline/i;

export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Erros esperados quando Supabase remoto está indisponível — permite fallback IDB.
 */
export function isRemoteReadUnavailableError(error: unknown): boolean {
  if (isBrowserOffline()) return true;
  if (error instanceof CollaboratorRepositorySupabaseUnavailableError) return true;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return NETWORK_ERROR_PATTERN.test(message);
}

/**
 * Hidrata cache em memória + espelho IndexedDB a partir do roster Supabase.
 * Não altera satellites (phones, access, appointments, etc.).
 */
export function hydrateCollaboratorIdbCache(
  idb: ICollaboratorIndexedDbRepository,
  cache: ICollaboratorCache,
  tenantId: string,
  items: CollaboratorCore[],
  flags: CollaboratorRepositoryFlags,
): number {
  let count = 0;
  for (const item of items) {
    cache.set(tenantId, item);
    if (!flags.RH_IDB_WRITE_DISABLED) {
      idb.upsertMirror(mapCoreToIndexedDbMirror(item));
    }
    count += 1;
  }
  return count;
}
