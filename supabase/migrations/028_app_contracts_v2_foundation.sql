-- 028: Contracts V2 foundation — schema multi-tenant (Phase 10.3)
-- NÃO EXECUTAR automaticamente em remoto/produção.
-- Dry-run local somente sob autorização explícita.
--
-- Objetivo:
--   Persistência nova do domínio Contracts V2 SEM cutover do legado.
--   IndexedDB permanece SSOT operacional. Feature flags permanecem OFF.
--
-- Namespace (colisão com 006):
--   006 já possui: contract_templates, contract_blocks, generated_contracts, contract_audit_logs.
--   V2 usa prefixo app_contract_* / app_signature_* para coexistência segura.
--   generated_contracts NÃO é alterada nem removida.
--
-- Pré-requisitos:
--   public.tenants
--   public.touch_updated_at() (005)
--   app_user_can_access_tenant / app_user_is_tenant_admin (009/012) — usadas em 029
--
-- Decisões:
--   - IDs uuid (gen_random_uuid)
--   - patient_id / budget_id / appointment_id / guardian_patient_id / treatment_plan_id
--     como text opaco (padrão appointments 020) — sem FK prematura a patients
--   - FK compostas (tenant_id, id) para impedir vínculos cross-tenant
--   - CHECK alinhado a CONTRACT_* da Phase 10.2
--   - row_version para optimistic concurrency
--   - versões locked_at imutáveis via trigger
--   - audit append-only (UPDATE/DELETE bloqueados via trigger + RLS em 029)
--
-- ROLLBACK (manual — ordem inversa; NUNCA com dados reais sem backup):
--   ver seção final + relatório PHASE_10_3.

-- ===========================================================================
-- Helpers: imutabilidade / append-only / tenant_id imutável
-- ===========================================================================

create or replace function public.app_contract_reject_locked_version_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.locked_at is not null then
    raise exception 'APP_CONTRACT_VERSION_LOCKED: contract version % is immutable after locked_at', old.id
      using errcode = 'integrity_constraint_violation';
  end if;
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'APP_CONTRACT_TENANT_IMMUTABLE: tenant_id cannot change'
      using errcode = 'integrity_constraint_violation';
  end if;
  if new.contract_id is distinct from old.contract_id then
    raise exception 'APP_CONTRACT_VERSION_CONTRACT_IMMUTABLE: contract_id cannot change'
      using errcode = 'integrity_constraint_violation';
  end if;
  if new.version_number is distinct from old.version_number then
    raise exception 'APP_CONTRACT_VERSION_NUMBER_IMMUTABLE: version_number cannot change'
      using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end;
$$;

comment on function public.app_contract_reject_locked_version_mutation() is
  'Phase 10.3 — bloqueia UPDATE em app_contract_versions quando locked_at IS NOT NULL; impede troca de tenant/contract/version_number.';

create or replace function public.app_contract_reject_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'APP_CONTRACT_AUDIT_APPEND_ONLY: audit events cannot be updated or deleted'
    using errcode = 'integrity_constraint_violation';
end;
$$;

comment on function public.app_contract_reject_audit_mutation() is
  'Phase 10.3 — append-only enforcement for app_contract_audit_events.';

create or replace function public.app_contract_reject_tenant_id_change()
returns trigger
language plpgsql
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'APP_CONTRACT_TENANT_IMMUTABLE: tenant_id cannot change'
      using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- app_signature_policies (antes de templates — FK opcional)
-- ===========================================================================

create table if not exists public.app_signature_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  signature_level text not null,
  allowed_methods jsonb not null default '[]'::jsonb,
  requirements jsonb not null default '{}'::jsonb,
  signing_order text null,
  link_expiration_hours integer null,
  max_attempts integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,

  constraint app_signature_policies_tenant_id_uidx unique (tenant_id, id),
  constraint app_signature_policies_name_nonempty_chk check (length(trim(name)) > 0),
  constraint app_signature_policies_row_version_chk check (row_version >= 1),
  constraint app_signature_policies_level_chk
    check (signature_level in ('SIMPLE', 'ADVANCED', 'QUALIFIED', 'EXTERNAL_PROVIDER')),
  constraint app_signature_policies_methods_array_chk
    check (jsonb_typeof(allowed_methods) = 'array'),
  constraint app_signature_policies_requirements_object_chk
    check (jsonb_typeof(requirements) = 'object'),
  constraint app_signature_policies_signing_order_chk
    check (signing_order is null or signing_order in ('PARALLEL', 'SEQUENTIAL')),
  constraint app_signature_policies_expiration_chk
    check (link_expiration_hours is null or link_expiration_hours > 0),
  constraint app_signature_policies_max_attempts_chk
    check (max_attempts is null or max_attempts > 0)
);

drop trigger if exists trg_app_signature_policies_touch_updated_at on public.app_signature_policies;
create trigger trg_app_signature_policies_touch_updated_at
before update on public.app_signature_policies
for each row execute function public.touch_updated_at();

