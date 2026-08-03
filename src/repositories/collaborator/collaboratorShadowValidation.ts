/**
 * @module repositories/collaborator/collaboratorShadowValidation
 * @description Comparação arquitetural IDB vs Supabase — Sprint 1B Ticket 1.7.
 * LEGACY_RC01: observabilidade RC-01; remoção planejada RC-03.
 * Somente observabilidade; nunca altera retorno das funções legadas.
 */

import type { CollaboratorCore } from './collaboratorTypes.js';
import { isCollaboratorLegacyId, isCollaboratorUuid } from './collaboratorMapper.js';
import {
  classifyShadowCompareResult,
  INFORMATIONAL_SHADOW_FIELDS,
  type ShadowDiffClassification,
} from './collaboratorShadowDiffClassification.js';

// ---------------------------------------------------------------------------
// Tipos do relatório shadow
// ---------------------------------------------------------------------------

export interface CollaboratorShadowFieldDiff {
  field: string;
  localValue: unknown;
  remoteValue: unknown;
}

export interface CollaboratorShadowRef {
  legacyId: string;
  uuid: string;
  tenantId: string;
}

export interface CollaboratorShadowMatchEntry {
  ref: CollaboratorShadowRef;
}

export interface CollaboratorShadowMissingLocalEntry {
  ref: CollaboratorShadowRef;
}

export interface CollaboratorShadowMissingRemoteEntry {
  ref: CollaboratorShadowRef;
}

export interface CollaboratorShadowFieldDiffEntry {
  ref: CollaboratorShadowRef;
  diffs: CollaboratorShadowFieldDiff[];
}

export interface CollaboratorShadowDuplicateEntry {
  side: 'local' | 'remote';
  key: 'uuid' | 'legacy_id';
  value: string;
  legacyIds: string[];
}

export interface CollaboratorShadowInvalidUuidEntry {
  side: 'local' | 'remote';
  legacyId: string;
  uuid: string;
}

export interface CollaboratorShadowInvalidLegacyEntry {
  side: 'local' | 'remote';
  uuid: string;
  legacyId: string;
}

export interface CollaboratorShadowCompareResult {
  tenantId: string;
  comparedAt: string;
  counts: {
    local: number;
    remote: number;
  };
  match: CollaboratorShadowMatchEntry[];
  missing_local: CollaboratorShadowMissingLocalEntry[];
  missing_remote: CollaboratorShadowMissingRemoteEntry[];
  field_diff: CollaboratorShadowFieldDiffEntry[];
  duplicate: CollaboratorShadowDuplicateEntry[];
  invalid_uuid: CollaboratorShadowInvalidUuidEntry[];
  invalid_legacy: CollaboratorShadowInvalidLegacyEntry[];
}

export interface CollaboratorShadowReport {
  tenant: string;
  comparedAt: string;
  durationMs: number;
  matchPercent: number;
  diffCount: number;
  blockingDiffCount: number;
  transitionalDiffCount: number;
  informationalDiffCount: number;
  canPromoteReadPrimary: boolean;
  promotionBlockers: string[];
  summary: {
    localCount: number;
    remoteCount: number;
    matchCount: number;
    missingLocalCount: number;
    missingRemoteCount: number;
    fieldDiffCount: number;
    duplicateCount: number;
    invalidUuidCount: number;
    invalidLegacyCount: number;
    countMismatch: boolean;
    blockingDiffCount: number;
    transitionalDiffCount: number;
    informationalDiffCount: number;
    canPromoteReadPrimary: boolean;
  };
  classification: ShadowDiffClassification | null;
  details: CollaboratorShadowCompareResult | null;
  error?: string;
  timedOut?: boolean;
}

// ---------------------------------------------------------------------------
// Campos comparados (Ticket 1.7)
// ---------------------------------------------------------------------------

type ShadowFieldReader = (item: CollaboratorCore) => unknown;

