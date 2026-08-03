-- 030: Contract Ledger V2 — Phase 10.8
-- NÃO EXECUTAR automaticamente em remoto/produção.
--
-- Ledger jurídico append-only, separado de app_contract_audit_events (audit operacional).
-- Pré-requisitos: 028 tables, 009 helpers.
--
-- Service role bypassa RLS — documentado. Master SaaS sem acesso clínico irrestrito.
-- ROLLBACK: drop table + triggers (manual).

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.app_contract_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contract_id uuid not null,
  contract_version_id uuid null,
  envelope_id uuid null,

  sequence_number bigint not null,
  event_type text not null,

  actor_type text not null,
  actor_id text null,
  actor_name text null,
  source text not null,

  payload jsonb not null default '{}'::jsonb,

  previous_entry_hash text null,
  entry_hash text not null,

  idempotency_key text null,
  correlation_id text null,
  causation_id text null,

  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),

  constraint app_contract_ledger_sequence_chk check (sequence_number >= 1),
  constraint app_contract_ledger_hash_format_chk
    check (entry_hash ~ '^[a-f0-9]{64}$'),
  constraint app_contract_ledger_prev_hash_format_chk
    check (previous_entry_hash is null or previous_entry_hash ~ '^[a-f0-9]{64}$'),
  constraint app_contract_ledger_tenant_contract_seq_uq
    unique (tenant_id, contract_id, sequence_number),
  constraint app_contract_ledger_tenant_contract_hash_uq
    unique (tenant_id, contract_id, entry_hash),
  constraint app_contract_ledger_contract_fk
    foreign key (tenant_id, contract_id)
    references public.app_contracts (tenant_id, id)
    on delete cascade,
  constraint app_contract_ledger_version_fk
    foreign key (tenant_id, contract_version_id)
    references public.app_contract_versions (tenant_id, id)
    on delete restrict,
  constraint app_contract_ledger_envelope_fk
    foreign key (tenant_id, envelope_id)
    references public.app_signature_envelopes (tenant_id, id)
    on delete restrict
);

create unique index if not exists app_contract_ledger_idempotency_uq
  on public.app_contract_ledger (tenant_id, contract_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists app_contract_ledger_tenant_contract_seq_idx
  on public.app_contract_ledger (tenant_id, contract_id, sequence_number);

-- ---------------------------------------------------------------------------
-- Append-only triggers (sem UPDATE / DELETE)
-- ---------------------------------------------------------------------------
create or replace function public.app_contract_ledger_forbid_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'app_contract_ledger is append-only (no update)';
end;
$$;

create or replace function public.app_contract_ledger_forbid_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'app_contract_ledger is append-only (no delete)';
end;
$$;

drop trigger if exists trg_app_contract_ledger_no_update on public.app_contract_ledger;
create trigger trg_app_contract_ledger_no_update
  before update on public.app_contract_ledger
  for each row execute function public.app_contract_ledger_forbid_update();

drop trigger if exists trg_app_contract_ledger_no_delete on public.app_contract_ledger;
create trigger trg_app_contract_ledger_no_delete
  before delete on public.app_contract_ledger
  for each row execute function public.app_contract_ledger_forbid_delete();

-- Tenant imutável
create or replace function public.app_contract_ledger_forbid_tenant_change()
returns trigger
language plpgsql
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'app_contract_ledger.tenant_id is immutable';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- SELECT: membro do tenant
-- INSERT: admin do tenant
-- SEM UPDATE / DELETE policy
-- ---------------------------------------------------------------------------
alter table public.app_contract_ledger enable row level security;

drop policy if exists app_contract_ledger_select_tenant on public.app_contract_ledger;
create policy app_contract_ledger_select_tenant on public.app_contract_ledger
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

drop policy if exists app_contract_ledger_insert_admin on public.app_contract_ledger;
create policy app_contract_ledger_insert_admin on public.app_contract_ledger
  for insert
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

comment on table public.app_contract_ledger is
  'Phase 10.8 — ledger jurídico append-only. NÃO aplicar automaticamente. Sem dual-write com legado.';
