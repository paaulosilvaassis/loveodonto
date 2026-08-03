-- 005_app_collaborator_access_invites.sql
-- Expansão aditiva para vínculo colaborador-usuário e convites canônicos.
-- Phase 9.2G: garante colunas legadas (status/is_active) antes do UPDATE de backfill,
-- para bancos vazios (bootstrap local) e legados (console sem 007). Idempotente.

alter table if exists public.tenant_users
  add column if not exists collaborator_id text;

-- Colunas assumidas pelo COALESCE abaixo (podem faltar em schema legado/console parcial).
alter table if exists public.tenant_users
  add column if not exists status text;

alter table if exists public.tenant_users
  add column if not exists is_active boolean;

alter table if exists public.tenant_users
  add column if not exists has_system_access boolean;

alter table if exists public.tenant_users
  add column if not exists invitation_status text;

update public.tenant_users
set has_system_access = coalesce(has_system_access, is_active, status = 'active', true)
where has_system_access is null;

update public.tenant_users
set invitation_status = coalesce(nullif(invitation_status, ''), 'none')
where invitation_status is null or invitation_status = '';

alter table if exists public.tenant_users
  alter column has_system_access set default true;

alter table if exists public.tenant_users
  alter column invitation_status set default 'none';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenant_users_invitation_status_check'
  ) then
    alter table public.tenant_users
      add constraint tenant_users_invitation_status_check
      check (invitation_status in ('none', 'pending', 'sent', 'accepted', 'expired', 'revoked'));
  end if;
end $$;

create index if not exists tenant_users_tenant_email_idx
  on public.tenant_users (tenant_id, lower(email));

create index if not exists tenant_users_collaborator_id_idx
  on public.tenant_users (collaborator_id)
  where collaborator_id is not null;

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tenant_user_id uuid null references public.tenant_users(id) on delete set null,
  collaborator_id text null,
  email text not null,
  profile_role text not null,
  invite_link text null,
  invite_token_hash text null,
  status text not null default 'pending',
  expires_at timestamptz not null,
  sent_at timestamptz null,
  accepted_at timestamptz null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invitations_status_check'
  ) then
    alter table public.invitations
      add constraint invitations_status_check
      check (status in ('pending', 'sent', 'accepted', 'expired', 'revoked'));
  end if;
end $$;

create index if not exists invitations_tenant_email_idx
  on public.invitations (tenant_id, lower(email));

create index if not exists invitations_tenant_status_idx
  on public.invitations (tenant_id, status);

create index if not exists invitations_collaborator_idx
  on public.invitations (tenant_id, collaborator_id)
  where collaborator_id is not null;

create index if not exists invitations_expires_idx
  on public.invitations (expires_at);

create index if not exists invitations_token_hash_idx
  on public.invitations (invite_token_hash)
  where invite_token_hash is not null;

create unique index if not exists invitations_pending_email_unique
  on public.invitations (tenant_id, lower(email))
  where status in ('pending', 'sent');

alter table if exists public.invitations enable row level security;

drop policy if exists invitations_read_own_tenant on public.invitations;
create policy invitations_read_own_tenant
on public.invitations
for select
using (
  auth.uid() is not null
  and public.app_user_can_access_tenant(tenant_id::text)
);

drop policy if exists invitations_manage_admin on public.invitations;
create policy invitations_manage_admin
on public.invitations
for all
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.tenant_users tu
    where tu.tenant_id = invitations.tenant_id
      and tu.user_id = auth.uid()
      and coalesce(tu.has_system_access, tu.is_active, tu.status = 'active', true)
      and coalesce(nullif(tu.role, ''), nullif(tu.role_slug, ''), 'atendimento') in ('owner', 'admin', 'master')
  )
)
with check (
  auth.uid() is not null
  and exists (
    select 1
    from public.tenant_users tu
    where tu.tenant_id = invitations.tenant_id
      and tu.user_id = auth.uid()
      and coalesce(tu.has_system_access, tu.is_active, tu.status = 'active', true)
      and coalesce(nullif(tu.role, ''), nullif(tu.role_slug, ''), 'atendimento') in ('owner', 'admin', 'master')
  )
);

create or replace function public.sync_tenant_users_compat()
returns trigger
language plpgsql
as $$
begin
  new.role := coalesce(nullif(new.role, ''), nullif(new.role_slug, ''), 'atendimento');
  new.role_slug := coalesce(nullif(new.role_slug, ''), new.role, 'atendimento');
  new.is_active := coalesce(new.is_active, new.status = 'active', true);
  new.has_system_access := coalesce(new.has_system_access, new.is_active, true);
  new.status := case when new.is_active then 'active' else 'inactive' end;
  new.invitation_status := coalesce(nullif(new.invitation_status, ''), 'none');
  return new;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_invitations_touch_updated_at on public.invitations;
create trigger trg_invitations_touch_updated_at
before update on public.invitations
for each row execute function public.touch_updated_at();

create or replace function public.get_app_user_tenant_access()
returns table (
  tenant_id uuid,
  role text,
  is_active boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    tu.tenant_id,
    coalesce(nullif(tu.role, ''), nullif(tu.role_slug, ''), 'atendimento') as role,
    (
      coalesce(tu.has_system_access, tu.is_active, tu.status = 'active', true)
      and coalesce(tu.is_active, tu.status = 'active', true)
    ) as is_active
  from public.tenant_users tu
  where tu.user_id = auth.uid()
  order by tu.created_at asc
  limit 1;
$$;

revoke all on function public.get_app_user_tenant_access() from public;
grant execute on function public.get_app_user_tenant_access() to authenticated;
