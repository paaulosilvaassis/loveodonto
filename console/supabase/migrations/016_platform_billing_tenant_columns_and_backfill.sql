-- Colunas de cobrança SaaS em tenants + backfill para clínicas existentes

alter table public.tenants
  add column if not exists billing_blocked_at timestamptz,
  add column if not exists billing_blocked_reason text,
  add column if not exists billing_unblocked_at timestamptz,
  add column if not exists billing_last_evaluated_at timestamptz;

update public.tenants set billing_status = 'ok' where billing_status is null;

-- Garante tabelas platform_* (idempotente se 015 não foi aplicada)
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

create table if not exists public.platform_billing_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid references public.platform_invoices(id) on delete set null,
  event_type text not null,
  message text not null,
  created_by uuid references public.platform_admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

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

-- Backfill: assinatura trial para clínicas sem platform_subscriptions
insert into public.platform_subscriptions (
  tenant_id,
  plan_code,
  status,
  started_at,
  trial_ends_at,
  current_period_start,
  current_period_end,
  next_due_date,
  grace_days,
  block_after_days
)
select
  t.id,
  coalesce(nullif(trim(t.plan_code), ''), 'Start'),
  'active_trial',
  coalesce(t.created_at, now()),
  coalesce(t.created_at, now()) + interval '30 days',
  coalesce(t.created_at, now()),
  coalesce(t.created_at, now()) + interval '30 days',
  (coalesce(t.created_at, now()) + interval '30 days')::date,
  10,
  11
from public.tenants t
where not exists (
  select 1 from public.platform_subscriptions ps where ps.tenant_id = t.id
);

-- Backfill: fatura inicial aberta
insert into public.platform_invoices (
  tenant_id,
  subscription_id,
  amount_cents,
  due_date,
  status,
  overdue_days
)
select
  ps.tenant_id,
  ps.id,
  case coalesce(ps.plan_code, 'Start')
    when 'Start' then 8990
    when 'Growth' then 14990
    when 'Scale' then 23990
    else 0
  end,
  ps.next_due_date,
  'open',
  0
from public.platform_subscriptions ps
where ps.next_due_date is not null
  and not exists (
    select 1
    from public.platform_invoices pi
    where pi.tenant_id = ps.tenant_id
      and pi.status in ('open', 'due_today', 'overdue')
  );
