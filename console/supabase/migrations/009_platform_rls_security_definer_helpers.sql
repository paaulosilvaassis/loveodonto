-- Evita recursão infinita em RLS: as funções abaixo leem platform_admin_users
-- dentro de políticas NA MESMA tabela. Sem SECURITY DEFINER, o Postgres aplica RLS
-- de novo dentro da subconsulta → stack depth / HTTP 500 / erro 54001 no PostgREST.

create or replace function public.platform_user_role(user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role_slug
  from public.platform_admin_users
  where id = user_id and is_active = true
  limit 1
$$;

create or replace function public.has_platform_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select role_slug
    from public.platform_admin_users
    where id = auth.uid() and is_active = true
    limit 1
  )
  select exists(
    select 1
    from me
    left join public.platform_roles r on r.role_slug = me.role_slug
    left join public.platform_role_permissions rp on rp.role_id = r.id
    left join public.platform_permissions p on p.id = rp.permission_id
    where p.permission_key = permission_key or me.role_slug in ('owner', 'super_admin')
  );
$$;

revoke all on function public.platform_user_role(uuid) from public;
revoke all on function public.has_platform_permission(text) from public;
grant execute on function public.platform_user_role(uuid) to authenticated;
grant execute on function public.has_platform_permission(text) to authenticated;
