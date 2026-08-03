/**
 * @module domain/contracts/legacy/legacy-contract.mapper
 * @description Adapters puros legado ↔ domínio. Não persistem, não mutam IndexedDB.
 *
 * Políticas documentadas:
 * - Tipo desconhecido → CUSTOM + warning (nunca outro tipo clínico específico).
 * - Domain→Legacy sem representação segura → erro tipado (sem redução silenciosa).
 * - Data URL → legacyDataUrlPresent, sem storage reference inventada.
 * - Hash legado simples → preservado + warning (não crypto).
 * - Versão sem lockedAt → não marcar como imutável.
 */

import type { ContractDocumentType, ContractOrigin, ContractStatus } from '../contract.constants.js';
import {
  createContractDomainError,
  createContractDomainWarning,
  type ContractDomainError,
  type ContractDomainWarning,
} from '../contract.errors.js';
import type {
  Contract,
  ContractAttachmentSnapshot,
  ContractVersion,
} from '../contract.types.js';
import type { ContractFile } from '../files/contract-file.types.js';
import type { SignatureSigner } from '../signatures/signature.types.js';
import type {
  LegacyContractAttachment,
  LegacyContractCategory,
  LegacyContractSignature,
  LegacyContractStatus,
  LegacyGeneratedContract,
  RemoteContractStatus,
} from './legacy-contract.types.js';
import {
  LEGACY_CONTRACT_CATEGORIES,
  LEGACY_CONTRACT_STATUSES,
  REMOTE_CONTRACT_STATUSES,
} from './legacy-contract.types.js';

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

export interface LegacyMapSuccess<T> {
  ok: true;
  value: T;
  warnings: ContractDomainWarning[];
}

export interface LegacyMapFailure {
  ok: false;
  error: ContractDomainError;
  warnings: ContractDomainWarning[];
}

export type LegacyMapResult<T> = LegacyMapSuccess<T> | LegacyMapFailure;

function ok<T>(value: T, warnings: ContractDomainWarning[] = []): LegacyMapSuccess<T> {
  return { ok: true, value, warnings };
}

function fail(error: ContractDomainError, warnings: ContractDomainWarning[] = []): LegacyMapFailure {
  return { ok: false, error, warnings };
}

// ---------------------------------------------------------------------------
// Document type
// ---------------------------------------------------------------------------

const CATEGORY_TO_DOCUMENT_TYPE: Record<LegacyContractCategory, ContractDocumentType> = {
  servicos: 'SERVICE_CONTRACT',
  consentimento: 'INFORMED_CONSENT',
  riscos: 'INFORMED_CONSENT',
  autorizacao_tratamento: 'CUSTOM',
  menor_idade: 'CUSTOM',
  uso_imagem: 'IMAGE_AUTHORIZATION',
  lgpd: 'LGPD_TERM',
  garantia: 'CUSTOM',
  desistencia: 'CANCELLATION_TERM',
  pos_operatorio: 'CUSTOM',
};

const TREATMENT_TO_CONSENT: Record<string, ContractDocumentType> = {
  implante_unitario: 'IMPLANT_CONSENT',
  protocolo_total: 'IMPLANT_CONSENT',
  protese_implante: 'PROSTHESIS_CONSENT',
  protese_removivel: 'PROSTHESIS_CONSENT',
  protese_flexivel: 'PROSTHESIS_CONSENT',
  ponte_fixa: 'PROSTHESIS_CONSENT',
  ortodontia: 'ORTHODONTIC_CONSENT',
  endodontia: 'ENDODONTIC_CONSENT',
  cirurgia: 'SURGICAL_CONSENT',
  extracao: 'SURGICAL_CONSENT',
};

/**
 * Política: categoria/tratamento desconhecido ⇒ CUSTOM + warning.
 * Nunca converte um tipo clínico específico em outro tipo clínico incorreto.
 */
