/**
 * @module domain-events/read-models/shared/readModelTenant
 * @description Isolamento estrutural por tenantId — Phase 8.1.
 */

export const READ_MODEL_TEST_TENANT = '__test__';

export class ReadModelTenantError extends Error {
  readonly code = 'READ_MODEL_TENANT_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'ReadModelTenantError';
  }
}

/**
 * Resolve tenantId obrigatório.
 * Ausência só é aceita com `allowTestFallback` (contexto explícito de teste).
 */
export function requireReadModelTenantId(
  tenantId: string | null | undefined,
  options: { allowTestFallback?: boolean } = {},
): string {
  const tid = String(tenantId || '').trim();
  if (tid) return tid;
  if (options.allowTestFallback) return READ_MODEL_TEST_TENANT;
  throw new ReadModelTenantError(
    'tenantId obrigatório para Read Model (não misturar tenants silenciosamente)',
  );
}

export function readModelScopeKey(
  readModelId: string,
  tenantId: string | null | undefined,
  options: { allowTestFallback?: boolean } = {},
): string {
  const id = String(readModelId || '').trim();
  if (!id) throw new ReadModelTenantError('readModelId obrigatório');
  const tid = requireReadModelTenantId(tenantId, options);
  return `${id}::${tid}`;
}

export function parseReadModelScopeKey(key: string): {
  readModelId: string;
  tenantId: string;
} {
  const raw = String(key || '');
  const idx = raw.indexOf('::');
  if (idx <= 0) return { readModelId: raw, tenantId: READ_MODEL_TEST_TENANT };
  return {
    readModelId: raw.slice(0, idx),
    tenantId: raw.slice(idx + 2) || READ_MODEL_TEST_TENANT,
  };
}
