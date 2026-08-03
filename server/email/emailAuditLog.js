/**
 * Logs temporários de auditoria do fluxo de e-mail de primeiro acesso.
 * Remover ou desativar via EMAIL_AUDIT=0 após estabilizar o envio.
 */
function sanitizeForLog(value) {
  if (value == null) return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: value.code,
      status: value.status,
    };
  }
  if (typeof value === 'object') {
    return value;
  }
  return String(value);
}

export function emailAudit(phase, payload = {}) {
  if (process.env.EMAIL_AUDIT === '0') return;
  console.log('[EMAIL_AUDIT]', phase, sanitizeForLog(payload));
}