export function mapLegacyDocumentTypeToDomain(input: {
  category?: string | null;
  treatmentType?: string | null;
}): LegacyMapResult<ContractDocumentType> {
  const warnings: ContractDomainWarning[] = [];
  const category = String(input.category || '').trim();
  const treatment = String(input.treatmentType || '').trim();

  if (category === 'consentimento' && treatment && TREATMENT_TO_CONSENT[treatment]) {
    return ok(TREATMENT_TO_CONSENT[treatment], warnings);
  }

  if ((LEGACY_CONTRACT_CATEGORIES as readonly string[]).includes(category)) {
    const mapped = CATEGORY_TO_DOCUMENT_TYPE[category as LegacyContractCategory];
    if (mapped === 'CUSTOM') {
      warnings.push(createContractDomainWarning(
        'LEGACY_DOCUMENT_TYPE_CUSTOM',
        'Categoria legada mapeada para CUSTOM (sem tipo clínico canônico dedicado).',
        'documentType',
        { category },
      ));
    }
    return ok(mapped, warnings);
  }

  warnings.push(createContractDomainWarning(
    'LEGACY_DOCUMENT_TYPE_CUSTOM',
    'Tipo/categoria legada desconhecida mapeada para CUSTOM.',
    'documentType',
    { category, treatmentType: treatment || null },
  ));
  return ok('CUSTOM', warnings);
}

export function mapDomainDocumentTypeToLegacyCategory(
  documentType: ContractDocumentType,
): LegacyContractCategory {
  switch (documentType) {
    case 'SERVICE_CONTRACT':
      return 'servicos';
    case 'INFORMED_CONSENT':
    case 'ANESTHESIA_CONSENT':
    case 'SURGICAL_CONSENT':
    case 'IMPLANT_CONSENT':
    case 'PROSTHESIS_CONSENT':
    case 'ORTHODONTIC_CONSENT':
    case 'ENDODONTIC_CONSENT':
    case 'SEDATION_CONSENT':
      return 'consentimento';
    case 'LGPD_TERM':
      return 'lgpd';
    case 'IMAGE_AUTHORIZATION':
      return 'uso_imagem';
    case 'CANCELLATION_TERM':
    case 'TERMINATION_AGREEMENT':
    case 'TREATMENT_REFUSAL':
      return 'desistencia';
    default:
      return 'servicos';
  }
}

// ---------------------------------------------------------------------------
// Status: Legacy → Domain
// ---------------------------------------------------------------------------

const LEGACY_TO_DOMAIN_STATUS: Record<LegacyContractStatus, ContractStatus> = {
  draft: 'DRAFT',
  awaiting_data: 'DRAFT',
  generated: 'APPROVED',
  ready_to_send: 'APPROVED',
  sent: 'PENDING_SIGNATURES',
  viewed: 'PENDING_SIGNATURES',
  signed_by_patient: 'PARTIALLY_SIGNED',
  signed_by_clinic: 'PARTIALLY_SIGNED',
  completed: 'SIGNED',
  signed: 'SIGNED',
  vigente: 'SIGNED',
  refused: 'DECLINED',
  canceled: 'CANCELLED',
  expired: 'EXPIRED',
  replaced: 'SUPERSEDED',
  rescindido: 'TERMINATED',
};

export function mapLegacyContractStatusToDomain(
  status: string | null | undefined,
): LegacyMapResult<ContractStatus> {
  const raw = String(status || '').trim();
  if (!raw) {
    return ok('DRAFT', [
      createContractDomainWarning(
        'LEGACY_DATA_PARTIAL',
        'Status legado ausente; assumido DRAFT.',
        'status',
      ),
    ]);
  }
  if (!(LEGACY_CONTRACT_STATUSES as readonly string[]).includes(raw)) {
    return fail(createContractDomainError(
      'LEGACY_STATUS_NOT_MAPPABLE',
      'Status legado desconhecido.',
      'status',
      { status: raw },
    ));
  }
  return ok(LEGACY_TO_DOMAIN_STATUS[raw as LegacyContractStatus]);
}

// ---------------------------------------------------------------------------
// Status: Domain → Legacy (conservador — sem redução silenciosa)
// ---------------------------------------------------------------------------

export interface DomainToLegacyStatusValue {
  status: LegacyContractStatus;
  lossy: boolean;
}

/**
 * Política explícita Domain → Legacy:
 * - mapeamento 1:1 seguro quando existe equivalente;
 * - estados sem representação segura ⇒ LEGACY_STATUS_NOT_MAPPABLE / DOMAIN_STATUS_NOT_MAPPABLE_TO_LEGACY;
 * - proibido: PARTIALLY_SIGNED→generated, DECLINED→canceled, EXPIRED→canceled,
 *   SUPERSEDED→canceled, TERMINATED→canceled.
 */
