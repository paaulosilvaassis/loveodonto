/**
 * Runtime-safe (plain JS) mapping for contracts operational rollout SSOT.
 * Phase 10.21H — Railway executes `node index.js` without TS transpile.
 * Keep in sync with src/domain/contracts/rollout/contracts-operational-rollout-flags.ts
 */

export const CONTRACTS_OPERATIONAL_MODES = Object.freeze({
  V1_ONLY: 'V1_ONLY',
  OPERATIONAL_UX: 'OPERATIONAL_UX',
  ROLLED_BACK: 'ROLLED_BACK',
});

export const CONTRACTS_ROLLOUT_PHASES = Object.freeze({
  READY_FOR_PRODUCTION_ACTIVATION: 'READY_FOR_PRODUCTION_ACTIVATION',
  PRODUCTION_ACTIVE: 'PRODUCTION_ACTIVE',
});

export const CONTRACTS_OPERATIONAL_UX_GLOBAL_FLAG = 'contracts_operational_ux_global_enabled';
export const CONTRACTS_OPERATIONAL_UX_TENANT_FLAG = 'contracts_operational_ux_enabled';
export const PRODUCTION_ACTIVATION_PHRASE = 'ATIVAR_PRODUCAO_OPERATIONAL_UX';

export function normalizeRolloutMode(value) {
  const mode = String(value || '').trim();
  if (Object.values(CONTRACTS_OPERATIONAL_MODES).includes(mode)) return mode;
  return CONTRACTS_OPERATIONAL_MODES.V1_ONLY;
}

function asPayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw;
}

export function buildRolloutActorPayload(input = {}) {
  const changedAt = new Date().toISOString();
  const previousPayload = asPayload(input.previousPayload);
  const prevAudit = Array.isArray(previousPayload.audit) ? previousPayload.audit : [];
  const mode = normalizeRolloutMode(input.mode);
  const auditEntry = {
    at: changedAt,
    action: input.auditAction || 'UPDATE',
    mode,
    reason: input.rollbackReason || null,
    by: input.changedByUserId || null,
    role: input.changedByRole || null,
  };
  return {
    mode,
    rollbackReason: input.rollbackReason ?? null,
    changedByUserId: input.changedByUserId || null,
    changedByRole: input.changedByRole || null,
    changedAt,
    notes: input.notes || previousPayload.notes || '',
    audit: [...prevAudit, auditEntry].slice(-50),
  };
}

export function computeOperationalUxEnabled(input = {}) {
  const mode = normalizeRolloutMode(input.mode);
  if (
    mode === CONTRACTS_OPERATIONAL_MODES.V1_ONLY
    || mode === CONTRACTS_OPERATIONAL_MODES.ROLLED_BACK
  ) {
    return false;
  }
  return Boolean(input.globalEnabled) && Boolean(input.tenantEnabled);
}

export function mapFeatureFlagsToRolloutState(tenantId, globalRow = null, tenantRow = null) {
  const globalPayload = asPayload(globalRow?.payload);
  const tenantPayload = asPayload(tenantRow?.payload);
  const globalEnabled = Boolean(globalRow?.enabled);
  const tenantEnabled = Boolean(tenantRow?.enabled);
  const mode = normalizeRolloutMode(
    tenantPayload.mode || globalPayload.mode || CONTRACTS_OPERATIONAL_MODES.OPERATIONAL_UX,
  );
  const tid = String(tenantId || '').trim();

  const state = {
    mode,
    productionGlobalEnabled: globalEnabled,
    productionTenantAllowlist: tenantEnabled && tid ? [tid] : [],
    tenantEnabled,
    lastChangedAt: tenantPayload.changedAt || tenantRow?.updated_at || globalPayload.changedAt || null,
    lastChangedBy: tenantPayload.changedByUserId || null,
    rollbackReason: tenantPayload.rollbackReason ?? null,
    notes: tenantPayload.notes || '',
    rolloutPhase: globalEnabled && tenantEnabled
      ? CONTRACTS_ROLLOUT_PHASES.PRODUCTION_ACTIVE
      : CONTRACTS_ROLLOUT_PHASES.READY_FOR_PRODUCTION_ACTIVATION,
    source: 'feature_flags',
  };

  return {
    tenantId: tid,
    state,
    operationalUxEnabled: computeOperationalUxEnabled({
      globalEnabled,
      tenantEnabled,
      mode,
    }),
    globalFlag: { enabled: globalEnabled, payload: globalPayload },
    tenantFlag: { enabled: tenantEnabled, payload: tenantPayload },
  };
}