drop trigger if exists trg_app_signature_policies_tenant_immutable on public.app_signature_policies;
create trigger trg_app_signature_policies_tenant_immutable
before update on public.app_signature_policies
for each row execute function public.app_contract_reject_tenant_id_change();

-- ===========================================================================
-- app_contract_templates
-- ===========================================================================

create table if not exists public.app_contract_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text null,
  document_type text not null,
  category text null,
  procedure_codes jsonb not null default '[]'::jsonb,
  specialty_codes jsonb not null default '[]'::jsonb,
  status text not null default 'DRAFT',
  current_version_id uuid null,
  is_default boolean not null default false,
  requirements jsonb not null default '{}'::jsonb,
  signature_policy_id uuid null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_by uuid null,
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  row_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,

  constraint app_contract_templates_tenant_id_uidx unique (tenant_id, id),
  constraint app_contract_templates_name_nonempty_chk check (length(trim(name)) > 0),
  constraint app_contract_templates_row_version_chk check (row_version >= 1),
  constraint app_contract_templates_status_chk
    check (status in ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED')),
  constraint app_contract_templates_document_type_chk
    check (document_type in (
      'SERVICE_CONTRACT', 'INFORMED_CONSENT', 'LGPD_TERM', 'IMAGE_AUTHORIZATION',
      'ANESTHESIA_CONSENT', 'SURGICAL_CONSENT', 'IMPLANT_CONSENT', 'PROSTHESIS_CONSENT',
      'ORTHODONTIC_CONSENT', 'ENDODONTIC_CONSENT', 'SEDATION_CONSENT',
      'FINANCIAL_ACKNOWLEDGEMENT', 'TREATMENT_REFUSAL', 'CANCELLATION_TERM',
      'TERMINATION_AGREEMENT', 'CONTRACT_ADDENDUM', 'CUSTOM'
    )),
  constraint app_contract_templates_procedure_codes_array_chk
    check (jsonb_typeof(procedure_codes) = 'array'),
  constraint app_contract_templates_specialty_codes_array_chk
    check (jsonb_typeof(specialty_codes) = 'array'),
  constraint app_contract_templates_requirements_object_chk
    check (jsonb_typeof(requirements) = 'object'),
  constraint app_contract_templates_signature_policy_fk
    foreign key (tenant_id, signature_policy_id)
    references public.app_signature_policies (tenant_id, id)
    deferrable initially deferred
);

drop trigger if exists trg_app_contract_templates_touch_updated_at on public.app_contract_templates;
create trigger trg_app_contract_templates_touch_updated_at
before update on public.app_contract_templates
for each row execute function public.touch_updated_at();

drop trigger if exists trg_app_contract_templates_tenant_immutable on public.app_contract_templates;
create trigger trg_app_contract_templates_tenant_immutable
before update on public.app_contract_templates
for each row execute function public.app_contract_reject_tenant_id_change();

-- ===========================================================================
-- app_contract_template_versions
-- ===========================================================================

create table if not exists public.app_contract_template_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_id uuid not null,
  version_number integer not null,
  version_label text null,
  content_schema jsonb not null default '{}'::jsonb,
  content_html text null,
  content_text text null,
  variables_schema jsonb not null default '[]'::jsonb,
  clauses_snapshot jsonb null,
  change_summary text null,
  status text not null default 'DRAFT',
  published_by uuid null,
  published_at timestamptz null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  locked_at timestamptz null,

  constraint app_contract_template_versions_tenant_id_uidx unique (tenant_id, id),
  constraint app_contract_template_versions_uq
    unique (tenant_id, template_id, version_number),
  constraint app_contract_template_versions_number_chk check (version_number >= 1),
  constraint app_contract_template_versions_status_chk
    check (status in ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED')),
  constraint app_contract_template_versions_published_chk
    check (
      (status = 'PUBLISHED' and published_at is not null)
      or (status <> 'PUBLISHED')
    ),
  constraint app_contract_template_versions_variables_array_chk
    check (jsonb_typeof(variables_schema) = 'array'),
  constraint app_contract_template_versions_template_fk
    foreign key (tenant_id, template_id)
    references public.app_contract_templates (tenant_id, id)
    on delete cascade
);

-- Template version PUBLISHED/locked: bloquear update de conteúdo
create or replace function public.app_contract_reject_published_template_version_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'PUBLISHED' or old.locked_at is not null then
    raise exception 'APP_CONTRACT_TEMPLATE_VERSION_IMMUTABLE: published/locked template version cannot be updated'
      using errcode = 'integrity_constraint_violation';
  end if;
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'APP_CONTRACT_TENANT_IMMUTABLE: tenant_id cannot change'
      using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_app_contract_template_versions_immutable on public.app_contract_template_versions;
create trigger trg_app_contract_template_versions_immutable
before update on public.app_contract_template_versions
for each row execute function public.app_contract_reject_published_template_version_mutation();

-- current_version_id FK (deferrable — ciclo create template + version)
alter table public.app_contract_templates
  drop constraint if exists app_contract_templates_current_version_fk;
alter table public.app_contract_templates
  add constraint app_contract_templates_current_version_fk
  foreign key (tenant_id, current_version_id)
  references public.app_contract_template_versions (tenant_id, id)
  deferrable initially deferred;

