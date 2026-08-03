const STABILITY_EVENTS = new Set([
  'AUTH_OK',
  'AUTH_FAILED',
  'TENANT_CONTEXT_OK',
  'TENANT_CONTEXT_FAILED',
  'SUPABASE_CONFIG_OK',
  'SUPABASE_CONFIG_FAILED',
  'BACKEND_OK',
  'BACKEND_FAILED',
  'ROUTE_ERROR',
]);

function nowIso() {
  return new Date().toISOString();
}

export function emitStabilityLog(event, data = {}) {
  if (!STABILITY_EVENTS.has(event)) return;
  const payload = {
    event,
    timestamp: nowIso(),
    data: data && typeof data === 'object' ? data : { value: data },
  };

  if (!window.__LOVE_ODONTO_STABILITY_LOGS__) {
    window.__LOVE_ODONTO_STABILITY_LOGS__ = [];
  }
  window.__LOVE_ODONTO_STABILITY_LOGS__.push(payload);

  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.info(`[STABILITY] ${event}`, payload.data);
  }
}

export function getStabilityLogs() {
  return Array.isArray(window.__LOVE_ODONTO_STABILITY_LOGS__)
    ? [...window.__LOVE_ODONTO_STABILITY_LOGS__]
    : [];
}

export function clearStabilityLogs() {
  window.__LOVE_ODONTO_STABILITY_LOGS__ = [];
}

