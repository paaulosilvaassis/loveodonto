-- Phase 9.4A Wave 1 — RLS runtime Pacientes (LOCAL DISPOSABLE ONLY)
-- Workdir: supabase-local | Execução: docker exec + psql (via runner)
-- NÃO usar --linked / --db-url remoto / db push.
--
-- Escopo: public.patients | patient_phones | patient_documents | patient_records
-- Pré-requisito: migration 025 aplicada no banco local descartável.
--
-- Saída esperada: PATIENTS_WAVE1_RLS_PASS | PATIENTS_WAVE1_RLS_FAILED

begin;

create temporary table if not exists patients_wave1_rls_results (
  scenario text primary key,
  detail text not null default '',
  passed boolean not null
);

grant select, insert, update on table patients_wave1_rls_results to authenticated;

create or replace function pg_temp.pw1_assert(p_scenario text, p_passed boolean, p_detail text default '')
returns void
language plpgsql
as $$
begin
  insert into patients_wave1_rls_results(scenario, detail, passed)
  values (p_scenario, coalesce(p_detail, ''), p_passed)
  on conflict (scenario) do update
    set detail = excluded.detail,
        passed = excluded.passed;
end;
$$;

create or replace function pg_temp.set_auth_context(p_uid uuid, p_tenant_id uuid)
returns void
language plpgsql
as $$
declare
  claims text;
begin
  -- Canonical 026: app_metadata.tenant_id (+ legacy top-level for dual-compat fixtures)
  claims := json_build_object(
    'sub', p_uid::text,
    'role', 'authenticated',
    'app_metadata', json_build_object('tenant_id', p_tenant_id::text),
    'tenant_id', p_tenant_id::text,
    'app_tenant_id', p_tenant_id::text
  )::text;
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
  patient_a uuid;
  patient_b uuid;
  phone_a uuid;
  phone_b uuid;
  docs_a uuid;
  docs_b uuid;
  rec_a uuid;
  rec_b uuid;
  cnt int;
  updated int;
  rls_on boolean;
  pol_count int;
  orphan_policies int;
  tbl text;
