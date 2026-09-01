/**
 * Metadata interna — não é coleção de aplicação e não carrega PII.
 *
 * B.2U protege apenas runtimes que contêm este guard.
 * Uma aba pré-B.2U ainda pode gravar o snapshot completo sem CAS.
 * Após o deploy: fechar TODAS as abas Love Odonto pré-B.2U antes de retomar recovery.
 */
export const DB_META_KEY = '__db_meta__';
export const IDB_STALE_SNAPSHOT = 'IDB_STALE_SNAPSHOT';
export const IDB_RELOAD_BLOCKED = 'IDB_RELOAD_BLOCKED';
export const REVISION_BROADCAST_CHANNEL = 'loveodonto-db-revision-v1';

export function parsePersistedRevision(metaValue) {
  if (!metaValue || typeof metaValue !== 'object') return 0;
  const revision = Number(metaValue.revision);
  return Number.isFinite(revision) && revision > 0 ? Math.floor(revision) : 0;
}

export function createRevisionMeta(revision) {
  return {
    revision: Number(revision) || 0,
    committedAt: new Date().toISOString(),
  };
}

export function createStaleSnapshotError({ expectedRevision, actualRevision }) {
  const error = new Error('IndexedDB snapshot is stale; another tab committed a newer revision.');
  error.name = IDB_STALE_SNAPSHOT;
  error.expectedRevision = expectedRevision;
  error.actualRevision = actualRevision;
  error.timestamp = new Date().toISOString();
  return error;
}

export function createReloadBlockedError() {
  const error = new Error(
    'Reload recusado: runtime local tem estado não commitado. Passe discardLocalRuntime=true para descartar.',
  );
  error.name = IDB_RELOAD_BLOCKED;
  return error;
}
