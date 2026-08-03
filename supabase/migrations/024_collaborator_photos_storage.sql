-- 024: bucket oficial de fotos de colaboradores (avatar RH).
--
-- Bucket: collaborator-photos
-- Path canônico: {tenant_id}/collaborators/{collaborator_uuid}/avatar.webp
--
-- DECISÃO público/privado (Phase 4.8A):
--   Bucket PRIVADO (public = false).
--   Motivo: Phase 4.8A exige SELECT somente para usuários autenticados do tenant;
--   fotos de colaboradores são dados pessoais (LGPD — minimização de exposição).
--   Bucket público permitiria leitura anônima via CDN, incompatível com este requisito.
--   A API futura (POST /internal/app/assets/avatar) usará service_role no backend
--   e poderá emitir signed URLs de curta duração quando necessário para <img src>.
--   Nota: PHASE_4_8_ASSETS_API_CONTRACT.md mencionava bucket público como opção;
--   esta migration prioriza LGPD + SELECT autenticado (requisito normativo 4.8A).
--
-- Relação collaborators.foto_url (016):
--   Esta migration NÃO altera public.collaborators nem foto_url.
--   Após upload via Admin API, foto_url receberá URL HTTPS (Storage ou signed).
--   Constraint collaborators_foto_url_no_data_uri_chk proíbe base64/data URI.
--
-- Uso futuro pela API:
--   POST /internal/app/assets/avatar (Phase 4.8) — upload server-side com service_role,
--   validação MIME/tamanho, UPDATE collaborators.foto_url.
--   Frontend NÃO deve usar service_role; uploads diretos anon/authenticated seguem RLS abaixo.
--
-- LGPD:
--   Imagens identificam colaboradores (dado pessoal). Acesso restrito a membros do tenant.
--   Escrita (upload/substituição/remoção) apenas admin/owner/master.
--   Sem migração de fotos legadas base64 (IndexedDB) nesta fase.
--
-- Pré-requisitos: 016 (collaborators), 012/009 (app_user_is_tenant_admin), 002 (app_user_can_access_tenant).
-- NÃO aplicar em produção (uoepkwhqztmsjnzirpev) nesta fase sem gate explícito.
-- NÃO migrar fotos antigas. NÃO atualizar collaborators.foto_url.

-- ---------------------------------------------------------------------------
-- Helpers: validação de path (fail closed — proíbe path sem tenant ou fora do padrão)
-- ---------------------------------------------------------------------------

