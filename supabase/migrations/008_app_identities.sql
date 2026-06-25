-- 008_app_identities.sql
-- Identity Management Layer (Love Odonto SaaS) — aditivo, não remove estruturas legadas.

create table if not exists public.identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  collaborator_id text null,
  tenant_user_id uuid null references public.tenant_users(id) on delete set null,
  auth_user_id uuid null,
  email text not null,
  full_name text null,
  role_slug text not null default 'atendimento',
  status text not null default 'invitation_pending',
  invitation_status text not null default 'none',
  password_status text not null default 'pending',
  identity_health text not null default 'healthy',
  last_login_at timestamptz null,
  last_invite_sent_at timestamptz null,
  last_password_reset_sent_at timestamptz null,
  disabled_at timestamptz null,
  disabled_by uuid null,
  disabled_reason text null,
  disabled_reason_description text null,
  expected_return_at timestamptz null,
  reactivated_at timestamptz null,
  reactivated_by uuid null,
  reactivation_reason text null,
  permissions_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'identities_status_check') then
    alter table public.identities add constraint identities_status_check check (
      status in (
        'active', 'invitation_pending', 'password_pending', 'password_reset_sent',
        'suspended', 'disabled', 'deleted', 'broken_link', 'repaired', 'waiting_sync'
      )
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'identities_invitation_status_check') then
    alter table public.identities add constraint identities_invitation_status_check check (
      invitation_status in ('none', 'sent', 'accepted', 'expired', 'failed')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'identities_password_status_check') then
    alter table public.identities add constraint identities_password_status_check check (
      password_status in ('pending', 'created', 'reset_sent', 'reset_required')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'identities_health_check') then
    alter table public.identities add constraint identities_health_check check (
      identity_health in (
        'healthy', 'needs_repair', 'auth_missing', 'tenant_user_missing',
        'collaborator_link_missing', 'role_mismatch', 'email_mismatch', 'permissions_outdated'
      )
    );
  end if;
end $$;

create unique index if not exists identities_tenant_email_unique
  on public.identities (tenant_id, lower(email));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'identities_tenant_email_uq') then
    alter table public.identities
      add constraint identities_tenant_email_uq unique (tenant_id, email);
  end if;
end $$;

create unique index if not exists identities_tenant_collaborator_unique
  on public.identities (tenant_id, collaborator_id)
  where collaborator_id is not null;

create index if not exists identities_tenant_id_idx on public.identities (tenant_id);
create index if not exists identities_auth_user_id_idx on public.identities (auth_user_id) where auth_user_id is not null;
create index if not exists identities_collaborator_id_idx on public.identities (collaborator_id) where collaborator_id is not null;
create index if not exists identities_email_idx on public.identities (lower(email));
create index if not exists identities_status_idx on public.identities (tenant_id, status);
create index if not exists identities_health_idx on public.identities (tenant_id, identity_health);

create table if not exists public.identity_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  identity_id uuid null references public.identities(id) on delete set null,
  collaborator_id text null,
  tenant_user_id uuid null,
  auth_user_id uuid null,
  actor_user_id uuid null,
  actor_email text null,
  action text not null,
  previous_status text null,
  new_status text null,
  previous_role text null,
  new_role text null,
  result text not null default 'success',
  message text null,
  ip_address text null,
  user_agent text null,
  origin text null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists identity_events_tenant_idx on public.identity_events (tenant_id, created_at desc);
create index if not exists identity_events_identity_idx on public.identity_events (identity_id, created_at desc);
create index if not exists identity_events_action_idx on public.identity_events (tenant_id, action);

alter table if exists public.identities enable row level security;
alter table if exists public.identity_events enable row level security;

drop policy if exists identities_read_admin on public.identities;
create policy identities_read_admin on public.identities for select using (
  auth.uid() is not null and public.app_user_can_access_tenant(tenant_id)
);

drop policy if exists identity_events_read_admin on public.identity_events;
create policy identity_events_read_admin on public.identity_events for select using (
  auth.uid() is not null and public.app_user_can_access_tenant(tenant_id)
);

create or replace function public.touch_identities_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_identities_touch_updated_at on public.identities;
create trigger trg_identities_touch_updated_at
before update on public.identities
for each row execute function public.touch_identities_updated_at();

-- Backfill seguro a partir de tenant_users (não apaga nem bloqueia)
insert into public.identities (
  tenant_id, collaborator_id, tenant_user_id, auth_user_id, email, full_name, role_slug,
  status, invitation_status, password_status, identity_health, last_login_at, metadata
)
select
  tu.tenant_id,
  nullif(trim(tu.collaborator_id), ''),
  tu.id,
  tu.user_id,
  lower(trim(tu.email)),
  tu.full_name,
  coalesce(nullif(tu.role_slug, ''), nullif(tu.role, ''), 'atendimento'),
  case
    when coalesce(tu.has_system_access, tu.is_active, true) = false then 'disabled'
    when coalesce(tu.invitation_status, 'none') in ('sent', 'pending') then 'invitation_pending'
    when coalesce(tu.invitation_status, 'none') = 'accepted' and tu.user_id is not null then 'active'
    when tu.user_id is null then 'invitation_pending'
    else 'active'
  end,
  case coalesce(tu.invitation_status, 'none')
    when 'pending' then 'sent'
    when 'revoked' then 'none'
    else coalesce(nullif(tu.invitation_status, ''), 'none')
  end,
  case when tu.user_id is not null then 'created' else 'pending' end,
  case when tu.user_id is null then 'auth_missing' else 'healthy' end,
  null,
  jsonb_build_object('backfill_source', 'tenant_users', 'backfill_at', now())
from public.tenant_users tu
where tu.email is not null and trim(tu.email) <> ''
on conflict (tenant_id, lower(email)) do update set
  tenant_user_id = coalesce(public.identities.tenant_user_id, excluded.tenant_user_id),
  auth_user_id = coalesce(public.identities.auth_user_id, excluded.auth_user_id),
  collaborator_id = coalesce(public.identities.collaborator_id, excluded.collaborator_id),
  full_name = coalesce(excluded.full_name, public.identities.full_name),
  role_slug = excluded.role_slug,
  updated_at = now();

-- Vincular collaborator_id onde tenant_users já tem
update public.identities i
set collaborator_id = tu.collaborator_id, updated_at = now()
from public.tenant_users tu
where i.tenant_user_id = tu.id
  and tu.collaborator_id is not null
  and trim(tu.collaborator_id) <> ''
  and (i.collaborator_id is null or i.collaborator_id = '');
