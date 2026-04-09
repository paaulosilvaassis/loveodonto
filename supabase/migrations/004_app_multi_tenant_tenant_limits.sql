-- tenant_limits no contexto multi-tenant do app principal.
-- Necessário para leitura de limites por tenant sem quebrar schema cache (PGRST205).

create table if not exists public.tenant_limits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  limits_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id)
);

create index if not exists tenant_limits_tenant_id_idx on public.tenant_limits (tenant_id);

alter table public.tenant_limits enable row level security;

drop policy if exists tenant_limits_tenant_select_policy on public.tenant_limits;
create policy tenant_limits_tenant_select_policy on public.tenant_limits
  for select
  using (public.app_user_can_access_tenant(tenant_id::text));

drop policy if exists tenant_limits_tenant_modify_policy on public.tenant_limits;
create policy tenant_limits_tenant_modify_policy on public.tenant_limits
  for all
  using (public.app_user_can_access_tenant(tenant_id::text))
  with check (public.app_user_can_access_tenant(tenant_id::text));

