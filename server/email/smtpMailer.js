/**
 * Mailer SMTP interno. Não é endpoint público.
 * sendMail success = accepted by transport, não inbox delivered.
 */
import nodemailer from 'nodemailer';
import { getSmtpConfig } from './emailConfig.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function getTransporter(cfg) {
  if (injectedTransporter) return injectedTransporter;
  const fingerprint = `${cfg.host}|${cfg.port}|${cfg.user}|${cfg.secure}`;
  if (cachedTransporter && cachedFingerprint === fingerprint) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
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
  });
  cachedFingerprint = fingerprint;
  return cachedTransporter;
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
      delivered: true,
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
