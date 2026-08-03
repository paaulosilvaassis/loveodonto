/**
 * @module domain-events/projections/analyticsProjectionScope
 * @description Chave oficial projectionId::tenantId — Phase 8.3.
 * Sem default tenant. Sem inferência silenciosa.
 */

export class AnalyticsProjectionTenantError extends Error {
  readonly code:
    | 'MISSING_TENANT_SCOPE'
    | 'INVALID_TENANT_SCOPE'
    | 'TENANT_SCOPE_MISMATCH'
    | 'INVALID_SCOPE_KEY';

  constructor(
    code: AnalyticsProjectionTenantError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'AnalyticsProjectionTenantError';
    this.code = code;
  }
}

/**
 * tenantId obrigatório — rejeita vazio, whitespace, null, undefined.
 * Não cria tenant default.
 */
export function requireAnalyticsProjectionTenantId(
  tenantId: string | null | undefined,
): string {
  if (tenantId == null) {
    throw new AnalyticsProjectionTenantError(
      'MISSING_TENANT_SCOPE',
      'tenantId ausente para Analytics Projection',
    );
  }
  const tid = String(tenantId).trim();
  if (!tid) {
    throw new AnalyticsProjectionTenantError(
      'INVALID_TENANT_SCOPE',
      'tenantId inválido (vazio/whitespace) para Analytics Projection',
    );
  }
  return tid;
}

export function buildAnalyticsProjectionScopeKey(
  projectionId: string,
  tenantId: string | null | undefined,
): string {
  const id = String(projectionId || '').trim();
  if (!id) {
    throw new AnalyticsProjectionTenantError(
      'INVALID_SCOPE_KEY',
      'projectionId obrigatório para scope key',
    );
  }
  const tid = requireAnalyticsProjectionTenantId(tenantId);
  return `${id}::${tid}`;
}

export function parseAnalyticsProjectionScopeKey(scopeKey: string): {
  projectionId: string;
  tenantId: string;
} {
  const raw = String(scopeKey || '');
  const idx = raw.indexOf('::');
  if (idx <= 0 || idx === raw.length - 2) {
    throw new AnalyticsProjectionTenantError(
      'INVALID_SCOPE_KEY',
      'scope key inválida — esperado projectionId::tenantId',
    );
  }
  const projectionId = raw.slice(0, idx).trim();
  const tenantId = raw.slice(idx + 2).trim();
  if (!projectionId || !tenantId) {
    throw new AnalyticsProjectionTenantError(
      'INVALID_SCOPE_KEY',
      'scope key incompleta',
    );
  }
  return { projectionId, tenantId };
}

export function assertTenantScopeMatch(
  eventTenantId: string | null | undefined,
  explicitTenantId: string | null | undefined,
): string {
  const fromEvent = requireAnalyticsProjectionTenantId(eventTenantId);
  if (explicitTenantId == null || String(explicitTenantId).trim() === '') {
    return fromEvent;
  }
  const explicit = requireAnalyticsProjectionTenantId(explicitTenantId);
  if (explicit !== fromEvent) {
    throw new AnalyticsProjectionTenantError(
      'TENANT_SCOPE_MISMATCH',
      'TENANT_SCOPE_MISMATCH — event.tenantId ≠ tenantId explícito',
    );
  }
  return fromEvent;
}
