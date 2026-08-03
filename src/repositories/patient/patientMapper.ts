/**
 * @module repositories/patient/patientMapper
 * @description Mapper bidirecional Pacientes — IndexedDB ↔ Core ↔ Supabase.
 * Funções puras. Sem wiring em services (Phase 9.4A Wave 1).
 */

import type {
  PatientAccessCore,
  PatientAccessIndexedDbRow,
  PatientAccessSupabaseRow,
  PatientActivityIndexedDbRow,
  PatientActivitySummaryCore,
  PatientActivitySummarySupabaseRow,
  PatientAddressCore,
  PatientAddressIndexedDbRow,
  PatientAddressSupabaseRow,
  PatientBirthDetailsCore,
  PatientBirthDetailsSupabaseRow,
  PatientBirthIndexedDbRow,
  PatientCore,
  PatientCreateCoreDto,
  PatientDocumentsCore,
  PatientDocumentsIndexedDbRow,
  PatientDocumentsSupabaseRow,
  PatientEducationCore,
  PatientEducationIndexedDbRow,
  PatientEducationSupabaseRow,
  PatientIndexedDbRow,
  PatientInsuranceCore,
  PatientInsuranceIndexedDbRow,
  PatientInsuranceSupabaseRow,
  PatientPhoneCore,
  PatientPhoneIndexedDbRow,
  PatientPhoneSupabaseRow,
  PatientRecordCore,
  PatientRecordIndexedDbRow,
  PatientRecordSupabaseRow,
  PatientRelationshipsCore,
  PatientRelationshipsIndexedDbRow,
  PatientRelationshipsSupabaseRow,
  PatientStatus,
  PatientSupabaseRow,
  PatientSupabaseUpsertDto,
  PatientUpdateCoreDto,
} from './patientTypes.js';

export class PatientMapperValidationError extends Error {
  readonly code = 'PATIENT_MAPPER_VALIDATION';

