import { getInviteRedirectTo, getPasswordResetRedirectTo } from './emailConfig.js';
import { getSupabaseAuthPublicClient, hasSupabaseAuthPublicClient } from './supabasePublicClient.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Envia e-mail de recuperação/redefinição via SMTP configurado no Supabase Auth.
 * Usa cliente anon (não service_role) — requisito do GoTrue para disparar SMTP.
 */
export async function sendSupabaseAuthRecoveryEmail(_supabaseAdmin, {
  email,
  redirectTo,
} = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('E-mail é obrigatório para envio via Supabase Auth.');
  }

  if (!hasSupabaseAuthPublicClient()) {
    throw new Error(
      'SUPABASE_ANON_KEY ausente no backend. '
      + 'Configure na raiz (.env) para enviar convites/recuperação via SMTP do Supabase.',
    );
  }

  const publicClient = getSupabaseAuthPublicClient();
  const targetRedirect = redirectTo || getPasswordResetRedirectTo() || getInviteRedirectTo();

  const { error } = await publicClient.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: targetRedirect,
  });

  if (error) throw error;

  return {
    emailDelivery: 'supabase_auth',
    setupLink: null,
    emailSent: true,
  };
}
