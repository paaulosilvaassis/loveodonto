-- 018: FK tenant_users.collaborator_uuid → collaborators.id
--
-- ⚠️  GATE OBRIGATÓRIO — aplicar SOMENTE após:
--     1) Backfill RH dry-run sem erros (AMBIGUOUS/CONFLICT = 0)
--     2) Query de validação (ver README abaixo) retornando 0 linhas inválidas
--     3) VALIDATE CONSTRAINT executado com sucesso
--
-- ROLLBACK (manual — ordem):
--   drop trigger if exists trg_tenant_users_validate_collaborator_uuid on public.tenant_users;
--   drop function if exists public.validate_tenant_users_collaborator_uuid();
--   alter table public.tenant_users drop constraint if exists tenant_users_collaborator_uuid_fkey;
--   alter table public.tenant_users drop constraint if exists tenant_users_collaborator_tenant_match_chk;
--
-- NOTA: collaborator_uuid permanece NULLABLE (RH sem acesso ao sistema é válido).

-- Garante consistência tenant_id entre membership e colaborador
create or replace function public.validate_tenant_users_collaborator_uuid()
returns trigger
language plpgsql
as $$
declare
  v_collab_tenant uuid;
begin
  if new.collaborator_uuid is null then
    return new;
  end if;

  select c.tenant_id into v_collab_tenant
  from public.collaborators c
  where c.id = new.collaborator_uuid
    and c.deleted_at is null;

  if v_collab_tenant is null then
    raise exception 'collaborator_uuid % não encontrado ou excluído', new.collaborator_uuid
      using errcode = '23503';
  end if;

  if v_collab_tenant is distinct from new.tenant_id then
    raise exception 'collaborator_uuid % pertence ao tenant %, mas tenant_users.tenant_id=%',
      new.collaborator_uuid, v_collab_tenant, new.tenant_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tenant_users_validate_collaborator_uuid on public.tenant_users;
create trigger trg_tenant_users_validate_collaborator_uuid
before insert or update of collaborator_uuid, tenant_id on public.tenant_users
for each row execute function public.validate_tenant_users_collaborator_uuid();

-- FK adicionada como NOT VALID: não bloqueia linhas legadas até VALIDATE
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenant_users_collaborator_uuid_fkey'
  ) then
    alter table public.tenant_users
      add constraint tenant_users_collaborator_uuid_fkey
      foreign key (collaborator_uuid)
      references public.collaborators(id)
      on update cascade
      on delete set null
      not valid;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- VALIDAÇÃO PRÉ-FK (executar manualmente antes de VALIDATE CONSTRAINT):
--
-- -- Órfãos: uuid apontando para colaborador inexistente
-- select id, tenant_id, email, collaborator_uuid
-- from public.tenant_users
-- where collaborator_uuid is not null
--   and not exists (
--     select 1 from public.collaborators c
--     where c.id = tenant_users.collaborator_uuid and c.deleted_at is null
--   );
--
-- -- Cross-tenant: uuid de outro tenant
-- select tu.id, tu.tenant_id, tu.collaborator_uuid, c.tenant_id as collab_tenant
-- from public.tenant_users tu
-- join public.collaborators c on c.id = tu.collaborator_uuid
-- where tu.tenant_id <> c.tenant_id;
--
-- -- Duplicidade: mesmo colaborador em dois memberships
-- select tenant_id, collaborator_uuid, count(*) as cnt
-- from public.tenant_users
-- where collaborator_uuid is not null
-- group by 1, 2 having count(*) > 1;
--
-- Se todas retornarem 0 linhas:
--   alter table public.tenant_users validate constraint tenant_users_collaborator_uuid_fkey;
-- ═══════════════════════════════════════════════════════════════════════════

-- Idempotente: valida FK se ainda não validada e não houver violações
do $$
declare
  v_invalid bigint;
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenant_users_collaborator_uuid_fkey'
      and convalidated = true
  ) then
    select count(*) into v_invalid
    from public.tenant_users tu
    where tu.collaborator_uuid is not null
      and not exists (
        select 1 from public.collaborators c
        where c.id = tu.collaborator_uuid
          and c.deleted_at is null
          and c.tenant_id = tu.tenant_id
      );

    if v_invalid = 0 then
      alter table public.tenant_users
        validate constraint tenant_users_collaborator_uuid_fkey;
      raise notice '018: tenant_users_collaborator_uuid_fkey validada com sucesso.';
    else
      raise notice '018: FK criada NOT VALID; % linha(s) inválida(s). Rode backfill e VALIDATE manualmente.', v_invalid;
    end if;
  end if;
end $$;

-- Sincroniza identities.collaborator_id (text legado) quando possível — best effort
update public.identities i
set
  collaborator_id = coalesce(i.collaborator_id, c.legacy_id),
  updated_at = now()
from public.tenant_users tu
join public.collaborators c on c.id = tu.collaborator_uuid
where i.tenant_user_id = tu.id
  and tu.collaborator_uuid is not null
  and c.legacy_id is not null
  and (i.collaborator_id is null or trim(i.collaborator_id) = '');
