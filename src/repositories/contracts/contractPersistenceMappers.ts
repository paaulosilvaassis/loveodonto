/**
 * @module repositories/contracts/contractPersistenceMappers
 * @description Serialização explícita domínio ↔ row. Sem fabricar dados clínicos.
 */

import type {
  ContractDocumentType,
  ContractOrigin,
  ContractStatus,
  ContractVersionGenerationReason,
} from '../../domain/contracts/contract.constants.js';
import {
  isContractDocumentType,
  isContractStatus,
} from '../../domain/contracts/contract.constants.js';
import type { Contract, ContractVersion } from '../../domain/contracts/contract.types.js';
import type { ContractTemplate } from '../../domain/contracts/templates/contract-template.types.js';
import type { ContractPackage } from '../../domain/contracts/packages/contract-package.types.js';
import type { SignatureEnvelope } from '../../domain/contracts/signatures/signature.types.js';
import type { ContractFile } from '../../domain/contracts/files/contract-file.types.js';
import type { ContractAuditEvent } from '../../domain/contracts/audit/contract-audit.types.js';
import { ContractPersistenceError } from './contractPersistenceErrors.js';
import type {
  AppContractAuditEventRow,
  AppContractFileRow,
  AppContractPackageRow,
  AppContractRow,
  AppContractTemplateRow,
  AppContractVersionRow,
  AppSignatureEnvelopeRow,
} from './contractPersistenceTypes.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertValidTenantId(tenantId: string | null | undefined): string {
  const raw = String(tenantId || '').trim();
  if (!raw) {
    throw new ContractPersistenceError('TENANT_REQUIRED', 'tenantId é obrigatório.');
  }
  if (!UUID_RE.test(raw)) {
    throw new ContractPersistenceError('TENANT_REQUIRED', 'tenantId deve ser UUID válido.', {
      tenantId: raw,
    });
  }
  return raw;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function optString(value: string | null | undefined): string | undefined {
  const raw = String(value ?? '').trim();
  return raw ? raw : undefined;
}

function nullIfUndefined<T>(value: T | undefined | null): T | null {
  return value === undefined ? null : value;
}

export function mapContractRowToDomain(row: AppContractRow): Contract {
  if (!isContractDocumentType(row.document_type)) {
    throw new ContractPersistenceError('INVALID_DOCUMENT_TYPE', 'document_type inválido no row.', {
      document_type: row.document_type,
    });
  }
  if (!isContractStatus(row.status)) {
    throw new ContractPersistenceError('INVALID_STATUS', 'status inválido no row.', {
      status: row.status,
    });
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    contractNumber: row.contract_number,
    documentType: row.document_type as ContractDocumentType,
    title: row.title,
    patientId: row.patient_id,
    guardianPatientId: optString(row.guardian_patient_id),
    budgetId: optString(row.budget_id),
    budgetVersionId: optString(row.budget_version_id),
    treatmentPlanId: optString(row.treatment_plan_id),
    appointmentId: optString(row.appointment_id),
    origin: row.origin as ContractOrigin,
    status: row.status as ContractStatus,
    currentVersionId: optString(row.current_version_id),
    signatureEnvelopeId: optString(row.signature_envelope_id),
    effectiveDate: optString(row.effective_date),
    expirationDate: optString(row.expiration_date),
    completedAt: optString(row.completed_at),
    cancelledAt: optString(row.cancelled_at),
    cancelledBy: optString(row.cancelled_by),
    cancellationReason: optString(row.cancellation_reason),
    supersededByContractId: optString(row.superseded_by_contract_id),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rowVersion: row.row_version,
    metadata: {
      ...(row.metadata || {}),
      ...(row.idempotency_key ? { idempotencyKey: row.idempotency_key } : {}),
    },
  };
}

