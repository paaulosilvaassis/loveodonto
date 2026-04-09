-- 007_platform_tenant_users_access_bootstrap.sql
-- Objetivo:
-- 1) Padronizar tenant_users com role + is_active
-- 2) Preservar compatibilidade com legado (role_slug/status)
-- 3) Expor função segura para bootstrap de acesso do app principal

-- Garantir novas colunas canônicas
alter table if exists public.tenant_users
  add column if not exists role text;

alter table if exists public.tenant_users
  add column if not exists is_active boolean default true;

-- Backfill seguro a partir das colunas legadas
update public.tenant_users
set role = coalesce(nullif(role, ''), nullif(role_slug, ''), 'atendimento')
where role is null or role = '';

update public.tenant_users
set is_active = coalesce(is_active, status = 'active', true)
where is_active is null;

alter table if exists public.tenant_users
  alter column role set default 'atendimento';

alter table if exists public.tenant_users
  alter column is_active set default true;

-- Índices/constraints para integridade e performance
create index if not exists tenant_users_tenant_id_idx
  on public.tenant_users (tenant_id);

create index if not exists tenant_users_user_id_idx
  on public.tenant_users (user_id);

create unique index if not exists tenant_users_tenant_id_user_id_unique
  on public.tenant_users (tenant_id, user_id)
  where user_id is not null;

-- Trigger de compatibilidade bidirecional (novo <-> legado)
create or replace function public.sync_tenant_users_compat()
returns trigger
language plpgsql
as $$
begin
  new.role := coalesce(nullif(new.role, ''), nullif(new.role_slug, ''), 'atendimento');
  new.role_slug := coalesce(nullif(new.role_slug, ''), new.role, 'atendimento');
  new.is_active := coalesce(new.is_active, new.status = 'active', true);
  new.status := case when new.is_active then 'active' else 'inactive' end;
  return new;
end;
$$;

drop trigger if exists trg_tenant_users_sync_compat on public.tenant_users;
create trigger trg_tenant_users_sync_compat
before insert or update on public.tenant_users
for each row execute function public.sync_tenant_users_compat();

-- Garantir RLS ativa na tenant_users
alter table if exists public.tenant_users enable row level security;

-- Policy para o app: usuário autenticado só pode ler seu próprio vínculo
drop policy if exists "app read own tenant_users" on public.tenant_users;
create policy "app read own tenant_users"
on public.tenant_users
for select
using (
  auth.uid() is not null
  and user_id = auth.uid()
);

-- Função canônica de bootstrap de acesso do app principal
-- Observação:
-- - Nome e assinatura sem parâmetros para uso via supabase.rpc('get_app_user_tenant_access')
-- - Usa auth.uid() internamente
-- - Mantém compatibilidade com role/role_slug e is_active/status via coalesce
create or replace function public.get_app_user_tenant_access()
returns table (
  tenant_id uuid,
  role text,
  is_active boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    tu.tenant_id,
    coalesce(nullif(tu.role, ''), nullif(tu.role_slug, ''), 'atendimento') as role,
    coalesce(tu.is_active, tu.status = 'active', true) as is_active
  from public.tenant_users tu
  where tu.user_id = auth.uid()
  order by tu.created_at asc
  limit 1;
$$;

revoke all on function public.get_app_user_tenant_access() from public;
grant execute on function public.get_app_user_tenant_access() to authenticated;

