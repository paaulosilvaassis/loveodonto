/**
 * POST /internal/app/contracts/signature-invite-email
 * E-mail transacional genérico (HTML do contrato). NÃO usa inviteUserByEmail.
 * Preferência: Resend HTTPS. SMTP legado só se Resend estiver ausente.
 * Fail-closed. Não aceita HTML arbitrário. Não registra URL completa em logs.
 */
import { isTransactionalEmailConfigured } from '../email/emailConfig.js';
import { sendTransactionalEmail } from '../email/transactionalEmailService.js';
import { buildSignatureInviteEmail } from '../email/buildSignatureInviteEmail.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIGN_PATH_RE = /^\/assinatura\/[A-Za-z0-9_-]+$/;
const inFlight = new Set();

function normalizeText(value) {
  return String(value || '').trim();
}

function appOrigin() {
  const raw = normalizeText(process.env.APP_URL) || 'https://loveodonto.com.br';
  return raw.replace(/\/+$/, '');
}

function publicError(err) {
  const code = String(err?.code || '');
  const message = String(err?.message || 'O provedor de e-mail recusou o disparo. O link não foi enviado.');
  if (code === 'INVALID_RECIPIENT') return { status: 400, code, error: message };
  if (code === 'RESEND_NOT_CONFIGURED' || code === 'SMTP_NOT_CONFIGURED' || code === 'EMAIL_PROVIDER_NOT_CONFIGURED') {
    return { status: 503, code, error: message };
  }
  if (code.startsWith('RESEND_') || code.startsWith('SMTP_')) return { status: 502, code, error: message };
  return {
    status: 502,
    code: 'EMAIL_PROVIDER_REJECTED',
    error: 'O provedor de e-mail recusou o disparo. O link não foi enviado.',
  };
}

export function createContractsSignatureInviteEmailHandler() {
  return async function handleContractsSignatureInviteEmail(req, res) {
    const to = normalizeText(req.body?.to).toLowerCase();
    const signPath = normalizeText(req.body?.signPath);
    const flightKey = `${to}|${signPath}`;
    try {
      if (!EMAIL_RE.test(to)) {
        return res.status(400).json({ error: 'E-mail do paciente inválido.', code: 'INVALID_RECIPIENT' });
      }
      if (!SIGN_PATH_RE.test(signPath)) {
        return res.status(400).json({ error: 'Caminho de assinatura inválido.', code: 'INVALID_SIGN_PATH' });
      }
      if (!isTransactionalEmailConfigured()) {
        return res.status(503).json({
          error: 'O envio de e-mail de assinatura não está configurado. O SMTP do Supabase Auth envia apenas e-mails de autenticação e não pode enviar o link de assinatura.',
          code: 'RESEND_NOT_CONFIGURED',
        });
      }
      if (inFlight.has(flightKey)) {
        return res.status(409).json({
          error: 'Já existe um envio em andamento para este destinatário.',
          code: 'SMTP_SEND_IN_FLIGHT',
        });
      }
      inFlight.add(flightKey);

      const signUrl = `${appOrigin()}${signPath}`;
      const template = buildSignatureInviteEmail({
        patientName: normalizeText(req.body?.patientName) || 'paciente',
        treatmentName: normalizeText(req.body?.treatmentName) || '',
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
        acceptedByTransport: delivery.acceptedByTransport === true,
        delivered: false,
        provider: delivery.provider,
        messageId: delivery.messageId || null,
      });
    } catch (err) {
      const mapped = publicError(err);
      console.error('[signature-invite-email]', mapped.code);
      return res.status(mapped.status).json({
        error: mapped.error,
        code: mapped.code,
      });
    } finally {
      inFlight.delete(flightKey);
    }
  };
}
