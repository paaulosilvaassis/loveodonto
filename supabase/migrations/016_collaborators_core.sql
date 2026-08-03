-- 016: Núcleo de colaboradores (RH) — fonte oficial Supabase, UUID nativo.
-- Não inclui RLS (migration 019). Não inclui satélites RH (Fase 2).
--
-- ROLLBACK (manual — ordem):
--   drop trigger if exists trg_collaborators_touch_updated_at on public.collaborators;
--   drop function if exists public.validate_collaborators_row();
--   drop table if exists public.collaborators cascade;
--
-- Pré-requisito: public.tenants, public.touch_updated_at() (005).

create table if not exists public.collaborators (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  -- Mapeamento temporário col-* / col-saas-* (IndexedDB legado)
  legacy_id text null,

  status text not null default 'ativo',
  apelido text not null,
  nome_completo text not null,
  nome_social text null,
  sexo text null,
  data_nascimento date null,
  email text null,

  -- URL Storage ou HTTPS — nunca data URI (base64)
  foto_url text null,

  rh_categoria text not null,
  cargo text not null,
  rh_funcao_descricao text null,
  tipo_vinculo text not null,
  setor text not null,
  especialidades text[] not null default '{}'::text[],
  registro_profissional text null,
  conselho_nome text null,
  conselho_uf char(2) null,

  -- Profissional de agenda (override; default calculado na app)
  agenda_enabled boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  updated_by uuid null,
  deleted_at timestamptz null,

  constraint collaborators_status_chk
    check (status in ('ativo', 'inativo')),

  constraint collaborators_foto_url_no_data_uri_chk
    check (foto_url is null or foto_url !~* '^data:'),

  constraint collaborators_email_normalized_chk
    check (email is null or email = lower(trim(email)))
);

comment on table public.collaborators is
  'Cadastro RH oficial por tenant. IndexedDB é cache derivado.';
comment on column public.collaborators.legacy_id is
  'ID legado IndexedDB (col-*, col-saas-*). Remover após cutover completo.';
comment on column public.collaborators.foto_url is
  'URL Supabase Storage ou HTTPS. Proibido base64/data URI.';

create index if not exists collaborators_tenant_id_idx
  on public.collaborators (tenant_id)
  where deleted_at is null;

create index if not exists collaborators_tenant_status_idx
  on public.collaborators (tenant_id, status)
  where deleted_at is null;

create index if not exists collaborators_tenant_agenda_idx
  on public.collaborators (tenant_id, agenda_enabled)
  where deleted_at is null and status = 'ativo';

create unique index if not exists collaborators_tenant_legacy_id_uq
  on public.collaborators (tenant_id, legacy_id)
  where legacy_id is not null and deleted_at is null;

create unique index if not exists collaborators_tenant_email_uq
  on public.collaborators (tenant_id, lower(email))
  where email is not null and deleted_at is null;

create unique index if not exists collaborators_tenant_registro_uq
  on public.collaborators (tenant_id, upper(registro_profissional))
  where registro_profissional is not null and deleted_at is null;

-- Validações de linha (tenant_id imutável após insert)
create or replace function public.validate_collaborators_row()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'collaborators.tenant_id é imutável (id=%)', old.id
      using errcode = '23514';
  end if;

  new.apelido := nullif(trim(new.apelido), '');
  new.nome_completo := nullif(trim(new.nome_completo), '');
  new.email := nullif(lower(trim(new.email)), '');
  new.legacy_id := nullif(trim(new.legacy_id), '');
  new.conselho_uf := nullif(upper(trim(new.conselho_uf)), '');
  new.registro_profissional := nullif(trim(new.registro_profissional), '');
  new.updated_at := now();

  if new.apelido is null or new.nome_completo is null then
    raise exception 'apelido e nome_completo são obrigatórios'
      using errcode = '23514';
  end if;

  if new.foto_url is not null and new.foto_url ~* '^data:' then
    raise exception 'foto_url não pode ser data URI / base64'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_collaborators_validate on public.collaborators;
create trigger trg_collaborators_validate
before insert or update on public.collaborators
for each row execute function public.validate_collaborators_row();

drop trigger if exists trg_collaborators_touch_updated_at on public.collaborators;
create trigger trg_collaborators_touch_updated_at
before update on public.collaborators
for each row execute function public.touch_updated_at();

-- RLS habilitado aqui; policies na migration 019
alter table public.collaborators enable row level security;

-- Bloqueia acesso até policies (019). service_role bypassa RLS.
revoke all on table public.collaborators from anon, authenticated;
grant select, insert, update, delete on table public.collaborators to authenticated;
