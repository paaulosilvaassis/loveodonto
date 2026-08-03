-- 032: sessões públicas de assinatura, challenges OTP e rate limits — Phase 10.10
--
-- SOMENTE local/efêmero nesta fase.
-- NÃO aplicar remotamente. NÃO ativar feature flags.
-- Tokens/OTP: somente hash (nunca texto bruto).
-- Acesso: backend service_role; sem SELECT/INSERT/UPDATE direto para authenticated.

-- ===========================================================================
-- app_signature_sessions
-- ===========================================================================

create table if not exists public.app_signature_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  envelope_id uuid not null,
  signer_id uuid not null,

  token_id text not null,
  token_hash text not null,

  status text not null default 'ACTIVE',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz null,
  revoked_at timestamptz null,
  consumed_at timestamptz null,

  ip_hash text null,
  user_agent_hash text null,

  created_at timestamptz not null default now(),
  row_version integer not null default 1,

  constraint app_signature_sessions_tenant_id_uidx unique (tenant_id, id),
  constraint app_signature_sessions_token_id_uq unique (tenant_id, token_id),
  constraint app_signature_sessions_token_hash_uq unique (tenant_id, token_hash),
  constraint app_signature_sessions_token_hash_fmt_chk
    check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint app_signature_sessions_token_id_nonempty_chk
    check (length(trim(token_id)) > 0),
  constraint app_signature_sessions_status_chk
    check (status in ('ACTIVE', 'CONSUMED', 'EXPIRED', 'REVOKED', 'LOCKED')),
  constraint app_signature_sessions_expires_after_issued_chk
    check (expires_at > issued_at),
  constraint app_signature_sessions_row_version_chk check (row_version >= 1),
  constraint app_signature_sessions_envelope_fk
    foreign key (tenant_id, envelope_id)
    references public.app_signature_envelopes (tenant_id, id)
    on delete cascade,
  constraint app_signature_sessions_signer_fk
    foreign key (tenant_id, signer_id)
    references public.app_signature_signers (tenant_id, id)
    on delete cascade
);

comment on table public.app_signature_sessions is
  'Phase 10.10 — sessões de assinatura pública; token_hash only; backend-only.';

create index if not exists app_signature_sessions_tenant_status_idx
  on public.app_signature_sessions (tenant_id, status);
create index if not exists app_signature_sessions_tenant_envelope_idx
  on public.app_signature_sessions (tenant_id, envelope_id);
create index if not exists app_signature_sessions_tenant_expires_idx
  on public.app_signature_sessions (tenant_id, expires_at)
  where status = 'ACTIVE';

drop trigger if exists trg_app_signature_sessions_tenant_immutable
  on public.app_signature_sessions;
create trigger trg_app_signature_sessions_tenant_immutable
before update on public.app_signature_sessions
for each row execute function public.app_contract_reject_tenant_id_change();

-- Signer deve pertencer ao envelope (consistência)
create or replace function public.app_signature_session_signer_belongs_to_envelope()
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
    raise exception 'APP_SIGNATURE_SESSION_SIGNER_ENVELOPE_MISMATCH'
      using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_app_signature_sessions_signer_envelope
  on public.app_signature_sessions;
create trigger trg_app_signature_sessions_signer_envelope
before insert or update on public.app_signature_sessions
for each row execute function public.app_signature_session_signer_belongs_to_envelope();

-- ===========================================================================
-- app_signature_challenges
-- ===========================================================================

create table if not exists public.app_signature_challenges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  envelope_id uuid not null,
  signer_id uuid not null,
  session_id uuid not null,

  challenge_type text not null,
  destination_hash text null,
  code_hash text not null,

  status text not null default 'PENDING',
  attempt_count integer not null default 0,
  max_attempts integer not null,

  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz null,
  consumed_at timestamptz null,
  invalidated_at timestamptz null,

  created_at timestamptz not null default now(),
  row_version integer not null default 1,

  constraint app_signature_challenges_tenant_id_uidx unique (tenant_id, id),
  constraint app_signature_challenges_code_hash_fmt_chk
    check (code_hash ~ '^[a-f0-9]{64}$'),
  constraint app_signature_challenges_status_chk
    check (status in (
      'PENDING', 'VERIFIED', 'CONSUMED', 'EXPIRED', 'INVALIDATED', 'LOCKED'
    )),
  constraint app_signature_challenges_type_chk
    check (challenge_type in (
      'OTP_EMAIL', 'OTP_SMS', 'ON_SCREEN', 'SECURE_LINK', 'UPLOAD',
      'EXTERNAL_PROVIDER', 'DIGITAL_CERTIFICATE'
    )),
  constraint app_signature_challenges_attempts_nonneg_chk check (attempt_count >= 0),
  constraint app_signature_challenges_max_attempts_chk check (max_attempts > 0),
  constraint app_signature_challenges_expires_after_issued_chk
    check (expires_at > issued_at),
  constraint app_signature_challenges_row_version_chk check (row_version >= 1),
  constraint app_signature_challenges_envelope_fk
    foreign key (tenant_id, envelope_id)
    references public.app_signature_envelopes (tenant_id, id)
    on delete cascade,
  constraint app_signature_challenges_signer_fk
    foreign key (tenant_id, signer_id)
    references public.app_signature_signers (tenant_id, id)
    on delete cascade,
  constraint app_signature_challenges_session_fk
    foreign key (tenant_id, session_id)
    references public.app_signature_sessions (tenant_id, id)
    on delete cascade
);