export function mapDomainContractToRow(contract: Contract): AppContractRow {
  const meta = contract.metadata || {};
  const idempotencyKey = typeof meta.idempotencyKey === 'string' ? meta.idempotencyKey : null;
  return {
    id: contract.id,
    tenant_id: contract.tenantId,
    contract_number: contract.contractNumber,
    document_type: contract.documentType,
    title: contract.title,
    patient_id: contract.patientId,
    guardian_patient_id: nullIfUndefined(contract.guardianPatientId ?? null),
    budget_id: nullIfUndefined(contract.budgetId ?? null),
    budget_version_id: nullIfUndefined(contract.budgetVersionId ?? null),
    treatment_plan_id: nullIfUndefined(contract.treatmentPlanId ?? null),
    appointment_id: nullIfUndefined(contract.appointmentId ?? null),
    origin: contract.origin,
    status: contract.status,
    current_version_id: nullIfUndefined(contract.currentVersionId ?? null),
    signature_envelope_id: nullIfUndefined(contract.signatureEnvelopeId ?? null),
    effective_date: nullIfUndefined(contract.effectiveDate ?? null),
    expiration_date: nullIfUndefined(contract.expirationDate ?? null),
    completed_at: nullIfUndefined(contract.completedAt ?? null),
    cancelled_at: nullIfUndefined(contract.cancelledAt ?? null),
    cancelled_by: nullIfUndefined(contract.cancelledBy ?? null),
    cancellation_reason: nullIfUndefined(contract.cancellationReason ?? null),
    superseded_by_contract_id: nullIfUndefined(contract.supersededByContractId ?? null),
    created_by: contract.createdBy,
    created_at: contract.createdAt,
    updated_at: contract.updatedAt,
    row_version: contract.rowVersion ?? 1,
    metadata: meta,
    idempotency_key: idempotencyKey,
  };
}