begin
  -- -------------------------------------------------------------------------
  -- 0) Pré-condições Wave 1
  -- -------------------------------------------------------------------------
  perform pg_temp.pw1_assert(
    'precondition_patients_exists',
    to_regclass('public.patients') is not null,
    'public.patients'
  );
  perform pg_temp.pw1_assert(
    'precondition_patient_phones_exists',
    to_regclass('public.patient_phones') is not null,
    'public.patient_phones'
  );
  perform pg_temp.pw1_assert(
    'precondition_patient_documents_exists',
    to_regclass('public.patient_documents') is not null,
    'public.patient_documents'
  );
  perform pg_temp.pw1_assert(
    'precondition_patient_records_exists',
    to_regclass('public.patient_records') is not null,
    'public.patient_records'
  );
  perform pg_temp.pw1_assert(
    'precondition_tenants_exists',
    to_regclass('public.tenants') is not null,
    'public.tenants'
  );
  perform pg_temp.pw1_assert(
    'precondition_helpers_exist',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'app_user_can_access_tenant')
      and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'app_user_is_tenant_admin'),
    'app_user_can_access_tenant + app_user_is_tenant_admin'
  );

  if to_regclass('public.patients') is null
     or to_regclass('public.patient_phones') is null
     or to_regclass('public.patient_documents') is null
     or to_regclass('public.patient_records') is null then
    perform pg_temp.pw1_assert(
      'schema_gap_patients_wave1_missing',
      false,
      'rode dry-run local com migration 025 antes do RLS Wave 1'
    );
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- 1) Bootstrap mínimo tenant_users (idempotente)
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
  grant select, insert, update, delete on public.patients to authenticated;
  grant select, insert, update, delete on public.patient_phones to authenticated;
  grant select, insert, update, delete on public.patient_documents to authenticated;
  grant select, insert, update, delete on public.patient_records to authenticated;

  -- -------------------------------------------------------------------------
  -- 2) Fixtures (postgres bypass RLS)
  -- -------------------------------------------------------------------------
  insert into public.tenants (id, legal_name, trade_name, status)
  values
    (tenant_a, 'Patients Wave1 Tenant A', 'patients-wave1-a', 'active'),
    (tenant_b, 'Patients Wave1 Tenant B', 'patients-wave1-b', 'active')
  on conflict (id) do update
    set legal_name = excluded.legal_name,
        trade_name = excluded.trade_name,
        status = 'active';

  delete from public.tenant_users
  where user_id in (user_a, user_b, user_x)
     or email like 'patients-wave1-%@example.invalid';

  insert into public.tenant_users (
    tenant_id, user_id, full_name, email, role, role_slug, status, is_active, has_system_access
  ) values
    (tenant_a, user_a, 'User A Admin', 'patients-wave1-a@example.invalid', 'admin', 'admin', 'active', true, true),
    (tenant_b, user_b, 'User B Admin', 'patients-wave1-b@example.invalid', 'admin', 'admin', 'active', true, true);

  delete from public.patient_phones where legacy_id like 'phone-wave1-%';
  delete from public.patient_documents where patient_id in (
    select id from public.patients where legacy_id like 'patient-wave1-%'
  );
  delete from public.patient_records where legacy_id like 'record-wave1-%';
  delete from public.patients where legacy_id like 'patient-wave1-%';

  insert into public.patients (
    tenant_id, legacy_id, guid, full_name, nickname, social_name, sex, birth_date, cpf, status
  ) values
    (
      tenant_a,
      'patient-wave1-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'Paciente Wave1 A',
      'A',
      '',
      'F',
      '1990-01-15',
      '39053344705',
      'active'
    ),
    (
      tenant_b,
      'patient-wave1-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      'Paciente Wave1 B',
      'B',
      '',
      'M',
      '1988-03-20',
      '52998224725',
      'active'
    );

  select id into patient_a from public.patients
  where legacy_id = 'patient-wave1-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  select id into patient_b from public.patients
  where legacy_id = 'patient-wave1-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

  insert into public.patient_phones (
    tenant_id, patient_id, legacy_id, type, country_code, ddd, number, is_whatsapp, is_primary, e164
  ) values
    (tenant_a, patient_a, 'phone-wave1-a', 'mobile', '55', '11', '988887777', true, true, '+5511988887777'),
    (tenant_b, patient_b, 'phone-wave1-b', 'mobile', '55', '21', '977776666', true, true, '+5521977776666');

  select id into phone_a from public.patient_phones where legacy_id = 'phone-wave1-a';
  select id into phone_b from public.patient_phones where legacy_id = 'phone-wave1-b';

  insert into public.patient_documents (
    tenant_id, patient_id, rg, personal_email, responsible_name, responsible_cpf
  ) values
    (tenant_a, patient_a, '12.345.678-9', 'a@example.invalid', '', ''),
    (tenant_b, patient_b, '98.765.432-1', 'b@example.invalid', '', '');

  select id into docs_a from public.patient_documents where patient_id = patient_a;
  select id into docs_b from public.patient_documents where patient_id = patient_b;

  insert into public.patient_records (
    tenant_id, patient_id, legacy_id, record_number, preferred_dentist, patient_type
  ) values
    (tenant_a, patient_a, 'record-wave1-a', '00010001', '', 'particular'),
    (tenant_b, patient_b, 'record-wave1-b', '00020001', '', 'particular');

  select id into rec_a from public.patient_records where legacy_id = 'record-wave1-a';
  select id into rec_b from public.patient_records where legacy_id = 'record-wave1-b';

  -- -------------------------------------------------------------------------
  -- 3) RLS enabled + policies
  -- -------------------------------------------------------------------------
  foreach tbl in array array[
    'patients',
    'patient_phones',
    'patient_documents',
    'patient_records'
  ]
  loop
    select c.relrowsecurity into rls_on
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = tbl;
    perform pg_temp.pw1_assert('rls_enabled_' || tbl, coalesce(rls_on, false), tbl);
  end loop;

  select count(*) into pol_count
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'patients',
      'patient_phones',
      'patient_documents',
      'patient_records'
    );
  perform pg_temp.pw1_assert('policies_count_ge_8', pol_count >= 8, format('count=%s', pol_count));

  select count(*) into orphan_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'patients',
      'patient_phones',
      'patient_documents',
      'patient_records'
    )
    and coalesce(qual, '') !~* 'app_user_can_access_tenant'
    and coalesce(with_check, '') !~* 'app_user_can_access_tenant';
  perform pg_temp.pw1_assert(
    'no_policy_without_tenant_helper',
    orphan_policies = 0,
    format('orphan_policies=%s', orphan_policies)
  );

  -- -------------------------------------------------------------------------
  -- 4) User A — isolamento
  -- -------------------------------------------------------------------------
  perform pg_temp.set_auth_context(user_a, tenant_a);
  execute 'set local role authenticated';

  select count(*) into cnt from public.patients
  where legacy_id = 'patient-wave1-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  perform pg_temp.pw1_assert('user_a_reads_own_patients', cnt = 1, format('cnt=%s', cnt));

  select count(*) into cnt from public.patients
  where legacy_id = 'patient-wave1-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  perform pg_temp.pw1_assert('user_a_cannot_read_tenant_b_patients', cnt = 0, format('cnt=%s', cnt));

  select count(*) into cnt from public.patient_phones where legacy_id = 'phone-wave1-a';
  perform pg_temp.pw1_assert('user_a_reads_own_patient_phones', cnt = 1, format('cnt=%s', cnt));
  select count(*) into cnt from public.patient_phones where legacy_id = 'phone-wave1-b';
  perform pg_temp.pw1_assert('user_a_cannot_read_tenant_b_patient_phones', cnt = 0, format('cnt=%s', cnt));

  select count(*) into cnt from public.patient_documents where id = docs_a;
  perform pg_temp.pw1_assert('user_a_reads_own_patient_documents', cnt = 1, format('cnt=%s', cnt));
  select count(*) into cnt from public.patient_documents where id = docs_b;
  perform pg_temp.pw1_assert('user_a_cannot_read_tenant_b_patient_documents', cnt = 0, format('cnt=%s', cnt));

  select count(*) into cnt from public.patient_records where legacy_id = 'record-wave1-a';
  perform pg_temp.pw1_assert('user_a_reads_own_patient_records', cnt = 1, format('cnt=%s', cnt));
  select count(*) into cnt from public.patient_records where legacy_id = 'record-wave1-b';
  perform pg_temp.pw1_assert('user_a_cannot_read_tenant_b_patient_records', cnt = 0, format('cnt=%s', cnt));

  update public.patients set nickname = 'tamper-b' where id = patient_b;
  get diagnostics updated = row_count;
  perform pg_temp.pw1_assert('user_a_cannot_update_tenant_b_patients', updated = 0, format('updated=%s', updated));

  update public.patients set nickname = 'ok-a' where id = patient_a;
  get diagnostics updated = row_count;
  perform pg_temp.pw1_assert('user_a_can_update_own_patients', updated = 1, format('updated=%s', updated));

  begin
    insert into public.patients (
      tenant_id, legacy_id, full_name, sex, birth_date, cpf, status
    ) values (
      tenant_b,
      'patient-wave1-cross-insert',
      'Cross Insert',
      'F',
      '1995-05-05',
      '11144477735',
      'active'
    );
    perform pg_temp.pw1_assert('user_a_cannot_insert_into_tenant_b_patients', false, 'insert unexpectedly succeeded');
  exception when others then
    perform pg_temp.pw1_assert('user_a_cannot_insert_into_tenant_b_patients', true, sqlerrm);
  end;

  insert into public.patients (
    tenant_id, legacy_id, full_name, sex, birth_date, cpf, status, nickname
  ) values (
    tenant_a,
    'patient-wave1-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'Paciente Wave1 A2',
    'M',
    '1992-02-02',
    '15350946056',
    'active',
    'created-by-a'
  );
  select count(*) into cnt from public.patients
  where legacy_id = 'patient-wave1-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
    and tenant_id = tenant_a;
  perform pg_temp.pw1_assert('user_a_insert_keeps_tenant_id', cnt = 1, format('cnt=%s', cnt));

  execute 'reset role';
  perform pg_temp.clear_auth_context();

  -- -------------------------------------------------------------------------
  -- 5) User B
  -- -------------------------------------------------------------------------
  perform pg_temp.set_auth_context(user_b, tenant_b);
  execute 'set local role authenticated';

  select count(*) into cnt from public.patients
  where legacy_id = 'patient-wave1-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  perform pg_temp.pw1_assert('user_b_reads_own_patients', cnt = 1, format('cnt=%s', cnt));

  select count(*) into cnt from public.patients
  where legacy_id = 'patient-wave1-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  perform pg_temp.pw1_assert('user_b_cannot_read_tenant_a_patients', cnt = 0, format('cnt=%s', cnt));

  update public.patient_phones set number = '900000000' where legacy_id = 'phone-wave1-a';
  get diagnostics updated = row_count;
  perform pg_temp.pw1_assert('user_b_cannot_update_tenant_a_patient_phones', updated = 0, format('updated=%s', updated));

  execute 'reset role';
  perform pg_temp.clear_auth_context();

  -- -------------------------------------------------------------------------
  -- 6) Orphan (JWT tenant A, sem membership admin)
  -- -------------------------------------------------------------------------
  perform pg_temp.set_auth_context(user_x, tenant_a);
  execute 'set local role authenticated';

  select count(*) into cnt from public.patients
  where legacy_id = 'patient-wave1-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  perform pg_temp.pw1_assert(
    'stale_jwt_without_membership_cannot_read_patients',
    cnt = 0,
    format('cnt=%s — SELECT exige membership ativa (026)', cnt)
  );

  update public.patients set nickname = 'orphan-tamper' where id = patient_a;
  get diagnostics updated = row_count;
  perform pg_temp.pw1_assert(
    'orphan_cannot_update_patient_without_admin',
    updated = 0,
    format('updated=%s', updated)
  );

  begin
    insert into public.patients (
      tenant_id, legacy_id, full_name, sex, birth_date, cpf, status
    ) values (
      tenant_a,
      'patient-wave1-orphan',
      'Orphan',
      'F',
      '1991-01-01',
      '12345678909',
      'active'
    );
    perform pg_temp.pw1_assert('orphan_cannot_insert_patient_without_admin', false, 'insert unexpectedly succeeded');
  exception when others then
    perform pg_temp.pw1_assert('orphan_cannot_insert_patient_without_admin', true, sqlerrm);
  end;

  execute 'reset role';
  perform pg_temp.clear_auth_context();

  -- -------------------------------------------------------------------------
  -- 7) Sem claims
  -- -------------------------------------------------------------------------
  perform pg_temp.clear_auth_context();
  execute 'set local role authenticated';
  select count(*) into cnt from public.patients where legacy_id like 'patient-wave1-%';
  perform pg_temp.pw1_assert('unauthenticated_claims_cannot_read_patients', cnt = 0, format('cnt=%s', cnt));
  execute 'reset role';

  -- limpeza
  delete from public.patient_phones where legacy_id like 'phone-wave1-%';
  delete from public.patient_documents where patient_id in (
    select id from public.patients where legacy_id like 'patient-wave1-%'
  );
  delete from public.patient_records where legacy_id like 'record-wave1-%';
  delete from public.patients where legacy_id like 'patient-wave1-%';
  delete from public.tenant_users where email like 'patients-wave1-%@example.invalid';

end $$;

select
  case when bool_and(passed) then 'PATIENTS_WAVE1_RLS_PASS' else 'PATIENTS_WAVE1_RLS_FAILED' end as status,
  count(*) filter (where passed) as passed_count,
  count(*) filter (where not passed) as failed_count,
  count(*) as total
from patients_wave1_rls_results;

select scenario, passed, detail
from patients_wave1_rls_results
order by passed asc, scenario asc;

do $$
declare
  failed int;
begin
  select count(*) into failed from patients_wave1_rls_results where not passed;
  if failed > 0 then
    raise exception 'PATIENTS_WAVE1_RLS_FAILED: % cenário(s) falharam', failed;
  end if;
  raise notice 'PATIENTS_WAVE1_RLS_PASS';
end $$;

commit;
