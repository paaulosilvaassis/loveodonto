-- RLS para leitura segura do app principal (tenant isolado)
-- Requer custom claim `tenant_id` no JWT do usuário autenticado no app.

create or replace function public.app_current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif((auth.jwt() ->> 'tenant_id'), '')::uuid
$$;

drop policy if exists "app tenant read tenants" on public.tenants;
create policy "app tenant read tenants" on public.tenants
  for select
  using (
    id = public.app_current_tenant_id()
    or public.has_platform_permission('tenants.read')
  );

drop policy if exists "app tenant read modules" on public.tenant_modules;
create policy "app tenant read modules" on public.tenant_modules
  for select
  using (
    tenant_id = public.app_current_tenant_id()
    or public.has_platform_permission('tenants.read')
  );

drop policy if exists "app tenant read subscriptions" on public.tenant_subscriptions;
create policy "app tenant read subscriptions" on public.tenant_subscriptions
  for select
  using (
    tenant_id = public.app_current_tenant_id()
    or public.has_platform_permission('billing.read')
  );

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tenant_limits'
  ) then
    execute 'drop policy if exists "app tenant read limits" on public.tenant_limits';
    execute 'create policy "app tenant read limits" on public.tenant_limits for select using (tenant_id = public.app_current_tenant_id() or public.has_platform_permission(''billing.read''))';
  end if;
end $$;

drop policy if exists "app tenant read flags" on public.feature_flags;
create policy "app tenant read flags" on public.feature_flags
  for select
  using (
    scope_type = 'global'
    or scope_ref = (public.app_current_tenant_id())::text
    or public.has_platform_permission('flags.read')
  );
