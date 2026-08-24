/**
 * PHASE_10.21BX/BZ — SSOT de versão da instância de contrato gerado (IndexedDB).
 * Não é templateVersion. Não backfill de contratos já congelados.
 */

export const INITIAL_GENERATED_CONTRACT_VERSION = 1;
export const CONTRACT_VERSION_NOT_ESTABLISHED = 'CONTRACT_VERSION_NOT_ESTABLISHED';

export function readPersistedContractVersion(contract) {
  const n = Number(contract?.version);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export function requirePersistedContractVersion(contract) {
  const n = readPersistedContractVersion(contract);
  if (n == null) {
    const err = new Error('Versão do contrato não está persistida.');
    err.code = CONTRACT_VERSION_NOT_ESTABLISHED;
    throw err;
  }
  return n;
}
