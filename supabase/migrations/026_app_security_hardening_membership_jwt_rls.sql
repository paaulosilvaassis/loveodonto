-- 026: Security hardening — JWT tenant claim canônico + membership obrigatória no SELECT
-- + fail-closed RLS nas tabelas críticas 020–022.
--
-- Escopo: somente hardening comprovado (Riscos A/B/D da Phase 9.4A Security Gate).
-- Não altera Pacientes Wave 2 / dual-write / flags.
--
-- Contrato canônico de tenant claim (app):
--   1) auth.jwt() -> app_metadata ->> tenant_id
--   2) fallback legado: top-level tenant_id, depois app_tenant_id
--   3) NUNCA user_metadata para autorização
--
-- SELECT fail-closed:
--   auth.uid() presente + claim compatível + membership ativa em tenant_users
--   (is_active / has_system_access / status='active')
--
-- ROLLBACK manual: restaurar helpers de 002/012 (não recomendado).

-- ---------------------------------------------------------------------------
-- A/D — UUID parse seguro (não lança)
-- ---------------------------------------------------------------------------

create or replace function public.app_try_parse_uuid(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  if p_text is null or length(btrim(p_text)) = 0 then
    return null;
  end if;
  return btrim(p_text)::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

revoke all on function public.app_try_parse_uuid(text) from public;
grant execute on function public.app_try_parse_uuid(text) to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- D — app_current_tenant_id canônico (app_metadata primeiro; sem user_metadata)
-- ---------------------------------------------------------------------------

create or replace function public.app_current_tenant_id()
returns text
language plpgsql
stable
as $$
declare
  raw text;
  parsed uuid;
begin
  raw := nullif(btrim(coalesce(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')), '');

  if raw is null then
    raw := nullif(btrim(coalesce(auth.jwt() ->> 'tenant_id', '')), '');
  end if;

  if raw is null then
    raw := nullif(btrim(coalesce(auth.jwt() ->> 'app_tenant_id', '')), '');
  end if;

  -- intencionalmente ignora auth.jwt() -> 'user_metadata'

  parsed := public.app_try_parse_uuid(raw);
  if parsed is null then
    return null;
  end if;

  return parsed::text;
end;
$$;

revoke all on function public.app_current_tenant_id() from public;
grant execute on function public.app_current_tenant_id() to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- A — membership ativa (SECURITY DEFINER, search_path fixo, sem recursão RLS)
-- ---------------------------------------------------------------------------

create or replace function public.app_user_has_active_tenant_membership(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    auth.uid() is not null
    and p_tenant_id is not null
    and exists (
      select 1
      from public.tenant_users tu
      where tu.user_id = auth.uid()
        and tu.tenant_id = p_tenant_id
        and tu.is_active is true
        and tu.has_system_access is true
        and lower(coalesce(tu.status, '')) = 'active'
    )
  );
$$;

revoke all on function public.app_user_has_active_tenant_membership(uuid) from public;
grant execute on function public.app_user_has_active_tenant_membership(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- A — helper canônico de leitura (claim + membership)
-- ---------------------------------------------------------------------------

create or replace function public.app_user_can_read_tenant(p_tenant_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    auth.uid() is not null
    and p_tenant_id is not null
    and public.app_current_tenant_id() is not null
    and p_tenant_id = public.app_current_tenant_id()
    and public.app_user_has_active_tenant_membership(public.app_try_parse_uuid(p_tenant_id))
  );
$$;

create or replace function public.app_user_can_read_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_user_can_read_tenant(p_tenant_id::text);
$$;

revoke all on function public.app_user_can_read_tenant(text) from public;
revoke all on function public.app_user_can_read_tenant(uuid) from public;
grant execute on function public.app_user_can_read_tenant(text) to authenticated;
grant execute on function public.app_user_can_read_tenant(uuid) to authenticated;

-- Redefine o helper legado usado por policies existentes (SELECT/ALL) — fail-closed.
create or replace function public.app_user_can_access_tenant(row_tenant_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_user_can_read_tenant(row_tenant_id);
$$;

revoke all on function public.app_user_can_access_tenant(text) from public;
grant execute on function public.app_user_can_access_tenant(text) to authenticated;

-- Alinha admin helper ao mesmo fail-closed de membership (sem default permissivo).
create or replace function public.app_user_is_tenant_admin(p_tenant_id uuid)
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
      and lower(coalesce(tu.role_slug, tu.role, '')) in ('owner', 'admin', 'master')
      and tu.is_active is true
      and tu.has_system_access is true
      and lower(coalesce(tu.status, '')) = 'active'
  );
$$;

revoke all on function public.app_user_is_tenant_admin(uuid) from public;
grant execute on function public.app_user_is_tenant_admin(uuid) to authenticated;

create or replace function public.app_user_admin_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tu.tenant_id
  from public.tenant_users tu
  where tu.user_id = auth.uid()
    and lower(coalesce(tu.role_slug, tu.role, '')) in ('owner', 'admin', 'master')
    and tu.is_active is true
    and tu.has_system_access is true
    and lower(coalesce(tu.status, '')) = 'active'
  order by tu.created_at asc
  limit 1;
$$;

revoke all on function public.app_user_admin_tenant_id() from public;
grant execute on function public.app_user_admin_tenant_id() to authenticated;

-- ---------------------------------------------------------------------------
-- B — validação fail-closed: tabelas críticas 020–022 devem ter RLS + policies
-- ---------------------------------------------------------------------------

create or replace function public.app_validate_critical_tenant_tables_rls()
returns table (
  table_name text,
  table_exists boolean,
  rls_enabled boolean,
  force_rls boolean,
  policy_count integer,
  ok boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  critical text[] := array[
    'appointments',
    'financial_accounts_receivable',
    'financial_payables',
    'financial_financings',
    'crm_pipeline_stages',
    'crm_leads',
    'patients',
    'patient_phones',
    'patient_documents',
    'patient_records',
    'clinic_profiles',
    'collaborators'
  ];
  t text;
  exists_tbl boolean;
  rls boolean;
  frls boolean;
  pols int;
begin
  foreach t in array critical loop
    exists_tbl := to_regclass('public.' || t) is not null;

    if not exists_tbl then
      table_name := t;
      table_exists := false;
      rls_enabled := false;
      force_rls := false;
      policy_count := 0;
      ok := true; -- ausente ≠ exposta; gap de schema é outro gate
      return next;
      continue;
    end if;

    select c.relrowsecurity, c.relforcerowsecurity
      into rls, frls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t;

    select count(*)::int into pols
    from pg_policies p
    where p.schemaname = 'public' and p.tablename = t;

    table_name := t;
    table_exists := true;
    rls_enabled := coalesce(rls, false);
    force_rls := coalesce(frls, false);
    policy_count := coalesce(pols, 0);
    ok := coalesce(rls, false) and coalesce(pols, 0) >= 1;
    return next;
  end loop;
end;
$$;

revoke all on function public.app_validate_critical_tenant_tables_rls() from public;
grant execute on function public.app_validate_critical_tenant_tables_rls() to authenticated, service_role;

create or replace function public.app_assert_critical_tenant_tables_rls()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  exposed text;
begin
  select string_agg(v.table_name, ', ' order by v.table_name)
    into exposed
  from public.app_validate_critical_tenant_tables_rls() v
  where v.table_exists and not v.ok;

  if exposed is not null then
    raise exception 'CRITICAL_TABLE_RLS_EXPOSED: %', exposed
      using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.app_assert_critical_tenant_tables_rls() from public;
grant execute on function public.app_assert_critical_tenant_tables_rls() to service_role;

do $$
declare
  t text;
  critical text[] := array[
    'appointments',
    'financial_accounts_receivable',
    'financial_payables',
    'financial_financings',
    'crm_pipeline_stages',
    'crm_leads',
    'patients',
    'patient_phones',
    'patient_documents',
    'patient_records',
    'clinic_profiles',
    'collaborators'
  ];
begin
  foreach t in array critical loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;

  perform public.app_assert_critical_tenant_tables_rls();
end $$;

comment on function public.app_user_can_read_tenant(text) is
  'Fail-closed SELECT authz: JWT tenant claim (app_metadata-first) + active tenant_users membership.';
comment on function public.app_current_tenant_id() is
  'Canonical tenant claim: app_metadata.tenant_id, then legacy top-level; never user_metadata.';
comment on function public.app_assert_critical_tenant_tables_rls() is
  'Fails closed when a critical public table exists without RLS or without policies.';
