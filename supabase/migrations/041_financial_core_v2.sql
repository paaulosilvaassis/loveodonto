-- 041: financial_v2 core schema — Phase 11.J
-- APPLIES TO: LOCAL or STAGING CONTROLADO only.
-- FORBIDDEN: production project uoepkwhqztmsjnzirpev
--
-- Parallel to legacy 021 (financial_accounts_receivable / financial_financings).
-- 021 is NOT altered. No backfill. No dual-write. No shadow-write.
--
-- MONEY: BIGINT cents (same rounding as src/services/receivableMoney.js toCents).
-- tenant_id: UUID NOT NULL → public.tenants(id) ON DELETE RESTRICT
-- source_id: TEXT domain id (recv-*, rvpay-*, …) — never coerced to UUID
-- DELETE: no policy + REVOKE. FKs: ON DELETE RESTRICT. No CASCADE on financial facts.
--
-- SERVICE INVARIANTS not fully encoded in SQL (must remain in writers):
--   cannot reverse a reversal; reversal.amount_cents = original.amount_cents;
--   no circular reversal graph beyond self-check + unique target.
--
-- Quarantine remains an in-memory 11.I report. Not a remote store.

-- ---------------------------------------------------------------------------
-- Helpers: tenant_id immutability + payment fact immutability + reversal target
-- ---------------------------------------------------------------------------
create or replace function public.financial_v2_reject_tenant_id_change()
returns trigger
language plpgsql
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'financial_v2 tenant_id is immutable';
  end if;
  return new;
end;
$$;

create or replace function public.financial_v2_payment_fact_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.amount_cents is distinct from old.amount_cents
      or new.kind is distinct from old.kind
      or new.source_id is distinct from old.source_id
      or new.operation_id is distinct from old.operation_id
      or new.receivable_id is distinct from old.receivable_id
      or new.reverses_payment_id is distinct from old.reverses_payment_id
      or new.tenant_id is distinct from old.tenant_id
    then
      raise exception 'financial_v2 payment facts are immutable';
    end if;
    return new;
  end if;

  if new.kind = 'reversal' then
    if not exists (
      select 1
      from public.financial_v2_payments p
      where p.tenant_id = new.tenant_id
        and p.source_id = new.reverses_payment_id
        and p.kind = 'payment'
    ) then
      raise exception 'reversal target must be a same-tenant payment fact';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.financial_v2_reject_tenant_id_change() from public;
revoke all on function public.financial_v2_payment_fact_guard() from public;
grant execute on function public.financial_v2_reject_tenant_id_change() to authenticated, service_role;
grant execute on function public.financial_v2_payment_fact_guard() to authenticated, service_role;

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

  constraint fv2_recv_tenant_source_uq unique (tenant_id, source_id),
  constraint fv2_recv_source_nonempty_chk check (length(trim(source_id)) > 0),
  constraint fv2_recv_installment_nonneg_chk check (installment_number >= 0 and total_installments >= 1),
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

create unique index if not exists fv2_recv_obligation_identity_uq
  on public.financial_v2_receivables (tenant_id, origin_type, origin_id, installment_number)
  where origin_id is not null
    and origin_type in ('treatment_plan', 'financing');

create index if not exists fv2_recv_tenant_due_idx
  on public.financial_v2_receivables (tenant_id, due_date);

comment on table public.financial_v2_receivables is
  'PHASE_11J financial obligation SSOT candidate. IndexedDB remains live SSOT until cutover.';

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

  constraint fv2_pay_tenant_source_uq unique (tenant_id, source_id),
  constraint fv2_pay_operation_uq unique (tenant_id, operation_id),
  constraint fv2_pay_source_nonempty_chk check (length(trim(source_id)) > 0),
  constraint fv2_pay_operation_nonempty_chk check (length(trim(operation_id)) > 0),
  constraint fv2_pay_amount_positive_chk check (amount_cents > 0),
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
    on delete restrict,
  constraint fv2_pay_reverses_fk
    foreign key (tenant_id, reverses_payment_id)
    references public.financial_v2_payments (tenant_id, source_id)
    on delete restrict
);

create unique index if not exists fv2_pay_single_reversal_uq
  on public.financial_v2_payments (tenant_id, reverses_payment_id)
  where kind = 'reversal';

comment on table public.financial_v2_payments is
  'Append-only payment/reversal facts. Original payment is never deleted.';

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

  constraint fv2_fin_tenant_source_uq unique (tenant_id, source_id),
  constraint fv2_fin_source_nonempty_chk check (length(trim(source_id)) > 0),
  constraint fv2_fin_cents_nonneg_chk check (
    total_cents > 0 and entry_cents >= 0 and interest_cents >= 0
    and fee_cents >= 0 and discount_cents >= 0 and total_payable_cents >= 0
  ),
  constraint fv2_fin_status_chk check (status in (
    'draft', 'pending_analysis', 'approved', 'active', 'partially_paid', 'paid_off',
    'overdue', 'renegotiated', 'canceled', 'defaulted'
  ))
);