  constructor(message: string) {
    super(message);
    this.name = 'PatientMapperValidationError';
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPatientUuid(value: string | null | undefined): boolean {
  return Boolean(value && UUID_RE.test(String(value).trim()));
}

export function isPatientLegacyId(value: string | null | undefined): boolean {
  const raw = String(value || '').trim();
  return raw.startsWith('patient-') && raw.length > 'patient-'.length;
}

function asString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function asNullableString(value: unknown): string | null {
  const raw = asString(value).trim();
  return raw ? raw : null;
}

function onlyDigits(value: unknown): string {
  return asString(value).replace(/\D/g, '');
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeStatus(value: unknown): PatientStatus {
  return value === 'inactive' ? 'inactive' : 'active';
}

function assertNoDataUri(photoUrl: string | null | undefined): string | null {
  const raw = asNullableString(photoUrl);
  if (raw && /^data:/i.test(raw)) {
    throw new PatientMapperValidationError(
      'photo_url / photoUrl não pode ser data URI / base64.',
    );
  }
  return raw;
}

export function assertValidTenantId(tenantId: string | null | undefined): string {
  const normalized = asString(tenantId).trim();
  if (!normalized) {
    throw new PatientMapperValidationError('tenant_id é obrigatório.');
  }
  return normalized;
}

export function mapLegacyRowToPatientCore(
  row: PatientIndexedDbRow,
  options: { uuid?: string | null } = {},
): PatientCore {
  const legacyId = asString(row.id).trim();
  if (!legacyId) {
    throw new PatientMapperValidationError('patient.id legado é obrigatório.');
  }

  const tenantId = assertValidTenantId(row.tenant_id);
  const cpfDigits = onlyDigits(row.cpf);
  const uuid = asString(options.uuid || row.uuid || '').trim() || legacyId;

  return {
    uuid,
    legacyId,
    tenantId,
    guid: asString(row.guid).trim() || legacyId.replace(/^patient-/, '') || legacyId,
    fullName: asString(row.full_name).trim(),
    nickname: asString(row.nickname).trim(),
    socialName: asString(row.social_name).trim(),
    sex: asString(row.sex).trim(),
    birthDate: asNullableString(row.birth_date),
    cpf: cpfDigits.length === 11 ? cpfDigits : cpfDigits || null,
    photoUrl: assertNoDataUri(asNullableString(row.photo_url)),
    status: normalizeStatus(row.status),
    blocked: Boolean(row.blocked),
    blockReason: asString(row.block_reason),
    blockAt: asNullableString(row.block_at),
    tags: asStringArray(row.tags),
    leadSource: asString(row.lead_source),
    hasFinancialResponsible: Boolean(row.has_financial_responsible),
    dependentFullName: asString(row.dependent_full_name),
    hasPendingData: Boolean(row.hasPendingData),
    pendingFields: asStringArray(row.pendingFields),
    pendingCriticalFields: asStringArray(row.pendingCriticalFields),
    createdAt: asString(row.created_at) || new Date(0).toISOString(),
    updatedAt: asString(row.updated_at) || new Date(0).toISOString(),
    deletedAt: null,
  };
}

export function mapSupabaseRowToPatientCore(row: PatientSupabaseRow): PatientCore {
  const tenantId = assertValidTenantId(row.tenant_id);
  const legacyId = asString(row.legacy_id).trim();
  if (!legacyId) {
    throw new PatientMapperValidationError('patients.legacy_id é obrigatório.');
  }

  return {
    uuid: asString(row.id).trim(),
    legacyId,
    tenantId,
    guid: asString(row.guid).trim(),
    fullName: asString(row.full_name).trim(),
    nickname: asString(row.nickname),
    socialName: asString(row.social_name),
    sex: asString(row.sex),
    birthDate: asNullableString(row.birth_date),
    cpf: asNullableString(row.cpf),
    photoUrl: assertNoDataUri(asNullableString(row.photo_url)),
    status: normalizeStatus(row.status),
    blocked: Boolean(row.blocked),
    blockReason: asString(row.block_reason),
    blockAt: asNullableString(row.block_at),
    tags: asStringArray(row.tags),
    leadSource: asString(row.lead_source),
    hasFinancialResponsible: Boolean(row.has_financial_responsible),
    dependentFullName: asString(row.dependent_full_name),
    hasPendingData: Boolean(row.has_pending_data),
    pendingFields: asStringArray(row.pending_fields),
    pendingCriticalFields: asStringArray(row.pending_critical_fields),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function mapCoreToIndexedDbMirror(core: PatientCore): PatientIndexedDbRow {
  return {
    id: core.legacyId,
    guid: core.guid,
    tenant_id: core.tenantId,
    full_name: core.fullName,
    nickname: core.nickname,
    social_name: core.socialName,
    sex: core.sex,
    birth_date: core.birthDate || '',
    cpf: core.cpf || '',
    photo_url: core.photoUrl || '',
    status: core.status,
    blocked: core.blocked,
    block_reason: core.blockReason,
    block_at: core.blockAt || '',
    tags: core.tags,
    lead_source: core.leadSource,
    has_financial_responsible: core.hasFinancialResponsible,
    dependent_full_name: core.dependentFullName,
    hasPendingData: core.hasPendingData,
    pendingFields: core.pendingFields,
    pendingCriticalFields: core.pendingCriticalFields,
    created_at: core.createdAt,
    updated_at: core.updatedAt,
    uuid: core.uuid,
  };
}

export function mapCreateDtoToSupabaseUpsert(
  tenantId: string,
  dto: PatientCreateCoreDto,
): PatientSupabaseUpsertDto {
  const tid = assertValidTenantId(tenantId);
  const fullName = asString(dto.fullName).trim();
  const sex = asString(dto.sex).trim();
  const birthDate = asString(dto.birthDate).trim();
  const cpf = onlyDigits(dto.cpf);

  if (!fullName) throw new PatientMapperValidationError('fullName é obrigatório.');
  if (!sex) throw new PatientMapperValidationError('sex é obrigatório.');
  if (!birthDate) throw new PatientMapperValidationError('birthDate é obrigatório.');
  if (cpf.length !== 11) throw new PatientMapperValidationError('cpf inválido.');

  const legacyId = asString(dto.legacyId).trim();
  if (!legacyId) {
    throw new PatientMapperValidationError(
      'legacyId é obrigatório no upsert (formato patient-<uuid>).',
    );
  }
  if (!isPatientLegacyId(legacyId)) {
    throw new PatientMapperValidationError('legacyId deve ter formato patient-<uuid>.');
  }

  return {
    tenant_id: tid,
    legacy_id: legacyId,
    guid: asNullableString(dto.guid) || undefined,
    full_name: fullName,
    nickname: asString(dto.nickname).trim(),
    social_name: asString(dto.socialName).trim(),
    sex,
    birth_date: birthDate,
    cpf,
    lead_source: asString(dto.leadSource).trim(),
    has_financial_responsible: Boolean(dto.hasFinancialResponsible),
    dependent_full_name: asString(dto.dependentFullName).trim(),
    tags: dto.tags || [],
    status: 'active',
    blocked: false,
    block_reason: '',
    has_pending_data: false,
    pending_fields: [],
    pending_critical_fields: [],
  };
}

export function mapUpdateDtoToSupabaseUpsert(
  tenantId: string,
  legacyId: string,
  dto: PatientUpdateCoreDto,
): PatientSupabaseUpsertDto {
  const tid = assertValidTenantId(tenantId);
  const lid = asString(legacyId).trim();
  if (!lid) throw new PatientMapperValidationError('legacyId é obrigatório no update.');

  const patch: PatientSupabaseUpsertDto = {
    tenant_id: tid,
    legacy_id: lid,
  };

  if (dto.fullName !== undefined) patch.full_name = asString(dto.fullName).trim();
  if (dto.nickname !== undefined) patch.nickname = asString(dto.nickname).trim();
  if (dto.socialName !== undefined) patch.social_name = asString(dto.socialName).trim();
  if (dto.sex !== undefined) patch.sex = asString(dto.sex).trim();
  if (dto.birthDate !== undefined) patch.birth_date = asNullableString(dto.birthDate);
  if (dto.cpf !== undefined) {
    const cpf = onlyDigits(dto.cpf);
    patch.cpf = cpf.length === 11 ? cpf : null;
  }
  if (dto.photoUrl !== undefined) patch.photo_url = assertNoDataUri(dto.photoUrl);
  if (dto.status !== undefined) patch.status = normalizeStatus(dto.status);
  if (dto.blocked !== undefined) patch.blocked = Boolean(dto.blocked);
  if (dto.blockReason !== undefined) patch.block_reason = asString(dto.blockReason);
  if (dto.blockAt !== undefined) patch.block_at = dto.blockAt;
  if (dto.leadSource !== undefined) patch.lead_source = asString(dto.leadSource);
  if (dto.hasFinancialResponsible !== undefined) {
    patch.has_financial_responsible = Boolean(dto.hasFinancialResponsible);
  }
  if (dto.dependentFullName !== undefined) {
    patch.dependent_full_name = asString(dto.dependentFullName);
  }
  if (dto.tags !== undefined) patch.tags = dto.tags;
  if (dto.hasPendingData !== undefined) patch.has_pending_data = Boolean(dto.hasPendingData);
  if (dto.pendingFields !== undefined) patch.pending_fields = dto.pendingFields;
  if (dto.pendingCriticalFields !== undefined) {
    patch.pending_critical_fields = dto.pendingCriticalFields;
  }

  return patch;
}

export function mapPhoneLegacyToCore(
  row: PatientPhoneIndexedDbRow,
  patientUuid: string,
  tenantId: string,
  options: { uuid?: string | null } = {},
): PatientPhoneCore {
  const legacyId = asString(row.id).trim();
  if (!legacyId) {
    throw new PatientMapperValidationError('phone.id legado é obrigatório.');
  }
  const now = new Date(0).toISOString();
  return {
    uuid: asString(options.uuid).trim() || legacyId,
    legacyId,
    tenantId: assertValidTenantId(tenantId),
    patientUuid,
    type: asString(row.type),
    countryCode: asString(row.country_code || '55'),
    ddd: asString(row.ddd),
    number: asString(row.number),
    isWhatsapp: Boolean(row.is_whatsapp),
    isPrimary: Boolean(row.is_primary),
    e164: asString(row.e164),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function mapPhoneSupabaseToCore(row: PatientPhoneSupabaseRow): PatientPhoneCore {
  return {
    uuid: asString(row.id),
    legacyId: asString(row.legacy_id),
    tenantId: assertValidTenantId(row.tenant_id),
    patientUuid: asString(row.patient_id),
    type: asString(row.type),
    countryCode: asString(row.country_code || '55'),
    ddd: asString(row.ddd),
    number: asString(row.number),
    isWhatsapp: Boolean(row.is_whatsapp),
    isPrimary: Boolean(row.is_primary),
    e164: asString(row.e164),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function mapDocumentsLegacyToCore(
  row: PatientDocumentsIndexedDbRow,
  patientUuid: string,
  tenantId: string,
  options: { uuid?: string | null } = {},
): PatientDocumentsCore {
  const now = new Date(0).toISOString();
  return {
    uuid: asString(options.uuid).trim() || `docs-${asString(row.patient_id)}`,
    tenantId: assertValidTenantId(tenantId),
    patientUuid,
    rg: asString(row.rg),
    pis: asString(row.pis),
    municipalRegistration: asString(row.municipal_registration),
    personalEmail: asString(row.personal_email),
    maritalStatus: asString(row.marital_status),
    responsibleName: asString(row.responsible_name),
    responsibleRelation: asString(row.responsible_relation),
    responsiblePhone: asString(row.responsible_phone),
    responsibleCpf: asString(row.responsible_cpf),
    motherName: asString(row.mother_name),
    fatherName: asString(row.father_name),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function mapDocumentsSupabaseToCore(
  row: PatientDocumentsSupabaseRow,
): PatientDocumentsCore {
  return {
    uuid: asString(row.id),
    tenantId: assertValidTenantId(row.tenant_id),
    patientUuid: asString(row.patient_id),
    rg: asString(row.rg),
    pis: asString(row.pis),
    municipalRegistration: asString(row.municipal_registration),
    personalEmail: asString(row.personal_email),
    maritalStatus: asString(row.marital_status),
    responsibleName: asString(row.responsible_name),
    responsibleRelation: asString(row.responsible_relation),
    responsiblePhone: asString(row.responsible_phone),
    responsibleCpf: asString(row.responsible_cpf),
    motherName: asString(row.mother_name),
    fatherName: asString(row.father_name),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function mapRecordLegacyToCore(
  row: PatientRecordIndexedDbRow,
  patientUuid: string,
  tenantId: string,
  options: { uuid?: string | null } = {},
): PatientRecordCore {
  const legacyId = asString(row.id).trim();
  if (!legacyId) {
    throw new PatientMapperValidationError('record.id legado é obrigatório.');
  }
  return {
    uuid: asString(options.uuid).trim() || legacyId,
    legacyId,
    tenantId: assertValidTenantId(tenantId),
    patientUuid,
    recordNumber: asString(row.record_number),
    preferredDentist: asString(row.preferred_dentist),
    patientType: asString(row.patient_type),
    createdAt: asString(row.created_at) || new Date(0).toISOString(),
    updatedAt: asString(row.updated_at) || new Date(0).toISOString(),
    deletedAt: null,
  };
}

export function mapRecordSupabaseToCore(row: PatientRecordSupabaseRow): PatientRecordCore {
  return {
    uuid: asString(row.id),
    legacyId: asString(row.legacy_id),
    tenantId: assertValidTenantId(row.tenant_id),
    patientUuid: asString(row.patient_id),
    recordNumber: asString(row.record_number),
    preferredDentist: asString(row.preferred_dentist),
    patientType: asString(row.patient_type),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

// ---------------------------------------------------------------------------
// Wave 2 satellites — IDB ↔ Core ↔ Supabase
// ---------------------------------------------------------------------------

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function mapBirthLegacyToCore(
  row: PatientBirthIndexedDbRow,
  patientUuid: string,
  tenantId: string,
  options: { uuid?: string | null } = {},
): PatientBirthDetailsCore {
  const now = new Date(0).toISOString();
  return {
    uuid: asString(options.uuid).trim() || `birth-${asString(row.patient_id)}`,
    tenantId: assertValidTenantId(tenantId),
    patientUuid,
    nationality: asString(row.nationality),
    birthCity: asString(row.birth_city),
    birthState: asString(row.birth_state).toUpperCase(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function mapBirthSupabaseToCore(row: PatientBirthDetailsSupabaseRow): PatientBirthDetailsCore {
  return {
    uuid: asString(row.id),
    tenantId: assertValidTenantId(row.tenant_id),
    patientUuid: asString(row.patient_id),
    nationality: asString(row.nationality),
    birthCity: asString(row.birth_city),
    birthState: asString(row.birth_state),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function mapBirthCoreToLegacy(core: PatientBirthDetailsCore, legacyPatientId: string): PatientBirthIndexedDbRow {
  return {
    patient_id: legacyPatientId,
    nationality: core.nationality,
    birth_city: core.birthCity,
    birth_state: core.birthState,
  };
}

export function mapEducationLegacyToCore(
  row: PatientEducationIndexedDbRow,
  patientUuid: string,
  tenantId: string,
  options: { uuid?: string | null } = {},
): PatientEducationCore {
  const now = new Date(0).toISOString();
  return {
    uuid: asString(options.uuid).trim() || `edu-${asString(row.patient_id)}`,
    tenantId: assertValidTenantId(tenantId),
    patientUuid,
    educationLevel: asString(row.education_level),
    profession: asString(row.profession),
    otherProfession: asString(row.other_profession),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function mapEducationSupabaseToCore(row: PatientEducationSupabaseRow): PatientEducationCore {
  return {
    uuid: asString(row.id),
    tenantId: assertValidTenantId(row.tenant_id),
    patientUuid: asString(row.patient_id),
    educationLevel: asString(row.education_level),
    profession: asString(row.profession),
    otherProfession: asString(row.other_profession),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function mapEducationCoreToLegacy(
  core: PatientEducationCore,
  legacyPatientId: string,
): PatientEducationIndexedDbRow {
  return {
    patient_id: legacyPatientId,
    education_level: core.educationLevel,
    profession: core.profession,
    other_profession: core.otherProfession,
  };
}

export function mapAddressLegacyToCore(
  row: PatientAddressIndexedDbRow,
  patientUuid: string,
  tenantId: string,
  options: { uuid?: string | null } = {},
): PatientAddressCore {
  const legacyId = asString(row.id).trim();
  if (!legacyId) throw new PatientMapperValidationError('address.id legado é obrigatório.');
  const now = new Date(0).toISOString();
  return {
    uuid: asString(options.uuid).trim() || legacyId,
    legacyId,
    tenantId: assertValidTenantId(tenantId),
    patientUuid,
    type: asString(row.type),
    cep: onlyDigits(row.cep),
    street: asString(row.street),
    number: asString(row.number),
    complement: asString(row.complement),
    neighborhood: asString(row.neighborhood),
    city: asString(row.city),
    state: asString(row.state).toUpperCase(),
    isPrimary: Boolean(row.is_primary),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function mapAddressSupabaseToCore(row: PatientAddressSupabaseRow): PatientAddressCore {
  return {
    uuid: asString(row.id),
    legacyId: asString(row.legacy_id),
    tenantId: assertValidTenantId(row.tenant_id),
    patientUuid: asString(row.patient_id),
    type: asString(row.type),
    cep: asString(row.cep),
    street: asString(row.street),
    number: asString(row.number),
    complement: asString(row.complement),
    neighborhood: asString(row.neighborhood),
    city: asString(row.city),
    state: asString(row.state),
    isPrimary: Boolean(row.is_primary),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function mapAddressCoreToLegacy(core: PatientAddressCore): PatientAddressIndexedDbRow {
  return {
    id: core.legacyId,
    patient_id: core.patientUuid.startsWith('patient-') ? core.patientUuid : core.legacyId,
    type: core.type,
    cep: core.cep,
    street: core.street,
    number: core.number,
    complement: core.complement,
    neighborhood: core.neighborhood,
    city: core.city,
    state: core.state,
    is_primary: core.isPrimary,
  };
}

export function mapRelationshipsLegacyToCore(
  row: PatientRelationshipsIndexedDbRow,
  patientUuid: string,
  tenantId: string,
  options: { uuid?: string | null } = {},
): PatientRelationshipsCore {
  const now = new Date(0).toISOString();
  return {
    uuid: asString(options.uuid).trim() || `rel-${asString(row.patient_id)}`,
    tenantId: assertValidTenantId(tenantId),
    patientUuid,
    emergencyContactName: asString(row.emergency_contact_name),
    emergencyContactPhone: asString(row.emergency_contact_phone),
    financialResponsibleName: asString(row.financial_responsible_name),
    financialResponsibleRelation: asString(row.financial_responsible_relation),
    dependents: asStringArray(row.dependents),
    notes: asString(row.notes),
    maritalStatus: asString(row.marital_status),
    preferredContactPeriod: asString(row.preferred_contact_period),
    preferredContactChannel: asString(row.preferred_contact_channel),
    lgpdWhatsappOptIn: Boolean(row.lgpd_whatsapp_opt_in),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function mapRelationshipsSupabaseToCore(
  row: PatientRelationshipsSupabaseRow,
): PatientRelationshipsCore {
  return {
    uuid: asString(row.id),
    tenantId: assertValidTenantId(row.tenant_id),
    patientUuid: asString(row.patient_id),
    emergencyContactName: asString(row.emergency_contact_name),
    emergencyContactPhone: asString(row.emergency_contact_phone),
    financialResponsibleName: asString(row.financial_responsible_name),
    financialResponsibleRelation: asString(row.financial_responsible_relation),
    dependents: asStringArray(row.dependents),
    notes: asString(row.notes),
    maritalStatus: asString(row.marital_status),
    preferredContactPeriod: asString(row.preferred_contact_period),
    preferredContactChannel: asString(row.preferred_contact_channel),
    lgpdWhatsappOptIn: Boolean(row.lgpd_whatsapp_opt_in),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function mapRelationshipsCoreToLegacy(
  core: PatientRelationshipsCore,
  legacyPatientId: string,
): PatientRelationshipsIndexedDbRow {
  return {
    patient_id: legacyPatientId,
    emergency_contact_name: core.emergencyContactName,
    emergency_contact_phone: core.emergencyContactPhone,
    financial_responsible_name: core.financialResponsibleName,
    financial_responsible_relation: core.financialResponsibleRelation,
    dependents: core.dependents,
    notes: core.notes,
    marital_status: core.maritalStatus,
    preferred_contact_period: core.preferredContactPeriod,
    preferred_contact_channel: core.preferredContactChannel,
    lgpd_whatsapp_opt_in: core.lgpdWhatsappOptIn,
  };
}

export function mapInsuranceLegacyToCore(
  row: PatientInsuranceIndexedDbRow,
  patientUuid: string,
  tenantId: string,
  options: { uuid?: string | null } = {},
): PatientInsuranceCore {
  const legacyId = asString(row.id).trim();
  if (!legacyId) throw new PatientMapperValidationError('insurance.id legado é obrigatório.');
  const now = new Date(0).toISOString();
  return {
    uuid: asString(options.uuid).trim() || legacyId,
    legacyId,
    tenantId: assertValidTenantId(tenantId),
    patientUuid,
    insuranceName: asString(row.insurance_name),
    planName: asString(row.plan_name),
    membershipNumber: asString(row.membership_number),
    validity: asString(row.validity),
    isHolder: row.is_holder === undefined ? true : Boolean(row.is_holder),
    isPrimary: Boolean(row.is_primary),
    companyPartner: asString(row.company_partner),
    providerId: asString(row.provider_id),
    planId: asString(row.plan_id),
    holderCpf: onlyDigits(row.holder_cpf),
    status: asString(row.status || 'ativo'),
    extraData: asObject(row.extra_data),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function mapInsuranceSupabaseToCore(row: PatientInsuranceSupabaseRow): PatientInsuranceCore {
  return {
    uuid: asString(row.id),
    legacyId: asString(row.legacy_id),
    tenantId: assertValidTenantId(row.tenant_id),
    patientUuid: asString(row.patient_id),
    insuranceName: asString(row.insurance_name),
    planName: asString(row.plan_name),
    membershipNumber: asString(row.membership_number),
    validity: asString(row.validity),
    isHolder: Boolean(row.is_holder),
    isPrimary: Boolean(row.is_primary),
    companyPartner: asString(row.company_partner),
    providerId: asString(row.provider_id),
    planId: asString(row.plan_id),
    holderCpf: asString(row.holder_cpf),
    status: asString(row.status || 'ativo'),
    extraData: asObject(row.extra_data),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function mapInsuranceCoreToLegacy(core: PatientInsuranceCore): PatientInsuranceIndexedDbRow {
  return {
    id: core.legacyId,
    patient_id: core.patientUuid,
    insurance_name: core.insuranceName,
    plan_name: core.planName,
    membership_number: core.membershipNumber,
    validity: core.validity,
    is_holder: core.isHolder,
    is_primary: core.isPrimary,
    company_partner: core.companyPartner,
    provider_id: core.providerId,
    plan_id: core.planId,
    holder_cpf: core.holderCpf,
    status: core.status,
    extra_data: core.extraData,
    tenant_id: core.tenantId,
  };
}

export function mapAccessLegacyToCore(
  row: PatientAccessIndexedDbRow,
  patientUuid: string,
  tenantId: string,
  options: { uuid?: string | null } = {},
): PatientAccessCore {
  const now = new Date(0).toISOString();
  return {
    uuid: asString(options.uuid).trim() || `access-${asString(row.patient_id)}`,
    tenantId: assertValidTenantId(tenantId),
    patientUuid,
    userId: asNullableString(row.user_id),
    accessStatus: asString(row.access_status),
    lastLoginAt: asNullableString(row.last_login_at),
    inviteSentAt: asNullableString(row.invite_sent_at),
    accessEmail: asString(row.access_email || row.portal_email),
    accessPhone: asString(row.access_phone || row.portal_phone),
    wantsPortal: Boolean(row.wants_portal),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function mapAccessSupabaseToCore(row: PatientAccessSupabaseRow): PatientAccessCore {
  return {
    uuid: asString(row.id),
    tenantId: assertValidTenantId(row.tenant_id),
    patientUuid: asString(row.patient_id),
    userId: asNullableString(row.user_id),
    accessStatus: asString(row.access_status),
    lastLoginAt: asNullableString(row.last_login_at),
    inviteSentAt: asNullableString(row.invite_sent_at),
    accessEmail: asString(row.access_email),
    accessPhone: asString(row.access_phone),
    wantsPortal: Boolean(row.wants_portal),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function mapAccessCoreToLegacy(
  core: PatientAccessCore,
  legacyPatientId: string,
): PatientAccessIndexedDbRow {
  return {
    patient_id: legacyPatientId,
    user_id: core.userId || undefined,
    access_status: core.accessStatus,
    last_login_at: core.lastLoginAt || undefined,
    invite_sent_at: core.inviteSentAt || undefined,
    access_email: core.accessEmail,
    access_phone: core.accessPhone,
    wants_portal: core.wantsPortal,
  };
}

export function mapActivityLegacyToCore(
  row: PatientActivityIndexedDbRow,
  patientUuid: string,
  tenantId: string,
  options: { uuid?: string | null } = {},
): PatientActivitySummaryCore {
  const now = new Date(0).toISOString();
  return {
    uuid: asString(options.uuid).trim() || `activity-${asString(row.patient_id)}`,
    tenantId: assertValidTenantId(tenantId),
    patientUuid,
    totalAppointments: asNumber(row.total_appointments),
    lastAppointmentAt: asNullableString(row.last_appointment_at),
    totalProcedures: asNumber(row.total_procedures),
    lastProcedureAt: asNullableString(row.last_procedure_at),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function mapActivitySupabaseToCore(
  row: PatientActivitySummarySupabaseRow,
): PatientActivitySummaryCore {
  return {
    uuid: asString(row.id),
    tenantId: assertValidTenantId(row.tenant_id),
    patientUuid: asString(row.patient_id),
    totalAppointments: asNumber(row.total_appointments),
    lastAppointmentAt: asNullableString(row.last_appointment_at),
    totalProcedures: asNumber(row.total_procedures),
    lastProcedureAt: asNullableString(row.last_procedure_at),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    deletedAt: asNullableString(row.deleted_at),
  };
}

export function mapActivityCoreToLegacy(
  core: PatientActivitySummaryCore,
  legacyPatientId: string,
): PatientActivityIndexedDbRow {
  return {
    patient_id: legacyPatientId,
    total_appointments: core.totalAppointments,
    last_appointment_at: core.lastAppointmentAt || '',
    total_procedures: core.totalProcedures,
    last_procedure_at: core.lastProcedureAt || '',
  };
}
