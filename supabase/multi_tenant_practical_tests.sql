-- ============================================================
-- TESTES PRÁTICOS MULTI-TENANT (APP PRINCIPAL)
-- ============================================================
-- Como usar:
-- 1) Abra o Supabase SQL Editor
-- 2) Ajuste os parâmetros abaixo
-- 3) Execute bloco por bloco
--
-- Observação:
-- - Este script assume tabelas em schema public:
--   users_profile, memberships, tenants, tenant_modules, feature_flags
-- - Faça em ambiente de homologação/dev antes de produção.
-- ============================================================

-- ------------------------------------------------------------
-- PARÂMETROS DE TESTE (edite estes valores)
-- ------------------------------------------------------------
-- E-mail do usuário que você quer testar
-- Exemplo: 'admin@clinica.com'
-- ------------------------------------------------------------
-- IMPORTANTE: troque os valores abaixo antes de executar.
-- ------------------------------------------------------------
with params as (
  select
    'admin@exemplo.com'::text as p_email,
    'whatsapp_ai_enabled'::text as p_flag_key
)
select * from params;


-- ============================================================
-- 1) LOCALIZAR USUÁRIO E TENANT POR EMAIL
-- O que testa:
-- - Confirma se o usuário existe
-- - Mostra tenant_id do perfil
-- - Mostra memberships e tenant vinculado
-- ============================================================
with params as (
  select 'admin@exemplo.com'::text as p_email
),
u as (
  select up.id as user_id, up.email, up.tenant_id as profile_tenant_id
  from public.users_profile up
  join params p on lower(up.email) = lower(p.p_email)
)
select
  u.user_id,
  u.email,
  u.profile_tenant_id,
  m.tenant_id as membership_tenant_id,
  m.role,
  m.status as membership_status,
  t.status as tenant_status,
  t.billing_status
from u
left join public.memberships m on m.user_id = u.user_id
left join public.tenants t on t.id = m.tenant_id
order by m.updated_at desc nulls last;


-- ============================================================
-- 2) REMOVER tenant_id DO USUÁRIO
-- O que testa:
-- - Cenário de login sem tenant vinculado no perfil
-- ============================================================
with params as (
  select 'admin@exemplo.com'::text as p_email
)
update public.users_profile up
set tenant_id = null,
    updated_at = now()
from params p
where lower(up.email) = lower(p.p_email)
returning up.id, up.email, up.tenant_id, up.updated_at;


-- ============================================================
-- 3) RESTAURAR tenant_id DO USUÁRIO
-- O que testa:
-- - Restauração rápida usando o membership ativo mais recente
-- ============================================================
with params as (
  select 'admin@exemplo.com'::text as p_email
),
target_user as (
  select up.id, up.email
  from public.users_profile up
  join params p on lower(up.email) = lower(p.p_email)
),
chosen_membership as (
  select m.user_id, m.tenant_id
  from public.memberships m
  join target_user u on u.id = m.user_id
  where m.status = 'active'
  order by m.updated_at desc nulls last, m.created_at desc nulls last
  limit 1
)
update public.users_profile up
set tenant_id = cm.tenant_id,
    updated_at = now()
from chosen_membership cm
where up.id = cm.user_id
returning up.id, up.email, up.tenant_id, up.updated_at;


-- ============================================================
-- 4) BLOQUEAR TENANT
-- O que testa:
-- - Se o app encerra sessão quando tenant.status = blocked
-- ============================================================
with params as (
  select 'admin@exemplo.com'::text as p_email
),
target_tenant as (
  select coalesce(up.tenant_id, m.tenant_id) as tenant_id
  from public.users_profile up
  left join public.memberships m on m.user_id = up.id and m.status = 'active'
  join params p on lower(up.email) = lower(p.p_email)
  order by m.updated_at desc nulls last
  limit 1
)
update public.tenants t
set status = 'blocked',
    updated_at = now()
from target_tenant tt
where t.id = tt.tenant_id
returning t.id, t.status, t.updated_at;


