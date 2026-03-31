-- Marketing > Chat Inteligente
-- Projeto alvo: Supabase APP (nao usar no banco de platform/admin).

create extension if not exists "pgcrypto";

create table if not exists public.marketing_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  name text not null,
  status text not null default 'active' check (status in ('active','paused','archived')),
  timezone text not null default 'America/Sao_Paulo',
  settings_json jsonb not null default '{}'::jsonb,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_accounts_tenant_idx on public.marketing_accounts (tenant_id, clinic_id);

create table if not exists public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  marketing_account_id uuid not null references public.marketing_accounts(id) on delete cascade,
  channel_type text not null check (channel_type in ('whatsapp','instagram','facebook','webchat')),
  provider text not null,
  external_channel_id text null,
  status text not null default 'connected' check (status in ('connected','degraded','disconnected')),
  config_json jsonb not null default '{}'::jsonb,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_channels_scope_idx on public.chat_channels (tenant_id, clinic_id, status);

create table if not exists public.chat_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  marketing_account_id uuid not null references public.marketing_accounts(id) on delete cascade,
  patient_id text null,
  lead_id text null,
  name text not null,
  phone_e164 text not null,
  email text null,
  origin text null,
  lifecycle_stage text not null default 'lead_quente',
  tags text[] not null default '{}'::text[],
  meta_json jsonb not null default '{}'::jsonb,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_contacts_scope_idx on public.chat_contacts (tenant_id, clinic_id, phone_e164);

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  marketing_account_id uuid not null references public.marketing_accounts(id) on delete cascade,
  chat_channel_id uuid not null references public.chat_channels(id) on delete cascade,
  chat_contact_id uuid not null references public.chat_contacts(id) on delete cascade,
  status text not null default 'open' check (status in ('open','pending_human','resolved','archived')),
  ia_mode text not null default 'active' check (ia_mode in ('active','disabled')),
  department text null,
  assigned_user_id uuid null,
  unread_count int not null default 0,
  preview text null,
  tags text[] not null default '{}'::text[],
  opened_at timestamptz null,
  resolved_at timestamptz null,
  last_message_at timestamptz null,
  meta_json jsonb not null default '{}'::jsonb,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_conversations_scope_idx on public.chat_conversations (tenant_id, clinic_id, status, last_message_at desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  chat_conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound','internal')),
  sender_type text not null default 'user' check (sender_type in ('user','ai','system','contact')),
  sender_id uuid null,
  content_text text not null,
  content_type text not null default 'text',
  media_url text null,
  template_id uuid null,
  status text not null default 'sent',
  error_code text null,
  sent_at timestamptz not null default now(),
  delivered_at timestamptz null,
  read_at timestamptz null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_conv_idx on public.chat_messages (chat_conversation_id, sent_at);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  marketing_account_id uuid not null references public.marketing_accounts(id) on delete cascade,
  name text not null,
  channel_id uuid null references public.chat_channels(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','scheduled','processing','paused','completed','failed','canceled')),
  scheduled_at timestamptz null,
  started_at timestamptz null,
  finished_at timestamptz null,
  message_template text null,
  audience_type text not null default 'all',
  total_targets int not null default 0,
  total_sent int not null default 0,
  total_failed int not null default 0,
  config_json jsonb not null default '{}'::jsonb,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists campaigns_scope_idx on public.campaigns (tenant_id, clinic_id, status, scheduled_at);

create table if not exists public.campaign_audiences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  source_type text not null,
  source_ref text null,
  filters_json jsonb not null default '{}'::jsonb,
  estimated_size int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  chat_contact_id uuid not null references public.chat_contacts(id) on delete cascade,
  channel_id uuid null references public.chat_channels(id) on delete set null,
  status text not null default 'queued',
  error_code text null,
  queued_at timestamptz not null default now(),
  sent_at timestamptz null,
  delivered_at timestamptz null,
  read_at timestamptz null,
  payload_json jsonb not null default '{}'::jsonb
);
create index if not exists campaign_messages_scope_idx on public.campaign_messages (campaign_id, status);

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  marketing_account_id uuid not null references public.marketing_accounts(id) on delete cascade,
  name text not null,
  trigger_type text not null,
  status text not null default 'active' check (status in ('active','paused','archived')),
  version int not null default 1,
  config_json jsonb not null default '{}'::jsonb,
  last_run_at timestamptz null,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  automation_id uuid not null references public.automations(id) on delete cascade,
  step_order int not null,
  step_type text not null,
  condition_json jsonb not null default '{}'::jsonb,
  action_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists automation_steps_order_idx on public.automation_steps (automation_id, step_order);

create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  automation_id uuid null references public.automations(id) on delete set null,
  trigger_type text not null,
  event_status text not null default 'pending' check (event_status in ('pending','dispatched','ignored','processed','failed')),
  chat_conversation_id uuid null references public.chat_conversations(id) on delete set null,
  chat_contact_id uuid null references public.chat_contacts(id) on delete set null,
  channel text null,
  dedupe_key text null,
  idempotency_key text null,
  payload_json jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz null,
  processed_at timestamptz null,
  created_at timestamptz not null default now()
);
create index if not exists automation_events_scope_idx on public.automation_events (tenant_id, clinic_id, trigger_type, created_at desc);

