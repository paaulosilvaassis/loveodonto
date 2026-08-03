/**
 * @module domain-events/certification/cqrsCertificationTypes
 * @description Contratos oficiais de CQRS Architecture Certification — Phase 8.5.
 * Architecture Certified ≠ Production Promoted.
 */

export type CqrsCertificationStatus =
  | 'not_evaluated'
  | 'failed'
  | 'blocked'
  | 'conditional'
  | 'certified';

export type CqrsCertificationGateId =
  | 'domain_event_integrity'
  | 'tenant_isolation'
  | 'read_model_consistency'
  | 'soak_validation'
  | 'promotion_readiness'
  | 'production_safety'
  | 'regression';

export type CqrsCertificationGateResult = 'pass' | 'fail' | 'warn' | 'skip';

export type CqrsCertificationEvidenceType =
  | 'test'
  | 'contract'
  | 'inspection'
  | 'soak'
  | 'consistency'
  | 'health'
  | 'metrics'
  | 'static-analysis'
  | 'manual-required';

export type CqrsHumanApprovalState = 'pending' | 'approved' | 'rejected';

export type CqrsStagingEvidenceState = 'not_configured' | 'manual-required' | 'recorded';

export type CqrsCertificationRecommendation =
  | 'not_applicable'
  | 'architecture_blocked'
  | 'architecture_conditional'
  | 'architecture_certified_awaiting_staging_and_human_approval';

export interface CqrsCertificationEvidence {
  readonly evidenceId: string;
  readonly gateId: CqrsCertificationGateId;
  readonly source: string;
  readonly type: CqrsCertificationEvidenceType;
  readonly description: string;
  readonly result: 'pass' | 'fail' | 'warn' | 'pending';
  readonly timestamp: string;
  readonly detailsSanitized: string;
}

export interface CqrsCertificationGateOutcome {
  readonly gateId: CqrsCertificationGateId;
  readonly result: CqrsCertificationGateResult;
  readonly blocking: boolean;
  readonly message: string;
  readonly evidenceIds: readonly string[];
}

export interface CqrsStagingEvidenceContract {
  readonly state: CqrsStagingEvidenceState;
  readonly environment: string | null;
  readonly tenantId: string | null;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly iterations: number | null;
  readonly result: string | null;
  readonly drifts: number | null;
  readonly errors: number | null;
  readonly operator: string | null;
  readonly note: string;
}

export interface CqrsHumanApprovalGate {
  readonly state: CqrsHumanApprovalState;
  readonly required: true;
  readonly approvedAt: string | null;
  readonly approvedBy: string | null;
  readonly note: string;
}

export interface CqrsCertificationContract {
  readonly certificationId: string;
  readonly architectureVersion: string;
  readonly certificationVersion: string;
  readonly scope: readonly string[];
  readonly evaluatedAt: string;
  readonly evaluatedBy: string;
  readonly environment: 'local-architectural' | 'staging' | 'unknown';
  readonly domains: readonly string[];
  readonly components: readonly string[];
  readonly checks: readonly CqrsCertificationGateOutcome[];
  readonly evidence: readonly CqrsCertificationEvidence[];
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
  readonly status: CqrsCertificationStatus;
  readonly humanApprovalRequired: true;
  readonly autoPromotionAllowed: false;
  readonly byReadModel: Readonly<Record<string, CqrsCertificationStatus>>;
  readonly staging: CqrsStagingEvidenceContract;
  readonly humanApproval: CqrsHumanApprovalGate;
  readonly recommendation: CqrsCertificationRecommendation;
  readonly statement: string;
}

export interface CqrsRecertificationTrigger {
  readonly triggerId: string;
  readonly description: string;
}

export const CQRS_RECERTIFICATION_TRIGGERS: readonly CqrsRecertificationTrigger[] = Object.freeze([
  Object.freeze({ triggerId: 'event_model_change', description: 'Mudança no Event Model' }),
  Object.freeze({ triggerId: 'registry_change', description: 'Mudança no Registry' }),
  Object.freeze({ triggerId: 'tenant_scope_change', description: 'Mudança no Tenant Scope' }),
  Object.freeze({ triggerId: 'reducer_change', description: 'Mudança nos reducers' }),
  Object.freeze({ triggerId: 'builder_change', description: 'Mudança nos builders' }),
  Object.freeze({ triggerId: 'snapshot_change', description: 'Mudança nos snapshots' }),
  Object.freeze({ triggerId: 'cache_change', description: 'Mudança no cache' }),
  Object.freeze({ triggerId: 'production_guards_change', description: 'Mudança nos Production Guards' }),
  Object.freeze({ triggerId: 'new_read_model', description: 'Criação de novo Read Model' }),
  Object.freeze({ triggerId: 'architecture_version_change', description: 'Alteração de versão da arquitetura' }),
]);
