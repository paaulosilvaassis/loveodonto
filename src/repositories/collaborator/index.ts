/**
 * @module repositories/collaborator
 * @description Barrel **público controlado** — Repository RH Love Odonto V3.
 *
 * ## Fase V3 — uso restrito
 *
 * Este módulo está em consolidação Sprint 1A. **Telas, services, hooks e contexts
 * atuais NÃO devem importar daqui** até ticket explícito de integração (ex.: wiring
 * em `collaboratorService.js`).
 *
 * ## O que exportar (consumidores futuros autorizados)
 *
 * - Facade: `collaboratorRepository`, `createCollaboratorRepository`
 * - Tipos: `CollaboratorCore`, DTOs de leitura/escrita, `ICollaboratorRepository`
 * - Erros públicos de domínio/routing
 *
 * ## O que NÃO é exportado (implementação interna)
 *
 * - Flags (`collaboratorRepositoryFlags.ts`)
 * - Guards, mapper, cache, compare, sub-repositories Supabase/IndexedDB
 * - Clientes Supabase, acesso direto ao IndexedDB, helpers de teste
 *
 * Importe internals apenas de arquivos dentro de `src/repositories/collaborator/`
 * ou em testes unitários do próprio módulo.
 *
 * @see docs/reports/RH_V3_BLUEPRINT.md §2 Repository Pattern
 * @see docs/reports/RH_CONSOLIDATION_AUDIT.md
 */

// ---------------------------------------------------------------------------
// Facade pública
// ---------------------------------------------------------------------------

export {
  collaboratorRepository,
  createCollaboratorRepository,
} from './collaboratorRepository.js';

// ---------------------------------------------------------------------------
// Tipos públicos (contrato V3)
// ---------------------------------------------------------------------------

export type { LegacyCollaboratorShape } from './collaboratorMapper.js';

export type {
  CollaboratorCompareDiff,
  CollaboratorCompareResult,
  CollaboratorCore,
  CollaboratorCreateCoreDto,
  CollaboratorListFilters,
  CollaboratorListResult,
  CollaboratorReadSource,
  CollaboratorRef,
  CollaboratorRepositoryUser,
  CollaboratorStatus,
  CollaboratorUpdateCoreDto,
  ICollaboratorRepository,
} from './collaboratorTypes.js';

// ---------------------------------------------------------------------------
// Erros públicos
// ---------------------------------------------------------------------------

export {
  CollaboratorNotFoundError,
  CollaboratorRepositoryLocalWriteDisabledError,
  CollaboratorRepositoryNotImplementedError,
  CollaboratorRepositoryRemoteReadDisabledError,
  CollaboratorRepositoryRemoteWriteDisabledError,
  CollaboratorRepositorySupabaseUnavailableError,
} from './collaboratorTypes.js';
