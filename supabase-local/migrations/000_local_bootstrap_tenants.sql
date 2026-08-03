-- Phase 9.2A/G — bootstrap LOCAL-ONLY para public.tenants + public.tenant_users
-- Necessário porque o CREATE oficial de tenants/tenant_users vive no console schema,
-- enquanto migrations do app (005+) assumem essas tabelas já existentes.
-- Sem FK para platform_admin_users (evita dependência de schema console).
-- Idempotente: create table if not exists. Não substitui schema console em staging/prod.

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  clinic_code text unique,
  legal_name text not null,
  trade_name text,
  cnpj text,
  phone text,
  status text not null default 'active',
  billing_status text not null default 'ok',
  plan_code text,
  owner_name text,
  owner_email text,
  city text,
  state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tenants is
  'Bootstrap local disposable (Phase 9.2A). Não substitui schema console em staging/prod.';

-- Phase 9.2G — mínimo compatível com 005_app_collaborator_access_invites.sql
-- Espelha colunas essenciais do console 001 + is_active (console 007) + has_system_access (app 005).
create table if not exists public.tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid,
  full_name text,
  email text,
  role_slug text,
  role text,
  status text not null default 'active',
  is_active boolean not null default true,
  has_system_access boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tenant_users is
  'Bootstrap local disposable (Phase 9.2G). Compatível com app 005+; não substitui schema console.';
