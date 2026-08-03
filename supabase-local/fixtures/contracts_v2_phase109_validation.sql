-- Phase 10.9 — Contracts V2 local validation (LOCAL DISPOSABLE ONLY)
-- Executar via docker exec psql -f após db reset local com 028–031.
-- NÃO usar --linked / remoto / produção.
--
-- Saída final: CONTRACTS_V2_LOCAL_PASS | CONTRACTS_V2_LOCAL_FAILED

begin;

create temporary table if not exists c109_results (
  scenario text primary key,
  detail text not null default '',
  passed boolean not null
);
grant select, insert, update on table c109_results to authenticated;

create or replace function pg_temp.c109_assert(p_scenario text, p_passed boolean, p_detail text default '')
returns void language plpgsql as $$
begin
  insert into c109_results(scenario, detail, passed)
  values (p_scenario, coalesce(p_detail, ''), p_passed)
  on conflict (scenario) do update set detail = excluded.detail, passed = excluded.passed;
end;
$$;

create or replace function pg_temp.set_auth_context(p_uid uuid, p_tenant_id uuid)
returns void language plpgsql as $$
declare claims text;
begin
  claims := json_build_object(
    'sub', p_uid::text,
    'role', 'authenticated',
    'app_metadata', json_build_object('tenant_id', p_tenant_id::text),
    'tenant_id', p_tenant_id::text
  )::text;
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', claims, true);
end;
$$;

do $$
declare
  tenant_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  tenant_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  user_admin_a uuid := 'a1111111-1111-4111-8111-111111111111';
  user_member_a uuid := 'a2222222-2222-4222-8222-222222222222';
  user_admin_b uuid := 'b1111111-1111-4111-8111-111111111111';
  user_member_b uuid := 'b2222222-2222-4222-8222-222222222222';
  user_no_tenant uuid := 'c1111111-1111-4111-8111-111111111111';
  pol_a uuid := 'd1111111-1111-4111-8111-111111111111';
  pol_b uuid := 'd2222222-2222-4222-8222-222222222222';
  tpl_a uuid := 'e1111111-1111-4111-8111-111111111111';
  tpl_b uuid := 'e2222222-2222-4222-8222-222222222222';
  tv_a uuid := 'e3333333-3333-4333-8333-333333333333';
  tv_b uuid := 'e4444444-4444-4444-8444-444444444444';
  ctr_a uuid := 'f1111111-1111-4111-8111-111111111111';
  ctr_b uuid := 'f2222222-2222-4222-8222-222222222222';
  ver_a uuid := 'f3333333-3333-4333-8333-333333333333';
  ver_b uuid := 'f4444444-4444-4444-8444-444444444444';
  env_a uuid := 'f5555555-5555-4555-8555-555555555555';
  env_b uuid := 'f6666666-6666-4666-8666-666666666666';
  sgn_a uuid := 'f7777777-7777-4777-8777-777777777777';
  file_a uuid := 'f8888888-8888-4888-8888-888888888888';
  ldg_a uuid := 'f9999999-9999-4999-8999-999999999999';
  tbl text;
  cnt int;
  raised boolean;
  n1 text;
  n2 text;
