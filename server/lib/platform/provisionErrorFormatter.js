/**
 * Phase 4.10 Wave 3I — formatação de erros de provisionamento (contrato HTTP preservado).
 */

export function createFormatProvisionErrorResponse(deps) {
  const { normalizeDatabaseError, isIdentityProvisionError } = deps;

  return function formatProvisionErrorResponse(
    err,
    fallbackMessage = 'Não foi possível concluir a operação de acesso. Tente novamente.',
  ) {
    if (isIdentityProvisionError(err)) {
      return {
        ok: false,
        code: err.code,
        message: err.message,
        error: err.message,
        setup_link: err.details?.setupLink || err.setupLink || null,
      };
    }
    const raw = normalizeDatabaseError(err, fallbackMessage);
    const lower = String(raw || '').toLowerCase();
    const isStaleAuth = lower.includes('sem conta no auth')
      || lower.includes('tenant_users_user_id_required')
      || lower.includes('falha ao ler usuário no auth')
      || lower.includes('conta no auth ausente')
      || lower.includes('conta no auth não existe');
    const isUserExists = lower.includes('already registered')
      || lower.includes('already exists')
      || lower.includes('user already');
    const isInvalidLink = lower.includes('email link is invalid')
      || lower.includes('otp_expired')
      || lower.includes('link expirado');

    let message = raw || fallbackMessage;
    if (isStaleAuth) {
      message = 'Não foi possível enviar o convite. O sistema tentará corrigir o vínculo — tente reenviar em instantes.';
    } else if (isUserExists) {
      message = 'Este e-mail já possui cadastro. O sistema reenviará o acesso automaticamente.';
    } else if (isInvalidLink) {
      message = 'O link anterior expirou. Solicite um novo convite ou redefinição de senha.';
    } else if (lower.includes('provedor de e-mail não configurado')) {
      message = 'Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.';
    } else if (lower.includes('vínculo de acesso não encontrado') || lower.includes('usuário interno não encontrado')) {
      message = 'Salve o acesso na aba Acesso ao sistema e tente enviar o convite novamente.';
    }

    return {
      ok: false,
      message,
      error: raw,
      setup_link: err?.setupLink || null,
      code: err?.code || null,
    };
  };
}