const SHADOW_FIELD_READERS: ReadonlyArray<{ key: string; read: ShadowFieldReader }> = [
  { key: 'uuid', read: (c) => c.uuid },
  { key: 'legacy_id', read: (c) => c.legacyId },
  { key: 'tenant_id', read: (c) => c.tenantId },
  { key: 'email', read: (c) => c.email ?? null },
  { key: 'nome', read: (c) => c.nomeCompleto },
  { key: 'status', read: (c) => c.status },
  { key: 'cargo', read: (c) => c.cargo },
  { key: 'categoria', read: (c) => c.rhCategoria },
  { key: 'agenda_enabled', read: (c) => c.agendaEnabled },
  { key: 'updated_at', read: (c) => c.updatedAt },
];

function normalizeShadowValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value).trim();
}

function toRef(item: CollaboratorCore): CollaboratorShadowRef {
  return {
    legacyId: item.legacyId,
    uuid: item.uuid,
    tenantId: item.tenantId,
  };
}

function filterTenantItems(items: CollaboratorCore[], tenantId: string): CollaboratorCore[] {
  const normalized = String(tenantId || '').trim();
  return items.filter((item) => String(item.tenantId || '').trim() === normalized);
}

function detectDuplicates(
  items: CollaboratorCore[],
  side: 'local' | 'remote',
): CollaboratorShadowDuplicateEntry[] {
  const duplicates: CollaboratorShadowDuplicateEntry[] = [];

  for (const key of ['uuid', 'legacy_id'] as const) {
    const buckets = new Map<string, string[]>();
    for (const item of items) {
      const value = key === 'uuid' ? item.uuid : item.legacyId;
      const normalized = normalizeShadowValue(value);
      if (!normalized) continue;
      const list = buckets.get(normalized) ?? [];
      list.push(item.legacyId);
      buckets.set(normalized, list);
    }
    for (const [value, legacyIds] of buckets) {
      if (legacyIds.length > 1) {
        duplicates.push({ side, key, value, legacyIds });
      }
    }
  }

  return duplicates;
}

function detectInvalidUuid(
  items: CollaboratorCore[],
  side: 'local' | 'remote',
): CollaboratorShadowInvalidUuidEntry[] {
  const invalid: CollaboratorShadowInvalidUuidEntry[] = [];
  for (const item of items) {
    const uuid = String(item.uuid || '').trim();
    if (!uuid || !isCollaboratorUuid(uuid)) {
      invalid.push({ side, legacyId: item.legacyId, uuid });
    }
  }
  return invalid;
}

function detectInvalidLegacy(
  items: CollaboratorCore[],
  side: 'local' | 'remote',
): CollaboratorShadowInvalidLegacyEntry[] {
  const invalid: CollaboratorShadowInvalidLegacyEntry[] = [];
  for (const item of items) {
    const legacyId = String(item.legacyId || '').trim();
    if (!legacyId || !isCollaboratorLegacyId(legacyId)) {
      invalid.push({ side, uuid: item.uuid, legacyId });
    }
  }
  return invalid;
}

function splitShadowFieldDiffs(diffs: CollaboratorShadowFieldDiff[]): {
  structural: CollaboratorShadowFieldDiff[];
  informational: CollaboratorShadowFieldDiff[];
} {
  const structural: CollaboratorShadowFieldDiff[] = [];
  const informational: CollaboratorShadowFieldDiff[] = [];
  for (const diff of diffs) {
    if (INFORMATIONAL_SHADOW_FIELDS.has(diff.field)) {
      informational.push(diff);
    } else {
      structural.push(diff);
    }
  }
  return { structural, informational };
}

/**
 * Compara campos canônicos entre um par local/remoto.
 */
export function compareCollaboratorFields(
  local: CollaboratorCore,
  remote: CollaboratorCore,
): CollaboratorShadowFieldDiff[] {
  const diffs: CollaboratorShadowFieldDiff[] = [];
  for (const spec of SHADOW_FIELD_READERS) {
    const localValue = spec.read(local);
    const remoteValue = spec.read(remote);
    if (normalizeShadowValue(localValue) !== normalizeShadowValue(remoteValue)) {
      diffs.push({
        field: spec.key,
        localValue,
        remoteValue,
      });
    }
  }
  return diffs;
}

