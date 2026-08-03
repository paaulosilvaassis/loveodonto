/**
 * @module domain-events/staging-activation/readonly-verification/readonlyVerificationRunner
 * runAuthorizedStagingReadonlyVerification — sem mutation; sem remote default.
 */

import { processStagingAuthorizationIntake } from '../authorization-intake/stagingAuthorizationIntakeService.js';
import { buildPendingStageOneExecutionApproval } from '../authorization-intake/stageOneExecutionApproval.js';
import {
  buildPendingReadonlyVerificationApproval,
  validateReadonlyVerificationApproval,
} from './readonlyVerificationApproval.js';
import {
  buildSafeReadonlyCapabilities,
  validateReadonlyCapabilities,
} from './readonlyVerificationCapabilities.js';
import { evaluateReadonlyVerificationEntryConditions } from './readonlyVerificationEntryConditions.js';
import { collectEvidenceFromProbes } from './readonlyVerificationEvidence.js';
import {
  evaluateReadonlyVerificationCompletionGate,
  recommendationFromReadonlyGate,
} from './readonlyVerificationFinalGate.js';
import {
  ALLOWED_READONLY_PROBES,
  assertProbeAllowlist,
} from './readonlyVerificationProbeRegistry.js';
import { runSequentialLocalProbes } from './readonlyVerificationProbes.js';
import { createReadonlyVerificationSession } from './readonlyVerificationSession.js';
import type {
  ReadonlyProbeId,
  ReadonlyVerificationApproval,
  ReadonlyVerificationCapabilities,
  ReadonlyVerificationFinalGate,
  ReadonlyVerificationRecommendation,
  ReadonlyVerificationResult,
  ReadonlyVerificationSession,
  ReadonlyVerificationSessionMode,
} from './readonlyVerificationTypes.js';

export interface ReadonlyVerificationRunnerInput {
  /** Input envelope da Phase 8.9 — se omitido/null → blocked. */
  authorizationInput?: unknown | null;
  verificationApproval?: ReadonlyVerificationApproval | null;
  mode?: ReadonlyVerificationSessionMode;
  operator?: string | null;
  capabilities?: Partial<ReadonlyVerificationCapabilities>;
  /** Contexto local/simulado para probes (nunca abre remoto nesta phase default). */
  localContext?: {
    environmentId?: string | null;
    host?: string | null;
    projectRef?: string | null;
    environmentType?: string | null;
    isProduction?: boolean;
    isStaging?: boolean;
    pilotTenantIds?: readonly string[];
    approvedTenantIds?: readonly string[];
    knownTenantIds?: readonly string[];
    architectureVersion?: string | null;
    certificationStatus?: string | null;
    inspectorAvailable?: boolean;
    healthAvailable?: boolean;
    flagSnapshot?: Partial<Record<string, boolean>>;
  };
  /** Forçar openRemote — sempre rejeitado nesta phase se true sem dados reais. */
  attemptRemote?: boolean;
  probes?: readonly ReadonlyProbeId[];
}

export interface ReadonlyVerificationRunnerResult {
  readonly session: ReadonlyVerificationSession;
  readonly entrySatisfied: boolean;
  readonly finalGate: ReadonlyVerificationFinalGate;
  readonly recommendation: ReadonlyVerificationRecommendation;
  readonly result: ReadonlyVerificationResult;
  readonly executionApprovalStillPending: true;
  readonly stageOneBlocked: true;
  readonly remoteConnectionOpened: false;
  readonly remoteReadsExecuted: false;
  readonly remoteWritesExecuted: false;
  readonly flagsChanged: false;
}

function finishBlocked(
  blockers: readonly string[],
  reason: 'missing_data' | 'missing_approval' | 'capabilities',
  mode: ReadonlyVerificationSessionMode,
  approval: ReadonlyVerificationApproval | null,
  caps: ReadonlyVerificationCapabilities,
  result: ReadonlyVerificationResult = 'blocked',
): ReadonlyVerificationRunnerResult {
  const session = createReadonlyVerificationSession({
    mode,
    verificationApprovalId: approval?.verificationApprovalId ?? null,
    capabilities: caps,
    result,
    blockers,
    finishedAt: new Date().toISOString(),
  });
  const finalGate = evaluateReadonlyVerificationCompletionGate({
    result,
    simulationOnly: session.simulationOnly,
    entrySatisfied: false,
  });
  return Object.freeze({
    session,
    entrySatisfied: false,
    finalGate,
    recommendation: recommendationFromReadonlyGate(finalGate, result, reason),
    result,
    executionApprovalStillPending: true as const,
    stageOneBlocked: true as const,
    remoteConnectionOpened: false as const,
    remoteReadsExecuted: false as const,
    remoteWritesExecuted: false as const,
    flagsChanged: false as const,
  });
}

