-- Phase 9.4A Wave 2 — RLS runtime Pacientes satélites (LOCAL DISPOSABLE ONLY)
-- Escopo: birth/education/addresses/relationships/insurances/access/activity
-- Pré-requisito: migrations 025–027. Saída: PATIENTS_WAVE2_RLS_PASS|FAILED

begin;

create temporary table if not exists patients_wave2_rls_results (
  scenario text primary key,
  detail text not null default '',
  passed boolean not null
);
grant select, insert, update on table patients_wave2_rls_results to authenticated;

create or replace function pg_temp.pw2_assert(p_scenario text, p_passed boolean, p_detail text default '')
returns void language plpgsql as $$
begin
  insert into patients_wave2_rls_results(scenario, detail, passed)
  values (p_scenario, coalesce(p_detail, ''), p_passed)
  on conflict (scenario) do update set detail = excluded.detail, passed = excluded.passed;
end;
$$;

create or replace function pg_temp.set_auth_context(p_uid uuid, p_tenant_id uuid)
returns void language plpgsql as $$
declare claims text;
begin
  claims := json_build_object(
    'sub', p_uid::text, 'role', 'authenticated',
    'app_metadata', json_build_object('tenant_id', p_tenant_id::text),
    'tenant_id', p_tenant_id::text, 'app_tenant_id', p_tenant_id::text
  )::text;
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', claims, true);
end;
$$;

create or replace function pg_temp.clear_auth_context()
returns void language plpgsql as $$
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
  cnt int;
  updated int;
  rls_on boolean;
  pol_count int;
  tbl text;
  tables text[] := array[
    'patient_birth_details','patient_education','patient_addresses',
    'patient_relationships','patient_insurances','patient_access','patient_activity_summary'
  ];
