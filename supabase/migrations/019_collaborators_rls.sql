-- 019: RLS em public.collaborators
--
-- Modelo:
--   SELECT  → membros do tenant (JWT tenant_id) + próprio colaborador vinculado
--   INSERT/UPDATE/DELETE → admins do tenant (owner/admin/master)
--   Soft delete via deleted_at (UPDATE, não DELETE físico recomendado)
--
-- ROLLBACK (manual):
--   drop policy if exists collaborators_select_tenant on public.collaborators;
--   drop policy if exists collaborators_select_self on public.collaborators;
--   drop policy if exists collaborators_modify_admin on public.collaborators;
--   alter table public.collaborators disable row level security;

-- Helper: colaborador vinculado ao usuário autenticado no tenant
create or replace function public.app_user_collaborator_uuid(p_tenant_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tu.collaborator_uuid
  from public.tenant_users tu
  where tu.user_id = auth.uid()
    and tu.tenant_id = p_tenant_id
    and tu.collaborator_uuid is not null
  limit 1;
$$;

revoke all on function public.app_user_collaborator_uuid(uuid) from public;
grant execute on function public.app_user_collaborator_uuid(uuid) to authenticated;

alter table public.collaborators enable row level security;

drop policy if exists collaborators_tenant_select_policy on public.collaborators;
drop policy if exists collaborators_tenant_modify_policy on public.collaborators;
drop policy if exists collaborators_select_tenant on public.collaborators;
drop policy if exists collaborators_select_self on public.collaborators;
drop policy if exists collaborators_modify_admin on public.collaborators;

-- Membros autenticados do tenant leem roster (agenda, equipe, avatares)
create policy collaborators_select_tenant on public.collaborators
  for select
  using (
    auth.uid() is not null
    and deleted_at is null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

-- Reforço: usuário sempre lê o próprio registro RH (mesmo se JWT tenant stale)
create policy collaborators_select_self on public.collaborators
  for select
  using (
    auth.uid() is not null
    and deleted_at is null
    and id = public.app_user_collaborator_uuid(tenant_id)
  );

-- Admins gerenciam RH completo
create policy collaborators_modify_admin on public.collaborators
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
    and deleted_at is null
  );

comment on policy collaborators_select_tenant on public.collaborators is
  'Leitura do roster por membros do tenant. Dados sensíveis (CPF) virão em tabela satélite admin-only (Fase 2).';
comment on policy collaborators_modify_admin on public.collaborators is
  'CRUD RH restrito a owner/admin/master do tenant.';
