/**
 * Phase 4.10 Wave 1 — erros de tenant (core).
 */

export class TenantCoreForbiddenError extends Error {
  constructor(message, code = 'FORBIDDEN') {
    super(message);
    this.name = 'TenantCoreForbiddenError';
    this.code = code;
    this.status = 403;
  }
}

export class TenantCoreQueryError extends Error {
  constructor(message, code = 'INVALID_QUERY') {
    super(message);
    this.name = 'TenantCoreQueryError';
    this.code = code;
    this.status = 400;
  }
}
