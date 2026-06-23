import { buildClinicOnboardingEmail } from './buildClinicOnboardingEmail.js';
import { getEmailConfig } from './emailConfig.js';
import { sendTransactionalEmail } from './emailProvider.js';
import { generatePasswordSetupLink } from './sendUserInviteEmail.js';
import { buildAcceptTermsUrl } from '../onboardingTerms.js';
import { emailAudit } from './emailAuditLog.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidSupabaseActionLink(link) {
  const value = String(link || '').trim();
  if (!value) return false;
  if (value.includes('/primeiro-acesso') && !value.includes('/auth/v1/verify')) return false;
  return value.includes('/auth/v1/verify');
}

export async function sendClinicOnboardingEmail(supabase, {
  tenantId,
  clinicName,
  planLabel,
  userName,
  email,
  acceptTermsToken,
  setupLink: providedSetupLink = null,
  skipSetupLink = false,
  accessEmailDelivery = null,
}) {
  const normalizedEmail = normalizeEmail(email);
  let setupLink = providedSetupLink;
  if (!skipSetupLink && !setupLink) {
    setupLink = await generatePasswordSetupLink(supabase, {
      email: normalizedEmail,
      data: { tenant_id: tenantId, role: 'master' },
      existingUser: accessEmailDelivery === 'backend_resend',
    });
  }
  if (setupLink && !isValidSupabaseActionLink(setupLink)) {
    throw new Error('Link de primeiro acesso inválido: use apenas action_link do Supabase Auth.');
  }
  const acceptTermsLink = buildAcceptTermsUrl(acceptTermsToken);
  const appUrl = String(process.env.APP_URL || 'http://localhost:5176').replace(/\/+$/, '');

  const template = buildClinicOnboardingEmail({
    userName,
    clinicName,
    planLabel,
    setupLink,
    acceptTermsLink,
    appUrl,
    includeSetupLink: !skipSetupLink,
  });

  const config = getEmailConfig();
  if (!config.isConfigured) {
    emailAudit('onboarding transacional ignorado', {
      email: normalizedEmail,
      skipSetupLink,
      accessEmailDelivery,
      reason: 'EMAIL_API_KEY/EMAIL_FROM_ADDRESS ausentes',
    });
    return {
      sent: false,
      setupLink: skipSetupLink ? null : setupLink,
      acceptTermsLink,
      accessEmailDelivery,
      reason: skipSetupLink
        ? 'E-mail de acesso enviado pelo Supabase Auth. Configure EMAIL_API_KEY para enviar também o contrato por e-mail.'
        : 'Provedor de e-mail não configurado.',
    };
  }

  const delivery = await sendTransactionalEmail({
    to: normalizedEmail,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });

  return {
    sent: true,
    setupLink: skipSetupLink ? null : setupLink,
    acceptTermsLink,
    accessEmailDelivery,
    provider: delivery.provider,
    messageId: delivery.messageId,
  };
}
