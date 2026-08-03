/**
 * @module repositories/patient/patientTypes
 * @description Tipos, DTOs e contratos da Repository Pacientes V3 — Phase 9.4A Wave 1.
 *
 * **Status:** Scaffold — sem wiring em `patientService.js` / UI.
 * **Referência:** migration `025_app_patients_core.sql`, shape IDB em `patientService.js`.
 */

// ---------------------------------------------------------------------------
// Status e identificadores
// ---------------------------------------------------------------------------

/** Status operacional do paciente (IDB + SQL). */
export type PatientStatus = 'active' | 'inactive';

/**
 * Referência polimórfica a um paciente.
 * Aceita UUID Supabase ou legacy_id (`patient-*`).
 */
export type PatientRef = string;

// ---------------------------------------------------------------------------
// Shape canônico V3 (facade pública — profile core)
// ---------------------------------------------------------------------------

export interface PatientCore {
  /** PK Supabase `patients.id`. */
  uuid: string;
  /** ID legado IndexedDB `patient-*` — imutável após criação. */
  legacyId: string;
  tenantId: string;
  guid: string;
  fullName: string;
  nickname: string;
  socialName: string;
  sex: string;
  birthDate: string | null;
  cpf: string | null;
  photoUrl: string | null;
  status: PatientStatus;
  blocked: boolean;
  blockReason: string;
  blockAt: string | null;
  tags: string[];
  leadSource: string;
  hasFinancialResponsible: boolean;
  dependentFullName: string;
  hasPendingData: boolean;
  pendingFields: string[];
  pendingCriticalFields: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PatientPhoneCore {
  uuid: string;
  legacyId: string;
  tenantId: string;
  patientUuid: string;
  type: string;
  countryCode: string;
  ddd: string;
  number: string;
  isWhatsapp: boolean;
  isPrimary: boolean;
  e164: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PatientDocumentsCore {
  uuid: string;
  tenantId: string;
  patientUuid: string;
  rg: string;
  pis: string;
  municipalRegistration: string;
  personalEmail: string;
  maritalStatus: string;
  responsibleName: string;
  responsibleRelation: string;
  responsiblePhone: string;
  responsibleCpf: string;
  motherName: string;
  fatherName: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PatientRecordCore {
  uuid: string;
  legacyId: string;
  tenantId: string;
  patientUuid: string;
  recordNumber: string;
  preferredDentist: string;
  patientType: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Bundle alinhado a `getPatient` (Wave 1 — satélites SQL). */
export interface PatientBundleCore {
  profile: PatientCore;
  documents: PatientDocumentsCore | null;
  phones: PatientPhoneCore[];
  record: PatientRecordCore | null;
}

// ---------------------------------------------------------------------------
// DTOs — Supabase row (snake_case)
// ---------------------------------------------------------------------------

export interface PatientSupabaseRow {
  id: string;
  tenant_id: string;
  legacy_id: string;
  guid: string;
  full_name: string;
  nickname: string;
  social_name: string;
  sex: string;
  birth_date: string | null;
  cpf: string | null;
  photo_url: string | null;
  status: PatientStatus;
  blocked: boolean;
  block_reason: string;
  block_at: string | null;
  tags: unknown;
  lead_source: string;
  has_financial_responsible: boolean;
  dependent_full_name: string;
  has_pending_data: boolean;
  pending_fields: unknown;
  pending_critical_fields: unknown;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export interface PatientPhoneSupabaseRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  legacy_id: string;
  type: string;
  country_code: string;
  ddd: string;
  number: string;
  is_whatsapp: boolean;
  is_primary: boolean;
  e164: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PatientDocumentsSupabaseRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  rg: string;
  pis: string;
  municipal_registration: string;
  personal_email: string;
  marital_status: string;
  responsible_name: string;
  responsible_relation: string;
  responsible_phone: string;
  responsible_cpf: string;
  mother_name: string;
  father_name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PatientRecordSupabaseRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  legacy_id: string;
  record_number: string;
  preferred_dentist: string;
  patient_type: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type PatientSupabaseUpsertDto = Partial<
  Omit<PatientSupabaseRow, 'id' | 'tenant_id' | 'created_at'>
> & {
  tenant_id: string;
  legacy_id: string;
};

// ---------------------------------------------------------------------------
// DTOs — IndexedDB legado
// ---------------------------------------------------------------------------

/** Row IDB `patients[]` — shape atual em `patientService.js`. */
export interface PatientIndexedDbRow {
  id: string;
  guid?: string;
  tenant_id?: string | null;
  full_name?: string;
  nickname?: string;
  social_name?: string;
  sex?: string;
  birth_date?: string;
  cpf?: string;
  photo_url?: string;
  status?: string;
  blocked?: boolean;
  block_reason?: string;
  block_at?: string;
  tags?: string[];
  lead_source?: string;
  has_financial_responsible?: boolean;
  dependent_full_name?: string;
  hasPendingData?: boolean;
  pendingFields?: string[];
  pendingCriticalFields?: string[];
  created_at?: string;
  updated_at?: string;
  created_by_user_id?: string;
  updated_by_user_id?: string;
  [key: string]: unknown;
}

export interface PatientPhoneIndexedDbRow {
  id: string;
  patient_id: string;
  type?: string;
  country_code?: string;
  ddd?: string;
  number?: string;
  is_whatsapp?: boolean;
  is_primary?: boolean;
  e164?: string;
  [key: string]: unknown;
}

export interface PatientDocumentsIndexedDbRow {
  patient_id: string;
  rg?: string;
  pis?: string;
  municipal_registration?: string;
  personal_email?: string;
  marital_status?: string;
  responsible_name?: string;
  responsible_relation?: string;
  responsible_phone?: string;
  responsible_cpf?: string;
  mother_name?: string;
  father_name?: string;
  [key: string]: unknown;
}

export interface PatientRecordIndexedDbRow {
  id: string;
  patient_id: string;
  record_number?: string;
  preferred_dentist?: string;
  patient_type?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}


export interface PatientBirthDetailsCore {
  uuid: string;
  tenantId: string;
  patientUuid: string;
  nationality: string;
  birthCity: string;
  birthState: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PatientEducationCore {
  uuid: string;
  tenantId: string;
  patientUuid: string;
  educationLevel: string;
  profession: string;
  otherProfession: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PatientAddressCore {
  uuid: string;
  legacyId: string;
  tenantId: string;
  patientUuid: string;
  type: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PatientRelationshipsCore {
  uuid: string;
  tenantId: string;
  patientUuid: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  financialResponsibleName: string;
  financialResponsibleRelation: string;
  dependents: string[];
  notes: string;
  maritalStatus: string;
  preferredContactPeriod: string;
  preferredContactChannel: string;
  lgpdWhatsappOptIn: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PatientInsuranceCore {
  uuid: string;
  legacyId: string;
  tenantId: string;
  patientUuid: string;
  insuranceName: string;
  planName: string;
  membershipNumber: string;
  validity: string;
  isHolder: boolean;
  isPrimary: boolean;
  companyPartner: string;
  providerId: string;
  planId: string;
  holderCpf: string;
  status: string;
  extraData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PatientAccessCore {
  uuid: string;
  tenantId: string;
  patientUuid: string;
  userId: string | null;
  accessStatus: string;
  lastLoginAt: string | null;
  inviteSentAt: string | null;
  accessEmail: string;
  accessPhone: string;
  wantsPortal: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PatientActivitySummaryCore {
  uuid: string;
  tenantId: string;
  patientUuid: string;
  totalAppointments: number;
  lastAppointmentAt: string | null;
  totalProcedures: number;
  lastProcedureAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Bundle completo Wave 1 + Wave 2 (paridade estrutural com getPatient). */
export interface PatientBundleFull {
  profile: PatientCore;
  documents: PatientDocumentsCore | null;
  phones: PatientPhoneCore[];
  record: PatientRecordCore | null;
  birth: PatientBirthDetailsCore | null;
  education: PatientEducationCore | null;
  addresses: PatientAddressCore[];
  relationships: PatientRelationshipsCore | null;
  insurances: PatientInsuranceCore[];
  access: PatientAccessCore | null;
  activity: PatientActivitySummaryCore | null;
}

export interface PatientBirthDetailsSupabaseRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  nationality: string;
  birth_city: string;
  birth_state: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PatientEducationSupabaseRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  education_level: string;
  profession: string;
  other_profession: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PatientAddressSupabaseRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  legacy_id: string;
  type: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PatientRelationshipsSupabaseRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  financial_responsible_name: string;
  financial_responsible_relation: string;
  dependents: unknown;
  notes: string;
  marital_status: string;
  preferred_contact_period: string;
  preferred_contact_channel: string;
  lgpd_whatsapp_opt_in: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PatientInsuranceSupabaseRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  legacy_id: string;
  insurance_name: string;
  plan_name: string;
  membership_number: string;
  validity: string;
  is_holder: boolean;
  is_primary: boolean;
  company_partner: string;
  provider_id: string;
  plan_id: string;
  holder_cpf: string;
  status: string;
  extra_data: unknown;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PatientAccessSupabaseRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  user_id: string | null;
  access_status: string;
  last_login_at: string | null;
  invite_sent_at: string | null;
  access_email: string;
  access_phone: string;
  wants_portal: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PatientActivitySummarySupabaseRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  total_appointments: number;
  last_appointment_at: string | null;
  total_procedures: number;
  last_procedure_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PatientBirthIndexedDbRow {
  patient_id: string;
  nationality?: string;
  birth_city?: string;
  birth_state?: string;
  [key: string]: unknown;
}

export interface PatientEducationIndexedDbRow {
  patient_id: string;
  education_level?: string;
  profession?: string;
  other_profession?: string;
  [key: string]: unknown;
}

export interface PatientAddressIndexedDbRow {
  id: string;
  patient_id: string;
  type?: string;
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  is_primary?: boolean;
  [key: string]: unknown;
}

export interface PatientRelationshipsIndexedDbRow {
  patient_id: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  financial_responsible_name?: string;
  financial_responsible_relation?: string;
  dependents?: string[];
  notes?: string;
  marital_status?: string;
  preferred_contact_period?: string;
  preferred_contact_channel?: string;
  lgpd_whatsapp_opt_in?: boolean;
  [key: string]: unknown;
}

export interface PatientInsuranceIndexedDbRow {
  id: string;
  patient_id: string;
  insurance_name?: string;
  plan_name?: string;
  membership_number?: string;
  validity?: string;
  is_holder?: boolean;
  is_primary?: boolean;
  company_partner?: string;
  provider_id?: string;
  plan_id?: string;
  holder_cpf?: string;
  status?: string;
  extra_data?: Record<string, unknown>;
  tenant_id?: string;
  [key: string]: unknown;
}

export interface PatientAccessIndexedDbRow {
  patient_id: string;
  user_id?: string;
  access_status?: string;
  last_login_at?: string;
  invite_sent_at?: string;
  access_email?: string;
  access_phone?: string;
  wants_portal?: boolean;
  portal_email?: string;
  portal_phone?: string;
  [key: string]: unknown;
}

export interface PatientActivityIndexedDbRow {
  patient_id: string;
  total_appointments?: number;
  last_appointment_at?: string;
  total_procedures?: number;
  last_procedure_at?: string;
  [key: string]: unknown;
}


// ---------------------------------------------------------------------------
// Create / update / filtros / resultados
// ---------------------------------------------------------------------------

export interface PatientCreateCoreDto {
  fullName: string;
  sex: string;
  birthDate: string;
  cpf: string;
  nickname?: string;
  socialName?: string;
  leadSource?: string;
  hasFinancialResponsible?: boolean;
  dependentFullName?: string;
  tags?: string[];
  /** Se omitido, gerado como `patient-*` pelo mapper (wave futura). */
  legacyId?: string;
  guid?: string;
}

export type PatientUpdateCoreDto = Partial<PatientCreateCoreDto> & {
  status?: PatientStatus;
  blocked?: boolean;
  blockReason?: string;
  blockAt?: string | null;
  photoUrl?: string | null;
  hasPendingData?: boolean;
  pendingFields?: string[];
  pendingCriticalFields?: string[];
};

export interface PatientListFilters {
  tenantId?: string;
  status?: PatientStatus | PatientStatus[];
  search?: string;
  cpf?: string;
  includeBlocked?: boolean;
}

export type PatientReadSource =
  | 'supabase'
  | 'indexeddb'
  | 'indexeddb-offline'
  | 'cache';

export interface PatientListResult {
  items: PatientCore[];
  total: number;
  source: PatientReadSource;
}

export interface PatientGetResult {
  core: PatientCore | null;
  source: PatientReadSource;
}

export interface PatientRepositoryUser {
  id: string;
  tenant_id?: string | null;
  tenantId?: string | null;
}

// ---------------------------------------------------------------------------
// Contratos de sub-repositories
// ---------------------------------------------------------------------------

export interface IPatientIndexedDbRepository {
  listLegacySync(filters?: PatientListFilters): PatientIndexedDbRow[];
  getLegacyProfileSync(patientId: string): PatientIndexedDbRow | null;
  getLegacyDocumentsSync(patientId: string): PatientDocumentsIndexedDbRow | null;
  listLegacyPhonesSync(patientId: string): PatientPhoneIndexedDbRow[];
  getLegacyRecordSync(patientId: string): PatientRecordIndexedDbRow | null;
}

export interface IPatientSupabaseRepository {
  findByUuid(tenantId: string, uuid: string): Promise<PatientCore | null>;
  findByLegacyId(tenantId: string, legacyId: string): Promise<PatientCore | null>;
  list(tenantId: string, filters?: PatientListFilters): Promise<PatientCore[]>;
  listPatients(tenantId: string, filters?: PatientListFilters): Promise<PatientListResult>;
  getPatientById(tenantId: string, uuid: string): Promise<PatientCore | null>;
  getPatientByLegacyId(tenantId: string, legacyId: string): Promise<PatientCore | null>;
  searchPatients(tenantId: string, query: string, filters?: PatientListFilters): Promise<PatientCore[]>;
  createPatient(tenantId: string, dto: PatientSupabaseUpsertDto): Promise<PatientCore>;
  updatePatient(tenantId: string, uuid: string, patch: Partial<PatientSupabaseRow>): Promise<PatientCore>;
  softDeletePatient(tenantId: string, uuid: string): Promise<void>;
  /** @deprecated use listPatients */
  upsert(tenantId: string, dto: PatientSupabaseUpsertDto): Promise<PatientCore>;
  softDelete(tenantId: string, uuid: string): Promise<void>;
  list(tenantId: string, filters?: PatientListFilters): Promise<PatientCore[]>;

  listPatientPhones(tenantId: string, patientUuid: string): Promise<PatientPhoneCore[]>;
  createPatientPhone(tenantId: string, row: Partial<PatientPhoneSupabaseRow> & { patient_id: string; legacy_id: string }): Promise<PatientPhoneCore>;
  updatePatientPhone(tenantId: string, phoneUuid: string, patch: Partial<PatientPhoneSupabaseRow>): Promise<PatientPhoneCore>;
  removePatientPhone(tenantId: string, phoneUuid: string): Promise<void>;
  getPatientDocuments(tenantId: string, patientUuid: string): Promise<PatientDocumentsCore | null>;
  upsertPatientDocuments(tenantId: string, row: Partial<PatientDocumentsSupabaseRow> & { patient_id: string }): Promise<PatientDocumentsCore>;
  getPatientRecord(tenantId: string, patientUuid: string): Promise<PatientRecordCore | null>;
  upsertPatientRecord(tenantId: string, row: Partial<PatientRecordSupabaseRow> & { patient_id: string; legacy_id: string }): Promise<PatientRecordCore>;

  getPatientBirthDetails(tenantId: string, patientUuid: string): Promise<PatientBirthDetailsCore | null>;
  upsertPatientBirthDetails(tenantId: string, row: Partial<PatientBirthDetailsSupabaseRow> & { patient_id: string }): Promise<PatientBirthDetailsCore>;
  getPatientEducation(tenantId: string, patientUuid: string): Promise<PatientEducationCore | null>;
  upsertPatientEducation(tenantId: string, row: Partial<PatientEducationSupabaseRow> & { patient_id: string }): Promise<PatientEducationCore>;
  listPatientAddresses(tenantId: string, patientUuid: string): Promise<PatientAddressCore[]>;
  createPatientAddress(tenantId: string, row: Partial<PatientAddressSupabaseRow> & { patient_id: string; legacy_id: string }): Promise<PatientAddressCore>;
  updatePatientAddress(tenantId: string, addressUuid: string, patch: Partial<PatientAddressSupabaseRow>): Promise<PatientAddressCore>;
  removePatientAddress(tenantId: string, addressUuid: string): Promise<void>;
  getPatientRelationships(tenantId: string, patientUuid: string): Promise<PatientRelationshipsCore | null>;
  upsertPatientRelationships(tenantId: string, row: Partial<PatientRelationshipsSupabaseRow> & { patient_id: string }): Promise<PatientRelationshipsCore>;
  listPatientInsurances(tenantId: string, patientUuid: string): Promise<PatientInsuranceCore[]>;
  createPatientInsurance(tenantId: string, row: Partial<PatientInsuranceSupabaseRow> & { patient_id: string; legacy_id: string }): Promise<PatientInsuranceCore>;
  updatePatientInsurance(tenantId: string, insuranceUuid: string, patch: Partial<PatientInsuranceSupabaseRow>): Promise<PatientInsuranceCore>;
  removePatientInsurance(tenantId: string, insuranceUuid: string): Promise<void>;
  getPatientAccess(tenantId: string, patientUuid: string): Promise<PatientAccessCore | null>;
  upsertPatientAccess(tenantId: string, row: Partial<PatientAccessSupabaseRow> & { patient_id: string }): Promise<PatientAccessCore>;
  getPatientActivitySummary(tenantId: string, patientUuid: string): Promise<PatientActivitySummaryCore | null>;
  upsertPatientActivitySummary(tenantId: string, row: Partial<PatientActivitySummarySupabaseRow> & { patient_id: string }): Promise<PatientActivitySummaryCore>;

  getPatientBundle(tenantId: string, patientUuid: string): Promise<PatientBundleFull | null>;
}

export interface IPatientRepository {
  listCore(tenantId: string, filters?: PatientListFilters): Promise<PatientListResult>;
  getCore(tenantId: string, ref: PatientRef): Promise<PatientCore | null>;
  createCore(user: PatientRepositoryUser, dto: PatientCreateCoreDto): Promise<PatientCore>;
  updateCore(
    user: PatientRepositoryUser,
    ref: PatientRef,
    dto: PatientUpdateCoreDto,
  ): Promise<PatientCore>;
  softDeleteCore(user: PatientRepositoryUser, ref: PatientRef): Promise<void>;
  listLegacySync(filters?: PatientListFilters): PatientIndexedDbRow[];
  getLegacyProfileSync(patientId: string): PatientIndexedDbRow | null;
}

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

/** Método ainda não implementado (scaffold Wave 1). */
export class PatientRepositoryNotImplementedError extends Error {
  readonly code = 'PATIENT_REPOSITORY_NOT_IMPLEMENTED';

  constructor(method: string) {
    super(
      `[PatientRepository] "${method}" ainda não implementado — scaffold/flag-off Phase 9.4A.`,
    );
    this.name = 'PatientRepositoryNotImplementedError';
  }
}

export class PatientNotFoundError extends Error {
  readonly code = 'PATIENT_NOT_FOUND';

  constructor(ref: PatientRef) {
    super(`Paciente não encontrado: ${ref}`);
    this.name = 'PatientNotFoundError';
  }
}

export class PatientRepositoryRemoteReadDisabledError extends Error {
  readonly code = 'PATIENT_REMOTE_READ_DISABLED';

  constructor() {
    super('Leitura Supabase desabilitada (PATIENTS_READ=false).');
    this.name = 'PatientRepositoryRemoteReadDisabledError';
  }
}

export class PatientRepositoryRemoteWriteDisabledError extends Error {
  readonly code = 'PATIENT_REMOTE_WRITE_DISABLED';

  constructor() {
    super('Escrita Supabase desabilitada (PATIENTS_WRITE=false).');
    this.name = 'PatientRepositoryRemoteWriteDisabledError';
  }
}

export class PatientRepositorySupabaseUnavailableError extends Error {
  readonly code = 'PATIENT_SUPABASE_UNAVAILABLE';

  constructor(cause?: unknown) {
    super('Supabase patients indisponível.');
    this.name = 'PatientRepositorySupabaseUnavailableError';
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}
