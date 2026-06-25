import { buildPasswordResetEmail } from './buildPasswordResetEmail.js';
import { getPasswordResetRedirectTo } from './emailConfig.js';
import { generatePasswordSetupLink } from './sendUserInviteEmail.js';
import { sendTransactionalEmail } from './emailProvider.js';
import { getEmailConfig } from './emailConfig.js';
import { sendSupabaseAuthRecoveryEmail } from './sendSupabaseAuthEmail.js';
import { logAccessEmailAudit } from './accessEmailAudit.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export async function sendPasswordResetEmail(supabase, {
  email,
  userName,
  redirectTo,
  tenantId = null,
  collaboratorId = null,
} = {}) {
  const normalizedEmail = normalizeEmail(email);
  const targetRedirect = redirectTo || getPasswordResetRedirectTo();

  if (getEmailConfig().isConfigured) {
    const setupLink = await generatePasswordSetupLink(supabase, {
      email: normalizedEmail,
      redirectTo: targetRedirect,
      existingUser: true,
    });

    const template = buildPasswordResetEmail({
      userName: userName || normalizedEmail,
      resetLink: setupLink,
    });

    const delivery = await sendTransactionalEmail({
      to: normalizedEmail,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    logAccessEmailAudit({
      tenantId,
      collaboratorId,
      email: normalizedEmail,
      requestedAction: 'password_reset',
      recoverySent: true,
      emailDelivery: 'backend_resend',
      linkType: 'recovery',
      finalStatus: 'recovery_sent',
    });

    return {
      setupLink,
      provider: delivery.provider,
      messageId: delivery.messageId,
      usedBackendEmail: true,
      emailSent: true,
      emailDelivery: 'backend_resend',
    };
  }

  try {
    const supabaseDelivery = await sendSupabaseAuthRecoveryEmail(supabase, {
      email: normalizedEmail,
      redirectTo: targetRedirect,
    });
    logAccessEmailAudit({
      tenantId,
      collaboratorId,
      email: normalizedEmail,
      requestedAction: 'password_reset',
      recoverySent: true,
      emailDelivery: 'supabase_auth',
      linkType: 'supabase_recovery',
      finalStatus: 'recovery_sent',
    });
    return {
      setupLink: null,
      provider: 'supabase_auth',
      messageId: null,
      usedBackendEmail: false,
      emailSent: true,
      emailDelivery: supabaseDelivery.emailDelivery,
    };
  } catch (supabaseErr) {
    logAccessEmailAudit({
      tenantId,
      collaboratorId,
      email: normalizedEmail,
      requestedAction: 'password_reset',
      recoverySent: false,
      finalStatus: 'recovery_failed',
      error: supabaseErr?.message || String(supabaseErr),
    });
    throw new Error('Não foi possível enviar o e-mail de redefinição. Tente novamente em alguns minutos.');
  }
}
