-- =============================================================================
-- 036: Package Cryptographic Manifest foundation — Phase 10.21T (OPTION_C)
-- =============================================================================
-- STATUS: AUTHORIZED for LOCAL + STAGING apply (PHASE_10.21U).
-- DO NOT APPLY to production (uoepkwhqztmsjnzirpev) until explicit human
-- authorization for PRODUCTION migration preparation.
--
-- SECURITY CLEARANCE: CLEARED (SECURITY_01 + SECURITY_02 CLOSED).
-- Production lacks Contracts V2 foundation tables → 036 blocked there.
--
-- Additive / backward compatible:
--   - New tables only + nullable columns on app_signature_envelopes
--   - Existing envelopes remain valid with package_manifest_id IS NULL
--   - No rewrite of historical evidence
--
-- ROLLBACK (manual, empty tables only):
--   alter table public.app_signature_envelopes
--     drop constraint if exists app_signature_envelopes_package_manifest_fk;
--   alter table public.app_signature_envelopes
--     drop column if exists package_manifest_hash;
--   alter table public.app_signature_envelopes
--     drop column if exists package_manifest_id;
--   drop table if exists public.app_package_document_acceptances;
--   drop table if exists public.app_package_manifest_documents;
--   drop table if exists public.app_package_manifests;
--   drop function if exists public.app_package_manifest_reject_frozen_mutation();
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers: imutabilidade pós-freeze
-- ---------------------------------------------------------------------------

create or replace function public.app_package_manifest_reject_frozen_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('FROZEN', 'SIGNING', 'SIGNED') then
      raise exception 'APP_PACKAGE_MANIFEST_IMMUTABLE: cannot delete manifest in status %', old.status
        using errcode = 'integrity_constraint_violation';
    end if;
    return old;
  end if;

  if old.status in ('FROZEN', 'SIGNING', 'SIGNED') then
    -- Permite apenas transições de lifecycle estreitas (status + timestamps)
    if new.tenant_id is distinct from old.tenant_id
      or new.source_package_key is distinct from old.source_package_key
      or new.manifest_version is distinct from old.manifest_version
      or new.canonicalization_version is distinct from old.canonicalization_version
      or new.manifest_hash is distinct from old.manifest_hash
      or new.primary_contract_id is distinct from old.primary_contract_id
      or new.primary_contract_version_id is distinct from old.primary_contract_version_id
      or new.package_id is distinct from old.package_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
      or new.idempotency_key is distinct from old.idempotency_key
    then
      raise exception 'APP_PACKAGE_MANIFEST_IMMUTABLE: frozen/signing/signed manifest fields cannot change'
        using errcode = 'integrity_constraint_violation';
    end if;

    if new.status is distinct from old.status
      and not (
        (old.status = 'FROZEN' and new.status in ('SIGNING', 'SUPERSEDED', 'CANCELLED'))
        or (old.status = 'SIGNING' and new.status in ('SIGNED', 'SUPERSEDED', 'CANCELLED'))
      )
    then
      raise exception 'APP_PACKAGE_MANIFEST_INVALID_STATUS_TRANSITION: % → %', old.status, new.status
        using errcode = 'integrity_constraint_violation';
    end if;
  end if;

  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'APP_PACKAGE_MANIFEST_TENANT_IMMUTABLE'
      using errcode = 'integrity_constraint_violation';
  end if;

  return new;
end;
$$;

comment on function public.app_package_manifest_reject_frozen_mutation() is
  'Phase 10.21T — bloqueia mutação de campos criptográficos após FROZEN; lifecycle estreito.';

create or replace function public.app_package_manifest_document_reject_mutation_when_frozen()
returns trigger
language plpgsql
as $$
declare
  manifest_status text;