create or replace function public.collaborator_photos_storage_path_valid(object_name text)
returns boolean
language sql
immutable
set search_path = public
as $$
  -- storage.foldername retorna só diretórios (não o arquivo).
  -- Path canônico: {tenant_id}/collaborators/{collaborator_uuid}/avatar.webp
  -- → folders[1..3] + storage.filename = avatar.webp
  select
    coalesce(array_length(storage.foldername(object_name), 1), 0) = 3
    and (storage.foldername(object_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and lower((storage.foldername(object_name))[2]) = 'collaborators'
    and (storage.foldername(object_name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and lower(storage.filename(object_name)) = 'avatar.webp';
$$;

comment on function public.collaborator_photos_storage_path_valid(text) is
  'Valida object key: 3 dirs (tenant/collaborators/uuid) + filename avatar.webp via storage.filename — fail-closed.';

create or replace function public.collaborator_photos_storage_tenant_id(object_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when public.collaborator_photos_storage_path_valid(object_name)
      then (storage.foldername(object_name))[1]::uuid
    else null::uuid
  end;
$$;

comment on function public.collaborator_photos_storage_tenant_id(text) is
  'Extrai tenant_id UUID do path canônico; null se path inválido.';

-- Membro ativo do tenant (SELECT Storage — mais forte que JWT claim isolado)
create or replace function public.app_user_is_tenant_member(p_tenant_id uuid)
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
      and coalesce(tu.has_system_access, tu.is_active, tu.status = 'active', true) = true
      and coalesce(tu.is_active, true) = true
      and lower(coalesce(tu.status, 'active')) <> 'inactive'
  );
$$;

comment on function public.app_user_is_tenant_member(uuid) is
  'True se auth.uid() é membro ativo do tenant (qualquer role). Usado em SELECT Storage collaborator-photos.';

revoke all on function public.collaborator_photos_storage_path_valid(text) from public;
revoke all on function public.collaborator_photos_storage_tenant_id(text) from public;
revoke all on function public.app_user_is_tenant_member(uuid) from public;

grant execute on function public.collaborator_photos_storage_path_valid(text) to authenticated;
grant execute on function public.collaborator_photos_storage_tenant_id(text) to authenticated;
grant execute on function public.app_user_is_tenant_member(uuid) to authenticated;

-- Colaborador referenciado no path pertence ao tenant (integridade RH)
create or replace function public.collaborator_photos_storage_collaborator_valid(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.collaborators c
    where public.collaborator_photos_storage_path_valid(object_name)
      and c.id = (storage.foldername(object_name))[3]::uuid
      and c.tenant_id = public.collaborator_photos_storage_tenant_id(object_name)
      and c.deleted_at is null
  );
$$;

comment on function public.collaborator_photos_storage_collaborator_valid(text) is
  'True se collaborator_uuid no path existe no tenant e não está soft-deleted.';

revoke all on function public.collaborator_photos_storage_collaborator_valid(text) from public;
grant execute on function public.collaborator_photos_storage_collaborator_valid(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Bucket (privado — SELECT autenticado via RLS; sem leitura anônima)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'collaborator-photos',
  'collaborator-photos',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[];

-- ---------------------------------------------------------------------------
-- Policies storage.objects — isolamento tenant + path canônico
-- service_role (Admin API backend) bypassa RLS — nunca expor no frontend.
-- Base64: proibido em collaborators.foto_url (016); API validará MIME/binário.
-- ---------------------------------------------------------------------------

drop policy if exists collaborator_photos_storage_select on storage.objects;
drop policy if exists collaborator_photos_storage_insert on storage.objects;
drop policy if exists collaborator_photos_storage_update on storage.objects;
drop policy if exists collaborator_photos_storage_delete on storage.objects;

-- SELECT: membros autenticados do tenant + path válido + colaborador existente
create policy collaborator_photos_storage_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'collaborator-photos'
    and auth.uid() is not null
    and public.collaborator_photos_storage_path_valid(name)
    and public.app_user_is_tenant_member(public.collaborator_photos_storage_tenant_id(name))
    and public.collaborator_photos_storage_collaborator_valid(name)
  );

-- INSERT: admin/owner/master + path válido + colaborador no tenant
create policy collaborator_photos_storage_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'collaborator-photos'
    and auth.uid() is not null
    and public.collaborator_photos_storage_path_valid(name)
    and public.app_user_is_tenant_admin(public.collaborator_photos_storage_tenant_id(name))
    and public.collaborator_photos_storage_collaborator_valid(name)
  );

-- UPDATE: admin/owner/master (upsert avatar)
create policy collaborator_photos_storage_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'collaborator-photos'
    and auth.uid() is not null
    and public.collaborator_photos_storage_path_valid(name)
    and public.app_user_is_tenant_admin(public.collaborator_photos_storage_tenant_id(name))
  )
  with check (
    bucket_id = 'collaborator-photos'
    and auth.uid() is not null
    and public.collaborator_photos_storage_path_valid(name)
    and public.app_user_is_tenant_admin(public.collaborator_photos_storage_tenant_id(name))
    and public.collaborator_photos_storage_collaborator_valid(name)
  );

-- DELETE: admin/owner/master
create policy collaborator_photos_storage_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'collaborator-photos'
    and auth.uid() is not null
    and public.collaborator_photos_storage_path_valid(name)
    and public.app_user_is_tenant_admin(public.collaborator_photos_storage_tenant_id(name))
  );

-- NOTE (Phase 9.2J): COMMENT ON POLICY em storage.objects falha no apply local
-- (LegacyMigrationApplyError / ownership supabase_storage_admin). Documentação
-- permanece nestes comentários SQL; policies RLS acima intactas.
-- SELECT: Avatar RH — leitura apenas membros autenticados do tenant. Bucket privado (LGPD).
-- INSERT: Avatar RH — upload restrito a owner/admin/master. Path canônico.

-- ---------------------------------------------------------------------------
-- VALIDAÇÃO SQL (executar manualmente após aplicar em staging — NÃO executar agora)
-- ---------------------------------------------------------------------------
/*
-- V1) Bucket existe e é privado
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'collaborator-photos';
-- Esperado: 1 row, public = false, file_size_limit = 2097152

-- V2) Policies existem
select policyname, cmd, roles
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'collaborator_photos_storage_%'
order by policyname;
-- Esperado: 4 policies (select, insert, update, delete)

-- V3) Path válido (função — sem I/O)
select public.collaborator_photos_storage_path_valid(
  '7aba7127-409c-4ea4-8dbc-807efc5e189c/collaborators/a1000002-0002-4002-8002-000000000002/avatar.webp'
) as valid_canonical;
-- Esperado: true (UUID formato válido)

select public.collaborator_photos_storage_path_valid('logo.webp') as invalid_flat;
-- Esperado: false (sem tenant_id)

select public.collaborator_photos_storage_path_valid(
  '7aba7127-409c-4ea4-8dbc-807efc5e189c/other/a1000002-0002-4002-8002-000000000002/avatar.webp'
) as invalid_segment;
-- Esperado: false (segmento != collaborators)

-- V4) Path fora do tenant deve falhar em runtime (como membro tenant A, tentar path tenant B)
-- Executar autenticado como usuário tenant A via Supabase client:
--   storage.from('collaborator-photos').download('{tenant_b_uuid}/collaborators/{uuid}/avatar.webp')
-- Esperado: erro permissão / not found (RLS)

-- V5) Path válido deve passar via API futura (Admin API service_role + UPDATE foto_url)
-- Smoke pós Phase 4.8: POST /internal/app/assets/avatar → 200 → collaborators.foto_url HTTPS

-- V6) Produção NÃO alterada nesta fase
-- Confirmar que migration 024 NÃO foi aplicada em uoepkwhqztmsjnzirpev até gate RC explícito.
select id from storage.buckets where id = 'collaborator-photos';
-- Em produção (nesta fase): 0 rows
*/

-- ---------------------------------------------------------------------------
-- ROLLBACK (manual — NÃO executar automaticamente)
-- ---------------------------------------------------------------------------
/*
drop policy if exists collaborator_photos_storage_select on storage.objects;
drop policy if exists collaborator_photos_storage_insert on storage.objects;
drop policy if exists collaborator_photos_storage_update on storage.objects;
drop policy if exists collaborator_photos_storage_delete on storage.objects;

drop function if exists public.collaborator_photos_storage_collaborator_valid(text);
drop function if exists public.app_user_is_tenant_member(uuid);
drop function if exists public.collaborator_photos_storage_tenant_id(text);
drop function if exists public.collaborator_photos_storage_path_valid(text);

delete from storage.objects where bucket_id = 'collaborator-photos';
delete from storage.buckets where id = 'collaborator-photos';
*/
