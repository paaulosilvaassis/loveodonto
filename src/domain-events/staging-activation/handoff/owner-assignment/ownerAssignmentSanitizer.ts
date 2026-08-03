/**
 * @module domain-events/staging-activation/handoff/owner-assignment/ownerAssignmentSanitizer
 */

const SENSITIVE_RE =
  /(password\s*[:=]|secret\s*[:=]|bearer\s+[a-z0-9._-]+|authorization:\s*\S+|api[_-]?key\s*[:=]|service[_-]?role|private[_-]?key|-----BEGIN|cookie\s*=)/i;

const TECHNICAL_IDENTITY_RE =
  /^(system|auto|bot|null|undefined|n\/a|na|admin@system|root)$/i;

export function sanitizeOwnerText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim().replace(/\s+/g, ' ').slice(0, 200);
  return s.length ? s : null;
}

export function isTechnicalIdentity(person: string | null): boolean {
  if (!person) return false;
  return TECHNICAL_IDENTITY_RE.test(person.trim()) || person.includes('*') || person === 'all';
}

export function scanOwnerInputSensitive(obj: unknown): { ok: boolean; detail?: string } {
  if (obj == null) return { ok: true };
  if (typeof obj !== 'object') {
    return SENSITIVE_RE.test(String(obj))
      ? { ok: false, detail: 'sensitive value' }
      : { ok: true };
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = scanOwnerInputSensitive(item);
      if (!r.ok) return r;
    }
    return { ok: true };
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (/password|secret|token|serviceRole|privateKey|apiKey/i.test(k)) {
      return { ok: false, detail: k };
    }
    if (typeof v === 'string' && SENSITIVE_RE.test(v)) {
      return { ok: false, detail: k };
    }
    if (typeof v === 'object' && v != null) {
      const nested = scanOwnerInputSensitive(v);
      if (!nested.ok) return nested;
    }
  }
  return { ok: true };
}