export function mapContractVersionRowToDomain(row: AppContractVersionRow): ContractVersion {
  const patient = asObject(row.patient_snapshot);
  const clinic = asObject(row.clinic_snapshot);
  const guardian = row.guardian_snapshot ? asObject(row.guardian_snapshot) : undefined;
  const professional = row.professional_snapshot ? asObject(row.professional_snapshot) : undefined;
  const budget = row.budget_snapshot ? asObject(row.budget_snapshot) : undefined;
  const treatment = row.treatment_snapshot ? asObject(row.treatment_snapshot) : undefined;
  const odontogram = row.odontogram_snapshot ? asObject(row.odontogram_snapshot) : undefined;
  const financial = row.financial_snapshot ? asObject(row.financial_snapshot) : undefined;
  const terms = row.terms_snapshot ? asObject(row.terms_snapshot) : undefined;

  return {
    id: row.id,
    tenantId: row.tenant_id,
    contractId: row.contract_id,
    versionNumber: row.version_number,
    templateId: optString(row.template_id),
    templateVersionId: optString(row.template_version_id),
    generationReason: row.generation_reason as ContractVersionGenerationReason,
    contentSchemaSnapshot: row.content_schema_snapshot,
    renderedHtmlSnapshot: optString(row.rendered_html_snapshot),
    plainTextSnapshot: optString(row.plain_text_snapshot),
    patientSnapshot: {
      patientId: String(patient.patientId || patient.patient_id || ''),
      fullName: String(patient.fullName || patient.full_name || ''),
      documentType: optString(patient.documentType as string),
      documentNumberMasked: optString(patient.documentNumberMasked as string),
      birthDate: optString(patient.birthDate as string),
      email: optString(patient.email as string),
      phone: optString(patient.phone as string),
      addressFull: optString(patient.addressFull as string),
    },
    guardianSnapshot: guardian
      ? {
          patientId: optString(guardian.patientId as string),
          fullName: String(guardian.fullName || ''),
          documentNumberMasked: optString(guardian.documentNumberMasked as string),
          relationship: optString(guardian.relationship as string),
          representationType: optString(guardian.representationType as string),
          email: optString(guardian.email as string),
          phone: optString(guardian.phone as string),
          addressFull: optString(guardian.addressFull as string),
        }
      : undefined,
    clinicSnapshot: {
      legalName: String(clinic.legalName || clinic.legal_name || ''),
      tradeName: optString(clinic.tradeName as string),
      cnpjMasked: optString(clinic.cnpjMasked as string),
      addressFull: optString(clinic.addressFull as string),
      phone: optString(clinic.phone as string),
      email: optString(clinic.email as string),
      responsibleProfessionalName: optString(clinic.responsibleProfessionalName as string),
      responsibleProfessionalCro: optString(clinic.responsibleProfessionalCro as string),
    },
    professionalSnapshot: professional
      ? {
          professionalId: optString(professional.professionalId as string),
          name: String(professional.name || ''),
          cro: optString(professional.cro as string),
          specialty: optString(professional.specialty as string),
        }
      : undefined,
    budgetSnapshot: budget
      ? {
          budgetId: optString(budget.budgetId as string),
          budgetVersionId: optString(budget.budgetVersionId as string),
          budgetNumber: optString(budget.budgetNumber as string),
          quoteSource: optString(budget.quoteSource as string),
          quoteId: optString(budget.quoteId as string),
          total: Number(budget.total || 0),
          discountTotal: budget.discountTotal != null ? Number(budget.discountTotal) : undefined,
          finalTotal: Number(budget.finalTotal ?? budget.total ?? 0),
          currency: optString(budget.currency as string),
          validUntil: optString(budget.validUntil as string),
          notes: optString(budget.notes as string),
          items: Array.isArray(budget.items) ? budget.items as never[] : [],
        }
      : undefined,
    treatmentSnapshot: treatment
      ? {
          treatmentPlanId: optString(treatment.treatmentPlanId as string),
          summary: optString(treatment.summary as string),
          items: Array.isArray(treatment.items) ? treatment.items as never[] : [],
        }
      : undefined,
    odontogramSnapshot: odontogram
      ? {
          patientId: String(odontogram.patientId || ''),
          odontogramVersion: optString(odontogram.odontogramVersion as string),
          odontogramData: odontogram.odontogramData,
          imageFileId: optString(odontogram.imageFileId as string),
          summary: optString(odontogram.summary as string),
          capturedAt: optString(odontogram.capturedAt as string),
          hash: optString(odontogram.hash as string),
        }
      : undefined,
    financialSnapshot: financial
      ? {
          budgetTotal: financial.budgetTotal != null ? Number(financial.budgetTotal) : undefined,
          discountTotal: financial.discountTotal != null ? Number(financial.discountTotal) : undefined,
          contractTotal: Number(financial.contractTotal || 0),
          downPayment: financial.downPayment != null ? Number(financial.downPayment) : undefined,
          financedAmount: financial.financedAmount != null ? Number(financial.financedAmount) : undefined,
          installmentCount: financial.installmentCount != null
            ? Number(financial.installmentCount)
            : undefined,
          installmentValue: financial.installmentValue != null
            ? Number(financial.installmentValue)
            : undefined,
          interestRate: financial.interestRate != null ? Number(financial.interestRate) : undefined,
          fees: financial.fees != null ? Number(financial.fees) : undefined,
          paymentMethods: Array.isArray(financial.paymentMethods)
            ? financial.paymentMethods.map(String)
            : undefined,
          dueDates: Array.isArray(financial.dueDates) ? financial.dueDates.map(String) : undefined,
          payerSnapshot: financial.payerSnapshot as Record<string, unknown> | undefined,
          receivablesReference: Array.isArray(financial.receivablesReference)
            ? financial.receivablesReference.map(String)
            : undefined,
          financialConditionsText: optString(financial.financialConditionsText as string),
          currency: optString(financial.currency as string),
          capturedAt: optString(financial.capturedAt as string),
          hash: optString(financial.hash as string),
        }
      : undefined,
    consentsSnapshot: asArray(row.consents_snapshot) as never[],
    signersSnapshot: asArray(row.signers_snapshot) as never[],
    attachmentsSnapshot: asArray(row.attachments_snapshot) as never[],
    termsSnapshot: terms as never,
    documentHash: optString(row.document_hash),
    previousVersionHash: optString(row.previous_version_hash),
    createdBy: row.created_by,
    createdAt: row.created_at,
    lockedAt: optString(row.locked_at),
    metadata: row.metadata || undefined,
  };
}

