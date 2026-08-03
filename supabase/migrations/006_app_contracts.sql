-- 006_app_contracts.sql
-- Contratos e consentimentos (multi-tenant). RLS: políticas explícitas + app_user_can_access_tenant (002).

create table if not exists public.contract_templates (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null default '',
  type text not null default 'clinic_custom'
    check (type in ('system_default', 'clinic_custom')),
  content text not null default '',
  version integer not null default 1,
  is_active boolean not null default true,
  usage_count integer not null default 0,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contract_blocks (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_id text not null,
  block_number integer not null default 1,
  title text not null default '',
  content text not null default '',
  is_active boolean not null default true,
  condition_type text not null default 'always',
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contract_blocks_tenant_template_idx
  on public.contract_blocks (tenant_id, template_id);

create table if not exists public.generated_contracts (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id text not null,
  quote_id text not null,
  quote_source text not null
    check (quote_source in ('crm_budget', 'clinical_budget')),
  template_id text,
  template_version integer not null default 1,
  contract_number text,
  final_content text not null default '',
  rendered_html text not null default '',
  pdf_url text,
  status text not null default 'draft'
    check (status in ('draft', 'generated', 'signed', 'canceled')),
  generated_by uuid null references auth.users(id) on delete set null,
  generated_at timestamptz,
  signed_at timestamptz,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generated_contracts_tenant_patient_idx
  on public.generated_contracts (tenant_id, patient_id);

create index if not exists generated_contracts_tenant_status_idx
  on public.generated_contracts (tenant_id, status);

create table if not exists public.contract_audit_logs (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_id text,
  action text not null,
  user_id uuid null references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists contract_audit_logs_tenant_contract_idx
  on public.contract_audit_logs (tenant_id, contract_id);

alter table public.contract_templates enable row level security;
alter table public.contract_blocks enable row level security;
alter table public.generated_contracts enable row level security;
alter table public.contract_audit_logs enable row level security;

drop policy if exists contract_templates_tenant_select_policy on public.contract_templates;
create policy contract_templates_tenant_select_policy on public.contract_templates
  for select using (public.app_user_can_access_tenant(tenant_id::text));

drop policy if exists contract_templates_tenant_modify_policy on public.contract_templates;
create policy contract_templates_tenant_modify_policy on public.contract_templates
  for all
  using (public.app_user_can_access_tenant(tenant_id::text))
  with check (public.app_user_can_access_tenant(tenant_id::text));

drop policy if exists contract_blocks_tenant_select_policy on public.contract_blocks;
create policy contract_blocks_tenant_select_policy on public.contract_blocks
  for select using (public.app_user_can_access_tenant(tenant_id::text));

drop policy if exists contract_blocks_tenant_modify_policy on public.contract_blocks;
create policy contract_blocks_tenant_modify_policy on public.contract_blocks
  for all
  using (public.app_user_can_access_tenant(tenant_id::text))
  with check (public.app_user_can_access_tenant(tenant_id::text));

drop policy if exists generated_contracts_tenant_select_policy on public.generated_contracts;
create policy generated_contracts_tenant_select_policy on public.generated_contracts
  for select using (public.app_user_can_access_tenant(tenant_id::text));

drop policy if exists generated_contracts_tenant_modify_policy on public.generated_contracts;
create policy generated_contracts_tenant_modify_policy on public.generated_contracts
  for all
  using (public.app_user_can_access_tenant(tenant_id::text))
  with check (public.app_user_can_access_tenant(tenant_id::text));

drop policy if exists contract_audit_logs_tenant_select_policy on public.contract_audit_logs;
create policy contract_audit_logs_tenant_select_policy on public.contract_audit_logs
  for select using (public.app_user_can_access_tenant(tenant_id::text));

drop policy if exists contract_audit_logs_tenant_modify_policy on public.contract_audit_logs;
create policy contract_audit_logs_tenant_modify_policy on public.contract_audit_logs
  for all
  using (public.app_user_can_access_tenant(tenant_id::text))
  with check (public.app_user_can_access_tenant(tenant_id::text));
