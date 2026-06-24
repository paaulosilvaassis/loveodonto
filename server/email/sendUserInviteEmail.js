import { buildUserInviteEmail } from './buildUserInviteEmail.js';
import { getEmailConfig, getInviteRedirectTo } from './emailConfig.js';
import { sendTransactionalEmail } from './emailProvider.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function getTenantDisplayName(supabase, tenantId) {
  const { data, error } = await supabase
    .from('tenants')
    .select('trade_name, legal_name')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) throw error;
  return data?.trade_name || data?.legal_name || 'Love Odonto';
}

export async function generatePasswordSetupLink(supabase, {
  email,
  redirectTo,
  data = {},
  existingUser = false,
}) {
  const normalizedEmail = normalizeEmail(email);
  const targetRedirect = redirectTo || getInviteRedirectTo();
  const linkTypes = existingUser
    ? ['recovery', 'magiclink']
    : ['invite', 'recovery', 'magiclink'];

  let lastError = null;
  for (const type of linkTypes) {
    const { data: linkData, error } = await supabase.auth.admin.generateLink({
      type,
      email: normalizedEmail,
      options: {
        redirectTo: targetRedirect,
        data,
      },
    });
    if (!error && linkData?.properties?.action_link) {
      return linkData.properties.action_link;
    }
    lastError = error;
  }

  throw lastError || new Error('Não foi possível gerar link de acesso para este e-mail.');
}

export async function sendUserInviteEmail(supabase, {
  tenantId,
  email,
  userName,
  profileRole,
  setupLink,
}) {
  const normalizedEmail = normalizeEmail(email);
  const clinicName = await getTenantDisplayName(supabase, tenantId);
  const link = setupLink || await generatePasswordSetupLink(supabase, {
    email: normalizedEmail,
    redirectTo: getInviteRedirectTo(),
    data: {
      tenant_id: tenantId,
      role: profileRole,
    },
  });

  const appUrl = String(process.env.APP_URL || 'https://loveodonto.com.br').replace(/\/+$/, '');
  const template = buildUserInviteEmail({
    userName: userName || normalizedEmail,
    clinicName,
    profileRole,
    setupLink: link,
    appUrl,
  });

  const delivery = await sendTransactionalEmail({
    to: normalizedEmail,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });

  return {
    setupLink: link,
    provider: delivery.provider,
    messageId: delivery.messageId,
    usedBackendEmail: getEmailConfig().isConfigured,
  };
}