export function mapDomainContractVersionToRow(version: ContractVersion): AppContractVersionRow {
  return {
    id: version.id,
    tenant_id: version.tenantId,
    contract_id: version.contractId,
    version_number: version.versionNumber,
    template_id: nullIfUndefined(version.templateId ?? null),
    template_version_id: nullIfUndefined(version.templateVersionId ?? null),
    generation_reason: version.generationReason,
    content_schema_snapshot: version.contentSchemaSnapshot ?? {},
    rendered_html_snapshot: nullIfUndefined(version.renderedHtmlSnapshot ?? null),
    plain_text_snapshot: nullIfUndefined(version.plainTextSnapshot ?? null),
    patient_snapshot: { ...version.patientSnapshot },
    guardian_snapshot: version.guardianSnapshot ? { ...version.guardianSnapshot } : null,
    clinic_snapshot: { ...version.clinicSnapshot },
    professional_snapshot: version.professionalSnapshot
      ? { ...version.professionalSnapshot }
      : null,
    budget_snapshot: version.budgetSnapshot ? { ...version.budgetSnapshot } : null,
    treatment_snapshot: version.treatmentSnapshot ? { ...version.treatmentSnapshot } : null,
    odontogram_snapshot: version.odontogramSnapshot ? { ...version.odontogramSnapshot } : null,
    financial_snapshot: version.financialSnapshot ? { ...version.financialSnapshot } : null,
    consents_snapshot: version.consentsSnapshot ?? null,
    signers_snapshot: version.signersSnapshot ?? [],
    attachments_snapshot: version.attachmentsSnapshot ?? null,
    terms_snapshot: version.termsSnapshot ? { ...version.termsSnapshot } : null,
    document_hash: nullIfUndefined(version.documentHash ?? null),
    previous_version_hash: nullIfUndefined(version.previousVersionHash ?? null),
    created_by: version.createdBy,
    created_at: version.createdAt,
    locked_at: nullIfUndefined(version.lockedAt ?? null),
    metadata: version.metadata ?? null,
  };
}

export function mapTemplateRowToDomain(row: AppContractTemplateRow): ContractTemplate {
  const req = asObject(row.requirements);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: optString(row.description),
    documentType: row.document_type as ContractDocumentType,
    category: optString(row.category),
    procedureCodes: asArray(row.procedure_codes).map(String),
    specialtyCodes: asArray(row.specialty_codes).map(String),
    templateStatus: row.status as ContractTemplate['templateStatus'],
    currentVersionId: optString(row.current_version_id),
    isDefault: Boolean(row.is_default),
    requirements: {
      requiresBudget: Boolean(req.requiresBudget),
      requiresFinancialPlan: Boolean(req.requiresFinancialPlan),
      requiresOdontogram: Boolean(req.requiresOdontogram),
      requiresGuardian: Boolean(req.requiresGuardian),
      requiresWitnesses: Boolean(req.requiresWitnesses),
      witnessesMin: req.witnessesMin != null ? Number(req.witnessesMin) : undefined,
      witnessesMax: req.witnessesMax != null ? Number(req.witnessesMax) : undefined,
      requiresProfessionalSignature: req.requiresProfessionalSignature !== false,
      requiresClinicSignature: req.requiresClinicSignature !== false,
      requiresPatientSignature: req.requiresPatientSignature !== false,
      requiresResponsibleSignature: Boolean(req.requiresResponsibleSignature),
      requiresInternalApproval: Boolean(req.requiresInternalApproval),
      requiresRisksSection: Boolean(req.requiresRisksSection),
    },
    signaturePolicyId: optString(row.signature_policy_id),
    createdBy: row.created_by || 'system',
    createdAt: row.created_at,
    updatedBy: optString(row.updated_by),
    updatedAt: row.updated_at,
    archivedAt: optString(row.archived_at),
  };
}