begin
  select m.status into manifest_status
  from public.app_package_manifests m
  where m.tenant_id = coalesce(new.tenant_id, old.tenant_id)
    and m.id = coalesce(new.manifest_id, old.manifest_id);

  if manifest_status in ('FROZEN', 'SIGNING', 'SIGNED') then
    raise exception 'APP_PACKAGE_MANIFEST_DOCUMENT_IMMUTABLE: documents locked when manifest is %', manifest_status
      using errcode = 'integrity_constraint_violation';
  end if;

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- app_package_manifests
-- ---------------------------------------------------------------------------

create table if not exists public.app_package_manifests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  package_id uuid null,
  source_package_key text not null,
  manifest_version integer not null default 1,
  status text not null default 'DRAFT',

  canonicalization_version text not null default 'pkg_manifest_v1',
  manifest_hash text null,

  primary_contract_id uuid not null,
  primary_contract_version_id uuid not null,

  created_by uuid not null,
  created_at timestamptz not null default now(),
  frozen_at timestamptz null,
  frozen_by uuid null,

  row_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text null,

  constraint app_package_manifests_tenant_id_uidx unique (tenant_id, id),
  constraint app_package_manifests_idempotency_uq unique (tenant_id, idempotency_key),
  constraint app_package_manifests_source_version_uq
    unique (tenant_id, source_package_key, manifest_version),
  constraint app_package_manifests_row_version_chk check (row_version >= 1),
  constraint app_package_manifests_version_chk check (manifest_version >= 1),
  constraint app_package_manifests_source_key_nonempty_chk
    check (length(trim(source_package_key)) > 0),
  constraint app_package_manifests_canon_nonempty_chk
    check (length(trim(canonicalization_version)) > 0),
  constraint app_package_manifests_status_chk
    check (status in ('DRAFT', 'FROZEN', 'SIGNING', 'SIGNED', 'SUPERSEDED', 'CANCELLED')),
  constraint app_package_manifests_hash_fmt_chk
    check (manifest_hash is null or manifest_hash ~ '^[a-f0-9]{64}$'),
  constraint app_package_manifests_frozen_consistency_chk
    check (
      (status = 'DRAFT' and manifest_hash is null and frozen_at is null)
      or (status in ('FROZEN', 'SIGNING', 'SIGNED')
          and manifest_hash is not null and frozen_at is not null)
      or (status in ('SUPERSEDED', 'CANCELLED'))
    ),
  constraint app_package_manifests_package_fk
    foreign key (tenant_id, package_id)
    references public.app_contract_packages (tenant_id, id)
    on delete set null,
  constraint app_package_manifests_contract_fk
    foreign key (tenant_id, primary_contract_id)
    references public.app_contracts (tenant_id, id)
    on delete restrict,
  constraint app_package_manifests_version_fk
    foreign key (tenant_id, primary_contract_version_id)
    references public.app_contract_versions (tenant_id, id)
    on delete restrict
);

comment on table public.app_package_manifests is
  'Phase 10.21T OPTION_C — manifesto criptográfico imutável do package (NÃO APLICAR até autorização).';

create index if not exists app_package_manifests_tenant_status_idx
  on public.app_package_manifests (tenant_id, status);
create index if not exists app_package_manifests_tenant_package_idx
  on public.app_package_manifests (tenant_id, package_id)
  where package_id is not null;
create index if not exists app_package_manifests_tenant_contract_idx
  on public.app_package_manifests (tenant_id, primary_contract_id);

drop trigger if exists trg_app_package_manifests_tenant_immutable
  on public.app_package_manifests;
create trigger trg_app_package_manifests_tenant_immutable
before update on public.app_package_manifests
for each row execute function public.app_contract_reject_tenant_id_change();

drop trigger if exists trg_app_package_manifests_frozen_guard
  on public.app_package_manifests;
create trigger trg_app_package_manifests_frozen_guard
before update or delete on public.app_package_manifests
for each row execute function public.app_package_manifest_reject_frozen_mutation();

-- ---------------------------------------------------------------------------
-- app_package_manifest_documents
-- ---------------------------------------------------------------------------

