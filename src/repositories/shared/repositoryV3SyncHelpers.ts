/**
 * @module repositories/shared/repositoryV3SyncHelpers
 * @description Shadow scheduler, offline detection, compare e dev logs — Repository V3 toolkit.
 */

export function isBrowserOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
}

export function isRemoteReadUnavailableError(error: unknown): boolean {
  if (isBrowserOffline()) return true;
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return (
    message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('fetch failed')
    || message.includes('network request failed')
    || message.includes('load failed')
    || message.includes('tempo esgotado')
    || message.includes('não foi possível conectar')
    || message.includes('não registrado')
  );
}

/** Agenda microtask assíncrona para shadow read / hydrate (não bloqueia UI). */
export function scheduleRepositoryMicrotask(task: () => void | Promise<void>): void {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(() => {
      void task();
    });
    return;
  }
  setTimeout(() => {
    void task();
  }, 0);
}

export function compareCoreFieldSets<T extends Record<string, unknown>>(
  left: T | null,
  right: T | null,
  fields: readonly (keyof T)[],
): { match: boolean; diffs: Array<{ field: string; indexedDb: unknown; remote: unknown }> } {
  const diffs: Array<{ field: string; indexedDb: unknown; remote: unknown }> = [];
  if (!left && !right) return { match: true, diffs: [] };
  if (!left || !right) {
    return {
      match: false,
      diffs: [{ field: 'presence', indexedDb: Boolean(left), remote: Boolean(right) }],
    };
  }
  for (const field of fields) {
    if (String(left[field] ?? '') !== String(right[field] ?? '')) {
      diffs.push({ field: String(field), indexedDb: left[field], remote: right[field] });
    }
  }
  return { match: diffs.length === 0, diffs };
}

export function logRepositoryDev(
  namespace: string,
  event: string,
  payload: Record<string, unknown>,
): void {
  if (!import.meta.env?.DEV) return;
  console.debug(`[${namespace}]`, event, payload);
}
