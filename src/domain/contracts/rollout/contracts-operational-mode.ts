/**
 * @module domain/contracts/rollout/contracts-operational-mode
 * @description Modo operacional + rollout gradual tenant-by-tenant (Phase 10.20).
 *
 * NÃO ativa flags Contracts V2 de domínio em produção.
 * NÃO faz cutover. V1 permanece sempre disponível.
 * Persistência local (sem migration/schema).
 */

import { PRODUCTION_REF, STAGING_REF } from '../staging/contracts-v2-staging-pilot.js';
import { parseBooleanLike } from '../../../repositories/shared/repositoryV3FlagHelpers.js';

export const CONTRACTS_OPERATIONAL_MODES = {
  /** Somente fluxo clássico V1 (sem wizard operacional no hub). */
  V1_ONLY: 'V1_ONLY',
  /** UX operacional (wizard/fila/package) habilitada neste tenant. */
  OPERATIONAL_UX: 'OPERATIONAL_UX',
  /** Rollback emergencial — equivalente a V1_ONLY com trilha de auditoria. */
  ROLLED_BACK: 'ROLLED_BACK',
} as const;

export type ContractsOperationalMode =
  (typeof CONTRACTS_OPERATIONAL_MODES)[keyof typeof CONTRACTS_OPERATIONAL_MODES];

export const CONTRACTS_ROLLOUT_PHASES = {
  NOT_STARTED: 'NOT_STARTED',
  STAGING_VALIDATED: 'STAGING_VALIDATED',
  INTERNAL_BETA: 'INTERNAL_BETA',
  CLINIC_PILOT: 'CLINIC_PILOT',
  STAGED_ROLLOUT: 'STAGED_ROLLOUT',
  READY_FOR_PRODUCTION_ACTIVATION: 'READY_FOR_PRODUCTION_ACTIVATION',
  PRODUCTION_ACTIVE: 'PRODUCTION_ACTIVE',
} as const;

export type ContractsRolloutPhase =
  (typeof CONTRACTS_ROLLOUT_PHASES)[keyof typeof CONTRACTS_ROLLOUT_PHASES];

export interface ContractsOperationalModeState {
  mode: ContractsOperationalMode;
  rolloutPhase: ContractsRolloutPhase;
  /** Tenants explicitamente allowlisted para OPERATIONAL_UX em produção. */
  productionTenantAllowlist: string[];
  /** Produção global — sempre false até ativação humana explícita fora deste painel auto. */
  productionGlobalEnabled: boolean;
  lastChangedAt: string | null;
  lastChangedBy: string | null;
  rollbackReason: string | null;
  notes: string;
}

export const DEFAULT_OPERATIONAL_MODE_STATE: Readonly<ContractsOperationalModeState> = Object.freeze({
  mode: CONTRACTS_OPERATIONAL_MODES.OPERATIONAL_UX,
  rolloutPhase: CONTRACTS_ROLLOUT_PHASES.READY_FOR_PRODUCTION_ACTIVATION,
  productionTenantAllowlist: [],
  productionGlobalEnabled: false,
  lastChangedAt: null,
  lastChangedBy: null,
  rollbackReason: null,
  notes: '',
});

export interface OperationalModeContext {
  tenantId?: string | null;
  clinicId?: string | null;
  projectRef?: string | null;
  user?: { id?: string; role?: string; name?: string } | null;
  /** Estado persistido / override de teste. */
  state?: Partial<ContractsOperationalModeState> | null;
  forceAllowInTest?: boolean;
}

function resolveProjectRef(ctx: OperationalModeContext = {}): string {
  if (ctx.projectRef) return String(ctx.projectRef).trim();
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};
    return String(env.VITE_SUPABASE_PROJECT_REF || '').trim();
  } catch {
    return '';
  }
}

export function isProductionRuntime(ctx: OperationalModeContext = {}): boolean {
  const ref = resolveProjectRef(ctx);
  if (ref === PRODUCTION_REF) return true;
  try {
    const env = (import.meta as ImportMeta & { env?: { PROD?: boolean; MODE?: string } }).env;
    if (env?.PROD && env?.MODE === 'production' && ref === PRODUCTION_REF) return true;
  } catch {
    /* ignore */
  }
  if (typeof process !== 'undefined') {
    if (String(process.env?.VITE_SUPABASE_PROJECT_REF || '') === PRODUCTION_REF) return true;
  }
  return false;
}

export function isStagingRuntime(ctx: OperationalModeContext = {}): boolean {
  return resolveProjectRef(ctx) === STAGING_REF;
}

export function normalizeOperationalModeState(
  partial?: Partial<ContractsOperationalModeState> | null,
): ContractsOperationalModeState {
  const base = { ...DEFAULT_OPERATIONAL_MODE_STATE, ...(partial || {}) };
  if (!Object.values(CONTRACTS_OPERATIONAL_MODES).includes(base.mode as ContractsOperationalMode)) {
    base.mode = CONTRACTS_OPERATIONAL_MODES.V1_ONLY;
  }
  if (!Array.isArray(base.productionTenantAllowlist)) base.productionTenantAllowlist = [];
  base.productionGlobalEnabled = Boolean(base.productionGlobalEnabled);
  return base;
}

/**
 * Produção: OPERATIONAL_UX só se tenant allowlisted E productionGlobalEnabled
 * (ativação humana — este módulo NÃO liga productionGlobalEnabled sozinho).
 */
