/**
 * @module domain-events/observability/domainEventDiagnostics
 * @description Diagnósticos estruturais de Domain Events — Phase 7.3.
 */

import { DOMAIN_EVENT_REGISTRY, getDomainEventRegistryEntry } from '../domainEventRegistry';
import {
  getDomainEventFlags,
  type DomainEventFlags,
  type DomainEventFlagsInput,
} from '../domainEventFlags';
import type { DomainEventTraceEntry } from './domainEventTrace';

export type DomainEventDiagnosticCode =
  | 'INVALID_EVENT'
  | 'REGISTRY_INCONSISTENT'
  | 'INVALID_PAYLOAD'
  | 'DUPLICATE_PUBLISH'
  | 'BROKEN_CORRELATION'
  | 'MISSING_CAUSATION'
  | 'CONFLICTING_FLAGS'
  | 'MISSING_TENANT_SCOPE'
  | 'INVALID_TENANT_SCOPE'
  | 'TENANT_SCOPE_MISMATCH';

export interface DomainEventDiagnosticIssue {
  code: DomainEventDiagnosticCode;
  severity: 'info' | 'warn' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

export interface DomainEventDiagnosticsReport {
  ok: boolean;
  checkedAt: string;
  issues: DomainEventDiagnosticIssue[];
}

function issue(
  code: DomainEventDiagnosticCode,
  severity: DomainEventDiagnosticIssue['severity'],
  message: string,
  details?: Record<string, unknown>,
): DomainEventDiagnosticIssue {
  return { code, severity, message, details };
}

/** Valida consistência do registry (sem side-effects). */
export function diagnoseDomainEventRegistry(): DomainEventDiagnosticIssue[] {
  const issues: DomainEventDiagnosticIssue[] = [];
  const seen = new Set<string>();
  for (const def of DOMAIN_EVENT_REGISTRY) {
    if (!def?.name || !def?.aggregate || !def?.version) {
      issues.push(
        issue('REGISTRY_INCONSISTENT', 'error', 'Definição incompleta no registry', {
          name: def?.name,
        }),
      );
      continue;
    }
    if (seen.has(def.name)) {
      issues.push(
        issue('REGISTRY_INCONSISTENT', 'error', `Tipo duplicado no registry: ${def.name}`),
      );
    }
    seen.add(def.name);
    if (!getDomainEventRegistryEntry(def.name)) {
      issues.push(
        issue('REGISTRY_INCONSISTENT', 'error', `Lookup falhou para tipo registrado: ${def.name}`),
      );
    }
  }
  return issues;
}

/**
 * Flags conflitantes (snapshot explícito ou flags resolvidas).
 * Snapshot permite testar combinações inválidas sem passar por validateDomainEventFlags.
 */
export function diagnoseDomainEventFlags(
  flagsSnapshot?: DomainEventFlags,
  flagsInput: DomainEventFlagsInput = {},
): DomainEventDiagnosticIssue[] {
  const issues: DomainEventDiagnosticIssue[] = [];
  const flags = flagsSnapshot ?? getDomainEventFlags(flagsInput);
  if (flags.DOMAIN_EVENT_AUDIT && !flags.DOMAIN_EVENTS) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'DOMAIN_EVENT_AUDIT=true com DOMAIN_EVENTS=false — audit não terá efeito útil',
      ),
    );
  }
  if (flags.DOMAIN_EVENT_OBSERVABILITY && !flags.DOMAIN_EVENTS) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'DOMAIN_EVENT_OBSERVABILITY=true com DOMAIN_EVENTS=false — observabilidade inerte',
      ),
    );
  }
  if (flags.DOMAIN_EVENT_CONSUMERS && !flags.DOMAIN_EVENTS) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'DOMAIN_EVENT_CONSUMERS=true com DOMAIN_EVENTS=false — consumers inertes',
      ),
    );
  }
  if (flags.DOMAIN_EVENT_CONSUMER_AUDIT && !flags.DOMAIN_EVENT_CONSUMERS) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'DOMAIN_EVENT_CONSUMER_AUDIT=true exige DOMAIN_EVENT_CONSUMERS=true',
      ),
    );
  }
  if (flags.DOMAIN_EVENT_CONSUMER_RETRY && !flags.DOMAIN_EVENT_CONSUMERS) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'DOMAIN_EVENT_CONSUMER_RETRY=true exige DOMAIN_EVENT_CONSUMERS=true',
      ),
    );
  }
  if (flags.DOMAIN_EVENT_PROJECTION && !flags.DOMAIN_EVENT_CONSUMERS) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'DOMAIN_EVENT_PROJECTION=true exige DOMAIN_EVENT_CONSUMERS=true',
      ),
    );
  }
  if (flags.DOMAIN_EVENT_PROJECTION && !flags.DOMAIN_EVENTS) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'DOMAIN_EVENT_PROJECTION=true exige DOMAIN_EVENTS=true',
      ),
    );
  }
  if (flags.DOMAIN_EVENT_ANALYTICS && !flags.DOMAIN_EVENT_CONSUMERS) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'DOMAIN_EVENT_ANALYTICS=true exige DOMAIN_EVENT_CONSUMERS=true',
      ),
    );
  }
  if (flags.DOMAIN_EVENT_ANALYTICS && !flags.DOMAIN_EVENTS) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'DOMAIN_EVENT_ANALYTICS=true exige DOMAIN_EVENTS=true',
      ),
    );
  }
  if (flags.LEAD_ANALYTICS_READ_MODEL && !flags.DOMAIN_EVENT_ANALYTICS) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'LEAD_ANALYTICS_READ_MODEL=true exige DOMAIN_EVENT_ANALYTICS=true',
      ),
    );
  }
  if (flags.LEAD_ANALYTICS_READ_MODEL && !flags.DOMAIN_EVENTS) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'LEAD_ANALYTICS_READ_MODEL=true exige DOMAIN_EVENTS=true',
      ),
    );
  }
  if (flags.CQRS_READ_MODEL && !flags.DOMAIN_EVENT_ANALYTICS) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'CQRS_READ_MODEL=true exige DOMAIN_EVENT_ANALYTICS=true',
      ),
    );
  }
  if (flags.CQRS_READ_MODEL && !flags.DOMAIN_EVENTS) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'CQRS_READ_MODEL=true exige DOMAIN_EVENTS=true',
      ),
    );
  }
  if (flags.LEAD_ANALYTICS_READ_MODEL && !flags.CQRS_READ_MODEL) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'LEAD_ANALYTICS_READ_MODEL=true exige CQRS_READ_MODEL=true',
      ),
    );
  }
  if (flags.APPOINTMENT_ANALYTICS_READ_MODEL && !flags.CQRS_READ_MODEL) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'APPOINTMENT_ANALYTICS_READ_MODEL=true exige CQRS_READ_MODEL=true',
      ),
    );
  }
  if (flags.FINANCIAL_ANALYTICS_READ_MODEL && !flags.CQRS_READ_MODEL) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'FINANCIAL_ANALYTICS_READ_MODEL=true exige CQRS_READ_MODEL=true',
      ),
    );
  }
  if (flags.CQRS_READ_MODEL_SOAK && !flags.CQRS_READ_MODEL) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'CQRS_READ_MODEL_SOAK=true exige CQRS_READ_MODEL=true',
      ),
    );
  }
  if (flags.CQRS_READ_MODEL_SOAK && !flags.DOMAIN_EVENT_ANALYTICS) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'CQRS_READ_MODEL_SOAK=true exige DOMAIN_EVENT_ANALYTICS=true',
      ),
    );
  }
  if (flags.CQRS_READ_MODEL_CONSISTENCY && !flags.CQRS_READ_MODEL) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'CQRS_READ_MODEL_CONSISTENCY=true exige CQRS_READ_MODEL=true',
      ),
    );
  }
  if (flags.CQRS_READ_MODEL_CONSISTENCY && !flags.DOMAIN_EVENT_ANALYTICS) {
    issues.push(
      issue(
        'CONFLICTING_FLAGS',
        'warn',
        'CQRS_READ_MODEL_CONSISTENCY=true exige DOMAIN_EVENT_ANALYTICS=true',
      ),
    );
  }
  return issues;
}