create table if not exists public.scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  automation_id uuid not null references public.automations(id) on delete cascade,
  automation_event_id uuid null references public.automation_events(id) on delete set null,
  chat_conversation_id uuid null references public.chat_conversations(id) on delete set null,
  chat_contact_id uuid null references public.chat_contacts(id) on delete set null,
  dedupe_key text null,
  idempotency_key text null,
  trigger_type text not null,
  channel text null,
  job_status text not null default 'queued' check (job_status in ('queued','running','retrying','completed','failed','cancelled')),
  run_at timestamptz not null default now(),
  locked_at timestamptz null,
  lock_token text null,
  lock_expires_at timestamptz null,
  completed_at timestamptz null,
  attempt_count int not null default 0,
  max_attempts int not null default 3,
  next_step_index int not null default 0,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scheduled_jobs_scope_idx on public.scheduled_jobs (tenant_id, clinic_id, job_status, run_at);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  automation_id uuid not null references public.automations(id) on delete cascade,
  scheduled_job_id uuid null references public.scheduled_jobs(id) on delete set null,
  automation_event_id uuid null references public.automation_events(id) on delete set null,
  trigger_type text not null,
  run_status text not null default 'running' check (run_status in ('running','success','failed','cancelled')),
  chat_conversation_id uuid null references public.chat_conversations(id) on delete set null,
  chat_contact_id uuid null references public.chat_contacts(id) on delete set null,
  channel text null,
  idempotency_key text null,
  error_text text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  duration_ms int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automation_runs_scope_idx on public.automation_runs (tenant_id, clinic_id, started_at desc, run_status);

create table if not exists public.automation_run_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  automation_run_id uuid not null references public.automation_runs(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  automation_step_id uuid null references public.automation_steps(id) on delete set null,
  step_order int not null default 0,
  step_type text not null,
  step_status text not null default 'running' check (step_status in ('running','success','failed','skipped')),
  channel text null,
  idempotency_key text null,
  message_preview text null,
  error_text text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  duration_ms int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists automation_run_steps_idx on public.automation_run_steps (automation_run_id, step_order);

create table if not exists public.job_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  scheduled_job_id uuid not null references public.scheduled_jobs(id) on delete cascade,
  automation_run_id uuid null references public.automation_runs(id) on delete set null,
  attempt_no int not null,
  attempt_status text not null default 'retrying' check (attempt_status in ('retrying','failed','success')),
  error_text text null,
  created_at timestamptz not null default now()
);
create index if not exists job_attempts_job_idx on public.job_attempts (scheduled_job_id, attempt_no desc);

create table if not exists public.automation_metrics_daily (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  metric_day date not null,
  total_runs int not null default 0,
  success_runs int not null default 0,
  failed_runs int not null default 0,
  total_duration_ms bigint not null default 0,
  by_automation_json jsonb not null default '{}'::jsonb,
  by_channel_json jsonb not null default '{}'::jsonb,
  step_failures_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, clinic_id, metric_day)
);
create index if not exists automation_metrics_daily_scope_idx on public.automation_metrics_daily (tenant_id, clinic_id, metric_day desc);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  name text not null,
  color text not null default '#6366F1',
  scope text not null default 'conversation',
  is_active boolean not null default true,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, clinic_id, scope, name)
);

create table if not exists public.funnels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  marketing_account_id uuid not null references public.marketing_accounts(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  is_default boolean not null default false,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.funnel_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  funnel_id uuid not null references public.funnels(id) on delete cascade,
  name text not null,
  color text not null default '#6366F1',
  position int not null,
  rules_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (funnel_id, position)
);

create table if not exists public.funnel_cards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  funnel_stage_id uuid not null references public.funnel_stages(id) on delete cascade,
  chat_conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  chat_contact_id uuid not null references public.chat_contacts(id) on delete cascade,
  title text not null,
  meta_json jsonb not null default '{}'::jsonb,
  moved_at timestamptz not null default now()
);

create table if not exists public.conversation_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  chat_conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  assigned_user_id uuid not null,
  assigned_by uuid null,
  reason text null,
  assigned_at timestamptz not null default now()
);

