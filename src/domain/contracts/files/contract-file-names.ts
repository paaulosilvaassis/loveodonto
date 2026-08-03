/**
 * @module domain/contracts/files/contract-file-names
 * @description Nomes internos gerados — Phase 10.7.
 */

import type { ContractFileType } from './contract-file.types.js';

const MAX_NAME_LEN = 120;

/** Remove acentos, espaços e caracteres inseguros. */
export function sanitizeContractFileNamePart(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
    .toLowerCase() || 'x';
}

export function buildGeneratedContractFileName(input: {
  fileType: ContractFileType;
  contractNumber: string;
  versionNumber: number;
  mimeExtension: string;
}): string {
  const num = sanitizeContractFileNamePart(input.contractNumber);
  const v = Number(input.versionNumber) || 1;
  const ext = sanitizeContractFileNamePart(input.mimeExtension).replace(/^\./, '');
  let base: string;
  switch (input.fileType) {
    case 'GENERATED_PDF':
      base = `contrato-${num}-v${v}-nao-assinado`;
      break;
    case 'SIGNED_PDF':
      base = `contrato-${num}-v${v}-assinado`;
      break;
    case 'EVIDENCE_REPORT':
      base = `evidencias-${num}-v${v}`;
      break;
    case 'INTEGRITY_MANIFEST':
      base = `integridade-${num}-v${v}`;
      break;
    default:
      base = `arquivo-${num}-v${v}-${sanitizeContractFileNamePart(input.fileType)}`;
  }
  const name = `${base}.${ext}`;
  return name.length > MAX_NAME_LEN ? name.slice(0, MAX_NAME_LEN) : name;
}