export function mapDomainContractStatusToLegacy(
  status: ContractStatus,
): LegacyMapResult<DomainToLegacyStatusValue> {
  switch (status) {
    case 'DRAFT':
      return ok({ status: 'draft', lossy: false });
    case 'APPROVED':
      return ok({ status: 'generated', lossy: false });
    case 'PENDING_SIGNATURES':
      return ok({ status: 'sent', lossy: false });
    case 'PARTIALLY_SIGNED':
      return ok({ status: 'signed_by_patient', lossy: true }, [
        createContractDomainWarning(
          'LEGACY_STATUS_LOSSY',
          'PARTIALLY_SIGNED mapeado para signed_by_patient (perda de quem assinou).',
          'status',
        ),
      ]);
    case 'SIGNED':
      return ok({ status: 'signed', lossy: false });
    case 'DECLINED':
      return ok({ status: 'refused', lossy: false });
    case 'EXPIRED':
      return ok({ status: 'expired', lossy: false });
    case 'CANCELLED':
      return ok({ status: 'canceled', lossy: false });
    case 'SUPERSEDED':
      return ok({ status: 'replaced', lossy: false });
    case 'TERMINATED':
      return ok({ status: 'rescindido', lossy: false });
    case 'READY_FOR_REVIEW':
    case 'PENDING_INTERNAL_APPROVAL':
    case 'VOIDED':
      return fail(createContractDomainError(
        'DOMAIN_STATUS_NOT_MAPPABLE_TO_LEGACY',
        'Status canônico sem representação segura no legado; exige fallback explícito do chamador.',
        'status',
        { domainStatus: status },
      ));
    default:
      return fail(createContractDomainError(
        'DOMAIN_STATUS_NOT_MAPPABLE_TO_LEGACY',
        'Status canônico não mapeável.',
        'status',
        { domainStatus: status },
      ));
  }
}

// ---------------------------------------------------------------------------
// Status: Remote (006) → Domain
// ---------------------------------------------------------------------------

const REMOTE_TO_DOMAIN: Record<RemoteContractStatus, ContractStatus> = {
  draft: 'DRAFT',
  generated: 'APPROVED',
  signed: 'SIGNED',
  canceled: 'CANCELLED',
};

export function mapRemoteContractStatusToDomain(
  status: string | null | undefined,
): LegacyMapResult<ContractStatus> {
  const raw = String(status || '').trim();
  if (!(REMOTE_CONTRACT_STATUSES as readonly string[]).includes(raw)) {
    return fail(createContractDomainError(
      'REMOTE_STATUS_NOT_MAPPABLE',
      'Status remoto (006) desconhecido ou não mapeável.',
      'status',
      { status: raw },
    ));
  }
  const warnings: ContractDomainWarning[] = [];
  if (raw === 'generated') {
    warnings.push(createContractDomainWarning(
      'REMOTE_STATUS_LOSSY',
      'Remote generated mapeado para APPROVED (sem estados intermediários no Postgres).',
      'status',
    ));
  }
  return ok(REMOTE_TO_DOMAIN[raw as RemoteContractStatus], warnings);
}

// ---------------------------------------------------------------------------
// Origin
// ---------------------------------------------------------------------------

export function mapLegacyOriginToDomain(
  quoteSource?: string | null,
): ContractOrigin {
  if (quoteSource === 'crm_budget') return 'CRM_BUDGET';
  if (quoteSource === 'clinical_budget') return 'CLINICAL_BUDGET';
  return 'LEGACY_IMPORT';
}

