/**
 * Espelha contrato gerado no Supabase (modo SaaS), quando a tabela existir.
 * IndexedDB permanece SSOT da geração clínica V1.
 * Falha de rede/HTTP NÃO pode abortar um rascunho já persistido localmente.
 */
import { getPlatformAccessToken } from '../auth/saasSessionResolver.js';
import { isSaasModeEnabled } from './saasAuthService.js';
import { assertAdminApiFetchAllowed, buildAdminApiUrl } from '../config/adminApiBase.js';
import { isContractsOperationalUxLocalTestEnabled } from '../domain/contracts/rollout/contracts-operational-ux-local-test.ts';

export const GENERATED_CONTRACTS_SYNC_PATH = '/internal/app/contracts/generated';

async function getAccessTokenOrThrow() {
  const token = await getPlatformAccessToken();
  if (!token) throw new Error('Sessão ausente.');
  return token;
}

/**
 * @param {object} row — shape alinhado ao IndexedDB (camelCase); servidor normaliza.
 * @returns {Promise<{ ok?: boolean, skipped?: boolean, reason?: string, error?: string, status?: number, network?: boolean, id?: string }>}
 */
export async function syncGeneratedContractToSaas(row) {
  try {
    if (isContractsOperationalUxLocalTestEnabled()) {
      return { skipped: true, reason: 'local_operational_ux_test' };
    }
    if (!isSaasModeEnabled() || !row?.id) return { skipped: true };
    assertAdminApiFetchAllowed();
    const token = await getAccessTokenOrThrow();
    const response = await fetch(buildAdminApiUrl(GENERATED_CONTRACTS_SYNC_PATH), {
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
      return { ok: false, error: json?.error || `HTTP ${response.status}`, status: response.status };
    }
    return { ok: true, ...json };
  } catch (err) {
    if (import.meta.env?.DEV) console.debug('[contractSaasSync] network', err?.message || err);
    return {
      ok: false,
      network: true,
      error: String(err?.message || err || 'sync_failed'),
    };
  }
}
