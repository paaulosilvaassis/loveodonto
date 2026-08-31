/**
 * Falhas da página pública. Somente kind semântico — sem IDs, tokens ou stacks.
 */
import { loadDb } from '../../db/index.js';
import { isAccessExpired } from './accessGuards.js';
import { isContractSignable } from './signability.js';
import { normalizeLinkLifecycleStatus } from './normalize.js';

export function describePublicSigningAccessFailure(token, trustedNow = Date.now()) {
  if (!token) return { kind: 'invalid' };
  const db = loadDb();
  const link = (db.contractSignLinks || []).find((row) => row.token === token) || null;
  if (!link) return { kind: 'invalid' };
  const linkStatus = normalizeLinkLifecycleStatus(link.status);
  if (linkStatus === 'revoked') return { kind: 'revoked' };
  if (linkStatus === 'signed') return { kind: 'replay' };
  if (linkStatus === 'expired' || isAccessExpired(link.expiresAt, trustedNow)) return { kind: 'expired' };
  const contract = (db.generatedContracts || []).find((row) => row.id === link.contractId) || null;
  if (!isContractSignable(contract)) return { kind: 'unavailable' };
  return { kind: 'invalid' };
}

export const PUBLIC_SIGNING_FAILURE_COPY = Object.freeze({
  expired: {
    title: 'Acesso expirado',
    body: 'Este acesso de assinatura expirou.',
  },
  revoked: {
    title: 'Acesso indisponível',
    body: 'Este acesso de assinatura não está mais disponível.',
  },
  unavailable: {
    title: 'Contrato indisponível',
    body: 'Este contrato não está disponível para assinatura.',
  },
  replay: {
    title: 'Este documento já foi assinado',
    body: 'O acesso de assinatura já foi utilizado e não pode ser reutilizado.',
  },
});
