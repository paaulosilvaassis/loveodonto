-- Cadastro completo de clínica: endereço fiscal, responsável legal e vínculo de cobrança.

alter table if exists public.tenants
  add column if not exists phone text;

alter table if exists public.tenants
  add column if not exists zip_code text;

alter table if exists public.tenants
  add column if not exists street text;

alter table if exists public.tenants
  add column if not exists street_number text;

alter table if exists public.tenants
  add column if not exists address_complement text;

alter table if exists public.tenants
  add column if not exists neighborhood text;

alter table if exists public.tenant_users
  add column if not exists cpf text;

alter table if exists public.tenant_users
  add column if not exists phone text;

create table if not exists public.tenant_legal_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legal_representative_name text not null,
  legal_representative_cpf text not null,
  legal_representative_email text not null,
  legal_representative_phone text,
  legal_representative_role text,
  billing_contact_name text,
  billing_contact_email text,
  billing_contact_phone text,
  billing_same_as_legal boolean not null default true,
  liability_terms_version text not null default '2026-06-v1',
  liability_accepted_at timestamptz not null,
  liability_accepted_by_admin_id uuid references public.platform_admin_users(id),
  liability_accepted_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create index if not exists tenant_legal_profiles_tenant_id_idx
  on public.tenant_legal_profiles (tenant_id);

alter table public.tenant_legal_profiles enable row level security;

drop policy if exists "console read tenant legal profiles" on public.tenant_legal_profiles;
create policy "console read tenant legal profiles" on public.tenant_legal_profiles
  for select using (public.has_platform_permission('tenants.read'));

drop policy if exists "console manage tenant legal profiles" on public.tenant_legal_profiles;
create policy "console manage tenant legal profiles" on public.tenant_legal_profiles
  for all using (public.has_platform_permission('tenants.write'))
  with check (public.has_platform_permission('tenants.write'));

drop trigger if exists trg_tenant_legal_profiles_updated_at on public.tenant_legal_profiles;
create trigger trg_tenant_legal_profiles_updated_at
before update on public.tenant_legal_profiles
for each row execute function public.touch_updated_at();
