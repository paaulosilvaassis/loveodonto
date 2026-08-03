-- Reforço: policy de auto-leitura sem "TO authenticated" — em alguns projetos o JWT
-- do PostgREST não associa o papel esperado e a policy não aplicava.
-- Mantém: usuário só lê a própria linha (id = auth.uid()).

drop policy if exists "console admin read self" on public.platform_admin_users;

create policy "console admin read self"
  on public.platform_admin_users
  for select
  using (auth.uid() is not null and id = auth.uid());
