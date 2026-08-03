-- 012: Corrige recursão infinita em RLS de tenant_users (PostgreSQL 42P17).
-- Causa: tenant_users_select_scoped e tenant_users_modify_admin (009) consultavam
-- public.tenant_users dentro da própria policy → loop infinito.
-- Padrão: SECURITY DEFINER (igual console/009_platform_rls_security_definer_helpers).

create or replace function public.app_user_is_tenant_admin(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_users tu
    where tu.user_id = auth.uid()
      and tu.tenant_id = p_tenant_id
      and lower(coalesce(tu.role_slug, tu.role, '')) in ('owner', 'admin', 'master')
      and coalesce(tu.has_system_access, tu.is_active, tu.status = 'active', true) = true
      and coalesce(tu.is_active, true) = true
      and lower(coalesce(tu.status, 'active')) <> 'inactive'
  );
$$;

create or replace function public.app_user_admin_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tu.tenant_id
  from public.tenant_users tu
  where tu.user_id = auth.uid()
    and lower(coalesce(tu.role_slug, tu.role, '')) in ('owner', 'admin', 'master')
    and coalesce(tu.has_system_access, tu.is_active, tu.status = 'active', true) = true
    and coalesce(tu.is_active, true) = true
  order by tu.created_at asc
  limit 1;
$$;

revoke all on function public.app_user_is_tenant_admin(uuid) from public;
revoke all on function public.app_user_admin_tenant_id() from public;
grant execute on function public.app_user_is_tenant_admin(uuid) to authenticated;
grant execute on function public.app_user_admin_tenant_id() to authenticated;

-- Remove policies recursivas
drop policy if exists tenant_users_select_scoped on public.tenant_users;
drop policy if exists tenant_users_modify_admin on public.tenant_users;

create policy tenant_users_select_scoped on public.tenant_users
  for select
  using (
    auth.uid() is not null
    and (
      user_id = auth.uid()
      or public.app_user_is_tenant_admin(tenant_id)
    )
  );

create policy tenant_users_modify_admin on public.tenant_users
  for all
  using (
    auth.uid() is not null
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and tenant_id = public.app_user_admin_tenant_id()
  );

-- identities / identity_events: elimina subconsultas diretas em tenant_users
drop policy if exists identities_tenant_admin_select on public.identities;
drop policy if exists identities_tenant_admin_modify on public.identities;
drop policy if exists identity_events_tenant_admin_select on public.identity_events;

create policy identities_tenant_admin_select on public.identities
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

create policy identities_tenant_admin_modify on public.identities
  for all using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy identity_events_tenant_admin_select on public.identity_events
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );
