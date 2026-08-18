import { getEmailConfig, getResendConfig, getSmtpConfig } from './emailConfig.js';
import { sendSmtpEmail, SmtpTransportError } from './smtpMailer.js';
import { sendResendEmail, ResendTransportError } from './resendMailer.js';

/**
 * Overlay HTTP legado (EMAIL_API_KEY). Não é o SSOT quando RESEND_API_KEY existe.
 * Auth (convite/senha) permanece no SMTP encapsulado do Supabase Auth.
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
      delivered: false,
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
    delivered: false,
    acceptedByTransport: true,
    simulated: false,
    provider: 'resend',
    messageId: json?.id || null,
  };
}

/**
 * Primário: Resend. SMTP só se Resend estiver ausente.
 * Falha Resend NÃO cai para SMTP.
 */
export async function sendTransactionalEmail({ to, subject, text, html, replyTo } = {}) {
  if (getResendConfig().isConfigured) {
    return sendResendEmail({ to, subject, text, html, replyTo });
  }
  if (getSmtpConfig().isConfigured) {
    return sendSmtpEmail({ to, subject, text, html, replyTo });
  }
  if (getEmailConfig().isConfigured) {
    return sendHttpTransactionalEmail({ to, subject, text, html });
  }
  throw new ResendTransportError(
    'RESEND_NOT_CONFIGURED',
    'O envio de e-mail de assinatura não está configurado. O link não foi enviado.',
  );
}

export { SmtpTransportError, ResendTransportError };
