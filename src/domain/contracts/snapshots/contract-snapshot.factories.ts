/**
 * @module domain/contracts/snapshots/contract-snapshot.factories
 * @description Factories puras de snapshots — Phase 10.5.
 */

import {
  createContractDomainError,
  createContractDomainWarning,
  type ContractDomainError,
  type ContractDomainWarning,
} from '../contract.errors.js';
import type {
  ContractAttachmentSnapshot,
  ContractBudgetSnapshot,
  ContractClinicSnapshot,
  ContractConsentSnapshot,
  ContractFinancialSnapshot,
  ContractGuardianSnapshot,
  ContractOdontogramSnapshot,
  ContractPatientSnapshot,
  ContractProfessionalSnapshot,
  ContractSignerSnapshot,
  ContractTermsSnapshot,
  ContractTreatmentSnapshot,
} from '../contract.types.js';

export interface SnapshotFactoryResult<T> {
  snapshot: T;
  errors: ContractDomainError[];
  warnings: ContractDomainWarning[];
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertNoForbidden(value: unknown, path: string, errors: ContractDomainError[]): void {
  if (value == null) return;
  if (typeof value === 'function') {
    errors.push(createContractDomainError(
      'INVALID_INPUT',
      `Snapshot contém função em ${path}.`,
      path,
    ));
    return;
  }
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower.startsWith('data:')) {
      errors.push(createContractDomainError(
        'INVALID_INPUT',
        `data URL não permitida em snapshot (${path}).`,
        path,
      ));
    }
    if (lower.includes('bearer ') || /otp[=:]/i.test(value) || /token[=:]/i.test(value)) {
      errors.push(createContractDomainError(
        'INVALID_INPUT',
        `Segredo/token não permitido em snapshot (${path}).`,
        path,
      ));
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoForbidden(item, `${path}[${i}]`, errors));
    return;
  }
  if (typeof value === 'object') {
    if (value instanceof Date) {
      errors.push(createContractDomainError(
        'INVALID_INPUT',
        `Instância Date não permitida (${path}); use ISO string.`,
        path,
      ));
      return;
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      assertNoForbidden(v, `${path}.${k}`, errors);
    }
  }
}

function normalizeIso(value: string | undefined, field: string, warnings: ContractDomainWarning[]): string | undefined {
  if (value == null || value === '') return undefined;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) {
    warnings.push(createContractDomainWarning(
      'OPTIONAL_SNAPSHOT_ABSENT',
      `Data inválida em ${field}; omitida.`,
      field,
    ));
    return undefined;
  }
  return new Date(t).toISOString();
}

function finish<T extends object>(
  raw: T,
  errors: ContractDomainError[] = [],
  warnings: ContractDomainWarning[] = [],
): SnapshotFactoryResult<T> {
  assertNoForbidden(raw, 'snapshot', errors);
  const snapshot = cloneSerializable(raw);
  return { snapshot, errors, warnings };
}

export function createContractPatientSnapshot(
  input: ContractPatientSnapshot,
): SnapshotFactoryResult<ContractPatientSnapshot> {
  const errors: ContractDomainError[] = [];
  const warnings: ContractDomainWarning[] = [];
  if (!String(input.patientId || '').trim()) {
    errors.push(createContractDomainError('PATIENT_REQUIRED', 'patientId obrigatório.', 'patientId'));
  }
  if (!String(input.fullName || '').trim()) {
    errors.push(createContractDomainError('INVALID_INPUT', 'fullName obrigatório.', 'fullName'));
  }
  return finish({
    patientId: input.patientId,
    fullName: String(input.fullName || '').trim(),
    documentType: input.documentType,
    documentNumberMasked: input.documentNumberMasked,
    birthDate: normalizeIso(input.birthDate, 'birthDate', warnings)?.slice(0, 10) || input.birthDate,
    email: input.email,
    phone: input.phone,
    addressFull: input.addressFull,
    maritalStatus: input.maritalStatus,
  }, errors, warnings);
}

export function createContractGuardianSnapshot(
  input: ContractGuardianSnapshot,
): SnapshotFactoryResult<ContractGuardianSnapshot> {
  const errors: ContractDomainError[] = [];
  const warnings: ContractDomainWarning[] = [];
  if (!String(input.fullName || '').trim()) {
    errors.push(createContractDomainError('GUARDIAN_REQUIRED', 'Nome do responsável obrigatório.', 'fullName'));
  }
  return finish({
    patientId: input.patientId,
    fullName: String(input.fullName || '').trim(),
    documentNumberMasked: input.documentNumberMasked,
    relationship: input.relationship,
    representationType: input.representationType,
    email: input.email,
    phone: input.phone,
    addressFull: input.addressFull,
  }, errors, warnings);
}

