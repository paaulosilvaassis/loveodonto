/**
 * @module repositories/contracts/contractPersistenceErrors
 */

export class ContractPersistenceError extends Error {
  readonly code: string;
  readonly metadata?: Record<string, unknown>;

  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(message);
    this.name = 'ContractPersistenceError';
    this.code = code;
    this.metadata = metadata;
  }
}

export class ContractPersistenceTenantRequiredError extends ContractPersistenceError {
  constructor() {
    super('TENANT_REQUIRED', 'tenantId é obrigatório em todas as operações de persistência V2.');
    this.name = 'ContractPersistenceTenantRequiredError';
  }
}

export class ContractPersistenceTenantMismatchError extends ContractPersistenceError {
  constructor(tenantId: string, resourceTenantId: string) {
    super('TENANT_MISMATCH', 'Recurso não pertence ao tenant informado.', {
      tenantId,
      resourceTenantId,
    });
    this.name = 'ContractPersistenceTenantMismatchError';
  }
}

export class ContractPersistenceNotFoundError extends ContractPersistenceError {
  constructor(resource: string, id: string) {
    super('CONTRACT_NOT_FOUND', `${resource} não encontrado.`, { id });
    this.name = 'ContractPersistenceNotFoundError';
  }
}

export class ContractPersistenceConflictError extends ContractPersistenceError {
  /** Alias canônico Phase 10.9 (mesmo conflito tipado). */
  readonly concurrencyCode = 'CONTRACTS_V2_CONCURRENCY_CONFLICT';

  constructor(message = 'Conflito de concorrência otimista (row_version).') {
    // Mantém código legado 10.3; concurrencyCode expõe o alias 10.9.
    super('OPTIMISTIC_CONCURRENCY_CONFLICT', message);
    this.name = 'ContractPersistenceConflictError';
  }
}

export class ContractPersistenceVersionLockedError extends ContractPersistenceError {
  constructor(versionId: string) {
    super('VERSION_ALREADY_LOCKED', 'Versão bloqueada não pode ser alterada.', { versionId });
    this.name = 'ContractPersistenceVersionLockedError';
  }
}

export class ContractPersistenceUnavailableError extends ContractPersistenceError {
  constructor() {
    super(
      'CONTRACT_PERSISTENCE_UNAVAILABLE',
      'Cliente Supabase indisponível para Contracts V2 (sem wiring em produção nesta fase).',
    );
    this.name = 'ContractPersistenceUnavailableError';
  }
}

export function mapPersistenceDriverError(error: { message?: string; code?: string } | null): never {
  const message = String(error?.message || 'Erro de persistência');
  const lower = message.toLowerCase();
  if (lower.includes('app_contract_version_locked') || lower.includes('immutable after locked_at')) {
    throw new ContractPersistenceVersionLockedError('unknown');
  }
  if (lower.includes('app_contract_audit_append_only')) {
    throw new ContractPersistenceError('AUDIT_APPEND_ONLY', 'Eventos de auditoria são append-only.');
  }
  if (lower.includes('app_contract_tenant_immutable')) {
    throw new ContractPersistenceTenantMismatchError('?', '?');
  }
  throw new ContractPersistenceError('PERSISTENCE_DRIVER_ERROR', message, {
    driverCode: error?.code,
  });
}
