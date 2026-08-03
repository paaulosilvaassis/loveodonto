/**
 * Phase 4.10 Wave 3H — detecção de colunas ausentes / duplicata tenant_users (SSOT).
 */

export function isMissingHasSystemAccessColumnError(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return code === '42703' && message.includes('has_system_access');
}

export function isMissingInvitationStatusColumnError(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return code === '42703' && message.includes('invitation_status');
}

export function isMissingCollaboratorIdColumnError(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return (
    (code === '42703' && message.includes('collaborator_id'))
    || (
      message.includes('collaborator_id')
      && message.includes('tenant_users')
      && message.includes('schema cache')
    )
  );
}

export function isTenantUserDuplicateError(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '23505'
    || message.includes('duplicate key')
    || message.includes('unique constraint')
  );
}
