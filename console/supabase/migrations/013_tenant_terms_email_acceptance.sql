-- Aceite de termos via e-mail / primeiro acesso (pendente até confirmação do responsável).

alter table if exists public.tenant_legal_profiles
  alter column liability_accepted_at drop not null;

alter table if exists public.tenant_legal_profiles
  add column if not exists liability_status text not null default 'pending';

alter table if exists public.tenant_legal_profiles
  add column if not exists liability_acceptance_token_hash text;

alter table if exists public.tenant_legal_profiles
  add column if not exists liability_acceptance_expires_at timestamptz;

alter table if exists public.tenant_legal_profiles
  add column if not exists onboarding_email_sent_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenant_legal_profiles_liability_status_check'
  ) then
    alter table public.tenant_legal_profiles
      add constraint tenant_legal_profiles_liability_status_check
      check (liability_status in ('pending', 'accepted', 'expired'));
  end if;
end $$;
