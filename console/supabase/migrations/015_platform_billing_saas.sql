-- Módulo de cobrança SaaS da Platform Console (isolado do financeiro interno da clínica)

alter table public.tenants
  add column if not exists billing_blocked_at timestamptz,
  add column if not exists billing_blocked_reason text,
  add column if not exists billing_unblocked_at timestamptz,
  add column if not exists billing_last_evaluated_at timestamptz;

-- billing_status já existe em 001 (default 'ok'); normaliza valores legados
update public.tenants set billing_status = 'ok' where billing_status is null;

create table if not exists public.platform_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_code text not null,
  status text not null default 'active_trial',
  started_at timestamptz not null default now(),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  billing_due_day smallint,
  next_due_date date,
  grace_days smallint not null default 10,
  block_after_days smallint not null default 11,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists platform_subscriptions_tenant_active_idx
  on public.platform_subscriptions (tenant_id)
  where status not in ('canceled', 'ended');

create table if not exists public.platform_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid references public.platform_subscriptions(id) on delete set null,
  amount_cents integer not null default 0,
  due_date date not null,
  paid_at timestamptz,
  status text not null default 'open',
  overdue_days integer not null default 0,
  payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_invoices_tenant_due_idx
  on public.platform_invoices (tenant_id, due_date desc);

create index if not exists platform_invoices_status_due_idx
  on public.platform_invoices (status, due_date);

create table if not exists public.platform_billing_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid references public.platform_invoices(id) on delete set null,
  event_type text not null,
  message text not null,
  created_by uuid references public.platform_admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists platform_billing_events_tenant_created_idx
  on public.platform_billing_events (tenant_id, created_at desc);

create table if not exists public.platform_billing_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid references public.platform_invoices(id) on delete set null,
  alert_type text not null,
  severity text not null default 'info',
  title text not null,
  description text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists platform_billing_alerts_tenant_open_idx
  on public.platform_billing_alerts (tenant_id, created_at desc)
  where resolved_at is null;

drop trigger if exists platform_subscriptions_touch_updated_at on public.platform_subscriptions;
create trigger platform_subscriptions_touch_updated_at
  before update on public.platform_subscriptions
  for each row execute function public.touch_updated_at();

drop trigger if exists platform_invoices_touch_updated_at on public.platform_invoices;
create trigger platform_invoices_touch_updated_at
  before update on public.platform_invoices
  for each row execute function public.touch_updated_at();

alter table public.platform_subscriptions enable row level security;
alter table public.platform_invoices enable row level security;
alter table public.platform_billing_events enable row level security;
alter table public.platform_billing_alerts enable row level security;

drop policy if exists "platform billing subscriptions read" on public.platform_subscriptions;
create policy "platform billing subscriptions read" on public.platform_subscriptions
  for select
  using (
    tenant_id = public.app_current_tenant_id()
    or public.has_platform_permission('billing.read')
  );

drop policy if exists "platform billing invoices read" on public.platform_invoices;
create policy "platform billing invoices read" on public.platform_invoices
  for select
  using (
    tenant_id = public.app_current_tenant_id()
    or public.has_platform_permission('billing.read')
  );

drop policy if exists "platform billing events read" on public.platform_billing_events;
create policy "platform billing events read" on public.platform_billing_events
  for select
  using (public.has_platform_permission('billing.read'));

drop policy if exists "platform billing alerts read" on public.platform_billing_alerts;
create policy "platform billing alerts read" on public.platform_billing_alerts
  for select
  using (public.has_platform_permission('billing.read'));
