-- 007_app_clinical_guides.sql
-- Guias Clínicos do Dentista (biblioteca educativa multi-tenant)

create table if not exists public.clinical_guides (
  id text primary key,
  tenant_id uuid null references public.tenants(id) on delete cascade,
  title text not null default '',
  slug text not null default '',
  category text not null default '',
  short_description text not null default '',
  patient_description text not null default '',
  technical_description text not null default '',
  indications jsonb not null default '[]'::jsonb,
  contraindications jsonb not null default '[]'::jsonb,
  treatment_steps jsonb not null default '[]'::jsonb,
  pre_care jsonb not null default '[]'::jsonb,
  post_care jsonb not null default '[]'::jsonb,
  benefits jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  average_duration text not null default '',
  faq jsonb not null default '[]'::jsonb,
  internal_notes text not null default '',
  cover_image_url text not null default '',
  is_system_default boolean not null default false,
  is_custom boolean not null default false,
  visibility text not null default 'all'
    check (visibility in ('all', 'creator_only')),
  active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create index if not exists clinical_guides_tenant_slug_idx
  on public.clinical_guides (tenant_id, slug);

create index if not exists clinical_guides_category_idx
  on public.clinical_guides (category);

create table if not exists public.clinical_guide_images (
  id text primary key,
  tenant_id uuid null references public.tenants(id) on delete cascade,
  guide_id text not null references public.clinical_guides(id) on delete cascade,
  image_url text not null default '',
  caption text not null default '',
  sort_order integer not null default 0,
  visible_to_patient boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists clinical_guide_images_guide_idx
  on public.clinical_guide_images (guide_id, sort_order);

alter table public.clinical_guides enable row level security;
alter table public.clinical_guide_images enable row level security;

-- Guias padrão do sistema (tenant_id null) são legíveis por todos autenticados
create policy clinical_guides_select on public.clinical_guides
  for select to authenticated
  using (
    tenant_id is null
    or public.app_user_can_access_tenant(tenant_id::text)
  );

create policy clinical_guides_insert on public.clinical_guides
  for insert to authenticated
  with check (
    tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy clinical_guides_update on public.clinical_guides
  for update to authenticated
  using (
    tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  )
  with check (
    tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy clinical_guides_delete on public.clinical_guides
  for delete to authenticated
  using (
    tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy clinical_guide_images_select on public.clinical_guide_images
  for select to authenticated
  using (
    tenant_id is null
    or public.app_user_can_access_tenant(tenant_id::text)
  );

create policy clinical_guide_images_insert on public.clinical_guide_images
  for insert to authenticated
  with check (
    tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy clinical_guide_images_update on public.clinical_guide_images
  for update to authenticated
  using (
    tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  )
  with check (
    tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy clinical_guide_images_delete on public.clinical_guide_images
  for delete to authenticated
  using (
    tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

-- Storage bucket para imagens dos guias (path: {tenant_id}/{guide_id}/{filename})
insert into storage.buckets (id, name, public)
values ('clinical-guides', 'clinical-guides', false)
on conflict (id) do nothing;

create policy clinical_guides_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'clinical-guides'
    and (
      (storage.foldername(name))[1] is null
      or public.app_user_can_access_tenant((storage.foldername(name))[1])
    )
  );

create policy clinical_guides_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'clinical-guides'
    and public.app_user_can_access_tenant((storage.foldername(name))[1])
  );

create policy clinical_guides_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'clinical-guides'
    and public.app_user_can_access_tenant((storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'clinical-guides'
    and public.app_user_can_access_tenant((storage.foldername(name))[1])
  );

create policy clinical_guides_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'clinical-guides'
    and public.app_user_can_access_tenant((storage.foldername(name))[1])
  );