-- ===========================================================================
-- app_contracts
-- ===========================================================================

create table if not exists public.app_contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_number text not null,
  document_type text not null,
  title text not null,
  -- refs opacas (patient-* / uuid textual) — sem FK prematura a public.patients
  patient_id text not null,
  guardian_patient_id text null,
  budget_id text null,
  budget_version_id text null,
  treatment_plan_id text null,
  appointment_id text null,
  origin text not null,
  status text not null default 'DRAFT',
  current_version_id uuid null,
  signature_envelope_id uuid null,
  effective_date date null,
  expiration_date timestamptz null,
  completed_at timestamptz null,
  cancelled_at timestamptz null,
  cancelled_by uuid null,
  cancellation_reason text null,
  superseded_by_contract_id uuid null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  -- futura idempotência de criação a partir do orçamento
  idempotency_key text null,

  constraint app_contracts_tenant_id_uidx unique (tenant_id, id),
  constraint app_contracts_number_uq unique (tenant_id, contract_number),
  constraint app_contracts_idempotency_uq unique (tenant_id, idempotency_key),
  constraint app_contracts_number_nonempty_chk check (length(trim(contract_number)) > 0),
  constraint app_contracts_title_nonempty_chk check (length(trim(title)) > 0),
  constraint app_contracts_patient_nonempty_chk check (length(trim(patient_id)) > 0),
  constraint app_contracts_row_version_chk check (row_version >= 1),
  constraint app_contracts_document_type_chk
    check (document_type in (
      'SERVICE_CONTRACT', 'INFORMED_CONSENT', 'LGPD_TERM', 'IMAGE_AUTHORIZATION',
      'ANESTHESIA_CONSENT', 'SURGICAL_CONSENT', 'IMPLANT_CONSENT', 'PROSTHESIS_CONSENT',
      'ORTHODONTIC_CONSENT', 'ENDODONTIC_CONSENT', 'SEDATION_CONSENT',
      'FINANCIAL_ACKNOWLEDGEMENT', 'TREATMENT_REFUSAL', 'CANCELLATION_TERM',
      'TERMINATION_AGREEMENT', 'CONTRACT_ADDENDUM', 'CUSTOM'
    )),
  constraint app_contracts_origin_chk
    check (origin in (
      'MANUAL', 'CRM_BUDGET', 'CLINICAL_BUDGET', 'PATIENT_CHART',
      'TREATMENT_PLAN', 'ADDENDUM', 'LEGACY_IMPORT'
    )),
  constraint app_contracts_status_chk
    check (status in (
      'DRAFT', 'READY_FOR_REVIEW', 'PENDING_INTERNAL_APPROVAL', 'APPROVED',
      'PENDING_SIGNATURES', 'PARTIALLY_SIGNED', 'SIGNED', 'DECLINED', 'EXPIRED',
      'CANCELLED', 'SUPERSEDED', 'TERMINATED', 'VOIDED'
    )),
  constraint app_contracts_cancel_reason_chk
    check (
      (status in ('CANCELLED', 'VOIDED') and length(trim(coalesce(cancellation_reason, ''))) > 0)
      or (status not in ('CANCELLED', 'VOIDED'))
    ),
  constraint app_contracts_date_range_chk
    check (
      expiration_date is null
      or effective_date is null
      or expiration_date::date >= effective_date
    ),
  constraint app_contracts_superseded_fk
    foreign key (tenant_id, superseded_by_contract_id)
    references public.app_contracts (tenant_id, id)
    deferrable initially deferred
);

comment on column public.app_contracts.patient_id is
  'Ref opaca ao paciente (legacy_id patient-* ou uuid textual). Sem FK a public.patients nesta fase.';
comment on column public.app_contracts.idempotency_key is
  'Chave de idempotência opcional (ex.: criação a partir de orçamento). Unique por tenant quando presente.';

drop trigger if exists trg_app_contracts_touch_updated_at on public.app_contracts;
create trigger trg_app_contracts_touch_updated_at
before update on public.app_contracts
for each row execute function public.touch_updated_at();

drop trigger if exists trg_app_contracts_tenant_immutable on public.app_contracts;
create trigger trg_app_contracts_tenant_immutable
before update on public.app_contracts
for each row execute function public.app_contract_reject_tenant_id_change();

-- ===========================================================================
-- app_contract_versions
-- ===========================================================================

