/**
 * @module domain-events/staging-activation/authorization-intake/stagingAuthorizationInputValidator
 * Validações por seção + cross consistency — Phase 8.9.
 */

import { PRODUCTION_SUPABASE_PROJECT_REF } from '../../domainEventFlags.js';
import {
  STAGE_ONE_AUTHORIZED_FLAGS,
  STAGE_ONE_FORBIDDEN_FLAGS,
  STAGE_ONE_ROLLBACK_FLAG_ORDER,
} from '../authorization/stagingAuthorizationTypes.js';
import { LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION } from '../../certification/cqrsArchitectureVersion.js';
import {
  REQUIRED_EVIDENCE_ACK_TYPES,
  REQUIRED_RISK_IDS,
} from './stagingAuthorizationInputSchema.js';
import type {
  StagingAuthorizationFieldValidation,
  StagingAuthorizationInputEnvelope,
} from './stagingAuthorizationIntakeTypes.js';

function v(
  section: string,
  result: StagingAuthorizationFieldValidation['result'],
  message: string,
  code: string | null = null,
): StagingAuthorizationFieldValidation {
  return Object.freeze({ section, result, message, code });
}

function asStr(x: unknown): string {
  return x == null ? '' : String(x).trim();
}

function asList(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.map((i) => String(i).trim()).filter(Boolean);
}

export function validateEnvironmentInput(
  env: Record<string, unknown> | null,
): StagingAuthorizationFieldValidation[] {
  if (!env) return [v('environment', 'fail', 'environment ausente')];
  const out: StagingAuthorizationFieldValidation[] = [];
  if (!asStr(env.host)) out.push(v('environment', 'fail', 'host vazio'));
  if (!asStr(env.projectRef)) out.push(v('environment', 'fail', 'projectRef ausente'));
  if (!asStr(env.owner)) out.push(v('environment', 'fail', 'owner ausente'));
  if (!asStr(env.declaredBy)) out.push(v('environment', 'fail', 'declarant ausente'));
  if (asStr(env.environmentType) !== 'staging') {
    out.push(v('environment', 'fail', 'environmentType deve ser staging'));
  }
  const host = asStr(env.host).toLowerCase();
  const ref = asStr(env.projectRef).toLowerCase();
  if (ref === PRODUCTION_SUPABASE_PROJECT_REF.toLowerCase()
    || host.includes(PRODUCTION_SUPABASE_PROJECT_REF.toLowerCase())
    || env.isProduction === true
    || asStr(env.environmentType) === 'production') {
    out.push(v('environment', 'fail', 'produção rejeitada'));
  }
  if (host === 'localhost' || host === '127.0.0.1') {
    out.push(v('environment', 'fail', 'localhost não é staging real'));
  }
  if (env.expiresAt && Date.parse(String(env.expiresAt)) < Date.now()) {
    out.push(v('environment', 'fail', 'ambiente expirado'));
  }
  if (out.length === 0) {
    out.push(
      v(
        'environment',
        'manual_required',
        'structurally_valid_unverified_remote',
        'structurally_valid_unverified_remote',
      ),
    );
  }
  return out;
}