/** Diagnóstico de um evento/payload genérico. */
export function diagnoseDomainEventCandidate(input: {
  type?: string;
  payload?: unknown;
  correlationId?: string | null;
  causationId?: string | null;
  aggregateId?: string | null;
}): DomainEventDiagnosticIssue[] {
  const issues: DomainEventDiagnosticIssue[] = [];
  const type = String(input.type || '').trim();
  if (!type) {
    issues.push(issue('INVALID_EVENT', 'error', 'eventType ausente'));
    return issues;
  }
  const def = getDomainEventRegistryEntry(type);
  if (!def) {
    issues.push(issue('INVALID_EVENT', 'error', `Tipo não registrado: ${type}`, { type }));
  }
  if (input.payload == null || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
    issues.push(issue('INVALID_PAYLOAD', 'error', 'payload deve ser objeto plano'));
  }
  if (!input.correlationId) {
    issues.push(issue('BROKEN_CORRELATION', 'warn', 'correlationId ausente'));
  }
  if (input.causationId === undefined) {
    // causation opcional; ausência explícita null é ok — flag só se campo undefined em cadeia esperada
  }
  if (input.causationId === null && input.aggregateId) {
    issues.push(
      issue('MISSING_CAUSATION', 'info', 'causationId null — evento raiz ou sem cadeia'),
    );
  }
  return issues;
}

/** Detecta possíveis duplicates a partir de traces in-memory. */
export function diagnoseDomainEventDuplicates(
  traces: DomainEventTraceEntry[],
): DomainEventDiagnosticIssue[] {
  const issues: DomainEventDiagnosticIssue[] = [];
  const seen = new Map<string, number>();
  for (const t of traces) {
    if (!t.eventId) continue;
    const n = (seen.get(t.eventId) || 0) + 1;
    seen.set(t.eventId, n);
    if (n === 2) {
      issues.push(
        issue('DUPLICATE_PUBLISH', 'warn', `eventId observado mais de uma vez: ${t.eventId}`, {
          eventId: t.eventId,
          eventType: t.eventType,
        }),
      );
    }
  }
  for (const t of traces) {
    if (String(t.reason || '').toLowerCase().includes('dedup')) {
      issues.push(
        issue('DUPLICATE_PUBLISH', 'info', 'Publish skipped por deduplicação', {
          eventId: t.eventId,
          reason: t.reason,
        }),
      );
    }
  }
  return issues;
}

export function runDomainEventDiagnostics(options?: {
  traces?: DomainEventTraceEntry[];
  candidate?: Parameters<typeof diagnoseDomainEventCandidate>[0];
}): DomainEventDiagnosticsReport {
  const issues: DomainEventDiagnosticIssue[] = [
    ...diagnoseDomainEventRegistry(),
    ...diagnoseDomainEventFlags(),
  ];
  if (options?.candidate) {
    issues.push(...diagnoseDomainEventCandidate(options.candidate));
  }
  if (options?.traces?.length) {
    issues.push(...diagnoseDomainEventDuplicates(options.traces));
  }
  const hasError = issues.some((i) => i.severity === 'error');
  return {
    ok: !hasError,
    checkedAt: new Date().toISOString(),
    issues,
  };
}
