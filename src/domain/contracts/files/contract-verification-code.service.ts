/**
 * @module domain/contracts/files/contract-verification-code.service
 * @description Código de verificação abstrato — Phase 10.7.
 * Sem rota pública real; sem dados pessoais no código.
 */

import { createContractDomainError } from '../contract.errors.js';
import type { ContractId, ContractVersionId, TenantId } from '../contract.ids.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import { sha256Utf8 } from './contract-binary-hash.js';

export interface IssueContractVerificationCodeInput {
  tenantId: TenantId;
  contractId: ContractId;
  contractVersionId: ContractVersionId;
  expiresAt: string;
}

export interface ValidatedContractVerificationCode {
  valid: boolean;
  tenantId?: TenantId;
  contractId?: ContractId;
  contractVersionId?: ContractVersionId;
  errorCode?: string;
}

export interface ContractVerificationCodeService {
  issue(input: IssueContractVerificationCodeInput): Promise<string>;
  validate(code: string): Promise<ValidatedContractVerificationCode>;
  revoke(code: string): Promise<void>;
}

interface StoredCode {
  codeHash: string;
  tenantId: TenantId;
  contractId: ContractId;
  contractVersionId: ContractVersionId;
  expiresAt: string;
  revokedAt?: string;
}

function randomCode(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `vc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function createMemoryContractVerificationCodeService(
  clock: ContractClock = createSystemContractClock(),
): ContractVerificationCodeService {
  const byHash = new Map<string, StoredCode>();

  return {
    async issue(input) {
      const code = randomCode();
      const codeHash = await sha256Utf8(code);
      byHash.set(codeHash, {
        codeHash,
        tenantId: input.tenantId,
        contractId: input.contractId,
        contractVersionId: input.contractVersionId,
        expiresAt: input.expiresAt,
      });
      return code;
    },

    async validate(code) {
      if (!String(code || '').trim()) {
        return { valid: false, errorCode: 'CONTRACT_VERIFICATION_CODE_INVALID' };
      }
      const codeHash = await sha256Utf8(code);
      const stored = byHash.get(codeHash);
      if (!stored || stored.revokedAt) {
        return { valid: false, errorCode: 'CONTRACT_VERIFICATION_CODE_INVALID' };
      }
      if (Date.parse(stored.expiresAt) <= clock.now().getTime()) {
        return { valid: false, errorCode: 'CONTRACT_VERIFICATION_CODE_INVALID' };
      }
      return {
        valid: true,
        tenantId: stored.tenantId,
        contractId: stored.contractId,
        contractVersionId: stored.contractVersionId,
      };
    },

    async revoke(code) {
      const codeHash = await sha256Utf8(code);
      const stored = byHash.get(codeHash);
      if (stored) {
        stored.revokedAt = clock.nowIso();
        byHash.set(codeHash, stored);
      }
    },
  };
}

export function createVerificationQrPayload(code: string): {
  kind: 'CONTRACT_VERIFICATION_V2_ABSTRACT';
  codePresent: boolean;
  /** Payload abstrato — não é URL pública permanente. */
  payload: string;
} {
  if (!code) {
    throw Object.assign(new Error('Código inválido.'), {
      domainError: createContractDomainError(
        'CONTRACT_VERIFICATION_CODE_INVALID',
        'Código de verificação inválido.',
      ),
    });
  }
  return {
    kind: 'CONTRACT_VERIFICATION_V2_ABSTRACT',
    codePresent: true,
    payload: `loveodonto:verify-v2:${code.slice(0, 8)}…`,
  };
}
