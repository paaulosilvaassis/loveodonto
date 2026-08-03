-- Phase 9.2C — RLS runtime validation (LOCAL DISPOSABLE ONLY)
-- Workdir: supabase-local | Executar via: supabase db query --local -f <este arquivo>
-- NÃO usar --linked / --db-url remoto.
--
-- Simulação auth: set_config(request.jwt.*) + SET LOCAL ROLE authenticated
-- Preparação: role postgres (bypass RLS) apenas para fixtures.
--
-- Saída esperada: linha final status = RLS_RUNTIME_PASS | RLS_RUNTIME_FAILED

begin;

create temporary table if not exists rls_runtime_results (
  scenario text primary key,
  detail text not null default '',
  passed boolean not null
);

-- Harness only: after SET LOCAL ROLE authenticated, inserts into this temp
-- table fail with "permission denied" unless authenticated can write results.
-- Does not touch app RLS policies or remote contracts (Phase 9.2K).
grant select, insert, update on table rls_runtime_results to authenticated;

create or replace function pg_temp.rls_assert(p_scenario text, p_passed boolean, p_detail text default '')
returns void
language plpgsql
as $$
begin
  insert into rls_runtime_results(scenario, detail, passed)
  values (p_scenario, coalesce(p_detail, ''), p_passed)
  on conflict (scenario) do update
    set detail = excluded.detail,
        passed = excluded.passed;
end;
$$;

create or replace function pg_temp.set_auth_context(
  p_uid uuid,
  p_tenant_id uuid,
  p_mode text default 'canonical'
)
returns void
language plpgsql
as $$
declare
  claims text;
begin
  -- canonical: app_metadata.tenant_id (+ legado top-level)
  -- app_metadata_only | legacy_top_level | malicious_user_metadata | divergent_prefer_app_metadata
  if p_mode = 'app_metadata_only' then
    claims := json_build_object(
      'sub', p_uid::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('tenant_id', p_tenant_id::text)
    )::text;
  elsif p_mode = 'legacy_top_level' then
    claims := json_build_object(
      'sub', p_uid::text,
      'role', 'authenticated',
      'tenant_id', p_tenant_id::text,
      'app_tenant_id', p_tenant_id::text
    )::text;
  elsif p_mode = 'malicious_user_metadata' then
    claims := json_build_object(
      'sub', p_uid::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('tenant_id', p_tenant_id::text),
      'user_metadata', json_build_object('tenant_id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2')
    )::text;
  elsif p_mode = 'divergent_prefer_app_metadata' then
    claims := json_build_object(
      'sub', p_uid::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('tenant_id', p_tenant_id::text),
      'tenant_id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
    )::text;
  else
    claims := json_build_object(
      'sub', p_uid::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('tenant_id', p_tenant_id::text),
      'tenant_id', p_tenant_id::text,
      'app_tenant_id', p_tenant_id::text
    )::text;
  end if;
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', claims, true);
end;
$$;

create or replace function pg_temp.clear_auth_context()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

do $$
declare
  tenant_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  tenant_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  user_a uuid := '11111111-1111-4111-8111-111111111111';
  user_b uuid := '22222222-2222-4222-8222-222222222222';
  user_x uuid := '33333333-3333-4333-8333-333333333333';
  appt_a uuid;
  appt_b uuid;
  far_a uuid;
  far_b uuid;
  fpay_a uuid;
  fpay_b uuid;
  ffin_a uuid;
  ffin_b uuid;
  stage_a uuid;
  stage_b uuid;
  lead_a uuid;
  lead_b uuid;
  cnt int;
  updated int;
  rls_on boolean;
  pol_count int;
  path_ok boolean;
  path_bad boolean;
  tbl text;
  orphan_policies int;
