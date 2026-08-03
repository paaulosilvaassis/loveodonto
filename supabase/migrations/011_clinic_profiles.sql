-- 011: Perfil visual/cadastral da clínica por tenant (fonte servidor para todos os usuários).

create table if not exists public.clinic_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  fantasy_name text,
  legal_name text,
  logo_url text,
  email text,
  phone text,
  cnpj text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_profiles_tenant_id_uq unique (tenant_id)
);

create index if not exists clinic_profiles_tenant_id_idx on public.clinic_profiles (tenant_id);

-- Backfill a partir de tenants existentes (idempotente).
insert into public.clinic_profiles (
  tenant_id,
  name,
  fantasy_name,
  legal_name,
  email,
  phone,
  cnpj,
  status
)
select
  t.id,
  coalesce(nullif(trim(t.trade_name), ''), nullif(trim(t.legal_name), ''), 'Minha Clínica'),
  nullif(trim(t.trade_name), ''),
  nullif(trim(t.legal_name), ''),
  nullif(trim(t.owner_email), ''),
  nullif(trim(t.phone), ''),
  nullif(trim(t.cnpj), ''),
  coalesce(nullif(trim(t.status), ''), 'active')
from public.tenants t
where not exists (
  select 1 from public.clinic_profiles cp where cp.tenant_id = t.id
);