export function createContractClinicSnapshot(
  input: ContractClinicSnapshot,
): SnapshotFactoryResult<ContractClinicSnapshot> {
  const errors: ContractDomainError[] = [];
  if (!String(input.legalName || '').trim()) {
    errors.push(createContractDomainError('INVALID_INPUT', 'legalName da clínica obrigatório.', 'legalName'));
  }
  return finish({
    legalName: String(input.legalName || '').trim(),
    tradeName: input.tradeName,
    cnpjMasked: input.cnpjMasked,
    addressFull: input.addressFull,
    phone: input.phone,
    email: input.email,
    responsibleProfessionalName: input.responsibleProfessionalName,
    responsibleProfessionalCro: input.responsibleProfessionalCro,
  }, errors);
}

export function createContractProfessionalSnapshot(
  input: ContractProfessionalSnapshot,
): SnapshotFactoryResult<ContractProfessionalSnapshot> {
  const errors: ContractDomainError[] = [];
  if (!String(input.name || '').trim()) {
    errors.push(createContractDomainError('INVALID_INPUT', 'Nome do profissional obrigatório.', 'name'));
  }
  return finish({
    professionalId: input.professionalId,
    name: String(input.name || '').trim(),
    cro: input.cro,
    specialty: input.specialty,
  }, errors);
}

export function createContractBudgetSnapshot(
  input: ContractBudgetSnapshot,
): SnapshotFactoryResult<ContractBudgetSnapshot> {
  const errors: ContractDomainError[] = [];
  const warnings: ContractDomainWarning[] = [];
  const items = Array.isArray(input.items) ? input.items.map((item) => ({
    budgetItemId: item.budgetItemId,
    procedureId: item.procedureId,
    procedureCode: item.procedureCode,
    procedureName: String(item.procedureName || '').trim(),
    tooth: item.tooth,
    toothSurface: item.toothSurface,
    region: item.region,
    quantity: Number(item.quantity) || 0,
    unitPrice: Number(item.unitPrice) || 0,
    discount: item.discount != null ? Number(item.discount) : undefined,
    finalPrice: Number(item.finalPrice) || 0,
  })) : [];
  const itemsSum = items.reduce((s, i) => s + i.finalPrice, 0);
  const finalTotal = Number(input.finalTotal);
  if (!Number.isFinite(finalTotal)) {
    errors.push(createContractDomainError('INVALID_INPUT', 'finalTotal inválido.', 'finalTotal'));
  } else if (items.length && Math.abs(itemsSum - finalTotal) > 0.01) {
    warnings.push(createContractDomainWarning(
      'OPTIONAL_SNAPSHOT_ABSENT',
      'Soma dos itens diverge do finalTotal.',
      'items',
      { itemsSum, finalTotal },
    ));
  }
  return finish({
    budgetId: input.budgetId,
    budgetVersionId: input.budgetVersionId,
    budgetNumber: input.budgetNumber,
    quoteSource: input.quoteSource,
    quoteId: input.quoteId,
    total: Number(input.total) || 0,
    discountTotal: input.discountTotal != null ? Number(input.discountTotal) : undefined,
    finalTotal: Number.isFinite(finalTotal) ? finalTotal : 0,
    currency: input.currency || 'BRL',
    validUntil: input.validUntil,
    notes: input.notes,
    items,
  }, errors, warnings);
}

export function createContractTreatmentSnapshot(
  input: ContractTreatmentSnapshot,
): SnapshotFactoryResult<ContractTreatmentSnapshot> {
  return finish({
    treatmentPlanId: input.treatmentPlanId,
    summary: input.summary,
    items: Array.isArray(input.items) ? cloneSerializable(input.items) : [],
  });
}

export function createContractOdontogramSnapshot(
  input: ContractOdontogramSnapshot,
): SnapshotFactoryResult<ContractOdontogramSnapshot> {
  const errors: ContractDomainError[] = [];
  const warnings: ContractDomainWarning[] = [];
  if (!String(input.patientId || '').trim()) {
    errors.push(createContractDomainError('PATIENT_REQUIRED', 'patientId do odontograma obrigatório.', 'patientId'));
  }
  if (!input.summary && !input.imageFileId && input.odontogramData == null) {
    warnings.push(createContractDomainWarning(
      'LEGACY_ODONTOGRAM_SNAPSHOT_ABSENT',
      'Odontograma sem conteúdo descritivo.',
      'odontogram',
    ));
  }
  return finish({
    patientId: input.patientId,
    odontogramVersion: input.odontogramVersion,
    odontogramData: input.odontogramData != null ? cloneSerializable(input.odontogramData) : undefined,
    imageFileId: input.imageFileId,
    summary: input.summary,
    capturedAt: normalizeIso(input.capturedAt, 'capturedAt', warnings),
    hash: input.hash,
  }, errors, warnings);
}

