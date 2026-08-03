-- 023: RLS contracts — appointments + financial_* + crm_*
-- NÃO EXECUTAR automaticamente. Dry-run local somente sob autorização.
--
-- Modelo alinhado a 019_collaborators_rls:
--   SELECT  → membros do tenant (app_user_can_access_tenant)
--   INSERT/UPDATE/DELETE → admins do tenant (app_user_is_tenant_admin)
-- Soft delete preferido via deleted_at (Admin API filtrará).
--
-- Nota: Admin API usa service_role (bypassa RLS). Policies protegem
-- acesso direto client-side / PostgREST authenticated.
--
-- Pré-requisitos: 009 helpers, 020/021/022 tables, app_user_can_access_tenant,
-- app_user_is_tenant_admin.
--
-- ROLLBACK: drop policies + disable RLS por tabela (manual).

-- ---------------------------------------------------------------------------
-- Helper macro pattern (repeat per table)
-- ---------------------------------------------------------------------------

-- appointments
alter table public.appointments enable row level security;

drop policy if exists appointments_select_tenant on public.appointments;
drop policy if exists appointments_modify_admin on public.appointments;

create policy appointments_select_tenant on public.appointments
  for select
  using (
    auth.uid() is not null
    and deleted_at is null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy appointments_modify_admin on public.appointments
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- financial_accounts_receivable
alter table public.financial_accounts_receivable enable row level security;

drop policy if exists far_select_tenant on public.financial_accounts_receivable;
drop policy if exists far_modify_admin on public.financial_accounts_receivable;

create policy far_select_tenant on public.financial_accounts_receivable
  for select
  using (
    auth.uid() is not null
    and deleted_at is null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy far_modify_admin on public.financial_accounts_receivable
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- financial_payables
alter table public.financial_payables enable row level security;

drop policy if exists fpay_select_tenant on public.financial_payables;
drop policy if exists fpay_modify_admin on public.financial_payables;

create policy fpay_select_tenant on public.financial_payables
  for select
  using (
    auth.uid() is not null
    and deleted_at is null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy fpay_modify_admin on public.financial_payables
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- financial_financings
alter table public.financial_financings enable row level security;

drop policy if exists ffin_select_tenant on public.financial_financings;
drop policy if exists ffin_modify_admin on public.financial_financings;

create policy ffin_select_tenant on public.financial_financings
  for select
  using (
    auth.uid() is not null
    and deleted_at is null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy ffin_modify_admin on public.financial_financings
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- crm_pipeline_stages
alter table public.crm_pipeline_stages enable row level security;

drop policy if exists cps_select_tenant on public.crm_pipeline_stages;
drop policy if exists cps_modify_admin on public.crm_pipeline_stages;

create policy cps_select_tenant on public.crm_pipeline_stages
  for select
  using (
    auth.uid() is not null
    and deleted_at is null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy cps_modify_admin on public.crm_pipeline_stages
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- crm_leads
alter table public.crm_leads enable row level security;

drop policy if exists crm_leads_select_tenant on public.crm_leads;
drop policy if exists crm_leads_modify_admin on public.crm_leads;

create policy crm_leads_select_tenant on public.crm_leads
  for select
  using (
    auth.uid() is not null
    and deleted_at is null
    and public.app_user_can_access_tenant(tenant_id::text)
  );

create policy crm_leads_modify_admin on public.crm_leads
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

comment on policy appointments_select_tenant on public.appointments is
  'Leitura por membros do tenant. Mutations via admin ou service_role (Admin API).';
comment on policy crm_leads_modify_admin on public.crm_leads is
  'Escrita CRM restrita a owner/admin/master; Admin API service_role bypassa RLS com tenant guard.';
