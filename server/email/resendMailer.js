/**
 * Mailer Resend via HTTPS oficial (POST /emails).
 * Não envia em teste sem fetch injetado. Não loga API key.
 */
import { getResendConfig, RESEND_FROM_ADDRESS } from './emailConfig.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 15000;

let injectedFetch = null;

export class ResendTransportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ResendTransportError';
    this.code = code;
  }
}

export function setResendFetchForTests(fn) {
  injectedFetch = typeof fn === 'function' ? fn : null;
}

export function classifyResendHttpStatus(status) {
  const code = Number(status || 0);
  if (code === 401 || code === 403 || (code >= 400 && code < 500)) return 'RESEND_REJECTED';
  if (code >= 500) return 'RESEND_REQUEST_FAILED';
  return 'RESEND_INVALID_RESPONSE';
}

function resolveFetch() {
  if (injectedFetch) return injectedFetch;
  if (process.env.VITEST === 'true') {
    throw new ResendTransportError(
      'RESEND_REQUEST_FAILED',
      'Envio Resend bloqueado em teste sem mock.',
    );
  }
  return fetch;
}

export async function sendResendEmail({ to, subject, text, html, replyTo, fromName } = {}) {
  const cfg = getResendConfig();
  if (!cfg.isConfigured) {
    throw new ResendTransportError(
      'RESEND_NOT_CONFIGURED',
      'O envio de e-mail de assinatura não está configurado. O link não foi enviado.',
    );
  }

  const recipient = String(to || '').trim().toLowerCase();
  if (!EMAIL_RE.test(recipient)) {
    throw new ResendTransportError('INVALID_RECIPIENT', 'E-mail do paciente inválido.');
  }

  const fromAddress = cfg.fromAddress || RESEND_FROM_ADDRESS;
  if (fromAddress.toLowerCase().includes('onboarding@resend.dev')) {
    throw new ResendTransportError(
      'RESEND_NOT_CONFIGURED',
      'Remetente Resend inválido para produção.',
    );
  }

  const displayName = String(fromName || '').replace(/[<>\r\n"]/g, '').trim().slice(0, 78) || cfg.fromName;
  const payload = {
    from: `${displayName} <${fromAddress}>`,
    to: [recipient],
    subject,
    text,
    html,
  };
  const reply = String(replyTo || cfg.replyTo || '').trim();
  if (EMAIL_RE.test(reply)) payload.reply_to = [reply];

  let response;
  try {
    const doFetch = resolveFetch();
    response = await doFetch(RESEND_EMAILS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof ResendTransportError) throw err;
    console.error('[resend-mailer]', 'RESEND_REQUEST_FAILED');
    throw new ResendTransportError(
      'RESEND_REQUEST_FAILED',
      'O provedor de e-mail não aceitou o disparo. O link não foi enviado.',
    );
  }

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = classifyResendHttpStatus(response.status);
    console.error('[resend-mailer]', code);
    throw new ResendTransportError(
      code,
      'O provedor de e-mail recusou o disparo. O link não foi enviado.',
    );
  }

  const messageId = json && typeof json.id === 'string' && json.id.trim() ? json.id.trim() : null;
  if (!messageId) {
    console.error('[resend-mailer]', 'RESEND_INVALID_RESPONSE');
    throw new ResendTransportError(
      'RESEND_INVALID_RESPONSE',
      'O provedor de e-mail retornou uma resposta inválida. O link não foi enviado.',
    );
  }

  return {
    ok: true,
    delivered: false,
    acceptedByTransport: true,
    simulated: false,
    provider: 'resend',
    messageId,
  };
}