/**
 * Comparação completa IDB vs Supabase para shadow read / QA arquitetural.
 */
export function compareCollaborators(
  tenantId: string,
  localItems: CollaboratorCore[],
  remoteItems: CollaboratorCore[],
): CollaboratorShadowCompareResult {
  const normalizedTenant = String(tenantId || '').trim();
  const local = filterTenantItems(localItems, normalizedTenant);
  const remote = filterTenantItems(remoteItems, normalizedTenant);

  const duplicate = [
    ...detectDuplicates(local, 'local'),
    ...detectDuplicates(remote, 'remote'),
  ];
  const invalid_uuid = [
    ...detectInvalidUuid(local, 'local'),
    ...detectInvalidUuid(remote, 'remote'),
  ];
  const invalid_legacy = [
    ...detectInvalidLegacy(local, 'local'),
    ...detectInvalidLegacy(remote, 'remote'),
  ];

  const duplicateLegacyIds = new Set(
    duplicate.flatMap((d) => d.legacyIds),
  );

  const localMap = new Map<string, CollaboratorCore>();
  for (const item of local) {
    if (!item.legacyId || duplicateLegacyIds.has(item.legacyId)) continue;
    localMap.set(item.legacyId, item);
  }

  const remoteMap = new Map<string, CollaboratorCore>();
  for (const item of remote) {
    if (!item.legacyId || duplicateLegacyIds.has(item.legacyId)) continue;
    remoteMap.set(item.legacyId, item);
  }

  const match: CollaboratorShadowMatchEntry[] = [];
  const missing_local: CollaboratorShadowMissingLocalEntry[] = [];
  const missing_remote: CollaboratorShadowMissingRemoteEntry[] = [];
  const field_diff: CollaboratorShadowFieldDiffEntry[] = [];

  const allLegacyIds = new Set([...localMap.keys(), ...remoteMap.keys()]);

  for (const legacyId of allLegacyIds) {
    const localItem = localMap.get(legacyId);
    const remoteItem = remoteMap.get(legacyId);

    if (localItem && !remoteItem) {
      missing_remote.push({ ref: toRef(localItem) });
      continue;
    }
    if (remoteItem && !localItem) {
      missing_local.push({ ref: toRef(remoteItem) });
      continue;
    }
    if (!localItem || !remoteItem) continue;

    const diffs = compareCollaboratorFields(localItem, remoteItem);
    const { structural, informational } = splitShadowFieldDiffs(diffs);

    if (structural.length === 0) {
      match.push({ ref: toRef(localItem) });
      if (informational.length > 0) {
        field_diff.push({ ref: toRef(localItem), diffs: informational });
      }
    } else {
      field_diff.push({ ref: toRef(localItem), diffs });
    }
  }

  return {
    tenantId: normalizedTenant,
    comparedAt: new Date().toISOString(),
    counts: {
      local: local.length,
      remote: remote.length,
    },
    match,
    missing_local,
    missing_remote,
    field_diff,
    duplicate,
    invalid_uuid,
    invalid_legacy,
  };
}

function countShadowDiffs(details: CollaboratorShadowCompareResult): number {
  return (
    details.missing_local.length
    + details.missing_remote.length
    + details.field_diff.length
    + details.duplicate.length
    + details.invalid_uuid.length
    + details.invalid_legacy.length
    + (details.counts.local !== details.counts.remote ? 1 : 0)
  );
}

/**
 * Gera relatório consolidado para logs DEV e diagnóstico.
 */