export function mapDomainTemplateToRow(template: ContractTemplate): AppContractTemplateRow {
  return {
    id: template.id,
    tenant_id: template.tenantId,
    name: template.name,
    description: nullIfUndefined(template.description ?? null),
    document_type: template.documentType,
    category: nullIfUndefined(template.category ?? null),
    procedure_codes: template.procedureCodes || [],
    specialty_codes: template.specialtyCodes || [],
    status: template.templateStatus,
    current_version_id: nullIfUndefined(template.currentVersionId ?? null),
    is_default: template.isDefault,
    requirements: { ...template.requirements },
    signature_policy_id: nullIfUndefined(template.signaturePolicyId ?? null),
    created_by: template.createdBy,
    created_at: template.createdAt,
    updated_by: nullIfUndefined(template.updatedBy ?? null),
    updated_at: template.updatedAt,
    archived_at: nullIfUndefined(template.archivedAt ?? null),
    row_version: 1,
    metadata: null,
  };
}

export function mapPackageRowToDomain(row: AppContractPackageRow): ContractPackage {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    patientId: row.patient_id,
    budgetId: optString(row.budget_id),
    treatmentPlanId: optString(row.treatment_plan_id),
    status: row.status as ContractPackage['status'],
    packageNumber: row.package_number,
    requirements: [],
    items: [],
    createdBy: row.created_by,
    createdAt: row.created_at,
    completedAt: optString(row.completed_at),
  };
}

export function mapDomainPackageToRow(pkg: ContractPackage): AppContractPackageRow {
  return {
    id: pkg.id,
    tenant_id: pkg.tenantId,
    package_number: pkg.packageNumber,
    patient_id: pkg.patientId,
    budget_id: nullIfUndefined(pkg.budgetId ?? null),
    treatment_plan_id: nullIfUndefined(pkg.treatmentPlanId ?? null),
    status: pkg.status,
    created_by: pkg.createdBy,
    created_at: pkg.createdAt,
    completed_at: nullIfUndefined(pkg.completedAt ?? null),
    row_version: 1,
    metadata: null,
    idempotency_key: null,
  };
}