export function validateHumanApprovalInput(
  human: Record<string, unknown> | null,
  envId: string | null,
  tenantIds: readonly string[],
): StagingAuthorizationFieldValidation[] {
  if (!human) return [v('humanApproval', 'fail', 'humanApproval ausente')];
  const out: StagingAuthorizationFieldValidation[] = [];
  const status = asStr(human.status) || 'pending';
  if (asStr(human.approvalScope) && asStr(human.approvalScope) !== 'stage_one_observability') {
    out.push(v('humanApproval', 'fail', 'escopo inválido', 'AUTHORIZATION_SCOPE_MISMATCH'));
  }
  if (status === 'approved') {
    if (!asStr(human.approvedBy)) out.push(v('humanApproval', 'fail', 'approvedBy obrigatório'));
    if (!asStr(human.approvedAt)) out.push(v('humanApproval', 'fail', 'approvedAt obrigatório'));
    if (!asStr(human.expiresAt)) out.push(v('humanApproval', 'fail', 'expiresAt obrigatório'));
    if (human.expiresAt && Date.parse(String(human.expiresAt)) < Date.now()) {
      out.push(v('humanApproval', 'fail', 'aprovação expirada'));
    }
    if (!human.riskAcknowledged) out.push(v('humanApproval', 'fail', 'riskAcknowledged requerido'));
    if (!human.rollbackAcknowledged) {
      out.push(v('humanApproval', 'fail', 'rollbackAcknowledged requerido'));
    }
    if (envId && asStr(human.environmentId) && asStr(human.environmentId) !== envId) {
      out.push(v('humanApproval', 'fail', 'environmentId mismatch', 'ENVIRONMENT_ID_MISMATCH'));
    }
    const approvedTenants = asList(human.tenantIds);
    if (tenantIds.length && approvedTenants.length
      && !tenantIds.every((t) => approvedTenants.includes(t))) {
      out.push(v('humanApproval', 'fail', 'tenant mismatch', 'TENANT_SCOPE_MISMATCH'));
    }
    if (asStr(human.requestedBy) && asStr(human.approvedBy) === asStr(human.requestedBy)) {
      out.push(
        v(
          'humanApproval',
          'warning',
          'solicitante = aprovador',
          'SAME_REQUESTER_AND_APPROVER',
        ),
      );
    }
  }
  if (out.filter((x) => x.result === 'fail').length === 0) {
    out.push(v('humanApproval', status === 'approved' ? 'pass' : 'manual_required', `status=${status}`));
  }
  return out;
}

export function validateTenantInput(
  tenants: Record<string, unknown> | null,
): StagingAuthorizationFieldValidation[] {
  if (!tenants) return [v('tenants', 'fail', 'tenantSelection ausente')];
  const out: StagingAuthorizationFieldValidation[] = [];
  const pilot = asList(tenants.pilotTenantIds);
  const control = asList(tenants.controlTenantIds);
  const excluded = asList(tenants.excludedTenantIds);
  const all = [...pilot, ...control];
  if (pilot.length === 0) out.push(v('tenants', 'fail', 'piloto ausente'));
  if (new Set(all).size !== all.length) out.push(v('tenants', 'fail', 'duplicidade'));
  if (pilot.some((id) => control.includes(id))) out.push(v('tenants', 'fail', 'overlap piloto/controle'));
  if (excluded.some((id) => all.includes(id))) out.push(v('tenants', 'fail', 'excluded overlap'));
  if (all.some((id) => /^(all|\*|everyone)$/i.test(id))) {
    out.push(v('tenants', 'fail', 'wildcard rejeitado'));
  }
  if (out.length === 0) {
    out.push(
      v('tenants', 'manual_required', 'structurally valid — remote_existence_unverified'),
    );
  }
  return out;
}

