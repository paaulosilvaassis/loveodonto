/**
 * @module repositories/collaborator/collaboratorMapper
 * @description Mapper bidirecional entre shapes Supabase, IndexedDB e canônico V3.
 *
 * **Ticket:** Sprint 1A — 1.1 Foundation · 1.2 Mapper + validação
 * **Status:** Funções puras implementadas; sem wiring em services.
 */

import type {
  CollaboratorCore,
  CollaboratorCreateCoreDto,
  CollaboratorIndexedDbRow,
  CollaboratorIndexedDbUpsertDto,
  CollaboratorSupabaseRow,
  CollaboratorSupabaseUpsertDto,
  CollaboratorUpdateCoreDto,
} from './collaboratorTypes.js';
import { CollaboratorRepositoryNotImplementedError } from './collaboratorTypes.js';
import { isAgendaProfessional } from '../../constants/collaboratorRhCatalog.js';

// ---------------------------------------------------------------------------
// Validação (INV-RH-01, migration 016 foto_url)
// ---------------------------------------------------------------------------

const FORBIDDEN_TENANT_IDS = new Set(['tenant-1', 'tenant_1']);

type AgendaEnabledSource = {
  agendaEnabled?: boolean;
  agenda_enabled?: boolean;
  rhCategoria?: string;
  rh_categoria?: string;
  cargo?: string;
};

/**
 * Regra oficial `agenda_enabled` (IDB mapper, shadow read e backfill Supabase).
 *
 * 1. Valor explícito em `agendaEnabled` / `agenda_enabled` no row → respeitar.
 * 2. Caso contrário → `isAgendaProfessional({ rhCategoria, cargo })`:
 *    - `true` quando `rhCategoria === 'Corpo Clínico'`, ou
 *    - cargo compatível com profissional de agenda clínica (dentista, implant, etc.).
 * 3. Demais perfis (administrativo, recepção, financeiro) → `false`.
 */
export function resolveCollaboratorAgendaEnabled(row: AgendaEnabledSource): boolean {
  if (typeof row.agendaEnabled === 'boolean') return row.agendaEnabled;
  if (typeof row.agenda_enabled === 'boolean') return row.agenda_enabled;
  return isAgendaProfessional({
    rhCategoria: String(row.rhCategoria ?? row.rh_categoria ?? '').trim(),
    cargo: String(row.cargo ?? '').trim(),
  });
}

/** Erro de validação de mapper — tenant ausente, base64, etc. */
export class CollaboratorMapperValidationError extends Error {
  readonly code = 'COLLABORATOR_MAPPER_VALIDATION';

  constructor(message: string) {
    super(message);
    this.name = 'CollaboratorMapperValidationError';
  }
}

/**
 * Exige tenant_id válido — proíbe fallback `tenant-1` (DB-IDB / QA).
 * @throws {CollaboratorMapperValidationError}
 */
export function assertValidTenantId(tenantId: string | null | undefined): string {
  const normalized = String(tenantId ?? '').trim();
  if (!normalized) {
    throw new CollaboratorMapperValidationError('tenant_id é obrigatório.');
  }
  if (FORBIDDEN_TENANT_IDS.has(normalized.toLowerCase())) {
    throw new CollaboratorMapperValidationError(
      `tenant_id proibido (fallback legado): ${normalized}`,
    );
  }
  return normalized;
}

/**
 * @throws {CollaboratorMapperValidationError}
 */
export function assertValidFotoUrl(fotoUrl: string | null | undefined): void {
  const value = String(fotoUrl ?? '').trim();
  if (!value) return;
  if (/^data:/i.test(value)) {
    throw new CollaboratorMapperValidationError(
      'foto_url não pode ser base64 (data URI) — use Storage HTTPS.',
    );
  }
}

// ---------------------------------------------------------------------------
// Supabase ↔ Canonical
// ---------------------------------------------------------------------------

