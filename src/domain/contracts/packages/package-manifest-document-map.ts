/**
 * @module domain/contracts/packages/package-manifest-document-map
 * @description Mapeamento operacional → taxonomia oficial CONTRACT_DOCUMENT_TYPES.
 * Phase 10.21T — design only.
 */

import type { ContractDocumentType } from '../contract.constants.js';
import type { SignatureAcceptanceCode } from '../signatures/signature.types.js';

/** Tipos do package operacional (`buildDocumentPackageForBudget`). */
export type OperationalPackageDocumentType =
  | 'CONTRACT_SERVICES'
  | 'TCLE'
  | 'LGPD'
  | 'IMAGE_USE'
  | 'ANNEX'
  | string;

export interface MappedPackageDocumentType {
  documentType: ContractDocumentType;
  documentKeyPrefix: string;
  defaultAcceptanceCode: SignatureAcceptanceCode;
  defaultAcceptanceLabel: string;
  requiredDefault: boolean;
}

/**
 * Não cria enum paralelo incompatível.
 * Usa CONTRACT_DOCUMENT_TYPES existentes.
 */
export function mapOperationalDocumentTypeToContractDocumentType(
  operationalType: OperationalPackageDocumentType,
  tcleId?: string | null,
): MappedPackageDocumentType {
  const type = String(operationalType || '').toUpperCase();

  if (type === 'CONTRACT_SERVICES' || type === 'SERVICE_CONTRACT') {
    return {
      documentType: 'SERVICE_CONTRACT',
      documentKeyPrefix: 'contract',
      defaultAcceptanceCode: 'DOCUMENT_READ',
      defaultAcceptanceLabel: 'Li e estou de acordo com o contrato',
      requiredDefault: true,
    };
  }

  if (type === 'LGPD' || type === 'LGPD_TERM') {
    return {
      documentType: 'LGPD_TERM',
      documentKeyPrefix: 'lgpd',
      defaultAcceptanceCode: 'LGPD_NOTICE_ACKNOWLEDGED',
      defaultAcceptanceLabel: 'Li e estou de acordo com a política de privacidade (LGPD)',
      requiredDefault: true,
    };
  }

  if (type === 'IMAGE_USE' || type === 'IMAGE_AUTHORIZATION') {
    return {
      documentType: 'IMAGE_AUTHORIZATION',
      documentKeyPrefix: 'image',
      defaultAcceptanceCode: 'CONTENT_CONFIRMED',
      defaultAcceptanceLabel: 'Autorizo o uso de imagem conforme o termo',
      requiredDefault: false,
    };
  }

  if (type === 'TCLE' || type.includes('CONSENT')) {
    const specialized = specializeTcleDocumentType(tcleId);
    return {
      documentType: specialized,
      documentKeyPrefix: tcleId ? `tcle:${tcleId}` : 'tcle',
      defaultAcceptanceCode: 'CLINICAL_CONSENT_CONFIRMED',
      defaultAcceptanceLabel: 'Li, compreendi e concordo com o termo de consentimento',
      requiredDefault: true,
    };
  }

  return {
    documentType: 'CUSTOM',
    documentKeyPrefix: 'other',
    defaultAcceptanceCode: 'CONTENT_CONFIRMED',
    defaultAcceptanceLabel: 'Li e estou de acordo',
    requiredDefault: false,
  };
}

function specializeTcleDocumentType(tcleId?: string | null): ContractDocumentType {
  const id = String(tcleId || '').toLowerCase();
  if (id.includes('implante') || id.includes('implant')) return 'IMPLANT_CONSENT';
  if (id.includes('anest')) return 'ANESTHESIA_CONSENT';
  if (id.includes('cirurg') || id.includes('surg')) return 'SURGICAL_CONSENT';
  if (id.includes('protese') || id.includes('prótese') || id.includes('prost')) {
    return 'PROSTHESIS_CONSENT';
  }
  if (id.includes('orto')) return 'ORTHODONTIC_CONSENT';
  if (id.includes('endo')) return 'ENDODONTIC_CONSENT';
  if (id.includes('sedac')) return 'SEDATION_CONSENT';
  return 'INFORMED_CONSENT';
}

export function buildManifestDocumentKey(
  operationalType: OperationalPackageDocumentType,
  tcleId?: string | null,
): string {
  const mapped = mapOperationalDocumentTypeToContractDocumentType(operationalType, tcleId);
  if (mapped.documentKeyPrefix.startsWith('tcle:')) return mapped.documentKeyPrefix;
  if (operationalType === 'TCLE' && tcleId) return `tcle:${tcleId}`;
  return mapped.documentKeyPrefix;
}