export function validateReadonlyInput(
  readonlyDecl: Record<string, unknown> | null,
  envId: string | null,
): StagingAuthorizationFieldValidation[] {
  if (!readonlyDecl) return [v('readonly', 'fail', 'readonly ausente')];
  const out: StagingAuthorizationFieldValidation[] = [];
  const status = asStr(readonlyDecl.status) || 'unverified';
  if (status === 'verified_readonly') {
    if (readonlyDecl.mutationBlocked !== true) out.push(v('readonly', 'fail', 'mutationBlocked'));
    if (readonlyDecl.migrationBlocked !== true) out.push(v('readonly', 'fail', 'migrationBlocked'));
    if (readonlyDecl.storageWriteBlocked !== true) out.push(v('readonly', 'fail', 'storageWriteBlocked'));
    if (readonlyDecl.secretAccessBlocked !== true) out.push(v('readonly', 'fail', 'secretAccessBlocked'));
    if (readonlyDecl.environmentVariableWriteBlocked === false) {
      out.push(v('readonly', 'fail', 'environmentVariableWriteBlocked'));
    }
    if (!asStr(readonlyDecl.verifiedBy)) out.push(v('readonly', 'fail', 'verifiedBy'));
    if (!asStr(readonlyDecl.verificationMethod)) out.push(v('readonly', 'fail', 'verificationMethod'));
    if (!asStr(readonlyDecl.expiresAt)) out.push(v('readonly', 'fail', 'expiresAt'));
    if (readonlyDecl.expiresAt && Date.parse(String(readonlyDecl.expiresAt)) < Date.now()) {
      out.push(v('readonly', 'fail', 'readonly expirado'));
    }
    if (envId && asStr(readonlyDecl.environmentId) && asStr(readonlyDecl.environmentId) !== envId) {
      out.push(v('readonly', 'fail', 'environment mismatch', 'ENVIRONMENT_ID_MISMATCH'));
    }
  }
  if (out.filter((x) => x.result === 'fail').length === 0) {
    out.push(
      v(
        'readonly',
        'manual_required',
        status === 'verified_readonly'
          ? 'declared_verified_readonly (não runtime_verified_readonly)'
          : `status=${status} — remote verification pending`,
      ),
    );
  }
  return out;
}

export function validateStageOneInput(
  stage1: Record<string, unknown> | null,
  envId: string | null,
  tenantIds: readonly string[],
): StagingAuthorizationFieldValidation[] {
  if (!stage1) return [v('stageOne', 'fail', 'stageOne ausente')];
  const out: StagingAuthorizationFieldValidation[] = [];
  const flags = asList(stage1.authorizedFlags);
  if (flags.length) {
    for (const f of flags) {
      if ((STAGE_ONE_FORBIDDEN_FLAGS as readonly string[]).includes(f)) {
        out.push(v('stageOne', 'fail', `flag proibida ${f}`, 'STAGE_ONE_FLAG_SCOPE_MISMATCH'));
      }
      if (!(STAGE_ONE_AUTHORIZED_FLAGS as readonly string[]).includes(f)) {
        out.push(v('stageOne', 'fail', `flag fora do escopo ${f}`, 'STAGE_ONE_FLAG_SCOPE_MISMATCH'));
      }
    }
    if (![...STAGE_ONE_AUTHORIZED_FLAGS].every((f) => flags.includes(f)) && flags.length > 0) {
      // allow subset only of the three — or require exactly three
      if (flags.length !== 3) {
        out.push(v('stageOne', 'fail', 'authorizedFlags deve ser exatamente as 3 do Stage 1'));
      }
    }
  }
  if (!asStr(stage1.authorizationId)) out.push(v('stageOne', 'fail', 'authorizationId'));
  if (asStr(stage1.status) === 'approved') {
    if (!asStr(stage1.authorizedBy)) out.push(v('stageOne', 'fail', 'authorizedBy'));
    if (!asStr(stage1.authorizedAt)) out.push(v('stageOne', 'fail', 'authorizedAt'));
    if (!asStr(stage1.expiresAt)) out.push(v('stageOne', 'fail', 'expiresAt'));
  }
  if (envId && asStr(stage1.environmentId) && asStr(stage1.environmentId) !== envId) {
    out.push(v('stageOne', 'fail', 'environment mismatch', 'ENVIRONMENT_ID_MISMATCH'));
  }
  const sTenants = asList(stage1.tenantIds);
  if (tenantIds.length && sTenants.length
    && !tenantIds.every((t) => sTenants.includes(t))) {
    out.push(v('stageOne', 'fail', 'tenant mismatch', 'TENANT_SCOPE_MISMATCH'));
  }
  if (!Array.isArray(stage1.successCriteria) || (stage1.successCriteria as unknown[]).length === 0) {
    out.push(v('stageOne', 'fail', 'successCriteria ausentes'));
  }
  if (!Array.isArray(stage1.failureCriteria) || (stage1.failureCriteria as unknown[]).length === 0) {
    out.push(v('stageOne', 'fail', 'failureCriteria ausentes'));
  }
  if (out.filter((x) => x.result === 'fail').length === 0) {
    out.push(v('stageOne', 'pass', 'stage1 input estrutural OK — sem execução'));
  }
  return out;
}

