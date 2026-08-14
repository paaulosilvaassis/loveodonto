-- 041: Odontogram clinical foundation — Phase OD-1B
-- NÃO EXECUTAR automaticamente em remoto, staging, produção ou banco local.
-- NÃO usar supabase db push. Sem seed. Sem apply nesta fase.
-- Runtime permanece DESLIGADO até OD-1D (RLS) e OD-1E (serviços).
-- Feature flags NÃO são alteradas nesta migration.
--
-- Princípios (fonte de verdade clínica):
--   * O odontograma clínico vivo NÃO é snapshot contratual.
--     Contrato futuro copia uma versão imutável; nunca aponta para o estado mutável.
--   * Financeiro NUNCA determina conclusão clínica.
--     procedure_completed é conclusão clínica; pagamento/recebível não conclui procedimento.
--   * Renderizadores 2D/3D NÃO são fonte de verdade.
--   * Modelo anatômico educativo NÃO é scan do paciente.
--   * Eventos clínicos NÃO podem ser atualizados ou apagados.
--   * Correção cria novo evento/versão; não reescreve histórico.
--
-- IDs externos (appointment/planned_procedure/budget_item/executed_procedure)
-- permanecem text opcionais. Sem FK para objetos que ainda vivem no IndexedDB.
--
-- Pré-requisitos: public.tenants, public.touch_updated_at() (005).
--
-- ROLLBACK (manual — ordem inversa; NUNCA com dados reais sem backup):
--   drop trigger if exists trg_app_odontogram_chart_versions_no_delete on public.app_odontogram_chart_versions;
--   drop trigger if exists trg_app_odontogram_chart_versions_no_update on public.app_odontogram_chart_versions;
--   drop trigger if exists trg_app_odontogram_events_no_delete on public.app_odontogram_events;
--   drop trigger if exists trg_app_odontogram_events_no_update on public.app_odontogram_events;
--   drop trigger if exists trg_app_odontogram_tooth_states_touch_updated_at on public.app_odontogram_tooth_states;
--   drop trigger if exists trg_app_odontogram_tooth_states_protect on public.app_odontogram_tooth_states;
--   drop trigger if exists trg_app_odontogram_charts_touch_updated_at on public.app_odontogram_charts;
--   drop trigger if exists trg_app_odontogram_charts_protect on public.app_odontogram_charts;
--   drop table if exists public.app_odontogram_chart_versions;
--   drop table if exists public.app_odontogram_events;
--   drop table if exists public.app_odontogram_tooth_states;
--   drop table if exists public.app_odontogram_charts;
--   drop function if exists public.app_odontogram_protect_mutable_row();
--   drop function if exists public.app_odontogram_reject_mutation();
--   drop function if exists public.app_odontogram_surfaces_are_valid(text[]);
--   drop function if exists public.app_odontogram_is_valid_event_type(text);
--   drop function if exists public.app_odontogram_is_valid_condition_code(text);
--   drop function if exists public.app_odontogram_is_valid_fdi(text);
--   drop function if exists public.app_odontogram_event_types();
--   drop function if exists public.app_odontogram_condition_codes();
--   drop function if exists public.app_odontogram_fdi_ids();
--   drop function if exists public.app_odontogram_surface_codes();

-- ===========================================================================
-- Catálogos canônicos (paridade OD-1A / schemaContract.js — testada estaticamente)
-- ===========================================================================

create or replace function public.app_odontogram_surface_codes()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['M', 'D', 'V', 'L', 'P', 'O', 'I']::text[];
$$;

create or replace function public.app_odontogram_fdi_ids()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    '18', '17', '16', '15', '14', '13', '12', '11',
    '21', '22', '23', '24', '25', '26', '27', '28',
    '48', '47', '46', '45', '44', '43', '42', '41',
    '31', '32', '33', '34', '35', '36', '37', '38',
    '55', '54', '53', '52', '51',
    '61', '62', '63', '64', '65',
    '85', '84', '83', '82', '81',
    '71', '72', '73', '74', '75'
  ]::text[];
$$;

create or replace function public.app_odontogram_condition_codes()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'healthy',
    'caries',
    'restoration',
    'missing',
    'extraction_indicated',
    'endodontic_treatment',
    'crown_or_prosthesis',
    'implant',
    'fracture',
    'sealant',
    'residual_root',
    'unerupted',
    'impacted',
    'wear',
    'abrasion',
    'erosion',
    'abfraction',
    'mobility',
    'periapical_lesion',
    'gingival_recession',
    'observation'
  ]::text[];