comment on table public.app_signature_challenges is
  'Phase 10.10 — OTP challenges; code_hash only; backend-only.';

create index if not exists app_signature_challenges_tenant_session_idx
  on public.app_signature_challenges (tenant_id, session_id);
create index if not exists app_signature_challenges_tenant_signer_status_idx
  on public.app_signature_challenges (tenant_id, signer_id, status);

drop trigger if exists trg_app_signature_challenges_tenant_immutable
  on public.app_signature_challenges;
create trigger trg_app_signature_challenges_tenant_immutable
before update on public.app_signature_challenges
for each row execute function public.app_contract_reject_tenant_id_change();

create or replace function public.app_signature_challenge_scope_consistent()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.app_signature_sessions sess
    where sess.tenant_id = new.tenant_id
      and sess.id = new.session_id
      and sess.envelope_id = new.envelope_id
      and sess.signer_id = new.signer_id
  ) then
    raise exception 'APP_SIGNATURE_CHALLENGE_SCOPE_MISMATCH'
      using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_app_signature_challenges_scope
  on public.app_signature_challenges;
create trigger trg_app_signature_challenges_scope
before insert or update on public.app_signature_challenges
for each row execute function public.app_signature_challenge_scope_consistent();

-- ===========================================================================
-- app_signature_rate_limits
-- ===========================================================================

create table if not exists public.app_signature_rate_limits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  scope_key text not null,
  operation text not null,
  window_started_at timestamptz not null,
  window_ends_at timestamptz not null,
  counter integer not null default 0,
  blocked_until timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,

  constraint app_signature_rate_limits_scope_uq
    unique (tenant_id, scope_key, operation, window_started_at),
  constraint app_signature_rate_limits_operation_chk
    check (operation in (
      'OPEN_SESSION', 'REQUEST_CHALLENGE', 'VERIFY_CHALLENGE', 'SIGN', 'DECLINE'
    )),
  constraint app_signature_rate_limits_counter_chk check (counter >= 0),
  constraint app_signature_rate_limits_window_chk check (window_ends_at > window_started_at),
  constraint app_signature_rate_limits_scope_nonempty_chk
    check (length(trim(scope_key)) > 0),
  constraint app_signature_rate_limits_row_version_chk check (row_version >= 1)
);

comment on table public.app_signature_rate_limits is
  'Phase 10.10 — rate limits persistidos (janela/contador); sem IP integral.';

create index if not exists app_signature_rate_limits_lookup_idx
  on public.app_signature_rate_limits (tenant_id, scope_key, operation, window_ends_at desc);

drop trigger if exists trg_app_signature_rate_limits_tenant_immutable
  on public.app_signature_rate_limits;
create trigger trg_app_signature_rate_limits_tenant_immutable
before update on public.app_signature_rate_limits
for each row execute function public.app_contract_reject_tenant_id_change();

drop trigger if exists trg_app_signature_rate_limits_touch_updated_at
  on public.app_signature_rate_limits;
create trigger trg_app_signature_rate_limits_touch_updated_at
before update on public.app_signature_rate_limits
for each row execute function public.touch_updated_at();

-- ===========================================================================
-- RLS — sem acesso direto authenticated/anon (backend service_role)
-- ===========================================================================

alter table public.app_signature_sessions enable row level security;
alter table public.app_signature_sessions force row level security;
alter table public.app_signature_challenges enable row level security;
alter table public.app_signature_challenges force row level security;
alter table public.app_signature_rate_limits enable row level security;
alter table public.app_signature_rate_limits force row level security;

-- Nenhuma policy para authenticated/anon → deny by default sob RLS.
-- service_role bypassa RLS (Admin API / harness local).

revoke all on table public.app_signature_sessions from anon, authenticated;
revoke all on table public.app_signature_challenges from anon, authenticated;
revoke all on table public.app_signature_rate_limits from anon, authenticated;

grant select, insert, update, delete on table public.app_signature_sessions to service_role;
grant select, insert, update, delete on table public.app_signature_challenges to service_role;
grant select, insert, update, delete on table public.app_signature_rate_limits to service_role;
