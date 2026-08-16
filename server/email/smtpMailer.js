/**
 * Mailer SMTP interno. Não é endpoint público.
 * sendMail success = accepted by transport, não inbox delivered.
 */
import nodemailer from 'nodemailer';
import { getSmtpConfig } from './emailConfig.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SMTP_SOCKET_TIMEOUT_MS = 15000;

let cachedTransporter = null;
let cachedFingerprint = null;
let injectedTransporter = null;

export class SmtpTransportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SmtpTransportError';
    this.code = code;
  }
}

export function setSmtpTransporterForTests(transporter) {
  injectedTransporter = transporter || null;
}

export function resetSmtpTransporterCache() {
  cachedTransporter = null;
  cachedFingerprint = null;
}

function classifySmtpError(err) {
  const code = String(err?.code || '').toUpperCase();
  const responseCode = Number(err?.responseCode || 0);
  const raw = String(err?.message || '').toLowerCase();
  if (code === 'EAUTH' || responseCode === 535 || raw.includes('invalid login') || raw.includes('authentication failed')) {
    return { code: 'SMTP_AUTH_FAILED', message: 'Não foi possível autenticar no servidor de e-mail. O link não foi enviado.' };
  }
  if (
    ['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ETIMEDOUT', 'ESOCKET', 'EDNS'].includes(code)
    || raw.includes('timeout')
    || raw.includes('timed out')
  ) {
    return { code: 'SMTP_CONNECTION_FAILED', message: 'Não foi possível conectar ao servidor de e-mail. O link não foi enviado.' };
  }
  return { code: 'SMTP_SEND_FAILED', message: 'O servidor de e-mail recusou o disparo. O link não foi enviado.' };
}

function createTransporter(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.password,
    },
    requireTLS: cfg.secure === false,
    tls: {
      minVersion: 'TLSv1.2',
    },
    connectionTimeout: SMTP_SOCKET_TIMEOUT_MS,
    greetingTimeout: SMTP_SOCKET_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
  });
}

function getTransporter(cfg) {
  if (injectedTransporter) return injectedTransporter;
  const fingerprint = `${cfg.host}|${cfg.port}|${cfg.user}|${cfg.secure}`;
  if (cachedTransporter && cachedFingerprint === fingerprint) return cachedTransporter;
  cachedTransporter = createTransporter(cfg);
  cachedFingerprint = fingerprint;
  return cachedTransporter;
}

export function classifySmtpVerifyError(err) {
  const errorCode = String(err?.code || '').toUpperCase() || null;
  const responseCode = Number(err?.responseCode || 0) || null;
  const command = err?.command ? String(err.command) : null;
  const raw = String(err?.message || '').toLowerCase();

  if (errorCode === 'EAUTH' || responseCode === 535 || raw.includes('invalid login') || raw.includes('authentication failed')) {
    return { classification: 'AUTH_FAILED', errorCode: errorCode || 'EAUTH', responseCode: responseCode || 535, command };
  }
  if (errorCode === 'ENOTFOUND' || errorCode === 'EDNS' || errorCode === 'EAI_AGAIN' || raw.includes('getaddrinfo') || raw.includes('enotfound')) {
    return { classification: 'DNS_ERROR', errorCode: errorCode || 'ENOTFOUND', responseCode, command };
  }
  if (
    errorCode === 'EPROTO'
    || raw.includes('wrong version number')
    || raw.includes('certificate')
    || raw.includes('ssl routines')
    || ((errorCode === 'ESOCKET' || raw.includes('socket')) && (raw.includes('ssl') || raw.includes('tls') || raw.includes('cert')))
  ) {
    return { classification: 'TLS_ERROR', errorCode: errorCode || 'ETLS', responseCode, command };
  }
  if (errorCode === 'ECONNREFUSED' || raw.includes('econnrefused')) {
    return { classification: 'CONNECTION_REFUSED', errorCode: errorCode || 'ECONNREFUSED', responseCode, command };
  }
  if (errorCode === 'ETIMEDOUT' || errorCode === 'ETIMEOUT' || raw.includes('timeout') || raw.includes('timed out')) {
    return { classification: 'CONNECTION_TIMEOUT', errorCode: errorCode || 'ETIMEDOUT', responseCode, command };
  }
  if (errorCode === 'EHOSTUNREACH' || errorCode === 'ECONNRESET' || errorCode === 'ESOCKET') {
    return { classification: 'CONNECTION_REFUSED', errorCode, responseCode, command };
  }
  return { classification: 'CONNECTION_TIMEOUT', errorCode: errorCode || 'ESMTP', responseCode, command };
}

function publicVerifyResult(cfg, extra) {
  return {
    ok: extra.ok === true,
    configured: Boolean(cfg?.isConfigured),
    classification: extra.classification,
    errorCode: extra.errorCode || null,
    responseCode: extra.responseCode || null,
    command: extra.command || null,
    host: cfg?.host || null,
    port: cfg?.port || null,
    secure: typeof cfg?.secure === 'boolean' ? cfg.secure : null,
  };
}

/**
 * Testa DNS/TLS/auth no mesmo transporter da aplicação. Não chama sendMail.
 */
export async function verifySmtpConnection({ port, secure, persistCache = true } = {}) {
  const base = getSmtpConfig();
  const cfg = {
    ...base,
    port: port ?? base.port,
    secure: secure === undefined ? base.secure : secure,
    isConfigured: Boolean(base.host && (port ?? base.port) && base.user && base.password && base.fromAddress && (secure === undefined ? base.secure : secure) !== null),
  };
  if (!cfg.isConfigured) {
    return publicVerifyResult(cfg, { ok: false, classification: 'CONFIG_ERROR', errorCode: 'SMTP_NOT_CONFIGURED' });
  }

  const useThrowaway = persistCache === false || port != null || secure !== undefined;
  const transporter = injectedTransporter || (useThrowaway ? createTransporter(cfg) : getTransporter(cfg));
  if (typeof transporter.verify !== 'function') {
    return publicVerifyResult(cfg, { ok: false, classification: 'CONFIG_ERROR', errorCode: 'SMTP_VERIFY_UNAVAILABLE' });
  }

  try {
    await transporter.verify();
    return publicVerifyResult(cfg, { ok: true, classification: 'SUCCESS' });
  } catch (err) {
    return publicVerifyResult(cfg, { ok: false, ...classifySmtpVerifyError(err) });
  }
}

export async function sendSmtpEmail({ to, subject, text, html, replyTo } = {}) {
  const cfg = getSmtpConfig();
  if (!cfg.isConfigured) {
    throw new SmtpTransportError(
      'SMTP_NOT_CONFIGURED',
      'SMTP transacional não configurado. O link não foi enviado.',
    );
  }
  const recipient = String(to || '').trim().toLowerCase();
  if (!EMAIL_RE.test(recipient)) {
    throw new SmtpTransportError('INVALID_RECIPIENT', 'E-mail do paciente inválido.');
  }

  try {
    const info = await getTransporter(cfg).sendMail({
      from: `${cfg.fromName} <${cfg.fromAddress}>`,
      to: recipient,
      subject,
      text,
      html,
      replyTo: replyTo || cfg.replyTo || undefined,
    });
    return {
      ok: true,
      delivered: false,
      acceptedByTransport: true,
      simulated: false,
      provider: 'smtp',
      messageId: info?.messageId || null,
    };
  } catch (err) {
    if (err instanceof SmtpTransportError) throw err;
    const mapped = classifySmtpError(err);
    console.error('[smtp-mailer]', mapped.code);
    throw new SmtpTransportError(mapped.code, mapped.message);
  }
}
