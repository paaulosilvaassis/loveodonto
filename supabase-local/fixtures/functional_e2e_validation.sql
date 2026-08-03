-- Phase 9.3A — Functional E2E odontológico (LOCAL DISPOSABLE ONLY)
-- Workdir: supabase-local | docker exec + psql local
-- NÃO usar --linked / --db-url remoto / db push.
--
-- Camada: SQL fixture + JWT/RLS (helpers da app). Sem segunda implementação de negócio.
-- Fora de escopo SQL (IndexedDB): patients table, budgets, journey, payments rows, odontogram, audit operacional.

begin;

create temporary table if not exists functional_e2e_results (
  scenario text primary key,
  detail text not null default '',
  passed boolean not null,
  layer text not null default 'sql_fixture'
);

grant select, insert, update on table functional_e2e_results to authenticated;

create or replace function pg_temp.fe2e_assert(
  p_scenario text,
  p_passed boolean,
  p_detail text default '',
  p_layer text default 'sql_fixture'
)
returns void
language plpgsql
as $$
begin
  insert into functional_e2e_results(scenario, detail, passed, layer)
  values (p_scenario, coalesce(p_detail, ''), p_passed, coalesce(p_layer, 'sql_fixture'))
  on conflict (scenario) do update
    set detail = excluded.detail,
        passed = excluded.passed,
        layer = excluded.layer;
end;
$$;

create or replace function pg_temp.set_auth_context(p_uid uuid, p_tenant_id uuid)
returns void
language plpgsql
as $$
declare
  claims text;
begin
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
  tenant_a uuid := 'a93a0001-aaaa-4aaa-8aaa-aaaaaaaaaa01';
  tenant_b uuid := 'b93b0001-bbbb-4bbb-8bbb-bbbbbbbbbb02';
  owner_a uuid := 'a93a1001-aaaa-4111-8111-aaaaaaaaaa01';
  admin_a uuid := 'a93a1002-aaaa-4111-8111-aaaaaaaaaa02';
  pro_a uuid := 'a93a1003-aaaa-4111-8111-aaaaaaaaaa03';
  recep_a uuid := 'a93a1004-aaaa-4111-8111-aaaaaaaaaa04';
  owner_b uuid := 'b93b1001-bbbb-4222-8222-bbbbbbbbbb01';
  admin_b uuid := 'b93b1002-bbbb-4222-8222-bbbbbbbbbb02';
  pro_b uuid := 'b93b1003-bbbb-4222-8222-bbbbbbbbbb03';
  recep_b uuid := 'b93b1004-bbbb-4222-8222-bbbbbbbbbb04';
  col_pro_a uuid := 'a93ac001-aaaa-4ccc-8ccc-aaaaaaaaaa01';
  col_pro_b uuid := 'b93bc001-bbbb-4ccc-8ccc-bbbbbbbbbb01';
  patient_a text := 'patient-func-a-001';
  patient_b text := 'patient-func-b-001';
  budget_a text := 'budget-func-a-001';
  budget_b text := 'budget-func-b-001';
  contract_a text := 'contract-func-a-001';
  contract_b text := 'contract-func-b-001';
  cnt int;
  updated int;
  v_stage_key text;
  v_appt_status text;
  v_paid numeric;
  v_far_status text;