-- ============================================================
-- 5) SUSPENDER TENANT
-- O que testa:
-- - Se o app encerra sessão quando tenant.status = suspended
-- ============================================================
with params as (
  select 'admin@exemplo.com'::text as p_email
),
target_tenant as (
  select coalesce(up.tenant_id, m.tenant_id) as tenant_id
  from public.users_profile up
  left join public.memberships m on m.user_id = up.id and m.status = 'active'
  join params p on lower(up.email) = lower(p.p_email)
  order by m.updated_at desc nulls last
  limit 1
)
update public.tenants t
set status = 'suspended',
    updated_at = now()
from target_tenant tt
where t.id = tt.tenant_id
returning t.id, t.status, t.updated_at;


-- ============================================================
-- 6) REATIVAR TENANT
-- O que testa:
-- - Permite novo login após status voltar para active
-- ============================================================
with params as (
  select 'admin@exemplo.com'::text as p_email
),
target_tenant as (
  select coalesce(up.tenant_id, m.tenant_id) as tenant_id
  from public.users_profile up
  left join public.memberships m on m.user_id = up.id and m.status = 'active'
  join params p on lower(up.email) = lower(p.p_email)
  order by m.updated_at desc nulls last
  limit 1
)
update public.tenants t
set status = 'active',
    updated_at = now()
from target_tenant tt
where t.id = tt.tenant_id
returning t.id, t.status, t.updated_at;


-- ============================================================
-- 7) MARCAR billing_status COMO overdue
-- O que testa:
-- - Exibição de banner de inadimplência no app
-- ============================================================
with params as (
  select 'admin@exemplo.com'::text as p_email
),
target_tenant as (
  select coalesce(up.tenant_id, m.tenant_id) as tenant_id
  from public.users_profile up
  left join public.memberships m on m.user_id = up.id and m.status = 'active'
  join params p on lower(up.email) = lower(p.p_email)
  order by m.updated_at desc nulls last
  limit 1
)
update public.tenants t
set billing_status = 'overdue',
    updated_at = now()
from target_tenant tt
where t.id = tt.tenant_id
returning t.id, t.billing_status, t.updated_at;


-- ============================================================
-- 8) VOLTAR billing_status PARA current
-- O que testa:
-- - Remove estado de inadimplência no app
-- Nota:
-- - Se seu projeto usa 'ok' em vez de 'current', troque aqui.
-- ============================================================
with params as (
  select 'admin@exemplo.com'::text as p_email
),
target_tenant as (
  select coalesce(up.tenant_id, m.tenant_id) as tenant_id
  from public.users_profile up
  left join public.memberships m on m.user_id = up.id and m.status = 'active'
  join params p on lower(up.email) = lower(p.p_email)
  order by m.updated_at desc nulls last
  limit 1
)
update public.tenants t
set billing_status = 'current',
    updated_at = now()
from target_tenant tt
where t.id = tt.tenant_id
returning t.id, t.billing_status, t.updated_at;


-- ============================================================
-- 9) DESATIVAR MÓDULO MARKETING
-- O que testa:
-- - Menu/rotas do módulo MARKETING devem ser bloqueados no app
-- ============================================================
with params as (
  select 'admin@exemplo.com'::text as p_email
),
target_tenant as (
  select coalesce(up.tenant_id, m.tenant_id) as tenant_id
  from public.users_profile up
  left join public.memberships m on m.user_id = up.id and m.status = 'active'
  join params p on lower(up.email) = lower(p.p_email)
  order by m.updated_at desc nulls last
  limit 1
),
upsert_row as (
  insert into public.tenant_modules (id, tenant_id, module_key, enabled, created_at, updated_at)
  select gen_random_uuid(), tt.tenant_id, 'MARKETING', false, now(), now()
  from target_tenant tt
  on conflict (tenant_id, module_key)
  do update set enabled = excluded.enabled, updated_at = now()
  returning tenant_id, module_key, enabled, updated_at
)
select * from upsert_row;


