import { getEmailConfig } from './emailConfig.js';

export async function sendTransactionalEmail({ to, subject, text, html }) {
  const config = getEmailConfig();
  if (!config.isConfigured) {
    throw new Error('Provedor de e-mail não configurado (EMAIL_API_KEY / EMAIL_FROM_ADDRESS).');
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
      const body = await response.text().catch(() => '');
      throw new Error(`SendGrid HTTP ${response.status}: ${body || 'falha ao enviar e-mail'}`);
    }
    return { provider: 'sendgrid', messageId: response.headers.get('x-message-id') || null };
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
    throw new Error(json?.message || `Resend HTTP ${response.status}`);
  }
  return { provider: 'resend', messageId: json?.id || null };
}
