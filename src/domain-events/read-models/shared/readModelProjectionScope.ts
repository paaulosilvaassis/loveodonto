/**
 * @module domain-events/read-models/shared/readModelProjectionScope
 * @description Escopo estrutural das Analytics Projections — Phase 8.2.
 * Declaração explícita: sem inferência silenciosa a partir de tenantId.
 */

export type AnalyticsProjectionScope = 'tenant' | 'global' | 'unknown';

/** Escopo oficial das projections (Phase 8.3 store = tenant-scoped). */
export const ANALYTICS_PROJECTION_SCOPE_BY_ID: Readonly<
  Record<string, AnalyticsProjectionScope>
> = Object.freeze({
  'crm-counter': 'tenant',
  'appointment-counter': 'tenant',
  'financial-counter': 'tenant',
});

export const READ_MODEL_PRIMARY_PROJECTION: Readonly<Record<string, string>> = Object.freeze({
  'lead-analytics': 'crm-counter',
  'appointment-analytics': 'appointment-counter',
  'financial-analytics': 'financial-counter',
});

export function getAnalyticsProjectionScope(
  projectionId: string,
): AnalyticsProjectionScope {
  const id = String(projectionId || '').trim();
  return ANALYTICS_PROJECTION_SCOPE_BY_ID[id] ?? 'unknown';
}

export function getReadModelProjectionScope(readModelId: string): {
  projectionId: string | null;
  scope: AnalyticsProjectionScope;
} {
  const id = String(readModelId || '').trim();
  const projectionId = READ_MODEL_PRIMARY_PROJECTION[id] ?? null;
  if (!projectionId) return { projectionId: null, scope: 'unknown' };
  return { projectionId, scope: getAnalyticsProjectionScope(projectionId) };
}

/**
 * Regras de segurança para build tenant-aware a partir de projection.
 * global/unknown → não afirmam isolamento multi-tenant.
 */
export function evaluateProjectionScopeForTenantBuild(input: {
  readModelId: string;
  tenantId: string;
  allowGlobalTestScope?: boolean;
}): {
  allowed: boolean;
  scope: AnalyticsProjectionScope;
  projectionId: string | null;
  warning: string | null;
  mode: 'tenant' | 'global-test-scope' | 'blocked';
} {
  const { projectionId, scope } = getReadModelProjectionScope(input.readModelId);
  if (scope === 'tenant') {
    return {
      allowed: true,
      scope,
      projectionId,
      warning: null,
      mode: 'tenant',
    };
  }
  if (scope === 'global') {
    if (input.allowGlobalTestScope) {
      return {
        allowed: true,
        scope,
        projectionId,
        warning:
          `projection ${projectionId} is global — snapshot tenant=${input.tenantId} marcado como global-test-scope`,
        mode: 'global-test-scope',
      };
    }
    return {
      allowed: false,
      scope,
      projectionId,
      warning:
        `projection ${projectionId} is global — não converter silenciosamente em snapshot tenant-aware`,
      mode: 'blocked',
    };
  }
  return {
    allowed: false,
    scope: 'unknown',
    projectionId,
    warning: `projection scope unknown for readModel=${input.readModelId}`,
    mode: 'blocked',
  };
}
