/**
 * @module repositories/collaborator/collaboratorTypes
 * @description Tipos, DTOs e contratos da camada Repository RH (Love Odonto V3).
 *
 * **Ticket:** Sprint 1A — 1.1 Foundation
 * **Status:** Scaffold — sem implementação runtime consumida pelo app.
 *
 * **Responsabilidade:**
 * - Definir o shape canônico V3 (`CollaboratorCore`)
 * - DTOs de transporte Supabase (snake_case) e IndexedDB (camelCase legado)
 * - Contratos de leitura/escrita, filtros, resultados e erros
 *
 * **Dependências previstas (implementação futura):**
 * - Nenhuma runtime neste arquivo (types only)
 * - Referência normativa: migration `016_collaborators_core.sql`, RH_V3_BLUEPRINT.md
 */

// ---------------------------------------------------------------------------
// Status e identificadores
// ---------------------------------------------------------------------------

/** Status operacional do colaborador (DB-RH + IDB legado). */
export type CollaboratorStatus = 'ativo' | 'inativo';

/**
 * Referência polimórfica a um colaborador.
 * Aceita UUID Supabase, legacy_id (`col-*`, `col-saas-*`) ou id IDB legado.
 */
export type CollaboratorRef = string;

// ---------------------------------------------------------------------------
// Shape canônico V3 (facade pública)
// ---------------------------------------------------------------------------

/**
 * Representação normalizada da ficha RH **core** — único shape exposto pela facade.
 * Satélites (documents, phones, finance…) ficam fora do escopo Sprint 1A.
 */