create table if not exists public.app_package_manifest_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  manifest_id uuid not null,

  document_key text not null,
  document_type text not null,
  source_kind text not null,
  source_id text not null,
  document_version text not null,
  title text not null,
  required boolean not null default true,
  display_order integer not null,

  content_mime_type text not null,
  content_hash text not null,
  content_hash_encoding text not null default 'utf8_canonical_v1',

  snapshot_storage_provider text null,
  snapshot_storage_bucket text null,
  snapshot_storage_path text null,

  acceptance_code text null,
  acceptance_label text null,

  created_at timestamptz not null default now(),

  constraint app_package_manifest_documents_tenant_id_uidx unique (tenant_id, id),
  constraint app_package_manifest_documents_key_uq unique (tenant_id, manifest_id, document_key),
  constraint app_package_manifest_documents_order_uq unique (tenant_id, manifest_id, display_order),
  constraint app_package_manifest_documents_order_chk check (display_order >= 1),
  constraint app_package_manifest_documents_key_nonempty_chk
    check (length(trim(document_key)) > 0),
  constraint app_package_manifest_documents_title_nonempty_chk
    check (length(trim(title)) > 0),
  constraint app_package_manifest_documents_hash_fmt_chk
    check (content_hash ~ '^[a-f0-9]{64}$'),
  constraint app_package_manifest_documents_encoding_chk
    check (content_hash_encoding in ('utf8_canonical_v1', 'binary_sha256_v1')),
  constraint app_package_manifest_documents_source_kind_chk
    check (source_kind in (
      'CONTRACT_VERSION', 'DOCUMENT_RECORD', 'CLINIC_POLICY', 'INLINE_SNAPSHOT'
    )),
  constraint app_package_manifest_documents_no_data_uri_chk
    check (
      snapshot_storage_path is null
      or snapshot_storage_path !~* '^data:'
    ),
  constraint app_package_manifest_documents_manifest_fk
    foreign key (tenant_id, manifest_id)
    references public.app_package_manifests (tenant_id, id)
    on delete cascade
);

comment on table public.app_package_manifest_documents is
  'Phase 10.21T — documentos frozen do manifesto; content_hash do conteúdo apresentado.';

create index if not exists app_package_manifest_documents_tenant_manifest_idx
  on public.app_package_manifest_documents (tenant_id, manifest_id);

drop trigger if exists trg_app_package_manifest_documents_tenant_immutable
  on public.app_package_manifest_documents;
create trigger trg_app_package_manifest_documents_tenant_immutable
before update on public.app_package_manifest_documents
for each row execute function public.app_contract_reject_tenant_id_change();

drop trigger if exists trg_app_package_manifest_documents_frozen_guard
  on public.app_package_manifest_documents;
create trigger trg_app_package_manifest_documents_frozen_guard
before insert or update or delete on public.app_package_manifest_documents
for each row execute function public.app_package_manifest_document_reject_mutation_when_frozen();

-- ---------------------------------------------------------------------------
-- app_package_document_acceptances
-- ---------------------------------------------------------------------------

create table if not exists public.app_package_document_acceptances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  manifest_id uuid not null,
  manifest_document_id uuid not null,
  envelope_id uuid not null,
  signer_id uuid not null,

  document_key text not null,
  content_hash text not null,
  acceptance_version text not null default 'accept_v1',

  viewed_at timestamptz null,
  accepted_at timestamptz null,
  created_at timestamptz not null default now(),

  constraint app_package_document_acceptances_tenant_id_uidx unique (tenant_id, id),
  constraint app_package_document_acceptances_signer_doc_uq
    unique (tenant_id, signer_id, manifest_document_id),
  constraint app_package_document_acceptances_hash_fmt_chk
    check (content_hash ~ '^[a-f0-9]{64}$'),
  constraint app_package_document_acceptances_key_nonempty_chk
    check (length(trim(document_key)) > 0),
  constraint app_package_document_acceptances_manifest_fk
    foreign key (tenant_id, manifest_id)
    references public.app_package_manifests (tenant_id, id)
    on delete cascade,
  constraint app_package_document_acceptances_document_fk
    foreign key (tenant_id, manifest_document_id)
    references public.app_package_manifest_documents (tenant_id, id)
    on delete restrict,
  constraint app_package_document_acceptances_envelope_fk
    foreign key (tenant_id, envelope_id)
    references public.app_signature_envelopes (tenant_id, id)
    on delete cascade,
  constraint app_package_document_acceptances_signer_fk
    foreign key (tenant_id, signer_id)
    references public.app_signature_signers (tenant_id, id)
    on delete cascade
);

