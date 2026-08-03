-- 025: public.patients + satélites Wave 1 (phones, documents, records)
-- Phase 9.4A Wave 1 — fundação SQL. IndexedDB permanece SSOT até cutover futuro.
-- NÃO EXECUTAR automaticamente em remoto. Dry-run local somente sob autorização.
--
-- Escopo:
--   public.patients
--   public.patient_phones
--   public.patient_documents
--   public.patient_records
--
-- Fora de escopo nesta wave:
--   backfill, dual-write, cutover, patient_uuid em appointments/financial/crm,
--   addresses, insurances, odontogram, journey, budgets, files/storage.
--
-- Compatibilidade:
--   legacy_id = patient-<uuid> (e phone-*/record-* nos satélites)
--   consumers (appointments/financial/crm/contracts) mantêm patient_id text opaco.
--
-- Pré-requisitos: public.tenants, public.touch_updated_at() (005),
--   app_user_can_access_tenant / app_user_is_tenant_admin (009/012).
--
-- ROLLBACK (manual — ordem):
--   drop policy if exists patient_records_select_tenant on public.patient_records;
--   drop policy if exists patient_records_modify_admin on public.patient_records;
--   drop policy if exists patient_documents_select_tenant on public.patient_documents;
--   drop policy if exists patient_documents_modify_admin on public.patient_documents;
--   drop policy if exists patient_phones_select_tenant on public.patient_phones;
--   drop policy if exists patient_phones_modify_admin on public.patient_phones;
--   drop policy if exists patients_select_tenant on public.patients;
--   drop policy if exists patients_modify_admin on public.patients;
--   drop trigger if exists trg_patient_records_validate on public.patient_records;
--   drop trigger if exists trg_patient_records_touch_updated_at on public.patient_records;
--   drop trigger if exists trg_patient_documents_validate on public.patient_documents;
--   drop trigger if exists trg_patient_documents_touch_updated_at on public.patient_documents;
--   drop trigger if exists trg_patient_phones_validate on public.patient_phones;
--   drop trigger if exists trg_patient_phones_touch_updated_at on public.patient_phones;
--   drop trigger if exists trg_patients_validate on public.patients;
--   drop trigger if exists trg_patients_touch_updated_at on public.patients;
--   drop function if exists public.validate_patient_records_row();
--   drop function if exists public.validate_patient_documents_row();
--   drop function if exists public.validate_patient_phones_row();
--   drop function if exists public.validate_patients_row();
--   drop table if exists public.patient_records cascade;
--   drop table if exists public.patient_documents cascade;
--   drop table if exists public.patient_phones cascade;
--   drop table if exists public.patients cascade;

-- ---------------------------------------------------------------------------
-- public.patients
-- ---------------------------------------------------------------------------

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  -- ID legado IndexedDB (patient-<uuid>) — obrigatório para compatibilidade
  legacy_id text not null,
  guid uuid not null default gen_random_uuid(),

  full_name text not null,
  nickname text not null default '',
  social_name text not null default '',
  sex text not null default '',
  birth_date date null,
  cpf text null,

  -- URL Storage ou HTTPS — nunca data URI (base64)
  photo_url text null,

  status text not null default 'active',
  blocked boolean not null default false,
  block_reason text not null default '',
  block_at timestamptz null,

  tags jsonb not null default '[]'::jsonb,
  lead_source text not null default '',

  has_financial_responsible boolean not null default false,
  dependent_full_name text not null default '',

  has_pending_data boolean not null default false,
  pending_fields jsonb not null default '[]'::jsonb,
  pending_critical_fields jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  deleted_at timestamptz null,

  constraint patients_status_chk
    check (status in ('active', 'inactive')),

  constraint patients_legacy_id_nonempty_chk
    check (length(trim(legacy_id)) > 0),

  constraint patients_photo_url_no_data_uri_chk
    check (photo_url is null or photo_url !~* '^data:'),

  constraint patients_cpf_digits_chk
    check (cpf is null or cpf ~ '^[0-9]{11}$'),

  constraint patients_tags_is_array_chk
    check (jsonb_typeof(tags) = 'array'),

  constraint patients_pending_fields_is_array_chk
    check (jsonb_typeof(pending_fields) = 'array'),

  constraint patients_pending_critical_fields_is_array_chk
    check (jsonb_typeof(pending_critical_fields) = 'array')
);

comment on table public.patients is
  'Cadastro de pacientes SSOT (Phase 9.4A). IndexedDB permanece autoridade até cutover.';
