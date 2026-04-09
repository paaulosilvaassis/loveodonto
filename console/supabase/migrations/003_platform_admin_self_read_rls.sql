-- Quebra o deadlock de RLS no login da Console:
-- a política "console read admins" exige has_platform_permission('settings.read'),
-- e has_platform_permission consulta platform_admin_users — sem linha visível, o admin nunca passa.
-- Esta política permite que o usuário autenticado leia apenas o próprio registro (bootstrap do JWT).

drop policy if exists "console admin read self" on public.platform_admin_users;

create policy "console admin read self" on public.platform_admin_users
  for select
  using (auth.uid() is not null and id = auth.uid());
