function maskEmail(email) {
  const raw = String(email || '').trim().toLowerCase();
  if (!raw || !raw.includes('@')) return raw || '(vazio)';
  const [local, domain] = raw.split('@');
  const visible = local.length <= 2 ? local[0] || '*' : `${local.slice(0, 2)}***`;
  return `${visible}@${domain}`;
}

/** Logs obrigatórios do fluxo Identity — sempre em produção. */
export function identityLog(event, data = {}) {
  const payload = { ...data };
  if (payload.email) payload.email = maskEmail(payload.email);
  console.log('[IDENTITY]', event, payload);
}
