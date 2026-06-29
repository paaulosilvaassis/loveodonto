-- 012 (dev compat): mesma correção de recursão RLS, adaptada ao schema legado do dev.
-- Usa apenas colunas presentes: tenant_id, user_id, role_slug, status.
-- Não referencia: role, is_active, has_system_access (ausentes no dev).
-- Não toca identities/identity_events (tabelas inexistentes no dev).
-- Produção usa 012_fix_tenant_users_rls_recursion.sql (schema completo).

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
      and lower(coalesce(tu.role_slug, '')) in ('owner', 'admin', 'master')
      and lower(coalesce(tu.status, 'active')) not in ('inactive', 'disabled', 'revoked')
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
    and lower(coalesce(tu.role_slug, '')) in ('owner', 'admin', 'master')
    and lower(coalesce(tu.status, 'active')) not in ('inactive', 'disabled', 'revoked')
  order by tu.created_at asc
  limit 1;
$$;

revoke all on function public.app_user_is_tenant_admin(uuid) from public;
revoke all on function public.app_user_admin_tenant_id() from public;
grant execute on function public.app_user_is_tenant_admin(uuid) to authenticated;
grant execute on function public.app_user_admin_tenant_id() to authenticated;

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
