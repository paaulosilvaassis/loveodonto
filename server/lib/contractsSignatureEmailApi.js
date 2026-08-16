/**
 * POST /internal/app/contracts/signature-invite-email
 * Envia o convite de assinatura via provedor transacional (Resend/SendGrid).
 * Não aceita HTML arbitrário do cliente. Não registra a URL completa em logs.
 */
import { getEmailConfig } from '../email/emailConfig.js';
import { sendTransactionalEmail } from '../email/emailProvider.js';
import { buildSignatureInviteEmail } from '../email/buildSignatureInviteEmail.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIGN_PATH_RE = /^\/assinatura\/[A-Za-z0-9_-]+$/;

function normalizeText(value) {
  return String(value || '').trim();
}

function appOrigin() {
  const raw = normalizeText(process.env.APP_URL) || 'https://loveodonto.com.br';
  return raw.replace(/\/+$/, '');
}

export function createContractsSignatureInviteEmailHandler() {
  return async function handleContractsSignatureInviteEmail(req, res) {
    try {
      const to = normalizeText(req.body?.to).toLowerCase();
      const signPath = normalizeText(req.body?.signPath);
      if (!EMAIL_RE.test(to)) {
        return res.status(400).json({ error: 'E-mail do paciente inválido.', code: 'INVALID_RECIPIENT' });
      }
      if (!SIGN_PATH_RE.test(signPath)) {
        return res.status(400).json({ error: 'Caminho de assinatura inválido.', code: 'INVALID_SIGN_PATH' });
      }

      const config = getEmailConfig();
      if (!config.isConfigured) {
        return res.status(503).json({
          error: 'Provedor de e-mail não configurado. Defina EMAIL_API_KEY e EMAIL_FROM_ADDRESS.',
          code: 'EMAIL_PROVIDER_NOT_CONFIGURED',
        });
      }

      const signUrl = `${appOrigin()}${signPath}`;
      const template = buildSignatureInviteEmail({
        patientName: normalizeText(req.body?.patientName) || 'paciente',
        treatmentName: normalizeText(req.body?.treatmentName) || 'tratamento odontológico',
        clinicName: normalizeText(req.body?.clinicName) || 'Clínica',
        signUrl,
        expiresAt: normalizeText(req.body?.expiresAt) || null,
        contractNumber: normalizeText(req.body?.contractNumber) || '',
      });

      const delivery = await sendTransactionalEmail({
        to,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });

      return res.json({
        ok: true,
        simulated: false,
        provider: delivery.provider,
        messageId: delivery.messageId || null,
      });
    } catch (err) {
      const message = String(err?.message || 'Falha ao enviar e-mail de assinatura.');
      console.error('[signature-invite-email]', message.slice(0, 180));
      return res.status(502).json({
        error: 'O provedor de e-mail recusou ou falhou o disparo.',
        code: 'EMAIL_PROVIDER_REJECTED',
      });
    }
  };
}