begin
  -- -----------------------------------------------------------------------
  -- 0) Pré-condições schema SSOT
  -- -----------------------------------------------------------------------
  perform pg_temp.fe2e_assert(
    'precondition_core_tables',
    to_regclass('public.tenants') is not null
      and to_regclass('public.tenant_users') is not null
      and to_regclass('public.collaborators') is not null
      and to_regclass('public.appointments') is not null
      and to_regclass('public.crm_leads') is not null
      and to_regclass('public.crm_pipeline_stages') is not null
      and to_regclass('public.financial_accounts_receivable') is not null
      and to_regclass('public.financial_financings') is not null
      and to_regclass('public.generated_contracts') is not null
      and to_regclass('public.clinic_profiles') is not null,
    'tenants..contracts SSOT',
    'sql_inspect'
  );

  -- Phase 9.4A Wave 1: public.patients (+ satélites) existem via 025.
  -- IndexedDB permanece SSOT da aplicação até cutover; SQL = fundação.
  perform pg_temp.fe2e_assert(
    'patients_wave1_foundation_present',
    to_regclass('public.patients') is not null
      and to_regclass('public.patient_phones') is not null
      and to_regclass('public.patient_documents') is not null
      and to_regclass('public.patient_records') is not null,
    '025_app_patients_core aplicada — Wave 1 foundation (app SSOT ainda IndexedDB)',
    'sql_inspect'
  );
  perform pg_temp.fe2e_assert(
    'out_of_scope_budgets_table_absent',
    to_regclass('public.budgets') is null,
    'budgets/quotes permanece IndexedDB',
    'out_of_scope_idb'
  );

  if to_regclass('public.appointments') is null or to_regclass('public.crm_leads') is null then
    perform pg_temp.fe2e_assert(
      'schema_missing_run_dry_run_first',
      false,
      'rode supabase:local:dry-run antes do functional-e2e',
      'sql_inspect'
    );
    return;
  end if;

  grant select, insert, update, delete on public.tenants to authenticated;
  grant select, insert, update, delete on public.tenant_users to authenticated;
  grant select, insert, update, delete on public.collaborators to authenticated;
  grant select, insert, update, delete on public.clinic_profiles to authenticated;
  grant select, insert, update, delete on public.appointments to authenticated;
  grant select, insert, update, delete on public.crm_leads to authenticated;
  grant select, insert, update, delete on public.crm_pipeline_stages to authenticated;
  grant select, insert, update, delete on public.financial_accounts_receivable to authenticated;
  grant select, insert, update, delete on public.financial_financings to authenticated;
  grant select, insert, update, delete on public.generated_contracts to authenticated;
  grant select, insert, update, delete on public.contract_audit_logs to authenticated;

  -- -----------------------------------------------------------------------
  -- 1) Bootstrap tenants A/B + clinic_profiles (postgres bypass RLS)
  -- -----------------------------------------------------------------------
  insert into public.tenants (id, clinic_code, legal_name, trade_name, status, owner_email)
  values
    (tenant_a, 'implanprime-local', 'Implanprime Local LTDA', 'Implanprime Local', 'active', 'owner-a@fe2e.invalid'),
    (tenant_b, 'clinica-teste-isolada', 'Clínica Teste Isolada LTDA', 'Clínica Teste Isolada', 'active', 'owner-b@fe2e.invalid')
  on conflict (id) do update
    set clinic_code = excluded.clinic_code,
        legal_name = excluded.legal_name,
        trade_name = excluded.trade_name,
        status = 'active';

  insert into public.clinic_profiles (tenant_id, name, fantasy_name, legal_name, status)
  values
    (tenant_a, 'Implanprime Local', 'Implanprime Local', 'Implanprime Local LTDA', 'active'),
    (tenant_b, 'Clínica Teste Isolada', 'Clínica Teste Isolada', 'Clínica Teste Isolada LTDA', 'active')
  on conflict (tenant_id) do update
    set name = excluded.name,
        fantasy_name = excluded.fantasy_name,
        status = 'active';

  perform pg_temp.fe2e_assert(
    'tenant_a_seeded',
    exists (select 1 from public.tenants where id = tenant_a and clinic_code = 'implanprime-local'),
    'Implanprime Local',
    'sql_fixture'
  );
  perform pg_temp.fe2e_assert(
    'tenant_b_seeded',
    exists (select 1 from public.tenants where id = tenant_b and clinic_code = 'clinica-teste-isolada'),
    'Clínica Teste Isolada',
    'sql_fixture'
  );

  -- limpeza fixtures anteriores desta suíte
  delete from public.contract_audit_logs where id like 'fe2e-%';
  delete from public.generated_contracts where id like 'contract-func-%';
  delete from public.financial_accounts_receivable where legacy_id like 'fe2e-%';
  delete from public.financial_financings where legacy_id like 'fe2e-%';
  delete from public.appointments where legacy_id like 'fe2e-%';
  delete from public.crm_leads where legacy_id like 'fe2e-%';
  delete from public.crm_pipeline_stages where legacy_id like 'fe2e-%';
  delete from public.tenant_users where email like '%@fe2e.invalid';
  delete from public.collaborators where legacy_id like 'fe2e-%';

  -- -----------------------------------------------------------------------
  -- 2) Usuários + profissionais (collaborators)
  -- -----------------------------------------------------------------------
  insert into public.collaborators (
    id, tenant_id, legacy_id, status, apelido, nome_completo, email,
    rh_categoria, cargo, tipo_vinculo, setor, agenda_enabled
  ) values
    (col_pro_a, tenant_a, 'fe2e-col-pro-a', 'ativo', 'Dr A', 'Profissional Funcional A', 'pro-a@fe2e.invalid',
     'corpo_clinico', 'Dentista', 'clt', 'clinica', true),
    (col_pro_b, tenant_b, 'fe2e-col-pro-b', 'ativo', 'Dr B', 'Profissional Funcional B', 'pro-b@fe2e.invalid',
     'corpo_clinico', 'Dentista', 'clt', 'clinica', true);

  insert into public.tenant_users (
    tenant_id, user_id, full_name, email, role, role_slug, status, is_active, has_system_access
  ) values
    (tenant_a, owner_a, 'Owner A', 'owner-a@fe2e.invalid', 'owner', 'owner', 'active', true, true),
    (tenant_a, admin_a, 'Admin A', 'admin-a@fe2e.invalid', 'admin', 'admin', 'active', true, true),
    (tenant_a, pro_a, 'Profissional A', 'pro-a@fe2e.invalid', 'professional', 'professional', 'active', true, true),
    (tenant_a, recep_a, 'Recepcionista A', 'recep-a@fe2e.invalid', 'receptionist', 'receptionist', 'active', true, true),
    (tenant_b, owner_b, 'Owner B', 'owner-b@fe2e.invalid', 'owner', 'owner', 'active', true, true),
    (tenant_b, admin_b, 'Admin B', 'admin-b@fe2e.invalid', 'admin', 'admin', 'active', true, true),
    (tenant_b, pro_b, 'Profissional B', 'pro-b@fe2e.invalid', 'professional', 'professional', 'active', true, true),
    (tenant_b, recep_b, 'Recepcionista B', 'recep-b@fe2e.invalid', 'receptionist', 'receptionist', 'active', true, true);

  perform pg_temp.fe2e_assert(
    'users_seeded_four_per_tenant',
    (select count(*) from public.tenant_users where tenant_id = tenant_a and email like '%@fe2e.invalid') = 4
      and (select count(*) from public.tenant_users where tenant_id = tenant_b and email like '%@fe2e.invalid') = 4,
    '8 memberships',
    'sql_fixture'
  );

  -- -----------------------------------------------------------------------
  -- 3) Pipeline + Lead A (Meta Ads) + Lead B
  -- -----------------------------------------------------------------------
  insert into public.crm_pipeline_stages (tenant_id, legacy_id, key, label, "order", is_active)
  values
    (tenant_a, 'fe2e-stage-a-novo', 'novo_lead', 'Novo Lead', 1, true),
    (tenant_a, 'fe2e-stage-a-qualificado', 'qualificado', 'Qualificado', 2, true),
    (tenant_a, 'fe2e-stage-a-agendado', 'agendado', 'Agendado', 3, true),
    (tenant_b, 'fe2e-stage-b-novo', 'novo_lead', 'Novo Lead', 1, true),
    (tenant_b, 'fe2e-stage-b-qualificado', 'qualificado', 'Qualificado', 2, true);

  insert into public.crm_leads (
    tenant_id, legacy_id, name, phone, source, stage_key, notes, patient_id, estimated_value
  ) values
    (tenant_a, 'fe2e-lead-a', 'Lead Funcional A', '11999990001', 'Meta Ads', 'novo_lead',
     'origem Meta Ads', null, 3500),
    (tenant_b, 'fe2e-lead-b', 'Lead Funcional B', '11999990002', 'Indicação', 'novo_lead',
     'tenant B', null, 1200);

  update public.crm_leads
  set stage_key = 'qualificado', notes = 'movido no pipeline', patient_id = patient_a
  where tenant_id = tenant_a and legacy_id = 'fe2e-lead-a';

  select l.stage_key into v_stage_key
  from public.crm_leads l where l.tenant_id = tenant_a and l.legacy_id = 'fe2e-lead-a';
  perform pg_temp.fe2e_assert(
    'tenant_a_lead_moved_pipeline',
    v_stage_key = 'qualificado',
    format('stage=%s', v_stage_key),
    'sql_fixture'
  );
  perform pg_temp.fe2e_assert(
    'tenant_a_lead_linked_opaque_patient',
    exists (
      select 1 from public.crm_leads
      where tenant_id = tenant_a and legacy_id = 'fe2e-lead-a' and patient_id = patient_a
    ),
    patient_a,
    'sql_fixture'
  );

  -- -----------------------------------------------------------------------
  -- 4) Agendamento A: criar → confirmar → chegou → em_atendimento
  -- -----------------------------------------------------------------------
  insert into public.appointments (
    tenant_id, legacy_id, patient_id, lead_id, professional_id,
    date, start_time, end_time, duration_minutes, status, procedure_name, channel, notes
  ) values (
    tenant_a, 'fe2e-appt-a', patient_a, 'fe2e-lead-a', col_pro_a::text,
    current_date, '09:00', '09:45', 45, 'agendado', 'Avaliação implante', 'app', 'fluxo A'
  );

  update public.appointments set status = 'confirmado'
  where tenant_id = tenant_a and legacy_id = 'fe2e-appt-a';
  update public.appointments set status = 'chegou', check_in_at = now()
  where tenant_id = tenant_a and legacy_id = 'fe2e-appt-a';
  update public.appointments set status = 'em_atendimento'
  where tenant_id = tenant_a and legacy_id = 'fe2e-appt-a';

  select a.status into v_appt_status
  from public.appointments a where a.tenant_id = tenant_a and a.legacy_id = 'fe2e-appt-a';
  perform pg_temp.fe2e_assert(
    'tenant_a_appointment_lifecycle',
    v_appt_status = 'em_atendimento'
      and exists (
        select 1 from public.appointments
        where tenant_id = tenant_a and legacy_id = 'fe2e-appt-a' and check_in_at is not null
      ),
    format('status=%s', v_appt_status),
    'sql_fixture'
  );

  insert into public.appointments (
    tenant_id, legacy_id, patient_id, professional_id,
    date, start_time, end_time, duration_minutes, status, procedure_name, channel, notes
  ) values (
    tenant_b, 'fe2e-appt-b', patient_b, col_pro_b::text,
    current_date, '10:00', '10:30', 30, 'agendado', 'Limpeza', 'app', 'fluxo B'
  );

  -- -----------------------------------------------------------------------
  -- 5) Orçamento: OUT_OF_SCOPE (sem tabela) — quote_id opaco + contrato
  -- -----------------------------------------------------------------------
  perform pg_temp.fe2e_assert(
    'budget_step_documented_out_of_scope',
    true,
    format('opaque quote_id A=%s B=%s', budget_a, budget_b),
    'out_of_scope_idb'
  );

  insert into public.generated_contracts (
    id, tenant_id, patient_id, quote_id, quote_source, status, final_content, rendered_html, metadata
  ) values
    (contract_a, tenant_a, patient_a, budget_a, 'crm_budget', 'generated',
     'Contrato funcional A', '<p>Contrato A</p>',
     jsonb_build_object('clinic', 'Implanprime Local', 'source', 'phase93a')),
    (contract_b, tenant_b, patient_b, budget_b, 'crm_budget', 'generated',
     'Contrato funcional B', '<p>Contrato B</p>',
     jsonb_build_object('clinic', 'Clínica Teste Isolada', 'source', 'phase93a'));

  -- user_id FK → auth.users; fixture local não cria auth.users (JWT via set_config).
  insert into public.contract_audit_logs (id, tenant_id, contract_id, action, user_id, metadata)
  values
    ('fe2e-audit-a-generate', tenant_a, contract_a, 'generated', null,
     jsonb_build_object('phase', '9.3A', 'actor', 'admin-a@fe2e.invalid')),
    ('fe2e-audit-b-generate', tenant_b, contract_b, 'generated', null,
     jsonb_build_object('phase', '9.3A', 'actor', 'admin-b@fe2e.invalid'));

  perform pg_temp.fe2e_assert(
    'tenant_a_contract_and_audit',
    exists (select 1 from public.generated_contracts where id = contract_a and tenant_id = tenant_a)
      and exists (select 1 from public.contract_audit_logs where id = 'fe2e-audit-a-generate'),
    contract_a,
    'sql_fixture'
  );

  -- -----------------------------------------------------------------------
  -- 6) Financeiro A: financiamento + receivable + pagamento parcial (paid_amount)
  -- -----------------------------------------------------------------------
  insert into public.financial_financings (
    tenant_id, legacy_id, patient_id, contract_id, budget_id, status, approval_status,
    total_amount, entry_amount, installments_count
  ) values (
    tenant_a, 'fe2e-ffin-a', patient_a, contract_a, budget_a, 'approved', 'approved',
    3500, 500, 6
  );

  insert into public.financial_accounts_receivable (
    tenant_id, legacy_id, patient_id, origin_type, origin_id, description,
    original_amount, net_amount, paid_amount, status, contract_id, budget_id, financing_id
  ) values (
    tenant_a, 'fe2e-far-a', patient_a, 'contract', contract_a, 'Parcela 1 — Implanprime Local',
    500, 500, 0, 'open', contract_a, budget_a, 'fe2e-ffin-a'
  );

  update public.financial_accounts_receivable
  set paid_amount = 200, status = 'partial'
  where tenant_id = tenant_a and legacy_id = 'fe2e-far-a';

  select f.paid_amount, f.status into v_paid, v_far_status
  from public.financial_accounts_receivable f
  where f.tenant_id = tenant_a and f.legacy_id = 'fe2e-far-a';
  perform pg_temp.fe2e_assert(
    'tenant_a_financial_partial_payment',
    v_paid = 200 and v_far_status = 'partial',
    format('paid=%s status=%s', v_paid, v_far_status),
    'sql_fixture'
  );

  insert into public.financial_accounts_receivable (
    tenant_id, legacy_id, patient_id, description, original_amount, net_amount, status
  ) values (
    tenant_b, 'fe2e-far-b', patient_b, 'Recebível B', 800, 800, 'open'
  );

  perform pg_temp.fe2e_assert(
    'tenant_b_minimal_flow_seeded',
    exists (select 1 from public.crm_leads where tenant_id = tenant_b and legacy_id = 'fe2e-lead-b')
      and exists (select 1 from public.appointments where tenant_id = tenant_b and legacy_id = 'fe2e-appt-b')
      and exists (select 1 from public.generated_contracts where id = contract_b)
      and exists (select 1 from public.financial_accounts_receivable where tenant_id = tenant_b and legacy_id = 'fe2e-far-b'),
    'lead+appt+contract+far B',
    'sql_fixture'
  );

  perform pg_temp.fe2e_assert(
    'journey_step_documented_out_of_scope',
    true,
    'patientJourneyEntries só IndexedDB — check_in_at em appointments cobre chegada SQL',
    'out_of_scope_idb'
  );

  -- -----------------------------------------------------------------------
  -- 7) Integridade relacionamentos A
  -- -----------------------------------------------------------------------
  perform pg_temp.fe2e_assert(
    'tenant_a_relationship_integrity',
    exists (
      select 1
      from public.appointments a
      join public.crm_leads l
        on l.tenant_id = a.tenant_id and l.legacy_id = a.lead_id
      join public.generated_contracts c
        on c.tenant_id = a.tenant_id and c.patient_id = a.patient_id
      join public.financial_accounts_receivable f
        on f.tenant_id = a.tenant_id and f.contract_id = c.id
      where a.tenant_id = tenant_a and a.legacy_id = 'fe2e-appt-a'
    ),
    'appt↔lead↔contract↔far',
    'sql_fixture'
  );

  -- -----------------------------------------------------------------------
  -- 8) Isolamento JWT: admin A não lê/escreve B
  -- -----------------------------------------------------------------------
  perform pg_temp.set_auth_context(admin_a, tenant_a);
  execute 'set local role authenticated';

  select count(*) into cnt from public.crm_leads where legacy_id = 'fe2e-lead-a';
  perform pg_temp.fe2e_assert('iso_a_reads_own_lead', cnt = 1, format('cnt=%s', cnt), 'jwt_rls');

  select count(*) into cnt from public.crm_leads where legacy_id = 'fe2e-lead-b';
  perform pg_temp.fe2e_assert('iso_a_cannot_read_b_lead', cnt = 0, format('cnt=%s', cnt), 'jwt_rls');

  select count(*) into cnt from public.appointments where legacy_id = 'fe2e-appt-b';
  perform pg_temp.fe2e_assert('iso_a_cannot_read_b_appt', cnt = 0, format('cnt=%s', cnt), 'jwt_rls');

  select count(*) into cnt from public.financial_accounts_receivable where legacy_id = 'fe2e-far-b';
  perform pg_temp.fe2e_assert('iso_a_cannot_read_b_far', cnt = 0, format('cnt=%s', cnt), 'jwt_rls');

  select count(*) into cnt from public.generated_contracts where id = contract_b;
  perform pg_temp.fe2e_assert('iso_a_cannot_read_b_contract', cnt = 0, format('cnt=%s', cnt), 'jwt_rls');

  update public.appointments set notes = 'tamper-from-a' where legacy_id = 'fe2e-appt-b';
  get diagnostics updated = row_count;
  perform pg_temp.fe2e_assert('iso_a_cannot_update_b_appt', updated = 0, format('updated=%s', updated), 'jwt_rls');

  begin
    insert into public.appointments (
      tenant_id, legacy_id, date, start_time, end_time, duration_minutes, status
    ) values (
      tenant_b, 'fe2e-appt-cross-a', current_date, '11:00', '11:30', 30, 'agendado'
    );
    perform pg_temp.fe2e_assert('iso_a_cannot_insert_into_b', false, 'insert unexpectedly succeeded', 'jwt_rls');
  exception when others then
    perform pg_temp.fe2e_assert('iso_a_cannot_insert_into_b', true, sqlerrm, 'jwt_rls');
  end;

  execute 'reset role';
  perform pg_temp.clear_auth_context();

  -- -----------------------------------------------------------------------
  -- 9) Isolamento JWT: admin B não lê A
  -- -----------------------------------------------------------------------
  perform pg_temp.set_auth_context(admin_b, tenant_b);
  execute 'set local role authenticated';

  select count(*) into cnt from public.crm_leads where legacy_id = 'fe2e-lead-b';
  perform pg_temp.fe2e_assert('iso_b_reads_own_lead', cnt = 1, format('cnt=%s', cnt), 'jwt_rls');

  select count(*) into cnt from public.crm_leads where legacy_id = 'fe2e-lead-a';
  perform pg_temp.fe2e_assert('iso_b_cannot_read_a_lead', cnt = 0, format('cnt=%s', cnt), 'jwt_rls');

  select count(*) into cnt from public.appointments where legacy_id = 'fe2e-appt-a';
  perform pg_temp.fe2e_assert('iso_b_cannot_read_a_appt', cnt = 0, format('cnt=%s', cnt), 'jwt_rls');

  select count(*) into cnt from public.financial_accounts_receivable where legacy_id = 'fe2e-far-a';
  perform pg_temp.fe2e_assert('iso_b_cannot_read_a_far', cnt = 0, format('cnt=%s', cnt), 'jwt_rls');

  select count(*) into cnt from public.generated_contracts where id = contract_a;
  perform pg_temp.fe2e_assert('iso_b_cannot_read_a_contract', cnt = 0, format('cnt=%s', cnt), 'jwt_rls');

  update public.financial_accounts_receivable set paid_amount = 999 where legacy_id = 'fe2e-far-a';
  get diagnostics updated = row_count;
  perform pg_temp.fe2e_assert('iso_b_cannot_update_a_far', updated = 0, format('updated=%s', updated), 'jwt_rls');

  execute 'reset role';
  perform pg_temp.clear_auth_context();

  -- -----------------------------------------------------------------------
  -- 10) Storage buckets presentes (sem upload binário)
  -- -----------------------------------------------------------------------
  select count(*) into cnt from storage.buckets where id in ('clinic-logos', 'collaborator-photos');
  perform pg_temp.fe2e_assert(
    'storage_buckets_present',
    cnt = 2,
    format('count=%s', cnt),
    'sql_inspect'
  );

  -- limpeza leve (mantém tenants para inspeção manual local se necessário)
  delete from public.contract_audit_logs where id like 'fe2e-%';
  delete from public.generated_contracts where id like 'contract-func-%';
  delete from public.financial_accounts_receivable where legacy_id like 'fe2e-%';
  delete from public.financial_financings where legacy_id like 'fe2e-%';
  delete from public.appointments where legacy_id like 'fe2e-%';
  delete from public.crm_leads where legacy_id like 'fe2e-%';
  delete from public.crm_pipeline_stages where legacy_id like 'fe2e-%';
  delete from public.tenant_users where email like '%@fe2e.invalid';
  delete from public.collaborators where legacy_id like 'fe2e-%';

end $$;

select
  case when bool_and(passed) then 'FUNCTIONAL_E2E_PASS' else 'FUNCTIONAL_E2E_FAILED' end as status,
  count(*) filter (where passed) as passed_count,
  count(*) filter (where not passed) as failed_count,
  count(*) as total
from functional_e2e_results;

select scenario, layer, passed, detail
from functional_e2e_results
order by passed asc, scenario asc;

do $$
declare
  failed int;
begin
  select count(*) into failed from functional_e2e_results where not passed;
  if failed > 0 then
    raise exception 'FUNCTIONAL_E2E_FAILED: % cenário(s) falharam', failed;
  end if;
  raise notice 'FUNCTIONAL_E2E_PASS';
end $$;

commit;
