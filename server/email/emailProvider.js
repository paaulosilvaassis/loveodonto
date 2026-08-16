import { getEmailConfig, getSmtpConfig } from './emailConfig.js';
import { sendSmtpEmail, SmtpTransportError } from './smtpMailer.js';

/**
 * Overlay HTTP opcional. Não é o SSOT de convites (esse é o SMTP do Supabase Auth).
 * Preferência transacional: SMTP direto. Fail-closed sem transporte.
 */
export async function sendHttpTransactionalEmail({ to, subject, text, html }) {
  const config = getEmailConfig();
  if (!config.isConfigured) {
    throw new SmtpTransportError(
      'SMTP_NOT_CONFIGURED',
      'Transporte transacional genérico ausente. O link não foi enviado.',
    );
  }

  if (config.provider === 'sendgrid') {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: config.fromAddress, name: config.fromName },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
    });
    if (!response.ok) {
      throw new SmtpTransportError('SMTP_SEND_FAILED', 'O servidor de e-mail recusou o disparo. O link não foi enviado.');
    }
    return {
      ok: true,
      delivered: true,
      acceptedByTransport: true,
      simulated: false,
      provider: 'sendgrid',
      messageId: response.headers.get('x-message-id') || null,
    };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${config.fromName} <${config.fromAddress}>`,
      to: [to],
      subject,
      text,
      html,
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new SmtpTransportError('SMTP_SEND_FAILED', 'O servidor de e-mail recusou o disparo. O link não foi enviado.');
  }
  return {
    ok: true,
    delivered: true,
    acceptedByTransport: true,
    simulated: false,
    provider: 'resend',
    messageId: json?.id || null,
  };
}

export async function sendTransactionalEmail({ to, subject, text, html, replyTo } = {}) {
  if (getSmtpConfig().isConfigured) {
    return sendSmtpEmail({ to, subject, text, html, replyTo });
  }
  if (getEmailConfig().isConfigured) {
    return sendHttpTransactionalEmail({ to, subject, text, html });
  }
  throw new SmtpTransportError(
    'SMTP_NOT_CONFIGURED',
    'SMTP transacional não configurado. O link não foi enviado.',
  );
}

export { SmtpTransportError };