begin
  foreach tbl in array array[
    'app_signature_policies',
    'app_contract_templates',
    'app_contract_template_versions',
    'app_contracts',
    'app_contract_versions',
    'app_contract_parties',
    'app_contract_treatments',
    'app_contract_odontogram_snapshots',
    'app_contract_financial_snapshots',
    'app_contract_consents',
    'app_contract_packages',
    'app_contract_package_items',
    'app_signature_envelopes',
    'app_signature_signers',
    'app_contract_files',
    'app_contract_audit_events',
    'app_contract_idempotency_keys',
    'app_contract_ledger',
    'app_contract_number_sequences'
  ]
  loop
    perform pg_temp.c109_assert(
      'schema_' || tbl,
      to_regclass('public.' || tbl) is not null,
      tbl
    );
  end loop;

  perform pg_temp.c109_assert(
    'schema_integrity_manifest_in_check',
    exists (
      select 1 from pg_constraint
      where conname = 'app_contract_files_type_chk'
        and pg_get_constraintdef(oid) ilike '%INTEGRITY_MANIFEST%'
    ),
    'INTEGRITY_MANIFEST'
  );

  perform pg_temp.c109_assert(
    'schema_envelope_in_progress',
    exists (
      select 1 from pg_constraint
      where conname = 'app_signature_envelopes_status_chk'
        and pg_get_constraintdef(oid) ilike '%IN_PROGRESS%'
    ),
    'IN_PROGRESS'
  );

  perform pg_temp.c109_assert(
    'schema_next_number_fn',
    exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'app_contract_next_number'
    ),
    'app_contract_next_number'
  );

  insert into public.tenants (id, legal_name, trade_name, status, owner_email)
  values
    (tenant_a, 'Tenant A Demo Contracts V2', 'tenant-a-demo', 'active', 'admin-a@example.invalid'),
    (tenant_b, 'Tenant B Demo Contracts V2', 'tenant-b-demo', 'active', 'admin-b@example.invalid')
  on conflict (id) do nothing;

  delete from public.tenant_users where user_id in (user_admin_a, user_member_a, user_admin_b, user_member_b);
  insert into public.tenant_users (
    id, tenant_id, user_id, full_name, email, role_slug, role, status, is_active, has_system_access
  ) values
    (gen_random_uuid(), tenant_a, user_admin_a, 'Admin A', 'admin-a@example.invalid', 'admin', 'admin', 'active', true, true),
    (gen_random_uuid(), tenant_a, user_member_a, 'Member A', 'member-a@example.invalid', 'recepcao', 'recepcao', 'active', true, true),
    (gen_random_uuid(), tenant_b, user_admin_b, 'Admin B', 'admin-b@example.invalid', 'admin', 'admin', 'active', true, true),
    (gen_random_uuid(), tenant_b, user_member_b, 'Member B', 'member-b@example.invalid', 'recepcao', 'recepcao', 'active', true, true);

  insert into public.app_signature_policies (
    id, tenant_id, name, signature_level, allowed_methods, requirements
  ) values
    (pol_a, tenant_a, 'Policy A', 'SIMPLE', '["ON_SCREEN"]'::jsonb, '{}'::jsonb),
    (pol_b, tenant_b, 'Policy B', 'SIMPLE', '["ON_SCREEN"]'::jsonb, '{}'::jsonb)
  on conflict (id) do nothing;

  insert into public.app_contract_templates (
    id, tenant_id, name, document_type, status, requirements, created_by, row_version
  ) values
    (tpl_a, tenant_a, 'Template A Demo', 'SERVICE_CONTRACT', 'PUBLISHED', '{}'::jsonb, user_admin_a, 1),
    (tpl_b, tenant_b, 'Template B Demo', 'SERVICE_CONTRACT', 'PUBLISHED', '{}'::jsonb, user_admin_b, 1)
  on conflict (id) do nothing;

  insert into public.app_contract_template_versions (
    id, tenant_id, template_id, version_number, status, content_schema, content_html,
    variables_schema, clauses_snapshot, published_at, created_by, locked_at
  ) values
    (tv_a, tenant_a, tpl_a, 1, 'PUBLISHED', '{}'::jsonb, '<p>Demo A</p>',
     '[]'::jsonb, '[]'::jsonb, now(), user_admin_a, now()),
    (tv_b, tenant_b, tpl_b, 1, 'PUBLISHED', '{}'::jsonb, '<p>Demo B</p>',
     '[]'::jsonb, '[]'::jsonb, now(), user_admin_b, now())
  on conflict (id) do nothing;

  update public.app_contract_templates set current_version_id = tv_a where id = tpl_a;
  update public.app_contract_templates set current_version_id = tv_b where id = tpl_b;

  insert into public.app_contracts (
    id, tenant_id, contract_number, document_type, title, patient_id, origin, status,
    created_by, row_version
  ) values
    (ctr_a, tenant_a, 'CTR-2026-000001', 'SERVICE_CONTRACT', 'Contrato A Demo', 'patient-demo-a', 'MANUAL', 'APPROVED',
     user_admin_a, 1),
    (ctr_b, tenant_b, 'CTR-2026-000001', 'SERVICE_CONTRACT', 'Contrato B Demo', 'patient-demo-b', 'MANUAL', 'APPROVED',
     user_admin_b, 1)
  on conflict (id) do nothing;

  insert into public.app_contract_versions (
    id, tenant_id, contract_id, version_number, generation_reason,
    content_schema_snapshot, patient_snapshot, clinic_snapshot, signers_snapshot,
    document_hash, created_by, locked_at
  ) values
    (ver_a, tenant_a, ctr_a, 1, 'INITIAL',
     '{}'::jsonb, '{"id":"patient-demo-a","name":"Paciente Demo A"}'::jsonb,
     '{"name":"Clinica A"}'::jsonb, '[]'::jsonb,
     repeat('a', 64), user_admin_a, now()),
    (ver_b, tenant_b, ctr_b, 1, 'INITIAL',
     '{}'::jsonb, '{"id":"patient-demo-b","name":"Paciente Demo B"}'::jsonb,
     '{"name":"Clinica B"}'::jsonb, '[]'::jsonb,
     repeat('b', 64), user_admin_b, now())
  on conflict (id) do nothing;

  update public.app_contracts set current_version_id = ver_a where id = ctr_a;
  update public.app_contracts set current_version_id = ver_b where id = ctr_b;

  insert into public.app_signature_envelopes (
    id, tenant_id, contract_id, contract_version_id, signature_policy_id,
    status, provider, document_hash_before_signing, created_by, completed_at
  ) values
    (env_a, tenant_a, ctr_a, ver_a, pol_a, 'COMPLETED', 'INTERNAL', repeat('a', 64), user_admin_a, now()),
    (env_b, tenant_b, ctr_b, ver_b, pol_b, 'COMPLETED', 'INTERNAL', repeat('b', 64), user_admin_b, now())
  on conflict (id) do nothing;

  insert into public.app_signature_signers (
    id, tenant_id, envelope_id, signer_order, signer_role, name, status
  ) values
    (sgn_a, tenant_a, env_a, 1, 'PATIENT', 'Paciente Demo A', 'SIGNED')
  on conflict (id) do nothing;

  insert into public.app_contract_files (
    id, tenant_id, contract_id, contract_version_id, file_type,
    storage_provider, storage_path, mime_type, size_bytes, sha256
  ) values
    (file_a, tenant_a, ctr_a, ver_a, 'SIGNED_PDF',
     'memory', 'tenants/aaaaaaaa/contracts/f111/signed.pdf', 'application/pdf', 128, repeat('c', 64))
  on conflict (id) do nothing;

  insert into public.app_contract_ledger (
    id, tenant_id, contract_id, contract_version_id, envelope_id,
    sequence_number, event_type, actor_type, actor_id, source,
    payload, previous_entry_hash, entry_hash, occurred_at, created_at
  ) values
    (ldg_a, tenant_a, ctr_a, ver_a, env_a,
     1, 'CONTRACT_CREATED', 'SYSTEM', 'sys', 'APP',
     '{"demo":true}'::jsonb, null, repeat('d', 64), now(), now())
  on conflict (id) do nothing;

  perform pg_temp.c109_assert('seed_ok', true, 'fixtures inserted');

  raised := false;
  begin
    insert into public.app_contract_versions (
      id, tenant_id, contract_id, version_number, generation_reason,
      content_schema_snapshot, patient_snapshot, clinic_snapshot, signers_snapshot, created_by
    ) values (
      gen_random_uuid(), tenant_a, ctr_b, 99, 'INITIAL',
      '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, user_admin_a
    );
  exception when others then raised := true;
  end;
  perform pg_temp.c109_assert('fk_version_cross_tenant', raised, 'version A → contract B');

  raised := false;
  begin
    insert into public.app_signature_signers (
      id, tenant_id, envelope_id, signer_order, signer_role, name, status
    ) values (
      gen_random_uuid(), tenant_a, env_b, 9, 'PATIENT', 'X', 'PENDING'
    );
  exception when others then raised := true;
  end;
  perform pg_temp.c109_assert('fk_signer_cross_tenant', raised, 'signer A → envelope B');

  raised := false;
  begin
    insert into public.app_contract_ledger (
      id, tenant_id, contract_id, sequence_number, event_type, actor_type, source,
      payload, entry_hash, occurred_at, created_at
    ) values (
      gen_random_uuid(), tenant_a, ctr_b, 1, 'CONTRACT_CREATED', 'SYSTEM', 'APP',
      '{}'::jsonb, repeat('e', 64), now(), now()
    );
  exception when others then raised := true;
  end;
  perform pg_temp.c109_assert('fk_ledger_cross_tenant', raised, 'ledger A → contract B');

  raised := false;
  begin
    insert into public.app_contract_template_versions (
      id, tenant_id, template_id, version_number, status, content_schema, content_html,
      variables_schema, created_by
    ) values (
      gen_random_uuid(), tenant_a, tpl_b, 2, 'DRAFT', '{}'::jsonb, '<p>x</p>', '[]'::jsonb, user_admin_a
    );
  exception when others then raised := true;
  end;
  perform pg_temp.c109_assert('fk_template_version_cross_tenant', raised, 'tv A → template B');

  raised := false;
  begin
    update public.app_contract_versions set rendered_html_snapshot = '<p>hack</p>' where id = ver_a;
  exception when others then raised := true;
  end;
  perform pg_temp.c109_assert('immutable_locked_version_html', raised, 'locked html');

  raised := false;
  begin
    update public.app_contract_versions set document_hash = repeat('f', 64) where id = ver_a;
  exception when others then raised := true;
  end;
  perform pg_temp.c109_assert('immutable_locked_version_hash', raised, 'locked hash');

  raised := false;
  begin
    update public.app_contract_template_versions set content_html = '<p>changed</p>' where id = tv_a;
  exception when others then raised := true;
  end;
  perform pg_temp.c109_assert('immutable_published_template', raised, 'published template');

  raised := false;
  begin
    update public.app_contract_ledger set payload = '{"x":1}'::jsonb where id = ldg_a;
  exception when others then raised := true;
  end;
  perform pg_temp.c109_assert('ledger_no_update', raised, 'ledger update');

  raised := false;
  begin
    delete from public.app_contract_ledger where id = ldg_a;
  exception when others then raised := true;
  end;
  perform pg_temp.c109_assert('ledger_no_delete', raised, 'ledger delete');

  raised := false;
  begin
    insert into public.app_contract_ledger (
      id, tenant_id, contract_id, sequence_number, event_type, actor_type, source,
      payload, previous_entry_hash, entry_hash, occurred_at, created_at
    ) values (
      gen_random_uuid(), tenant_a, ctr_a, 1, 'CONTRACT_APPROVED', 'SYSTEM', 'APP',
      '{}'::jsonb, null, repeat('1', 64), now(), now()
    );
  exception when others then raised := true;
  end;
  perform pg_temp.c109_assert('ledger_duplicate_sequence', raised, 'dup sequence');

  n1 := public.app_contract_next_number(tenant_a, 'CTR', 2026);
  n2 := public.app_contract_next_number(tenant_a, 'CTR', 2026);
  perform pg_temp.c109_assert(
    'number_sequence_unique',
    n1 is distinct from n2 and n1 ~ '^CTR-2026-[0-9]{6}$' and n2 ~ '^CTR-2026-[0-9]{6}$',
    n1 || ' / ' || n2
  );

  raised := false;
  begin
    update public.app_contracts set status = 'LEGACY_FOUR' where id = ctr_a;
  exception when others then raised := true;
  end;
  perform pg_temp.c109_assert('status_invalid_rejected', raised, 'invalid status');

  perform pg_temp.set_auth_context(user_member_a, tenant_a);
  set local role authenticated;
  select count(*) into cnt from public.app_contracts where tenant_id = tenant_a;
  perform pg_temp.c109_assert('rls_member_a_reads_a', cnt >= 1, 'cnt=' || cnt);
  select count(*) into cnt from public.app_contracts where tenant_id = tenant_b;
  perform pg_temp.c109_assert('rls_member_a_blocked_b', cnt = 0, 'cnt=' || cnt);
  reset role;

  perform pg_temp.set_auth_context(user_no_tenant, tenant_a);
  set local role authenticated;
  select count(*) into cnt from public.app_contracts;
  perform pg_temp.c109_assert('rls_no_tenant_blocked', cnt = 0, 'cnt=' || cnt);
  reset role;

  perform pg_temp.set_auth_context(user_member_a, tenant_a);
  set local role authenticated;
  raised := false;
  begin
    insert into public.app_contracts (
      id, tenant_id, contract_number, document_type, title, patient_id, origin, status, created_by, row_version
    ) values (
      gen_random_uuid(), tenant_a, 'CTR-2026-009999', 'SERVICE_CONTRACT', 'X', 'p', 'MANUAL', 'DRAFT',
      user_member_a, 1
    );
  exception when others then raised := true;
  end;
  select count(*) into cnt from public.app_contracts where contract_number = 'CTR-2026-009999';
  perform pg_temp.c109_assert('rls_member_cannot_insert', raised or cnt = 0, 'member insert');
  reset role;

  perform pg_temp.set_auth_context(user_admin_a, tenant_a);
  set local role authenticated;
  insert into public.app_contracts (
    id, tenant_id, contract_number, document_type, title, patient_id, origin, status, created_by, row_version
  ) values (
    gen_random_uuid(), tenant_a, 'CTR-2026-000050', 'SERVICE_CONTRACT', 'Admin insert', 'p-admin',
    'MANUAL', 'DRAFT', user_admin_a, 1
  );
  select count(*) into cnt from public.app_contracts where contract_number = 'CTR-2026-000050';
  perform pg_temp.c109_assert('rls_admin_a_insert_a', cnt = 1, 'admin insert');

  raised := false;
  begin
    insert into public.app_contracts (
      id, tenant_id, contract_number, document_type, title, patient_id, origin, status, created_by, row_version
    ) values (
      gen_random_uuid(), tenant_b, 'CTR-2026-000051', 'SERVICE_CONTRACT', 'Cross', 'p',
      'MANUAL', 'DRAFT', user_admin_a, 1
    );
  exception when others then raised := true;
  end;
  select count(*) into cnt from public.app_contracts
    where tenant_id = tenant_b and contract_number = 'CTR-2026-000051';
  perform pg_temp.c109_assert('rls_admin_a_blocked_insert_b', raised or cnt = 0, 'cross insert');
  reset role;

  perform pg_temp.set_auth_context(user_member_a, tenant_a);
  set local role authenticated;
  select count(*) into cnt from public.app_contract_ledger where tenant_id = tenant_a;
  perform pg_temp.c109_assert('rls_ledger_read_a', cnt >= 1, 'ledger a');
  select count(*) into cnt from public.app_contract_ledger where tenant_id = tenant_b;
  perform pg_temp.c109_assert('rls_ledger_blocked_b', cnt = 0, 'ledger b');
  reset role;

  insert into public.app_contract_idempotency_keys (
    tenant_id, scope, idempotency_key, resource_type, request_hash, input_fingerprint, status
  ) values (
    tenant_a, 'COMPLETE_CONTRACT_SIGNING', 'idem-demo-1', 'COMPLETE_CONTRACT_SIGNING',
    'fp1', 'fp1', 'RESERVED'
  );
  perform pg_temp.c109_assert('idempotency_complete_signing_scope', true, 'ok');

  begin
    insert into public.app_contracts (
      id, tenant_id, contract_number, document_type, title, patient_id, origin, status, created_by, row_version
    ) values (
      'aaaaaaaa-0000-4000-8000-000000000098'::uuid, tenant_a, 'CTR-2026-000098',
      'SERVICE_CONTRACT', 'Rollback demo 2', 'p', 'MANUAL', 'DRAFT', user_admin_a, 1
    );
    raise exception 'SIMULATED_ROLLBACK';
  exception when others then
    null; -- subtransaction rollback
  end;
  select count(*) into cnt from public.app_contracts where id = 'aaaaaaaa-0000-4000-8000-000000000098'::uuid;
  perform pg_temp.c109_assert('savepoint_rollback', cnt = 0, 'plpgsql subtransaction');

end;
$$;

do $$
declare
  failed int;
  total int;
begin
  select count(*) filter (where not passed), count(*) into failed, total from c109_results;
  if failed = 0 then
    raise notice 'CONTRACTS_V2_LOCAL_PASS total=%', total;
  else
    raise notice 'CONTRACTS_V2_LOCAL_FAILED failed=% total=%', failed, total;
  end if;
end;
$$;

select scenario, passed, detail from c109_results order by scenario;

select case
  when exists (select 1 from c109_results where not passed) then 'CONTRACTS_V2_LOCAL_FAILED'
  else 'CONTRACTS_V2_LOCAL_PASS'
end as status;

commit;
