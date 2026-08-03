/**
 * @module domain-events/staging-activation/handoff/stagingEvidenceReadiness
 */

import type { StagingEvidenceReadinessItem } from './stagingHandoffTypes.js';

const MATRIX: ReadonlyArray<Omit<StagingEvidenceReadinessItem, 'currentStatus' | 'blocker'>> = [
  {
    evidenceType: 'architecture',
    requiredFor: 'handoff',
    source: 'Phase 8.5 certification',
    collectionMode: 'local',
    requiresRemote: false,
    requiresHuman: false,
    sanitizationPolicy: 'no-secrets',
  },
  {
    evidenceType: 'environment',
    requiredFor: 'readonly-verification',
    source: 'Environment Declaration',
    collectionMode: 'human',
    requiresRemote: false,
    requiresHuman: true,
    sanitizationPolicy: 'no-secrets-no-credentials',
  },
  {
    evidenceType: 'authorization',
    requiredFor: 'stage-one',
    source: 'Human Approval',
    collectionMode: 'human',
    requiresRemote: false,
    requiresHuman: true,
    sanitizationPolicy: 'no-secrets',
  },
  {
    evidenceType: 'tenant-selection',
    requiredFor: 'readonly-verification',
    source: 'Tenant Selection',
    collectionMode: 'human',
    requiresRemote: false,
    requiresHuman: true,
    sanitizationPolicy: 'ids-only',
  },
  {
    evidenceType: 'readonly-capabilities',
    requiredFor: 'readonly-verification',
    source: 'Capability Contract',
    collectionMode: 'local',
    requiresRemote: false,
    requiresHuman: false,
    sanitizationPolicy: 'boolean-flags-only',
  },
  {
    evidenceType: 'flag-baseline',
    requiredFor: 'readonly-verification',
    source: 'DOMAIN_EVENT_FLAG_DEFAULTS',
    collectionMode: 'local',
    requiresRemote: false,
    requiresHuman: false,
    sanitizationPolicy: 'flag-names-only',
  },
  {
    evidenceType: 'production-exclusion',
    requiredFor: 'readonly-verification',
    source: 'host/projectRef guards',
    collectionMode: 'remote',
    requiresRemote: true,
    requiresHuman: false,
    sanitizationPolicy: 'host-ref-only',
  },
  {
    evidenceType: 'guard-verification',
    requiredFor: 'readonly-verification',
    source: 'production locks',
    collectionMode: 'local',
    requiresRemote: false,
    requiresHuman: false,
    sanitizationPolicy: 'status-only',
  },
  {
    evidenceType: 'observability',
    requiredFor: 'stage-one-soak',
    source: 'metrics/diagnostics',
    collectionMode: 'remote',
    requiresRemote: true,
    requiresHuman: false,
    sanitizationPolicy: 'aggregates-only',
  },
  {
    evidenceType: 'event-audit',
    requiredFor: 'stage-one-soak',
    source: 'Event Audit Projection',
    collectionMode: 'remote',
    requiresRemote: true,
    requiresHuman: false,
    sanitizationPolicy: 'metadata-only',
  },
  {
    evidenceType: 'correlation',
    requiredFor: 'stage-one-soak',
    source: 'traces',
    collectionMode: 'remote',
    requiresRemote: true,
    requiresHuman: false,
    sanitizationPolicy: 'ids-only',
  },
  {
    evidenceType: 'causation',
    requiredFor: 'stage-one-soak',
    source: 'traces',
    collectionMode: 'remote',
    requiresRemote: true,
    requiresHuman: false,
    sanitizationPolicy: 'ids-only',
  },
  {
    evidenceType: 'tenant-scope',
    requiredFor: 'readonly-verification',
    source: 'tenant existence probe',
    collectionMode: 'remote',
    requiresRemote: true,
    requiresHuman: false,
    sanitizationPolicy: 'ids-only',
  },
  {
    evidenceType: 'health',
    requiredFor: 'readonly-verification',
    source: 'health endpoint',
    collectionMode: 'local',
    requiresRemote: false,
    requiresHuman: false,
    sanitizationPolicy: 'status-only',
  },
  {
    evidenceType: 'diagnostics',
    requiredFor: 'readonly-verification',
    source: 'diagnostics',
    collectionMode: 'local',
    requiresRemote: false,
    requiresHuman: false,
    sanitizationPolicy: 'status-only',
  },
  {
    evidenceType: 'rollback',
    requiredFor: 'stage-one',
    source: 'Rollback Acknowledgement',
    collectionMode: 'human',
    requiresRemote: false,
    requiresHuman: true,
    sanitizationPolicy: 'ack-only',
  },
  {
    evidenceType: 'manual-review',
    requiredFor: 'handoff',
    source: 'Human Review Checklist',
    collectionMode: 'human',
    requiresRemote: false,
    requiresHuman: true,
    sanitizationPolicy: 'checklist-only',
  },
];

export function buildStagingEvidenceReadinessMatrix(
  overrides: Partial<Record<string, StagingEvidenceReadinessItem['currentStatus']>> = {},
): readonly StagingEvidenceReadinessItem[] {
  return Object.freeze(
    MATRIX.map((m) => {
      let status = overrides[m.evidenceType];
      if (!status) {
        if (m.requiresHuman) status = 'manual_required';
        else if (m.requiresRemote) status = 'remote_required';
        else status = 'prepared';
      }
      return Object.freeze({
        ...m,
        currentStatus: status,
        blocker: status === 'prepared' || status === 'collected' || status === 'validated'
          ? null
          : `${m.evidenceType}:${status}`,
      });
    }),
  );
}
