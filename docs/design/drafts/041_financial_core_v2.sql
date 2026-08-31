-- DRAFT ONLY
-- DO NOT APPLY IN PHASE 11.H
-- DO NOT place this file under supabase/migrations
-- PHASE: 11.H design artifact
-- NAME: 041_financial_core_v2.sql
--
-- This draft defines NEW financial_v2_* tables alongside legacy 021
-- (financial_accounts_receivable / financial_payables / financial_financings).
-- 021 remains unused for the hardened 11.B–11.G domain.
--
-- MONEY: BIGINT cents. ROUND_TO_CENTS = same as src/services/receivableMoney.js toCents().
-- DELETE: REVOKE. FKs: ON DELETE RESTRICT. tenant_id NOT NULL.
-- IDs: source_id TEXT preserves IndexedDB ids (recv-*, rvpay-*, …). UUID pk is internal only.

-- ---------------------------------------------------------------------------
-- financial_v2_receivables
-- ---------------------------------------------------------------------------
create table if not exists public.financial_v2_receivables (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  tenant_id uuid not null references public.tenants(id) on delete restrict,

  patient_id text null,
  origin_type text not null,
  origin_id text null,
  installment_number integer not null default 0,
  total_installments integer not null default 1,
  budget_id text null,
  financing_id text null,
  description text not null default '',

  issue_date date null,
  due_date date null,

  original_cents bigint not null,
  discount_cents bigint not null default 0,
  interest_cents bigint not null default 0,
  fine_cents bigint not null default 0,
  total_cents bigint not null,

  status text not null,
  payment_method_expected text not null default '',

  canceled_at timestamptz null,
  canceled_by uuid null,
  canceled_reason text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  created_by_legacy text null,

  constraint fv2_recv_source_nonempty_chk check (length(trim(source_id)) > 0),
  constraint fv2_recv_cents_nonneg_chk check (
    original_cents >= 0 and discount_cents >= 0 and interest_cents >= 0
    and fine_cents >= 0 and total_cents >= 0
  ),
  constraint fv2_recv_status_chk check (status in (
    'pending', 'due_today', 'upcoming', 'overdue', 'partially_paid', 'paid', 'canceled', 'renegotiated'
  )),
  constraint fv2_recv_origin_chk check (origin_type in (
    'treatment_plan', 'contract', 'financing', 'manual_entry', 'renegotiation', 'recurring_charge'
  ))
);

create unique index if not exists fv2_recv_tenant_source_uq
  on public.financial_v2_receivables (tenant_id, source_id);

create unique index if not exists fv2_recv_obligation_identity_uq
  on public.financial_v2_receivables (tenant_id, origin_type, origin_id, installment_number)
  where origin_id is not null
    and origin_type in ('treatment_plan', 'financing');

-- ---------------------------------------------------------------------------
-- financial_v2_payments (facts: payment + reversal)
-- ---------------------------------------------------------------------------
create table if not exists public.financial_v2_payments (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  receivable_id text not null,
  operation_id text not null,
  kind text not null,
  status text not null,
  amount_cents bigint not null,
  payment_method text not null default '',
  paid_at date not null,
  reverses_payment_id text null,
  reversed_at timestamptz null,
  reversed_by uuid null,
  reversal_reason text null,
  created_at timestamptz not null default now(),
  created_by uuid null,
  created_by_legacy text null,

  constraint fv2_pay_source_nonempty_chk check (length(trim(source_id)) > 0),
  constraint fv2_pay_operation_nonempty_chk check (length(trim(operation_id)) > 0),
  constraint fv2_pay_amount_nonneg_chk check (amount_cents >= 0),
  constraint fv2_pay_kind_chk check (kind in ('payment', 'reversal')),
  constraint fv2_pay_status_chk check (status in ('applied', 'reversed')),
  constraint fv2_pay_reversal_shape_chk check (
    (kind = 'payment' and reverses_payment_id is null)
    or (kind = 'reversal' and reverses_payment_id is not null)
  ),
  constraint fv2_pay_no_self_reverse_chk check (
    reverses_payment_id is distinct from source_id
  ),
  constraint fv2_pay_receivable_fk
    foreign key (tenant_id, receivable_id)
    references public.financial_v2_receivables (tenant_id, source_id)
    on delete restrict
);

create unique index if not exists fv2_pay_tenant_source_uq
  on public.financial_v2_payments (tenant_id, source_id);

create unique index if not exists fv2_pay_operation_uq
  on public.financial_v2_payments (tenant_id, operation_id);

create unique index if not exists fv2_pay_single_reversal_uq
  on public.financial_v2_payments (reverses_payment_id)
  where kind = 'reversal';

