/**
 * @module repositories/contracts/contractPersistenceTypes
 * @description Rows snake_case ↔ domínio camelCase (Phase 10.3).
 */

export type ContractSupabaseClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export interface AppContractRow {
  id: string;
  tenant_id: string;
  contract_number: string;
  document_type: string;
  title: string;
  patient_id: string;
  guardian_patient_id: string | null;
  budget_id: string | null;
  budget_version_id: string | null;
  treatment_plan_id: string | null;
  appointment_id: string | null;
  origin: string;
  status: string;
  current_version_id: string | null;
  signature_envelope_id: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  superseded_by_contract_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  row_version: number;
  metadata: Record<string, unknown> | null;
  idempotency_key: string | null;
}

export interface AppContractVersionRow {
  id: string;
  tenant_id: string;
  contract_id: string;
  version_number: number;
  template_id: string | null;
  template_version_id: string | null;
  generation_reason: string;
  content_schema_snapshot: unknown;
  rendered_html_snapshot: string | null;
  plain_text_snapshot: string | null;
  patient_snapshot: Record<string, unknown>;
  guardian_snapshot: Record<string, unknown> | null;
  clinic_snapshot: Record<string, unknown>;
  professional_snapshot: Record<string, unknown> | null;
  budget_snapshot: Record<string, unknown> | null;
  treatment_snapshot: Record<string, unknown> | null;
  odontogram_snapshot: Record<string, unknown> | null;
  financial_snapshot: Record<string, unknown> | null;
  consents_snapshot: unknown;
  signers_snapshot: unknown;
  attachments_snapshot: unknown;
  terms_snapshot: Record<string, unknown> | null;
  document_hash: string | null;
  previous_version_hash: string | null;
  created_by: string;
  created_at: string;
  locked_at: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AppContractTemplateRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  document_type: string;
  category: string | null;
  procedure_codes: unknown;
  specialty_codes: unknown;
  status: string;
  current_version_id: string | null;
  is_default: boolean;
  requirements: Record<string, unknown>;
  signature_policy_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  archived_at: string | null;
  row_version: number;
  metadata: Record<string, unknown> | null;
}

export interface AppContractPackageRow {
  id: string;
  tenant_id: string;
  package_number: string;
  patient_id: string;
  budget_id: string | null;
  treatment_plan_id: string | null;
  status: string;
  created_by: string;
  created_at: string;
  completed_at: string | null;
  row_version: number;
  metadata: Record<string, unknown> | null;
  idempotency_key: string | null;
}

export interface AppSignatureEnvelopeRow {
  id: string;
  tenant_id: string;
  contract_id: string;
  contract_version_id: string;
  status: string;
  signature_policy_id: string | null;
  provider: string;
  provider_envelope_id: string | null;
  sent_at: string | null;
  expires_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  document_hash_before_signing: string | null;
  document_hash_after_signing: string | null;
  evidence_file_id: string | null;
  created_by: string;
  created_at: string;
  row_version: number;
  metadata: Record<string, unknown> | null;
  idempotency_key: string | null;
}

export interface AppContractFileRow {
  id: string;
  tenant_id: string;
  contract_id: string;
  contract_version_id: string | null;
  file_type: string;
  storage_provider: string;
  storage_bucket: string | null;
  storage_path: string;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  sha256: string | null;
  encryption_status: string | null;
  retention_policy: unknown;
  uploaded_by: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface AppContractAuditEventRow {
  id: string;
  tenant_id: string;
  contract_id: string | null;
  contract_version_id: string | null;
  envelope_id: string | null;
  event_type: string;
  actor_type: string;
  actor_id: string | null;
  actor_name: string | null;
  source: string;
  request_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  previous_event_hash: string | null;
  event_hash: string | null;
  occurred_at: string;
}
