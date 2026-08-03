/**
 * @module repositories/collaborator/collaboratorRepositoryGuards
 * @description Guards de tenant para métodos do repository (Ticket 1.2).
 */

import { assertValidTenantId } from './collaboratorMapper.js';
import type { CollaboratorRepositoryUser } from './collaboratorTypes.js';

/** Valida tenantId em operações de leitura/escrita por tenant. */
export function requireRepositoryTenantId(tenantId: string | null | undefined): string {
  return assertValidTenantId(tenantId);
}

/** Resolve tenant do usuário autenticado para mutações. */
export function requireUserTenantId(user: CollaboratorRepositoryUser): string {
  return assertValidTenantId(user?.tenantId ?? user?.tenant_id);
}