alter table public.financial_v2_payments
  add constraint fv2_pay_reverses_fk
  foreign key (tenant_id, reverses_payment_id)
  references public.financial_v2_payments (tenant_id, source_id)
  on delete restrict;

-- ---------------------------------------------------------------------------
-- financial_v2_financings
-- ---------------------------------------------------------------------------
create table if not exists public.financial_v2_financings (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  patient_id text null,
  budget_id text null,
  status text not null,
  total_cents bigint not null,
  entry_cents bigint not null default 0,
  interest_cents bigint not null default 0,
  fee_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  total_payable_cents bigint not null,
  installments_count integer not null default 1,
  approved_at timestamptz null,
  canceled_at timestamptz null,
  canceled_by uuid null,
  canceled_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  created_by_legacy text null,

  constraint fv2_fin_cents_nonneg_chk check (
    total_cents > 0 and entry_cents >= 0 and interest_cents >= 0
    and fee_cents >= 0 and discount_cents >= 0 and total_payable_cents >= 0
  ),
  constraint fv2_fin_status_chk check (status in (
    'draft', 'pending_analysis', 'approved', 'active', 'partially_paid', 'paid_off',
    'overdue', 'renegotiated', 'canceled', 'defaulted'
  ))
);

create unique index if not exists fv2_fin_tenant_source_uq
  on public.financial_v2_financings (tenant_id, source_id);

create unique index if not exists fv2_fin_active_budget_uq
  on public.financial_v2_financings (tenant_id, budget_id)
  where budget_id is not null
    and status not in ('canceled', 'renegotiated');

-- ---------------------------------------------------------------------------
-- financial_v2_financing_installments (operational projection — not money SSOT)
-- ---------------------------------------------------------------------------
create table if not exists public.financial_v2_financing_installments (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  financing_id text not null,
  receivable_id text not null,
  installment_number integer not null,
  due_date date null,
  created_at timestamptz not null default now(),
  constraint fv2_finst_fin_fk
    foreign key (tenant_id, financing_id)
    references public.financial_v2_financings (tenant_id, source_id)
    on delete restrict,
  constraint fv2_finst_recv_fk
    foreign key (tenant_id, receivable_id)
    references public.financial_v2_receivables (tenant_id, source_id)
    on delete restrict
);

create unique index if not exists fv2_finst_receivable_uq
  on public.financial_v2_financing_installments (tenant_id, receivable_id);

-- ---------------------------------------------------------------------------
-- charges / boleto (never create receivable)
-- ---------------------------------------------------------------------------
create table if not exists public.financial_v2_charges (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  receivable_id text not null,
  provider text not null default 'internal',
  provider_charge_id text null,
  operation_id text not null,
  status text not null,
  amount_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid null,
  created_by_legacy text null,
  constraint fv2_charge_recv_fk
    foreign key (tenant_id, receivable_id)
    references public.financial_v2_receivables (tenant_id, source_id)
    on delete restrict
);

create unique index if not exists fv2_charge_operation_uq
  on public.financial_v2_charges (tenant_id, operation_id);

create table if not exists public.financial_v2_boleto_charges (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  receivable_id text null,
  provider text not null default 'fake',
  provider_charge_id text null,
  operation_id text not null,
  status text not null,
  amount_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid null,
  created_by_legacy text null
);

create unique index if not exists fv2_boleto_operation_uq
  on public.financial_v2_boleto_charges (tenant_id, operation_id);

create table if not exists public.financial_v2_boleto_reminder_events (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  boleto_charge_id text not null,
  receivable_id text null,
  event_key text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists fv2_reminder_event_uq
  on public.financial_v2_boleto_reminder_events (tenant_id, event_key);

-- ---------------------------------------------------------------------------
-- quarantine (legacy unowned / duplicate / mismatch) — report only
-- ---------------------------------------------------------------------------
create table if not exists public.financial_v2_migration_quarantine (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  source_store text not null,
  source_id text not null,
  class text not null check (class in (
    'UNOWNED', 'CONFLICTED', 'DUPLICATE', 'MISMATCH', 'UNSUPPORTED'
  )),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- RLS sketch (not applied in 11.H):
--   enable row level security on all financial_v2_* ;
--   SELECT: app_user_can_access_tenant(tenant_id::text)
--   INSERT/UPDATE: tenant membership; RBAC in server writer
--   DELETE: no policy; revoke delete from authenticated, anon
--   ON DELETE CASCADE is forbidden on financial facts.

-- GRANT SELECT, INSERT, UPDATE ON financial_v2_* TO authenticated;
-- REVOKE DELETE ON financial_v2_* FROM authenticated, anon;
