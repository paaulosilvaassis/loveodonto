/**
 * @module domain/contracts/files/contract-storage-path
 * @description Builder seguro de paths — Phase 10.7.
 */

import { createContractDomainError } from '../contract.errors.js';
import type { ContractFileType } from './contract-file.types.js';
import { extensionForMimeType } from './contract-file-mime.js';

export interface ContractStoragePathInput {
  tenantId: string;
  contractId: string;
  versionId: string;
  fileType: ContractFileType;
  fileId: string;
  mimeType: string;
  envelopeId?: string;
}

export interface ContractStoragePathBuilder {
  build(input: ContractStoragePathInput): string;
}

const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/;

function assertSafeId(value: string, field: string): string {
  const v = String(value || '').trim();
  if (!v || v.includes('..') || v.includes('/') || v.includes('\\') || !SAFE_ID.test(v)) {
    throw Object.assign(new Error('Path inválido.'), {
      domainError: createContractDomainError(
        'CONTRACT_FILE_PATH_INVALID',
        `Identificador inválido para path: ${field}.`,
        field,
      ),
    });
  }
  return v;
}

export function createContractStoragePathBuilder(): ContractStoragePathBuilder {
  return {
    build(input) {
      const tenantId = assertSafeId(input.tenantId, 'tenantId');
      const contractId = assertSafeId(input.contractId, 'contractId');
      const versionId = assertSafeId(input.versionId, 'versionId');
      const fileId = assertSafeId(input.fileId, 'fileId');
      const fileType = assertSafeId(input.fileType, 'fileType');
      const ext = extensionForMimeType(input.mimeType);

      if (input.envelopeId) {
        const envelopeId = assertSafeId(input.envelopeId, 'envelopeId');
        return [
          'tenants', tenantId,
          'contracts', contractId,
          'versions', versionId,
          'envelopes', envelopeId,
          fileType,
          `${fileId}.${ext}`,
        ].join('/');
      }

      return [
        'tenants', tenantId,
        'contracts', contractId,
        'versions', versionId,
        fileType,
        `${fileId}.${ext}`,
      ].join('/');
    },
  };
}
