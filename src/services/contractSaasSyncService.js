/**
 * Espelha contrato gerado no Supabase (modo SaaS), quando a tabela existir.
 */
import { supabasePlatformClient } from '../lib/supabaseClients.js';
import { isSaasModeEnabled } from './saasAuthService.js';

function buildUrl(path) {
  const base = String(import.meta.env?.VITE_APP_ADMIN_API_BASE_URL || '').trim().replace(/\/$/, '');
  if (base) return `${base}${path}`;
  return path;
}

async function getAccessTokenOrThrow() {
  if (!supabasePlatformClient) {
    throw new Error('Supabase da plataforma não configurado.');
  }
  const { data, error } = await supabasePlatformClient.auth.getSession();
  if (error) throw new Error(error.message || 'Falha ao obter sessão.');
  const token = data?.session?.access_token || '';
  if (!token) throw new Error('Sessão ausente.');
  return token;
}

/**
 * @param {object} row — shape alinhado ao IndexedDB (camelCase); servidor normaliza.
 */
export async function syncGeneratedContractToSaas(row) {
  if (!isSaasModeEnabled() || !row?.id) return { skipped: true };
  const token = await getAccessTokenOrThrow();
  const response = await fetch(buildUrl('/internal/app/contracts/generated'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ record: row }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (import.meta.env?.DEV) console.debug('[contractSaasSync]', json?.error || response.status);
    return { ok: false, error: json?.error || `HTTP ${response.status}` };
  }
  return { ok: true, ...json };
}
