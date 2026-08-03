/**
 * @module domain-events/observability/domainEventInspector
 * @description API interna de inspeção in-memory — Phase 7.3.
 * Somente testes / desenvolvimento. Sem endpoints HTTP.
 */

import { getDomainEventMetrics, type DomainEventMetricsSnapshot } from './domainEventMetrics';
import {
  getDomainEventTraces,
  findDomainEventTracesByCorrelation,
  findDomainEventTracesByAggregate,
  findDomainEventTracesByEventType,
  findDomainEventTracesByTenant,
  type DomainEventTraceEntry,
} from './domainEventTrace';
import {
  getDomainEventTimelineFlat,
  buildDomainEventTimelineTree,
  getDomainEventTimelineByCorrelation,
  type DomainEventTimelineNode,
} from './domainEventTimeline';
import { runDomainEventDiagnostics, type DomainEventDiagnosticsReport } from './domainEventDiagnostics';
import { getDomainEventHealth, type DomainEventHealthReport } from './domainEventHealth';
import {
  getEventAuditProjection,
  getEventAuditProjectionCount,
  findEventAuditProjectionByCorrelation,
  findEventAuditProjectionByEventType,
  findEventAuditProjectionByAggregate,
  type EventAuditProjectionRecord,
} from '../consumers/eventAuditProjectionStore.js';
import { getDomainEventConsumerMetrics } from '../consumers/domainEventConsumerMetrics.js';
import { getDomainEventConsumerHealth } from '../consumers/domainEventConsumerHealth.js';
import {
  inspectAnalyticsProjections,
  inspectAnalyticsProjectionById,
  inspectAnalyticsProjectionCounters,
  type AnalyticsProjectionInspectorSnapshot,
} from '../projections/analyticsProjectionInspector.js';
import type { AnalyticsProjectionId } from '../projections/analyticsProjectionTypes.js';
import {
  inspectLeadAnalyticsReadModel,
  type LeadAnalyticsInspectorSnapshot,
} from '../read-models/leadAnalyticsInspector.js';
import {
  inspectReadModelFoundation,
  type ReadModelFoundationInspectorSnapshot,
} from '../read-models/shared/readModelInspector.js';
import {
  getCqrsArchitectureCertificationHealth,
  getCqrsCertificationHistory,
  LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION,
} from '../certification/index.js';
import {
  buildControlledStagingActivationPlanReport,
  buildControlledStagingPreflightReport,
  buildStagingAuthorizationPackageReport,
  buildStagingAuthorizationIntakeReport,
  buildAuthorizedStagingReadonlyVerificationReport,
  buildStagingAuthorizationHandoffReport,
  buildHandoffOwnerAssignmentReport,
} from '../staging-activation/index.js';

export interface DomainEventInspectorSnapshot {
  metrics: DomainEventMetricsSnapshot;
  traces: DomainEventTraceEntry[];
  timelineFlat: DomainEventTraceEntry[];
  health: DomainEventHealthReport;
  diagnostics: DomainEventDiagnosticsReport;
  auditProjection: EventAuditProjectionRecord[];
  auditProjectionCount: number;
  consumerHealth: ReturnType<typeof getDomainEventConsumerHealth>;
  consumerMetrics: ReturnType<typeof getDomainEventConsumerMetrics>;
  analyticsProjections: AnalyticsProjectionInspectorSnapshot;
  leadAnalyticsReadModel: LeadAnalyticsInspectorSnapshot;
  cqrsReadModelFoundation: ReadModelFoundationInspectorSnapshot;
  /** Phase 8.5 — snapshot leve; report completo via inspectCqrsArchitectureCertification. */
  cqrsArchitectureCertification: {
    architectureVersion: typeof LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION;
    health: ReturnType<typeof getCqrsArchitectureCertificationHealth>;
    historyCount: number;
  };
  /** Phase 8.6 — plano de staging (sem ativação remota). */
  controlledStagingActivation: {
    planStatus: string;
    recommendation: string;
    humanApprovalStatus: string;
    remoteActivationAllowed: false;
  };
  /** Phase 8.7 — preflight (sem ativação). */
  controlledStagingPreflight: {
    result: string;
    recommendation: string;
    remoteActionsExecuted: false;
    flagsChanged: false;
  };
  /** Phase 8.8 — authorization package (sem execução). */
  stagingAuthorizationPackage: {
    packageStatus: string;
    readinessStatus: string;
    recommendation: string;
    humanApprovalStatus: string;
    remoteActionsExecuted: false;
    flagsChanged: false;
  };
  /** Phase 8.9 — authorization data intake (sem execução). */
  stagingAuthorizationIntake: {
    completeness: string;
    finalGate: string;
    recommendation: string;
    executionApprovalStatus: string;
    remoteActionsExecuted: false;
    flagsChanged: false;
  };
  /** Phase 8.10 — read-only verification gate (sem Stage 1). */
  stagingReadonlyVerification: {
    result: string;
    finalGate: string;
    recommendation: string;
    simulationOnly: boolean;
    remoteConnectionOpened: false;
    remoteReadsExecuted: false;
    remoteWritesExecuted: false;
    flagsChanged: false;
  };
  /** Phase 8.11 — authorization handoff (sem remoto / Stage 1). */
  stagingAuthorizationHandoff: {
    handoffStatus: string;
    readiness: string;
    recommendation: string;
    nextAllowedAction: string;
    ownersAssigned: number;
    openBlockers: number;
    remoteConnectionOpened: false;
    flagsChanged: false;
    stageOneExecuted: false;
  };
  /** Phase 8.12 — owner assignment input (sem approvals / remoto). */
  stagingHandoffOwnerAssignments: {
    result: string;
    handoffStatus: string;
    completeness: string;
    readiness: string;
    recommendation: string;
    nextAllowedAction: string;
    ownersAssigned: number;
    ownersMissing: number;
    approvalsUnchanged: true;
    remoteConnectionOpened: false;
    flagsChanged: false;
    stageOneExecuted: false;
  };
  inspectedAt: string;
}