$$;

create or replace function public.app_odontogram_event_types()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'chart_created',
    'condition_recorded',
    'condition_corrected',
    'condition_removed',
    'procedure_planned',
    'procedure_authorized',
    'procedure_started',
    'procedure_completed',
    'procedure_cancelled',
    'chart_submitted_for_review',
    'chart_reopened',
    'chart_finalized',
    'correction_recorded'
  ]::text[];
$$;

create or replace function public.app_odontogram_is_valid_fdi(p_fdi text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_fdi is not null
    and p_fdi ~ '^[0-9]{2}$'
    and p_fdi = any (public.app_odontogram_fdi_ids());
$$;

create or replace function public.app_odontogram_is_valid_condition_code(p_code text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_code is not null
    and p_code = any (public.app_odontogram_condition_codes());
$$;

create or replace function public.app_odontogram_is_valid_event_type(p_type text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_type is not null
    and p_type = any (public.app_odontogram_event_types());
$$;

create or replace function public.app_odontogram_surfaces_are_valid(p_surfaces text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    p_surfaces is not null
    and cardinality(p_surfaces) = (
      select count(distinct s) from unnest(p_surfaces) as s
    )
    and not exists (
      select 1
      from unnest(p_surfaces) as s
      where s is null
         or s <> all (public.app_odontogram_surface_codes())
    );
$$;

create or replace function public.app_odontogram_reject_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'APP_ODONTOGRAM_APPEND_ONLY: % cannot be updated or deleted', tg_table_name
    using errcode = 'integrity_constraint_violation';
end;
$$;

create or replace function public.app_odontogram_protect_mutable_row()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'APP_ODONTOGRAM_TENANT_IMMUTABLE: tenant_id cannot change'
      using errcode = 'integrity_constraint_violation';
  end if;

  if new.patient_id is distinct from old.patient_id then
    raise exception 'APP_ODONTOGRAM_PATIENT_IMMUTABLE: patient_id cannot change'
      using errcode = 'integrity_constraint_violation';
  end if;

  if new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'APP_ODONTOGRAM_AUTHORSHIP_IMMUTABLE: created_by/created_at cannot change'
      using errcode = 'integrity_constraint_violation';
  end if;

  if new.row_version is distinct from old.row_version then
    raise exception 'APP_ODONTOGRAM_ROW_VERSION_CONFLICT: expected %, received %',
      old.row_version, new.row_version
      using errcode = '40001';
  end if;

  if to_jsonb(new) ? 'chart_id'
     and (to_jsonb(new) ->> 'chart_id') is distinct from (to_jsonb(old) ->> 'chart_id') then
    raise exception 'APP_ODONTOGRAM_CHART_IMMUTABLE: chart_id cannot change'
      using errcode = 'integrity_constraint_violation';
  end if;

  if to_jsonb(new) ? 'tooth_fdi'
     and (to_jsonb(new) ->> 'tooth_fdi') is distinct from (to_jsonb(old) ->> 'tooth_fdi') then
    raise exception 'APP_ODONTOGRAM_TOOTH_IMMUTABLE: tooth_fdi cannot change'
      using errcode = 'integrity_constraint_violation';
  end if;

  new.row_version := old.row_version + 1;
  return new;
end;
$$;

comment on function public.app_odontogram_protect_mutable_row() is
  'OD-1B — incrementa row_version; rejeita troca de tenant/paciente/autoria. Não preenche created_by/updated_by a partir de auth.uid().';

comment on function public.app_odontogram_reject_mutation() is
  'OD-1B — fail-closed: eventos clínicos e versões são append-only (sem UPDATE/DELETE).';

revoke all on function public.app_odontogram_surface_codes() from public, anon, authenticated;
revoke all on function public.app_odontogram_fdi_ids() from public, anon, authenticated;
revoke all on function public.app_odontogram_condition_codes() from public, anon, authenticated;
revoke all on function public.app_odontogram_event_types() from public, anon, authenticated;
revoke all on function public.app_odontogram_is_valid_fdi(text) from public, anon, authenticated;
revoke all on function public.app_odontogram_is_valid_condition_code(text) from public, anon, authenticated;
revoke all on function public.app_odontogram_is_valid_event_type(text) from public, anon, authenticated;
revoke all on function public.app_odontogram_surfaces_are_valid(text[]) from public, anon, authenticated;
revoke all on function public.app_odontogram_reject_mutation() from public, anon, authenticated;
revoke all on function public.app_odontogram_protect_mutable_row() from public, anon, authenticated;

grant execute on function public.app_odontogram_surface_codes() to service_role;
grant execute on function public.app_odontogram_fdi_ids() to service_role;
grant execute on function public.app_odontogram_condition_codes() to service_role;
grant execute on function public.app_odontogram_event_types() to service_role;
grant execute on function public.app_odontogram_is_valid_fdi(text) to service_role;
grant execute on function public.app_odontogram_is_valid_condition_code(text) to service_role;
grant execute on function public.app_odontogram_is_valid_event_type(text) to service_role;
grant execute on function public.app_odontogram_surfaces_are_valid(text[]) to service_role;
grant execute on function public.app_odontogram_reject_mutation() to service_role;
grant execute on function public.app_odontogram_protect_mutable_row() to service_role;

-- ===========================================================================
-- app_odontogram_charts — gráfico clínico vivo (não é snapshot contratual)
-- ===========================================================================

create table if not exists public.app_odontogram_charts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  patient_id text not null,
  dentition_stage text not null,
  schema_version text not null,
  status text not null,
  row_version bigint not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  updated_at timestamptz not null default now(),
  updated_by uuid not null,
  finalized_at timestamptz null,
  finalized_by uuid null,
  deleted_at timestamptz null,
  deleted_by uuid null,

  constraint app_odontogram_charts_tenant_id_uidx unique (tenant_id, id),
  constraint app_odontogram_charts_identity_uidx unique (tenant_id, id, patient_id),
  constraint app_odontogram_charts_patient_nonempty_chk
    check (length(trim(patient_id)) > 0),
  constraint app_odontogram_charts_dentition_stage_chk
    check (dentition_stage in ('permanent', 'primary', 'mixed')),
  constraint app_odontogram_charts_status_chk
    check (status in ('draft', 'in_review', 'finalized')),
  constraint app_odontogram_charts_schema_version_chk
    check (length(trim(schema_version)) > 0),
  constraint app_odontogram_charts_row_version_chk
    check (row_version >= 1),
  constraint app_odontogram_charts_finalized_pair_chk
    check (
      (finalized_at is null and finalized_by is null)
      or (finalized_at is not null and finalized_by is not null)
    ),
  constraint app_odontogram_charts_finalized_status_chk
    check (
      (status = 'finalized' and finalized_at is not null and finalized_by is not null)
      or (status <> 'finalized' and finalized_at is null and finalized_by is null)
    ),
  constraint app_odontogram_charts_deleted_pair_chk
    check (
      (deleted_at is null and deleted_by is null)
      or (deleted_at is not null and deleted_by is not null)
    )
);

comment on table public.app_odontogram_charts is
  'OD-1B — gráfico clínico vivo do odontograma. NÃO é snapshot contratual. Renderizadores 2D/3D não são fonte de verdade. Runtime desligado até OD-1D/OD-1E.';
comment on column public.app_odontogram_charts.patient_id is
  'ID textual legado do paciente. Sem FK para IndexedDB/public.patients nesta fundação.';
comment on column public.app_odontogram_charts.status is
  'draft | in_review | finalized. Finalização clínica distinta de pagamento/contrato.';

create unique index if not exists app_odontogram_charts_tenant_patient_active_uq
  on public.app_odontogram_charts (tenant_id, patient_id)
  where deleted_at is null;

create index if not exists app_odontogram_charts_tenant_patient_idx
  on public.app_odontogram_charts (tenant_id, patient_id);

drop trigger if exists trg_app_odontogram_charts_protect on public.app_odontogram_charts;
create trigger trg_app_odontogram_charts_protect
before update on public.app_odontogram_charts
for each row execute function public.app_odontogram_protect_mutable_row();

drop trigger if exists trg_app_odontogram_charts_touch_updated_at on public.app_odontogram_charts;
create trigger trg_app_odontogram_charts_touch_updated_at
before update on public.app_odontogram_charts
for each row execute function public.touch_updated_at();

-- ===========================================================================
-- app_odontogram_tooth_states — projeção vigente reconstruível pelos eventos
-- ===========================================================================

create table if not exists public.app_odontogram_tooth_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  chart_id uuid not null,
  patient_id text not null,
  tooth_fdi text not null,
  state jsonb not null,
  row_version bigint not null default 1,
  last_event_id uuid null,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  updated_at timestamptz not null default now(),
  updated_by uuid not null,
  deleted_at timestamptz null,
  deleted_by uuid null,

  constraint app_odontogram_tooth_states_tenant_id_uidx unique (tenant_id, id),
  constraint app_odontogram_tooth_states_patient_nonempty_chk
    check (length(trim(patient_id)) > 0),
  constraint app_odontogram_tooth_states_fdi_chk
    check (public.app_odontogram_is_valid_fdi(tooth_fdi)),
  constraint app_odontogram_tooth_states_state_object_chk
    check (jsonb_typeof(state) = 'object'),
  constraint app_odontogram_tooth_states_state_no_financial_chk
    check (
      not (state ?| array[
        'receivable_id', 'payment_id', 'paid', 'amount_paid',
        'authorized', 'financeiro', 'budget_paid'
      ])
    ),
  constraint app_odontogram_tooth_states_state_no_binary_chk
    check (
      not (state ?| array['bytes', 'base64', 'data_uri', 'dicom', 'stl', 'mesh'])
    ),
  constraint app_odontogram_tooth_states_row_version_chk
    check (row_version >= 1),
  constraint app_odontogram_tooth_states_deleted_pair_chk
    check (
      (deleted_at is null and deleted_by is null)
      or (deleted_at is not null and deleted_by is not null)
    ),
  constraint app_odontogram_tooth_states_chart_identity_fk
    foreign key (tenant_id, chart_id, patient_id)
    references public.app_odontogram_charts (tenant_id, id, patient_id)
    on delete restrict
);

comment on table public.app_odontogram_tooth_states is
  'OD-1B — projeção consultável do estado vigente por dente. Reconstruível a partir dos eventos. JSON permite múltiplas condições/faces; contrato detalhado em fases posteriores. Sem valor financeiro e sem binário.';
comment on column public.app_odontogram_tooth_states.tooth_fdi is
  'FDI/ISO 3950 de dois dígitos, restrito ao conjunto permanente+decíduo canônico (não apenas regex).';
comment on column public.app_odontogram_tooth_states.state is
  'Objeto JSON de projeção. Não confiar no frontend; tenant_id/patient_id vêm do chart via FK composta.';

create unique index if not exists app_odontogram_tooth_states_active_tooth_uq
  on public.app_odontogram_tooth_states (tenant_id, chart_id, tooth_fdi)
  where deleted_at is null;

create index if not exists app_odontogram_tooth_states_tenant_chart_idx
  on public.app_odontogram_tooth_states (tenant_id, chart_id)
  where deleted_at is null;

drop trigger if exists trg_app_odontogram_tooth_states_protect on public.app_odontogram_tooth_states;
create trigger trg_app_odontogram_tooth_states_protect
before update on public.app_odontogram_tooth_states
for each row execute function public.app_odontogram_protect_mutable_row();

drop trigger if exists trg_app_odontogram_tooth_states_touch_updated_at on public.app_odontogram_tooth_states;
create trigger trg_app_odontogram_tooth_states_touch_updated_at
before update on public.app_odontogram_tooth_states
for each row execute function public.touch_updated_at();

-- ===========================================================================
-- app_odontogram_events — ledger clínico append-only
-- ===========================================================================

create table if not exists public.app_odontogram_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  chart_id uuid not null,
  patient_id text not null,
  appointment_id text null,
  planned_procedure_id text null,
  budget_item_id text null,
  executed_procedure_id text null,
  event_type text not null,
  tooth_fdi text null,
  surfaces text[] not null default '{}',
  condition_code text null,
  payload jsonb not null default '{}'::jsonb,
  reason text null,
  occurred_at timestamptz not null default now(),
  actor_id uuid not null,
  previous_event_hash text null,
  event_hash text not null,
  created_at timestamptz not null default now(),

  constraint app_odontogram_events_tenant_id_uidx unique (tenant_id, id),
  constraint app_odontogram_events_patient_nonempty_chk
    check (length(trim(patient_id)) > 0),
  constraint app_odontogram_events_type_chk
    check (public.app_odontogram_is_valid_event_type(event_type)),
  constraint app_odontogram_events_fdi_chk
    check (tooth_fdi is null or public.app_odontogram_is_valid_fdi(tooth_fdi)),
  constraint app_odontogram_events_surfaces_chk
    check (public.app_odontogram_surfaces_are_valid(surfaces)),
  constraint app_odontogram_events_condition_chk
    check (condition_code is null or public.app_odontogram_is_valid_condition_code(condition_code)),
  constraint app_odontogram_events_payload_object_chk
    check (jsonb_typeof(payload) = 'object'),
  constraint app_odontogram_events_payload_no_financial_identity_chk
    check (
      not (payload ?| array[
        'receivable_id', 'payment_id', 'paid', 'amount_paid'
      ])
    ),
  constraint app_odontogram_events_hash_nonempty_chk
    check (length(trim(event_hash)) > 0),
  constraint app_odontogram_events_prev_hash_chk
    check (previous_event_hash is null or length(trim(previous_event_hash)) > 0),
  constraint app_odontogram_events_correction_reason_chk
    check (
      event_type not in ('condition_corrected', 'condition_removed', 'correction_recorded')
      or length(trim(coalesce(reason, ''))) > 0
    ),
  constraint app_odontogram_events_condition_tooth_chk
    check (
      event_type not in ('condition_recorded', 'condition_corrected')
      or (
        tooth_fdi is not null
        and condition_code is not null
      )
    ),
  constraint app_odontogram_events_condition_removed_tooth_chk
    check (
      event_type <> 'condition_removed'
      or tooth_fdi is not null
    ),
  constraint app_odontogram_events_procedure_planned_chk
    check (
      event_type not in ('procedure_planned', 'procedure_authorized')
      or length(trim(coalesce(planned_procedure_id, ''))) > 0
    ),
  constraint app_odontogram_events_procedure_started_chk
    check (
      event_type <> 'procedure_started'
      or length(trim(coalesce(nullif(btrim(appointment_id), ''), executed_procedure_id, ''))) > 0
    ),
  constraint app_odontogram_events_procedure_completed_clinical_chk
    check (
      event_type <> 'procedure_completed'
      or length(trim(coalesce(nullif(btrim(executed_procedure_id), ''), appointment_id, ''))) > 0
    ),
  constraint app_odontogram_events_procedure_cancelled_chk
    check (
      event_type <> 'procedure_cancelled'
      or length(trim(coalesce(nullif(btrim(planned_procedure_id), ''), executed_procedure_id, ''))) > 0
    ),
  constraint app_odontogram_events_chart_identity_fk
    foreign key (tenant_id, chart_id, patient_id)
    references public.app_odontogram_charts (tenant_id, id, patient_id)
    on delete restrict
);

comment on table public.app_odontogram_events is
  'OD-1B — eventos clínicos append-only. Não criar evento ao abrir a aba. Não atualizar nem apagar. procedure_completed é conclusão clínica, nunca pagamento. budget_item_id sozinho não conclui procedimento. Receivable/payment não são identidade clínica.';
comment on column public.app_odontogram_events.event_type is
  'Catálogo OD-1B. Sem tab_opened/chart_viewed. procedure_completed = conclusão clínica, não financeira.';
comment on column public.app_odontogram_events.budget_item_id is
  'Vínculo opcional textual. NÃO gera procedure_completed sozinho. Sem FK IndexedDB.';
comment on column public.app_odontogram_events.appointment_id is
  'Vínculo clínico textual opcional. Sem FK para IndexedDB/appointments nesta fundação.';
comment on column public.app_odontogram_events.payload is
  'Objeto JSON. Proibido receivable_id/payment_id/paid/amount_paid como identidade.';

create index if not exists app_odontogram_events_tenant_chart_occurred_idx
  on public.app_odontogram_events (tenant_id, chart_id, occurred_at);

create index if not exists app_odontogram_events_tenant_patient_idx
  on public.app_odontogram_events (tenant_id, patient_id);

create index if not exists app_odontogram_events_tenant_appointment_idx
  on public.app_odontogram_events (tenant_id, appointment_id)
  where appointment_id is not null;

drop trigger if exists trg_app_odontogram_events_no_update on public.app_odontogram_events;
create trigger trg_app_odontogram_events_no_update
before update on public.app_odontogram_events
for each row execute function public.app_odontogram_reject_mutation();

drop trigger if exists trg_app_odontogram_events_no_delete on public.app_odontogram_events;
create trigger trg_app_odontogram_events_no_delete
before delete on public.app_odontogram_events
for each row execute function public.app_odontogram_reject_mutation();

alter table public.app_odontogram_tooth_states
  drop constraint if exists app_odontogram_tooth_states_last_event_fk;
alter table public.app_odontogram_tooth_states
  add constraint app_odontogram_tooth_states_last_event_fk
  foreign key (tenant_id, last_event_id)
  references public.app_odontogram_events (tenant_id, id)
  on delete restrict
  deferrable initially deferred;

-- ===========================================================================
-- app_odontogram_chart_versions — snapshots imutáveis (cópia futura de contrato)
-- ===========================================================================

create table if not exists public.app_odontogram_chart_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  chart_id uuid not null,
  patient_id text not null,
  version_number bigint not null,
  schema_version text not null,
  source_row_version bigint not null,
  snapshot jsonb not null,
  snapshot_hash text not null,
  previous_version_hash text null,
  reason text null,
  created_at timestamptz not null default now(),
  created_by uuid not null,

  constraint app_odontogram_chart_versions_tenant_id_uidx unique (tenant_id, id),
  constraint app_odontogram_chart_versions_number_uq
    unique (tenant_id, chart_id, version_number),
  constraint app_odontogram_chart_versions_hash_uq
    unique (tenant_id, chart_id, snapshot_hash),
  constraint app_odontogram_chart_versions_patient_nonempty_chk
    check (length(trim(patient_id)) > 0),
  constraint app_odontogram_chart_versions_number_chk
    check (version_number >= 1),
  constraint app_odontogram_chart_versions_source_row_version_chk
    check (source_row_version >= 1),
  constraint app_odontogram_chart_versions_schema_version_chk
    check (length(trim(schema_version)) > 0),
  constraint app_odontogram_chart_versions_snapshot_object_chk
    check (jsonb_typeof(snapshot) = 'object'),
  constraint app_odontogram_chart_versions_hash_nonempty_chk
    check (length(trim(snapshot_hash)) > 0),
  constraint app_odontogram_chart_versions_prev_hash_chk
    check (previous_version_hash is null or length(trim(previous_version_hash)) > 0),
  constraint app_odontogram_chart_versions_chart_identity_fk
    foreign key (tenant_id, chart_id, patient_id)
    references public.app_odontogram_charts (tenant_id, id, patient_id)
    on delete restrict
);

