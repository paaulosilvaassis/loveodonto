-- Bundle único — colar no SQL Editor do MESMO projeto do VITE_CONSOLE_SUPABASE_URL.
-- Corrige 54001: (1) policies separadas + manage sem SELECT; (2) RPC
-- get_my_platform_admin_profile (SECURITY DEFINER) para o login não depender
-- da ordem de avaliação do planner em expressões AND nas policies.

-- === Funções: leem platform_admin_users sem sofrer RLS recursiva ===
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

-- Reforço (Postgres 15+): se falhar no seu host, o bloco abaixo ignora sem quebrar o script
do $rls$
begin
  execute 'alter function public.platform_user_role(uuid) set row_security to off';
exception
  when others then
    raise notice 'platform_user_role: ignorando set row_security — %', sqlerrm;
end;
$rls$;

do $rls$
begin
  execute 'alter function public.has_platform_permission(text) set row_security to off';
exception
  when others then
    raise notice 'has_platform_permission: ignorando set row_security — %', sqlerrm;
end;
$rls$;

-- === Remover qualquer policy antiga que possa ter ficado pela metade ===
drop policy if exists "console admin read self" on public.platform_admin_users;
drop policy if exists "console read admins" on public.platform_admin_users;
drop policy if exists "console select platform admins" on public.platform_admin_users;
drop policy if exists "console admin select self" on public.platform_admin_users;
drop policy if exists "console admin select others" on public.platform_admin_users;
drop policy if exists "console manage admins" on public.platform_admin_users;
drop policy if exists "console manage admins insert" on public.platform_admin_users;
drop policy if exists "console manage admins update" on public.platform_admin_users;
drop policy if exists "console manage admins delete" on public.platform_admin_users;

-- Login: SOMENTE id = auth.uid() — nunca chama has_platform_permission
create policy "console admin select self"
  on public.platform_admin_users
  for select
  using (auth.uid() is not null and id = auth.uid());

-- Ver outros admins: exige id diferente ANTES de has_ (duas policies = sem CASE)
create policy "console admin select others"
  on public.platform_admin_users
  for select
  using (
    auth.uid() is not null
    and id <> auth.uid()
    and public.has_platform_permission('settings.read')
  );

-- Gestão: sem SELECT (FOR ALL original incluía SELECT e gerava 54001)
create policy "console manage admins insert"
  on public.platform_admin_users
  for insert
  with check (public.has_platform_permission('settings.write'));

create policy "console manage admins update"
  on public.platform_admin_users
  for update
  using (public.has_platform_permission('settings.write'))
  with check (public.has_platform_permission('settings.write'));

create policy "console manage admins delete"
  on public.platform_admin_users
  for delete
  using (public.has_platform_permission('settings.write'));

-- === Login da Console: RPC com row_security OFF no próprio CREATE (PL/pgSQL) ===
-- Evita 54001: SELECT direto na tabela passa por policies; aqui não.
drop function if exists public.get_my_platform_admin_profile();

create function public.get_my_platform_admin_profile()
returns table (
  id uuid,
  email text,
  full_name text,
  role_slug text,
  is_active boolean
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  return query
  select p.id, p.email, p.full_name, p.role_slug, p.is_active
  from public.platform_admin_users p
  where p.id = auth.uid()
    and coalesce(p.is_active, false) = true
  limit 1;
end;
$$;

revoke all on function public.get_my_platform_admin_profile() from public;
grant execute on function public.get_my_platform_admin_profile() to authenticated;

do $rpc$
begin
  execute 'alter function public.get_my_platform_admin_profile() owner to postgres';
exception
  when others then
    raise notice 'get_my_platform_admin_profile owner: %', sqlerrm;
end;
$rpc$;