export function validateRollbackInput(
  rollback: Record<string, unknown> | null,
): StagingAuthorizationFieldValidation[] {
  if (!rollback) return [v('rollback', 'fail', 'rollback ausente')];
  const out: StagingAuthorizationFieldValidation[] = [];
  if (rollback.reviewed !== true) out.push(v('rollback', 'fail', 'reviewed!=true'));
  if (!asStr(rollback.reviewedBy)) out.push(v('rollback', 'fail', 'reviewedBy'));
  if (!asStr(rollback.reviewedAt)) out.push(v('rollback', 'fail', 'reviewedAt'));
  const flags = asList(rollback.flagsToDisable);
  const expected = [...STAGE_ONE_ROLLBACK_FLAG_ORDER];
  if (flags.length !== expected.length || flags.some((f, i) => f !== expected[i])) {
    out.push(v('rollback', 'fail', 'ordem/flags inválidas', 'ROLLBACK_PLAN_MISMATCH'));
  }
  if (out.length === 0) out.push(v('rollback', 'pass', 'rollback acknowledgement OK'));
  return out;
}

export function validateEvidenceInput(
  evidence: Record<string, unknown> | null,
): StagingAuthorizationFieldValidation[] {
  if (!evidence) return [v('evidence', 'fail', 'evidence ausente')];
  const types = asList(evidence.acknowledgedTypes);
  const missing = REQUIRED_EVIDENCE_ACK_TYPES.filter((t) => !types.includes(t));
  if (missing.length) {
    return [v('evidence', 'fail', `evidências faltando: ${missing.join(',')}`)];
  }
  if (evidence.reviewed !== true || !asStr(evidence.reviewedBy)) {
    return [v('evidence', 'fail', 'review ausente')];
  }
  return [v('evidence', 'pass', 'evidence acknowledgement OK')];
}

export function validateRiskInput(
  risks: ReadonlyArray<Readonly<Record<string, unknown>>> | null,
): StagingAuthorizationFieldValidation[] {
  if (!risks || risks.length === 0) return [v('risks', 'fail', 'riscos ausentes')];
  const out: StagingAuthorizationFieldValidation[] = [];
  const ids = risks.map((r) => asStr(r.riskId));
  for (const id of REQUIRED_RISK_IDS) {
    if (!ids.includes(id)) out.push(v('risks', 'fail', `risco ausente: ${id}`));
  }
  for (const r of risks) {
    if (r.accepted !== true) {
      out.push(v('risks', 'fail', `risco não aceito: ${asStr(r.riskId)}`));
    }
    if (!asStr(r.acceptedBy)) out.push(v('risks', 'fail', `acceptedBy ausente: ${asStr(r.riskId)}`));
    if (!asStr(r.acceptedAt)) out.push(v('risks', 'fail', `acceptedAt ausente: ${asStr(r.riskId)}`));
    if (!asStr(r.mitigation)) out.push(v('risks', 'fail', `mitigation ausente: ${asStr(r.riskId)}`));
  }
  if (out.length === 0) out.push(v('risks', 'pass', 'risks acknowledgement OK'));
  return out;
}

