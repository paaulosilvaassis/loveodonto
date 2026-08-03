-- ============================================================
-- Multi-tenant enforcement (APP PRINCIPAL)
-- Objetivo: garantir que dados críticos SEMPRE pertençam a um tenant.
-- ============================================================
--
-- Regras aplicadas:
-- 1) tabelas críticas devem ter tenant_id
-- 2) tenant_id obrigatório (NOT NULL)
-- 3) insert/update sem tenant_id inválido é bloqueado
-- 4) integridade referencial com public.tenants(id)
-- 5) prevenção de dados órfãos via FK
--
-- Observações:
-- - A migration falha (raise exception) se encontrar linhas críticas com tenant_id nulo,
--   para evitar mascarar problema de integridade.
-- - Preencha/backfill tenant_id dessas linhas e execute novamente.
-- ============================================================

do $$
declare
  tenants_table_exists boolean;
  tenants_id_type text;
  rec record;
  v_null_count bigint;
  v_missing_column_tables text[] := '{}';
  v_null_data_tables text[] := '{}';
  v_constraint_name text;
  v_index_name text;
  critical_tables text[] := array[
    -- núcleo multi-tenant
    'users_profile',
    'memberships',
    'invitations',
    'patients',
    'appointments',
    'transactions',
    'accounts_receivable',
    'receivable_payments',
    'payables',
    'cash_transactions',
    -- crm
    'crm_leads',
    'crm_tasks',
    -- marketing/chat
    'marketing_chat_contacts',
    'marketing_chat_conversations',
    'marketing_chat_messages',
    'marketing_chat_campaigns',
    'marketing_chat_automations',
    'marketing_chat_funnels',
    'marketing_chat_tags',
    'marketing_chat_departments',
    'marketing_chat_attendants',
    -- runtime automações marketing
    'marketing_automation_events',
    'marketing_automation_runs',
    'marketing_automation_run_steps',
    'marketing_scheduled_jobs',
    'marketing_job_attempts',
    'marketing_automation_metrics_daily'
  ];
begin
  -- 0) Pré-condição: tenants precisa existir
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'tenants'
  ) into tenants_table_exists;

  if not tenants_table_exists then
    raise exception 'Tabela public.tenants não encontrada. Crie a tabela de tenants antes desta migration.';
  end if;

  -- Tipo da PK de tenants.id (uuid/text/...)
  select format_type(a.atttypid, a.atttypmod)
    into tenants_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'tenants'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if tenants_id_type is null then
    raise exception 'Coluna public.tenants.id não encontrada.';
  end if;

  -- 1) Garantir tenant_id em todas as tabelas críticas existentes
  for rec in
    select t.table_name
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name = any(critical_tables)
      and t.table_type = 'BASE TABLE'
  loop
    if not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = rec.table_name
        and c.column_name = 'tenant_id'
    ) then
      -- adiciona tenant_id com o mesmo tipo de tenants.id
      execute format(
        'alter table public.%I add column tenant_id %s',
        rec.table_name,
        tenants_id_type
      );
      v_missing_column_tables := array_append(v_missing_column_tables, rec.table_name);
    end if;
  end loop;

  -- 2) Validar nulos e então aplicar NOT NULL + FK + índice
  for rec in
    select t.table_name
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name = any(critical_tables)
      and t.table_type = 'BASE TABLE'
      and exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = t.table_name
          and c.column_name = 'tenant_id'
      )
  loop
    execute format('select count(*) from public.%I where tenant_id is null', rec.table_name) into v_null_count;

    if v_null_count > 0 then
      v_null_data_tables := array_append(v_null_data_tables, rec.table_name || ' (' || v_null_count || ' linhas)');
      continue;
    end if;

    -- tenant_id obrigatório
    execute format('alter table public.%I alter column tenant_id set not null', rec.table_name);

    -- Para tenant_id text, evita string vazia (caso comum de "quase nulo")
    if exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = rec.table_name
        and c.column_name = 'tenant_id'
        and c.data_type in ('text', 'character varying')
    ) then
      begin
        execute format(
          'alter table public.%I add constraint %I check (length(trim(tenant_id::text)) > 0)',
          rec.table_name,
          left(rec.table_name || '_tenant_id_not_blank_chk', 63)
        );
      exception when duplicate_object then
        null;
      end;
    end if;

    -- índice para performance por tenant
    v_index_name := left(rec.table_name || '_tenant_id_idx', 63);
    execute format('create index if not exists %I on public.%I (tenant_id)', v_index_name, rec.table_name);

    -- FK para evitar órfãos
    v_constraint_name := left(rec.table_name || '_tenant_fk', 63);
    begin
      execute format(
        'alter table public.%I add constraint %I foreign key (tenant_id) references public.tenants(id) on update cascade on delete restrict',
        rec.table_name,
        v_constraint_name
      );
    exception
      when duplicate_object then
        null;
      when invalid_foreign_key then
        raise exception
          'Não foi possível criar FK em %.tenant_id -> tenants.id (tipo incompatível). Ajuste o tipo da coluna tenant_id para %.',
          rec.table_name, tenants_id_type;
    end;
  end loop;

  -- 3) Falhar explicitamente se houver dados críticos sem tenant_id
  if array_length(v_null_data_tables, 1) is not null then
    raise exception
      'Migração interrompida: existem linhas críticas com tenant_id nulo: %. Faça backfill e execute novamente.',
      array_to_string(v_null_data_tables, ', ');
  end if;

  -- 4) Aviso informativo de colunas adicionadas automaticamente
  if array_length(v_missing_column_tables, 1) is not null then
    raise notice
      'tenant_id foi adicionado automaticamente nas tabelas: %',
      array_to_string(v_missing_column_tables, ', ');
  end if;
end $$;