comment on column public.patients.legacy_id is
  'ID legado IndexedDB (patient-*). Obrigatório para refs opacas em agenda/financeiro/crm/contratos.';
comment on column public.patients.photo_url is
  'URL Supabase Storage ou HTTPS. Proibido base64/data URI.';
comment on column public.patients.cpf is
  'CPF somente dígitos (11). Unicidade por tenant quando presente.';

create unique index if not exists patients_tenant_legacy_id_uq
  on public.patients (tenant_id, legacy_id)
  where deleted_at is null;

create unique index if not exists patients_tenant_cpf_uq
  on public.patients (tenant_id, cpf)
  where deleted_at is null and cpf is not null;

create index if not exists patients_tenant_id_idx
  on public.patients (tenant_id)
  where deleted_at is null;

create index if not exists patients_tenant_status_idx
  on public.patients (tenant_id, status)
  where deleted_at is null;

create index if not exists patients_tenant_name_idx
  on public.patients (tenant_id, lower(full_name))
  where deleted_at is null;

create index if not exists patients_tenant_updated_at_idx
  on public.patients (tenant_id, updated_at desc)
  where deleted_at is null;

create or replace function public.validate_patients_row()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'patients.tenant_id é imutável (id=%)', old.id
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.legacy_id is distinct from old.legacy_id then
    raise exception 'patients.legacy_id é imutável (id=%)', old.id
      using errcode = '23514';
  end if;

  new.legacy_id := nullif(trim(new.legacy_id), '');
  new.full_name := nullif(trim(new.full_name), '');
  new.nickname := coalesce(trim(new.nickname), '');
  new.social_name := coalesce(trim(new.social_name), '');
  new.sex := coalesce(trim(new.sex), '');
  new.cpf := nullif(regexp_replace(coalesce(new.cpf, ''), '\D', '', 'g'), '');
  new.photo_url := nullif(trim(new.photo_url), '');
  new.block_reason := coalesce(trim(new.block_reason), '');
  new.lead_source := coalesce(trim(new.lead_source), '');
  new.dependent_full_name := coalesce(trim(new.dependent_full_name), '');
  new.updated_at := now();

  if new.legacy_id is null then
    raise exception 'patients.legacy_id é obrigatório'
      using errcode = '23514';
  end if;

  if new.full_name is null then
    raise exception 'patients.full_name é obrigatório'
      using errcode = '23514';
  end if;

  if new.cpf is not null and length(new.cpf) <> 11 then
    raise exception 'patients.cpf deve ter 11 dígitos'
      using errcode = '23514';
  end if;

  if new.photo_url is not null and new.photo_url ~* '^data:' then
    raise exception 'patients.photo_url não pode ser data URI / base64'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_patients_validate on public.patients;
create trigger trg_patients_validate
before insert or update on public.patients
for each row execute function public.validate_patients_row();

drop trigger if exists trg_patients_touch_updated_at on public.patients;
create trigger trg_patients_touch_updated_at
before update on public.patients
for each row execute function public.touch_updated_at();

alter table public.patients enable row level security;

revoke all on table public.patients from anon, authenticated;
grant select, insert, update, delete on table public.patients to authenticated;

drop policy if exists patients_select_tenant on public.patients;
drop policy if exists patients_modify_admin on public.patients;

create policy patients_select_tenant on public.patients
  for select
  using (
    auth.uid() is not null
    and deleted_at is null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy patients_modify_admin on public.patients
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- ---------------------------------------------------------------------------
-- public.patient_phones
-- ---------------------------------------------------------------------------

create table if not exists public.patient_phones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,

  legacy_id text not null,

  type text not null default '',
  country_code text not null default '55',
  ddd text not null default '',
  number text not null default '',
  is_whatsapp boolean not null default false,
  is_primary boolean not null default false,
  e164 text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,

  constraint patient_phones_legacy_id_nonempty_chk
    check (length(trim(legacy_id)) > 0)
);

comment on table public.patient_phones is
  'Telefones do paciente (1:N). legacy_id = phone-* do IndexedDB.';

create unique index if not exists patient_phones_tenant_legacy_id_uq
  on public.patient_phones (tenant_id, legacy_id)
  where deleted_at is null;

create index if not exists patient_phones_tenant_patient_idx
  on public.patient_phones (tenant_id, patient_id)
  where deleted_at is null;

create index if not exists patient_phones_tenant_e164_idx
  on public.patient_phones (tenant_id, e164)
  where deleted_at is null and e164 <> '';

create unique index if not exists patient_phones_one_primary_uq
  on public.patient_phones (tenant_id, patient_id)
  where deleted_at is null and is_primary = true;

