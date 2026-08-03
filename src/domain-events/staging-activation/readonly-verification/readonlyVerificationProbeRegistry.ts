/**
 * @module domain-events/staging-activation/readonly-verification/readonlyVerificationProbeRegistry
 */

import type {
  ReadonlyForbiddenOperation,
  ReadonlyProbeId,
} from './readonlyVerificationTypes.js';

export const ALLOWED_READONLY_PROBES = Object.freeze([
  'verify-environment-identity',
  'verify-non-production-host',
  'verify-project-reference',
  'verify-tenant-existence',
  'verify-flag-baseline-off',
  'verify-production-guards',
  'verify-host-guards',
  'verify-architecture-version',
  'verify-certification-status',
  'verify-inspector-availability',
  'verify-health-availability',
] as const satisfies readonly ReadonlyProbeId[]);

export const FORBIDDEN_READONLY_OPERATIONS = Object.freeze([
  'insert',
  'update',
  'delete',
  'upsert',
  'rpc-mutation',
  'migration',
  'seed',
  'storage-upload',
  'storage-delete',
  'environment-write',
  'flag-write',
  'secret-read',
  'tenant-create',
  'tenant-update',
] as const satisfies readonly ReadonlyForbiddenOperation[]);

export function isAllowedReadonlyProbe(probeId: string): probeId is ReadonlyProbeId {
  return (ALLOWED_READONLY_PROBES as readonly string[]).includes(probeId);
}

export function isForbiddenReadonlyOperation(op: string): boolean {
  return (FORBIDDEN_READONLY_OPERATIONS as readonly string[]).includes(op);
}

export function assertProbeAllowlist(probeIds: readonly string[]): {
  ok: boolean;
  unknown: readonly string[];
  forbiddenOps: readonly string[];
} {
  const unknown = probeIds.filter((p) => !isAllowedReadonlyProbe(p));
  const forbiddenOps = probeIds.filter((p) => isForbiddenReadonlyOperation(p));
  return {
    ok: unknown.length === 0 && forbiddenOps.length === 0,
    unknown,
    forbiddenOps,
  };
}
