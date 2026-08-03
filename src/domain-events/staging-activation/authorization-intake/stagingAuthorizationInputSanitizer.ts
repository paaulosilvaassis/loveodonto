/**
 * @module domain-events/staging-activation/authorization-intake/stagingAuthorizationInputSanitizer
 */

import { DANGEROUS_INPUT_KEYS } from './stagingAuthorizationInputSchema.js';
import type { StagingAuthorizationDiagCode } from './stagingAuthorizationIntakeTypes.js';

const SENSITIVE_RE =
  /(password\s*[:=]|secret\s*[:=]|bearer\s+[a-z0-9._-]+|authorization:\s*\S+|api[_-]?key\s*[:=]|service[_-]?role|private[_-]?key|-----BEGIN|cookie\s*=|connection\s*string\s*[:=])/i;

const CLINICAL_FINANCIAL_RE =
  /(paciente|prontuário|cpf\s*[:=]|cartão\s*crédito|cvv|receita clínica|diagnóstico odont)/i;

/** Campos de bloqueio/declaração que contêm substrings sensíveis no nome, mas são booleanos de controle. */
const ALLOWED_CONTROL_KEYS = new Set([
  'secretaccessblocked',
  'mutationblocked',
  'migrationblocked',
  'storagewriteblocked',
  'environmentvariablewriteblocked',
  'riskacknowledged',
  'rollbackacknowledged',
]);

export function sanitizeAuthorizationText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim().replace(/\s+/g, ' ').slice(0, 500);
  return s.length ? s : null;
}

export function scanObjectForSensitive(
  obj: unknown,
  path = '',
): { ok: boolean; diagnostics: StagingAuthorizationDiagCode[]; detail?: string } {
  const diagnostics: StagingAuthorizationDiagCode[] = [];
  if (obj == null || typeof obj !== 'object') {
    const text = String(obj ?? '');
    if (SENSITIVE_RE.test(text) || CLINICAL_FINANCIAL_RE.test(text)) {
      return { ok: false, diagnostics: ['SENSITIVE_AUTHORIZATION_INPUT'], detail: path || 'value' };
    }
    return { ok: true, diagnostics };
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i += 1) {
      const r = scanObjectForSensitive(obj[i], `${path}[${i}]`);
      if (!r.ok) return r;
      diagnostics.push(...r.diagnostics);
    }
    return { ok: true, diagnostics };
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = k.toLowerCase();
    if (ALLOWED_CONTROL_KEYS.has(key)) {
      // boolean/control fields — scan only value if string
      if (typeof v === 'string') {
        const nested = scanObjectForSensitive(v, path ? `${path}.${k}` : k);
        if (!nested.ok) return nested;
      }
      continue;
    }
    const exactDanger = (DANGEROUS_INPUT_KEYS as readonly string[]).some(
      (d) => key === d.toLowerCase(),
    );
    if (exactDanger) {
      return {
        ok: false,
        diagnostics: ['SENSITIVE_AUTHORIZATION_INPUT', 'UNSUPPORTED_AUTHORIZATION_FIELD'],
        detail: path ? `${path}.${k}` : k,
      };
    }
    if (typeof v === 'string' && (SENSITIVE_RE.test(v) || CLINICAL_FINANCIAL_RE.test(v))) {
      return {
        ok: false,
        diagnostics: ['SENSITIVE_AUTHORIZATION_INPUT'],
        detail: path ? `${path}.${k}` : k,
      };
    }
    if (typeof v === 'object' && v != null) {
      const nested = scanObjectForSensitive(v, path ? `${path}.${k}` : k);
      if (!nested.ok) return nested;
    }
  }
  return { ok: true, diagnostics };
}

export function sanitizeAttachmentMetadata(
  raw: unknown,
): {
  ok: boolean;
  items: { name: string; mediaType: string | null; sizeBytes: number | null; contentIncluded: false }[];
  diagnostics: StagingAuthorizationDiagCode[];
} {
  if (raw == null) return { ok: true, items: [], diagnostics: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, items: [], diagnostics: ['UNSAFE_ATTACHMENT_METADATA'] };
  }
  const items = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') {
      return { ok: false, items: [], diagnostics: ['UNSAFE_ATTACHMENT_METADATA'] };
    }
    const r = row as Record<string, unknown>;
    if (r.content != null || r.data != null || r.base64 != null || r.body != null) {
      return { ok: false, items: [], diagnostics: ['UNSAFE_ATTACHMENT_METADATA'] };
    }
    items.push({
      name: String(r.name || 'unnamed').slice(0, 120),
      mediaType: r.mediaType != null ? String(r.mediaType).slice(0, 80) : null,
      sizeBytes: typeof r.sizeBytes === 'number' ? r.sizeBytes : null,
      contentIncluded: false as const,
    });
  }
  return { ok: true, items, diagnostics: [] };
}