/**
 * Snapshot completo do estado in-memory de observabilidade + projections + read models.
 * Uso exclusivo em testes / DEV — não expor via HTTP.
 */
export function inspectDomainEvents(): DomainEventInspectorSnapshot {
  const traces = getDomainEventTraces();
  return {
    metrics: getDomainEventMetrics(),
    traces,
    timelineFlat: getDomainEventTimelineFlat(),
    health: getDomainEventHealth(),
    diagnostics: runDomainEventDiagnostics({ traces }),
    auditProjection: [...getEventAuditProjection()],
    auditProjectionCount: getEventAuditProjectionCount(),
    consumerHealth: getDomainEventConsumerHealth(),
    consumerMetrics: getDomainEventConsumerMetrics(),
    analyticsProjections: inspectAnalyticsProjections(),
    leadAnalyticsReadModel: inspectLeadAnalyticsReadModel(),
    cqrsReadModelFoundation: inspectReadModelFoundation(),
    cqrsArchitectureCertification: {
      architectureVersion: LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION,
      health: getCqrsArchitectureCertificationHealth(),
      historyCount: getCqrsCertificationHistory().length,
    },
    controlledStagingActivation: (() => {
      const r = buildControlledStagingActivationPlanReport({}, {}, { recordHistory: false });
      return {
        planStatus: r.plan.status,
        recommendation: r.recommendation,
        humanApprovalStatus: r.humanApprovalStatus,
        remoteActivationAllowed: false as const,
      };
    })(),
    controlledStagingPreflight: (() => {
      const r = buildControlledStagingPreflightReport({}, { recordHistory: false });
      return {
        result: r.result,
        recommendation: r.recommendation,
        remoteActionsExecuted: false as const,
        flagsChanged: false as const,
      };
    })(),
    stagingAuthorizationPackage: (() => {
      const r = buildStagingAuthorizationPackageReport({}, {}, { recordHistory: false });
      return {
        packageStatus: r.packageStatus,
        readinessStatus: r.readiness.status,
        recommendation: r.recommendation,
        humanApprovalStatus: r.humanApproval.status,
        remoteActionsExecuted: false as const,
        flagsChanged: false as const,
      };
    })(),
    stagingAuthorizationIntake: (() => {
      const r = buildStagingAuthorizationIntakeReport(null, { recordHistory: false });
      return {
        completeness: r.completeness,
        finalGate: r.finalGate,
        recommendation: r.recommendation,
        executionApprovalStatus: r.intake.executionApproval.status,
        remoteActionsExecuted: false as const,
        flagsChanged: false as const,
      };
    })(),
    stagingReadonlyVerification: (() => {
      const r = buildAuthorizedStagingReadonlyVerificationReport({}, { recordHistory: false });
      return {
        result: r.result,
        finalGate: r.finalGate,
        recommendation: r.recommendation,
        simulationOnly: r.simulationOnly,
        remoteConnectionOpened: false as const,
        remoteReadsExecuted: false as const,
        remoteWritesExecuted: false as const,
        flagsChanged: false as const,
      };
    })(),
    stagingAuthorizationHandoff: (() => {
      const r = buildStagingAuthorizationHandoffReport({}, { recordHistory: false });
      return {
        handoffStatus: r.handoffStatus,
        readiness: r.readiness,
        recommendation: r.recommendation,
        nextAllowedAction: r.nextAllowedAction,
        ownersAssigned: r.ownersAssigned,
        openBlockers: r.openBlockers,
        remoteConnectionOpened: false as const,
        flagsChanged: false as const,
        stageOneExecuted: false as const,
      };
    })(),
    stagingHandoffOwnerAssignments: (() => {
      const r = buildHandoffOwnerAssignmentReport(null, { recordHistory: false });
      return {
        result: r.result,
        handoffStatus: r.handoffStatus,
        completeness: r.completeness,
        readiness: r.readiness,
        recommendation: r.recommendation,
        nextAllowedAction: r.nextAllowedAction,
        ownersAssigned: r.ownersAssigned,
        ownersMissing: r.ownersMissing,
        approvalsUnchanged: true as const,
        remoteConnectionOpened: false as const,
        flagsChanged: false as const,
        stageOneExecuted: false as const,
      };
    })(),
    inspectedAt: new Date().toISOString(),
  };
}