export function isContractsOperationalUxEnabled(ctx: OperationalModeContext = {}): boolean {
  const state = normalizeOperationalModeState(ctx.state);
  if (
    state.mode === CONTRACTS_OPERATIONAL_MODES.V1_ONLY
    || state.mode === CONTRACTS_OPERATIONAL_MODES.ROLLED_BACK
  ) {
    return false;
  }

  if (!isProductionRuntime(ctx)) {
    // Staging/dev: modo OPERATIONAL_UX respeita o painel local.
    return state.mode === CONTRACTS_OPERATIONAL_MODES.OPERATIONAL_UX;
  }

  // Produção: default OFF até allowlist + flag global explícita.
  if (!state.productionGlobalEnabled) return false;
  const tenantId = String(ctx.tenantId || '').trim();
  if (!tenantId) return false;
  return state.productionTenantAllowlist.includes(tenantId);
}

export function canManageContractsOperationalMode(user?: { role?: string } | null): boolean {
  const role = String(user?.role || '').toLowerCase();
  return role === 'admin' || role === 'master';
}

export function buildRollbackState(
  current: ContractsOperationalModeState,
  options: { reason?: string; userId?: string | null } = {},
): ContractsOperationalModeState {
  return {
    ...normalizeOperationalModeState(current),
    mode: CONTRACTS_OPERATIONAL_MODES.ROLLED_BACK,
    productionGlobalEnabled: false,
    rollbackReason: options.reason || 'Rollback emergencial solicitado pelo administrador.',
    lastChangedAt: new Date().toISOString(),
    lastChangedBy: options.userId || null,
  };
}

export function buildEnableOperationalUxState(
  current: ContractsOperationalModeState,
  options: { userId?: string | null; note?: string } = {},
): ContractsOperationalModeState {
  return {
    ...normalizeOperationalModeState(current),
    mode: CONTRACTS_OPERATIONAL_MODES.OPERATIONAL_UX,
    rollbackReason: null,
    notes: options.note || current.notes || '',
    lastChangedAt: new Date().toISOString(),
    lastChangedBy: options.userId || null,
  };
}

/**
 * Ativação global de produção — NUNCA automática.
 * Exige confirmação explícita no painel + env CONTRACTS_OPERATIONAL_UX_PRODUCTION_UNLOCK=true
 * apenas para permitir o clique (ainda assim o admin precisa confirmar).
 */
export function isProductionActivationUnlocked(ctx: OperationalModeContext = {}): boolean {
  if (!isProductionRuntime(ctx) && !ctx.forceAllowInTest) return false;
  if (typeof process !== 'undefined') {
    if (parseBooleanLike(process.env?.CONTRACTS_OPERATIONAL_UX_PRODUCTION_UNLOCK) === true) {
      return true;
    }
  }
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};
    return parseBooleanLike(env.VITE_CONTRACTS_OPERATIONAL_UX_PRODUCTION_UNLOCK) === true;
  } catch {
    return false;
  }
}

export function evaluateGoLiveReadiness(input: {
  phase1016Pass?: boolean;
  phase1017Pass?: boolean;
  phase1018Pass?: boolean;
  buildPass?: boolean;
  v1RegressionPass?: boolean;
  harnessIsolatedInProd?: boolean;
  productionFlagsOffByDefault?: boolean;
  legalChecklistComplete?: boolean;
  trainingDocReady?: boolean;
  rollbackTested?: boolean;
  monitoringReady?: boolean;
  noCriticalBugs?: boolean;
} = {}): {
  ready: boolean;
  score: number;
  total: number;
  missing: string[];
  gate: string;
} {
  const checks: Array<{ key: string; ok: boolean; label: string }> = [
    { key: 'phase1016', ok: input.phase1016Pass !== false, label: 'Testes phase1016' },
    { key: 'phase1017', ok: input.phase1017Pass !== false, label: 'Testes phase1017' },
    { key: 'phase1018', ok: input.phase1018Pass !== false, label: 'Testes phase1018' },
    { key: 'build', ok: input.buildPass !== false, label: 'Build OK' },
    { key: 'v1', ok: input.v1RegressionPass !== false, label: 'Regressão V1' },
    { key: 'harness', ok: input.harnessIsolatedInProd !== false, label: 'Harness isolado em produção' },
    { key: 'flags', ok: input.productionFlagsOffByDefault !== false, label: 'Flags de domínio OFF por default' },
    { key: 'legal', ok: input.legalChecklistComplete === true, label: 'Checklist jurídico' },
    { key: 'training', ok: input.trainingDocReady === true, label: 'Doc de treinamento' },
    { key: 'rollback', ok: input.rollbackTested === true, label: 'Rollback testado' },
    { key: 'monitoring', ok: input.monitoringReady === true, label: 'Monitoramento pronto' },
    { key: 'bugs', ok: input.noCriticalBugs !== false, label: 'Sem bugs críticos abertos' },
  ];
  const missing = checks.filter((c) => !c.ok).map((c) => c.label);
  const score = checks.filter((c) => c.ok).length;
  const ready = missing.length === 0;
  return {
    ready,
    score,
    total: checks.length,
    missing,
    gate: ready
      ? 'READY_FOR_PRODUCTION_ACTIVATION'
      : 'NOT_READY_FOR_PRODUCTION_ACTIVATION',
  };
}
