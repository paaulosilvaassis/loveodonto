-- Tenant limits controlado pela Platform Console.
-- Fonte de verdade para limites operacionais aplicáveis ao app principal.

create table if not exists public.tenant_limits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  limits_json jsonb not null default '{}'::jsonb,
  updated_by uuid references public.platform_admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id)
);

alter table public.tenant_limits enable row level security;

create policy "console read tenant limits" on public.tenant_limits
  for select using (public.has_platform_permission('tenants.read'));

create policy "console manage tenant limits" on public.tenant_limits
  for all using (public.has_platform_permission('tenants.write'))
  with check (public.has_platform_permission('tenants.write'));

drop trigger if exists trg_tenant_limits_updated_at on public.tenant_limits;
create trigger trg_tenant_limits_updated_at
before update on public.tenant_limits
for each row execute function public.touch_updated_at();