create table if not exists public.app_contract_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid not null,
  version_number integer not null,
  template_id uuid null,
  template_version_id uuid null,
  generation_reason text not null,

  content_schema_snapshot jsonb not null default '{}'::jsonb,
  rendered_html_snapshot text null,
  plain_text_snapshot text null,

  patient_snapshot jsonb not null,
  guardian_snapshot jsonb null,
  clinic_snapshot jsonb not null,
  professional_snapshot jsonb null,
  budget_snapshot jsonb null,
  treatment_snapshot jsonb null,
  odontogram_snapshot jsonb null,
  financial_snapshot jsonb null,
  consents_snapshot jsonb null,
  signers_snapshot jsonb not null,
  attachments_snapshot jsonb null,
  terms_snapshot jsonb null,

  document_hash text null,
  previous_version_hash text null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  locked_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,

  constraint app_contract_versions_tenant_id_uidx unique (tenant_id, id),
  constraint app_contract_versions_uq unique (tenant_id, contract_id, version_number),
  constraint app_contract_versions_number_chk check (version_number >= 1),
  constraint app_contract_versions_reason_chk
    check (generation_reason in (
      'INITIAL', 'REVISION', 'ADDENDUM', 'CORRECTION', 'LEGACY_IMPORT', 'REISSUE'
    )),
  constraint app_contract_versions_patient_snapshot_object_chk
    check (jsonb_typeof(patient_snapshot) = 'object'),
  constraint app_contract_versions_clinic_snapshot_object_chk
    check (jsonb_typeof(clinic_snapshot) = 'object'),
  constraint app_contract_versions_signers_snapshot_array_chk
    check (jsonb_typeof(signers_snapshot) = 'array'),
  constraint app_contract_versions_hash_chk
    check (
      document_hash is null
      or document_hash ~* '^(sha256:)?[a-f0-9]{16,128}$'
    ),
  constraint app_contract_versions_prev_hash_chk
    check (
      previous_version_hash is null
      or previous_version_hash ~* '^(sha256:)?[a-f0-9]{16,128}$'
    ),
  constraint app_contract_versions_contract_fk
    foreign key (tenant_id, contract_id)
    references public.app_contracts (tenant_id, id)
    on delete cascade,
  constraint app_contract_versions_template_fk
    foreign key (tenant_id, template_id)
    references public.app_contract_templates (tenant_id, id)
    deferrable initially deferred,
  constraint app_contract_versions_template_version_fk
    foreign key (tenant_id, template_version_id)
    references public.app_contract_template_versions (tenant_id, id)
    deferrable initially deferred
);

drop trigger if exists trg_app_contract_versions_locked on public.app_contract_versions;
create trigger trg_app_contract_versions_locked
before update on public.app_contract_versions
for each row execute function public.app_contract_reject_locked_version_mutation();

alter table public.app_contracts
  drop constraint if exists app_contracts_current_version_fk;
alter table public.app_contracts
  add constraint app_contracts_current_version_fk
  foreign key (tenant_id, current_version_id)
  references public.app_contract_versions (tenant_id, id)
  deferrable initially deferred;

-- ===========================================================================
-- app_contract_parties
-- ===========================================================================

create table if not exists public.app_contract_parties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid not null,
  contract_version_id uuid null,
  party_type text not null,
  entity_type text null,
  entity_id text null,
  name text not null,
  document_type text null,
  document_number_masked text null,
  document_number_hash text null,
  email text null,
  phone text null,
  role text null,
  representation_type text null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint app_contract_parties_tenant_id_uidx unique (tenant_id, id),
  constraint app_contract_parties_name_nonempty_chk check (length(trim(name)) > 0),
  constraint app_contract_parties_type_chk
    check (party_type in (
      'CLINIC', 'PATIENT', 'LEGAL_GUARDIAN', 'PROFESSIONAL',
      'FINANCIAL_RESPONSIBLE', 'WITNESS', 'INTERPRETER', 'OTHER'
    )),
  constraint app_contract_parties_snapshot_object_chk
    check (jsonb_typeof(snapshot) = 'object'),
  constraint app_contract_parties_contract_fk
    foreign key (tenant_id, contract_id)
    references public.app_contracts (tenant_id, id)
    on delete cascade,
  constraint app_contract_parties_version_fk
    foreign key (tenant_id, contract_version_id)
    references public.app_contract_versions (tenant_id, id)
    on delete cascade
);

-- ===========================================================================
-- app_contract_treatments
-- ===========================================================================

create table if not exists public.app_contract_treatments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid not null,
  contract_version_id uuid not null,
  budget_item_id text null,
  procedure_id text null,
  procedure_code text null,
  procedure_name text not null,
  tooth text null,
  tooth_surface text null,
  region text null,
  quantity numeric not null default 1,
  unit_price numeric null,
  discount numeric null,
  final_price numeric null,
  professional_id text null,
  clinical_status text null,
  snapshot jsonb not null default '{}'::jsonb,

  constraint app_contract_treatments_tenant_id_uidx unique (tenant_id, id),
  constraint app_contract_treatments_name_nonempty_chk check (length(trim(procedure_name)) > 0),
  constraint app_contract_treatments_quantity_chk check (quantity > 0),
  constraint app_contract_treatments_unit_price_chk check (unit_price is null or unit_price >= 0),
  constraint app_contract_treatments_discount_chk check (discount is null or discount >= 0),
  constraint app_contract_treatments_final_price_chk check (final_price is null or final_price >= 0),
  constraint app_contract_treatments_snapshot_object_chk
    check (jsonb_typeof(snapshot) = 'object'),
  constraint app_contract_treatments_contract_fk
    foreign key (tenant_id, contract_id)
    references public.app_contracts (tenant_id, id)
    on delete cascade,
  constraint app_contract_treatments_version_fk
    foreign key (tenant_id, contract_version_id)
    references public.app_contract_versions (tenant_id, id)
    on delete cascade
);

