import { hasSupabaseAuthPublicClient } from './supabasePublicClient.js';

function normalizeText(value) {
  return String(value || '').trim();
}

function envPresent(name) {
  return Boolean(normalizeText(process.env[name]));
}

/**
 * Overlay HTTP opcional (Resend/SendGrid). NÃO é o SSOT de produção.
 * Produção envia convites/senha via SMTP encapsulado do Supabase Auth.
 */
export function getEmailConfig() {
  const apiKey = normalizeText(process.env.EMAIL_API_KEY);
  const fromAddress = normalizeText(process.env.EMAIL_FROM_ADDRESS);
  const isConfigured = Boolean(apiKey && fromAddress);
  const requested = normalizeText(process.env.EMAIL_PROVIDER).toLowerCase();
  return {
    provider: isConfigured ? (requested || 'resend') : null,
    apiKey,
    fromName: normalizeText(process.env.EMAIL_FROM_NAME) || 'Love Odonto',
    fromAddress,
    isConfigured,
  };
}

/**
 * Inventário de transporte. Somente PRESENT/ABSENT — nunca valores.
 */
export function getEmailTransportInventory() {
  const transactional = getEmailConfig();
  const smtpHost = envPresent('SMTP_HOST');
  const smtpUser = envPresent('SMTP_USER') || envPresent('SMTP_USERNAME');
  const smtpPassword = envPresent('SMTP_PASSWORD') || envPresent('SMTP_PASS');
  return {
    authEmailConfigured: hasSupabaseAuthPublicClient(),
    authEmailTransport: 'supabase_auth_smtp',
    transactionalConfigured: transactional.isConfigured,
    transactionalProvider: transactional.isConfigured ? transactional.provider : null,
    directSmtpConfigured: Boolean(smtpHost && smtpUser && smtpPassword),
    env: {
      SMTP_HOST: smtpHost ? 'PRESENT' : 'ABSENT',
      SMTP_USER: smtpUser ? 'PRESENT' : 'ABSENT',
      SMTP_PASSWORD: smtpPassword ? 'PRESENT' : 'ABSENT',
      EMAIL_API_KEY: envPresent('EMAIL_API_KEY') ? 'PRESENT' : 'ABSENT',
      EMAIL_FROM_ADDRESS: envPresent('EMAIL_FROM_ADDRESS') ? 'PRESENT' : 'ABSENT',
      EMAIL_FROM_NAME: envPresent('EMAIL_FROM_NAME') ? 'PRESENT' : 'ABSENT',
      EMAIL_PROVIDER: envPresent('EMAIL_PROVIDER') ? 'PRESENT' : 'ABSENT',
      RESEND_API_KEY: envPresent('RESEND_API_KEY') ? 'PRESENT' : 'ABSENT',
      SENDGRID_API_KEY: envPresent('SENDGRID_API_KEY') ? 'PRESENT' : 'ABSENT',
      POSTMARK_API_KEY: envPresent('POSTMARK_API_KEY') ? 'PRESENT' : 'ABSENT',
      MAIL_URL: envPresent('MAIL_URL') ? 'PRESENT' : 'ABSENT',
      SUPABASE_URL: envPresent('SUPABASE_URL') ? 'PRESENT' : 'ABSENT',
      SUPABASE_ANON_KEY: envPresent('SUPABASE_ANON_KEY') ? 'PRESENT' : 'ABSENT',
    },
  };
}

export function getInviteRedirectTo() {
  const explicit = normalizeText(process.env.APP_INVITE_REDIRECT_TO);
  if (explicit) return explicit;
  const appUrl = normalizeText(process.env.APP_URL)
    || (process.env.NODE_ENV === 'production' ? 'https://loveodonto.com.br' : 'http://localhost:5176');
  return `${appUrl.replace(/\/+$/, '')}/primeiro-acesso`;
}

export function getPasswordResetRedirectTo() {
  const explicit = normalizeText(process.env.APP_PASSWORD_RESET_REDIRECT_TO);
  if (explicit) return explicit;
  const appUrl = normalizeText(process.env.APP_URL)
    || (process.env.NODE_ENV === 'production' ? 'https://loveodonto.com.br' : 'http://localhost:5176');
  return `${appUrl.replace(/\/+$/, '')}/redefinir-senha`;
}