// ---------------------------------------------------------------------------
// Full contract mapping
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export function mapLegacyGeneratedContractToDomain(
  row: LegacyGeneratedContract,
): LegacyMapResult<{ contract: Contract; version: ContractVersion | null }> {
  const warnings: ContractDomainWarning[] = [];

  const statusResult = mapLegacyContractStatusToDomain(row.status);
  if (statusResult.ok === false) {
    return fail(statusResult.error, statusResult.warnings);
  }
  warnings.push(...statusResult.warnings);

  const docResult = mapLegacyDocumentTypeToDomain({
    category: row.category,
    treatmentType: row.treatmentType,
  });
  if (docResult.ok === false) {
    return fail(docResult.error, docResult.warnings);
  }
  warnings.push(...docResult.warnings);

  const tenantId = String(row.tenant_id || '').trim();
  if (!tenantId) {
    warnings.push(createContractDomainWarning(
      'LEGACY_DATA_PARTIAL',
      'tenant_id ausente no registro legado.',
      'tenantId',
    ));
  }

  const patientSnap = asRecord(row.patientSnapshotJson);
  const clinicSnap = asRecord(row.clinicSnapshotJson);
  const professionalSnap = asRecord(row.professionalSnapshotJson);
  const clinicalSnap = asRecord(row.clinicalSnapshotJson);
  const financialSnap = asRecord(row.financialSnapshotJson);

  // Legado só carrega dentes do orçamento em clinicalSnapshot — nunca odontograma versionado.
  warnings.push(createContractDomainWarning(
    'LEGACY_ODONTOGRAM_SNAPSHOT_ABSENT',
    'Snapshot dedicado de odontograma ausente no legado.',
    'odontogramSnapshot',
    { clinicalDentesHint: clinicalSnap.dentes || null },
  ));

  if (row.documentHash && String(row.documentHash).startsWith('h')) {
    warnings.push(createContractDomainWarning(
      'LEGACY_HASH_NOT_CRYPTOGRAPHIC',
      'Hash legado não é criptográfico (simpleHash).',
      'documentHash',
    ));
  }

  if (row.pdfUrl && String(row.pdfUrl).startsWith('data:')) {
    warnings.push(createContractDomainWarning(
      'LEGACY_DATA_URL_ATTACHMENT',
      'pdfUrl legado é data URL — sem storage reference canônica.',
      'pdfUrl',
    ));
  } else if (!row.pdfUrl) {
    warnings.push(createContractDomainWarning(
      'LEGACY_STORAGE_REFERENCE_ABSENT',
      'Referência de storage de PDF ausente.',
      'pdfUrl',
    ));
  }

  if (!row.lockedAt && ['SIGNED', 'PARTIALLY_SIGNED', 'PENDING_SIGNATURES'].includes(statusResult.value)) {
    warnings.push(createContractDomainWarning(
      'LEGACY_VERSION_NOT_LOCKED',
      'Contrato em estado avançado sem lockedAt explícito; versão não marcada como imutável.',
      'lockedAt',
    ));
  }

  const createdAt = row.generatedAt || row.createdAt || new Date(0).toISOString();
  const updatedAt = row.updatedAt || row.signedAt || row.canceledAt || createdAt;

  const contract: Contract = {
    id: row.id,
    tenantId: tenantId || 'unknown-tenant',
    contractNumber: row.contractNumber || row.id,
    documentType: docResult.value,
    title: row.title || 'Contrato',
    patientId: row.patientId,
    budgetId: row.budgetId || undefined,
    appointmentId: row.quoteSource === 'clinical_budget' ? row.quoteId : undefined,
    origin: mapLegacyOriginToDomain(row.quoteSource),
    status: statusResult.value,
    currentVersionId: undefined,
    completedAt: row.signedAt || undefined,
    cancelledAt: row.canceledAt || undefined,
    cancelledBy: row.canceledBy,
    cancellationReason: row.cancellationReason,
    supersededByContractId: row.replacedById || undefined,
    createdBy: row.generatedBy || 'legacy',
    createdAt,
    updatedAt,
    metadata: {
      legacyStatus: row.status,
      legacyCategory: row.category,
      legacyTreatmentType: row.treatmentType,
      legacyQuoteId: row.quoteId,
      legacyQuoteSource: row.quoteSource,
      legacyClinicId: row.clinicId,
      legacyParentContractId: row.parentContractId,
      legacyVersion: row.version,
      legacySignatureRequestId: row.signatureRequestId,
      ...(row.metadata || {}),
    },
  };

  const hasAnySnapshot = Boolean(
    row.patientSnapshotJson || row.clinicSnapshotJson || row.renderedHtml || row.finalContent,
  );

  let version: ContractVersion | null = null;
  if (hasAnySnapshot) {
    version = {
      id: `${row.id}:v${row.version || 1}`,
      tenantId: contract.tenantId,
      contractId: row.id,
      versionNumber: Number(row.version) >= 1 ? Number(row.version) : 1,
      templateId: row.templateId,
      generationReason: 'LEGACY_IMPORT',
      contentSchemaSnapshot: {
        finalContent: row.finalContent || '',
      },
      renderedHtmlSnapshot: row.renderedHtml,
      plainTextSnapshot: row.finalContent,
      patientSnapshot: {
        patientId: row.patientId,
        fullName: String(patientSnap.full_name || patientSnap.fullName || ''),
        documentNumberMasked: patientSnap.cpf ? String(patientSnap.cpf) : undefined,
        birthDate: patientSnap.birth_date ? String(patientSnap.birth_date) : undefined,
      },
      clinicSnapshot: {
        legalName: String(clinicSnap.razaoSocial || clinicSnap.legalName || clinicSnap.nomeFantasia || ''),
        cnpjMasked: clinicSnap.cnpj ? String(clinicSnap.cnpj) : undefined,
        addressFull: clinicSnap.endereco ? JSON.stringify(clinicSnap.endereco) : undefined,
      },
      professionalSnapshot: professionalSnap.name ? {
        name: String(professionalSnap.name),
        cro: professionalSnap.cro ? String(professionalSnap.cro) : undefined,
        professionalId: professionalSnap.userId ? String(professionalSnap.userId) : undefined,
      } : undefined,
      budgetSnapshot: row.budgetId || row.quoteId ? {
        budgetId: row.budgetId || undefined,
        quoteSource: row.quoteSource,
        quoteId: row.quoteId,
        total: Number(row.totalValueSnapshot || financialSnap.valorTotal || 0),
        finalTotal: Number(row.totalValueSnapshot || financialSnap.valorTotal || 0),
        items: [],
        notes: clinicalSnap.observacoes ? String(clinicalSnap.observacoes) : undefined,
      } : undefined,
      treatmentSnapshot: clinicalSnap.procedimentos ? {
        summary: String(clinicalSnap.procedimentos),
        items: [],
      } : undefined,
      // odontogram dedicado ausente — não inventar
      odontogramSnapshot: undefined,
      financialSnapshot: row.financialSnapshotJson ? {
        contractTotal: Number(row.totalValueSnapshot || financialSnap.valorTotal || 0),
        downPayment: financialSnap.entrada != null ? Number(financialSnap.entrada) : undefined,
        paymentMethods: financialSnap.formaPagamento
          ? [String(financialSnap.formaPagamento)]
          : undefined,
        capturedAt: createdAt,
      } : undefined,
      signersSnapshot: [],
      documentHash: row.documentHash,
      createdBy: contract.createdBy,
      createdAt,
      // só marca locked se existir lockedAt real
      lockedAt: row.lockedAt || undefined,
      metadata: {
        legacyImport: true,
        clinicalDentesHint: clinicalSnap.dentes || null,
      },
    };
    contract.currentVersionId = version.id;
  } else {
    warnings.push(createContractDomainWarning(
      'LEGACY_DATA_PARTIAL',
      'Contrato legado sem snapshots/HTML — versão de domínio não materializada.',
      'version',
    ));
  }

  return ok({ contract, version }, warnings);
}