export function inspectDomainEventByCorrelation(correlationId: string): {
  traces: DomainEventTraceEntry[];
  timeline: DomainEventTraceEntry[];
  tree: DomainEventTimelineNode[];
} {
  return {
    traces: findDomainEventTracesByCorrelation(correlationId),
    timeline: getDomainEventTimelineByCorrelation(correlationId),
    tree: buildDomainEventTimelineTree(correlationId),
  };
}

export function inspectDomainEventByAggregate(aggregateType: string, aggregateId: string) {
  return findDomainEventTracesByAggregate(aggregateType, aggregateId);
}

export function inspectDomainEventByType(eventType: string) {
  return findDomainEventTracesByEventType(eventType);
}

export function inspectDomainEventByTenant(tenantId: string) {
  return findDomainEventTracesByTenant(tenantId);
}

export function inspectDomainEventHealth(): DomainEventHealthReport {
  return getDomainEventHealth();
}

export function inspectDomainEventDiagnostics(candidate?: {
  type?: string;
  payload?: unknown;
  correlationId?: string | null;
  causationId?: string | null;
  aggregateId?: string | null;
}): DomainEventDiagnosticsReport {
  return runDomainEventDiagnostics({
    traces: getDomainEventTraces(),
    candidate,
  });
}

/** Consulta da projeção de auditoria (Phase 7.7) — API interna. */
export function inspectEventAuditProjection(): EventAuditProjectionRecord[] {
  return [...getEventAuditProjection()];
}

export function inspectEventAuditProjectionByType(eventType: string) {
  return findEventAuditProjectionByEventType(eventType);
}

export function inspectEventAuditProjectionByCorrelation(correlationId: string) {
  return findEventAuditProjectionByCorrelation(correlationId);
}

export function inspectEventAuditProjectionByAggregate(
  aggregateType: string,
  aggregateId: string,
) {
  return findEventAuditProjectionByAggregate(aggregateType, aggregateId);
}

/** Analytics projections (Phase 7.8 / 8.3) — API interna. */
export function inspectDomainEventAnalyticsProjections(
  flagsInput?: Parameters<typeof inspectAnalyticsProjections>[0],
  options?: Parameters<typeof inspectAnalyticsProjections>[1],
) {
  return inspectAnalyticsProjections(flagsInput, options);
}

export function inspectDomainEventAnalyticsProjectionById(
  projectionId: AnalyticsProjectionId,
  tenantId?: string | null,
) {
  return inspectAnalyticsProjectionById(projectionId, tenantId);
}

export function inspectDomainEventAnalyticsProjectionCounters(
  projectionId: AnalyticsProjectionId,
  tenantId?: string | null,
) {
  return inspectAnalyticsProjectionCounters(projectionId, tenantId);
}

/** Lead Analytics Read Model (Phase 7.9) — API interna. */
export function inspectDomainEventLeadAnalyticsReadModel(
  flagsInput?: Parameters<typeof inspectLeadAnalyticsReadModel>[0],
) {
  return inspectLeadAnalyticsReadModel(flagsInput);
}

/** CQRS Read Model Foundation (Phase 8.0) — API interna. */
export function inspectDomainEventCqrsReadModelFoundation(
  flagsInput?: Parameters<typeof inspectReadModelFoundation>[0],
) {
  return inspectReadModelFoundation(flagsInput);
}

/** CQRS Architecture Certification (Phase 8.5) — API interna. */
export function inspectDomainEventCqrsArchitectureCertification(
  flagsInput?: Parameters<typeof getCqrsArchitectureCertificationHealth>[0],
) {
  return {
    architectureVersion: LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION,
    health: getCqrsArchitectureCertificationHealth(flagsInput),
    historyCount: getCqrsCertificationHistory().length,
  };
}
