-- Login da Console: o SELECT em platform_admin_users não pode depender só de
-- has_platform_permission(), pois essa função também lê platform_admin_users
-- (recursão de RLS / bootstrap impossível).
-- Esta policy permite que o usuário autenticado leia a própria linha.

drop policy if exists "console admin read self" on public.platform_admin_users;

create policy "console admin read self"
  on public.platform_admin_users
  for select
  to authenticated
  using (id = auth.uid());