export interface CollaboratorCore {
  /** PK Supabase `collaborators.id`. */
  uuid: string;
  /** Mapeamento legado `col-*` / `col-saas-*` — imutável após criação (INV-RH-03). */
  legacyId: string;
  tenantId: string;
  status: CollaboratorStatus;
  apelido: string;
  nomeCompleto: string;
  nomeSocial: string | null;
  sexo: string | null;
  dataNascimento: string | null;
  email: string | null;
  fotoUrl: string | null;
  rhCategoria: string;
  cargo: string;
  rhFuncaoDescricao: string | null;
  tipoVinculo: string;
  setor: string;
  especialidades: string[];
  registroProfissional: string | null;
  conselhoNome: string | null;
  conselhoUf: string | null;
  agendaEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ---------------------------------------------------------------------------
// DTOs — Supabase row (snake_case)
// ---------------------------------------------------------------------------

/** Row `public.collaborators` — espelho da migration 016. */
export interface CollaboratorSupabaseRow {
  id: string;
  tenant_id: string;
  legacy_id: string | null;
  status: CollaboratorStatus;
  apelido: string;
  nome_completo: string;
  nome_social: string | null;
  sexo: string | null;
  data_nascimento: string | null;
  email: string | null;
  foto_url: string | null;
  rh_categoria: string;
  cargo: string;
  rh_funcao_descricao: string | null;
  tipo_vinculo: string;
  setor: string;
  especialidades: string[];
  registro_profissional: string | null;
  conselho_nome: string | null;
  conselho_uf: string | null;
  agenda_enabled: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

/** Payload parcial para UPSERT Supabase (campos mutáveis). */
export type CollaboratorSupabaseUpsertDto = Partial<
  Omit<CollaboratorSupabaseRow, 'id' | 'tenant_id' | 'created_at'>
> & {
  tenant_id: string;
  legacy_id?: string | null;
};

// ---------------------------------------------------------------------------
// DTOs — IndexedDB legado (camelCase)
// ---------------------------------------------------------------------------

/**
 * Row IDB `collaborators[]` — shape atual em `collaboratorService.js`.
 * Mantido para mapper e cache; não é SSOT alvo V3.
 */
export interface CollaboratorIndexedDbRow {
  id: string;
  tenant_id?: string | null;
  status?: CollaboratorStatus;
  apelido?: string;
  nomeCompleto?: string;
  nomeSocial?: string;
  sexo?: string;
  dataNascimento?: string;
  fotoUrl?: string;
  rhCategoria?: string;
  cargo?: string;
  rhFuncaoDescricao?: string;
  conselhoNome?: string;
  conselhoUf?: string;
  tipoVinculo?: string;
  setor?: string;
  especialidades?: string[];
  registroProfissional?: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Campo espelho opcional pós dual-write (Sprint 1B). */
  uuid?: string;
  [key: string]: unknown;
}

/** Payload create/update IDB cache mirror. */
export type CollaboratorIndexedDbUpsertDto = Partial<CollaboratorIndexedDbRow> & {
  id: string;
  tenant_id?: string | null;
};

// ---------------------------------------------------------------------------
// Input DTOs — Application layer → Repository
// ---------------------------------------------------------------------------

/** Usuário mínimo para operações mutáveis (espelha `user` de services). */
export interface CollaboratorRepositoryUser {
  id: string;
  tenantId?: string;
  tenant_id?: string;
}

/** Filtros de listagem core. */
export interface CollaboratorListFilters {
  status?: CollaboratorStatus;
  agendaEnabled?: boolean;
  search?: string;
  includeDeleted?: boolean;
}

/** Filtros legados de `listCollaborators` no collaboratorService (Sprint 1C). */
export interface LegacyCollaboratorServiceListFilters {
  tenantId?: string;
  tenant_id?: string;
  status?: CollaboratorStatus;
  cargo?: string;
  especialidade?: string;
}

/** Filtros legados de `getProfessionalOptions` (Sprint 1C Ticket 1.9). */
export interface LegacyProfessionalOptionsFilters {
  tenantId?: string;
  tenant_id?: string;
}

/** Vínculo access legado IDB (`collaboratorAccess[]`). */
export interface CollaboratorLegacyAccessLink {
  collaboratorId: string;
  userId: string;
  role: string;
}

/** Satélites IDB de `getCollaborator` — shape legado inalterado. */
export interface CollaboratorLegacySatellitesBundle {
  documents: Record<string, unknown>;
  education: unknown[];
  nationality: Record<string, unknown>;
  phones: unknown[];
  addresses: unknown[];
  relationships: Record<string, unknown>;
  characteristics: Record<string, unknown>;
  additional: { notes: string };
  insurances: unknown[];
  access: Record<string, unknown>;
  workHours: unknown[];
  finance: Record<string, unknown>;
}

/** Payload de criação core (campos obrigatórios de negócio). */
export interface CollaboratorCreateCoreDto {
  apelido: string;
  nomeCompleto: string;
  rhCategoria: string;
  cargo: string;
  tipoVinculo: string;
  setor: string;
  status?: CollaboratorStatus;
  nomeSocial?: string | null;
  sexo?: string | null;
  dataNascimento?: string | null;
  email?: string | null;
  fotoUrl?: string | null;
  rhFuncaoDescricao?: string | null;
  especialidades?: string[];
  registroProfissional?: string | null;
  conselhoNome?: string | null;
  conselhoUf?: string | null;
  agendaEnabled?: boolean;
  /** Se omitido, gerado como `col-*` pelo mapper (Sprint 1B). */
  legacyId?: string;
}

/** Payload de atualização core — partial sobre create. */
export type CollaboratorUpdateCoreDto = Partial<CollaboratorCreateCoreDto>;

// ---------------------------------------------------------------------------
// Resultados e comparação (shadow read — Sprint 1A+)
// ---------------------------------------------------------------------------

export interface CollaboratorListResult {
  items: CollaboratorCore[];
  total: number;
  source: CollaboratorReadSource;
}

export type CollaboratorReadSource = 'supabase' | 'indexeddb' | 'indexeddb-offline' | 'cache';

export interface CollaboratorCompareDiff {
  ref: CollaboratorRef;
  field: string;
  indexedDbValue: unknown;
  supabaseValue: unknown;
}

export interface CollaboratorCompareResult {
  tenantId: string;
  comparedAt: string;
  matchCount: number;
  mismatchCount: number;
  onlyInIndexedDb: CollaboratorRef[];
  onlyInSupabase: CollaboratorRef[];
  diffs: CollaboratorCompareDiff[];
  /** Detalhe arquitetural shadow (Ticket 1.7) — opcional, não consumido pelo app legado. */
  shadow?: import('./collaboratorShadowValidation.js').CollaboratorShadowCompareResult;
}

// ---------------------------------------------------------------------------
// Contratos de sub-repositories
// ---------------------------------------------------------------------------

/** Contrato leitura/escrita Supabase — implementação em collaboratorSupabaseRepository.ts */
export interface ICollaboratorSupabaseRepository {
  findByUuid(tenantId: string, uuid: string): Promise<CollaboratorCore | null>;
  findByLegacyId(tenantId: string, legacyId: string): Promise<CollaboratorCore | null>;
  list(tenantId: string, filters?: CollaboratorListFilters): Promise<CollaboratorCore[]>;
  upsert(tenantId: string, dto: CollaboratorSupabaseUpsertDto): Promise<CollaboratorCore>;
  softDelete(tenantId: string, uuid: string): Promise<void>;
}

/** Contrato cache IndexedDB — implementação em collaboratorIndexedDbRepository.ts */
export interface ICollaboratorIndexedDbRepository {
  findByLegacyId(tenantId: string, legacyId: string): CollaboratorCore | null;
  findByUuid(tenantId: string, uuid: string): CollaboratorCore | null;
  list(tenantId: string, filters?: CollaboratorListFilters): CollaboratorCore[];
  /** Listagem síncrona — espelha `listCollaborators` legado (shape IDB bruto). */
  listLegacySync(
    filters: LegacyCollaboratorServiceListFilters,
    saasModeEnabled: boolean,
  ): CollaboratorIndexedDbRow[];
  /** Perfil síncrono por legacy id — espelha `getCollaborator.profile`. */
  getLegacyProfileSync(collaboratorId: string): CollaboratorIndexedDbRow | null;
  /** Satélites IDB de getCollaborator (Ticket 1.9). */
  getLegacySatellitesSync(collaboratorId: string): CollaboratorLegacySatellitesBundle;
  /** Colaboradores ativos para agenda — base de getProfessionalOptions. */
  listProfessionalOptionsLegacySync(
    filters: LegacyProfessionalOptionsFilters,
    saasModeEnabled: boolean,
  ): CollaboratorIndexedDbRow[];
  /** Lista collaborators[] filtrada por tenant (tenantCollaboratorService). */
  listCollaboratorsByTenantLegacySync(tenantId: string): CollaboratorIndexedDbRow[];
  /** Telefone principal formatado (tenantCollaboratorService). */
  getPrimaryPhoneLegacySync(collaboratorId: string): string;
  /** Vínculo collaboratorAccess (collaboratorAccessRecoveryService). */
  getLegacyAccessLinkSync(collaboratorId: string): CollaboratorLegacyAccessLink | null;
  /** tenant_id de clinicProfile para fallback de filtros. */
  getClinicProfileTenantIdSync(): string | null;
  upsertMirror(row: CollaboratorIndexedDbUpsertDto): CollaboratorCore;
  /**
   * Espelha somente `uuid` canônico — preserva `id` legado e demais campos (Ticket 1.13).
   * @returns updated | skipped | not_found
   */
  mirrorCollaboratorUuidOnly(
    tenantId: string,
    legacyId: string,
    canonicalUuid: string,
  ): 'updated' | 'skipped' | 'not_found';
  removeMirror(tenantId: string, legacyId: string): void;
}

/** Contrato facade pública — implementação em collaboratorRepository.ts */
export interface ICollaboratorRepository {
  listCore(tenantId: string, filters?: CollaboratorListFilters): Promise<CollaboratorListResult>;
  getCore(tenantId: string, ref: CollaboratorRef): Promise<CollaboratorCore | null>;
  createCore(user: CollaboratorRepositoryUser, dto: CollaboratorCreateCoreDto): Promise<CollaboratorCore>;
  updateCore(
    user: CollaboratorRepositoryUser,
    ref: CollaboratorRef,
    dto: CollaboratorUpdateCoreDto,
  ): Promise<CollaboratorCore>;
  softDeleteCore(user: CollaboratorRepositoryUser, ref: CollaboratorRef): Promise<void>;
  resolveLegacyId(tenantId: string, uuid: string): Promise<string | null>;
  resolveUuid(tenantId: string, legacyId: string): Promise<string | null>;
  syncCacheFromRemote(tenantId: string): Promise<number>;
  compareIdbVsSupabase(tenantId: string): Promise<CollaboratorCompareResult>;
  /** Porta síncrona legada — `listCollaborators` (Ticket 1.8). */
  listLegacySync(
    filters: LegacyCollaboratorServiceListFilters,
    saasModeEnabled: boolean,
  ): CollaboratorIndexedDbRow[];
  /** Porta síncrona legada — profile de `getCollaborator` (Ticket 1.8). */
  getLegacyProfileSync(collaboratorId: string): CollaboratorIndexedDbRow | null;
  getLegacySatellitesSync(collaboratorId: string): CollaboratorLegacySatellitesBundle;
  listProfessionalOptionsLegacySync(
    filters: LegacyProfessionalOptionsFilters,
    saasModeEnabled: boolean,
  ): CollaboratorIndexedDbRow[];
  listCollaboratorsByTenantLegacySync(tenantId: string): CollaboratorIndexedDbRow[];
  getPrimaryPhoneLegacySync(collaboratorId: string): string;
  getLegacyAccessLinkSync(collaboratorId: string): CollaboratorLegacyAccessLink | null;
  getClinicProfileTenantIdSync(): string | null;
  /**
   * Espelha UUID canônico Supabase → campo `uuid` no IDB (dev/staging, Ticket 1.13).
   * Zero escrita Supabase. Não altera `id` legado.
   */
  mirrorCollaboratorUuidsToIndexedDb(
    tenantId: string,
    remoteCollaborators: import('./collaboratorUuidMirror.js').CollaboratorUuidMirrorRemoteRow[],
  ): import('./collaboratorUuidMirror.js').CollaboratorUuidMirrorReport;
}

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

/** Lançado quando método ainda não implementado (scaffold Sprint 1A.1). */
export class CollaboratorRepositoryNotImplementedError extends Error {
  readonly code = 'COLLABORATOR_REPOSITORY_NOT_IMPLEMENTED';

