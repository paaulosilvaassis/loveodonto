-- 017: Coluna UUID nullable em tenant_users para vínculo formal com collaborators.
-- Mantém collaborator_id TEXT legado intacto durante a transição.
--
-- ROLLBACK (manual):
--   drop index if exists public.tenant_users_collaborator_uuid_idx;
--   alter table public.tenant_users drop column if exists collaborator_uuid;
--
-- GATE: aplicar ANTES do backfill RH. Popular collaborator_uuid via script, não nesta migration.

alter table if exists public.tenant_users
  add column if not exists collaborator_uuid uuid null;

comment on column public.tenant_users.collaborator_id is
  'LEGADO (text): col-*, col-saas-*. Manter até cutover. Usar collaborator_uuid.';
comment on column public.tenant_users.collaborator_uuid is
  'FK lógica → public.collaborators.id. Nullable até backfill + migration 018.';

create index if not exists tenant_users_collaborator_uuid_idx
  on public.tenant_users (collaborator_uuid)
  where collaborator_uuid is not null;

-- Índice único: no máximo um tenant_user por colaborador (quando preenchido)
create unique index if not exists tenant_users_tenant_collaborator_uuid_uq
  on public.tenant_users (tenant_id, collaborator_uuid)
  where collaborator_uuid is not null;

-- Prepara coluna para permissões customizadas (Fase 2 — tabela relacional)
alter table if exists public.tenant_users
  add column if not exists has_custom_permissions boolean not null default false;

comment on column public.tenant_users.has_custom_permissions is
  'true quando overrides existem em tenant_user_permissions (Fase 2). app_metadata é snapshot.';

-- Função auxiliar: resolve UUID a partir do legado (uso em backfill SQL)
create or replace function public.resolve_collaborator_uuid_from_legacy(
  p_tenant_id uuid,
  p_legacy_id text
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.collaborators c
  where c.tenant_id = p_tenant_id
    and c.legacy_id = nullif(trim(p_legacy_id), '')
    and c.deleted_at is null
  limit 1;
$$;

revoke all on function public.resolve_collaborator_uuid_from_legacy(uuid, text) from public;
grant execute on function public.resolve_collaborator_uuid_from_legacy(uuid, text) to authenticated;
grant execute on function public.resolve_collaborator_uuid_from_legacy(uuid, text) to service_role;

-- Backfill automático SOMENTE quando já existir linha em collaborators com legacy_id matching.
-- Idempotente; não falha se collaborators vazio.
update public.tenant_users tu
set collaborator_uuid = public.resolve_collaborator_uuid_from_legacy(tu.tenant_id, tu.collaborator_id)
where tu.collaborator_uuid is null
  and tu.collaborator_id is not null
  and trim(tu.collaborator_id) <> ''
  and public.resolve_collaborator_uuid_from_legacy(tu.tenant_id, tu.collaborator_id) is not null;
