-- Phase 9.4A Wave 2 — Repository structural E2E (SQL, sem patientService)
-- Simula bundle completo Wave1+Wave2 e valida paridade de campos / zero órfãos.
-- Saída: PATIENTS_WAVE2_REPO_E2E_PASS|FAILED

begin;

create temporary table if not exists patients_wave2_repo_e2e_results (
  scenario text primary key,
  detail text not null default '',
  passed boolean not null
);

create or replace function pg_temp.re2e_assert(p_scenario text, p_passed boolean, p_detail text default '')
returns void language plpgsql as $$
begin
  insert into patients_wave2_repo_e2e_results(scenario, detail, passed)
  values (p_scenario, coalesce(p_detail, ''), p_passed)
  on conflict (scenario) do update set detail = excluded.detail, passed = excluded.passed;
end;
$$;

do $$
declare
  tenant_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  tenant_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  patient_a uuid;
  patient_b uuid;
  bundle_ok boolean;
  orphan_cnt int;
  cnt int;
begin
  insert into public.tenants (id, legal_name, trade_name, status) values
    (tenant_a, 'Repo E2E A', 'repo-e2e-a', 'active'),
    (tenant_b, 'Repo E2E B', 'repo-e2e-b', 'active')
  on conflict (id) do update set status = 'active';

  delete from public.patients where legacy_id like 'patient-repo-e2e-%';

  insert into public.patients (
    tenant_id, legacy_id, guid, full_name, nickname, sex, birth_date, cpf, status,
    has_pending_data, pending_fields, pending_critical_fields
  ) values (
    tenant_a,
    'patient-repo-e2e-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'Repo Paciente A',
    'RepoA',
    'M',
    '1988-05-05',
    '39053344705',
    'active',
    false,
    '[]'::jsonb,
    '[]'::jsonb
  ) returning id into patient_a;

  insert into public.patients (
    tenant_id, legacy_id, full_name, sex, birth_date, cpf, status
  ) values (
    tenant_b,
    'patient-repo-e2e-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'Repo Paciente B',
    'F',
    '1989-06-06',
    '15350946056',
    'active'
  ) returning id into patient_b;

  insert into public.patient_phones (
    tenant_id, patient_id, legacy_id, type, ddd, number, is_primary, e164
  ) values (tenant_a, patient_a, 'phone-repo-e2e-a', 'mobile', '11', '999999999', true, '5511999999999');

  insert into public.patient_documents (tenant_id, patient_id, personal_email, responsible_cpf)
  values (tenant_a, patient_a, 'repo-a@example.invalid', '39053344705');

  insert into public.patient_records (tenant_id, patient_id, legacy_id, record_number, patient_type)
  values (tenant_a, patient_a, 'record-repo-e2e-a', 'R-001', 'particular');

  insert into public.patient_birth_details (tenant_id, patient_id, nationality, birth_city, birth_state)
  values (tenant_a, patient_a, 'Brasileira', 'Santos', 'SP');

  insert into public.patient_education (tenant_id, patient_id, education_level, profession)
  values (tenant_a, patient_a, 'Superior', 'Engenheiro');

  insert into public.patient_addresses (
    tenant_id, patient_id, legacy_id, type, cep, street, number, city, state, is_primary
  ) values (tenant_a, patient_a, 'addr-repo-e2e-a', 'residencial', '11010001', 'Rua A', '10', 'Santos', 'SP', true);

  insert into public.patient_relationships (
    tenant_id, patient_id, emergency_contact_name, financial_responsible_name, dependents, lgpd_whatsapp_opt_in
  ) values (tenant_a, patient_a, 'Ana', 'Carlos', '["filho"]'::jsonb, true);

  insert into public.patient_insurances (
    tenant_id, patient_id, legacy_id, insurance_name, plan_name, membership_number, validity, status
  ) values (tenant_a, patient_a, 'ins-repo-e2e-a', 'Bradesco', 'Top', 'CARD-1', '2031-12-31', 'ativo');

  insert into public.patient_access (tenant_id, patient_id, access_status, access_email, wants_portal)
  values (tenant_a, patient_a, 'active', 'portal-a@example.invalid', true);

  insert into public.patient_activity_summary (
    tenant_id, patient_id, total_appointments, last_appointment_at, total_procedures, last_procedure_at
  ) values (tenant_a, patient_a, 3, now(), 2, now());

  -- Bundle structural parity (fields present)
  select
    p.legacy_id is not null
    and p.guid is not null
    and exists (select 1 from public.patient_phones ph where ph.patient_id = p.id and ph.legacy_id = 'phone-repo-e2e-a')
    and exists (select 1 from public.patient_documents d where d.patient_id = p.id)
    and exists (select 1 from public.patient_records r where r.patient_id = p.id and r.legacy_id = 'record-repo-e2e-a')
    and exists (select 1 from public.patient_birth_details b where b.patient_id = p.id and b.birth_state = 'SP')
    and exists (select 1 from public.patient_education e where e.patient_id = p.id)
    and exists (select 1 from public.patient_addresses a where a.patient_id = p.id and a.is_primary)
    and exists (select 1 from public.patient_relationships rel where rel.patient_id = p.id and rel.lgpd_whatsapp_opt_in)
    and exists (select 1 from public.patient_insurances i where i.patient_id = p.id and i.membership_number = 'CARD-1')
    and exists (select 1 from public.patient_access ac where ac.patient_id = p.id and ac.wants_portal)
    and exists (select 1 from public.patient_activity_summary act where act.patient_id = p.id and act.total_appointments = 3)
  into bundle_ok
  from public.patients p where p.id = patient_a;

  perform pg_temp.re2e_assert('bundle_structural_parity', coalesce(bundle_ok, false), 'full wave1+wave2 bundle');

  -- Update satellites
  update public.patient_education set profession = 'Arquiteto' where patient_id = patient_a;
  update public.patient_insurances set plan_name = 'Premium' where patient_id = patient_a;
  select count(*) into cnt from public.patient_education where patient_id = patient_a and profession = 'Arquiteto';
  perform pg_temp.re2e_assert('satellite_update_education', cnt = 1, format('cnt=%s', cnt));
  select count(*) into cnt from public.patient_insurances where patient_id = patient_a and plan_name = 'Premium';
  perform pg_temp.re2e_assert('satellite_update_insurance', cnt = 1, format('cnt=%s', cnt));

  -- Search by name/cpf
  select count(*) into cnt from public.patients
  where tenant_id = tenant_a and deleted_at is null
    and (full_name ilike '%Repo Paciente%' or cpf = '39053344705');
  perform pg_temp.re2e_assert('search_patient_by_name_or_cpf', cnt = 1, format('cnt=%s', cnt));

  -- Soft delete
  update public.patients set deleted_at = now(), status = 'inactive' where id = patient_a;
  select count(*) into cnt from public.patients where id = patient_a and deleted_at is null;
  perform pg_temp.re2e_assert('soft_delete_hides_active_row', cnt = 0, format('cnt=%s', cnt));

  -- Isolation A/B
  select count(*) into cnt from public.patient_phones where patient_id = patient_a and tenant_id = tenant_b;
  perform pg_temp.re2e_assert('no_cross_tenant_phone_rows', cnt = 0, format('cnt=%s', cnt));

  -- Orphans: satellites without patient
  select count(*) into orphan_cnt from public.patient_addresses a
  where not exists (select 1 from public.patients p where p.id = a.patient_id);
  perform pg_temp.re2e_assert('zero_orphan_addresses', orphan_cnt = 0, format('orphans=%s', orphan_cnt));

  select count(*) into orphan_cnt from public.patient_insurances i
  where not exists (select 1 from public.patients p where p.id = i.patient_id);
  perform pg_temp.re2e_assert('zero_orphan_insurances', orphan_cnt = 0, format('orphans=%s', orphan_cnt));

  select count(*) into orphan_cnt from public.patient_birth_details b
  where not exists (select 1 from public.patients p where p.id = b.patient_id);
  perform pg_temp.re2e_assert('zero_orphan_birth', orphan_cnt = 0, format('orphans=%s', orphan_cnt));

  -- B exists independently
  select count(*) into cnt from public.patients where id = patient_b and deleted_at is null;
  perform pg_temp.re2e_assert('tenant_b_patient_intact', cnt = 1, format('cnt=%s', cnt));

  -- cleanup
  delete from public.patient_phones where legacy_id like 'phone-repo-e2e-%';
  delete from public.patient_documents where patient_id in (patient_a, patient_b);
  delete from public.patient_records where legacy_id like 'record-repo-e2e-%';
  delete from public.patient_addresses where legacy_id like 'addr-repo-e2e-%';
  delete from public.patient_insurances where legacy_id like 'ins-repo-e2e-%';
  delete from public.patient_birth_details where patient_id in (patient_a, patient_b);
  delete from public.patient_education where patient_id in (patient_a, patient_b);
  delete from public.patient_relationships where patient_id in (patient_a, patient_b);
  delete from public.patient_access where patient_id in (patient_a, patient_b);
  delete from public.patient_activity_summary where patient_id in (patient_a, patient_b);
  delete from public.patients where legacy_id like 'patient-repo-e2e-%';
end $$;

select
  case when bool_and(passed) then 'PATIENTS_WAVE2_REPO_E2E_PASS' else 'PATIENTS_WAVE2_REPO_E2E_FAILED' end as status,
  count(*) filter (where passed) as passed_count,
  count(*) filter (where not passed) as failed_count,
  count(*) as total
from patients_wave2_repo_e2e_results;

select scenario, passed, detail from patients_wave2_repo_e2e_results order by passed asc, scenario asc;

do $$
declare failed int;
begin
  select count(*) into failed from patients_wave2_repo_e2e_results where not passed;
  if failed > 0 then
    raise exception 'PATIENTS_WAVE2_REPO_E2E_FAILED: %', failed;
  end if;
  raise notice 'PATIENTS_WAVE2_REPO_E2E_PASS';
end $$;

commit;
