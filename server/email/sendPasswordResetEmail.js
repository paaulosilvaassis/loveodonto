import { buildPasswordResetEmail } from './buildPasswordResetEmail.js';
import { getPasswordResetRedirectTo } from './emailConfig.js';
import { generatePasswordSetupLink } from './sendUserInviteEmail.js';
import { sendTransactionalEmail } from './emailProvider.js';
import { getEmailConfig } from './emailConfig.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export async function sendPasswordResetEmail(supabase, {
  email,
  userName,
  redirectTo,
}) {
  const normalizedEmail = normalizeEmail(email);
  const targetRedirect = redirectTo || getPasswordResetRedirectTo();
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

  return {
    setupLink,
    provider: delivery.provider,
    messageId: delivery.messageId,
    usedBackendEmail: getEmailConfig().isConfigured,
    emailSent: true,
  };
}
