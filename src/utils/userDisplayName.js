const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function looksLikeEmail(value) {
  return EMAIL_PATTERN.test(String(value || '').trim());
}

/** Primeiro nome para saudação (ex.: "Juliana Freire" → "Juliana"). */
export function pickGreetingName(fullName) {
  const trimmed = String(fullName || '').trim();
  if (!trimmed || looksLikeEmail(trimmed)) return '';
  const first = trimmed.split(/\s+/).filter(Boolean)[0];
  return first || trimmed;
}

export function resolveAuthUserMetadataName(authUser) {
  if (!authUser) return '';
  const meta = authUser.user_metadata && typeof authUser.user_metadata === 'object'
    ? authUser.user_metadata
    : {};
  const candidates = [meta.full_name, meta.name, meta.collaborator_name];
  for (const raw of candidates) {
    const value = String(raw || '').trim();
    if (value && !looksLikeEmail(value)) return value;
  }
  return '';
}

export function resolveSessionDisplayName(authUser, { fullName: tenantFullName } = {}) {
  const fromTenant = String(tenantFullName || '').trim();
  if (fromTenant && !looksLikeEmail(fromTenant)) return fromTenant;

  const fromMeta = resolveAuthUserMetadataName(authUser);
  if (fromMeta) return fromMeta;

  return '';
}