comment on table public.app_package_document_acceptances is
  'Phase 10.21T — aceite individual por documento do manifesto (por signer).';

create index if not exists app_package_document_acceptances_tenant_envelope_idx
  on public.app_package_document_acceptances (tenant_id, envelope_id);
create index if not exists app_package_document_acceptances_tenant_signer_idx
  on public.app_package_document_acceptances (tenant_id, signer_id);

drop trigger if exists trg_app_package_document_acceptances_tenant_immutable
  on public.app_package_document_acceptances;
create trigger trg_app_package_document_acceptances_tenant_immutable
before update on public.app_package_document_acceptances
for each row execute function public.app_contract_reject_tenant_id_change();

-- ---------------------------------------------------------------------------
-- Envelope integration (nullable — legacy safe)
-- ---------------------------------------------------------------------------

alter table public.app_signature_envelopes
  add column if not exists package_manifest_id uuid null;

alter table public.app_signature_envelopes
  add column if not exists package_manifest_hash text null;

alter table public.app_signature_envelopes
  drop constraint if exists app_signature_envelopes_package_manifest_hash_fmt_chk;
alter table public.app_signature_envelopes
  add constraint app_signature_envelopes_package_manifest_hash_fmt_chk
  check (
    package_manifest_hash is null
    or package_manifest_hash ~ '^[a-f0-9]{64}$'
  );

alter table public.app_signature_envelopes
  drop constraint if exists app_signature_envelopes_package_manifest_pair_chk;
alter table public.app_signature_envelopes
  add constraint app_signature_envelopes_package_manifest_pair_chk
  check (
    (package_manifest_id is null and package_manifest_hash is null)
    or (package_manifest_id is not null and package_manifest_hash is not null)
  );

alter table public.app_signature_envelopes
  drop constraint if exists app_signature_envelopes_package_manifest_fk;
alter table public.app_signature_envelopes
  add constraint app_signature_envelopes_package_manifest_fk
  foreign key (tenant_id, package_manifest_id)
  references public.app_package_manifests (tenant_id, id)
  on delete restrict;

create index if not exists app_signature_envelopes_tenant_manifest_idx
  on public.app_signature_envelopes (tenant_id, package_manifest_id)
  where package_manifest_id is not null;

-- ---------------------------------------------------------------------------
-- RLS — deny-by-default (backend service_role), alinhado a sessions 032
-- Sensitive signing evidence path: sem policies authenticated/anon.
-- Tenant isolation enforced in API + composite FKs.
-- NOTE: Do not alter existing RLS on app_signature_envelopes / packages here
-- beyond new columns (inherits table RLS). PHASE_SECURITY_01 must clear
-- related advisors before APPLY.
-- ---------------------------------------------------------------------------

alter table public.app_package_manifests enable row level security;
alter table public.app_package_manifest_documents enable row level security;
alter table public.app_package_document_acceptances enable row level security;

revoke all on table public.app_package_manifests from anon, authenticated;
revoke all on table public.app_package_manifest_documents from anon, authenticated;
revoke all on table public.app_package_document_acceptances from anon, authenticated;

-- Nenhuma policy para authenticated/anon → deny by default sob RLS.
-- service_role bypassa RLS (Admin API / public signing backend).

grant select, insert, update, delete on public.app_package_manifests to service_role;
grant select, insert, update, delete on public.app_package_manifest_documents to service_role;
grant select, insert, update, delete on public.app_package_document_acceptances to service_role;