begin
  -- -------------------------------------------------------------------------
  -- 0) Pré-condições: tabelas 020–023 existem
  -- -------------------------------------------------------------------------
  perform pg_temp.rls_assert(
    'precondition_appointments_exists',
    to_regclass('public.appointments') is not null,
    'public.appointments'
  );
  perform pg_temp.rls_assert(
    'precondition_financial_tables_exist',
    to_regclass('public.financial_accounts_receivable') is not null
      and to_regclass('public.financial_payables') is not null
      and to_regclass('public.financial_financings') is not null,
    'far/fpay/ffin'
  );
  perform pg_temp.rls_assert(
    'precondition_crm_tables_exist',
    to_regclass('public.crm_leads') is not null
      and to_regclass('public.crm_pipeline_stages') is not null,
    'crm_leads/stages'
  );
  perform pg_temp.rls_assert(
    'precondition_tenants_exists',
    to_regclass('public.tenants') is not null,
    'public.tenants'
  );
  perform pg_temp.rls_assert(
    'precondition_helpers_exist',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'app_user_can_access_tenant')
      and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'app_user_is_tenant_admin')
      and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'app_user_can_read_tenant')
      and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'app_user_has_active_tenant_membership')
      and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'app_assert_critical_tenant_tables_rls'),
    'read/membership helpers + critical RLS assert (026)'
  );

  if to_regclass('public.appointments') is null
     or to_regclass('public.financial_accounts_receivable') is null
     or to_regclass('public.crm_leads') is null then
    perform pg_temp.rls_assert(
      'schema_gap_tables_missing',
      false,
      'rode npm run supabase:local:dry-run com APPLY_LOCAL_DB_RESET antes do RLS runtime'
    );
    -- Não segue fixtures/asserts de isolamento sem schema; resultado agregado falha abaixo.
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- 1) Bootstrap local mínimo de tenant_users (não existe nas migrations app)
  -- -------------------------------------------------------------------------
  execute $ddl$
    create table if not exists public.tenant_users (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references public.tenants(id) on delete cascade,
      user_id uuid,
      full_name text,
      email text,
      role text,
      role_slug text,
      status text not null default 'active',
      is_active boolean not null default true,
      has_system_access boolean not null default true,
      collaborator_uuid uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  $ddl$;

  grant select, insert, update, delete on public.tenants to authenticated;
  grant select, insert, update, delete on public.tenant_users to authenticated;
  grant select, insert, update, delete on public.appointments to authenticated;
  grant select, insert, update, delete on public.financial_accounts_receivable to authenticated;
  grant select, insert, update, delete on public.financial_payables to authenticated;
  grant select, insert, update, delete on public.financial_financings to authenticated;
  grant select, insert, update, delete on public.crm_pipeline_stages to authenticated;
  grant select, insert, update, delete on public.crm_leads to authenticated;

  -- -------------------------------------------------------------------------
  -- 2) Fixtures (como owner/superuser — bypass RLS)
  -- -------------------------------------------------------------------------
  insert into public.tenants (id, legal_name, trade_name, status)
  values
    (tenant_a, 'RLS Tenant A', 'tenant-local-a', 'active'),
    (tenant_b, 'RLS Tenant B', 'tenant-local-b', 'active')
  on conflict (id) do update
    set legal_name = excluded.legal_name,
        trade_name = excluded.trade_name,
        status = 'active';

  delete from public.tenant_users
  where user_id in (user_a, user_b, user_x)
     or email like 'rls-runtime-%@example.invalid';

  insert into public.tenant_users (
    tenant_id, user_id, full_name, email, role, role_slug, status, is_active, has_system_access
  ) values
    (tenant_a, user_a, 'User A Admin', 'rls-runtime-a@example.invalid', 'admin', 'admin', 'active', true, true),
    (tenant_b, user_b, 'User B Admin', 'rls-runtime-b@example.invalid', 'admin', 'admin', 'active', true, true);

  -- limpa fixtures anteriores desta suíte
  delete from public.appointments where legacy_id like 'rls-runtime-%';
  delete from public.financial_accounts_receivable where legacy_id like 'rls-runtime-%';
  delete from public.financial_payables where legacy_id like 'rls-runtime-%';
  delete from public.financial_financings where legacy_id like 'rls-runtime-%';
  delete from public.crm_leads where legacy_id like 'rls-runtime-%';
  delete from public.crm_pipeline_stages where legacy_id like 'rls-runtime-%';

  insert into public.appointments (
    tenant_id, legacy_id, patient_id, professional_id, date, start_time, end_time,
    duration_minutes, slot_capacity, status, procedure_name, channel, notes
  ) values
    (tenant_a, 'rls-runtime-appt-a', 'pat-a', 'pro-a', current_date, '09:00', '09:30', 30, 1, 'agendado', 'Limpeza', 'app', 'tenant A'),
    (tenant_b, 'rls-runtime-appt-b', 'pat-b', 'pro-b', current_date, '10:00', '10:30', 30, 1, 'agendado', 'Limpeza', 'app', 'tenant B');
  select id into appt_a from public.appointments where legacy_id = 'rls-runtime-appt-a';
  select id into appt_b from public.appointments where legacy_id = 'rls-runtime-appt-b';

  insert into public.financial_accounts_receivable (
    tenant_id, legacy_id, description, original_amount, net_amount, status
  ) values
    (tenant_a, 'rls-runtime-far-a', 'AR A', 100, 100, 'open'),
    (tenant_b, 'rls-runtime-far-b', 'AR B', 200, 200, 'open');
  select id into far_a from public.financial_accounts_receivable where legacy_id = 'rls-runtime-far-a';
  select id into far_b from public.financial_accounts_receivable where legacy_id = 'rls-runtime-far-b';

  insert into public.financial_payables (
    tenant_id, legacy_id, description, amount, status
  ) values
    (tenant_a, 'rls-runtime-fpay-a', 'AP A', 50, 'open'),
    (tenant_b, 'rls-runtime-fpay-b', 'AP B', 75, 'open');
  select id into fpay_a from public.financial_payables where legacy_id = 'rls-runtime-fpay-a';
  select id into fpay_b from public.financial_payables where legacy_id = 'rls-runtime-fpay-b';

  insert into public.financial_financings (
    tenant_id, legacy_id, status, total_amount, installments_count
  ) values
    (tenant_a, 'rls-runtime-ffin-a', 'draft', 1000, 3),
    (tenant_b, 'rls-runtime-ffin-b', 'draft', 2000, 6);
  select id into ffin_a from public.financial_financings where legacy_id = 'rls-runtime-ffin-a';
  select id into ffin_b from public.financial_financings where legacy_id = 'rls-runtime-ffin-b';

  insert into public.crm_pipeline_stages (
    tenant_id, legacy_id, key, label, "order", is_active
  ) values
    (tenant_a, 'rls-runtime-stage-a', 'novo_lead', 'Novo', 1, true),
    (tenant_b, 'rls-runtime-stage-b', 'novo_lead', 'Novo', 1, true);
  select id into stage_a from public.crm_pipeline_stages where legacy_id = 'rls-runtime-stage-a';
  select id into stage_b from public.crm_pipeline_stages where legacy_id = 'rls-runtime-stage-b';

  insert into public.crm_leads (
    tenant_id, legacy_id, name, stage_key, notes
  ) values
    (tenant_a, 'rls-runtime-lead-a', 'Lead A', 'novo_lead', 'A'),
    (tenant_b, 'rls-runtime-lead-b', 'Lead B', 'novo_lead', 'B');
  select id into lead_a from public.crm_leads where legacy_id = 'rls-runtime-lead-a';
  select id into lead_b from public.crm_leads where legacy_id = 'rls-runtime-lead-b';

  -- -------------------------------------------------------------------------
  -- 3) RLS enabled nas tabelas gap
  -- -------------------------------------------------------------------------
  foreach tbl in array array[
    'appointments',
    'financial_accounts_receivable',
    'financial_payables',
    'financial_financings',
    'crm_pipeline_stages',
    'crm_leads'
  ]
  loop
    select c.relrowsecurity into rls_on
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = tbl;
    perform pg_temp.rls_assert('rls_enabled_' || tbl, coalesce(rls_on, false), tbl);
  end loop;

  select count(*) into pol_count
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'appointments',
      'financial_accounts_receivable',
      'financial_payables',
      'financial_financings',
      'crm_pipeline_stages',
      'crm_leads'
    );
  perform pg_temp.rls_assert('policies_count_ge_12', pol_count >= 12, format('count=%s', pol_count));

  select count(*) into orphan_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'appointments',
      'financial_accounts_receivable',
      'financial_payables',
      'financial_financings',
      'crm_pipeline_stages',
      'crm_leads'
    )
    and coalesce(qual, '') !~* 'app_user_can_access_tenant'
    and coalesce(with_check, '') !~* 'app_user_can_access_tenant';
  perform pg_temp.rls_assert(
    'no_policy_without_tenant_helper',
    orphan_policies = 0,
    format('orphan_policies=%s', orphan_policies)
  );

  -- -------------------------------------------------------------------------
  -- 4) Storage 013/024 — policies + path helpers (foldername vs filename)
  -- -------------------------------------------------------------------------
  select count(*) into pol_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname like 'clinic_logos_storage_%';
  perform pg_temp.rls_assert(
    'storage_013_clinic_logos_policies_present',
    pol_count >= 4,
    format('count=%s', pol_count)
  );

  select count(*) into pol_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname like 'clinic_logos_storage_%'
    and policyname <> 'clinic_logos_storage_select'
    and coalesce(with_check, qual, '') ~* 'foldername\(name\)\)\[1\]';
  perform pg_temp.rls_assert(
    'storage_013_write_policies_use_foldername_tenant',
    pol_count >= 3,
    format('write_policies_with_foldername=%s', pol_count)
  );

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'collaborator_photos_storage_path_valid'
  ) then
    select public.collaborator_photos_storage_path_valid(
      tenant_a::text || '/collaborators/' || user_a::text || '/avatar.webp'
    ) into path_ok;
    select public.collaborator_photos_storage_path_valid('flat-avatar.webp') into path_bad;
    perform pg_temp.rls_assert('storage_024_path_valid_ok', path_ok is true, 'canonical path');
    perform pg_temp.rls_assert('storage_024_path_valid_rejects_flat', path_bad is false, 'flat path');

    select public.collaborator_photos_storage_path_valid(
      tenant_a::text || '/collaborators/' || user_a::text || '/Avatar.WEBP'
    ) into path_ok;
    perform pg_temp.rls_assert(
      'storage_024_path_valid_filename_case_insensitive',
      path_ok is true,
      'Avatar.WEBP'
    );

    select public.collaborator_photos_storage_path_valid(
      tenant_a::text || '/collaborators/' || user_a::text || '/avatar.png'
    ) into path_bad;
    perform pg_temp.rls_assert(
      'storage_024_path_valid_rejects_wrong_filename',
      path_bad is false,
      'avatar.png'
    );

    select public.collaborator_photos_storage_path_valid(
      tenant_a::text || '/collaborators/' || user_a::text || '/extra/avatar.webp'
    ) into path_bad;
    perform pg_temp.rls_assert(
      'storage_024_path_valid_rejects_extra_segment',
      path_bad is false,
      'extra directory'
    );

    select public.collaborator_photos_storage_path_valid(
      tenant_a::text || '/other/' || user_a::text || '/avatar.webp'
    ) into path_bad;
    perform pg_temp.rls_assert(
      'storage_024_path_valid_rejects_wrong_folder',
      path_bad is false,
      'other != collaborators'
    );

    select public.collaborator_photos_storage_path_valid(
      'not-a-uuid/collaborators/' || user_a::text || '/avatar.webp'
    ) into path_bad;
    perform pg_temp.rls_assert(
      'storage_024_path_valid_rejects_invalid_tenant_uuid',
      path_bad is false,
      'invalid tenant segment'
    );

    select count(*) into pol_count
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'collaborator_photos_storage_%';
    perform pg_temp.rls_assert('storage_024_policies_present', pol_count >= 4, format('count=%s', pol_count));
  else
    perform pg_temp.rls_assert('storage_024_helpers_present', false, '024 not applied in this local DB');
  end if;

  -- -------------------------------------------------------------------------
  -- 5) Runtime: User A (JWT tenant A + membership admin)
  -- -------------------------------------------------------------------------
  perform pg_temp.set_auth_context(user_a, tenant_a);
  execute 'set local role authenticated';

  select count(*) into cnt from public.appointments where legacy_id = 'rls-runtime-appt-a';
  perform pg_temp.rls_assert('user_a_reads_own_appointments', cnt = 1, format('cnt=%s', cnt));

  select count(*) into cnt from public.appointments where legacy_id = 'rls-runtime-appt-b';
  perform pg_temp.rls_assert('user_a_cannot_read_tenant_b_appointments', cnt = 0, format('cnt=%s', cnt));

  select count(*) into cnt from public.financial_accounts_receivable where legacy_id = 'rls-runtime-far-a';
  perform pg_temp.rls_assert('user_a_reads_own_far', cnt = 1, format('cnt=%s', cnt));
  select count(*) into cnt from public.financial_accounts_receivable where legacy_id = 'rls-runtime-far-b';
  perform pg_temp.rls_assert('user_a_cannot_read_tenant_b_far', cnt = 0, format('cnt=%s', cnt));

  select count(*) into cnt from public.financial_payables where legacy_id = 'rls-runtime-fpay-b';
  perform pg_temp.rls_assert('user_a_cannot_read_tenant_b_fpay', cnt = 0, format('cnt=%s', cnt));

  select count(*) into cnt from public.financial_financings where legacy_id = 'rls-runtime-ffin-b';
  perform pg_temp.rls_assert('user_a_cannot_read_tenant_b_ffin', cnt = 0, format('cnt=%s', cnt));

  select count(*) into cnt from public.crm_leads where legacy_id = 'rls-runtime-lead-a';
  perform pg_temp.rls_assert('user_a_reads_own_crm_leads', cnt = 1, format('cnt=%s', cnt));
  select count(*) into cnt from public.crm_leads where legacy_id = 'rls-runtime-lead-b';
  perform pg_temp.rls_assert('user_a_cannot_read_tenant_b_crm_leads', cnt = 0, format('cnt=%s', cnt));

  select count(*) into cnt from public.crm_pipeline_stages where legacy_id = 'rls-runtime-stage-b';
  perform pg_temp.rls_assert('user_a_cannot_read_tenant_b_stages', cnt = 0, format('cnt=%s', cnt));

  update public.appointments set notes = 'tamper-b' where legacy_id = 'rls-runtime-appt-b';
  get diagnostics updated = row_count;
  perform pg_temp.rls_assert('user_a_cannot_update_tenant_b_appointments', updated = 0, format('updated=%s', updated));

  update public.crm_leads set notes = 'tamper-b' where legacy_id = 'rls-runtime-lead-b';
  get diagnostics updated = row_count;
  perform pg_temp.rls_assert('user_a_cannot_update_tenant_b_crm_leads', updated = 0, format('updated=%s', updated));

  update public.appointments set notes = 'ok-a' where legacy_id = 'rls-runtime-appt-a';
  get diagnostics updated = row_count;
  perform pg_temp.rls_assert('user_a_can_update_own_appointments', updated = 1, format('updated=%s', updated));

  begin
    insert into public.appointments (
      tenant_id, legacy_id, date, start_time, end_time, duration_minutes, status
    ) values (
      tenant_b, 'rls-runtime-appt-cross', current_date, '11:00', '11:30', 30, 'agendado'
    );
    perform pg_temp.rls_assert('user_a_cannot_insert_into_tenant_b', false, 'insert unexpectedly succeeded');
  exception when others then
    perform pg_temp.rls_assert('user_a_cannot_insert_into_tenant_b', true, sqlerrm);
  end;

  insert into public.appointments (
    tenant_id, legacy_id, date, start_time, end_time, duration_minutes, status, notes
  ) values (
    tenant_a, 'rls-runtime-appt-a2', current_date, '12:00', '12:30', 30, 'agendado', 'created-by-a'
  );
  select count(*) into cnt from public.appointments where legacy_id = 'rls-runtime-appt-a2' and tenant_id = tenant_a;
  perform pg_temp.rls_assert('user_a_insert_keeps_tenant_id', cnt = 1, format('cnt=%s', cnt));

  execute 'reset role';
  perform pg_temp.clear_auth_context();

  -- -------------------------------------------------------------------------
  -- 6) Runtime: User B
  -- -------------------------------------------------------------------------
  perform pg_temp.set_auth_context(user_b, tenant_b);
  execute 'set local role authenticated';

  select count(*) into cnt from public.appointments where legacy_id = 'rls-runtime-appt-b';
  perform pg_temp.rls_assert('user_b_reads_own_appointments', cnt = 1, format('cnt=%s', cnt));
  select count(*) into cnt from public.appointments where legacy_id = 'rls-runtime-appt-a';
  perform pg_temp.rls_assert('user_b_cannot_read_tenant_a_appointments', cnt = 0, format('cnt=%s', cnt));

  select count(*) into cnt from public.crm_leads where legacy_id = 'rls-runtime-lead-a';
  perform pg_temp.rls_assert('user_b_cannot_read_tenant_a_crm_leads', cnt = 0, format('cnt=%s', cnt));

  update public.financial_accounts_receivable set description = 'tamper-a' where legacy_id = 'rls-runtime-far-a';
  get diagnostics updated = row_count;
  perform pg_temp.rls_assert('user_b_cannot_update_tenant_a_far', updated = 0, format('updated=%s', updated));

  execute 'reset role';
  perform pg_temp.clear_auth_context();

  -- -------------------------------------------------------------------------
  -- 7) Usuário sem membership (JWT tenant A, sem tenant_users) — fail-closed 026
  -- -------------------------------------------------------------------------
  perform pg_temp.set_auth_context(user_x, tenant_a);
  execute 'set local role authenticated';

  select count(*) into cnt from public.appointments where legacy_id = 'rls-runtime-appt-a';
  perform pg_temp.rls_assert(
    'stale_jwt_without_membership_cannot_read',
    cnt = 0,
    format('cnt=%s — SELECT exige membership ativa (026)', cnt)
  );

  update public.appointments set notes = 'orphan-tamper' where legacy_id = 'rls-runtime-appt-a';
  get diagnostics updated = row_count;
  perform pg_temp.rls_assert('orphan_cannot_update_without_admin_membership', updated = 0, format('updated=%s', updated));

  begin
    insert into public.appointments (
      tenant_id, legacy_id, date, start_time, end_time, duration_minutes, status
    ) values (
      tenant_a, 'rls-runtime-appt-orphan', current_date, '13:00', '13:30', 30, 'agendado'
    );
    perform pg_temp.rls_assert('orphan_cannot_insert_without_admin', false, 'insert unexpectedly succeeded');
  exception when others then
    perform pg_temp.rls_assert('orphan_cannot_insert_without_admin', true, sqlerrm);
  end;

  execute 'reset role';
  perform pg_temp.clear_auth_context();

  -- -------------------------------------------------------------------------
  -- 7b) Membership inativa / sem system access / status inactive
  -- -------------------------------------------------------------------------
  insert into public.tenant_users (
    tenant_id, user_id, full_name, email, role, role_slug, status, is_active, has_system_access
  ) values
    (tenant_a, user_x, 'User X Inactive', 'rls-runtime-x-inactive@example.invalid', 'admin', 'admin', 'active', false, true),
    (tenant_a, '44444444-4444-4444-8444-444444444444'::uuid, 'User NoSys', 'rls-runtime-nosys@example.invalid', 'admin', 'admin', 'active', true, false),
    (tenant_a, '55555555-5555-4555-8555-555555555555'::uuid, 'User Status', 'rls-runtime-status@example.invalid', 'admin', 'admin', 'inactive', true, true);

  perform pg_temp.set_auth_context(user_x, tenant_a);
  execute 'set local role authenticated';
  select count(*) into cnt from public.appointments where legacy_id = 'rls-runtime-appt-a';
  perform pg_temp.rls_assert('inactive_membership_cannot_read', cnt = 0, format('cnt=%s', cnt));
  execute 'reset role';
  perform pg_temp.clear_auth_context();

  perform pg_temp.set_auth_context('44444444-4444-4444-8444-444444444444'::uuid, tenant_a);
  execute 'set local role authenticated';
  select count(*) into cnt from public.appointments where legacy_id = 'rls-runtime-appt-a';
  perform pg_temp.rls_assert('no_system_access_cannot_read', cnt = 0, format('cnt=%s', cnt));
  execute 'reset role';
  perform pg_temp.clear_auth_context();

  perform pg_temp.set_auth_context('55555555-5555-4555-8555-555555555555'::uuid, tenant_a);
  execute 'set local role authenticated';
  select count(*) into cnt from public.appointments where legacy_id = 'rls-runtime-appt-a';
  perform pg_temp.rls_assert('inactive_status_cannot_read', cnt = 0, format('cnt=%s', cnt));
  execute 'reset role';
  perform pg_temp.clear_auth_context();

  -- -------------------------------------------------------------------------
  -- 7c) app_metadata canônico + user_metadata malicioso ignorado
  -- -------------------------------------------------------------------------
  perform pg_temp.set_auth_context(user_a, tenant_a, 'app_metadata_only');
  execute 'set local role authenticated';
  select count(*) into cnt from public.appointments where legacy_id = 'rls-runtime-appt-a';
  perform pg_temp.rls_assert('app_metadata_only_can_read_own', cnt = 1, format('cnt=%s', cnt));
  select count(*) into cnt from public.appointments where legacy_id = 'rls-runtime-appt-b';
  perform pg_temp.rls_assert('app_metadata_only_cannot_read_other', cnt = 0, format('cnt=%s', cnt));
  execute 'reset role';
  perform pg_temp.clear_auth_context();

  perform pg_temp.set_auth_context(user_a, tenant_a, 'legacy_top_level');
  execute 'set local role authenticated';
  select count(*) into cnt from public.appointments where legacy_id = 'rls-runtime-appt-a';
  perform pg_temp.rls_assert('legacy_top_level_claim_can_read_own', cnt = 1, format('cnt=%s', cnt));
  execute 'reset role';
  perform pg_temp.clear_auth_context();

  perform pg_temp.set_auth_context(user_a, tenant_a, 'malicious_user_metadata');
  execute 'set local role authenticated';
  select count(*) into cnt from public.appointments where legacy_id = 'rls-runtime-appt-a';
  perform pg_temp.rls_assert('user_metadata_ignored_still_reads_own', cnt = 1, format('cnt=%s', cnt));
  select count(*) into cnt from public.appointments where legacy_id = 'rls-runtime-appt-b';
  perform pg_temp.rls_assert('user_metadata_cannot_authorize_other_tenant', cnt = 0, format('cnt=%s', cnt));
  execute 'reset role';
  perform pg_temp.clear_auth_context();

  perform pg_temp.set_auth_context(user_a, tenant_a, 'divergent_prefer_app_metadata');
  execute 'set local role authenticated';
  select count(*) into cnt from public.appointments where legacy_id = 'rls-runtime-appt-a';
  perform pg_temp.rls_assert('divergent_claims_prefer_app_metadata', cnt = 1, format('cnt=%s', cnt));
  select count(*) into cnt from public.appointments where legacy_id = 'rls-runtime-appt-b';
  perform pg_temp.rls_assert('divergent_top_level_cannot_override', cnt = 0, format('cnt=%s', cnt));
  execute 'reset role';
  perform pg_temp.clear_auth_context();

  -- -------------------------------------------------------------------------
  -- 7d) Critical tables RLS assert (026)
  -- -------------------------------------------------------------------------
  begin
    perform public.app_assert_critical_tenant_tables_rls();
    perform pg_temp.rls_assert('critical_tables_rls_assert_pass', true, 'app_assert_critical_tenant_tables_rls');
  exception when others then
    perform pg_temp.rls_assert('critical_tables_rls_assert_pass', false, sqlerrm);
  end;

  select count(*) into cnt
  from public.app_validate_critical_tenant_tables_rls() v
  where v.table_exists and not v.ok;
  perform pg_temp.rls_assert('critical_tables_rls_validate_zero_exposed', cnt = 0, format('exposed=%s', cnt));

  select count(*) into cnt
  from public.app_validate_critical_tenant_tables_rls() v
  where v.table_name in (
    'appointments',
    'financial_accounts_receivable',
    'financial_payables',
    'financial_financings',
    'crm_pipeline_stages',
    'crm_leads'
  )
    and v.table_exists
    and v.rls_enabled
    and v.force_rls
    and v.policy_count >= 1;
  perform pg_temp.rls_assert('critical_020_022_force_rls_and_policies', cnt = 6, format('ok=%s', cnt));

  -- -------------------------------------------------------------------------
  -- 8) Sem auth (role authenticated sem jwt) — não deve ler
  -- -------------------------------------------------------------------------
  perform pg_temp.clear_auth_context();
  execute 'set local role authenticated';
  select count(*) into cnt from public.appointments where legacy_id like 'rls-runtime-%';
  perform pg_temp.rls_assert('unauthenticated_claims_cannot_read', cnt = 0, format('cnt=%s', cnt));
  execute 'reset role';

  -- limpeza leve das fixtures de escrita do teste (mantém tenants)
  delete from public.appointments where legacy_id like 'rls-runtime-%';
  delete from public.financial_accounts_receivable where legacy_id like 'rls-runtime-%';
  delete from public.financial_payables where legacy_id like 'rls-runtime-%';
  delete from public.financial_financings where legacy_id like 'rls-runtime-%';
  delete from public.crm_leads where legacy_id like 'rls-runtime-%';
  delete from public.crm_pipeline_stages where legacy_id like 'rls-runtime-%';
  delete from public.tenant_users where email like 'rls-runtime-%@example.invalid';

end $$;

-- Resultado agregado (visível no stdout do CLI)
select
  case when bool_and(passed) then 'RLS_RUNTIME_PASS' else 'RLS_RUNTIME_FAILED' end as status,
  count(*) filter (where passed) as passed_count,
  count(*) filter (where not passed) as failed_count,
  count(*) as total
from rls_runtime_results;

select scenario, passed, detail
from rls_runtime_results
order by passed asc, scenario asc;

-- Falha dura se algum cenário quebrou (exit code != 0 no CLI)
do $$
declare
  failed int;
begin
  select count(*) into failed from rls_runtime_results where not passed;
  if failed > 0 then
    raise exception 'RLS_RUNTIME_FAILED: % cenário(s) falharam', failed;
  end if;
  raise notice 'RLS_RUNTIME_PASS';
end $$;

commit;
