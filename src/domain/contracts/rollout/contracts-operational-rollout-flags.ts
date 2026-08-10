/**
 * @module domain/contracts/rollout/contracts-operational-rollout-flags
 * @description Mapeamento SSOT feature_flags ↔ estado operacional (Phase 10.21C).
 * Sem migration. Sem ativação automática de produção.
 */

import {
  CONTRACTS_OPERATIONAL_MODES,
  CONTRACTS_ROLLOUT_PHASES,
  DEFAULT_OPERATIONAL_MODE_STATE,
  normalizeOperationalModeState,
  type ContractsOperationalMode,
  type ContractsOperationalModeState,
} from './contracts-operational-mode.js';

export const CONTRACTS_OPERATIONAL_UX_GLOBAL_FLAG = 'contracts_operational_ux_global_enabled';
export const CONTRACTS_OPERATIONAL_UX_TENANT_FLAG = 'contracts_operational_ux_enabled';

export const PRODUCTION_ACTIVATION_PHRASE = 'ATIVAR_PRODUCAO_OPERATIONAL_UX';

export interface ContractsRolloutFlagPayload {
  mode?: string;
  rollbackReason?: string | null;
  changedByUserId?: string | null;
  changedByRole?: string | null;
  changedAt?: string | null;
  notes?: string;
  audit?: Array<Record<string, unknown>>;
}

export interface FeatureFlagRow {
  flag_key?: string;
  scope_type?: string;
  scope_ref?: string;
  enabled?: boolean;
  payload?: ContractsRolloutFlagPayload | Record<string, unknown> | null;
  updated_at?: string | null;
}

export interface ServerRolloutSnapshot {
  tenantId: string;
  state: ContractsOperationalModeState & { tenantEnabled: boolean; source: 'feature_flags' };
  operationalUxEnabled: boolean;
  globalFlag: { enabled: boolean; payload: ContractsRolloutFlagPayload };
  tenantFlag: { enabled: boolean; payload: ContractsRolloutFlagPayload };
}

function asPayload(raw: unknown): ContractsRolloutFlagPayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as ContractsRolloutFlagPayload;
}

export function normalizeRolloutMode(value: unknown): ContractsOperationalMode {
  const mode = String(value || '').trim();
  if (Object.values(CONTRACTS_OPERATIONAL_MODES).includes(mode as ContractsOperationalMode)) {
    return mode as ContractsOperationalMode;
  }
  return CONTRACTS_OPERATIONAL_MODES.V1_ONLY;
}

export function buildRolloutActorPayload(input: {
  mode: ContractsOperationalMode;
  rollbackReason?: string | null;
  changedByUserId?: string | null;
  changedByRole?: string | null;
  notes?: string;
  previousPayload?: ContractsRolloutFlagPayload;
  auditAction?: string;
}): ContractsRolloutFlagPayload {
  const changedAt = new Date().toISOString();
  const prevAudit = Array.isArray(input.previousPayload?.audit)
    ? input.previousPayload.audit
    : [];
  const auditEntry = {
    at: changedAt,
    action: input.auditAction || 'UPDATE',
    mode: input.mode,
    reason: input.rollbackReason || null,
    by: input.changedByUserId || null,
    role: input.changedByRole || null,
  };
  return {
    mode: input.mode,
    rollbackReason: input.rollbackReason ?? null,
    changedByUserId: input.changedByUserId || null,
    changedByRole: input.changedByRole || null,
    changedAt,
    notes: input.notes || input.previousPayload?.notes || '',
    audit: [...prevAudit, auditEntry].slice(-50),
  };
}

/**
 * Runtime canônico (server + client):
 * global.enabled && tenant.enabled && mode ∉ {ROLLED_BACK, V1_ONLY}
 */
export function computeOperationalUxEnabled(input: {
  globalEnabled?: boolean;
  tenantEnabled?: boolean;
  mode?: string | null;
}): boolean {
  const mode = normalizeRolloutMode(input.mode);
  if (
    mode === CONTRACTS_OPERATIONAL_MODES.V1_ONLY
    || mode === CONTRACTS_OPERATIONAL_MODES.ROLLED_BACK
  ) {
    return false;
  }
  return Boolean(input.globalEnabled) && Boolean(input.tenantEnabled);
}

export function mapFeatureFlagsToRolloutState(
  tenantId: string,
  globalRow?: FeatureFlagRow | null,
  tenantRow?: FeatureFlagRow | null,
): ServerRolloutSnapshot {
  const globalPayload = asPayload(globalRow?.payload);
  const tenantPayload = asPayload(tenantRow?.payload);
  const globalEnabled = Boolean(globalRow?.enabled);
  const tenantEnabled = Boolean(tenantRow?.enabled);
  const mode = normalizeRolloutMode(tenantPayload.mode || globalPayload.mode || CONTRACTS_OPERATIONAL_MODES.OPERATIONAL_UX);

  const state = normalizeOperationalModeState({
    ...DEFAULT_OPERATIONAL_MODE_STATE,
    mode,
    productionGlobalEnabled: globalEnabled,
    productionTenantAllowlist: tenantEnabled && tenantId ? [tenantId] : [],
    tenantEnabled,
    lastChangedAt: tenantPayload.changedAt || tenantRow?.updated_at || globalPayload.changedAt || null,
    lastChangedBy: tenantPayload.changedByUserId || null,
    rollbackReason: tenantPayload.rollbackReason ?? null,
    notes: tenantPayload.notes || '',
    rolloutPhase: globalEnabled && tenantEnabled
      ? CONTRACTS_ROLLOUT_PHASES.PRODUCTION_ACTIVE
      : CONTRACTS_ROLLOUT_PHASES.READY_FOR_PRODUCTION_ACTIVATION,
    source: 'feature_flags',
  } as Partial<ContractsOperationalModeState> & { tenantEnabled: boolean; source: string });

  return {
    tenantId,
    state: state as ServerRolloutSnapshot['state'],
    operationalUxEnabled: computeOperationalUxEnabled({
      globalEnabled,
      tenantEnabled,
      mode,
    }),
    globalFlag: { enabled: globalEnabled, payload: globalPayload },
    tenantFlag: { enabled: tenantEnabled, payload: tenantPayload },
  };
}
