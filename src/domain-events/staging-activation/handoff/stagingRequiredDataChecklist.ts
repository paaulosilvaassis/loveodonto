/**
 * @module domain-events/staging-activation/handoff/stagingRequiredDataChecklist
 */

import type { StagingRequiredDataItem } from './stagingHandoffTypes.js';

function item(
  partial: StagingRequiredDataItem,
): StagingRequiredDataItem {
  return Object.freeze(partial);
}

/** Checklist oficial — sem dados reais todos começam missing. */
export function buildStagingRequiredDataChecklist(
  overrides: Partial<Record<string, Partial<StagingRequiredDataItem>>> = {},
): readonly StagingRequiredDataItem[] {
  const base: StagingRequiredDataItem[] = [
    item({
      itemId: 'env.environmentId',
      category: 'environment',
      description: 'environmentId',
      required: true,
      sourceContract: 'StagingEnvironmentDeclaration',
      status: 'missing',
      providedBy: null,
      providedAt: null,
      validationResult: null,
      blockerWhenMissing: 'MISSING_STAGING_ENVIRONMENT',
    }),
    item({
      itemId: 'env.host',
      category: 'environment',
      description: 'host (não produção)',
      required: true,
      sourceContract: 'StagingEnvironmentDeclaration',
      status: 'missing',
      providedBy: null,
      providedAt: null,
      validationResult: null,
      blockerWhenMissing: 'MISSING_STAGING_ENVIRONMENT',
    }),
    item({
      itemId: 'env.projectRef',
      category: 'environment',
      description: 'projectRef (não produção)',
      required: true,
      sourceContract: 'StagingEnvironmentDeclaration',
      status: 'missing',
      providedBy: null,
      providedAt: null,
      validationResult: null,
      blockerWhenMissing: 'MISSING_STAGING_ENVIRONMENT',
    }),
    item({
      itemId: 'env.owner',
      category: 'environment',
      description: 'owner / declaredBy',
      required: true,
      sourceContract: 'StagingEnvironmentDeclaration',
      status: 'missing',
      providedBy: null,
      providedAt: null,
      validationResult: null,
      blockerWhenMissing: 'MISSING_ENVIRONMENT_OWNER',
    }),
    item({
      itemId: 'tenants.pilotTenantIds',
      category: 'tenants',
      description: 'pilotTenantIds explícitos',
      required: true,
      sourceContract: 'StagingTenantSelection',
      status: 'missing',
      providedBy: null,
      providedAt: null,
      validationResult: null,
      blockerWhenMissing: 'MISSING_PILOT_TENANTS',
    }),
    item({
      itemId: 'readonly.declaration',
      category: 'readonly',
      description: 'read-only declaration (mutation/migration/storage/secrets blocked)',
      required: true,
      sourceContract: 'StagingReadonlyAccessDeclaration',
      status: 'missing',
      providedBy: null,
      providedAt: null,
      validationResult: null,
      blockerWhenMissing: 'READONLY_ACCESS_UNVERIFIED',
    }),
    item({
      itemId: 'auth.humanApproval',
      category: 'authorizations',
      description: 'Human Approval',
      required: true,
      sourceContract: 'StagingHumanApprovalForm',
      status: 'missing',
      providedBy: null,
      providedAt: null,
      validationResult: null,
      blockerWhenMissing: 'MISSING_HUMAN_APPROVAL',
    }),
    item({
      itemId: 'auth.stageOneAuthorization',
      category: 'authorizations',
      description: 'Stage 1 Authorization',
      required: true,
      sourceContract: 'StageOneAuthorization',
      status: 'missing',
      providedBy: null,
      providedAt: null,
      validationResult: null,
      blockerWhenMissing: 'MISSING_STAGE_ONE_AUTHORIZATION',
    }),
    item({
      itemId: 'auth.readonlyVerificationApproval',
      category: 'authorizations',
      description: 'Read-only Verification Approval',
      required: true,
      sourceContract: 'ReadonlyVerificationApproval',
      status: 'missing',
      providedBy: null,
      providedAt: null,
      validationResult: null,
      blockerWhenMissing: 'MISSING_READONLY_VERIFICATION_APPROVAL',
    }),
    item({
      itemId: 'auth.executionApproval',
      category: 'authorizations',
      description: 'Stage 1 Execution Approval',
      required: true,
      sourceContract: 'StageOneExecutionApproval',
      status: 'missing',
      providedBy: null,
      providedAt: null,
      validationResult: null,
      blockerWhenMissing: 'MISSING_EXECUTION_APPROVAL',
    }),
    item({
      itemId: 'auth.rollbackAck',
      category: 'authorizations',
      description: 'Rollback Acknowledgement',
      required: true,
      sourceContract: 'StagingRollbackAcknowledgement',
      status: 'missing',
      providedBy: null,
      providedAt: null,
      validationResult: null,
      blockerWhenMissing: 'ROLLBACK_NOT_HUMAN_REVIEWED',
    }),
    item({
      itemId: 'auth.risksAck',
      category: 'authorizations',
      description: 'Risk Acknowledgements',
      required: true,
      sourceContract: 'StagingRiskAcknowledgement',
      status: 'missing',
      providedBy: null,
      providedAt: null,
      validationResult: null,
      blockerWhenMissing: 'RISKS_NOT_HUMAN_ACCEPTED',
    }),
    item({
      itemId: 'auth.evidenceAck',
      category: 'authorizations',
      description: 'Evidence Acknowledgement',
      required: true,
      sourceContract: 'StagingEvidenceAcknowledgement',
      status: 'missing',
      providedBy: null,
      providedAt: null,
      validationResult: null,
      blockerWhenMissing: null,
    }),
  ];

  return Object.freeze(
    base.map((b) => {
      const o = overrides[b.itemId];
      if (!o) return b;
      return Object.freeze({ ...b, ...o });
    }),
  );
}

export function requiredDataMissingCount(items: readonly StagingRequiredDataItem[]): number {
  return items.filter((i) => i.required && i.status === 'missing').length;
}