-- ============================================================
-- 10) REATIVAR MÓDULO MARKETING
-- O que testa:
-- - Menu/rotas do módulo MARKETING voltam a aparecer
-- ============================================================
with params as (
  select 'admin@exemplo.com'::text as p_email
),
target_tenant as (
  select coalesce(up.tenant_id, m.tenant_id) as tenant_id
  from public.users_profile up
  left join public.memberships m on m.user_id = up.id and m.status = 'active'
  join params p on lower(up.email) = lower(p.p_email)
  order by m.updated_at desc nulls last
  limit 1
),
upsert_row as (
  insert into public.tenant_modules (id, tenant_id, module_key, enabled, created_at, updated_at)
  select gen_random_uuid(), tt.tenant_id, 'MARKETING', true, now(), now()
  from target_tenant tt
  on conflict (tenant_id, module_key)
  do update set enabled = excluded.enabled, updated_at = now()
  returning tenant_id, module_key, enabled, updated_at
)
select * from upsert_row;


-- ============================================================
-- 11) DESLIGAR FEATURE FLAG POR flag_key
-- O que testa:
-- - Bloqueio dinâmico de funcionalidades por tenant
-- ============================================================
with params as (
  select
    'admin@exemplo.com'::text as p_email,
    'whatsapp_ai_enabled'::text as p_flag_key
),
target_tenant as (
  select coalesce(up.tenant_id, m.tenant_id) as tenant_id
  from public.users_profile up
  left join public.memberships m on m.user_id = up.id and m.status = 'active'
  join params p on lower(up.email) = lower(p.p_email)
  order by m.updated_at desc nulls last
  limit 1
),
upsert_flag as (
  insert into public.feature_flags (id, flag_key, scope_type, scope_ref, enabled, payload, created_at, updated_at)
  select gen_random_uuid(), p.p_flag_key, 'tenant', tt.tenant_id::text, false, '{}'::jsonb, now(), now()
  from params p
  cross join target_tenant tt
  on conflict (flag_key, scope_type, scope_ref)
  do update set enabled = excluded.enabled, updated_at = now()
  returning flag_key, scope_type, scope_ref, enabled, updated_at
)
select * from upsert_flag;


-- ============================================================
-- 12) RELIGAR FEATURE FLAG
-- O que testa:
-- - Reativação da funcionalidade por tenant
-- ============================================================
with params as (
  select
    'admin@exemplo.com'::text as p_email,
    'whatsapp_ai_enabled'::text as p_flag_key
),
target_tenant as (
  select coalesce(up.tenant_id, m.tenant_id) as tenant_id
  from public.users_profile up
  left join public.memberships m on m.user_id = up.id and m.status = 'active'
  join params p on lower(up.email) = lower(p.p_email)
  order by m.updated_at desc nulls last
  limit 1
),
upsert_flag as (
  insert into public.feature_flags (id, flag_key, scope_type, scope_ref, enabled, payload, created_at, updated_at)
  select gen_random_uuid(), p.p_flag_key, 'tenant', tt.tenant_id::text, true, '{}'::jsonb, now(), now()
  from params p
  cross join target_tenant tt
  on conflict (flag_key, scope_type, scope_ref)
  do update set enabled = excluded.enabled, updated_at = now()
  returning flag_key, scope_type, scope_ref, enabled, updated_at
)
select * from upsert_flag;


-- ============================================================
-- 13) LISTAR TABELAS COM tenant_id
-- O que testa:
-- - Inventário de tabelas multi-tenant (base para RLS)
-- ============================================================
select
  c.table_schema,
  c.table_name
from information_schema.columns c
where c.table_schema = 'public'
  and c.column_name = 'tenant_id'
order by c.table_name;


-- ============================================================
-- 14) LISTAR POLICIES RLS
-- O que testa:
-- - Verifica políticas existentes para tabelas com tenant_id
-- ============================================================
select
  p.schemaname,
  p.tablename,
  p.policyname,
  p.cmd,
  p.permissive,
  p.roles,
  p.qual,
  p.with_check
from pg_policies p
where p.schemaname = 'public'
order by p.tablename, p.policyname;


-- ============================================================
-- 15) VALIDAR SE RLS ESTÁ ATIVO
-- O que testa:
-- - Confirma se relrowsecurity está ligado por tabela
-- ============================================================
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    select distinct table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'tenant_id'
  )
order by c.relname;
