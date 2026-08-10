/**
 * Espelha contrato gerado no Supabase (modo SaaS), quando a tabela existir.
 * Phase 10.21K: bloqueado no LOCAL TEST MODE para não gravar artefato clínico em produção.
 */
import { supabasePlatformClient } from '../lib/supabaseClients.js';
import { isSaasModeEnabled } from './saasAuthService.js';
import { assertAdminApiFetchAllowed, buildAdminApiUrl } from '../config/adminApiBase.js';
import { isContractsOperationalUxLocalTestEnabled } from '../domain/contracts/rollout/contracts-operational-ux-local-test.ts';

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
  if (isContractsOperationalUxLocalTestEnabled()) {
    return { skipped: true, reason: 'local_operational_ux_test' };
  }
  if (!isSaasModeEnabled() || !row?.id) return { skipped: true };
  assertAdminApiFetchAllowed();
  const token = await getAccessTokenOrThrow();
  const response = await fetch(buildAdminApiUrl('/internal/app/contracts/generated'), {
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
