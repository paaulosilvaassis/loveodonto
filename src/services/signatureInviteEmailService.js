/**
 * Dispara o e-mail de convite de assinatura pela Admin API.
 * Transporte: e-mail transacional genérico do backend — não usa convite Auth.
 * Nunca trata simulação local como enviado.
 */
import { getPlatformAccessToken } from '../auth/saasSessionResolver.js';
import { assertAdminApiFetchAllowed, buildAdminApiUrl } from '../config/adminApiBase.js';

export const SIGNATURE_INVITE_EMAIL_PATH = '/internal/app/contracts/signature-invite-email';

export const SIGNATURE_INVITE_SENT_MSG = 'Solicitação de assinatura enviada por e-mail.';

export const EMAIL_PROVIDER_NOT_CONFIGURED_MSG =
  'O envio de e-mail de assinatura não está configurado. O link não foi enviado.';

export const EMAIL_PROVIDER_REJECTED_MSG =
  'O provedor de e-mail recusou o disparo. O link não foi enviado.';

const RAW_SMTP_ERROR = /ECONNREFUSED|EAUTH|ETIMEDOUT|ENOTFOUND|ESOCKET|535 Authentication|Invalid login/i;

function friendlyDeliveryError(json, fallback) {
  const code = String(json?.code || '');
  if (code === 'SMTP_NOT_CONFIGURED' || code === 'EMAIL_PROVIDER_NOT_CONFIGURED' || code === 'RESEND_NOT_CONFIGURED') {
    return EMAIL_PROVIDER_NOT_CONFIGURED_MSG;
  }
  if (code === 'SMTP_AUTH_FAILED') return 'Não foi possível autenticar no servidor de e-mail. O link não foi enviado.';
  if (code === 'SMTP_CONNECTION_FAILED') return 'Não foi possível conectar ao servidor de e-mail. O link não foi enviado.';
  if (code === 'RESEND_REQUEST_FAILED' || code === 'RESEND_REJECTED' || code === 'RESEND_INVALID_RESPONSE') {
    return EMAIL_PROVIDER_REJECTED_MSG;
  }
  if (code === 'INVALID_RECIPIENT') return 'E-mail do paciente inválido.';
  const candidate = String(json?.error || fallback || EMAIL_PROVIDER_REJECTED_MSG);
  if (RAW_SMTP_ERROR.test(candidate)) return EMAIL_PROVIDER_REJECTED_MSG;
  return candidate;
}

function relativeSignPath(signUrl) {
  const raw = String(signUrl || '').trim();
  if (raw.startsWith('/assinatura/')) return raw.split('?')[0];
  try {
    const parsed = new URL(raw);
    if (parsed.pathname.startsWith('/assinatura/')) return parsed.pathname;
  } catch {
    /* ignore */
  }
  return '';
}

/** Distingue falha de rede/CORS/timeout de resposta HTTP da Admin API. */
export function classifySignatureInviteNetworkError(err) {
  const name = String(err?.name || '');
  const message = String(err?.message || '');
  if (name === 'AbortError' || /aborted|timeout|timed out/i.test(message)) {
    return {
      code: 'EMAIL_REQUEST_TIMEOUT',
      networkError: name || 'AbortError',
      httpStatus: null,
    };
  }
  return {
    code: 'EMAIL_REQUEST_FAILED',
    networkError: name || 'TypeError',
    httpStatus: null,
  };
}

export async function deliverSignatureInviteEmail({
  to,
  patientName,
  treatmentName,
  clinicName,
  clinicIdentity,
  signUrl,
  expiresAt,
  contractNumber,
  requestId,
}) {
  const email = String(to || '').trim();
  if (!email.includes('@')) {
    const err = new Error('Informe o e-mail do paciente para enviar o link de assinatura.');
    err.code = 'PATIENT_EMAIL_MISSING';
    throw err;
  }
  const signPath = relativeSignPath(signUrl);
  if (!signPath) {
    const err = new Error('Link de assinatura inválido.');
    err.code = 'INVALID_SIGN_PATH';
    throw err;
  }

  assertAdminApiFetchAllowed();
  const token = await getPlatformAccessToken();
  if (!token) throw new Error('Sessão ausente.');

  let response;
  try {
    response = await fetch(buildAdminApiUrl(SIGNATURE_INVITE_EMAIL_PATH), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: email,
        patientName,
        treatmentName,
        clinicName,
        clinicIdentity,
        signPath,
        expiresAt,
        contractNumber,
        requestId,
      }),
    });
  } catch (err) {
    const classified = classifySignatureInviteNetworkError(err);
    const error = new Error(
      'Não foi possível conectar à Admin API para enviar o e-mail.',
    );
    error.code = classified.code;
    error.networkError = classified.networkError;
    error.httpStatus = classified.httpStatus;
    error.cause = err;
    throw error;
  }

  const json = await response.json().catch(() => ({}));
  if (
    response.status === 503
    || json?.code === 'EMAIL_PROVIDER_NOT_CONFIGURED'
    || json?.code === 'SMTP_NOT_CONFIGURED'
    || json?.code === 'RESEND_NOT_CONFIGURED'
  ) {
    const error = new Error(friendlyDeliveryError(json, EMAIL_PROVIDER_NOT_CONFIGURED_MSG));
    error.code = json?.code || 'SMTP_NOT_CONFIGURED';
    error.httpStatus = response.status;
    error.networkError = null;
    throw error;
  }
  if (!response.ok || json?.ok !== true || json?.simulated === true) {
    const error = new Error(friendlyDeliveryError(json, EMAIL_PROVIDER_REJECTED_MSG));
    error.code = json?.code || 'EMAIL_PROVIDER_REJECTED';
    error.status = response.status;
    error.httpStatus = response.status;
    error.networkError = null;
    throw error;
  }
  return {
    ok: true,
    simulated: false,
    provider: json.provider || null,
    messageId: json.messageId || null,
  };
}