  constructor(method: string) {
    super(
      `[CollaboratorRepository] "${method}" ainda não implementado — scaffold Sprint 1A Ticket 1.1.`,
    );
    this.name = 'CollaboratorRepositoryNotImplementedError';
  }
}

/** Lançado quando ref não resolve para nenhum identificador conhecido. */
export class CollaboratorNotFoundError extends Error {
  readonly code = 'COLLABORATOR_NOT_FOUND';

  constructor(ref: CollaboratorRef) {
    super(`Colaborador não encontrado: ${ref}`);
    this.name = 'CollaboratorNotFoundError';
  }
}

/** Leitura Supabase bloqueada pelas flags (RH_SUPABASE_READ=false). */
export class CollaboratorRepositoryRemoteReadDisabledError extends Error {
  readonly code = 'COLLABORATOR_REMOTE_READ_DISABLED';

  constructor() {
    super('Leitura Supabase desabilitada (RH_SUPABASE_READ=false).');
    this.name = 'CollaboratorRepositoryRemoteReadDisabledError';
  }
}

/** Escrita Supabase bloqueada pelas flags (RH_SUPABASE_WRITE=false). */
export class CollaboratorRepositoryRemoteWriteDisabledError extends Error {
  readonly code = 'COLLABORATOR_REMOTE_WRITE_DISABLED';

  constructor() {
    super('Escrita Supabase desabilitada (RH_SUPABASE_WRITE=false).');
    this.name = 'CollaboratorRepositoryRemoteWriteDisabledError';
  }
}

/** Escrita mirror IndexedDB bloqueada (RH_IDB_WRITE_DISABLED=true). */
export class CollaboratorRepositoryLocalWriteDisabledError extends Error {
  readonly code = 'COLLABORATOR_LOCAL_WRITE_DISABLED';

  constructor() {
    super('Escrita IndexedDB desabilitada (RH_IDB_WRITE_DISABLED=true).');
    this.name = 'CollaboratorRepositoryLocalWriteDisabledError';
  }
}

/** Cliente Supabase indisponível no runtime. */
export class CollaboratorRepositorySupabaseUnavailableError extends Error {
  readonly code = 'COLLABORATOR_SUPABASE_UNAVAILABLE';

  constructor() {
    super('Cliente Supabase App indisponível para operações RH.');
    this.name = 'CollaboratorRepositorySupabaseUnavailableError';
  }
}