-- ===========================================================================
-- Snapshots dedicados
-- ===========================================================================

create table if not exists public.app_contract_odontogram_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid not null,
  contract_version_id uuid not null,
  patient_id text not null,
  odontogram_version text null,
  odontogram_data jsonb not null,
  image_file_id uuid null,
  captured_at timestamptz not null default now(),
  captured_by uuid null,
  hash text null,

  constraint app_contract_odontogram_snapshots_tenant_id_uidx unique (tenant_id, id),
  constraint app_contract_odontogram_snapshots_data_object_chk
    check (jsonb_typeof(odontogram_data) = 'object' or jsonb_typeof(odontogram_data) = 'array'),
  constraint app_contract_odontogram_snapshots_contract_fk
    foreign key (tenant_id, contract_id)
    references public.app_contracts (tenant_id, id)
    on delete cascade,
  constraint app_contract_odontogram_snapshots_version_fk
    foreign key (tenant_id, contract_version_id)
    references public.app_contract_versions (tenant_id, id)
    on delete cascade
);

create table if not exists public.app_contract_financial_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid not null,
  contract_version_id uuid not null,
  budget_total numeric null,
  discount_total numeric null,
  contract_total numeric null,
  down_payment numeric null,
  financed_amount numeric null,
  installment_count integer null,
  installment_value numeric null,
  interest_rate numeric null,
  fees numeric null,
  payment_methods jsonb null,
  due_dates jsonb null,
  payer_snapshot jsonb null,
  receivables_reference jsonb null,
  financial_conditions_text text null,
  currency text not null default 'BRL',
  captured_at timestamptz not null default now(),
  hash text null,

  constraint app_contract_financial_snapshots_tenant_id_uidx unique (tenant_id, id),
  constraint app_contract_financial_snapshots_currency_chk
    check (currency ~ '^[A-Z]{3}$'),
  constraint app_contract_financial_snapshots_installment_count_chk
    check (installment_count is null or installment_count >= 0),
  constraint app_contract_financial_snapshots_nonneg_chk
    check (
      (budget_total is null or budget_total >= 0)
      and (discount_total is null or discount_total >= 0)
      and (contract_total is null or contract_total >= 0)
      and (down_payment is null or down_payment >= 0)
      and (financed_amount is null or financed_amount >= 0)
      and (installment_value is null or installment_value >= 0)
      and (fees is null or fees >= 0)
    ),
  constraint app_contract_financial_snapshots_contract_fk
    foreign key (tenant_id, contract_id)
    references public.app_contracts (tenant_id, id)
    on delete cascade,
  constraint app_contract_financial_snapshots_version_fk
    foreign key (tenant_id, contract_version_id)
    references public.app_contract_versions (tenant_id, id)
    on delete cascade
);

create table if not exists public.app_contract_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid not null,
  contract_version_id uuid not null,
  consent_type text not null,
  procedure_code text null,
  title text not null,
  content text not null,
  risks jsonb null,
  benefits jsonb null,
  alternatives jsonb null,
  non_treatment_consequences jsonb null,
  patient_questions jsonb null,
  professional_explanations jsonb null,
  accepted boolean null,
  accepted_at timestamptz null,
  revoked_at timestamptz null,
  revocation_reason text null,

  constraint app_contract_consents_tenant_id_uidx unique (tenant_id, id),
  constraint app_contract_consents_title_nonempty_chk check (length(trim(title)) > 0),
  constraint app_contract_consents_content_nonempty_chk check (length(trim(content)) > 0),
  constraint app_contract_consents_contract_fk
    foreign key (tenant_id, contract_id)
    references public.app_contracts (tenant_id, id)
    on delete cascade,
  constraint app_contract_consents_version_fk
    foreign key (tenant_id, contract_version_id)
    references public.app_contract_versions (tenant_id, id)
    on delete cascade
);

-- ===========================================================================
-- Packages
-- ===========================================================================

create table if not exists public.app_contract_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  package_number text not null,
  patient_id text not null,
  budget_id text null,
  treatment_plan_id text null,
  status text not null default 'DRAFT',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  row_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text null,

  constraint app_contract_packages_tenant_id_uidx unique (tenant_id, id),
  constraint app_contract_packages_number_uq unique (tenant_id, package_number),
  constraint app_contract_packages_idempotency_uq unique (tenant_id, idempotency_key),
  constraint app_contract_packages_number_nonempty_chk check (length(trim(package_number)) > 0),
  constraint app_contract_packages_patient_nonempty_chk check (length(trim(patient_id)) > 0),
  constraint app_contract_packages_row_version_chk check (row_version >= 1),
  constraint app_contract_packages_status_chk
    check (status in ('DRAFT', 'PENDING', 'PARTIALLY_COMPLETE', 'COMPLETED', 'CANCELLED'))
);