/**
 * Gate oficial de verificação read-only.
 * Default / sem dados → blocked. Nunca abre connection remota nesta implementação Phase 8.10.
 */
export function runAuthorizedStagingReadonlyVerification(
  input: ReadonlyVerificationRunnerInput = {},
): ReadonlyVerificationRunnerResult {
  const mode: ReadonlyVerificationSessionMode = input.mode || 'local-static';
  const simulationOnly = mode === 'local-simulated' || mode === 'local-static';
  const approval = input.verificationApproval
    ?? buildPendingReadonlyVerificationApproval(null);
  const caps = buildSafeReadonlyCapabilities(input.capabilities || {});

  // Intake default vazio
  const intake = processStagingAuthorizationIntake(
    input.authorizationInput === undefined ? null : input.authorizationInput,
  );

  const env = intake.input?.environmentDeclaration;
  const human = intake.input?.humanApproval;
  const tenants = intake.input?.tenantSelection;
  const stage1 = intake.input?.stageOneAuthorization;
  const pilots = Array.isArray(tenants?.pilotTenantIds)
    ? (tenants!.pilotTenantIds as string[]).map(String)
    : (input.localContext?.pilotTenantIds || []);

  const envStructurallyValid = Boolean(
    env
    && env.host
    && env.projectRef
    && env.owner
    && env.declaredBy
    && env.environmentType === 'staging'
    && env.isProduction !== true
  ) || Boolean(
    // simulação local com contexto explícito
    simulationOnly
    && input.localContext?.host
    && input.localContext?.projectRef
    && input.localContext?.environmentType === 'staging',
  );

  const entry = evaluateReadonlyVerificationEntryConditions({
    authorizationCompleteness: intake.completeness,
    humanApprovalStatus: human ? String(human.status || 'pending') : 'pending',
    readonlyRemoteStatus: intake.readonlyRemoteStatus,
    readonlyAccessStatus: intake.input?.readonlyAccessDeclaration
      ? String(intake.input.readonlyAccessDeclaration.status || 'unverified')
      : 'unverified',
    environmentStructurallyValid: envStructurallyValid,
    pilotTenantIds: pilots,
    stageOneAuthorizationStatus: stage1
      ? String(stage1.status || 'pending')
      : 'pending',
    verificationApproval: approval,
    packageEnvironmentId: env ? String(env.environmentId || '') : input.localContext?.environmentId ?? null,
    packageTenantIds: pilots,
  });

  // Sem dados / entry fail → blocked (exceto local-simulated que permite dry-run estrutural)
  if (!entry.allSatisfied && mode !== 'local-simulated') {
    const reason = !entry.remoteReadonlyVerificationApproved
      && entry.blockers.every((b) => !/authorizationCompleteness|humanApproval|readonly|environment|pilot|stageOne/i.test(b) || /verification approval|remoteReadonly/i.test(b))
      ? 'missing_approval'
      : intake.completeness === 'empty' || intake.completeness === 'incomplete'
        ? 'missing_data'
        : entry.remoteReadonlyVerificationApproved
          ? 'missing_data'
          : 'missing_approval';
    // Prefer missing_data when completeness empty
    const r = intake.completeness === 'empty' || intake.input == null
      ? 'missing_data'
      : !entry.remoteReadonlyVerificationApproved
        ? 'missing_approval'
        : 'missing_data';
    return finishBlocked(entry.blockers, r, mode, approval, caps, 'blocked');
  }

  // Capabilidades
  const capCheck = validateReadonlyCapabilities(caps);
  if (!capCheck.ok) {
    return finishBlocked(
      capCheck.blockers,
      'capabilities',
      mode,
      approval,
      caps,
      'blocked_readonly_not_guaranteed',
    );
  }

  // attemptRemote nesta phase: nunca abrir
  if (input.attemptRemote === true) {
    return finishBlocked(
      ['remote connection não autorizada nesta Phase 8.10 sem sessão remota dedicada'],
      'missing_approval',
      mode,
      approval,
      caps,
      'blocked',
    );
  }

  const probeIds = (input.probes || [...ALLOWED_READONLY_PROBES]) as ReadonlyProbeId[];
  const allow = assertProbeAllowlist(probeIds);
  if (!allow.ok) {
    return finishBlocked(
      [
        ...allow.unknown.map((p) => `probe desconhecido: ${p}`),
        ...allow.forbiddenOps.map((p) => `operação proibida: ${p}`),
      ],
      'capabilities',
      mode,
      approval,
      caps,
      'blocked',
    );
  }

  // Para local-simulated sem intake completo: usar localContext
  if (mode === 'local-simulated' && !entry.allSatisfied) {
    // dry-run permitido mas marcado simulationOnly; gate não vira verified
  } else if (mode === 'authorized-staging-readonly') {
    // Sem infraestrutura remota nesta phase → blocked se aprovaria remote
    const approvalOk = validateReadonlyVerificationApproval(
      approval,
      String(env?.environmentId || input.localContext?.environmentId || '') || null,
      pilots,
    );
    if (!approvalOk.ok) {
      return finishBlocked(approvalOk.blockers, 'missing_approval', mode, approval, caps);
    }
    // Phase 8.10: modo authorized-staging-readonly sem connector remoto → blocked
    return finishBlocked(
      [
        'authorized-staging-readonly requer connector read-only remoto (não implementado nesta phase — zero conexão aberta)',
      ],
      'missing_approval',
      mode,
      approval,
      caps,
      'blocked',
    );
  }

  const ctx = {
    environmentId: String(env?.environmentId || input.localContext?.environmentId || '') || null,
    host: String(env?.host || input.localContext?.host || '') || null,
    projectRef: String(env?.projectRef || input.localContext?.projectRef || '') || null,
    environmentType: String(env?.environmentType || input.localContext?.environmentType || '') || null,
    isProduction: Boolean(env?.isProduction ?? input.localContext?.isProduction ?? false),
    isStaging: Boolean(env?.isStaging ?? input.localContext?.isStaging ?? true),
    pilotTenantIds: pilots.length ? pilots : (input.localContext?.pilotTenantIds || []),
    approvedTenantIds: approval.tenantIds.length
      ? [...approval.tenantIds]
      : (input.localContext?.approvedTenantIds || pilots),
    knownTenantIds: input.localContext?.knownTenantIds,
    architectureVersion: input.localContext?.architectureVersion ?? null,
    certificationStatus: input.localContext?.certificationStatus ?? 'certified',
    inspectorAvailable: input.localContext?.inspectorAvailable ?? true,
    healthAvailable: input.localContext?.healthAvailable ?? true,
    flagSnapshot: input.localContext?.flagSnapshot,
    simulationOnly: true,
  };

  const { probes, productionDetected } = runSequentialLocalProbes(probeIds, ctx);

  let result: ReadonlyVerificationResult = 'passed';
  if (productionDetected) result = 'failed_production_detected';
  else if (probes.some((p) => p.status === 'failed')) result = 'failed';
  else if (probes.some((p) => p.status === 'blocked')) result = 'blocked';
  else if (probes.some((p) => p.status === 'manual_required' || p.status === 'warning')) {
    result = mode === 'local-simulated' ? 'warning' : 'manual_required';
  }

  // Draft session id for evidence
  const draft = createReadonlyVerificationSession({
    mode,
    verificationApprovalId: approval.verificationApprovalId,
    authorizationPackageId: intake.input?.packageId ?? null,
    environmentId: ctx.environmentId,
    tenantIds: ctx.pilotTenantIds,
    operator: input.operator ?? null,
    capabilities: caps,
    result,
  });
  const evidence = collectEvidenceFromProbes(draft.sessionId, probes, input.operator ?? null);
  const session = createReadonlyVerificationSession({
    mode,
    verificationApprovalId: approval.verificationApprovalId,
    authorizationPackageId: intake.input?.packageId ?? null,
    environmentId: ctx.environmentId,
    tenantIds: ctx.pilotTenantIds,
    operator: input.operator ?? null,
    capabilities: caps,
    probes,
    evidence,
    blockers: Object.freeze([
      ...entry.blockers.filter(() => mode === 'local-simulated'),
      ...probes.flatMap((p) => p.blockers),
    ]),
    warnings: Object.freeze(probes.flatMap((p) => [...p.warnings])),
    result,
    finishedAt: new Date().toISOString(),
  });

  const finalGate = evaluateReadonlyVerificationCompletionGate({
    result,
    simulationOnly: true, // Phase 8.10 local probes nunca contam como remote verified
    entrySatisfied: entry.allSatisfied,
  });

  // Execution approval permanece pending
  void buildPendingStageOneExecutionApproval(intake.input?.packageId ?? null);

  return Object.freeze({
    session,
    entrySatisfied: entry.allSatisfied,
    finalGate,
    recommendation: recommendationFromReadonlyGate(
      finalGate,
      result,
      result === 'failed' || result === 'failed_production_detected' ? 'failed' : 'other',
    ),
    result,
    executionApprovalStillPending: true as const,
    stageOneBlocked: true as const,
    remoteConnectionOpened: false as const,
    remoteReadsExecuted: false as const,
    remoteWritesExecuted: false as const,
    flagsChanged: false as const,
  });
}
