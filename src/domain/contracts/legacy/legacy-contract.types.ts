/**
 * @module domain/contracts/legacy/legacy-contract.types
 * @description Shapes espelhando IndexedDB / Postgres 006 — somente leitura tipada.
 */

/** Status persistidos no app local (`contractConstants.CONTRACT_STATUS`). */
export const LEGACY_CONTRACT_STATUSES = [
  'draft',
  'generated',
  'sent',
  'viewed',
  'signed_by_patient',
  'signed_by_clinic',
  'completed',
  'awaiting_data',
  'ready_to_send',
  'vigente',
  'rescindido',
  'signed',
  'refused',
  'canceled',
  'expired',
  'replaced',
] as const;

export type LegacyContractStatus = (typeof LEGACY_CONTRACT_STATUSES)[number];

/** Status remotos CHECK em `006_app_contracts.sql`. */
export const REMOTE_CONTRACT_STATUSES = [
  'draft',
  'generated',
  'signed',
  'canceled',
] as const;

export type RemoteContractStatus = (typeof REMOTE_CONTRACT_STATUSES)[number];

/** Categorias legadas (`CONTRACT_CATEGORIES`). */
export const LEGACY_CONTRACT_CATEGORIES = [
  'servicos',
  'consentimento',
  'riscos',
  'autorizacao_tratamento',
  'menor_idade',
  'uso_imagem',
  'lgpd',
  'garantia',
  'desistencia',
  'pos_operatorio',
] as const;

export type LegacyContractCategory = (typeof LEGACY_CONTRACT_CATEGORIES)[number];

export interface LegacyGeneratedContract {
  id: string;
  clinicId?: string;
  tenant_id?: string | null;
  patientId: string;
  quoteId?: string;
  quoteSource?: 'crm_budget' | 'clinical_budget' | string;
  budgetId?: string | null;
  templateId?: string;
  templateVersion?: number;
  contractNumber?: string;
  finalContent?: string;
  renderedHtml?: string;
  pdfUrl?: string | null;
  status?: string;
  generatedBy?: string;
  generatedAt?: string;
  signedAt?: string | null;
  canceledAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
  title?: string;
  category?: string;
  treatmentType?: string | null;
  patientSnapshotJson?: Record<string, unknown>;
  clinicSnapshotJson?: Record<string, unknown>;
  professionalSnapshotJson?: Record<string, unknown>;
  clinicalSnapshotJson?: Record<string, unknown>;
  financialSnapshotJson?: Record<string, unknown>;
  totalValueSnapshot?: number;
  documentHash?: string;
  parentContractId?: string | null;
  replacedById?: string | null;
  version?: number;
  signatureRequestId?: string | null;
  lockedAt?: string | null;
  cancellationReason?: string;
  canceledBy?: string;
}

export interface LegacyContractSignature {
  id: string;
  tenant_id?: string | null;
  contractId: string;
  role?: string;
  name?: string;
  email?: string;
  phone?: string;
  signatureType?: string;
  signatureImageUrl?: string;
  signedAt?: string;
  ipAddress?: string;
  userAgent?: string;
  status?: string;
}

export interface LegacyContractAttachment {
  id: string;
  tenant_id?: string | null;
  contractId: string;
  fileName?: string;
  fileType?: string;
  mimeType?: string;
  fileUrl?: string;
  sizeBytes?: number;
  createdAt?: string;
  uploadedBy?: string;
}