create table if not exists public.app_contract_package_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  package_id uuid not null,
  contract_id uuid not null,
  requirement_code text null,
  is_required boolean not null default true,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),

  constraint app_contract_package_items_tenant_id_uidx unique (tenant_id, id),
  constraint app_contract_package_items_uq unique (tenant_id, package_id, contract_id),
  constraint app_contract_package_items_package_fk
    foreign key (tenant_id, package_id)
    references public.app_contract_packages (tenant_id, id)
    on delete cascade,
  constraint app_contract_package_items_contract_fk
    foreign key (tenant_id, contract_id)
    references public.app_contracts (tenant_id, id)
    on delete cascade
);

-- ===========================================================================
-- Signature envelopes / signers
-- ===========================================================================

create table if not exists public.app_signature_envelopes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid not null,
  contract_version_id uuid not null,
  status text not null default 'DRAFT',
  signature_policy_id uuid null,
  provider text not null,
  provider_envelope_id text null,
  sent_at timestamptz null,
  expires_at timestamptz null,
  completed_at timestamptz null,
  cancelled_at timestamptz null,
  document_hash_before_signing text null,
  document_hash_after_signing text null,
  evidence_file_id uuid null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  row_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text null,

  constraint app_signature_envelopes_tenant_id_uidx unique (tenant_id, id),
  constraint app_signature_envelopes_idempotency_uq unique (tenant_id, idempotency_key),
  constraint app_signature_envelopes_row_version_chk check (row_version >= 1),
  constraint app_signature_envelopes_status_chk
    check (status in (
      'DRAFT', 'READY', 'SENT', 'IN_PROGRESS', 'PARTIALLY_SIGNED', 'COMPLETED',
      'DECLINED', 'EXPIRED', 'CANCELLED', 'FAILED'
    )),
  constraint app_signature_envelopes_provider_nonempty_chk
    check (length(trim(provider)) > 0),
  constraint app_signature_envelopes_contract_fk
    foreign key (tenant_id, contract_id)
    references public.app_contracts (tenant_id, id)
    on delete cascade,
  constraint app_signature_envelopes_version_fk
    foreign key (tenant_id, contract_version_id)
    references public.app_contract_versions (tenant_id, id)
    on delete restrict,
  constraint app_signature_envelopes_policy_fk
    foreign key (tenant_id, signature_policy_id)
    references public.app_signature_policies (tenant_id, id)
    deferrable initially deferred
);

alter table public.app_contracts
  drop constraint if exists app_contracts_signature_envelope_fk;
alter table public.app_contracts
  add constraint app_contracts_signature_envelope_fk
  foreign key (tenant_id, signature_envelope_id)
  references public.app_signature_envelopes (tenant_id, id)
  deferrable initially deferred;

create table if not exists public.app_signature_signers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  envelope_id uuid not null,
  party_id uuid null,
  signer_order integer not null,
  signer_role text not null,
  name text not null,
  email text null,
  phone text null,
  document_number_hash text null,
  authentication_method text null,
  status text not null default 'PENDING',
  invited_at timestamptz null,
  viewed_at timestamptz null,
  authenticated_at timestamptz null,
  signed_at timestamptz null,
  declined_at timestamptz null,
  decline_reason text null,
  ip_address inet null,
  user_agent text null,
  geolocation jsonb null,
  signature_image_file_id uuid null,
  provider_signer_id text null,
  evidence_snapshot jsonb null,

  constraint app_signature_signers_tenant_id_uidx unique (tenant_id, id),
  constraint app_signature_signers_order_uq unique (tenant_id, envelope_id, signer_order),
  constraint app_signature_signers_name_nonempty_chk check (length(trim(name)) > 0),
  constraint app_signature_signers_order_chk check (signer_order >= 1),
  constraint app_signature_signers_status_chk
    check (status in (
      'PENDING', 'INVITED', 'DELIVERED', 'VIEWED', 'AUTHENTICATED',
      'SIGNED', 'DECLINED', 'FAILED', 'EXPIRED', 'CANCELLED'
    )),
  constraint app_signature_signers_auth_method_chk
    check (
      authentication_method is null
      or authentication_method in (
        'ON_SCREEN', 'OTP_EMAIL', 'OTP_SMS', 'SECURE_LINK',
        'UPLOAD', 'EXTERNAL_PROVIDER', 'DIGITAL_CERTIFICATE'
      )
    ),
  constraint app_signature_signers_envelope_fk
    foreign key (tenant_id, envelope_id)
    references public.app_signature_envelopes (tenant_id, id)
    on delete cascade,
  constraint app_signature_signers_party_fk
    foreign key (tenant_id, party_id)
    references public.app_contract_parties (tenant_id, id)
    deferrable initially deferred
);

-- ===========================================================================
-- Files (referência de storage — nunca data URL / binário)
-- ===========================================================================

