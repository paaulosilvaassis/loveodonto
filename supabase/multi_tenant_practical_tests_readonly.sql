-- ============================================================
-- TESTES PRÁTICOS MULTI-TENANT (APP PRINCIPAL) - READONLY
-- ============================================================
-- VERSÃO DE AUDITORIA SEGURA (SOMENTE LEITURA)
--
-- IMPORTANTE:
-- - Este arquivo NÃO executa UPDATE, INSERT ou DELETE.
-- - Todos os blocos foram adaptados para inspeção/simulação com SELECT.
-- - Ideal para validar regras multi-tenant sem risco de alterar dados reais.
-- ============================================================

-- ------------------------------------------------------------
-- PARÂMETROS DE TESTE (edite estes valores)
-- ------------------------------------------------------------
-- E-mail do usuário que você quer auditar
-- Exemplo: 'admin@clinica.com'
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
-- 2) SIMULAÇÃO - REMOVER tenant_id DO USUÁRIO
-- O que testa:
-- - Mostra qual usuário seria impactado no cenário "tenant_id = null"
-- - NÃO altera nada
-- ============================================================
with params as (
  select 'admin@exemplo.com'::text as p_email
)
select
  up.id,
  up.email,
  up.tenant_id as tenant_id_atual,
  null::text as tenant_id_simulado_removido,
  up.updated_at
from public.users_profile up
join params p on lower(up.email) = lower(p.p_email);


-- ============================================================
-- 3) SIMULAÇÃO - RESTAURAR tenant_id DO USUÁRIO
-- O que testa:
-- - Mostra qual tenant_id seria usado para restauração
-- - Baseado no membership ativo mais recente
-- - NÃO altera nada
-- ============================================================
with params as (
  select 'admin@exemplo.com'::text as p_email
),
target_user as (
  select up.id, up.email, up.tenant_id as tenant_id_atual
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
select
  u.id as user_id,
  u.email,
  u.tenant_id_atual,
  cm.tenant_id as tenant_id_restaurado_simulado
from target_user u
left join chosen_membership cm on cm.user_id = u.id;


-- ============================================================
-- 4) SIMULAÇÃO - BLOQUEAR TENANT
-- O que testa:
-- - Mostra tenant e status atual
-- - Mostra status simulado "blocked"
-- - NÃO altera nada
-- ============================================================
with params as (
  select 'admin@exemplo.com'::text as p_email
),
target_tenant as (
  select distinct coalesce(up.tenant_id, m.tenant_id) as tenant_id
  from public.users_profile up
  left join public.memberships m on m.user_id = up.id and m.status = 'active'
  join params p on lower(up.email) = lower(p.p_email)
)
select
  t.id,
  t.status as status_atual,
  'blocked'::text as status_simulado,
  t.updated_at
from public.tenants t
join target_tenant tt on tt.tenant_id = t.id;


-- ============================================================
-- 5) SIMULAÇÃO - SUSPENDER TENANT
-- O que testa:
-- - Mostra status simulado "suspended"
-- - NÃO altera nada
-- ============================================================
with params as (
  select 'admin@exemplo.com'::text as p_email
),
target_tenant as (
  select distinct coalesce(up.tenant_id, m.tenant_id) as tenant_id
  from public.users_profile up
  left join public.memberships m on m.user_id = up.id and m.status = 'active'
  join params p on lower(up.email) = lower(p.p_email)
)
select
  t.id,
  t.status as status_atual,
  'suspended'::text as status_simulado,
  t.updated_at
from public.tenants t
join target_tenant tt on tt.tenant_id = t.id;


-- ============================================================
-- 6) SIMULAÇÃO - REATIVAR TENANT
-- O que testa:
-- - Mostra status simulado "active"
-- - NÃO altera nada
-- ============================================================
with params as (
  select 'admin@exemplo.com'::text as p_email
),
target_tenant as (
  select distinct coalesce(up.tenant_id, m.tenant_id) as tenant_id
  from public.users_profile up
  left join public.memberships m on m.user_id = up.id and m.status = 'active'
  join params p on lower(up.email) = lower(p.p_email)
)
select
  t.id,
  t.status as status_atual,
  'active'::text as status_simulado,
  t.updated_at
from public.tenants t
join target_tenant tt on tt.tenant_id = t.id;


-- ============================================================
-- 7) SIMULAÇÃO - billing_status COMO overdue
-- O que testa:
-- - Mostra billing_status simulado "overdue"
-- - NÃO altera nada
-- ============================================================
with params as (
  select 'admin@exemplo.com'::text as p_email
),
target_tenant as (
  select distinct coalesce(up.tenant_id, m.tenant_id) as tenant_id
  from public.users_profile up
  left join public.memberships m on m.user_id = up.id and m.status = 'active'
  join params p on lower(up.email) = lower(p.p_email)
)
select
  t.id,
  t.billing_status as billing_status_atual,
  'overdue'::text as billing_status_simulado,
  t.updated_at