export function mapEnvelopeRowToDomain(row: AppSignatureEnvelopeRow): SignatureEnvelope {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    contractId: row.contract_id,
    contractVersionId: row.contract_version_id,
    status: row.status as SignatureEnvelope['status'],
    signaturePolicyId: optString(row.signature_policy_id),
    provider: row.provider,
    providerEnvelopeId: optString(row.provider_envelope_id),
    sentAt: optString(row.sent_at),
    expiresAt: optString(row.expires_at),
    completedAt: optString(row.completed_at),
    cancelledAt: optString(row.cancelled_at),
    documentHashBeforeSigning: optString(row.document_hash_before_signing),
    documentHashAfterSigning: optString(row.document_hash_after_signing),
    evidenceFileId: optString(row.evidence_file_id),
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function mapDomainEnvelopeToRow(envelope: SignatureEnvelope): AppSignatureEnvelopeRow {
  return {
    id: envelope.id,
    tenant_id: envelope.tenantId,
    contract_id: envelope.contractId,
    contract_version_id: envelope.contractVersionId,
    status: envelope.status,
    signature_policy_id: nullIfUndefined(envelope.signaturePolicyId ?? null),
    provider: envelope.provider,
    provider_envelope_id: nullIfUndefined(envelope.providerEnvelopeId ?? null),
    sent_at: nullIfUndefined(envelope.sentAt ?? null),
    expires_at: nullIfUndefined(envelope.expiresAt ?? null),
    completed_at: nullIfUndefined(envelope.completedAt ?? null),
    cancelled_at: nullIfUndefined(envelope.cancelledAt ?? null),
    document_hash_before_signing: nullIfUndefined(envelope.documentHashBeforeSigning ?? null),
    document_hash_after_signing: nullIfUndefined(envelope.documentHashAfterSigning ?? null),
    evidence_file_id: nullIfUndefined(envelope.evidenceFileId ?? null),
    created_by: envelope.createdBy,
    created_at: envelope.createdAt,
    row_version: 1,
    metadata: null,
    idempotency_key: null,
  };
}

export function mapFileRowToDomain(row: AppContractFileRow): ContractFile {
  if (String(row.storage_path || '').toLowerCase().startsWith('data:')) {
    throw new ContractPersistenceError(
      'INVALID_INPUT',
      'storage_path não pode ser data URL.',
      { id: row.id },
    );
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    contractId: row.contract_id,
    contractVersionId: optString(row.contract_version_id),
    fileType: row.file_type as ContractFile['fileType'],
    storage: {
      storageProvider: row.storage_provider,
      storageBucket: row.storage_bucket || '',
      storagePath: row.storage_path,
    },
    originalName: row.original_name || row.id,
    mimeType: row.mime_type || 'application/octet-stream',
    sizeBytes: Number(row.size_bytes || 0),
    integrity: {
      sha256: optString(row.sha256),
      encryptionStatus: (row.encryption_status as ContractFile['integrity']['encryptionStatus'])
        || 'unknown',
    },
    retentionPolicy: row.retention_policy ? JSON.stringify(row.retention_policy) : undefined,
    uploadedBy: row.uploaded_by || 'system',
    createdAt: row.created_at,
    deletedAt: optString(row.deleted_at),
    legacyDataUrlPresent: false,
  };
}

export function mapDomainFileToRow(file: ContractFile): AppContractFileRow {
  if (file.legacyDataUrlPresent || file.storage.storagePath.toLowerCase().startsWith('data:')) {
    throw new ContractPersistenceError(
      'INVALID_INPUT',
      'Domínio canônico não persiste data URL como storage.',
    );
  }
  return {
    id: file.id,
    tenant_id: file.tenantId,
    contract_id: file.contractId,
    contract_version_id: nullIfUndefined(file.contractVersionId ?? null),
    file_type: file.fileType,
    storage_provider: file.storage.storageProvider,
    storage_bucket: file.storage.storageBucket || null,
    storage_path: file.storage.storagePath,
    original_name: file.originalName,
    mime_type: file.mimeType,
    size_bytes: file.sizeBytes,
    sha256: nullIfUndefined(file.integrity.sha256 ?? null),
    encryption_status: nullIfUndefined(file.integrity.encryptionStatus ?? null),
    retention_policy: file.retentionPolicy ? { policy: file.retentionPolicy } : null,
    uploaded_by: file.uploadedBy,
    created_at: file.createdAt,
    deleted_at: nullIfUndefined(file.deletedAt ?? null),
  };
}

export function mapAuditRowToDomain(row: AppContractAuditEventRow): ContractAuditEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    contractId: row.contract_id || '',
    contractVersionId: optString(row.contract_version_id),
    envelopeId: optString(row.envelope_id),
    eventType: row.event_type as ContractAuditEvent['eventType'],
    actor: {
      actorType: row.actor_type as ContractAuditEvent['actor']['actorType'],
      actorId: optString(row.actor_id),
      actorName: optString(row.actor_name),
    },
    source: row.source as ContractAuditEvent['source'],
    requestId: optString(row.request_id),
    ipAddress: optString(row.ip_address),
    userAgent: optString(row.user_agent),
    metadata: row.metadata || {},
    previousEventHash: optString(row.previous_event_hash),
    eventHash: optString(row.event_hash),
    occurredAt: row.occurred_at,
  };
}

export function mapDomainAuditToRow(event: ContractAuditEvent): AppContractAuditEventRow {
  return {
    id: event.id,
    tenant_id: event.tenantId,
    contract_id: event.contractId || null,
    contract_version_id: nullIfUndefined(event.contractVersionId ?? null),
    envelope_id: nullIfUndefined(event.envelopeId ?? null),
    event_type: event.eventType,
    actor_type: event.actor.actorType,
    actor_id: nullIfUndefined(event.actor.actorId ?? null),
    actor_name: nullIfUndefined(event.actor.actorName ?? null),
    source: event.source,
    request_id: nullIfUndefined(event.requestId ?? null),
    ip_address: nullIfUndefined(event.ipAddress ?? null),
    user_agent: nullIfUndefined(event.userAgent ?? null),
    metadata: event.metadata || {},
    previous_event_hash: nullIfUndefined(event.previousEventHash ?? null),
    event_hash: nullIfUndefined(event.eventHash ?? null),
    occurred_at: event.occurredAt,
  };
}