/**
 * Mapeamento reverso parcial para leitura/compat — NÃO persiste.
 * Status sem representação segura falha com erro tipado.
 */
export function mapDomainContractToLegacyGeneratedContract(
  contract: Contract,
  version?: ContractVersion | null,
): LegacyMapResult<LegacyGeneratedContract> {
  const statusResult = mapDomainContractStatusToLegacy(contract.status);
  if (statusResult.ok === false) {
    return fail(statusResult.error, statusResult.warnings);
  }

  const warnings = [...statusResult.warnings];
  const legacy: LegacyGeneratedContract = {
    id: contract.id,
    tenant_id: contract.tenantId,
    patientId: contract.patientId,
    budgetId: contract.budgetId,
    quoteId: contract.appointmentId
      || (typeof contract.metadata?.legacyQuoteId === 'string' ? contract.metadata.legacyQuoteId : undefined),
    quoteSource: contract.origin === 'CRM_BUDGET'
      ? 'crm_budget'
      : contract.origin === 'CLINICAL_BUDGET'
        ? 'clinical_budget'
        : (typeof contract.metadata?.legacyQuoteSource === 'string'
          ? contract.metadata.legacyQuoteSource
          : undefined),
    contractNumber: contract.contractNumber,
    title: contract.title,
    category: mapDomainDocumentTypeToLegacyCategory(contract.documentType),
    status: statusResult.value.status,
    generatedBy: contract.createdBy,
    generatedAt: contract.createdAt,
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
    signedAt: contract.completedAt,
    canceledAt: contract.cancelledAt,
    cancellationReason: contract.cancellationReason,
    canceledBy: contract.cancelledBy,
    replacedById: contract.supersededByContractId,
    templateId: version?.templateId,
    renderedHtml: version?.renderedHtmlSnapshot,
    finalContent: version?.plainTextSnapshot,
    documentHash: version?.documentHash,
    lockedAt: version?.lockedAt,
    version: version?.versionNumber,
    patientSnapshotJson: version?.patientSnapshot
      ? {
          id: version.patientSnapshot.patientId,
          full_name: version.patientSnapshot.fullName,
          cpf: version.patientSnapshot.documentNumberMasked,
          birth_date: version.patientSnapshot.birthDate,
        }
      : undefined,
    clinicSnapshotJson: version?.clinicSnapshot
      ? {
          razaoSocial: version.clinicSnapshot.legalName,
          cnpj: version.clinicSnapshot.cnpjMasked,
        }
      : undefined,
    financialSnapshotJson: version?.financialSnapshot
      ? {
          valorTotal: version.financialSnapshot.contractTotal,
          entrada: version.financialSnapshot.downPayment,
          formaPagamento: version.financialSnapshot.paymentMethods?.[0],
        }
      : undefined,
    totalValueSnapshot: version?.financialSnapshot?.contractTotal
      ?? version?.budgetSnapshot?.finalTotal,
    metadata: {
      ...(contract.metadata || {}),
      domainStatus: contract.status,
      domainDocumentType: contract.documentType,
      reverseMapLossy: statusResult.value.lossy,
    },
  };

  return ok(legacy, warnings);
}