from public.tenants t
join target_tenant tt on tt.tenant_id = t.id;


-- ============================================================
-- 8) SIMULAÇÃO - billing_status PARA current
-- O que testa:
-- - Mostra billing_status simulado "current"
-- - NÃO altera nada
-- ============================================================
with params as (
  select 'admin@exemplo.com'::text as p_email
),
target_tenant as (
  select distinct coalesce(up.tenant_id, m.tenant_id) as tenant_id
  from public.users_profile up
  left join public.memberships m on m.user_id = up.id and m.status = 'active'
  join params p on lower(up.email) = lower(p.p_email)
)
select
  t.id,
  t.billing_status as billing_status_atual,
  'current'::text as billing_status_simulado,
  t.updated_at
from public.tenants t
join target_tenant tt on tt.tenant_id = t.id;


-- ============================================================
-- 9) SIMULAÇÃO - DESATIVAR MÓDULO MARKETING
-- O que testa:
-- - Mostra estado atual do módulo MARKETING
-- - Mostra estado simulado "enabled = false"
-- - NÃO altera nada
-- ============================================================
with params as (
  select 'admin@exemplo.com'::text as p_email
),
target_tenant as (
  select distinct coalesce(up.tenant_id, m.tenant_id) as tenant_id
  from public.users_profile up
  left join public.memberships m on m.user_id = up.id and m.status = 'active'
  join params p on lower(up.email) = lower(p.p_email)
)
select
  tm.tenant_id,
  tm.module_key,
  tm.enabled as enabled_atual,
  false as enabled_simulado
from public.tenant_modules tm
join target_tenant tt on tt.tenant_id = tm.tenant_id
where upper(tm.module_key) = 'MARKETING';


-- ============================================================
-- 10) SIMULAÇÃO - REATIVAR MÓDULO MARKETING
-- O que testa:
-- - Mostra estado simulado "enabled = true"
-- - NÃO altera nada
-- ============================================================
with params as (
  select 'admin@exemplo.com'::text as p_email
),
target_tenant as (
  select distinct coalesce(up.tenant_id, m.tenant_id) as tenant_id
  from public.users_profile up
  left join public.memberships m on m.user_id = up.id and m.status = 'active'
  join params p on lower(up.email) = lower(p.p_email)
)
select
  tm.tenant_id,
  tm.module_key,
  tm.enabled as enabled_atual,
  true as enabled_simulado
from public.tenant_modules tm
join target_tenant tt on tt.tenant_id = tm.tenant_id
where upper(tm.module_key) = 'MARKETING';


-- ============================================================
-- 11) SIMULAÇÃO - DESLIGAR FEATURE FLAG POR flag_key
-- O que testa:
-- - Mostra flag atual no escopo global/tenant
-- - Mostra estado simulado "enabled = false"
-- - NÃO altera nada
-- ============================================================
with params as (
  select
    'admin@exemplo.com'::text as p_email,
    'whatsapp_ai_enabled'::text as p_flag_key
),
target_tenant as (
  select distinct coalesce(up.tenant_id, m.tenant_id) as tenant_id
  from public.users_profile up
  left join public.memberships m on m.user_id = up.id and m.status = 'active'
  join params p on lower(up.email) = lower(p.p_email)
)
select
  ff.flag_key,
  ff.scope_type,
  ff.scope_ref,
  ff.enabled as enabled_atual,
  false as enabled_simulado,
  ff.updated_at
from public.feature_flags ff
cross join params p
left join target_tenant tt on true
where ff.flag_key = p.p_flag_key
  and (
    ff.scope_type = 'global'
    or (ff.scope_type = 'tenant' and ff.scope_ref = tt.tenant_id::text)
  );


-- ============================================================
-- 12) SIMULAÇÃO - RELIGAR FEATURE FLAG
-- O que testa:
-- - Mostra estado simulado "enabled = true"
-- - NÃO altera nada
-- ============================================================
with params as (
  select
    'admin@exemplo.com'::text as p_email,
    'whatsapp_ai_enabled'::text as p_flag_key
),
target_tenant as (
  select distinct coalesce(up.tenant_id, m.tenant_id) as tenant_id
  from public.users_profile up
  left join public.memberships m on m.user_id = up.id and m.status = 'active'
  join params p on lower(up.email) = lower(p.p_email)
)
select
  ff.flag_key,
  ff.scope_type,
  ff.scope_ref,
  ff.enabled as enabled_atual,
  true as enabled_simulado,
  ff.updated_at
from public.feature_flags ff
cross join params p
left join target_tenant tt on true
where ff.flag_key = p.p_flag_key
  and (
    ff.scope_type = 'global'
    or (ff.scope_type = 'tenant' and ff.scope_ref = tt.tenant_id::text)
  );


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