create or replace function public.validate_patient_phones_row()
returns trigger
language plpgsql
as $$
declare
  v_patient_tenant uuid;
begin
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'patient_phones.tenant_id é imutável (id=%)', old.id
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.patient_id is distinct from old.patient_id then
    raise exception 'patient_phones.patient_id é imutável (id=%)', old.id
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.legacy_id is distinct from old.legacy_id then
    raise exception 'patient_phones.legacy_id é imutável (id=%)', old.id
      using errcode = '23514';
  end if;

  select p.tenant_id into v_patient_tenant
  from public.patients p
  where p.id = new.patient_id;

  if v_patient_tenant is null then
    raise exception 'patient_phones.patient_id inválido'
      using errcode = '23503';
  end if;

  if new.tenant_id is distinct from v_patient_tenant then
    raise exception 'patient_phones.tenant_id deve coincidir com patients.tenant_id'
      using errcode = '23514';
  end if;

  new.legacy_id := nullif(trim(new.legacy_id), '');
  new.type := coalesce(trim(new.type), '');
  new.country_code := coalesce(nullif(trim(new.country_code), ''), '55');
  new.ddd := coalesce(regexp_replace(new.ddd, '\D', '', 'g'), '');
  new.number := coalesce(regexp_replace(new.number, '\D', '', 'g'), '');
  new.e164 := coalesce(trim(new.e164), '');
  new.updated_at := now();

  if new.legacy_id is null then
    raise exception 'patient_phones.legacy_id é obrigatório'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_patient_phones_validate on public.patient_phones;
create trigger trg_patient_phones_validate
before insert or update on public.patient_phones
for each row execute function public.validate_patient_phones_row();

drop trigger if exists trg_patient_phones_touch_updated_at on public.patient_phones;
create trigger trg_patient_phones_touch_updated_at
before update on public.patient_phones
for each row execute function public.touch_updated_at();

alter table public.patient_phones enable row level security;

revoke all on table public.patient_phones from anon, authenticated;
grant select, insert, update, delete on table public.patient_phones to authenticated;

drop policy if exists patient_phones_select_tenant on public.patient_phones;
drop policy if exists patient_phones_modify_admin on public.patient_phones;

