import { hasSupabaseAuthPublicClient } from './supabasePublicClient.js';

function normalizeText(value) {
  return String(value || '').trim();
}

function envPresent(name) {
  return Boolean(normalizeText(process.env[name]));
}

function parsePort(value) {
  const raw = normalizeText(value);
  if (!/^\d+$/.test(raw)) return null;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}

function parseSecureFlag(value) {
  const raw = normalizeText(value).toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return null;
}

function resolveSmtpSecure(port, explicit) {
  if (explicit !== null) return explicit;
  if (port === 465) return true;
  if (port === 587) return false;
  return null;
}

const REPLY_TO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const RESEND_FROM_DOMAIN = 'mail.loveodonto.com.br';
export const RESEND_FROM_ADDRESS = `noreply@${RESEND_FROM_DOMAIN}`;
export const RESEND_FROM_NAME = 'Love Odonto';

/**
 * Overlay HTTP legado (EMAIL_API_KEY / SendGrid).
 * Convites/senha continuam no SMTP encapsulado do Supabase Auth.
 * Transporte transacional de produção = RESEND_API_KEY.
 */
export function getEmailConfig() {
  const apiKey = normalizeText(process.env.EMAIL_API_KEY);
  const fromAddress = normalizeText(process.env.EMAIL_FROM_ADDRESS);
  const isConfigured = Boolean(apiKey && fromAddress);
  const requested = normalizeText(process.env.EMAIL_PROVIDER).toLowerCase();
  return {
    provider: isConfigured ? (requested || 'resend') : null,
    apiKey,
    fromName: normalizeText(process.env.EMAIL_FROM_NAME) || RESEND_FROM_NAME,
    fromAddress,
    isConfigured,
  };
}

/**
 * Resend HTTPS. Configurado somente pela presença de RESEND_API_KEY.
 * From fixo no domínio verificado. Nunca onboarding@resend.dev.
 */
export function getResendConfig() {
  const apiKey = normalizeText(process.env.RESEND_API_KEY);
  const fromName = normalizeText(process.env.EMAIL_FROM_NAME) || RESEND_FROM_NAME;
  const replyToRaw = normalizeText(process.env.EMAIL_REPLY_TO);
  const replyTo = REPLY_TO_RE.test(replyToRaw) ? replyToRaw : '';
  return {
    apiKey,
    fromName,
    fromAddress: RESEND_FROM_ADDRESS,
    fromDomain: RESEND_FROM_DOMAIN,
    replyTo,
    isConfigured: Boolean(apiKey),
  };
}

/**
 * SMTP direto do Railway para e-mail transacional da aplicação.
 * Não imprime secrets. Sem fallback inseguro de porta.
 */
export function getSmtpConfig() {
  const host = normalizeText(process.env.SMTP_HOST);
  const user = normalizeText(process.env.SMTP_USER || process.env.SMTP_USERNAME);
  const password = normalizeText(process.env.SMTP_PASSWORD || process.env.SMTP_PASS);
  const fromAddress = normalizeText(process.env.EMAIL_FROM_ADDRESS);
  const fromName = normalizeText(process.env.EMAIL_FROM_NAME) || 'Love Odonto';
  const replyTo = normalizeText(process.env.EMAIL_REPLY_TO);
  const port = parsePort(process.env.SMTP_PORT);
  const secure = resolveSmtpSecure(port, parseSecureFlag(process.env.SMTP_SECURE));
  const isConfigured = Boolean(host && port && user && password && fromAddress && secure !== null);
  return {
    host,
    port,
    user,
    password,
    fromAddress,
    fromName,
    replyTo,
    secure,
    isConfigured,
  };
}

export function isTransactionalEmailConfigured() {
  return getResendConfig().isConfigured || getSmtpConfig().isConfigured || getEmailConfig().isConfigured;
}

export function getTransactionalEmailProvider() {
  if (getResendConfig().isConfigured) return 'resend';
  if (getSmtpConfig().isConfigured) return 'smtp';
  const overlay = getEmailConfig();
  return overlay.isConfigured ? overlay.provider : null;
}

/**
 * Inventário de transporte. Somente PRESENT/ABSENT — nunca valores.
 */
export function getEmailTransportInventory() {
  const smtp = getSmtpConfig();
  const resend = getResendConfig();
  return {
    authEmailConfigured: hasSupabaseAuthPublicClient(),
    authEmailTransport: 'supabase_auth_smtp',
    transactionalConfigured: isTransactionalEmailConfigured(),
    transactionalProvider: getTransactionalEmailProvider(),
    resendConfigured: resend.isConfigured,
    directSmtpConfigured: smtp.isConfigured,
    directSmtpProvider: smtp.isConfigured ? 'smtp' : null,
    env: {
      SMTP_HOST: envPresent('SMTP_HOST') ? 'PRESENT' : 'ABSENT',
      SMTP_PORT: envPresent('SMTP_PORT') ? 'PRESENT' : 'ABSENT',
      SMTP_USER: (envPresent('SMTP_USER') || envPresent('SMTP_USERNAME')) ? 'PRESENT' : 'ABSENT',
      SMTP_PASSWORD: (envPresent('SMTP_PASSWORD') || envPresent('SMTP_PASS')) ? 'PRESENT' : 'ABSENT',
      SMTP_SECURE: envPresent('SMTP_SECURE') ? 'PRESENT' : 'ABSENT',
      EMAIL_API_KEY: envPresent('EMAIL_API_KEY') ? 'PRESENT' : 'ABSENT',
      EMAIL_FROM_ADDRESS: envPresent('EMAIL_FROM_ADDRESS') ? 'PRESENT' : 'ABSENT',
      EMAIL_FROM_NAME: envPresent('EMAIL_FROM_NAME') ? 'PRESENT' : 'ABSENT',
      EMAIL_REPLY_TO: envPresent('EMAIL_REPLY_TO') ? 'PRESENT' : 'ABSENT',
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
