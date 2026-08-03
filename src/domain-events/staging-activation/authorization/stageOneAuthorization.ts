/**
 * @module domain-events/staging-activation/authorization/stageOneAuthorization
 * Phase 8.8 — autorização Stage 1 (somente 3 flags). Default pending.
 */

import type { DomainEventFlagKey } from '../../domainEventFlags.js';
import type { StageOneAuthorization, StageOneAuthStatus } from './stagingAuthorizationTypes.js';
import {
  STAGE_ONE_AUTHORIZED_FLAGS,
  STAGE_ONE_FORBIDDEN_FLAGS,
} from './stagingAuthorizationTypes.js';

export interface StageOneAuthorizationInput {
  environmentId?: string | null;
  tenantIds?: readonly string[];
  authorizationId?: string;
  authorizedBy?: string | null;
  authorizedAt?: string | null;
  expiresAt?: string | null;
  maximumDurationHours?: number;
  status?: StageOneAuthStatus;
  extraAuthorizedFlags?: readonly DomainEventFlagKey[];
}

const SUCCESS = Object.freeze([
  'zero unexpected rejects',
  'publisher health ok',
  'correlation intact',
  'zero tenant mismatch crítico',
  'observability metrics disponíveis',
]);

const FAILURE = Object.freeze([
  'produção detectada',
  'host não autorizado',
  'aprovação expirada',
  'flag fora do escopo Stage 1',
  'rollback manual falhou',
]);

const EVIDENCE = Object.freeze([
  'flag-resolution',
  'environment-identification',
  'tenants',
  'observability-metrics',
  'diagnostics',
  'health',
  'event-audit',
  'correlation',
  'causation',
  'tenant-mismatch',
  'rejected-events',
  'rollback',
  'manual-review',
]);

export function buildStageOneAuthorization(
  input: StageOneAuthorizationInput = {},
): StageOneAuthorization {
  let status: StageOneAuthStatus = input.status || 'pending';

  if (input.extraAuthorizedFlags && input.extraAuthorizedFlags.length > 0) {
    const forbiddenHit = input.extraAuthorizedFlags.some(
      (f) =>
        (STAGE_ONE_FORBIDDEN_FLAGS as readonly string[]).includes(f)
        || !(STAGE_ONE_AUTHORIZED_FLAGS as readonly string[]).includes(f),
    );
    if (forbiddenHit) status = 'rejected';
  }

  if (status === 'approved') {
    if (!input.authorizedBy || !input.authorizedAt || !input.expiresAt) {
      status = 'pending';
    } else if (Date.parse(input.expiresAt) < Date.now()) {
      status = 'expired';
    }
  }

  return Object.freeze({
    stageId: 'stage-1-observability',
    stageName: 'Controlled Staging Stage 1 — Observability',
    authorizedFlags: STAGE_ONE_AUTHORIZED_FLAGS,
    forbiddenFlags: STAGE_ONE_FORBIDDEN_FLAGS,
    environmentId: input.environmentId ?? null,
    tenantIds: Object.freeze([...(input.tenantIds || [])]),
    authorizationId: input.authorizationId || `stage1-auth-${Date.now()}`,
    authorizedBy: status === 'approved' ? (input.authorizedBy || null) : null,
    authorizedAt: status === 'approved' ? (input.authorizedAt || null) : null,
    expiresAt: input.expiresAt ?? null,
    maximumDurationHours: input.maximumDurationHours ?? 72,
    successCriteria: SUCCESS,
    failureCriteria: FAILURE,
    rollbackPlanId: 'stage1-rollback-observability',
    evidenceRequirements: EVIDENCE,
    status,
  });
}

export function buildPendingStageOneAuthorization(): StageOneAuthorization {
  return buildStageOneAuthorization({ status: 'pending' });
}