begin
  foreach tbl in array tables loop
    perform pg_temp.pw2_assert(
      'precondition_' || tbl || '_exists',
      to_regclass('public.' || tbl) is not null,
      tbl
    );
  end loop;

  if to_regclass('public.patient_birth_details') is null then
    perform pg_temp.pw2_assert('schema_gap_wave2_missing', false, 'dry-run com 027 necessário');
    return;
  end if;

  execute $ddl$
    create table if not exists public.tenant_users (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references public.tenants(id) on delete cascade,
      user_id uuid, full_name text, email text, role text, role_slug text,
      status text not null default 'active',
      is_active boolean not null default true,
      has_system_access boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  $ddl$;

  grant select, insert, update, delete on public.tenants to authenticated;
  grant select, insert, update, delete on public.tenant_users to authenticated;
  grant select, insert, update, delete on public.patients to authenticated;
  foreach tbl in array tables loop
    execute format('grant select, insert, update on public.%I to authenticated', tbl);
  end loop;

  insert into public.tenants (id, legal_name, trade_name, status) values
    (tenant_a, 'Patients Wave2 A', 'patients-wave2-a', 'active'),
    (tenant_b, 'Patients Wave2 B', 'patients-wave2-b', 'active')
  on conflict (id) do update set status = 'active';

  delete from public.tenant_users where email like 'patients-wave2-%@example.invalid';
  insert into public.tenant_users (
    tenant_id, user_id, full_name, email, role, role_slug, status, is_active, has_system_access
  ) values
    (tenant_a, user_a, 'A', 'patients-wave2-a@example.invalid', 'admin', 'admin', 'active', true, true),
    (tenant_b, user_b, 'B', 'patients-wave2-b@example.invalid', 'admin', 'admin', 'active', true, true);

  delete from public.patients where legacy_id like 'patient-wave2-%';
  insert into public.patients (
    tenant_id, legacy_id, full_name, sex, birth_date, cpf, status
  ) values
    (tenant_a, 'patient-wave2-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Paciente A Wave2', 'M', '1990-01-01', '39053344705', 'active'),
    (tenant_b, 'patient-wave2-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'Paciente B Wave2', 'F', '1991-01-01', '15350946056', 'active');
  select id into patient_a from public.patients where legacy_id = 'patient-wave2-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  select id into patient_b from public.patients where legacy_id = 'patient-wave2-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';

  foreach tbl in array tables loop
    select c.relrowsecurity into rls_on
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = tbl;
    perform pg_temp.pw2_assert('rls_enabled_' || tbl, coalesce(rls_on, false), tbl);
  end loop;

  select count(*) into pol_count from pg_policies
  where schemaname = 'public' and tablename = any(tables);
  perform pg_temp.pw2_assert('policies_count_ge_14', pol_count >= 14, format('count=%s', pol_count));

  -- User A writes
  perform pg_temp.set_auth_context(user_a, tenant_a);
  execute 'set local role authenticated';

  insert into public.patient_birth_details (tenant_id, patient_id, nationality, birth_city, birth_state)
  values (tenant_a, patient_a, 'Brasileira', 'São Paulo', 'SP');
  select count(*) into cnt from public.patient_birth_details where patient_id = patient_a;
  perform pg_temp.pw2_assert('user_a_creates_reads_birth', cnt = 1, format('cnt=%s', cnt));

  begin
    insert into public.patient_birth_details (tenant_id, patient_id, nationality)
    values (tenant_a, patient_a, 'Dup');
    perform pg_temp.pw2_assert('birth_1to1_second_blocked', false, 'second insert ok');
  exception when unique_violation then
    perform pg_temp.pw2_assert('birth_1to1_second_blocked', true, sqlerrm);
  when others then
    perform pg_temp.pw2_assert('birth_1to1_second_blocked', true, sqlerrm);
  end;

  insert into public.patient_education (tenant_id, patient_id, education_level, profession)
  values (tenant_a, patient_a, 'Superior', 'Dentista');
  select count(*) into cnt from public.patient_education where patient_id = patient_a;
  perform pg_temp.pw2_assert('user_a_creates_reads_education', cnt = 1, format('cnt=%s', cnt));

  insert into public.patient_addresses (
    tenant_id, patient_id, legacy_id, type, cep, street, number, city, state, is_primary
  ) values (
    tenant_a, patient_a, 'addr-wave2-a1', 'residencial', '01310100', 'Av Paulista', '1000', 'São Paulo', 'SP', true
  );
  select count(*) into cnt from public.patient_addresses where patient_id = patient_a and is_primary;
  perform pg_temp.pw2_assert('user_a_creates_primary_address', cnt = 1, format('cnt=%s', cnt));

  begin
    insert into public.patient_addresses (
      tenant_id, patient_id, legacy_id, city, state, is_primary
    ) values (tenant_a, patient_a, 'addr-wave2-a2', 'Campinas', 'SP', true);
    perform pg_temp.pw2_assert('address_one_primary_enforced', false, 'second primary ok');
  exception when unique_violation then
    perform pg_temp.pw2_assert('address_one_primary_enforced', true, sqlerrm);
  when others then
    perform pg_temp.pw2_assert('address_one_primary_enforced', true, sqlerrm);
  end;

  insert into public.patient_relationships (
    tenant_id, patient_id, emergency_contact_name, financial_responsible_name, financial_responsible_relation
  ) values (tenant_a, patient_a, 'Maria', 'João', 'pai');
  select count(*) into cnt from public.patient_relationships where patient_id = patient_a
    and financial_responsible_name = 'João';
  perform pg_temp.pw2_assert('user_a_creates_relationships_responsible', cnt = 1, format('cnt=%s', cnt));

  insert into public.patient_insurances (
    tenant_id, patient_id, legacy_id, insurance_name, plan_name, membership_number, validity, status
  ) values (tenant_a, patient_a, 'ins-wave2-a1', 'Amil', 'Dental', '123', '2030-01-01', 'ativo');
  select count(*) into cnt from public.patient_insurances where patient_id = patient_a;
  perform pg_temp.pw2_assert('user_a_creates_insurance', cnt = 1, format('cnt=%s', cnt));

  insert into public.patient_access (tenant_id, patient_id, access_status, access_email)
  values (tenant_a, patient_a, 'active', 'a@example.invalid');
  update public.patient_access set access_status = 'blocked' where patient_id = patient_a;
  get diagnostics updated = row_count;
  perform pg_temp.pw2_assert('user_a_updates_access', updated = 1, format('updated=%s', updated));

  insert into public.patient_activity_summary (
    tenant_id, patient_id, total_appointments, total_procedures
  ) values (tenant_a, patient_a, 2, 1);
  select count(*) into cnt from public.patient_activity_summary where patient_id = patient_a and total_appointments = 2;
  perform pg_temp.pw2_assert('user_a_creates_activity', cnt = 1, format('cnt=%s', cnt));

  -- cross-tenant blocked for A writing B patient with A tenant (trigger)
  begin
    insert into public.patient_education (tenant_id, patient_id, education_level)
    values (tenant_a, patient_b, 'X');
    perform pg_temp.pw2_assert('cross_tenant_satellite_blocked', false, 'insert ok');
  exception when others then
    perform pg_temp.pw2_assert('cross_tenant_satellite_blocked', true, sqlerrm);
  end;

  select count(*) into cnt from public.patient_birth_details where patient_id = patient_b;
  perform pg_temp.pw2_assert('user_a_cannot_read_tenant_b_birth', cnt = 0, format('cnt=%s', cnt));

  execute 'reset role';
  perform pg_temp.clear_auth_context();

  -- User B isolation
  perform pg_temp.set_auth_context(user_b, tenant_b);
  execute 'set local role authenticated';
  select count(*) into cnt from public.patient_insurances where patient_id = patient_a;
  perform pg_temp.pw2_assert('user_b_cannot_read_tenant_a_insurances', cnt = 0, format('cnt=%s', cnt));
  select count(*) into cnt from public.patient_addresses where patient_id = patient_a;
  perform pg_temp.pw2_assert('user_b_cannot_read_tenant_a_addresses', cnt = 0, format('cnt=%s', cnt));
  select count(*) into cnt from public.patient_relationships where patient_id = patient_a;
  perform pg_temp.pw2_assert('user_b_cannot_read_tenant_a_relationships', cnt = 0, format('cnt=%s', cnt));
  select count(*) into cnt from public.patient_access where patient_id = patient_a;
  perform pg_temp.pw2_assert('user_b_cannot_read_tenant_a_access', cnt = 0, format('cnt=%s', cnt));
  update public.patient_activity_summary set total_appointments = 99 where patient_id = patient_a;
  get diagnostics updated = row_count;
  perform pg_temp.pw2_assert('user_b_cannot_update_tenant_a_activity', updated = 0, format('updated=%s', updated));

  begin
    insert into public.patient_addresses (
      tenant_id, patient_id, legacy_id, city, state, is_primary
    ) values (tenant_a, patient_a, 'addr-wave2-b-cross', 'X', 'SP', false);
    perform pg_temp.pw2_assert('user_b_cannot_create_address_for_a', false, 'insert ok');
  exception when others then
    perform pg_temp.pw2_assert('user_b_cannot_create_address_for_a', true, sqlerrm);
  end;

  execute 'reset role';
  perform pg_temp.clear_auth_context();

  -- stale JWT / inactive
  perform pg_temp.set_auth_context(user_x, tenant_a);
  execute 'set local role authenticated';
  select count(*) into cnt from public.patient_birth_details where patient_id = patient_a;
  perform pg_temp.pw2_assert('stale_jwt_without_membership_cannot_read_wave2', cnt = 0, format('cnt=%s', cnt));
  execute 'reset role';
  perform pg_temp.clear_auth_context();

  insert into public.tenant_users (
    tenant_id, user_id, full_name, email, role, role_slug, status, is_active, has_system_access
  ) values (tenant_a, user_x, 'X', 'patients-wave2-x@example.invalid', 'admin', 'admin', 'active', false, true);

  perform pg_temp.set_auth_context(user_x, tenant_a);
  execute 'set local role authenticated';
  select count(*) into cnt from public.patient_education where patient_id = patient_a;
  perform pg_temp.pw2_assert('inactive_user_cannot_read_wave2', cnt = 0, format('cnt=%s', cnt));
  execute 'reset role';
  perform pg_temp.clear_auth_context();

  -- soft-delete via admin: Postgres exige NEW row visível ao SELECT policy;
  -- admin pode ver deletados; membro não-admin não.
  insert into public.tenant_users (
    tenant_id, user_id, full_name, email, role, role_slug, status, is_active, has_system_access
  ) values (
    tenant_a,
    '66666666-6666-4666-8666-666666666666'::uuid,
    'Member A',
    'patients-wave2-member@example.invalid',
    'assistant',
    'assistant',
    'active',
    true,
    true
  );

  perform pg_temp.set_auth_context(user_a, tenant_a);
  execute 'set local role authenticated';
  update public.patients
    set deleted_at = now(), status = 'inactive'
  where id = patient_a and deleted_at is null;
  get diagnostics updated = row_count;
  perform pg_temp.pw2_assert('soft_delete_patient_update_ok', updated = 1, format('updated=%s', updated));
  select count(*) into cnt from public.patients where id = patient_a;
  perform pg_temp.pw2_assert('admin_can_see_soft_deleted_patient', cnt = 1, format('cnt=%s', cnt));
  select count(*) into cnt from public.patient_addresses where patient_id = patient_a and deleted_at is null;
  perform pg_temp.pw2_assert('address_of_soft_deleted_patient_readable_if_alive', cnt = 1, format('cnt=%s', cnt));
  execute 'reset role';
  perform pg_temp.clear_auth_context();

  perform pg_temp.set_auth_context('66666666-6666-4666-8666-666666666666'::uuid, tenant_a);
  execute 'set local role authenticated';
  select count(*) into cnt from public.patients where id = patient_a;
  perform pg_temp.pw2_assert('non_admin_cannot_see_soft_deleted_patient', cnt = 0, format('cnt=%s', cnt));
  execute 'reset role';
  perform pg_temp.clear_auth_context();

  -- cleanup
  update public.patients set deleted_at = null, status = 'active' where id = patient_a;
  delete from public.patient_addresses where legacy_id like 'addr-wave2-%';
  delete from public.patient_insurances where legacy_id like 'ins-wave2-%';
  delete from public.patient_birth_details where patient_id in (patient_a, patient_b);
  delete from public.patient_education where patient_id in (patient_a, patient_b);
  delete from public.patient_relationships where patient_id in (patient_a, patient_b);
  delete from public.patient_access where patient_id in (patient_a, patient_b);
  delete from public.patient_activity_summary where patient_id in (patient_a, patient_b);
  delete from public.patients where legacy_id like 'patient-wave2-%';
  delete from public.tenant_users where email like 'patients-wave2-%@example.invalid';
end $$;

select
  case when bool_and(passed) then 'PATIENTS_WAVE2_RLS_PASS' else 'PATIENTS_WAVE2_RLS_FAILED' end as status,
  count(*) filter (where passed) as passed_count,
  count(*) filter (where not passed) as failed_count,
  count(*) as total
from patients_wave2_rls_results;

select scenario, passed, detail from patients_wave2_rls_results order by passed asc, scenario asc;

do $$
declare failed int;
begin
  select count(*) into failed from patients_wave2_rls_results where not passed;
  if failed > 0 then
    raise exception 'PATIENTS_WAVE2_RLS_FAILED: % cenário(s) falharam', failed;
  end if;
  raise notice 'PATIENTS_WAVE2_RLS_PASS';
end $$;

commit;