export function generateShadowReport(
  input:
    | CollaboratorShadowCompareResult
    | { tenantId: string; error: string; durationMs?: number; timedOut?: boolean },
  durationMs = 0,
): CollaboratorShadowReport {
  if ('error' in input && !('counts' in input)) {
    return {
      tenant: input.tenantId,
      comparedAt: new Date().toISOString(),
      durationMs: input.durationMs ?? durationMs,
      matchPercent: 0,
      diffCount: 0,
      blockingDiffCount: 0,
      transitionalDiffCount: 0,
      informationalDiffCount: 0,
      canPromoteReadPrimary: false,
      promotionBlockers: input.error ? [input.error] : [],
      summary: {
        localCount: 0,
        remoteCount: 0,
        matchCount: 0,
        missingLocalCount: 0,
        missingRemoteCount: 0,
        fieldDiffCount: 0,
        duplicateCount: 0,
        invalidUuidCount: 0,
        invalidLegacyCount: 0,
        countMismatch: false,
        blockingDiffCount: 0,
        transitionalDiffCount: 0,
        informationalDiffCount: 0,
        canPromoteReadPrimary: false,
      },
      classification: null,
      details: null,
      error: input.error,
      timedOut: input.timedOut ?? false,
    };
  }

  const details = input as CollaboratorShadowCompareResult;
  const diffCount = countShadowDiffs(details);
  const classification = classifyShadowCompareResult(details);
  const denominator = Math.max(details.counts.local, details.counts.remote, 1);
  const matchPercent = Math.round((details.match.length / denominator) * 10000) / 100;

  return {
    tenant: details.tenantId,
    comparedAt: details.comparedAt,
    durationMs,
    matchPercent,
    diffCount,
    blockingDiffCount: classification.blockingDiffCount,
    transitionalDiffCount: classification.transitionalDiffCount,
    informationalDiffCount: classification.informationalDiffCount,
    canPromoteReadPrimary: classification.canPromoteReadPrimary,
    promotionBlockers: classification.promotionBlockers,
    summary: {
      localCount: details.counts.local,
      remoteCount: details.counts.remote,
      matchCount: details.match.length,
      missingLocalCount: details.missing_local.length,
      missingRemoteCount: details.missing_remote.length,
      fieldDiffCount: details.field_diff.length,
      duplicateCount: details.duplicate.length,
      invalidUuidCount: details.invalid_uuid.length,
      invalidLegacyCount: details.invalid_legacy.length,
      countMismatch: details.counts.local !== details.counts.remote,
      blockingDiffCount: classification.blockingDiffCount,
      transitionalDiffCount: classification.transitionalDiffCount,
      informationalDiffCount: classification.informationalDiffCount,
      canPromoteReadPrimary: classification.canPromoteReadPrimary,
    },
    classification,
    details,
  };
}

/** Timeout padrão para shadow read em background (ms). */
export const RH_SHADOW_DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Executa promise com timeout — falha silenciosa para shadow read.
 */
export function runWithShadowTimeout<T>(
  promise: Promise<T>,
  timeoutMs = RH_SHADOW_DEFAULT_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`RH_SHADOW timeout após ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Log estruturado somente DEV — nunca em produção.
 */
export function logRhShadowDev(
  report: CollaboratorShadowReport,
  context?: string,
): void {
  if (!import.meta.env?.DEV) return;

  if (report.error) {
    console.debug('[RH_SHADOW]', {
      tenant: report.tenant,
      matchPercent: 0,
      diffCount: report.diffCount,
      durationMs: report.durationMs,
      error: report.error,
      timedOut: report.timedOut ?? false,
      context,
    });
    return;
  }

  console.debug('[RH_SHADOW]', {
    tenant: report.tenant,
    matchPercent: report.matchPercent,
    diffCount: report.diffCount,
    blockingDiffCount: report.blockingDiffCount,
    transitionalDiffCount: report.transitionalDiffCount,
    informationalDiffCount: report.informationalDiffCount,
    canPromoteReadPrimary: report.canPromoteReadPrimary,
    promotionBlockers: report.promotionBlockers,
    durationMs: report.durationMs,
    context,
    summary: report.summary,
  });
}
