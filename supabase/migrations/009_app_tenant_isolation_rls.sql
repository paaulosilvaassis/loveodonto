-- Hardening multi-tenant: tenant_users read restrito + bloqueio de troca de tenant_id

-- Remove policy genérica de SELECT em tenant_users (002) se existir
drop policy if exists tenant_users_tenant_select_policy on public.tenant_users;
drop policy if exists tenant_users_tenant_modify_policy on public.tenant_users;

-- Usuário lê apenas a própria linha OU admins do tenant
create policy tenant_users_select_scoped on public.tenant_users
  for select
  using (
    auth.uid() is not null
    and (
      user_id = auth.uid()
      or exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid()
          and tu.tenant_id = tenant_users.tenant_id
          and lower(coalesce(tu.role_slug, tu.role, '')) in ('owner', 'admin', 'master')
          and coalesce(tu.is_active, true) = true
          and lower(coalesce(tu.status, 'active')) <> 'inactive'
      )
    )
  );

-- Writes apenas admins do mesmo tenant
create policy tenant_users_modify_admin on public.tenant_users
  for all
  using (
    auth.uid() is not null
    and exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid()
        and tu.tenant_id = tenant_users.tenant_id
        and lower(coalesce(tu.role_slug, tu.role, '')) in ('owner', 'admin', 'master')
        and coalesce(tu.is_active, true) = true
    )
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and tenant_id = (
      select tu.tenant_id from public.tenant_users tu
      where tu.user_id = auth.uid()
        and lower(coalesce(tu.role_slug, tu.role, '')) in ('owner', 'admin', 'master')
      order by tu.created_at asc
      limit 1
    )
  );

-- Identities: admin-only read/write (substitui policy permissiva de 008)
drop policy if exists identities_read_admin on public.identities;
drop policy if exists identity_events_read_admin on public.identity_events;
drop policy if exists identities_tenant_select_policy on public.identities;
drop policy if exists identities_tenant_modify_policy on public.identities;
drop policy if exists identity_events_tenant_select_policy on public.identity_events;
drop policy if exists identity_events_tenant_modify_policy on public.identity_events;

create policy identities_tenant_admin_select on public.identities
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id)
    and exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid()
        and tu.tenant_id = identities.tenant_id
        and lower(coalesce(tu.role_slug, tu.role, '')) in ('owner', 'admin', 'master')
    )
  );

create policy identities_tenant_admin_modify on public.identities
  for all using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id)
    and exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid()
        and tu.tenant_id = identities.tenant_id
        and lower(coalesce(tu.role_slug, tu.role, '')) in ('owner', 'admin', 'master')
    )
  )
  with check (
    tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id)
  );

create policy identity_events_tenant_admin_select on public.identity_events
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id)
    and exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid()
        and tu.tenant_id = identity_events.tenant_id
        and lower(coalesce(tu.role_slug, tu.role, '')) in ('owner', 'admin', 'master')
    )
  );