create unique index if not exists fv2_fin_active_budget_uq
  on public.financial_v2_financings (tenant_id, budget_id)
  where budget_id is not null
    and status not in ('canceled', 'renegotiated');

-- ---------------------------------------------------------------------------
-- financial_v2_financing_installments — operational projection, not money SSOT
-- ---------------------------------------------------------------------------
create table if not exists public.financial_v2_financing_installments (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  financing_id text not null,
  receivable_id text not null,
  installment_number integer not null,
  amount_cents bigint not null default 0,
  due_date date null,
  created_at timestamptz not null default now(),

  constraint fv2_finst_tenant_source_uq unique (tenant_id, source_id),
  constraint fv2_finst_number_chk check (installment_number >= 0),
  constraint fv2_finst_amount_chk check (amount_cents >= 0),
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

create unique index if not exists fv2_finst_identity_uq
  on public.financial_v2_financing_installments (tenant_id, financing_id, installment_number);

comment on table public.financial_v2_financing_installments is
  'Operational projection. Authoritative obligation remains financial_v2_receivables.';

-- ---------------------------------------------------------------------------
-- charges / boleto — never create receivable
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

  constraint fv2_charge_tenant_source_uq unique (tenant_id, source_id),
  constraint fv2_charge_operation_uq unique (tenant_id, operation_id),
  constraint fv2_charge_amount_chk check (amount_cents >= 0),
  constraint fv2_charge_recv_fk
    foreign key (tenant_id, receivable_id)
    references public.financial_v2_receivables (tenant_id, source_id)
    on delete restrict
);

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
  created_by_legacy text null,

  constraint fv2_boleto_tenant_source_uq unique (tenant_id, source_id),
  constraint fv2_boleto_operation_uq unique (tenant_id, operation_id),
  constraint fv2_boleto_amount_chk check (amount_cents >= 0)
);

create table if not exists public.financial_v2_boleto_reminder_events (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  boleto_charge_id text not null,
  receivable_id text null,
  event_key text not null,
  created_at timestamptz not null default now(),

  constraint fv2_reminder_tenant_source_uq unique (tenant_id, source_id)
);

create unique index if not exists fv2_reminder_event_uq
  on public.financial_v2_boleto_reminder_events (tenant_id, event_key);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'financial_v2_receivables',
    'financial_v2_payments',
    'financial_v2_financings',
    'financial_v2_financing_installments',
    'financial_v2_charges',
    'financial_v2_boleto_charges',
    'financial_v2_boleto_reminder_events'
  ]
  loop
    execute format(
      'drop trigger if exists trg_%s_tenant_immutable on public.%I',
      t, t
    );
    execute format(
      'create trigger trg_%s_tenant_immutable
         before update on public.%I
         for each row execute function public.financial_v2_reject_tenant_id_change()',
      t, t
    );
  end loop;
end $$;

drop trigger if exists trg_financial_v2_payments_fact_guard on public.financial_v2_payments;
create trigger trg_financial_v2_payments_fact_guard
  before insert or update on public.financial_v2_payments
  for each row execute function public.financial_v2_payment_fact_guard();

-- ---------------------------------------------------------------------------
-- RLS: tenant-scoped SELECT/INSERT/UPDATE. No DELETE policy.
-- Membership helper: app_user_can_access_tenant (JWT claim OR tenant_users).
-- RBAC financeiro permanece no writer/server — RLS não substitui RBAC.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  short text;
begin
  foreach t in array array[
    'financial_v2_receivables',
    'financial_v2_payments',
    'financial_v2_financings',
    'financial_v2_financing_installments',
    'financial_v2_charges',
    'financial_v2_boleto_charges',
    'financial_v2_boleto_reminder_events'
  ]
  loop
    short := replace(t, 'financial_v2_', 'fv2_');
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format('drop policy if exists %I on public.%I', short || '_select_tenant', t);
    execute format('drop policy if exists %I on public.%I', short || '_insert_tenant', t);
    execute format('drop policy if exists %I on public.%I', short || '_update_tenant', t);

    execute format(
      'create policy %I on public.%I for select
         using (auth.uid() is not null and public.app_user_can_access_tenant(tenant_id))',
      short || '_select_tenant', t
    );
    execute format(
      'create policy %I on public.%I for insert
         with check (auth.uid() is not null and public.app_user_can_access_tenant(tenant_id))',
      short || '_insert_tenant', t
    );
    execute format(
      'create policy %I on public.%I for update
         using (auth.uid() is not null and public.app_user_can_access_tenant(tenant_id))
         with check (auth.uid() is not null and public.app_user_can_access_tenant(tenant_id))',
      short || '_update_tenant', t
    );

    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