create table if not exists public.conversation_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  chat_conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  note_text text not null,
  is_private boolean not null default true,
  created_by uuid null,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  provider text not null,
  token_ref text not null,
  scopes text[] not null default '{}'::text[],
  expires_at timestamptz null,
  status text not null default 'active',
  last_rotated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  provider text not null,
  event_type text not null,
  event_id text not null,
  status_code int null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  payload_hash text null,
  error_message text null,
  unique (provider, event_id)
);

create table if not exists public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  marketing_account_id uuid not null references public.marketing_accounts(id) on delete cascade,
  name text not null,
  model_provider text not null,
  model_name text not null,
  status text not null default 'active',
  prompt_version int not null default 1,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  name text not null,
  channel_type text not null,
  language text not null default 'pt-BR',
  category text not null default 'general',
  content_json jsonb not null default '{}'::jsonb,
  approval_status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.broadcast_lists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  name text not null,
  description text null,
  source_type text not null default 'manual',
  filters_json jsonb not null default '{}'::jsonb,
  estimated_size int not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.broadcast_list_contacts (
  broadcast_list_id uuid not null references public.broadcast_lists(id) on delete cascade,
  chat_contact_id uuid not null references public.chat_contacts(id) on delete cascade,
  tenant_id uuid not null,
  clinic_id text not null,
  added_at timestamptz not null default now(),
  primary key (broadcast_list_id, chat_contact_id)
);

create table if not exists public.metrics_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  clinic_id text not null,
  metric_date date not null,
  scope text not null default 'global',
  scope_ref text null,
  kpi_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists metrics_snapshots_scope_idx on public.metrics_snapshots (tenant_id, clinic_id, metric_date desc);

alter table public.marketing_accounts enable row level security;
alter table public.chat_channels enable row level security;
alter table public.chat_contacts enable row level security;
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_audiences enable row level security;
alter table public.campaign_messages enable row level security;
alter table public.automations enable row level security;
alter table public.automation_steps enable row level security;
alter table public.automation_events enable row level security;
alter table public.scheduled_jobs enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_run_steps enable row level security;
alter table public.job_attempts enable row level security;
alter table public.automation_metrics_daily enable row level security;
alter table public.tags enable row level security;
alter table public.funnels enable row level security;
alter table public.funnel_stages enable row level security;
alter table public.funnel_cards enable row level security;
alter table public.conversation_assignments enable row level security;
alter table public.conversation_notes enable row level security;
alter table public.integration_tokens enable row level security;
alter table public.webhook_logs enable row level security;
alter table public.ai_agents enable row level security;
alter table public.templates enable row level security;
alter table public.broadcast_lists enable row level security;
alter table public.broadcast_list_contacts enable row level security;
alter table public.metrics_snapshots enable row level security;

create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = auth.uid()
      and m.has_system_access = true
      and m.status = 'active'
  );
$$;

create or replace function public.is_tenant_manager(p_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = auth.uid()
      and m.has_system_access = true
      and m.status = 'active'
      and m.role in ('admin','gerente','comercial','atendimento','recepcao')
  );
$$;

create policy "marketing_accounts_select" on public.marketing_accounts
for select using (public.is_tenant_member(tenant_id));
create policy "marketing_accounts_write" on public.marketing_accounts
for all using (public.is_tenant_manager(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "chat_channels_rw" on public.chat_channels
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "chat_contacts_rw" on public.chat_contacts
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "chat_conversations_rw" on public.chat_conversations
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "chat_messages_rw" on public.chat_messages
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "campaigns_rw" on public.campaigns
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "campaign_audiences_rw" on public.campaign_audiences
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "campaign_messages_rw" on public.campaign_messages
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "automations_rw" on public.automations
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "automation_steps_rw" on public.automation_steps
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "automation_events_rw" on public.automation_events
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "scheduled_jobs_rw" on public.scheduled_jobs
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "automation_runs_rw" on public.automation_runs
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "automation_run_steps_rw" on public.automation_run_steps
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "job_attempts_rw" on public.job_attempts
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "automation_metrics_daily_rw" on public.automation_metrics_daily
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "tags_rw" on public.tags
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "funnels_rw" on public.funnels
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "funnel_stages_rw" on public.funnel_stages
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "funnel_cards_rw" on public.funnel_cards
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "conversation_assignments_rw" on public.conversation_assignments
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "conversation_notes_rw" on public.conversation_notes
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "integration_tokens_rw" on public.integration_tokens
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "webhook_logs_rw" on public.webhook_logs
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "ai_agents_rw" on public.ai_agents
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "templates_rw" on public.templates
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "broadcast_lists_rw" on public.broadcast_lists
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "broadcast_list_contacts_rw" on public.broadcast_list_contacts
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));

create policy "metrics_snapshots_rw" on public.metrics_snapshots
for all using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_manager(tenant_id));
