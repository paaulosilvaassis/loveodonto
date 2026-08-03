-- 014: RLS em clinic_profiles (gap da migration 011).
-- Leitura: qualquer membro autenticado do tenant (JWT tenant_id).
-- Escrita: admins do tenant (owner/admin/master).
--
-- ROLLBACK (manual):
--   drop policy if exists clinic_profiles_select_tenant on public.clinic_profiles;
--   drop policy if exists clinic_profiles_modify_admin on public.clinic_profiles;
--   alter table public.clinic_profiles disable row level security;

alter table if exists public.clinic_profiles enable row level security;

-- Remove policies genéricas de tenant_id (002) se existirem
drop policy if exists clinic_profiles_tenant_select_policy on public.clinic_profiles;
drop policy if exists clinic_profiles_tenant_modify_policy on public.clinic_profiles;

drop policy if exists clinic_profiles_select_tenant on public.clinic_profiles;
create policy clinic_profiles_select_tenant on public.clinic_profiles
  for select
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

drop policy if exists clinic_profiles_modify_admin on public.clinic_profiles;
create policy clinic_profiles_modify_admin on public.clinic_profiles
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- Rejeita logo em base64 (Storage é a fonte oficial)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clinic_profiles_logo_url_no_data_uri_chk'
  ) then
    alter table public.clinic_profiles
      add constraint clinic_profiles_logo_url_no_data_uri_chk
      check (logo_url is null or logo_url !~* '^data:');
  end if;
end $$;

comment on table public.clinic_profiles is
  'Perfil cadastral/visual da clínica por tenant. Fonte servidor; IndexedDB é cache.';