create table if not exists public.app_contract_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid not null,
  contract_version_id uuid null,
  file_type text not null,
  storage_provider text not null,
  storage_bucket text null,
  storage_path text not null,
  original_name text null,
  mime_type text null,
  size_bytes bigint null,
  sha256 text null,
  encryption_status text null,
  retention_policy jsonb null,
  uploaded_by uuid null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null,

  constraint app_contract_files_tenant_id_uidx unique (tenant_id, id),
  constraint app_contract_files_type_chk
    check (file_type in (
      'GENERATED_PDF', 'SIGNED_PDF', 'EVIDENCE_REPORT', 'INTEGRITY_MANIFEST',
      'ATTACHMENT', 'IDENTIFICATION', 'ODONTOGRAM_IMAGE', 'SIGNATURE_IMAGE',
      'CLINICAL_IMAGE', 'FINANCIAL_ATTACHMENT', 'OTHER'
    )),
  constraint app_contract_files_path_nonempty_chk check (length(trim(storage_path)) > 0),
  constraint app_contract_files_provider_nonempty_chk check (length(trim(storage_provider)) > 0),
  constraint app_contract_files_no_data_uri_path_chk
    check (storage_path !~* '^data:'),
  constraint app_contract_files_size_chk check (size_bytes is null or size_bytes >= 0),
  constraint app_contract_files_encryption_chk
    check (encryption_status is null or encryption_status in ('none', 'at_rest', 'unknown')),
  constraint app_contract_files_contract_fk
    foreign key (tenant_id, contract_id)
    references public.app_contracts (tenant_id, id)
    on delete cascade,
  constraint app_contract_files_version_fk
    foreign key (tenant_id, contract_version_id)
    references public.app_contract_versions (tenant_id, id)
    on delete set null
);

-- evidence_file_id / signature_image_file_id / odontogram image_file_id FKs
alter table public.app_signature_envelopes
  drop constraint if exists app_signature_envelopes_evidence_file_fk;
alter table public.app_signature_envelopes
  add constraint app_signature_envelopes_evidence_file_fk
  foreign key (tenant_id, evidence_file_id)
  references public.app_contract_files (tenant_id, id)
  deferrable initially deferred;

alter table public.app_signature_signers
  drop constraint if exists app_signature_signers_signature_image_fk;
alter table public.app_signature_signers
  add constraint app_signature_signers_signature_image_fk
  foreign key (tenant_id, signature_image_file_id)
  references public.app_contract_files (tenant_id, id)
  deferrable initially deferred;

alter table public.app_contract_odontogram_snapshots
  drop constraint if exists app_contract_odontogram_snapshots_image_fk;
alter table public.app_contract_odontogram_snapshots
  add constraint app_contract_odontogram_snapshots_image_fk
  foreign key (tenant_id, image_file_id)
  references public.app_contract_files (tenant_id, id)
  deferrable initially deferred;

-- ===========================================================================
-- Audit append-only
-- ===========================================================================

create table if not exists public.app_contract_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid null,
  contract_version_id uuid null,
  envelope_id uuid null,
  event_type text not null,
  actor_type text not null,
  actor_id uuid null,
  actor_name text null,
  source text not null,
  request_id text null,
  ip_address inet null,
  user_agent text null,
  metadata jsonb not null default '{}'::jsonb,
  previous_event_hash text null,
  event_hash text null,
  occurred_at timestamptz not null default now(),

  constraint app_contract_audit_events_tenant_id_uidx unique (tenant_id, id),
  constraint app_contract_audit_events_actor_type_chk
    check (actor_type in ('USER', 'PATIENT', 'SYSTEM', 'PROVIDER', 'SUPPORT')),
  constraint app_contract_audit_events_source_chk
    check (source in ('APP', 'PUBLIC_SIGN', 'API', 'WEBHOOK', 'WORKER', 'LEGACY', 'SUPPORT')),
  constraint app_contract_audit_events_metadata_object_chk
    check (jsonb_typeof(metadata) = 'object'),
  constraint app_contract_audit_events_contract_fk
    foreign key (tenant_id, contract_id)
    references public.app_contracts (tenant_id, id)
    on delete set null,
  constraint app_contract_audit_events_version_fk
    foreign key (tenant_id, contract_version_id)
    references public.app_contract_versions (tenant_id, id)
    on delete set null,
  constraint app_contract_audit_events_envelope_fk
    foreign key (tenant_id, envelope_id)
    references public.app_signature_envelopes (tenant_id, id)
    on delete set null
);

drop trigger if exists trg_app_contract_audit_events_no_update on public.app_contract_audit_events;
create trigger trg_app_contract_audit_events_no_update
before update on public.app_contract_audit_events
for each row execute function public.app_contract_reject_audit_mutation();

drop trigger if exists trg_app_contract_audit_events_no_delete on public.app_contract_audit_events;
create trigger trg_app_contract_audit_events_no_delete
before delete on public.app_contract_audit_events
for each row execute function public.app_contract_reject_audit_mutation();

-- ===========================================================================
-- Idempotency keys (preparação futura — sem fluxos ligados)
-- ===========================================================================

