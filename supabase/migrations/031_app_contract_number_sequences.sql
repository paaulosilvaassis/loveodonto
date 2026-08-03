-- 031: Contract number sequences + idempotency scope expansion — Phase 10.9
-- APLICAR APENAS em Supabase local / banco efêmero de teste.
-- NÃO EXECUTAR automaticamente em remoto/produção/staging compartilhado.
--
-- Resolve numeração CTR/PKG concorrente e amplia scopes de idempotência
-- para operações do domínio 10.5–10.8.
--
-- Pré-requisitos: 028, 029, 030.
-- ROLLBACK: drop function/table; restaurar check antigo de scope (manual).

-- ---------------------------------------------------------------------------
-- Number sequences (CTR-YYYY-000001 / PKG-YYYY-000001)
-- ---------------------------------------------------------------------------
create table if not exists public.app_contract_number_sequences (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null,
  year integer not null,
  last_value bigint not null default 0,
  updated_at timestamptz not null default now(),

  constraint app_contract_number_sequences_pk primary key (tenant_id, kind, year),
  constraint app_contract_number_sequences_kind_chk check (kind in ('CTR', 'PKG')),
  constraint app_contract_number_sequences_year_chk check (year >= 2000 and year <= 2100),
  constraint app_contract_number_sequences_value_chk check (last_value >= 0)
);

comment on table public.app_contract_number_sequences is
  'Phase 10.9 — contadores concorrentes seguros por tenant/kind/year. Sem MAX()+1.';

create or replace function public.app_contract_next_number(
  p_tenant_id uuid,
  p_kind text,
  p_year integer default null
)
returns text
language plpgsql
as $$
declare
  v_year integer := coalesce(p_year, extract(year from timezone('utc', now()))::integer);
  v_next bigint;
  v_prefix text;
begin
  if p_tenant_id is null then
    raise exception 'TENANT_REQUIRED';
  end if;
  if p_kind not in ('CTR', 'PKG') then
    raise exception 'INVALID_NUMBER_KIND';
  end if;

  insert into public.app_contract_number_sequences as s (tenant_id, kind, year, last_value, updated_at)
  values (p_tenant_id, p_kind, v_year, 1, now())
  on conflict (tenant_id, kind, year)
  do update set
    last_value = s.last_value + 1,
    updated_at = now()
  returning last_value into v_next;

  v_prefix := p_kind;
  return v_prefix || '-' || v_year::text || '-' || lpad(v_next::text, 6, '0');
end;
$$;

comment on function public.app_contract_next_number(uuid, text, integer) is
  'Phase 10.9 — gera próximo número CTR/PKG atomicamente (upsert concorrente).';

revoke all on function public.app_contract_next_number(uuid, text, integer) from public;
grant execute on function public.app_contract_next_number(uuid, text, integer) to authenticated;
grant execute on function public.app_contract_next_number(uuid, text, integer) to service_role;

alter table public.app_contract_number_sequences enable row level security;

drop policy if exists app_contract_number_sequences_select_tenant on public.app_contract_number_sequences;
create policy app_contract_number_sequences_select_tenant
  on public.app_contract_number_sequences
  for select
  to authenticated
  using (public.app_user_can_access_tenant(tenant_id::text));

drop policy if exists app_contract_number_sequences_write_admin on public.app_contract_number_sequences;
create policy app_contract_number_sequences_write_admin
  on public.app_contract_number_sequences
  for all
  to authenticated
  using (public.app_user_is_tenant_admin(tenant_id))
  with check (public.app_user_is_tenant_admin(tenant_id));

-- ---------------------------------------------------------------------------
-- Expand idempotency scopes + status columns for domain operations
-- ---------------------------------------------------------------------------
alter table public.app_contract_idempotency_keys
  drop constraint if exists app_contract_idempotency_keys_scope_chk;

alter table public.app_contract_idempotency_keys
  add constraint app_contract_idempotency_keys_scope_chk
  check (scope in (
    'CREATE_FROM_BUDGET',
    'CREATE_PACKAGE',
    'CREATE_ENVELOPE',
    'WEBHOOK',
    'FINANCIAL_ACTIVATION',
    'PRONTUARIO_REGISTER',
    'GENERATE_PDF',
    'CREATE_CONTRACT',
    'CREATE_VERSION',
    'ADD_SIGNER',
    'SEND_ENVELOPE',
    'REQUEST_CHALLENGE',
    'VERIFY_CHALLENGE',
    'SIGN',
    'DECLINE',
    'CANCEL_ENVELOPE',
    'EXPIRE_ENVELOPE',
    'COMPLETE_CONTRACT_SIGNING'
  ));

alter table public.app_contract_idempotency_keys
  add column if not exists status text not null default 'RESERVED';

alter table public.app_contract_idempotency_keys
  add column if not exists input_fingerprint text null;

alter table public.app_contract_idempotency_keys
  add column if not exists result_ref jsonb null;

alter table public.app_contract_idempotency_keys
  add column if not exists completed_at timestamptz null;

alter table public.app_contract_idempotency_keys
  add column if not exists error_code text null;

alter table public.app_contract_idempotency_keys
  drop constraint if exists app_contract_idempotency_keys_status_chk;

alter table public.app_contract_idempotency_keys
  add constraint app_contract_idempotency_keys_status_chk
  check (status in ('RESERVED', 'COMPLETED', 'FAILED'));

comment on column public.app_contract_idempotency_keys.status is
  'Phase 10.9 — RESERVED|COMPLETED|FAILED. Sem PII/snapshots integrais em result_ref.';

-- Grants (030 criou ledger sem GRANT explícito; 031 completa)
grant select, insert on public.app_contract_ledger to authenticated;
grant select, insert, update, delete on public.app_contract_number_sequences to authenticated;
