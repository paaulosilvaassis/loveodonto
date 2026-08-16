/**
 * Mensagens de geração de contrato para o usuário final.
 * Erros técnicos de rede (ex.: "Failed to fetch") não podem vazar na UI.
 */

export const CONTRACT_GENERATION_INDETERMINATE_MSG =
  'Não foi possível confirmar a geração do contrato. Atualize a tela antes de tentar novamente.';

export const CONTRACT_GENERATION_SYNC_UNCONFIRMED_MSG =
  'Não foi possível confirmar a sincronização do contrato. Atualize a tela antes de tentar novamente.';

const NETWORK_ERROR_RE = /failed to fetch|networkerror|network request failed|fetch failed|load failed|err_network|err_connection|err_timed_out|timeout|aborted/i;

export function isTechnicalNetworkErrorMessage(message) {
  return NETWORK_ERROR_RE.test(String(message || ''));
}

/**
 * @param {unknown} err
 * @param {{ persistedLocally?: boolean }} [opts]
 * @returns {string}
 */
export function mapContractGenerationUserError(err, { persistedLocally = false } = {}) {
  if (persistedLocally) return CONTRACT_GENERATION_SYNC_UNCONFIRMED_MSG;
  const raw = String(err?.message || err || '').trim();
  if (!raw || isTechnicalNetworkErrorMessage(raw)) {
    return CONTRACT_GENERATION_INDETERMINATE_MSG;
  }
  return raw;
}
