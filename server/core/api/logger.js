/**
 * Phase 4.10 Wave 0 — Logs estruturados sem PII sensível.
 */

import { randomUUID } from 'node:crypto';

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'service_role',
  'custom_permissions',
  'permission_overrides',
  'app_metadata',
  'email',
]);

function sanitizeLogValue(key, value) {
  if (SENSITIVE_KEYS.has(String(key).toLowerCase())) {
    return '[REDACTED]';
  }
  return value;
}

function sanitizeLogFields(fields = {}) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = sanitizeLogValue(key, value);
  }
  return out;
}

export function createRequestId(existingId = '') {
  const trimmed = String(existingId ?? '').trim();
  return trimmed || randomUUID();
}

export function createApiLogger(tag, {
  requestId = '',
  startedAt = Date.now(),
} = {}) {
  const resolvedRequestId = createRequestId(requestId);
  const base = {
    tag,
    request_id: resolvedRequestId,
    started_at: startedAt,
  };

  return {
    requestId: resolvedRequestId,
    base,

    build(fields = {}) {
      const durationMs = Math.max(0, Date.now() - startedAt);
      return sanitizeLogFields({
        ...base,
        ...fields,
        durationMs,
      });
    },

    success(fields = {}) {
      return this.build(fields);
    },

    failure(err, fields = {}) {
      const code = err?.code || undefined;
      const message = err?.message || undefined;
      return this.build({
        ...fields,
        error_code: code,
        error_message: message,
      });
    },
  };
}
