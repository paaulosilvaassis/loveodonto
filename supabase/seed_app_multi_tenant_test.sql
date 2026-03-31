-- Seed mínimo para validar multi-tenant no App Principal
-- Seguro para rodar múltiplas vezes (upsert/if exists).

do $$
declare
  v_tenant_a text := 'tenant-test-a';
  v_tenant_b text := 'tenant-test-b';
  v_user_a uuid;
  v_user_b uuid;
begin
  -- 1) Vincular users_profile.tenant_id para usuários existentes (se tabela/coluna existirem)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users_profile'
      and column_name = 'tenant_id'
  ) then
    -- Pega dois usuários quaisquer da auth.users para testes
    select id into v_user_a from auth.users order by created_at asc limit 1;
    select id into v_user_b from auth.users order by created_at desc limit 1;

    if v_user_a is not null then
      update public.users_profile
      set tenant_id = coalesce(tenant_id, v_tenant_a)
      where id = v_user_a;
    end if;

    if v_user_b is not null then
      update public.users_profile
      set tenant_id = coalesce(tenant_id, v_tenant_b)
      where id = v_user_b;
    end if;
  end if;

  -- 2) Popular memberships (se existir e tiver tenant_id)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'memberships'
      and column_name = 'tenant_id'
  ) then
    if v_user_a is not null then
      insert into public.memberships (id, tenant_id, user_id, role, status, has_system_access, created_at, updated_at)
      values (gen_random_uuid(), v_tenant_a, v_user_a, 'admin', 'active', true, now(), now())
      on conflict do nothing;
    end if;

    if v_user_b is not null then
      insert into public.memberships (id, tenant_id, user_id, role, status, has_system_access, created_at, updated_at)
      values (gen_random_uuid(), v_tenant_b, v_user_b, 'atendimento', 'active', true, now(), now())
      on conflict do nothing;
    end if;
  end if;

  -- 3) Popular tenant_modules/feature_flags/tenant_subscriptions/tenant_limits (se existirem)
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tenant_modules') then
    insert into public.tenant_modules (id, tenant_id, module_key, enabled, created_at, updated_at)
    values
      (gen_random_uuid(), v_tenant_a, 'MARKETING', true, now(), now()),
      (gen_random_uuid(), v_tenant_a, 'FINANCEIRO', true, now(), now()),
      (gen_random_uuid(), v_tenant_b, 'MARKETING', false, now(), now())
    on conflict do nothing;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'feature_flags') then
    insert into public.feature_flags (id, flag_key, scope_type, scope_ref, enabled, payload, created_at, updated_at)
    values
      (gen_random_uuid(), 'marketing_automation_observability', 'global', '*', true, '{}'::jsonb, now(), now()),
      (gen_random_uuid(), 'whatsapp_ai_enabled', 'tenant', v_tenant_b, false, '{}'::jsonb, now(), now())
    on conflict do nothing;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tenant_subscriptions') then
    insert into public.tenant_subscriptions (id, tenant_id, plan_code, status, amount_cents, cycle, starts_at, next_billing_at, created_at, updated_at)
    values
      (gen_random_uuid(), v_tenant_a, 'Growth', 'active', 99900, 'monthly', now(), now() + interval '10 day', now(), now()),
      (gen_random_uuid(), v_tenant_b, 'Start', 'past_due', 59900, 'monthly', now(), now() - interval '2 day', now(), now())
    on conflict do nothing;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tenant_limits') then
    insert into public.tenant_limits (id, tenant_id, limits_json, created_at, updated_at)
    values
      (gen_random_uuid(), v_tenant_a, '{"users":20,"patients":5000}'::jsonb, now(), now()),
      (gen_random_uuid(), v_tenant_b, '{"users":5,"patients":500}'::jsonb, now(), now())
    on conflict do nothing;
  end if;
end $$;