comment on table public.app_odontogram_chart_versions is
  'OD-1B — versões imutáveis do gráfico. Correção posterior cria nova versão. Contrato futuro copia esta versão; nunca aponta para o estado vivo mutável. Modelo educativo 3D/scan DICOM não pertence a esta tabela.';
comment on column public.app_odontogram_chart_versions.snapshot is
  'Objeto JSON do gráfico na versão. Sem binário/DICOM/mesh.';
comment on column public.app_odontogram_chart_versions.snapshot_hash is
  'Hash obrigatório da versão. Unicidade segura por chart.';

drop trigger if exists trg_app_odontogram_chart_versions_no_update on public.app_odontogram_chart_versions;
create trigger trg_app_odontogram_chart_versions_no_update
before update on public.app_odontogram_chart_versions
for each row execute function public.app_odontogram_reject_mutation();

drop trigger if exists trg_app_odontogram_chart_versions_no_delete on public.app_odontogram_chart_versions;
create trigger trg_app_odontogram_chart_versions_no_delete
before delete on public.app_odontogram_chart_versions
for each row execute function public.app_odontogram_reject_mutation();

-- ===========================================================================
-- RLS fail-closed — SEM policy nesta fase (OD-1D criará as policies definitivas)
-- Sem policy, clientes authenticated/anon permanecem bloqueados.
-- ===========================================================================

alter table public.app_odontogram_charts enable row level security;
alter table public.app_odontogram_charts force row level security;
alter table public.app_odontogram_tooth_states enable row level security;
alter table public.app_odontogram_tooth_states force row level security;
alter table public.app_odontogram_events enable row level security;
alter table public.app_odontogram_events force row level security;
alter table public.app_odontogram_chart_versions enable row level security;
alter table public.app_odontogram_chart_versions force row level security;

revoke all on table public.app_odontogram_charts from public, anon, authenticated;
revoke all on table public.app_odontogram_tooth_states from public, anon, authenticated;
revoke all on table public.app_odontogram_events from public, anon, authenticated;
revoke all on table public.app_odontogram_chart_versions from public, anon, authenticated;

-- Intencionalmente SEM create policy.
-- Intencionalmente SEM grant a anon/authenticated.
-- Intencionalmente SEM storage bucket / DICOM / Three.js.
-- Runtime clínico continua desligado até OD-1D/OD-1E.
