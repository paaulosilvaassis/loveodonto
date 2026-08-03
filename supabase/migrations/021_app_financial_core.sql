-- 021: financial_accounts_receivable / financial_payables / financial_financings
-- Schema SSOT Financeiro (Admin API Phase 5.12/5.13)
-- NÃO EXECUTAR automaticamente. Dry-run local somente sob autorização.
--
-- Compatível com:
--   server/lib/financialApiList.js
--   server/lib/financialApiWrite.js
--
-- ROLLBACK (manual — ordem):
--   drop table if exists public.financial_financings cascade;
--   drop table if exists public.financial_payables cascade;
--   drop table if exists public.financial_accounts_receivable cascade;
--
-- Sem tabelas de payments/parcelas/DRE nesta phase (não exigidas pelo write core atual).
-- Refs patient/budget/contract/supplier são text opacos (domínios ainda LEGACY_IDB).

-- ---------------------------------------------------------------------------
-- Receivables
-- ---------------------------------------------------------------------------
create table if not exists public.financial_accounts_receivable (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legacy_id text not null,

  patient_id text null,
  origin_type text not null default 'manual_entry',
  origin_id text null,
  description text not null default '',

  issue_date date null,
  due_date date null,

  original_amount numeric(14, 2) not null default 0,
  discount_amount numeric(14, 2) not null default 0,
  interest_amount numeric(14, 2) not null default 0,
  fine_amount numeric(14, 2) not null default 0,
  net_amount numeric(14, 2) not null default 0,
  paid_amount numeric(14, 2) not null default 0,

  status text not null default 'open',
  payment_method_expected text not null default '',

  contract_id text null,
  budget_id text null,
  financing_id text null,
  financing_installment_id text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  deleted_at timestamptz null,

  constraint far_legacy_id_nonempty_chk check (length(trim(legacy_id)) > 0),
  constraint far_amounts_nonneg_chk check (
    original_amount >= 0 and discount_amount >= 0 and interest_amount >= 0
    and fine_amount >= 0 and net_amount >= 0 and paid_amount >= 0
  )
);

comment on table public.financial_accounts_receivable is
  'Contas a receber SSOT. IndexedDB cache até cutover Primary.';

create unique index if not exists far_tenant_legacy_id_uq
  on public.financial_accounts_receivable (tenant_id, legacy_id)
  where deleted_at is null;

create index if not exists far_tenant_due_date_idx
  on public.financial_accounts_receivable (tenant_id, due_date)
  where deleted_at is null;

create index if not exists far_tenant_status_idx
  on public.financial_accounts_receivable (tenant_id, status)
  where deleted_at is null;

create index if not exists far_tenant_patient_idx
  on public.financial_accounts_receivable (tenant_id, patient_id)
  where deleted_at is null and patient_id is not null;

drop trigger if exists trg_far_touch_updated_at on public.financial_accounts_receivable;
create trigger trg_far_touch_updated_at
  before update on public.financial_accounts_receivable
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Payables
-- ---------------------------------------------------------------------------
create table if not exists public.financial_payables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legacy_id text not null,

  supplier_id text null,
  category_id text null,
  description text not null default '',
  due_date date null,
  amount numeric(14, 2) not null default 0,
  paid_amount numeric(14, 2) not null default 0,
  status text not null default 'open',
  expense_type text not null default '',
  recurrence_frequency text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  deleted_at timestamptz null,

  constraint fpay_legacy_id_nonempty_chk check (length(trim(legacy_id)) > 0),
  constraint fpay_amounts_nonneg_chk check (amount >= 0 and paid_amount >= 0)
);

comment on table public.financial_payables is
  'Contas a pagar SSOT. IndexedDB cache até cutover Primary.';

create unique index if not exists fpay_tenant_legacy_id_uq
  on public.financial_payables (tenant_id, legacy_id)
  where deleted_at is null;

create index if not exists fpay_tenant_due_date_idx
  on public.financial_payables (tenant_id, due_date)
  where deleted_at is null;

create index if not exists fpay_tenant_status_idx
  on public.financial_payables (tenant_id, status)
  where deleted_at is null;

drop trigger if exists trg_fpay_touch_updated_at on public.financial_payables;
create trigger trg_fpay_touch_updated_at
  before update on public.financial_payables
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Financings
-- ---------------------------------------------------------------------------
create table if not exists public.financial_financings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legacy_id text not null,

  patient_id text null,
  contract_id text null,
  budget_id text null,
  status text not null default 'draft',
  approval_status text not null default '',
  total_amount numeric(14, 2) not null default 0,
  entry_amount numeric(14, 2) not null default 0,
  installments_count integer not null default 0,
  partner_id text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  deleted_at timestamptz null,

  constraint ffin_legacy_id_nonempty_chk check (length(trim(legacy_id)) > 0),
  constraint ffin_amounts_nonneg_chk check (
    total_amount >= 0 and entry_amount >= 0 and installments_count >= 0
  )
);

comment on table public.financial_financings is
  'Financiamentos SSOT (cabeçalho). Parcelas/pagamentos ficam para fase futura se o runtime exigir.';

create unique index if not exists ffin_tenant_legacy_id_uq
  on public.financial_financings (tenant_id, legacy_id)
  where deleted_at is null;

create index if not exists ffin_tenant_status_idx
  on public.financial_financings (tenant_id, status)
  where deleted_at is null;

create index if not exists ffin_tenant_patient_idx
  on public.financial_financings (tenant_id, patient_id)
  where deleted_at is null and patient_id is not null;

drop trigger if exists trg_ffin_touch_updated_at on public.financial_financings;
create trigger trg_ffin_touch_updated_at
  before update on public.financial_financings
  for each row execute function public.touch_updated_at();
