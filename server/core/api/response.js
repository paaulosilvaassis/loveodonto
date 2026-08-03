/**
 * Phase 4.10 Wave 0 — Envelope V3 de resposta (fundação).
 * Não wired em handlers legados ainda.
 */

export function apiSuccess(data, meta = {}) {
  return {
    ok: true,
    data,
    meta: meta && typeof meta === 'object' ? meta : {},
  };
}

export function apiErrorPayload({ code, message, details = undefined }) {
  const payload = {
    ok: false,
    code,
    message,
  };
  if (details !== undefined && details !== null) {
    payload.details = details;
  }
  return payload;
}
