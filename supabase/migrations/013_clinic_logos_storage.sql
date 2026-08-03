-- 013: bucket público para logomarcas de clínicas (por tenant_id).
-- Contrato app (002): app_user_can_access_tenant(row_tenant_id text).
-- foldername[1] já é text — alinhar ao padrão da migration 007 (sem cast ::uuid).

insert into storage.buckets (id, name, public)
values ('clinic-logos', 'clinic-logos', true)
on conflict (id) do update set public = true;

drop policy if exists clinic_logos_storage_select on storage.objects;
drop policy if exists clinic_logos_storage_insert on storage.objects;
drop policy if exists clinic_logos_storage_update on storage.objects;
drop policy if exists clinic_logos_storage_delete on storage.objects;

create policy clinic_logos_storage_select on storage.objects
  for select using (bucket_id = 'clinic-logos');

create policy clinic_logos_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'clinic-logos'
    and public.app_user_can_access_tenant((storage.foldername(name))[1])
  );

create policy clinic_logos_storage_update on storage.objects
  for update using (
    bucket_id = 'clinic-logos'
    and public.app_user_can_access_tenant((storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'clinic-logos'
    and public.app_user_can_access_tenant((storage.foldername(name))[1])
  );

create policy clinic_logos_storage_delete on storage.objects
  for delete using (
    bucket_id = 'clinic-logos'
    and public.app_user_can_access_tenant((storage.foldername(name))[1])
  );
