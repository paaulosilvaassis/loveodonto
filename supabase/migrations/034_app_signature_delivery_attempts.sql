-- 034: delivery attempts simulados de assinatura — Phase 10.11
-- SOMENTE local/efêmero. Sem OTP/token/link integral/destination completa.
-- RLS deny-by-default; backend service_role only.

create table if not exists public.app_signature_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  envelope_id uuid not null,
  signer_id uuid not null,

  channel text not null,
  purpose text not null,
  destination_masked text null,

  status text not null default 'PENDING',
  provider text not null,
  provider_message_id text null,

  idempotency_key text not null,
  attempt_number integer not null default 1,

  requested_at timestamptz not null default now(),
  completed_at timestamptz null,
  failed_at timestamptz null,
  failure_code text null,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  row_version integer not null default 1,

  constraint app_signature_delivery_attempts_tenant_id_uidx unique (tenant_id, id),
  constraint app_signature_delivery_attempts_idempotency_uq
    unique (tenant_id, idempotency_key),
  constraint app_signature_delivery_attempts_channel_chk
    check (channel in ('EMAIL', 'SMS', 'WHATSAPP', 'IN_PERSON', 'TECHNICAL_HARNESS')),
  constraint app_signature_delivery_attempts_purpose_chk
    check (purpose in ('INVITATION', 'AUTHENTICATION_CHALLENGE', 'COMPLETION_NOTICE')),
  constraint app_signature_delivery_attempts_status_chk
    check (status in ('PENDING', 'SIMULATED', 'DELIVERED', 'FAILED', 'CANCELLED')),
  constraint app_signature_delivery_attempts_attempt_chk check (attempt_number >= 1),
  constraint app_signature_delivery_attempts_row_version_chk check (row_version >= 1),
  constraint app_signature_delivery_attempts_metadata_object_chk
    check (jsonb_typeof(metadata) = 'object'),
  constraint app_signature_delivery_attempts_no_sensitive_metadata_chk
    check (
      not (
        metadata ?| array[
          'token', 'otp', 'plainCode', 'fullLink', 'signedUrl',
          'destination', 'email', 'phone', 'cpf'
        ]
      )
    ),
  constraint app_signature_delivery_attempts_envelope_fk
    foreign key (tenant_id, envelope_id)
    references public.app_signature_envelopes (tenant_id, id)
    on delete cascade,
  constraint app_signature_delivery_attempts_signer_fk
    foreign key (tenant_id, signer_id)
    references public.app_signature_signers (tenant_id, id)
    on delete cascade
);

comment on table public.app_signature_delivery_attempts is
  'Phase 10.11 — tentativas de delivery simuladas; sem OTP/token/link integral.';

create index if not exists app_signature_delivery_attempts_envelope_idx
  on public.app_signature_delivery_attempts (tenant_id, envelope_id, requested_at desc);
create index if not exists app_signature_delivery_attempts_signer_idx
  on public.app_signature_delivery_attempts (tenant_id, signer_id, requested_at desc);
create index if not exists app_signature_delivery_attempts_status_idx
  on public.app_signature_delivery_attempts (tenant_id, status, requested_at desc);

drop trigger if exists trg_app_signature_delivery_attempts_tenant_immutable
  on public.app_signature_delivery_attempts;
create trigger trg_app_signature_delivery_attempts_tenant_immutable
before update on public.app_signature_delivery_attempts
for each row execute function public.app_contract_reject_tenant_id_change();

create or replace function public.app_signature_delivery_signer_belongs_to_envelope()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.app_signature_signers s
    where s.tenant_id = new.tenant_id
      and s.id = new.signer_id
      and s.envelope_id = new.envelope_id
  ) then
    raise exception 'APP_SIGNATURE_DELIVERY_SIGNER_ENVELOPE_MISMATCH'
      using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_app_signature_delivery_signer_envelope
  on public.app_signature_delivery_attempts;
create trigger trg_app_signature_delivery_signer_envelope
before insert or update on public.app_signature_delivery_attempts
for each row execute function public.app_signature_delivery_signer_belongs_to_envelope();

alter table public.app_signature_delivery_attempts enable row level security;
alter table public.app_signature_delivery_attempts force row level security;

revoke all on table public.app_signature_delivery_attempts from anon, authenticated;
grant select, insert, update on table public.app_signature_delivery_attempts to service_role;