export function mapSupabaseRowToCore(row: CollaboratorSupabaseRow): CollaboratorCore {
  const tenantId = assertValidTenantId(row.tenant_id);
  assertValidFotoUrl(row.foto_url);

  return {
    uuid: row.id,
    legacyId: String(row.legacy_id ?? row.id).trim(),
    tenantId,
    status: row.status,
    apelido: row.apelido,
    nomeCompleto: row.nome_completo,
    nomeSocial: row.nome_social,
    sexo: row.sexo,
    dataNascimento: row.data_nascimento,
    email: row.email,
    fotoUrl: row.foto_url,
    rhCategoria: row.rh_categoria,
    cargo: row.cargo,
    rhFuncaoDescricao: row.rh_funcao_descricao,
    tipoVinculo: row.tipo_vinculo,
    setor: row.setor,
    especialidades: Array.isArray(row.especialidades) ? [...row.especialidades] : [],
    registroProfissional: row.registro_profissional,
    conselhoNome: row.conselho_nome,
    conselhoUf: row.conselho_uf,
    agendaEnabled: Boolean(row.agenda_enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function mapCoreToSupabaseUpsert(core: CollaboratorCore): CollaboratorSupabaseUpsertDto {
  const tenant_id = assertValidTenantId(core.tenantId);
  assertValidFotoUrl(core.fotoUrl);

  return {
    tenant_id,
    legacy_id: core.legacyId,
    status: core.status,
    apelido: core.apelido,
    nome_completo: core.nomeCompleto,
    nome_social: core.nomeSocial,
    sexo: core.sexo,
    data_nascimento: core.dataNascimento,
    email: core.email,
    foto_url: core.fotoUrl,
    rh_categoria: core.rhCategoria,
    cargo: core.cargo,
    rh_funcao_descricao: core.rhFuncaoDescricao,
    tipo_vinculo: core.tipoVinculo,
    setor: core.setor,
    especialidades: core.especialidades,
    registro_profissional: core.registroProfissional,
    conselho_nome: core.conselhoNome,
    conselho_uf: core.conselhoUf,
    agenda_enabled: core.agendaEnabled,
    updated_at: core.updatedAt,
    deleted_at: core.deletedAt,
  };
}

export function mapCreateDtoToSupabaseUpsert(
  tenantId: string,
  dto: CollaboratorCreateCoreDto,
): CollaboratorSupabaseUpsertDto {
  const tenant_id = assertValidTenantId(tenantId);
  assertValidFotoUrl(dto.fotoUrl);

  return {
    tenant_id,
    legacy_id: dto.legacyId ?? null,
    status: dto.status ?? 'ativo',
    apelido: dto.apelido,
    nome_completo: dto.nomeCompleto,
    nome_social: dto.nomeSocial ?? null,
    sexo: dto.sexo ?? null,
    data_nascimento: dto.dataNascimento ?? null,
    email: dto.email ?? null,
    foto_url: dto.fotoUrl ?? null,
    rh_categoria: dto.rhCategoria,
    cargo: dto.cargo,
    rh_funcao_descricao: dto.rhFuncaoDescricao ?? null,
    tipo_vinculo: dto.tipoVinculo,
    setor: dto.setor,
    especialidades: dto.especialidades ?? [],
    registro_profissional: dto.registroProfissional ?? null,
    conselho_nome: dto.conselhoNome ?? null,
    conselho_uf: dto.conselhoUf ?? null,
    agenda_enabled: dto.agendaEnabled ?? false,
  };
}

export function mapUpdateDtoToSupabaseUpsert(
  existing: CollaboratorCore,
  dto: CollaboratorUpdateCoreDto,
): CollaboratorSupabaseUpsertDto {
  const merged: CollaboratorCore = {
    ...existing,
    apelido: dto.apelido ?? existing.apelido,
    nomeCompleto: dto.nomeCompleto ?? existing.nomeCompleto,
    nomeSocial: dto.nomeSocial !== undefined ? dto.nomeSocial : existing.nomeSocial,
    sexo: dto.sexo !== undefined ? dto.sexo : existing.sexo,
    dataNascimento: dto.dataNascimento !== undefined ? dto.dataNascimento : existing.dataNascimento,
    email: dto.email !== undefined ? dto.email : existing.email,
    fotoUrl: dto.fotoUrl !== undefined ? dto.fotoUrl : existing.fotoUrl,
    rhCategoria: dto.rhCategoria ?? existing.rhCategoria,
    cargo: dto.cargo ?? existing.cargo,
    rhFuncaoDescricao:
      dto.rhFuncaoDescricao !== undefined ? dto.rhFuncaoDescricao : existing.rhFuncaoDescricao,
    tipoVinculo: dto.tipoVinculo ?? existing.tipoVinculo,
    setor: dto.setor ?? existing.setor,
    especialidades: dto.especialidades ?? existing.especialidades,
    registroProfissional:
      dto.registroProfissional !== undefined ? dto.registroProfissional : existing.registroProfissional,
    conselhoNome: dto.conselhoNome !== undefined ? dto.conselhoNome : existing.conselhoNome,
    conselhoUf: dto.conselhoUf !== undefined ? dto.conselhoUf : existing.conselhoUf,
    agendaEnabled: dto.agendaEnabled ?? existing.agendaEnabled,
    status: dto.status ?? existing.status,
    legacyId: dto.legacyId ?? existing.legacyId,
  };
  return mapCoreToSupabaseUpsert(merged);
}

// ---------------------------------------------------------------------------
// IndexedDB ↔ Canonical
// ---------------------------------------------------------------------------

export function mapIndexedDbRowToCore(row: CollaboratorIndexedDbRow): CollaboratorCore {
  const tenantId = assertValidTenantId(row.tenant_id);
  assertValidFotoUrl(row.fotoUrl);

  const legacyId = String(row.id ?? '').trim();
  const uuid = String(row.uuid ?? '').trim() || legacyId;

  return {
    uuid,
    legacyId,
    tenantId,
    status: row.status ?? 'ativo',
    apelido: row.apelido ?? '',
    nomeCompleto: row.nomeCompleto ?? '',
    nomeSocial: row.nomeSocial ?? null,
    sexo: row.sexo ?? null,
    dataNascimento: row.dataNascimento ?? null,
    email: row.email ?? null,
    fotoUrl: row.fotoUrl ?? null,
    rhCategoria: row.rhCategoria ?? '',
    cargo: row.cargo ?? '',
    rhFuncaoDescricao: row.rhFuncaoDescricao ?? null,
    tipoVinculo: row.tipoVinculo ?? '',
    setor: row.setor ?? '',
    especialidades: Array.isArray(row.especialidades) ? [...row.especialidades] : [],
    registroProfissional: row.registroProfissional ?? null,
    conselhoNome: row.conselhoNome ?? null,
    conselhoUf: row.conselhoUf ?? null,
    agendaEnabled: resolveCollaboratorAgendaEnabled(row),
    createdAt: row.createdAt ?? '',
    updatedAt: row.updatedAt ?? '',
    deletedAt: null,
  };
}

export function mapCoreToIndexedDbMirror(core: CollaboratorCore): CollaboratorIndexedDbUpsertDto {
  assertValidTenantId(core.tenantId);
  assertValidFotoUrl(core.fotoUrl);

  return {
    id: core.legacyId,
    uuid: core.uuid,
    tenant_id: core.tenantId,
    status: core.status,
    apelido: core.apelido,
    nomeCompleto: core.nomeCompleto,
    nomeSocial: core.nomeSocial ?? undefined,
    sexo: core.sexo ?? undefined,
    dataNascimento: core.dataNascimento ?? undefined,
    email: core.email ?? undefined,
    fotoUrl: core.fotoUrl ?? undefined,
    rhCategoria: core.rhCategoria,
    cargo: core.cargo,
    rhFuncaoDescricao: core.rhFuncaoDescricao ?? undefined,
    tipoVinculo: core.tipoVinculo,
    setor: core.setor,
    especialidades: core.especialidades,
    registroProfissional: core.registroProfissional ?? undefined,
    conselhoNome: core.conselhoNome ?? undefined,
    conselhoUf: core.conselhoUf ?? undefined,
    createdAt: core.createdAt,
    updatedAt: core.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Legacy UI adapter
// ---------------------------------------------------------------------------

export type LegacyCollaboratorShape = CollaboratorIndexedDbRow & {
  id: string;
};

export function toLegacyCollaboratorShape(core: CollaboratorCore): LegacyCollaboratorShape {
  const mirror = mapCoreToIndexedDbMirror(core);
  return {
    ...mirror,
    id: core.legacyId,
  };
}

// ---------------------------------------------------------------------------
// Identificadores
// ---------------------------------------------------------------------------

export function isCollaboratorUuid(ref: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(ref || '').trim(),
  );
}

export function isCollaboratorLegacyId(ref: string): boolean {
  return /^col(-saas)?-/i.test(String(ref || '').trim());
}

export function generateLegacyId(): string {
  throw new CollaboratorRepositoryNotImplementedError('generateLegacyId');
}
