-- 035: status de arquivos + ops ledger + bucket privado STAGING — Phase 10.13
--
-- Bucket: contracts-v2-private-staging
-- SOMENTE staging (project ref allowlisted pelo runner).
-- NÃO criar em produção.
-- NÃO criar bucket local (contracts-v2-private-local).
--
-- Relação com 033:
--   033 permanece LOCAL-ONLY (bucket contracts-v2-private-local).
--   Staging NÃO aplica 033; aplica 035 após 034
--   conforme runner controlado (ordem: 028–032 → 034 → 035).
-- Schema abaixo é idempotente (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- para coexistir com stacks locais que já rodaram 033 e com apply parcial.

-- ===========================================================================
-- Extensão app_contract_files — lifecycle PENDING → STORED → VERIFIED / FAILED
-- ===========================================================================

alter table public.app_contract_files
  add column if not exists status text not null default 'PENDING';

alter table public.app_contract_files
  add column if not exists purpose text null;

alter table public.app_contract_files
  add column if not exists envelope_id uuid null;

alter table public.app_contract_files
  add column if not exists generated_name text null;

alter table public.app_contract_files
  add column if not exists verified_at timestamptz null;

alter table public.app_contract_files
  add column if not exists verification_ok boolean null;

alter table public.app_contract_files
  add column if not exists row_version integer not null default 1;

alter table public.app_contract_files
  drop constraint if exists app_contract_files_status_chk;
alter table public.app_contract_files
  add constraint app_contract_files_status_chk
  check (status in (
    'PENDING', 'GENERATED', 'STORED', 'VERIFIED', 'FAILED', 'QUARANTINED', 'DELETED'
  ));

alter table public.app_contract_files
  drop constraint if exists app_contract_files_row_version_chk;
alter table public.app_contract_files
  add constraint app_contract_files_row_version_chk check (row_version >= 1);

alter table public.app_contract_files
  drop constraint if exists app_contract_files_purpose_chk;
alter table public.app_contract_files
  add constraint app_contract_files_purpose_chk
  check (
    purpose is null
    or purpose in (
      'DOCUMENT_SOURCE', 'DOCUMENT_OUTPUT', 'SIGNATURE_EVIDENCE',
      'AUDIT_EVIDENCE', 'CLINICAL_ATTACHMENT', 'ADMINISTRATIVE_ATTACHMENT'
    )
  );

alter table public.app_contract_files
  drop constraint if exists app_contract_files_envelope_fk;
alter table public.app_contract_files
  add constraint app_contract_files_envelope_fk
  foreign key (tenant_id, envelope_id)
  references public.app_signature_envelopes (tenant_id, id)
  on delete set null
  deferrable initially deferred;

create index if not exists app_contract_files_tenant_status_idx
  on public.app_contract_files (tenant_id, status)
  where deleted_at is null;

create index if not exists app_contract_files_storage_path_idx
  on public.app_contract_files (tenant_id, storage_bucket, storage_path);

-- ===========================================================================
-- app_contract_storage_ops — ledger operacional (não jurídico)
-- ===========================================================================

create table if not exists public.app_contract_storage_ops (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid null,
  file_id uuid null,
  event_type text not null,
  actor_type text not null default 'SYSTEM',
  actor_id text null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint app_contract_storage_ops_event_chk
    check (event_type in (
      'FILE_UPLOAD_STARTED',
      'FILE_UPLOAD_COMPLETED',
      'FILE_UPLOAD_FAILED',
      'FILE_VERIFIED',
      'FILE_DOWNLOAD_AUTHORIZED',
      'FILE_DOWNLOAD_COMPLETED',
      'FILE_DELETE_REQUESTED',
      'FILE_RECONCILIATION_REQUIRED'
    )),
  constraint app_contract_storage_ops_payload_object_chk
    check (jsonb_typeof(payload) = 'object'),
  constraint app_contract_storage_ops_no_sensitive_payload_chk
    check (
      not (
        payload ?| array[
          'token', 'signedUrl', 'signed_url', 'otp', 'plainCode',
          'patientName', 'cpf', 'bytes', 'rawToken'
        ]
      )
    )
);

comment on table public.app_contract_storage_ops is
  'Phase 10.10/10.13 — eventos operacionais de storage; sem bytes/token/signed URL/PII.';

create index if not exists app_contract_storage_ops_tenant_file_idx
  on public.app_contract_storage_ops (tenant_id, file_id, occurred_at desc);
create index if not exists app_contract_storage_ops_tenant_contract_idx
  on public.app_contract_storage_ops (tenant_id, contract_id, occurred_at desc);

alter table public.app_contract_storage_ops enable row level security;
alter table public.app_contract_storage_ops force row level security;
revoke all on table public.app_contract_storage_ops from anon, authenticated;
grant select, insert on table public.app_contract_storage_ops to service_role;

create or replace function public.app_contract_storage_ops_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'APP_CONTRACT_STORAGE_OPS_APPEND_ONLY'
    using errcode = 'integrity_constraint_violation';
end;
$$;

drop trigger if exists trg_app_contract_storage_ops_no_update
  on public.app_contract_storage_ops;
create trigger trg_app_contract_storage_ops_no_update
before update on public.app_contract_storage_ops
for each row execute function public.app_contract_storage_ops_reject_mutation();

drop trigger if exists trg_app_contract_storage_ops_no_delete
  on public.app_contract_storage_ops;
create trigger trg_app_contract_storage_ops_no_delete
before delete on public.app_contract_storage_ops
for each row execute function public.app_contract_storage_ops_reject_mutation();

-- ===========================================================================
-- Path helpers (canônicos)
-- ===========================================================================

create or replace function public.contracts_v2_private_storage_path_valid(object_name text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    coalesce(array_length(storage.foldername(object_name), 1), 0) >= 6
    and lower((storage.foldername(object_name))[1]) = 'tenants'
    and (storage.foldername(object_name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and lower((storage.foldername(object_name))[3]) = 'contracts'
    and (storage.foldername(object_name))[4] ~* '^[a-zA-Z0-9_-]{1,128}$'
    and lower((storage.foldername(object_name))[5]) = 'versions'
    and object_name !~ '\.\.'
    and object_name !~* '^data:'
$$;

create or replace function public.contracts_v2_private_storage_tenant_id(object_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when public.contracts_v2_private_storage_path_valid(object_name)
      then (storage.foldername(object_name))[2]::uuid
    else null::uuid
  end;
$$;

revoke all on function public.contracts_v2_private_storage_path_valid(text) from public;
revoke all on function public.contracts_v2_private_storage_tenant_id(text) from public;
grant execute on function public.contracts_v2_private_storage_path_valid(text) to authenticated, service_role;
grant execute on function public.contracts_v2_private_storage_tenant_id(text) to authenticated, service_role;

-- ===========================================================================
-- Bucket privado STAGING (nunca local, nunca produção)
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contracts-v2-private-staging',
  'contracts-v2-private-staging',
  false,
  20971520,
  array[
    'application/pdf',
    'application/json',
    'image/png',
    'image/webp',
    'image/jpeg',
    'text/plain'
  ]::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = array[
    'application/pdf',
    'application/json',
    'image/png',
    'image/webp',
    'image/jpeg',
    'text/plain'
  ]::text[];

-- Nota: a ausência do bucket local-only (contracts-v2-private-local) é
-- validada pelo runner de staging (JS), não por RAISE aqui, para não
-- quebrar stacks locais que já aplicaram 033.

drop policy if exists contracts_v2_private_staging_select on storage.objects;
drop policy if exists contracts_v2_private_staging_insert on storage.objects;
drop policy if exists contracts_v2_private_staging_update on storage.objects;
drop policy if exists contracts_v2_private_staging_delete on storage.objects;

-- SELECT restrito a membros do tenant + path canônico.
-- INSERT/UPDATE/DELETE authenticated: ausentes (backend/service_role only).
--
-- Membership helper: usa app_user_can_access_tenant(text), o mesmo helper
-- consolidado pelas policies da migration 029 — já presente no staging.
-- NÃO chamar app_user_has_active_tenant_membership: helper da 026, fora do
-- pipeline Contracts V2 de staging.
create policy contracts_v2_private_staging_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'contracts-v2-private-staging'
    and auth.uid() is not null
    and public.contracts_v2_private_storage_path_valid(name)
    and public.contracts_v2_private_storage_tenant_id(name) is not null
    and public.app_user_can_access_tenant(
      public.contracts_v2_private_storage_tenant_id(name)::text
    )
  );