create policy patient_phones_select_tenant on public.patient_phones
  for select
  using (
    auth.uid() is not null
    and deleted_at is null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy patient_phones_modify_admin on public.patient_phones
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- ---------------------------------------------------------------------------
-- public.patient_documents (1:1)
-- ---------------------------------------------------------------------------

create table if not exists public.patient_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,

  rg text not null default '',
  pis text not null default '',
  municipal_registration text not null default '',
  personal_email text not null default '',
  marital_status text not null default '',
  responsible_name text not null default '',
  responsible_relation text not null default '',
  responsible_phone text not null default '',
  responsible_cpf text not null default '',
  mother_name text not null default '',
  father_name text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

comment on table public.patient_documents is
  'Documentos / responsável do paciente (1:1). Shape alinhado a patientDocuments IDB.';

create unique index if not exists patient_documents_tenant_patient_uq
  on public.patient_documents (tenant_id, patient_id)
  where deleted_at is null;

create index if not exists patient_documents_tenant_id_idx
  on public.patient_documents (tenant_id)
  where deleted_at is null;

create or replace function public.validate_patient_documents_row()
returns trigger
language plpgsql
as $$
declare
  v_patient_tenant uuid;
begin
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'patient_documents.tenant_id é imutável (id=%)', old.id
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.patient_id is distinct from old.patient_id then
    raise exception 'patient_documents.patient_id é imutável (id=%)', old.id
      using errcode = '23514';
  end if;

  select p.tenant_id into v_patient_tenant
  from public.patients p
  where p.id = new.patient_id;

  if v_patient_tenant is null then
    raise exception 'patient_documents.patient_id inválido'
      using errcode = '23503';
  end if;

  if new.tenant_id is distinct from v_patient_tenant then
    raise exception 'patient_documents.tenant_id deve coincidir com patients.tenant_id'
      using errcode = '23514';
  end if;

  new.rg := coalesce(trim(new.rg), '');
  new.pis := coalesce(trim(new.pis), '');
  new.municipal_registration := coalesce(trim(new.municipal_registration), '');
  new.personal_email := coalesce(lower(trim(new.personal_email)), '');
  new.marital_status := coalesce(trim(new.marital_status), '');
  new.responsible_name := coalesce(trim(new.responsible_name), '');
  new.responsible_relation := coalesce(trim(new.responsible_relation), '');
  new.responsible_phone := coalesce(trim(new.responsible_phone), '');
  new.responsible_cpf := coalesce(regexp_replace(new.responsible_cpf, '\D', '', 'g'), '');
  new.mother_name := coalesce(trim(new.mother_name), '');
  new.father_name := coalesce(trim(new.father_name), '');
  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists trg_patient_documents_validate on public.patient_documents;
create trigger trg_patient_documents_validate
before insert or update on public.patient_documents
for each row execute function public.validate_patient_documents_row();

drop trigger if exists trg_patient_documents_touch_updated_at on public.patient_documents;
create trigger trg_patient_documents_touch_updated_at
before update on public.patient_documents
for each row execute function public.touch_updated_at();

alter table public.patient_documents enable row level security;

revoke all on table public.patient_documents from anon, authenticated;
grant select, insert, update, delete on table public.patient_documents to authenticated;

drop policy if exists patient_documents_select_tenant on public.patient_documents;
drop policy if exists patient_documents_modify_admin on public.patient_documents;

create policy patient_documents_select_tenant on public.patient_documents
  for select
  using (
    auth.uid() is not null
    and deleted_at is null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy patient_documents_modify_admin on public.patient_documents
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- ---------------------------------------------------------------------------
-- public.patient_records (1:1 prontuário administrativo)
-- ---------------------------------------------------------------------------

create table if not exists public.patient_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,

  legacy_id text not null,

  record_number text not null default '',
  preferred_dentist text not null default '',
  patient_type text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,

  constraint patient_records_legacy_id_nonempty_chk
    check (length(trim(legacy_id)) > 0)
);

comment on table public.patient_records is
  'Prontuário administrativo (nº / preferências). legacy_id = record-* do IndexedDB. Clínico (odontogram etc.) fora de escopo.';

create unique index if not exists patient_records_tenant_legacy_id_uq
  on public.patient_records (tenant_id, legacy_id)
  where deleted_at is null;

create unique index if not exists patient_records_tenant_patient_uq
  on public.patient_records (tenant_id, patient_id)
  where deleted_at is null;

create unique index if not exists patient_records_tenant_record_number_uq
  on public.patient_records (tenant_id, record_number)
  where deleted_at is null and record_number <> '';

create index if not exists patient_records_tenant_id_idx
  on public.patient_records (tenant_id)
  where deleted_at is null;

create or replace function public.validate_patient_records_row()
returns trigger
language plpgsql
as $$
declare
  v_patient_tenant uuid;
begin
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'patient_records.tenant_id é imutável (id=%)', old.id
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.patient_id is distinct from old.patient_id then
    raise exception 'patient_records.patient_id é imutável (id=%)', old.id
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.legacy_id is distinct from old.legacy_id then
    raise exception 'patient_records.legacy_id é imutável (id=%)', old.id
      using errcode = '23514';
  end if;

  select p.tenant_id into v_patient_tenant
  from public.patients p
  where p.id = new.patient_id;

  if v_patient_tenant is null then
    raise exception 'patient_records.patient_id inválido'
      using errcode = '23503';
  end if;

  if new.tenant_id is distinct from v_patient_tenant then
    raise exception 'patient_records.tenant_id deve coincidir com patients.tenant_id'
      using errcode = '23514';
  end if;

  new.legacy_id := nullif(trim(new.legacy_id), '');
  new.record_number := coalesce(trim(new.record_number), '');
  new.preferred_dentist := coalesce(trim(new.preferred_dentist), '');
  new.patient_type := coalesce(trim(new.patient_type), '');
  new.updated_at := now();

  if new.legacy_id is null then
    raise exception 'patient_records.legacy_id é obrigatório'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_patient_records_validate on public.patient_records;
create trigger trg_patient_records_validate
before insert or update on public.patient_records
for each row execute function public.validate_patient_records_row();

drop trigger if exists trg_patient_records_touch_updated_at on public.patient_records;
create trigger trg_patient_records_touch_updated_at
before update on public.patient_records
for each row execute function public.touch_updated_at();

alter table public.patient_records enable row level security;

revoke all on table public.patient_records from anon, authenticated;
grant select, insert, update, delete on table public.patient_records to authenticated;

drop policy if exists patient_records_select_tenant on public.patient_records;
drop policy if exists patient_records_modify_admin on public.patient_records;

create policy patient_records_select_tenant on public.patient_records
  for select
  using (
    auth.uid() is not null
    and deleted_at is null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy patient_records_modify_admin on public.patient_records
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );
