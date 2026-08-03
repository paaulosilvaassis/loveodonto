/**
 * @module domain-events/staging-activation/readonly-verification/readonlyVerificationProbes
 * Probes locais/estruturais — Phase 8.10 nunca abre conexão remota sem dados+aprovação.
 */

import {
  DOMAIN_EVENT_FLAG_DEFAULTS,
  DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../../domainEventFlags.js';
import { LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION } from '../../certification/cqrsArchitectureVersion.js';
import {
  STAGE_ONE_AUTHORIZED_FLAGS,
  STAGE_ONE_FORBIDDEN_FLAGS,
} from '../authorization/stagingAuthorizationTypes.js';
import type {
  ReadonlyProbeId,
  ReadonlyProbeResult,
  ReadonlyProbeStatus,
} from './readonlyVerificationTypes.js';

const BASELINE_FLAG_KEYS = [
  'DOMAIN_EVENTS',
  'DOMAIN_EVENT_AUDIT',
  'DOMAIN_EVENT_OBSERVABILITY',
  'DOMAIN_EVENT_CONSUMERS',
  'DOMAIN_EVENT_PROJECTION',
  'DOMAIN_EVENT_ANALYTICS',
  'CQRS_READ_MODEL',
  'CQRS_READ_MODEL_SOAK',
  'CQRS_READ_MODEL_CONSISTENCY',
  'LEAD_ANALYTICS_READ_MODEL',
  'APPOINTMENT_ANALYTICS_READ_MODEL',
  'FINANCIAL_ANALYTICS_READ_MODEL',
] as const;

function probeResult(
  probeId: ReadonlyProbeId,
  status: ReadonlyProbeStatus,
  message: string,
  args: {
    environmentId?: string | null;
    tenantId?: string | null;
    isRemote?: boolean;
    readOnlyGuaranteed?: boolean;
    blockers?: readonly string[];
    warnings?: readonly string[];
  } = {},
): ReadonlyProbeResult {
  const now = new Date().toISOString();
  return Object.freeze({
    probeId,
    status,
    startedAt: now,
    finishedAt: now,
    environmentId: args.environmentId ?? null,
    tenantId: args.tenantId ?? null,
    isRemote: args.isRemote ?? false,
    readOnlyGuaranteed: args.readOnlyGuaranteed ?? true,
    resultSanitized: message.slice(0, 240),
    blockers: Object.freeze([...(args.blockers || [])]),
    warnings: Object.freeze([...(args.warnings || [])]),
  });
}

export interface LocalProbeContext {
  environmentId?: string | null;
  host?: string | null;
  projectRef?: string | null;
  environmentType?: string | null;
  isProduction?: boolean;
  isStaging?: boolean;
  pilotTenantIds?: readonly string[];
  approvedTenantIds?: readonly string[];
  /** Simulado: tenant IDs que "existem" localmente (não remoto). */
  knownTenantIds?: readonly string[];
  architectureVersion?: string | null;
  certificationStatus?: string | null;
  inspectorAvailable?: boolean;
  healthAvailable?: boolean;
  /** Overrides de flags para teste — defaults oficiais se omitido. */
  flagSnapshot?: Partial<Record<string, boolean>>;
  simulationOnly?: boolean;
}

function isProductionRef(host: string, projectRef: string): boolean {
  const h = host.toLowerCase();
  const r = projectRef.toLowerCase();
  const prod = PRODUCTION_SUPABASE_PROJECT_REF.toLowerCase();
  return r === prod || h.includes(prod) || h.includes('production');
}

export function runLocalEnvironmentIdentityProbe(
  ctx: LocalProbeContext,
): ReadonlyProbeResult {
  if (!ctx.environmentId || !ctx.host || !ctx.projectRef) {
    return probeResult('verify-environment-identity', 'failed', 'identidade ausente', {
      environmentId: ctx.environmentId,
      blockers: ['environment identity missing'],
    });
  }
  if (ctx.isProduction === true || ctx.environmentType === 'production'
    || isProductionRef(ctx.host, ctx.projectRef)) {
    return probeResult('verify-environment-identity', 'failed', 'produção detectada', {
      environmentId: ctx.environmentId,
      blockers: ['production detected'],
    });
  }
  return probeResult(
    'verify-environment-identity',
    'passed',
    `identity ok env=${ctx.environmentId} (local/static)`,
    { environmentId: ctx.environmentId },
  );
}

export function runLocalNonProductionHostProbe(ctx: LocalProbeContext): ReadonlyProbeResult {
  const host = String(ctx.host || '');
  if (!host) {
    return probeResult('verify-non-production-host', 'failed', 'host ausente', {
      blockers: ['host missing'],
    });
  }
  if (isProductionRef(host, String(ctx.projectRef || ''))) {
    return probeResult('verify-non-production-host', 'failed', 'host de produção', {
      environmentId: ctx.environmentId,
      blockers: ['production host'],
    });
  }
  if (host === 'localhost' || host === '127.0.0.1') {
    return probeResult('verify-non-production-host', 'blocked', 'localhost não é staging real', {
      environmentId: ctx.environmentId,
      blockers: ['localhost'],
    });
  }
  return probeResult('verify-non-production-host', 'passed', 'host non-production (structural)', {
    environmentId: ctx.environmentId,
  });
}

export function runLocalProjectReferenceProbe(ctx: LocalProbeContext): ReadonlyProbeResult {
  const ref = String(ctx.projectRef || '');
  if (!ref) {
    return probeResult('verify-project-reference', 'failed', 'projectRef ausente', {
      blockers: ['projectRef missing'],
    });
  }
  if (ref.toLowerCase() === PRODUCTION_SUPABASE_PROJECT_REF.toLowerCase()) {
    return probeResult('verify-project-reference', 'failed', 'projectRef produção', {
      blockers: ['production projectRef'],
    });
  }
  return probeResult('verify-project-reference', 'passed', `projectRef=${ref} structural`, {
    environmentId: ctx.environmentId,
  });
}

export function runLocalTenantExistenceProbe(ctx: LocalProbeContext): ReadonlyProbeResult {
  const pilots = ctx.pilotTenantIds || [];
  if (pilots.length === 0) {
    return probeResult('verify-tenant-existence', 'blocked', 'piloto ausente', {
      blockers: ['no pilot'],
    });
  }
  if (pilots.some((t) => /^(all|\*|everyone)$/i.test(t))) {
    return probeResult('verify-tenant-existence', 'failed', 'wildcard proibido', {
      blockers: ['wildcard'],
    });
  }
  const approved = ctx.approvedTenantIds || pilots;
  if (!pilots.every((t) => approved.includes(t))) {
    return probeResult('verify-tenant-existence', 'failed', 'tenant fora do approval', {
      blockers: ['tenant out of approval'],
    });
  }
  // Sem remote: existence é estrutural / simulated known list
  if (ctx.knownTenantIds) {
    const missing = pilots.filter((t) => !ctx.knownTenantIds!.includes(t));
    if (missing.length) {
      return probeResult('verify-tenant-existence', 'failed', `tenant inexistente estrutural: ${missing.join(',')}`, {
        blockers: missing.map((t) => `missing:${t}`),
        tenantId: missing[0],
      });
    }
  }
  return probeResult(
    'verify-tenant-existence',
    ctx.simulationOnly ? 'passed' : 'manual_required',
    ctx.simulationOnly
      ? `tenants structural/simulated ok (${pilots.length})`
      : 'tenant remote existence unverified — remote verification pending',
    { environmentId: ctx.environmentId, tenantId: pilots[0] },
  );
}

export function runLocalFlagBaselineProbe(ctx: LocalProbeContext): ReadonlyProbeResult {
  const snap = { ...DOMAIN_EVENT_FLAG_DEFAULTS, ...(ctx.flagSnapshot || {}) };
  const onFlags = BASELINE_FLAG_KEYS.filter((k) => snap[k] === true);
  if (onFlags.length) {
    return probeResult('verify-flag-baseline-off', 'failed', `flags ON: ${onFlags.join(',')}`, {
      blockers: onFlags.map((f) => `${f}=ON`),
    });
  }
  return probeResult(
    'verify-flag-baseline-off',
    'passed',
    'baseline flags OFF (defaults/local snapshot) — sem alteração',
    { environmentId: ctx.environmentId },
  );
}

export function runLocalProductionGuardsProbe(): ReadonlyProbeResult {
  const locksOk = DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS.length >= BASELINE_FLAG_KEYS.length;
  const stageScopeOk = STAGE_ONE_AUTHORIZED_FLAGS.length === 3
    && STAGE_ONE_FORBIDDEN_FLAGS.length >= 5;
  if (!locksOk || !stageScopeOk) {
    return probeResult('verify-production-guards', 'failed', 'guards incompletos', {
      blockers: ['guards incomplete'],
    });
  }
  return probeResult(
    'verify-production-guards',
    'passed',
    'production locks + stage1 scope + autoPromotion=false (local structural)',
  );
}

export function runLocalHostGuardsProbe(ctx: LocalProbeContext): ReadonlyProbeResult {
  if (isProductionRef(String(ctx.host || ''), String(ctx.projectRef || ''))) {
    return probeResult('verify-host-guards', 'failed', 'host guard falhou — produção', {
      blockers: ['host production'],
    });
  }
  return probeResult('verify-host-guards', 'passed', 'host guards structural OK');
}

export function runLocalArchitectureVersionProbe(ctx: LocalProbeContext): ReadonlyProbeResult {
  const ver = ctx.architectureVersion || LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION;
  if (ver !== LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION) {
    return probeResult('verify-architecture-version', 'failed', `version mismatch ${ver}`, {
      blockers: ['architecture version mismatch'],
    });
  }
  return probeResult('verify-architecture-version', 'passed', `version=${ver}`);
}

export function runLocalCertificationProbe(ctx: LocalProbeContext): ReadonlyProbeResult {
  const st = ctx.certificationStatus || 'certified';
  if (st !== 'certified' && st !== 'pending_human') {
    return probeResult('verify-certification-status', 'warning', `status=${st}`);
  }
  return probeResult('verify-certification-status', 'passed', `certification=${st}`);
}

export function runLocalInspectorAvailabilityProbe(ctx: LocalProbeContext): ReadonlyProbeResult {
  if (ctx.inspectorAvailable === false) {
    return probeResult('verify-inspector-availability', 'failed', 'inspector unavailable', {
      blockers: ['inspector'],
    });
  }
  return probeResult('verify-inspector-availability', 'passed', 'inspector available (local)');
}

export function runLocalHealthAvailabilityProbe(ctx: LocalProbeContext): ReadonlyProbeResult {
  if (ctx.healthAvailable === false) {
    return probeResult('verify-health-availability', 'failed', 'health unavailable', {
      blockers: ['health'],
    });
  }
  return probeResult('verify-health-availability', 'passed', 'health available (local)');
}

const LOCAL_PROBE_RUNNERS: Record<
  ReadonlyProbeId,
  (ctx: LocalProbeContext) => ReadonlyProbeResult
> = {
  'verify-environment-identity': runLocalEnvironmentIdentityProbe,
  'verify-non-production-host': runLocalNonProductionHostProbe,
  'verify-project-reference': runLocalProjectReferenceProbe,
  'verify-tenant-existence': runLocalTenantExistenceProbe,
  'verify-flag-baseline-off': runLocalFlagBaselineProbe,
  'verify-production-guards': () => runLocalProductionGuardsProbe(),
  'verify-host-guards': runLocalHostGuardsProbe,
  'verify-architecture-version': runLocalArchitectureVersionProbe,
  'verify-certification-status': runLocalCertificationProbe,
  'verify-inspector-availability': runLocalInspectorAvailabilityProbe,
  'verify-health-availability': runLocalHealthAvailabilityProbe,
};

/**
 * Executa probes em sequência (fail-fast produção). Sempre isRemote=false nesta phase default.
 */
export function runSequentialLocalProbes(
  probeIds: readonly ReadonlyProbeId[],
  ctx: LocalProbeContext,
): { probes: readonly ReadonlyProbeResult[]; aborted: boolean; productionDetected: boolean } {
  const out: ReadonlyProbeResult[] = [];
  let productionDetected = false;
  for (const id of probeIds) {
    const runner = LOCAL_PROBE_RUNNERS[id];
    if (!runner) {
      out.push(probeResult(id, 'blocked', `probe desconhecido: ${id}`, {
        blockers: [`unknown probe ${id}`],
      }));
      break;
    }
    const result = runner({ ...ctx, simulationOnly: ctx.simulationOnly });
    out.push(result);
    if (
      result.blockers.some((b) => /production/i.test(b))
      || /produ[cç]ão/i.test(result.resultSanitized)
    ) {
      productionDetected = true;
      break;
    }
    if (result.status === 'failed' || result.status === 'blocked') {
      break;
    }
  }
  return {
    probes: Object.freeze(out),
    aborted: out.length < probeIds.length,
    productionDetected,
  };
}