// ---------------------------------------------------------------------------
// Signature / attachment
// ---------------------------------------------------------------------------

export function mapLegacySignatureToDomain(
  row: LegacyContractSignature,
  tenantId: string,
): LegacyMapResult<Pick<SignatureSigner, 'id' | 'tenantId' | 'name' | 'email' | 'phone' | 'signerRole' | 'signedAt' | 'ipAddress' | 'userAgent' | 'status' | 'required' | 'signerOrder' | 'envelopeId'>> {
  const warnings: ContractDomainWarning[] = [];
  if (row.signatureImageUrl?.startsWith('data:')) {
    warnings.push(createContractDomainWarning(
      'LEGACY_DATA_URL_ATTACHMENT',
      'Imagem de assinatura legada em data URL.',
      'signatureImageUrl',
    ));
  }
  if (!row.signedAt) {
    warnings.push(createContractDomainWarning(
      'LEGACY_DATA_PARTIAL',
      'Assinatura legada sem signedAt — não inventar assinatura.',
      'signedAt',
    ));
  }

  return ok({
    id: row.id,
    tenantId: row.tenant_id || tenantId,
    envelopeId: `legacy-envelope:${row.contractId}`,
    signerOrder: 1,
    signerRole: row.role || 'patient',
    name: row.name || '',
    email: row.email,
    phone: row.phone,
    status: row.signedAt ? 'SIGNED' : 'PENDING',
    required: true,
    signedAt: row.signedAt,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
  }, warnings);
}

export function mapLegacyAttachmentToDomain(
  row: LegacyContractAttachment,
  tenantId: string,
): LegacyMapResult<{
  snapshot: ContractAttachmentSnapshot;
  fileHint: Partial<ContractFile>;
}> {
  const warnings: ContractDomainWarning[] = [];
  const isDataUrl = Boolean(row.fileUrl && String(row.fileUrl).startsWith('data:'));
  if (isDataUrl) {
    warnings.push(createContractDomainWarning(
      'LEGACY_DATA_URL_ATTACHMENT',
      'Anexo legado em data URL — sem storage canônico.',
      'fileUrl',
    ));
  } else if (!row.fileUrl) {
    warnings.push(createContractDomainWarning(
      'LEGACY_STORAGE_REFERENCE_ABSENT',
      'Anexo sem URL/path de storage.',
      'fileUrl',
    ));
  }

  return ok({
    snapshot: {
      name: row.fileName || row.id,
      mimeType: row.mimeType || row.fileType,
      sizeBytes: row.sizeBytes,
      fileType: 'ATTACHMENT',
      legacyDataUrlPresent: isDataUrl,
      // não inventar storageRef
    },
    fileHint: {
      id: row.id,
      tenantId: row.tenant_id || tenantId,
      contractId: row.contractId,
      fileType: 'ATTACHMENT',
      originalName: row.fileName || row.id,
      mimeType: row.mimeType || 'application/octet-stream',
      sizeBytes: row.sizeBytes || 0,
      legacyDataUrlPresent: isDataUrl,
      uploadedBy: row.uploadedBy || 'legacy',
      createdAt: row.createdAt || new Date(0).toISOString(),
      integrity: {},
      // storage omitido de propósito — não fabricar bucket/path
    },
  }, warnings);
}
