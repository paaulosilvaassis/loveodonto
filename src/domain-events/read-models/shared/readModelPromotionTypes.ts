/**
 * @module domain-events/read-models/shared/readModelPromotionTypes
 * @description Contrato oficial de Promotion Readiness — Phase 8.4.
 * Sem auto-promote. Status "promoted" é proibido.
 */

export type ReadModelPromotionStatus =
  | 'not_ready'
  | 'blocked'
  | 'warning'
  | 'ready';

export type ReadModelPromotionHealthStatus =
  | 'blocked'
  | 'warning'
  | 'ready';

export type ReadModelPromotionCheckId =
  | 'tenant_isolation'
  | 'projection_scope'
  | 'registry'
  | 'lifecycle'
  | 'snapshot'
  | 'cache'
  | 'consistency'
  | 'drift'
  | 'soak'
  | 'health'
  | 'metrics'
  | 'inspector'
  | 'flags'
  | 'production_guards';

export type ReadModelPromotionCheckResultKind = 'pass' | 'fail' | 'warn' | 'skip';

export interface ReadModelPromotionCheckResult {
  readonly checkId: ReadModelPromotionCheckId;
  readonly result: ReadModelPromotionCheckResultKind;
  readonly blocking: boolean;
  readonly message: string;
  readonly detail?: string;
}

export type ReadModelPromotionRecommendation =
  | 'do_not_promote'
  | 'hold_for_human_review'
  | 'architecturally_ready_awaiting_human'
  | 'not_applicable';

/** Contrato oficial por Read Model. */
export interface ReadModelPromotionContract {
  readonly readModelId: string;
  readonly version: number | null;
  readonly tenantScope: 'tenant' | 'unknown' | 'missing';
  readonly projectionScope: 'tenant' | 'global' | 'unknown';
  readonly lifecycle: {
    readonly autoRebuild: boolean | null;
    readonly registered: boolean;
    readonly statesSample: Record<string, string>;
  };
  readonly cache: {
    readonly enabled: boolean | null;
    readonly ttlMs: number | null;
    readonly size: number;
  };
  readonly consistency: {
    readonly consistent: boolean | null;
    readonly compared: number;
  };
  readonly drift: {
    readonly total: number;
    readonly hard: number;
  };
  readonly soak: {
    readonly status: string | null;
    readonly promotionRecommendation: string | null;
  };
  readonly health: {
    readonly operational: string | null;
  };
  readonly metrics: {
    readonly builds: number;
    readonly failures: number;
  };
  readonly inspector: {
    readonly available: true;
  };
  readonly promotionStatus: ReadModelPromotionStatus;
  readonly promotionWarnings: readonly string[];
  readonly promotionBlockers: readonly string[];
  readonly checks: readonly ReadModelPromotionCheckResult[];
  readonly evaluatedAt: string;
}

export interface ReadModelPromotionReport {
  readonly overall: ReadModelPromotionStatus;
  readonly checkedAt: string;
  readonly byReadModel: Record<string, ReadModelPromotionStatus>;
  readonly contracts: readonly ReadModelPromotionContract[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly checksPassed: number;
  readonly checksFailed: number;
  readonly checksWarned: number;
  readonly recommendation: ReadModelPromotionRecommendation;
  readonly detail: string;
  /** Sempre false — Phase 8.4 nunca promove. */
  readonly autoPromote: false;
}

export const CQRS_PROMOTION_READ_MODEL_IDS = Object.freeze([
  'lead-analytics',
  'appointment-analytics',
  'financial-analytics',
] as const);

export type CqrsPromotionReadModelId = (typeof CQRS_PROMOTION_READ_MODEL_IDS)[number];
