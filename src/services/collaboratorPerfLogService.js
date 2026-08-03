/**
 * Logs de performance da ficha de colaborador (DEV + buffer em window).
 */
const PERF_EVENTS = new Set([
  'COLLABORATOR_PROFILE_LOAD',
  'COLLABORATOR_ACCESS_LOAD',
  'COLLABORATOR_PERMISSIONS_LOAD',
  'COLLABORATOR_AVATAR_LOAD',
]);

function nowIso() {
  return new Date().toISOString();
}

export function startCollaboratorPerf(event, meta = {}) {
  if (!PERF_EVENTS.has(event)) return null;
  return {
    event,
    startedAt: performance.now(),
    meta: meta && typeof meta === 'object' ? { ...meta } : {},
  };
}

export function endCollaboratorPerf(mark, extra = {}) {
  if (!mark || !PERF_EVENTS.has(mark.event)) return null;
  const durationMs = Math.round(performance.now() - mark.startedAt);
  const payload = {
    event: mark.event,
    timestamp: nowIso(),
    durationMs,
    ...mark.meta,
    ...extra,
  };

  if (!window.__LOVE_ODONTO_COLLABORATOR_PERF__) {
    window.__LOVE_ODONTO_COLLABORATOR_PERF__ = [];
  }
  window.__LOVE_ODONTO_COLLABORATOR_PERF__.push(payload);

  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.info(`[${mark.event}]`, payload);
  }

  return payload;
}

export function getCollaboratorPerfLogs() {
  return Array.isArray(window.__LOVE_ODONTO_COLLABORATOR_PERF__)
    ? [...window.__LOVE_ODONTO_COLLABORATOR_PERF__]
    : [];
}
