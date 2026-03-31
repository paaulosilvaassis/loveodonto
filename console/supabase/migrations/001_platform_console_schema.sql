-- Platform Console Schema (isolado do app principal)
-- Recomendado executar em projeto Supabase dedicado da Console.

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.platform_roles (
  id uuid primary key default gen_random_uuid(),
  role_slug text not null unique,
  role_name text not null,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.platform_roles(id) on delete cascade,
  permission_id uuid not null references public.platform_permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(role_id, permission_id)
);

create table if not exists public.platform_admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role_slug text not null references public.platform_roles(role_slug),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  clinic_code text unique,
  legal_name text not null,
  trade_name text,
  cnpj text,
  status text not null default 'active',
  billing_status text not null default 'ok',
  plan_code text,
  owner_name text,
  owner_email text,
  city text,
  state text,
  created_by uuid references public.platform_admin_users(id),
  updated_by uuid references public.platform_admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid,
  full_name text,
  email text,
  role_slug text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_modules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  updated_by uuid references public.platform_admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, module_key)
);

create table if not exists public.tenant_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  integration_key text not null,
  status text not null default 'disconnected',
  config jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_error text,
  updated_by uuid references public.platform_admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, integration_key)
);

create table if not exists public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_code text not null,
  status text not null default 'active',
  amount_cents integer not null default 0,
  cycle text not null default 'monthly',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  next_billing_at timestamptz,
  canceled_at timestamptz,
  updated_by uuid references public.platform_admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_billing_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid references public.tenant_subscriptions(id) on delete set null,
  event_type text not null,
  status text not null,
  amount_cents integer not null default 0,
  external_reference text,
  payload jsonb not null default '{}'::jsonb,
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject text not null,
  priority text not null default 'medium',
  status text not null default 'open',
  source text not null default 'console',
  assignee_admin_id uuid references public.platform_admin_users(id),
  opened_by uuid references public.platform_admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_type text not null,
  sender_id uuid,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_admin_id uuid references public.platform_admin_users(id),
  actor_role text,
  action text not null,
  target_type text not null,
  target_id text not null,
  tenant_id uuid references public.tenants(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.system_health_checks (
  id uuid primary key default gen_random_uuid(),
  component text not null,
  status text not null default 'healthy',
  latency_ms integer,
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  flag_key text not null,
  scope_type text not null default 'global',
  scope_ref text not null default '*',
  enabled boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  updated_by uuid references public.platform_admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(flag_key, scope_type, scope_ref)
);

create or replace function public.platform_user_role(user_id uuid)
returns text
language sql
stable
as $$
  select role_slug
  from public.platform_admin_users
  where id = user_id and is_active = true
  limit 1
$$;

create or replace function public.has_platform_permission(permission_key text)
returns boolean
language sql
stable
as $$
  with me as (
    select role_slug
    from public.platform_admin_users
    where id = auth.uid() and is_active = true
    limit 1
  )
  select exists(
    select 1
    from me
    left join public.platform_roles r on r.role_slug = me.role_slug
    left join public.platform_role_permissions rp on rp.role_id = r.id
    left join public.platform_permissions p on p.id = rp.permission_id
    where p.permission_key = permission_key or me.role_slug in ('owner', 'super_admin')
  );
$$;

alter table public.platform_admin_users enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_users enable row level security;
alter table public.tenant_modules enable row level security;
alter table public.tenant_integrations enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.tenant_billing_events enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_health_checks enable row level security;
alter table public.feature_flags enable row level security;
alter table public.platform_roles enable row level security;
alter table public.platform_permissions enable row level security;
alter table public.platform_role_permissions enable row level security;

create policy "console read roles" on public.platform_roles
  for select using (auth.uid() is not null and public.platform_user_role(auth.uid()) is not null);
create policy "console read permissions" on public.platform_permissions
  for select using (auth.uid() is not null and public.platform_user_role(auth.uid()) is not null);
create policy "console read role permissions" on public.platform_role_permissions
  for select using (auth.uid() is not null and public.platform_user_role(auth.uid()) is not null);

create policy "console read admins" on public.platform_admin_users
  for select using (public.has_platform_permission('settings.read'));
create policy "console manage admins" on public.platform_admin_users
  for all using (public.has_platform_permission('settings.write'))
  with check (public.has_platform_permission('settings.write'));

create policy "console read tenants" on public.tenants
  for select using (public.has_platform_permission('tenants.read'));
create policy "console manage tenants" on public.tenants
  for all using (public.has_platform_permission('tenants.write'))
  with check (public.has_platform_permission('tenants.write'));

create policy "console read tenant users" on public.tenant_users
  for select using (public.has_platform_permission('tenants.read'));
create policy "console manage tenant users" on public.tenant_users
  for all using (public.has_platform_permission('tenants.write'))
  with check (public.has_platform_permission('tenants.write'));

create policy "console read tenant modules" on public.tenant_modules
  for select using (public.has_platform_permission('tenants.read'));
create policy "console manage tenant modules" on public.tenant_modules
  for all using (public.has_platform_permission('tenants.write'))
  with check (public.has_platform_permission('tenants.write'));

create policy "console read tenant integrations" on public.tenant_integrations
  for select using (public.has_platform_permission('integrations.read'));
create policy "console manage tenant integrations" on public.tenant_integrations
  for all using (public.has_platform_permission('integrations.write'))
  with check (public.has_platform_permission('integrations.write'));

create policy "console read subscriptions" on public.tenant_subscriptions
  for select using (public.has_platform_permission('billing.read'));
create policy "console manage subscriptions" on public.tenant_subscriptions
  for all using (public.has_platform_permission('billing.write'))
  with check (public.has_platform_permission('billing.write'));

create policy "console read billing events" on public.tenant_billing_events
  for select using (public.has_platform_permission('billing.read'));
create policy "console manage billing events" on public.tenant_billing_events
  for all using (public.has_platform_permission('billing.write'))
  with check (public.has_platform_permission('billing.write'));

create policy "console read support tickets" on public.support_tickets
  for select using (public.has_platform_permission('support.read'));
create policy "console manage support tickets" on public.support_tickets
  for all using (public.has_platform_permission('support.write'))
  with check (public.has_platform_permission('support.write'));

create policy "console read support messages" on public.support_messages
  for select using (public.has_platform_permission('support.read'));
create policy "console manage support messages" on public.support_messages
  for all using (public.has_platform_permission('support.write'))
  with check (public.has_platform_permission('support.write'));

create policy "console read audit logs" on public.audit_logs
  for select using (public.has_platform_permission('audit.read'));
create policy "console write audit logs" on public.audit_logs
  for insert with check (public.has_platform_permission('audit.write'));

create policy "console read health checks" on public.system_health_checks
  for select using (public.has_platform_permission('logs.read'));
create policy "console write health checks" on public.system_health_checks
  for all using (public.has_platform_permission('logs.write'))
  with check (public.has_platform_permission('logs.write'));

create policy "console read flags" on public.feature_flags
  for select using (public.has_platform_permission('flags.read'));
create policy "console manage flags" on public.feature_flags
  for all using (public.has_platform_permission('flags.write'))
  with check (public.has_platform_permission('flags.write'));

create trigger trg_platform_admin_users_updated_at
before update on public.platform_admin_users
for each row execute function public.touch_updated_at();

create trigger trg_tenants_updated_at
before update on public.tenants
for each row execute function public.touch_updated_at();

create trigger trg_tenant_users_updated_at
before update on public.tenant_users
for each row execute function public.touch_updated_at();

create trigger trg_tenant_modules_updated_at
before update on public.tenant_modules
for each row execute function public.touch_updated_at();

create trigger trg_tenant_integrations_updated_at
before update on public.tenant_integrations
for each row execute function public.touch_updated_at();

create trigger trg_tenant_subscriptions_updated_at
before update on public.tenant_subscriptions
for each row execute function public.touch_updated_at();

create trigger trg_support_tickets_updated_at
before update on public.support_tickets
for each row execute function public.touch_updated_at();

create trigger trg_feature_flags_updated_at
before update on public.feature_flags
for each row execute function public.touch_updated_at();
