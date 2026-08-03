-- 022: crm_leads + crm_pipeline_stages — schema SSOT CRM Kanban (Admin API Phase 6.2/6.3)
-- NÃO EXECUTAR automaticamente. Dry-run local somente sob autorização.
--
-- Compatível com:
--   server/lib/crmApiList.js (CRM_LEADS_LIST_SELECT / CRM_PIPELINE_STAGES_LIST_SELECT)
--   server/lib/crmApiWrite.js
--
-- Fora de escopo nesta migration: follow-ups, tasks, timeline, WhatsApp, Marketing Chat.
--
-- ROLLBACK (manual — ordem):
--   drop table if exists public.crm_leads cascade;
--   drop table if exists public.crm_pipeline_stages cascade;

-- ---------------------------------------------------------------------------
-- Pipeline stages
-- ---------------------------------------------------------------------------
create table if not exists public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legacy_id text not null,

  key text not null,
  label text not null,
  "order" integer not null default 0,
  color text null,
  is_active boolean not null default true,
  stage_type text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  deleted_at timestamptz null,

  constraint cps_legacy_id_nonempty_chk check (length(trim(legacy_id)) > 0),
  constraint cps_key_nonempty_chk check (length(trim(key)) > 0),
  constraint cps_label_nonempty_chk check (length(trim(label)) > 0)
);

comment on table public.crm_pipeline_stages is
  'Estágios do pipeline CRM por tenant. Coluna "order" alinhada ao contrato Admin API.';
comment on column public.crm_pipeline_stages."order" is
  'Ordem visual do Kanban (nome reserved word — quoted).';

create unique index if not exists cps_tenant_legacy_id_uq
  on public.crm_pipeline_stages (tenant_id, legacy_id)
  where deleted_at is null;

create unique index if not exists cps_tenant_key_uq
  on public.crm_pipeline_stages (tenant_id, key)
  where deleted_at is null;

create index if not exists cps_tenant_order_idx
  on public.crm_pipeline_stages (tenant_id, "order")
  where deleted_at is null and is_active = true;

drop trigger if exists trg_cps_touch_updated_at on public.crm_pipeline_stages;
create trigger trg_cps_touch_updated_at
  before update on public.crm_pipeline_stages
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legacy_id text not null,

  name text not null default '',
  phone text null,
  source text null,
  interest text null,
  best_contact_time text null,
  notes text not null default '',

  assigned_to_user_id text null,
  stage_key text not null default 'novo_lead',
  patient_id text null,

  estimated_value numeric(14, 2) null,
  priority text null,
  tags text[] not null default '{}'::text[],
  last_contact_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_id text null,
  updated_by_user_id text null,
  deleted_at timestamptz null,

  constraint crm_leads_legacy_id_nonempty_chk check (length(trim(legacy_id)) > 0),
  constraint crm_leads_stage_key_nonempty_chk check (length(trim(stage_key)) > 0)
);

comment on table public.crm_leads is
  'Leads Kanban SSOT. stage_key referencia crm_pipeline_stages.key (sem FK rígida nesta phase).';
comment on column public.crm_leads.stage_key is
  'Chave lógica do estágio; FK formal fica para validation migration após backfill.';

create unique index if not exists crm_leads_tenant_legacy_id_uq
  on public.crm_leads (tenant_id, legacy_id)
  where deleted_at is null;

create index if not exists crm_leads_tenant_stage_key_idx
  on public.crm_leads (tenant_id, stage_key)
  where deleted_at is null;

create index if not exists crm_leads_tenant_assigned_idx
  on public.crm_leads (tenant_id, assigned_to_user_id)
  where deleted_at is null and assigned_to_user_id is not null;

create index if not exists crm_leads_tenant_updated_at_idx
  on public.crm_leads (tenant_id, updated_at desc)
  where deleted_at is null;

drop trigger if exists trg_crm_leads_touch_updated_at on public.crm_leads;
create trigger trg_crm_leads_touch_updated_at
  before update on public.crm_leads
  for each row execute function public.touch_updated_at();