export function validateStagingAuthorizationCrossConsistency(
  envelope: StagingAuthorizationInputEnvelope,
): StagingAuthorizationFieldValidation[] {
  const out: StagingAuthorizationFieldValidation[] = [];
  if (
    envelope.architectureVersion
    && envelope.architectureVersion !== LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION
  ) {
    out.push(
      v('cross', 'fail', 'architecture version mismatch', 'ARCHITECTURE_VERSION_MISMATCH'),
    );
  }
  const envId = asStr(envelope.environmentDeclaration?.environmentId);
  const humanEnv = asStr(envelope.humanApproval?.environmentId);
  const stageEnv = asStr(envelope.stageOneAuthorization?.environmentId);
  const roEnv = asStr(envelope.readonlyAccessDeclaration?.environmentId);
  if (envId && humanEnv && envId !== humanEnv) {
    out.push(v('cross', 'fail', 'env/human mismatch', 'ENVIRONMENT_ID_MISMATCH'));
  }
  if (envId && stageEnv && envId !== stageEnv) {
    out.push(v('cross', 'fail', 'env/stage1 mismatch', 'ENVIRONMENT_ID_MISMATCH'));
  }
  if (envId && roEnv && envId !== roEnv) {
    out.push(v('cross', 'fail', 'env/readonly mismatch', 'ENVIRONMENT_ID_MISMATCH'));
  }
  const pilots = asList(envelope.tenantSelection?.pilotTenantIds);
  const humanTenants = asList(envelope.humanApproval?.tenantIds);
  const stageTenants = asList(envelope.stageOneAuthorization?.tenantIds);
  if (pilots.length && humanTenants.length
    && !pilots.every((t) => humanTenants.includes(t))) {
    out.push(v('cross', 'fail', 'tenant/human mismatch', 'TENANT_SCOPE_MISMATCH'));
  }
  if (pilots.length && stageTenants.length
    && !pilots.every((t) => stageTenants.includes(t))) {
    out.push(v('cross', 'fail', 'tenant/stage1 mismatch', 'TENANT_SCOPE_MISMATCH'));
  }
  const rbId = asStr(envelope.rollbackAcknowledgement?.rollbackPlanId);
  const stageRb = asStr(envelope.stageOneAuthorization?.rollbackPlanId);
  if (rbId && stageRb && rbId !== stageRb) {
    out.push(v('cross', 'fail', 'rollback plan mismatch', 'ROLLBACK_PLAN_MISMATCH'));
  }
  const expires = [
    envelope.humanApproval?.expiresAt,
    envelope.stageOneAuthorization?.expiresAt,
    envelope.readonlyAccessDeclaration?.expiresAt,
    envelope.environmentDeclaration?.expiresAt,
  ]
    .filter(Boolean)
    .map((x) => Date.parse(String(x)));
  if (expires.some((t) => Number.isFinite(t) && t < Date.now())) {
    out.push(v('cross', 'fail', 'expired authorization chain', 'EXPIRED_AUTHORIZATION_CHAIN'));
  }
  if (out.length === 0) out.push(v('cross', 'pass', 'cross-document consistency OK'));
  return out;
}

export function runAllSectionValidations(
  envelope: StagingAuthorizationInputEnvelope,
): StagingAuthorizationFieldValidation[] {
  const envId = asStr(envelope.environmentDeclaration?.environmentId) || null;
  const pilots = asList(envelope.tenantSelection?.pilotTenantIds);
  return Object.freeze([
    ...validateEnvironmentInput(envelope.environmentDeclaration as Record<string, unknown> | null),
    ...validateTenantInput(envelope.tenantSelection as Record<string, unknown> | null),
    ...validateHumanApprovalInput(
      envelope.humanApproval as Record<string, unknown> | null,
      envId,
      pilots,
    ),
    ...validateReadonlyInput(
      envelope.readonlyAccessDeclaration as Record<string, unknown> | null,
      envId,
    ),
    ...validateStageOneInput(
      envelope.stageOneAuthorization as Record<string, unknown> | null,
      envId,
      pilots,
    ),
    ...validateRollbackInput(envelope.rollbackAcknowledgement as Record<string, unknown> | null),
    ...validateEvidenceInput(envelope.evidenceAcknowledgement as Record<string, unknown> | null),
    ...validateRiskInput(envelope.riskAcknowledgements),
    ...validateStagingAuthorizationCrossConsistency(envelope),
  ]) as StagingAuthorizationFieldValidation[];
}
