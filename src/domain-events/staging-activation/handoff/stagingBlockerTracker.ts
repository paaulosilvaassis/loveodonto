/**
 * @module domain-events/staging-activation/handoff/stagingBlockerTracker
 */

import type {
  StagingBlockerId,
  StagingHandoffBlocker,
  StagingHandoffRoleId,
} from './stagingHandoffTypes.js';

interface BlockerDef {
  blockerId: StagingBlockerId;
  category: string;
  description: string;
  severity: StagingHandoffBlocker['severity'];
  ownerRole: StagingHandoffRoleId;
  resolutionRequired: string;
}

const INITIAL: readonly BlockerDef[] = Object.freeze([
  {
    blockerId: 'MISSING_STAGING_ENVIRONMENT',
    category: 'environment',
    description: 'Ambiente staging real não declarado',
    severity: 'critical',
    ownerRole: 'staging_environment_owner',
    resolutionRequired: 'Environment Declaration completa e não-produção',
  },
  {
    blockerId: 'MISSING_ENVIRONMENT_OWNER',
    category: 'environment',
    description: 'Owner/declarant do ambiente ausente',
    severity: 'critical',
    ownerRole: 'staging_environment_owner',
    resolutionRequired: 'Atribuir owner e declaredBy reais',
  },
  {
    blockerId: 'MISSING_HUMAN_APPROVAL',
    category: 'approval',
    description: 'Human Approval pendente',
    severity: 'critical',
    ownerRole: 'stage_one_approver',
    resolutionRequired: 'Aprovação humana assinada Stage 1',
  },
  {
    blockerId: 'MISSING_PILOT_TENANTS',
    category: 'tenants',
    description: 'Pilot tenants ausentes',
    severity: 'critical',
    ownerRole: 'tenant_owner',
    resolutionRequired: 'IDs explícitos (sem wildcard)',
  },
  {
    blockerId: 'READONLY_ACCESS_UNVERIFIED',
    category: 'readonly',
    description: 'Acesso read-only não verificado',
    severity: 'critical',
    ownerRole: 'security_readonly_verifier',
    resolutionRequired: 'Declaração + verificação read-only',
  },
  {
    blockerId: 'MISSING_READONLY_VERIFICATION_APPROVAL',
    category: 'approval',
    description: 'Readonly Verification Approval pendente',
    severity: 'critical',
    ownerRole: 'security_readonly_verifier',
    resolutionRequired: 'Aprovação própria de inspeção remota',
  },
  {
    blockerId: 'REMOTE_VERIFICATION_NOT_PERFORMED',
    category: 'verification',
    description: 'Verificação remota não realizada',
    severity: 'high',
    ownerRole: 'security_readonly_verifier',
    resolutionRequired: 'Sessão authorized-staging-readonly',
  },
  {
    blockerId: 'MISSING_STAGE_ONE_AUTHORIZATION',
    category: 'approval',
    description: 'Stage 1 Authorization pendente',
    severity: 'critical',
    ownerRole: 'stage_one_approver',
    resolutionRequired: 'Stage 1 Authorization (3 flags)',
  },
  {
    blockerId: 'MISSING_EXECUTION_APPROVAL',
    category: 'approval',
    description: 'StageOneExecutionApproval pendente',
    severity: 'critical',
    ownerRole: 'stage_one_approver',
    resolutionRequired: 'Execution Approval separado',
  },
  {
    blockerId: 'ROLLBACK_NOT_HUMAN_REVIEWED',
    category: 'rollback',
    description: 'Rollback não revisado por humano',
    severity: 'high',
    ownerRole: 'rollback_operator',
    resolutionRequired: 'Rollback acknowledgement reviewed=true',
  },
  {
    blockerId: 'RISKS_NOT_HUMAN_ACCEPTED',
    category: 'risks',
    description: 'Riscos não aceitos individualmente',
    severity: 'high',
    ownerRole: 'business_owner',
    resolutionRequired: 'Risk acknowledgements individuais',
  },
]);

/**
 * Não resolve blocker sem evidência real.
 */
export function buildStagingBlockerTracker(
  overrides: Partial<Record<StagingBlockerId, Partial<StagingHandoffBlocker>>> = {},
): readonly StagingHandoffBlocker[] {
  const now = new Date().toISOString();
  return Object.freeze(
    INITIAL.map((d) => {
      const o = overrides[d.blockerId] || {};
      // Rejeitar resolução sem evidência
      let status = o.status || 'open';
      let resolvedAt = o.resolvedAt ?? null;
      let resolutionEvidence = o.resolutionEvidence ?? null;
      if (status === 'resolved' && !resolutionEvidence) {
        status = 'open';
        resolvedAt = null;
        resolutionEvidence = null;
      }
      return Object.freeze({
        blockerId: d.blockerId,
        category: d.category,
        description: d.description,
        severity: d.severity,
        ownerRole: d.ownerRole,
        resolutionRequired: d.resolutionRequired,
        status,
        createdAt: o.createdAt || now,
        resolvedAt,
        resolutionEvidence,
      });
    }),
  );
}

export function openBlockerCount(blockers: readonly StagingHandoffBlocker[]): number {
  return blockers.filter((b) => b.status === 'open' || b.status === 'waiting_external_input').length;
}

export const INITIAL_HANDOFF_BLOCKER_IDS = Object.freeze(INITIAL.map((b) => b.blockerId));
