-- Multi-tenant hardening (App Principal)
-- Objetivo: restringir leitura/escrita por tenant_id com base em claim JWT tenant_id.
-- Esta versão aplica RLS automaticamente em TODA tabela public que possua coluna tenant_id.

create or replace function public.app_current_tenant_id()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'tenant_id', ''),
    nullif(auth.jwt() ->> 'app_tenant_id', '')
  )
$$;

create or replace function public.app_user_can_access_tenant(row_tenant_id text)
returns boolean
language sql
stable
as $$
  select (
    row_tenant_id is not null
    and row_tenant_id = public.app_current_tenant_id()
  )
$$;

do $$
declare
  rec record;
  policy_select_name text;
  policy_modify_name text;
begin
  for rec in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'tenant_id'
      and c.table_name not in ('audit_logs')
    group by c.table_name
  loop
    policy_select_name := rec.table_name || '_tenant_select_policy';
    policy_modify_name := rec.table_name || '_tenant_modify_policy';

    execute format('alter table public.%I enable row level security', rec.table_name);
    execute format('drop policy if exists %I on public.%I', policy_select_name, rec.table_name);
    execute format('drop policy if exists %I on public.%I', policy_modify_name, rec.table_name);

    execute format(
      'create policy %I on public.%I for select using (public.app_user_can_access_tenant(tenant_id::text))',
      policy_select_name,
      rec.table_name
    );

    execute format(
      'create policy %I on public.%I for all using (public.app_user_can_access_tenant(tenant_id::text)) with check (public.app_user_can_access_tenant(tenant_id::text))',
      policy_modify_name,
      rec.table_name
    );
  end loop;
end $$;
