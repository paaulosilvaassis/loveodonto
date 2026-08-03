-- 027: Pacientes Wave 2 — satélites administrativos (detalhes de cadastro)
-- Phase 9.4A Wave 2. IndexedDB permanece SSOT. Sem dual-write / cutover / flags.
--
-- Tabelas:
--   patient_birth_details (1:1)
--   patient_education (1:1)
--   patient_addresses (1:N)
--   patient_relationships (1:1 agregado)
--   patient_insurances (1:N)
--   patient_access (1:1)
--   patient_activity_summary (1:1)
--
-- RLS: helpers canônicos 026 (membership fail-closed + app_metadata).
-- DELETE físico: NÃO concedido (soft delete via deleted_at).
-- Fora de escopo: charts, anamnese, odontograma, files, journey, budgets.

-- ---------------------------------------------------------------------------
-- 1) patient_birth_details (1:1) — patientBirth IDB
-- ---------------------------------------------------------------------------

create table if not exists public.patient_birth_details (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  nationality text not null default '',
  birth_city text not null default '',
  birth_state text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

comment on table public.patient_birth_details is
  'Naturalidade do paciente (1:1). birth_date permanece em public.patients.';

create unique index if not exists patient_birth_details_tenant_patient_uq
  on public.patient_birth_details (tenant_id, patient_id)
  where deleted_at is null;

create index if not exists patient_birth_details_tenant_idx
  on public.patient_birth_details (tenant_id)
  where deleted_at is null;

create or replace function public.validate_patient_birth_details_row()
returns trigger
language plpgsql
as $$
declare
  v_patient_tenant uuid;
begin
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'patient_birth_details.tenant_id é imutável' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.patient_id is distinct from old.patient_id then
    raise exception 'patient_birth_details.patient_id é imutável' using errcode = '23514';
  end if;
  select p.tenant_id into v_patient_tenant from public.patients p where p.id = new.patient_id;
  if v_patient_tenant is null then
    raise exception 'patient_birth_details.patient_id inválido' using errcode = '23503';
  end if;
  if new.tenant_id is distinct from v_patient_tenant then
    raise exception 'patient_birth_details.tenant_id deve coincidir com patients.tenant_id'
      using errcode = '23514';
  end if;
  new.nationality := coalesce(trim(new.nationality), '');
  new.birth_city := coalesce(trim(new.birth_city), '');
  new.birth_state := coalesce(upper(trim(new.birth_state)), '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_patient_birth_details_validate on public.patient_birth_details;
create trigger trg_patient_birth_details_validate
before insert or update on public.patient_birth_details
for each row execute function public.validate_patient_birth_details_row();

drop trigger if exists trg_patient_birth_details_touch on public.patient_birth_details;
create trigger trg_patient_birth_details_touch
before update on public.patient_birth_details
for each row execute function public.touch_updated_at();

alter table public.patient_birth_details enable row level security;
alter table public.patient_birth_details force row level security;
revoke all on table public.patient_birth_details from anon, authenticated;
grant select, insert, update on table public.patient_birth_details to authenticated;

drop policy if exists patient_birth_details_select_tenant on public.patient_birth_details;
drop policy if exists patient_birth_details_modify_admin on public.patient_birth_details;

create policy patient_birth_details_select_tenant on public.patient_birth_details
  for select using (
    auth.uid() is not null
    and deleted_at is null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy patient_birth_details_modify_admin on public.patient_birth_details
  for all using (
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
-- 2) patient_education (1:1)
-- ---------------------------------------------------------------------------

create table if not exists public.patient_education (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  education_level text not null default '',
  profession text not null default '',
  other_profession text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create unique index if not exists patient_education_tenant_patient_uq
  on public.patient_education (tenant_id, patient_id)
  where deleted_at is null;

create or replace function public.validate_patient_education_row()
returns trigger language plpgsql as $$
declare v_patient_tenant uuid;
begin
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'patient_education.tenant_id é imutável' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.patient_id is distinct from old.patient_id then
    raise exception 'patient_education.patient_id é imutável' using errcode = '23514';
  end if;
  select p.tenant_id into v_patient_tenant from public.patients p where p.id = new.patient_id;
  if v_patient_tenant is null then
    raise exception 'patient_education.patient_id inválido' using errcode = '23503';
  end if;
  if new.tenant_id is distinct from v_patient_tenant then
    raise exception 'patient_education.tenant_id deve coincidir com patients.tenant_id'
      using errcode = '23514';
  end if;
  new.education_level := coalesce(trim(new.education_level), '');
  new.profession := coalesce(trim(new.profession), '');
  new.other_profession := coalesce(trim(new.other_profession), '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_patient_education_validate on public.patient_education;
create trigger trg_patient_education_validate
before insert or update on public.patient_education
for each row execute function public.validate_patient_education_row();

drop trigger if exists trg_patient_education_touch on public.patient_education;
create trigger trg_patient_education_touch
before update on public.patient_education
for each row execute function public.touch_updated_at();

alter table public.patient_education enable row level security;
alter table public.patient_education force row level security;
revoke all on table public.patient_education from anon, authenticated;
grant select, insert, update on table public.patient_education to authenticated;

drop policy if exists patient_education_select_tenant on public.patient_education;
drop policy if exists patient_education_modify_admin on public.patient_education;

create policy patient_education_select_tenant on public.patient_education
  for select using (
    auth.uid() is not null and deleted_at is null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy patient_education_modify_admin on public.patient_education
  for all using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- ---------------------------------------------------------------------------
-- 3) patient_addresses (1:N)
-- ---------------------------------------------------------------------------

create table if not exists public.patient_addresses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  legacy_id text not null,
  type text not null default '',
  cep text not null default '',
  street text not null default '',
  number text not null default '',
  complement text not null default '',
  neighborhood text not null default '',
  city text not null default '',
  state text not null default '',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint patient_addresses_legacy_id_nonempty_chk
    check (length(trim(legacy_id)) > 0)
);

create unique index if not exists patient_addresses_tenant_legacy_id_uq
  on public.patient_addresses (tenant_id, legacy_id)
  where deleted_at is null;

create index if not exists patient_addresses_tenant_patient_idx
  on public.patient_addresses (tenant_id, patient_id)
  where deleted_at is null;

create unique index if not exists patient_addresses_one_primary_uq
  on public.patient_addresses (tenant_id, patient_id)
  where deleted_at is null and is_primary = true;

create or replace function public.validate_patient_addresses_row()
returns trigger language plpgsql as $$
declare v_patient_tenant uuid;
begin
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'patient_addresses.tenant_id é imutável' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.patient_id is distinct from old.patient_id then
    raise exception 'patient_addresses.patient_id é imutável' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.legacy_id is distinct from old.legacy_id then
    raise exception 'patient_addresses.legacy_id é imutável' using errcode = '23514';
  end if;
  select p.tenant_id into v_patient_tenant from public.patients p where p.id = new.patient_id;
  if v_patient_tenant is null then
    raise exception 'patient_addresses.patient_id inválido' using errcode = '23503';
  end if;
  if new.tenant_id is distinct from v_patient_tenant then
    raise exception 'patient_addresses.tenant_id deve coincidir com patients.tenant_id'
      using errcode = '23514';
  end if;
  new.legacy_id := nullif(trim(new.legacy_id), '');
  if new.legacy_id is null then
    raise exception 'patient_addresses.legacy_id é obrigatório' using errcode = '23514';
  end if;
  new.type := coalesce(trim(new.type), '');
  new.cep := coalesce(regexp_replace(new.cep, '\D', '', 'g'), '');
  new.street := coalesce(trim(new.street), '');
  new.number := coalesce(trim(new.number), '');
  new.complement := coalesce(trim(new.complement), '');
  new.neighborhood := coalesce(trim(new.neighborhood), '');
  new.city := coalesce(trim(new.city), '');
  new.state := coalesce(upper(trim(new.state)), '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_patient_addresses_validate on public.patient_addresses;
create trigger trg_patient_addresses_validate
before insert or update on public.patient_addresses
for each row execute function public.validate_patient_addresses_row();

drop trigger if exists trg_patient_addresses_touch on public.patient_addresses;
create trigger trg_patient_addresses_touch
before update on public.patient_addresses
for each row execute function public.touch_updated_at();

alter table public.patient_addresses enable row level security;
alter table public.patient_addresses force row level security;
revoke all on table public.patient_addresses from anon, authenticated;
grant select, insert, update on table public.patient_addresses to authenticated;

drop policy if exists patient_addresses_select_tenant on public.patient_addresses;
drop policy if exists patient_addresses_modify_admin on public.patient_addresses;

create policy patient_addresses_select_tenant on public.patient_addresses
  for select using (
    auth.uid() is not null and deleted_at is null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy patient_addresses_modify_admin on public.patient_addresses
  for all using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- ---------------------------------------------------------------------------
-- 4) patient_relationships (1:1 agregado)
-- ---------------------------------------------------------------------------

create table if not exists public.patient_relationships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  emergency_contact_name text not null default '',
  emergency_contact_phone text not null default '',
  financial_responsible_name text not null default '',
  financial_responsible_relation text not null default '',
  dependents jsonb not null default '[]'::jsonb,
  notes text not null default '',
  marital_status text not null default '',
  preferred_contact_period text not null default '',
  preferred_contact_channel text not null default '',
  lgpd_whatsapp_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint patient_relationships_dependents_is_array_chk
    check (jsonb_typeof(dependents) = 'array')
);

create unique index if not exists patient_relationships_tenant_patient_uq
  on public.patient_relationships (tenant_id, patient_id)
  where deleted_at is null;

create or replace function public.validate_patient_relationships_row()
returns trigger language plpgsql as $$
declare v_patient_tenant uuid;
begin
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'patient_relationships.tenant_id é imutável' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.patient_id is distinct from old.patient_id then
    raise exception 'patient_relationships.patient_id é imutável' using errcode = '23514';
  end if;
  select p.tenant_id into v_patient_tenant from public.patients p where p.id = new.patient_id;
  if v_patient_tenant is null then
    raise exception 'patient_relationships.patient_id inválido' using errcode = '23503';
  end if;
  if new.tenant_id is distinct from v_patient_tenant then
    raise exception 'patient_relationships.tenant_id deve coincidir com patients.tenant_id'
      using errcode = '23514';
  end if;
  new.emergency_contact_name := coalesce(trim(new.emergency_contact_name), '');
  new.emergency_contact_phone := coalesce(trim(new.emergency_contact_phone), '');
  new.financial_responsible_name := coalesce(trim(new.financial_responsible_name), '');
  new.financial_responsible_relation := coalesce(trim(new.financial_responsible_relation), '');
  new.notes := coalesce(trim(new.notes), '');
  new.marital_status := coalesce(trim(new.marital_status), '');
  new.preferred_contact_period := coalesce(trim(new.preferred_contact_period), '');
  new.preferred_contact_channel := coalesce(trim(new.preferred_contact_channel), '');
  new.dependents := coalesce(new.dependents, '[]'::jsonb);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_patient_relationships_validate on public.patient_relationships;
create trigger trg_patient_relationships_validate
before insert or update on public.patient_relationships
for each row execute function public.validate_patient_relationships_row();

drop trigger if exists trg_patient_relationships_touch on public.patient_relationships;
create trigger trg_patient_relationships_touch
before update on public.patient_relationships
for each row execute function public.touch_updated_at();

alter table public.patient_relationships enable row level security;
alter table public.patient_relationships force row level security;
revoke all on table public.patient_relationships from anon, authenticated;
grant select, insert, update on table public.patient_relationships to authenticated;

drop policy if exists patient_relationships_select_tenant on public.patient_relationships;
drop policy if exists patient_relationships_modify_admin on public.patient_relationships;

create policy patient_relationships_select_tenant on public.patient_relationships
  for select using (
    auth.uid() is not null and deleted_at is null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy patient_relationships_modify_admin on public.patient_relationships
  for all using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- ---------------------------------------------------------------------------
-- 5) patient_insurances (1:N)
-- ---------------------------------------------------------------------------

create table if not exists public.patient_insurances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  legacy_id text not null,
  insurance_name text not null default '',
  plan_name text not null default '',
  membership_number text not null default '',
  validity text not null default '',
  is_holder boolean not null default true,
  is_primary boolean not null default false,
  company_partner text not null default '',
  provider_id text not null default '',
  plan_id text not null default '',
  holder_cpf text not null default '',
  status text not null default 'ativo',
  extra_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint patient_insurances_legacy_id_nonempty_chk
    check (length(trim(legacy_id)) > 0),
  constraint patient_insurances_extra_data_object_chk
    check (jsonb_typeof(extra_data) = 'object')
);

create unique index if not exists patient_insurances_tenant_legacy_id_uq
  on public.patient_insurances (tenant_id, legacy_id)
  where deleted_at is null;

create index if not exists patient_insurances_tenant_patient_idx
  on public.patient_insurances (tenant_id, patient_id)
  where deleted_at is null;

create or replace function public.validate_patient_insurances_row()
returns trigger language plpgsql as $$
declare v_patient_tenant uuid;
begin
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'patient_insurances.tenant_id é imutável' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.patient_id is distinct from old.patient_id then
    raise exception 'patient_insurances.patient_id é imutável' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.legacy_id is distinct from old.legacy_id then
    raise exception 'patient_insurances.legacy_id é imutável' using errcode = '23514';
  end if;
  select p.tenant_id into v_patient_tenant from public.patients p where p.id = new.patient_id;
  if v_patient_tenant is null then
    raise exception 'patient_insurances.patient_id inválido' using errcode = '23503';
  end if;
  if new.tenant_id is distinct from v_patient_tenant then
    raise exception 'patient_insurances.tenant_id deve coincidir com patients.tenant_id'
      using errcode = '23514';
  end if;
  new.legacy_id := nullif(trim(new.legacy_id), '');
  if new.legacy_id is null then
    raise exception 'patient_insurances.legacy_id é obrigatório' using errcode = '23514';
  end if;
  new.insurance_name := coalesce(trim(new.insurance_name), '');
  new.plan_name := coalesce(trim(new.plan_name), '');
  new.membership_number := coalesce(trim(new.membership_number), '');
  new.validity := coalesce(trim(new.validity), '');
  new.company_partner := coalesce(trim(new.company_partner), '');
  new.provider_id := coalesce(trim(new.provider_id), '');
  new.plan_id := coalesce(trim(new.plan_id), '');
  new.holder_cpf := coalesce(regexp_replace(new.holder_cpf, '\D', '', 'g'), '');
  new.status := coalesce(nullif(trim(new.status), ''), 'ativo');
  new.extra_data := coalesce(new.extra_data, '{}'::jsonb);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_patient_insurances_validate on public.patient_insurances;
create trigger trg_patient_insurances_validate
before insert or update on public.patient_insurances
for each row execute function public.validate_patient_insurances_row();

drop trigger if exists trg_patient_insurances_touch on public.patient_insurances;
create trigger trg_patient_insurances_touch
before update on public.patient_insurances
for each row execute function public.touch_updated_at();

alter table public.patient_insurances enable row level security;
alter table public.patient_insurances force row level security;
revoke all on table public.patient_insurances from anon, authenticated;
grant select, insert, update on table public.patient_insurances to authenticated;

drop policy if exists patient_insurances_select_tenant on public.patient_insurances;
drop policy if exists patient_insurances_modify_admin on public.patient_insurances;

create policy patient_insurances_select_tenant on public.patient_insurances
  for select using (
    auth.uid() is not null and deleted_at is null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy patient_insurances_modify_admin on public.patient_insurances
  for all using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- ---------------------------------------------------------------------------
-- 6) patient_access (1:1) — portal / acesso
-- ---------------------------------------------------------------------------

create table if not exists public.patient_access (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  user_id uuid null,
  access_status text not null default '',
  last_login_at timestamptz null,
  invite_sent_at timestamptz null,
  access_email text not null default '',
  access_phone text not null default '',
  wants_portal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create unique index if not exists patient_access_tenant_patient_uq
  on public.patient_access (tenant_id, patient_id)
  where deleted_at is null;

create or replace function public.validate_patient_access_row()
returns trigger language plpgsql as $$
declare v_patient_tenant uuid;
begin
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'patient_access.tenant_id é imutável' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.patient_id is distinct from old.patient_id then
    raise exception 'patient_access.patient_id é imutável' using errcode = '23514';
  end if;
  select p.tenant_id into v_patient_tenant from public.patients p where p.id = new.patient_id;
  if v_patient_tenant is null then
    raise exception 'patient_access.patient_id inválido' using errcode = '23503';
  end if;
  if new.tenant_id is distinct from v_patient_tenant then
    raise exception 'patient_access.tenant_id deve coincidir com patients.tenant_id'
      using errcode = '23514';
  end if;
  new.access_status := coalesce(trim(new.access_status), '');
  new.access_email := coalesce(trim(new.access_email), '');
  new.access_phone := coalesce(trim(new.access_phone), '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_patient_access_validate on public.patient_access;
create trigger trg_patient_access_validate
before insert or update on public.patient_access
for each row execute function public.validate_patient_access_row();

drop trigger if exists trg_patient_access_touch on public.patient_access;
create trigger trg_patient_access_touch
before update on public.patient_access
for each row execute function public.touch_updated_at();

alter table public.patient_access enable row level security;
alter table public.patient_access force row level security;
revoke all on table public.patient_access from anon, authenticated;
grant select, insert, update on table public.patient_access to authenticated;

drop policy if exists patient_access_select_tenant on public.patient_access;
drop policy if exists patient_access_modify_admin on public.patient_access;

create policy patient_access_select_tenant on public.patient_access
  for select using (
    auth.uid() is not null and deleted_at is null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy patient_access_modify_admin on public.patient_access
  for all using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- ---------------------------------------------------------------------------
-- 7) patient_activity_summary (1:1) — campos canônicos persistidos
-- ---------------------------------------------------------------------------

create table if not exists public.patient_activity_summary (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  total_appointments integer not null default 0,
  last_appointment_at timestamptz null,
  total_procedures integer not null default 0,
  last_procedure_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint patient_activity_summary_totals_nonneg_chk
    check (total_appointments >= 0 and total_procedures >= 0)
);

create unique index if not exists patient_activity_summary_tenant_patient_uq
  on public.patient_activity_summary (tenant_id, patient_id)
  where deleted_at is null;

create or replace function public.validate_patient_activity_summary_row()
returns trigger language plpgsql as $$
declare v_patient_tenant uuid;
begin
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'patient_activity_summary.tenant_id é imutável' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.patient_id is distinct from old.patient_id then
    raise exception 'patient_activity_summary.patient_id é imutável' using errcode = '23514';
  end if;
  select p.tenant_id into v_patient_tenant from public.patients p where p.id = new.patient_id;
  if v_patient_tenant is null then
    raise exception 'patient_activity_summary.patient_id inválido' using errcode = '23503';
  end if;
  if new.tenant_id is distinct from v_patient_tenant then
    raise exception 'patient_activity_summary.tenant_id deve coincidir com patients.tenant_id'
      using errcode = '23514';
  end if;
  new.total_appointments := greatest(coalesce(new.total_appointments, 0), 0);
  new.total_procedures := greatest(coalesce(new.total_procedures, 0), 0);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_patient_activity_summary_validate on public.patient_activity_summary;
create trigger trg_patient_activity_summary_validate
before insert or update on public.patient_activity_summary
for each row execute function public.validate_patient_activity_summary_row();

drop trigger if exists trg_patient_activity_summary_touch on public.patient_activity_summary;
create trigger trg_patient_activity_summary_touch
before update on public.patient_activity_summary
for each row execute function public.touch_updated_at();

alter table public.patient_activity_summary enable row level security;
alter table public.patient_activity_summary force row level security;
revoke all on table public.patient_activity_summary from anon, authenticated;
grant select, insert, update on table public.patient_activity_summary to authenticated;

drop policy if exists patient_activity_summary_select_tenant on public.patient_activity_summary;
drop policy if exists patient_activity_summary_modify_admin on public.patient_activity_summary;

create policy patient_activity_summary_select_tenant on public.patient_activity_summary
  for select using (
    auth.uid() is not null and deleted_at is null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy patient_activity_summary_modify_admin on public.patient_activity_summary
  for all using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- ---------------------------------------------------------------------------
-- Amplia validação fail-closed (026) com satélites Wave 2
-- ---------------------------------------------------------------------------

create or replace function public.app_validate_critical_tenant_tables_rls()
returns table (
  table_name text,
  table_exists boolean,
  rls_enabled boolean,
  force_rls boolean,
  policy_count integer,
  ok boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  critical text[] := array[
    'appointments',
    'financial_accounts_receivable',
    'financial_payables',
    'financial_financings',
    'crm_pipeline_stages',
    'crm_leads',
    'patients',
    'patient_phones',
    'patient_documents',
    'patient_records',
    'patient_birth_details',
    'patient_education',
    'patient_addresses',
    'patient_relationships',
    'patient_insurances',
    'patient_access',
    'patient_activity_summary',
    'clinic_profiles',
    'collaborators'
  ];
  t text;
  exists_tbl boolean;
  rls boolean;
  frls boolean;
  pols int;
begin
  foreach t in array critical loop
    exists_tbl := to_regclass('public.' || t) is not null;
    if not exists_tbl then
      table_name := t; table_exists := false; rls_enabled := false;
      force_rls := false; policy_count := 0; ok := true; return next; continue;
    end if;
    select c.relrowsecurity, c.relforcerowsecurity into rls, frls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t;
    select count(*)::int into pols from pg_policies p
    where p.schemaname = 'public' and p.tablename = t;
    table_name := t; table_exists := true;
    rls_enabled := coalesce(rls, false); force_rls := coalesce(frls, false);
    policy_count := coalesce(pols, 0);
    ok := coalesce(rls, false) and coalesce(pols, 0) >= 1;
    return next;
  end loop;
end;
$$;

do $$
begin
  perform public.app_assert_critical_tenant_tables_rls();
end $$;

-- ---------------------------------------------------------------------------
-- Soft-delete SELECT integrity: FOR ALL policies also grant SELECT without
-- deleted_at filter. Replace modify policies with INSERT+UPDATE only
-- for patients + Wave1/Wave2 satellites.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  tables text[] := array[
    'patients',
    'patient_phones',
    'patient_documents',
    'patient_records',
    'patient_birth_details',
    'patient_education',
    'patient_addresses',
    'patient_relationships',
    'patient_insurances',
    'patient_access',
    'patient_activity_summary'
  ];
  modify_name text;
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    modify_name := t || '_modify_admin';
    execute format('drop policy if exists %I on public.%I', modify_name, t);

    execute format(
      'create policy %I on public.%I for insert with check (
         auth.uid() is not null
         and tenant_id is not null
         and public.app_user_can_access_tenant(tenant_id::text)
         and public.app_user_is_tenant_admin(tenant_id)
       )',
      t || '_insert_admin',
      t
    );

    execute format(
      'create policy %I on public.%I for update using (
         auth.uid() is not null
         and public.app_user_can_access_tenant(tenant_id::text)
         and public.app_user_is_tenant_admin(tenant_id)
       ) with check (
         auth.uid() is not null
         and tenant_id is not null
         and public.app_user_can_access_tenant(tenant_id::text)
         and public.app_user_is_tenant_admin(tenant_id)
       )',
      t || '_update_admin',
      t
    );
  end loop;
end $$;

-- Soft-delete + SELECT policy: Postgres aplica USING do SELECT ao NEW row do UPDATE.
-- Por isso `deleted_at is null` puro impede soft-delete. Admins podem ver deletados.

do $$
declare
  t text;
  tables text[] := array[
    'patients',
    'patient_phones',
    'patient_documents',
    'patient_records',
    'patient_birth_details',
    'patient_education',
    'patient_addresses',
    'patient_relationships',
    'patient_insurances',
    'patient_access',
    'patient_activity_summary'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_select_tenant', t);
    execute format(
      'create policy %I on public.%I for select using (
         auth.uid() is not null
         and public.app_user_can_access_tenant(tenant_id::text)
         and (
           deleted_at is null
           or public.app_user_is_tenant_admin(tenant_id)
         )
       )',
      t || '_select_tenant',
      t
    );
  end loop;
end $$;