export function createContractFinancialSnapshot(
  input: ContractFinancialSnapshot,
): SnapshotFactoryResult<ContractFinancialSnapshot> {
  const errors: ContractDomainError[] = [];
  const warnings: ContractDomainWarning[] = [];
  const contractTotal = Number(input.contractTotal);
  if (!Number.isFinite(contractTotal)) {
    errors.push(createContractDomainError(
      'FINANCIAL_SNAPSHOT_REQUIRED',
      'contractTotal inválido.',
      'contractTotal',
    ));
  }
  const down = Number(input.downPayment || 0);
  const financed = Number(input.financedAmount || 0);
  if (Number.isFinite(contractTotal) && Math.abs((down + financed) - contractTotal) > 0.01
    && (input.downPayment != null || input.financedAmount != null)) {
    warnings.push(createContractDomainWarning(
      'OPTIONAL_SNAPSHOT_ABSENT',
      'Entrada + financiado diverge do total.',
      'financial',
    ));
  }
  return finish({
    budgetTotal: input.budgetTotal,
    discountTotal: input.discountTotal,
    contractTotal: Number.isFinite(contractTotal) ? contractTotal : 0,
    downPayment: input.downPayment,
    financedAmount: input.financedAmount,
    installmentCount: input.installmentCount,
    installmentValue: input.installmentValue,
    interestRate: input.interestRate,
    fees: input.fees,
    paymentMethods: input.paymentMethods ? [...input.paymentMethods] : undefined,
    dueDates: input.dueDates ? [...input.dueDates] : undefined,
    payerSnapshot: input.payerSnapshot ? cloneSerializable(input.payerSnapshot) : undefined,
    receivablesReference: input.receivablesReference ? [...input.receivablesReference] : undefined,
    financialConditionsText: input.financialConditionsText,
    currency: input.currency || 'BRL',
    capturedAt: normalizeIso(input.capturedAt, 'capturedAt', warnings),
    hash: input.hash,
  }, errors, warnings);
}

export function createContractConsentSnapshot(
  input: ContractConsentSnapshot,
): SnapshotFactoryResult<ContractConsentSnapshot> {
  const errors: ContractDomainError[] = [];
  if (!String(input.title || '').trim()) {
    errors.push(createContractDomainError('INVALID_INPUT', 'Título do consentimento obrigatório.', 'title'));
  }
  return finish({
    consentType: String(input.consentType || '').trim() || 'GENERIC',
    procedureCode: input.procedureCode,
    title: String(input.title || '').trim(),
    content: input.content,
    risks: input.risks,
    benefits: input.benefits,
    alternatives: input.alternatives,
    nonTreatmentConsequences: input.nonTreatmentConsequences,
    accepted: input.accepted,
    acceptedAt: input.acceptedAt,
  }, errors);
}

export function createContractSignerSnapshot(
  input: ContractSignerSnapshot,
): SnapshotFactoryResult<ContractSignerSnapshot> {
  const errors: ContractDomainError[] = [];
  if (!String(input.role || '').trim()) {
    errors.push(createContractDomainError('REQUIRED_SIGNER_MISSING', 'role obrigatório.', 'role'));
  }
  if (!String(input.name || '').trim()) {
    errors.push(createContractDomainError('REQUIRED_SIGNER_MISSING', 'name obrigatório.', 'name'));
  }
  return finish({
    role: String(input.role || '').trim(),
    name: String(input.name || '').trim(),
    email: input.email,
    phone: input.phone,
    documentNumberMasked: input.documentNumberMasked,
    order: input.order,
    required: Boolean(input.required),
  }, errors);
}

export function createContractAttachmentSnapshot(
  input: ContractAttachmentSnapshot,
): SnapshotFactoryResult<ContractAttachmentSnapshot> {
  const errors: ContractDomainError[] = [];
  if (!String(input.name || '').trim()) {
    errors.push(createContractDomainError('INVALID_INPUT', 'Nome do anexo obrigatório.', 'name'));
  }
  if (input.legacyDataUrlPresent) {
    errors.push(createContractDomainError(
      'INVALID_INPUT',
      'data URL legado não permitido em domínio v2.',
      'legacyDataUrlPresent',
    ));
  }
  return finish({
    name: String(input.name || '').trim(),
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    fileType: input.fileType,
    storageRefHint: input.storageRefHint,
    legacyDataUrlPresent: false,
  }, errors);
}

export function createContractTermsSnapshot(
  input: ContractTermsSnapshot,
): SnapshotFactoryResult<ContractTermsSnapshot> {
  const warnings: ContractDomainWarning[] = [];
  return finish({
    privacyNoticeVersion: input.privacyNoticeVersion,
    acceptanceChannel: input.acceptanceChannel,
    termsAcceptedAt: normalizeIso(input.termsAcceptedAt, 'termsAcceptedAt', warnings),
    customTerms: input.customTerms ? cloneSerializable(input.customTerms) : undefined,
  }, [], warnings);
}
