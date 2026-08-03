-- 020: public.appointments — schema SSOT Agenda (Admin API Phase 5.8/5.9)
-- NÃO EXECUTAR automaticamente. Dry-run local somente sob autorização.
--
-- Compatível com:
--   server/lib/appointmentsApiList.js (APPOINTMENTS_LIST_SELECT)
--   server/lib/appointmentsApiWrite.js (APPOINTMENT_WRITE_SELECT / insert/update)
--
-- ROLLBACK (manual):
--   drop trigger if exists trg_appointments_touch_updated_at on public.appointments;
--   drop table if exists public.appointments cascade;
--
-- Pré-requisitos: public.tenants, public.touch_updated_at() (005).
-- Sem FK rígida para patients/rooms/collaborators (ainda legados / IDB) —
-- refs são text/uuid opacos até Phase 9.x de cutover de patients.

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  -- ID legado IndexedDB / contratos Admin API (obrigatório na escrita)
  legacy_id text not null,

  patient_id text null,
  lead_id text null,
  professional_id text null,
  room_id text null,

  date date not null,
  start_time text not null,
  end_time text not null,
  duration_minutes integer not null default 0,
  slot_capacity smallint not null default 1,

  status text not null default 'agendado',
  procedure_name text not null default '',
  channel text not null default '',
  notes text not null default '',
  insurance text not null default '',
  is_return boolean not null default false,
  cancel_reason text null,

  check_in_at timestamptz null,
  finished_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  deleted_at timestamptz null,

  constraint appointments_slot_capacity_chk
    check (slot_capacity in (1, 2)),

  constraint appointments_duration_chk
    check (duration_minutes >= 0),

  constraint appointments_status_chk
    check (status in (
      'agendado', 'confirmado', 'em_confirmacao', 'chegou', 'em_espera',
      'chamado', 'em_atendimento', 'finalizado', 'atendido', 'atrasado',
      'faltou', 'cancelado', 'reagendar'
    )),

  constraint appointments_legacy_id_nonempty_chk
    check (length(trim(legacy_id)) > 0),

  constraint appointments_no_tenant_one_chk
    check (tenant_id::text not in ('tenant-1', 'tenant_1'))
);

comment on table public.appointments is
  'Agendamentos core SSOT. IndexedDB é cache até cutover Primary. Sem FK patients/rooms nesta phase.';
comment on column public.appointments.legacy_id is
  'ID legado IndexedDB (appt-*). Obrigatório para dual-write Admin API.';
comment on column public.appointments.patient_id is
  'Referência opaca ao patient legado até tabela patients oficial.';

create unique index if not exists appointments_tenant_legacy_id_uq
  on public.appointments (tenant_id, legacy_id)
  where deleted_at is null;

create index if not exists appointments_tenant_date_idx
  on public.appointments (tenant_id, date)
  where deleted_at is null;

create index if not exists appointments_tenant_professional_date_idx
  on public.appointments (tenant_id, professional_id, date)
  where deleted_at is null and professional_id is not null;

create index if not exists appointments_tenant_status_idx
  on public.appointments (tenant_id, status)
  where deleted_at is null;

create index if not exists appointments_tenant_patient_idx
  on public.appointments (tenant_id, patient_id)
  where deleted_at is null and patient_id is not null;

create index if not exists appointments_tenant_updated_at_idx
  on public.appointments (tenant_id, updated_at desc)
  where deleted_at is null;

drop trigger if exists trg_appointments_touch_updated_at on public.appointments;
create trigger trg_appointments_touch_updated_at
  before update on public.appointments
  for each row execute function public.touch_updated_at();
