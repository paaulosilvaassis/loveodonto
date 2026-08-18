/**
 * Contexto de IP observado no servidor para a página pública de assinatura.
 * Nunca envia um IP inventado pelo frontend como evidência.
 */
import { buildAdminApiUrl } from '../config/adminApiBase.js';

export const SIGNING_CLIENT_CONTEXT_PATH = '/internal/app/contracts/signing-client-context';

export async function fetchSigningClientContext() {
  try {
    const response = await fetch(buildAdminApiUrl(SIGNING_CLIENT_CONTEXT_PATH), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const json = await response.json();
    if (!json?.ok || !json.ip) return null;
    return {
      ip: json.ip,
      source: json.source === 'local-dev' ? 'local-dev' : (json.source || 'server'),
    };
  } catch {
    return null;
  }
}
