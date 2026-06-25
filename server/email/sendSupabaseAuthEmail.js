import { getInviteRedirectTo, getPasswordResetRedirectTo } from './emailConfig.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Envia e-mail de recuperação/redefinição via SMTP configurado no Supabase Auth
 * (ex.: Hostinger). Não depende de EMAIL_API_KEY no backend.
 */
export async function sendSupabaseAuthRecoveryEmail(supabase, {
  email,
  redirectTo,
} = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('E-mail é obrigatório para envio via Supabase Auth.');
  }

  const targetRedirect = redirectTo || getPasswordResetRedirectTo() || getInviteRedirectTo();
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: targetRedirect,
  });

  if (error) throw error;

  return {
    emailDelivery: 'supabase_auth',
    setupLink: null,
    emailSent: true,
  };
}
