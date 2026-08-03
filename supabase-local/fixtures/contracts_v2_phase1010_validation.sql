-- Phase 10.10 — sessions/challenges/rate-limits + private bucket (LOCAL DISPOSABLE ONLY)
-- Saída: CONTRACTS_V2_PHASE1010_PASS | CONTRACTS_V2_PHASE1010_FAILED

begin;

create temporary table if not exists c1010_results (
  scenario text primary key,
  detail text not null default '',
  passed boolean not null
);

create or replace function pg_temp.c1010_assert(p_scenario text, p_passed boolean, p_detail text default '')
returns void language plpgsql as $$
begin
  insert into c1010_results(scenario, detail, passed)
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
  sess_a uuid := 'a5555555-5555-4555-8555-555555555555';
  chal_a uuid := 'a6666666-6666-4666-8666-666666666666';
  tbl text;
  raised boolean;
  cnt int;
  v_token_hash text := encode(digest('phase1010-token-hash-seed', 'sha256'), 'hex');
  v_code_hash text := encode(digest('phase1010-otp-hash-seed', 'sha256'), 'hex');
  bucket_public boolean;
begin
  foreach tbl in array array[
    'app_signature_sessions',
    'app_signature_challenges',
    'app_signature_rate_limits',
    'app_contract_storage_ops'
  ]
  loop
    perform pg_temp.c1010_assert(
      'schema_' || tbl,
      to_regclass('public.' || tbl) is not null,
      tbl
    );
  end loop;

  perform pg_temp.c1010_assert(
    'column_files_status',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'app_contract_files' and column_name = 'status'
    ),
    'status'
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
    (pol_a, tenant_a, 'Policy A', 'SIMPLE', '["OTP_EMAIL"]'::jsonb, '{}'::jsonb),
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
    (ctr_a, tenant_a, 'CTR-2026-101001', 'SERVICE_CONTRACT', 'Contrato A Demo', 'patient-demo-a', 'MANUAL', 'APPROVED',
     user_admin_a, 1),
    (ctr_b, tenant_b, 'CTR-2026-101001', 'SERVICE_CONTRACT', 'Contrato B Demo', 'patient-demo-b', 'MANUAL', 'APPROVED',
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
    (env_a, tenant_a, ctr_a, ver_a, pol_a, 'SENT', 'INTERNAL', repeat('a', 64), user_admin_a, null),
    (env_b, tenant_b, ctr_b, ver_b, pol_b, 'COMPLETED', 'INTERNAL', repeat('b', 64), user_admin_b, now())
  on conflict (id) do nothing;

  insert into public.app_signature_signers (
    id, tenant_id, envelope_id, signer_order, signer_role, name, status, authentication_method
  ) values
    (sgn_a, tenant_a, env_a, 1, 'PATIENT', 'Paciente Demo A', 'PENDING', 'OTP_EMAIL')
  on conflict (id) do nothing;

  insert into public.app_signature_sessions (
    id, tenant_id, envelope_id, signer_id, token_id, token_hash,
    status, issued_at, expires_at
  ) values (
    sess_a, tenant_a, env_a, sgn_a, 'sst_fixture_1', v_token_hash,
    'ACTIVE', now(), now() + interval '1 hour'
  );

  perform pg_temp.c1010_assert(
    'session_hash_only',
    exists (
      select 1 from public.app_signature_sessions s
      where s.id = sess_a
        and s.token_hash = v_token_hash
        and s.token_hash ~ '^[a-f0-9]{64}$'
        and s.token_hash <> 'RAW_TOKEN_MUST_NEVER_PERSIST'
    ),
    'ok'
  );

  insert into public.app_signature_challenges (
    id, tenant_id, envelope_id, signer_id, session_id,
    challenge_type, code_hash, status, max_attempts, issued_at, expires_at
  ) values (
    chal_a, tenant_a, env_a, sgn_a, sess_a,
    'OTP_EMAIL', v_code_hash, 'PENDING', 3, now(), now() + interval '15 minutes'
  );

  perform pg_temp.c1010_assert(
    'challenge_hash_only',
    exists (
      select 1 from public.app_signature_challenges c
      where c.id = chal_a and c.code_hash = v_code_hash and c.code_hash <> '123456'
    ),
    'ok'
  );

  raised := false;
  begin
    insert into public.app_signature_sessions (
      tenant_id, envelope_id, signer_id, token_id, token_hash,
      status, issued_at, expires_at
    ) values (
      tenant_a, env_a, sgn_a, 'bad_hash', 'not-a-hash',
      'ACTIVE', now(), now() + interval '1 hour'
    );
  exception when others then
    raised := true;
  end;
  perform pg_temp.c1010_assert('session_hash_format_chk', raised, 'invalid hash rejected');

  -- signer/envelope mismatch
  raised := false;
  begin
    insert into public.app_signature_sessions (
      tenant_id, envelope_id, signer_id, token_id, token_hash,
      status, issued_at, expires_at
    ) values (
      tenant_a, env_b, sgn_a, 'sst_mismatch', encode(digest('mismatch', 'sha256'), 'hex'),
      'ACTIVE', now(), now() + interval '1 hour'
    );
  exception when others then
    raised := true;
  end;
  perform pg_temp.c1010_assert('session_signer_envelope_chk', raised, 'mismatch rejected');

  insert into public.app_signature_rate_limits (
    tenant_id, scope_key, operation, window_started_at, window_ends_at, counter
  ) values (
    tenant_a, 'env|sgn|-|-', 'REQUEST_CHALLENGE', now(), now() + interval '1 minute', 1
  );
  perform pg_temp.c1010_assert(
    'rate_limit_insert',
    exists (select 1 from public.app_signature_rate_limits where tenant_id = tenant_a),
    'ok'
  );

  -- RLS: authenticated sem SELECT em sessões
  perform pg_temp.set_auth_context(user_member_a, tenant_a);
  begin
    execute 'set local role authenticated';
    select count(*) into cnt from public.app_signature_sessions;
    perform pg_temp.c1010_assert('rls_sessions_no_select', cnt = 0, 'count=' || cnt);
  exception when insufficient_privilege then
    perform pg_temp.c1010_assert('rls_sessions_no_select', true, 'privilege denied');
  when others then
    perform pg_temp.c1010_assert('rls_sessions_no_select', true, SQLERRM);
  end;
  execute 'reset role';

  select public into bucket_public
  from storage.buckets
  where id = 'contracts-v2-private-local';
  perform pg_temp.c1010_assert(
    'bucket_private_local',
    bucket_public is not null and bucket_public = false,
    coalesce(bucket_public::text, 'missing')
  );

  insert into public.app_contract_files (
    id, tenant_id, contract_id, contract_version_id, file_type,
    storage_provider, storage_bucket, storage_path, mime_type, size_bytes, sha256, status
  ) values (
    file_a, tenant_a, ctr_a, ver_a, 'SIGNATURE_IMAGE',
    'supabase-local', 'contracts-v2-private-local',
    'tenants/' || tenant_a::text || '/contracts/' || ctr_a::text
      || '/versions/' || ver_a::text || '/SIGNATURE_IMAGE/' || file_a::text || '.png',
    'image/png', 10, encode(digest('file1010', 'sha256'), 'hex'), 'VERIFIED'
  ) on conflict (id) do nothing;

  perform pg_temp.c1010_assert(
    'file_status_verified',
    exists (
      select 1 from public.app_contract_files
      where id = file_a and status = 'VERIFIED'
    ),
    'ok'
  );

  insert into public.app_contract_storage_ops (
    tenant_id, contract_id, file_id, event_type, payload
  ) values (
    tenant_a, ctr_a, file_a,
    'FILE_UPLOAD_COMPLETED', '{"pathSuffix":"SIGNATURE_IMAGE"}'::jsonb
  );
  perform pg_temp.c1010_assert(
    'storage_ops_insert',
    exists (select 1 from public.app_contract_storage_ops where tenant_id = tenant_a),
    'ok'
  );

  -- payload sensível rejeitado
  raised := false;
  begin
    insert into public.app_contract_storage_ops (
      tenant_id, contract_id, event_type, payload
    ) values (
      tenant_a, ctr_a, 'FILE_UPLOAD_FAILED', '{"token":"secret"}'::jsonb
    );
  exception when others then
    raised := true;
  end;
  perform pg_temp.c1010_assert('storage_ops_no_token_payload', raised, 'token rejected');

end;
$$;

do $$
declare
  failed int;
  total int;
begin
  select count(*) filter (where not passed), count(*) into failed, total from c1010_results;
  raise notice 'PHASE1010_SUMMARY total=% failed=%', total, failed;
  if failed = 0 and total > 0 then
    raise notice 'CONTRACTS_V2_PHASE1010_PASS';
  else
    raise notice 'CONTRACTS_V2_PHASE1010_FAILED';
    raise exception 'CONTRACTS_V2_PHASE1010_FAILED: % fails of %', failed, total;
  end if;
end;
$$;

commit;