create table if not exists public.app_contract_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  scope text not null,
  idempotency_key text not null,
  resource_type text not null,
  resource_id uuid null,
  request_hash text null,
  created_at timestamptz not null default now(),
  expires_at timestamptz null,

  constraint app_contract_idempotency_keys_uq unique (tenant_id, scope, idempotency_key),
  constraint app_contract_idempotency_keys_scope_chk
    check (scope in (
      'CREATE_FROM_BUDGET',
      'CREATE_PACKAGE',
      'CREATE_ENVELOPE',
      'WEBHOOK',
      'FINANCIAL_ACTIVATION',
      'PRONTUARIO_REGISTER',
      'GENERATE_PDF'
    )),
  constraint app_contract_idempotency_keys_key_nonempty_chk
    check (length(trim(idempotency_key)) > 0)
);

comment on table public.app_contract_idempotency_keys is
  'Phase 10.3 — preparação de idempotência. Sem wiring de fluxos nesta fase.';

-- ===========================================================================
-- Índices
-- ===========================================================================

create index if not exists app_contract_templates_tenant_status_idx
  on public.app_contract_templates (tenant_id, status);
create index if not exists app_contract_templates_tenant_published_idx
  on public.app_contract_templates (tenant_id, updated_at desc)
  where status = 'PUBLISHED' and archived_at is null;

create index if not exists app_contract_template_versions_tenant_template_idx
  on public.app_contract_template_versions (tenant_id, template_id);

create index if not exists app_contracts_tenant_status_idx
  on public.app_contracts (tenant_id, status);
create index if not exists app_contracts_tenant_patient_idx
  on public.app_contracts (tenant_id, patient_id);
create index if not exists app_contracts_tenant_budget_idx
  on public.app_contracts (tenant_id, budget_id)
  where budget_id is not null;
create index if not exists app_contracts_tenant_created_idx
  on public.app_contracts (tenant_id, created_at desc);
create index if not exists app_contracts_tenant_active_idx
  on public.app_contracts (tenant_id, updated_at desc)
  where status not in ('CANCELLED', 'SUPERSEDED', 'TERMINATED', 'VOIDED', 'EXPIRED', 'DECLINED');

create index if not exists app_contract_versions_tenant_contract_idx
  on public.app_contract_versions (tenant_id, contract_id);

create index if not exists app_contract_parties_tenant_contract_idx
  on public.app_contract_parties (tenant_id, contract_id);

create index if not exists app_contract_treatments_tenant_version_idx
  on public.app_contract_treatments (tenant_id, contract_version_id);

create index if not exists app_contract_packages_tenant_patient_idx
  on public.app_contract_packages (tenant_id, patient_id);
create index if not exists app_contract_packages_tenant_budget_idx
  on public.app_contract_packages (tenant_id, budget_id)
  where budget_id is not null;

create index if not exists app_signature_envelopes_tenant_status_idx
  on public.app_signature_envelopes (tenant_id, status);
create index if not exists app_signature_envelopes_tenant_contract_idx
  on public.app_signature_envelopes (tenant_id, contract_id);
create index if not exists app_signature_envelopes_pending_idx
  on public.app_signature_envelopes (tenant_id, expires_at)
  where status in ('SENT', 'IN_PROGRESS', 'PARTIALLY_SIGNED', 'READY');

create index if not exists app_signature_signers_tenant_envelope_idx
  on public.app_signature_signers (tenant_id, envelope_id);
create index if not exists app_signature_signers_pending_idx
  on public.app_signature_signers (tenant_id, status)
  where status in ('PENDING', 'INVITED', 'DELIVERED', 'VIEWED', 'AUTHENTICATED');

create index if not exists app_contract_files_tenant_contract_idx
  on public.app_contract_files (tenant_id, contract_id);
create index if not exists app_contract_files_not_deleted_idx
  on public.app_contract_files (tenant_id, created_at desc)
  where deleted_at is null;

create index if not exists app_contract_audit_events_tenant_contract_idx
  on public.app_contract_audit_events (tenant_id, contract_id);
create index if not exists app_contract_audit_events_tenant_type_idx
  on public.app_contract_audit_events (tenant_id, event_type);
create index if not exists app_contract_audit_events_tenant_occurred_idx
  on public.app_contract_audit_events (tenant_id, occurred_at desc);

create index if not exists app_contract_idempotency_keys_tenant_scope_idx
  on public.app_contract_idempotency_keys (tenant_id, scope);

-- ===========================================================================
-- ROLLBACK NOTES (manual)
-- ===========================================================================
-- drop trigger/function/table na ordem inversa das dependências:
--   app_contract_idempotency_keys
--   app_contract_audit_events (+ triggers/functions reject_audit)
--   app_signature_signers
--   app_signature_envelopes (após dropar FK em app_contracts.signature_envelope_id)
--   app_contract_files
--   app_contract_package_items / app_contract_packages
--   app_contract_consents / financial_snapshots / odontogram_snapshots
--   app_contract_treatments / app_contract_parties
--   app_contract_versions (após dropar FK current_version em app_contracts)
--   app_contracts
--   app_contract_template_versions / app_contract_templates
--   app_signature_policies
--   functions: app_contract_reject_*
-- NÃO tocar em: contract_templates, contract_blocks, generated_contracts, contract_audit_logs (006).
