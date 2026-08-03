/**
 * @module repositories/collaborator/collaboratorUuidMirror
 * @description Espelhamento controlado de collaborator_uuid → campo `uuid` no IDB (Ticket 1.13).
 * LEGACY_RC01: preferir hydrate read-primary (RC-02); remoção RC-03.
 * Somente metadado/cache local; não altera `id` legado nem Supabase.
 */

import { isCollaboratorLegacyId, isCollaboratorUuid } from './collaboratorMapper.js';
import type { CollaboratorIndexedDbRow } from './collaboratorTypes.js';

/** Linha remota mínima (Supabase read-only). */
export interface CollaboratorUuidMirrorRemoteRow {
  id: string;
  legacy_id: string;
  tenant_id?: string | null;
}

export type CollaboratorUuidMirrorOutcome =
  | 'updated'
  | 'skipped'
  | 'notFound'
  | 'conflict'
  | 'error';

export interface CollaboratorUuidMirrorUpdatedEntry {
  legacyId: string;
  uuid: string;
  previousUuid?: string;
}

export interface CollaboratorUuidMirrorSkippedEntry {
  legacyId: string;
  uuid: string;
}

export interface CollaboratorUuidMirrorNotFoundEntry {
  legacyId: string;
  uuid: string;
}

export interface CollaboratorUuidMirrorConflictEntry {
  legacyId: string;
  reason: string;
  uuid?: string;
  existingUuid?: string;
}

export interface CollaboratorUuidMirrorErrorEntry {
  legacyId?: string;
  message: string;
}

export interface CollaboratorUuidMirrorReport {
  tenantId: string;
  mirroredAt: string;
  updated: CollaboratorUuidMirrorUpdatedEntry[];
  skipped: CollaboratorUuidMirrorSkippedEntry[];
  notFound: CollaboratorUuidMirrorNotFoundEntry[];
  conflicts: CollaboratorUuidMirrorConflictEntry[];
  errors: CollaboratorUuidMirrorErrorEntry[];
  supabaseWritesExecuted: false;
}

export interface CollaboratorUuidMirrorPlanItem {
  action: 'update' | 'skip' | 'notFound' | 'conflict';
  legacyId: string;
  uuid: string;
  previousUuid?: string;
  reason?: string;
}

/** Bloqueado em produção (Ticket 1.13). */
export class CollaboratorUuidMirrorForbiddenError extends Error {
  readonly code = 'COLLABORATOR_UUID_MIRROR_FORBIDDEN';

  constructor(message = 'Espelhamento UUID local bloqueado fora de dev/staging.') {
    super(message);
    this.name = 'CollaboratorUuidMirrorForbiddenError';
  }
}

export function isProductionRuntime(): boolean {
  return Boolean(typeof import.meta !== 'undefined' && import.meta.env?.PROD);
}

/** @throws {CollaboratorUuidMirrorForbiddenError} */
export function assertUuidMirrorEnvironment(): void {
  if (isProductionRuntime()) {
    throw new CollaboratorUuidMirrorForbiddenError(
      'mirrorCollaboratorUuidsToIndexedDb bloqueado em produção.',
    );
  }
}

function norm(value: unknown): string {
  return String(value ?? '').trim();
}

function emptyReport(tenantId: string): CollaboratorUuidMirrorReport {
  return {
    tenantId,
    mirroredAt: new Date().toISOString(),
    updated: [],
    skipped: [],
    notFound: [],
    conflicts: [],
    errors: [],
    supabaseWritesExecuted: false,
  };
}

function indexLocalByLegacy(
  localRows: CollaboratorIndexedDbRow[],
  tenantId: string,
): { byLegacy: Map<string, CollaboratorIndexedDbRow[]>; uuidOwners: Map<string, string[]> } {
  const normalizedTenant = norm(tenantId);
  const byLegacy = new Map<string, CollaboratorIndexedDbRow[]>();
  const uuidOwners = new Map<string, string[]>();

  for (const row of localRows) {
    const rowTenant = norm(row.tenant_id ?? row.tenantId);
    if (rowTenant && rowTenant !== normalizedTenant) continue;

    const legacyId = norm(row.id);
    if (!legacyId) continue;

    const list = byLegacy.get(legacyId) ?? [];
    list.push(row);
    byLegacy.set(legacyId, list);

    const localUuid = norm(row.uuid);
    if (localUuid && isCollaboratorUuid(localUuid)) {
      const owners = uuidOwners.get(localUuid) ?? [];
      owners.push(legacyId);
      uuidOwners.set(localUuid, owners);
    }
  }

  return { byLegacy, uuidOwners };
}

/**
 * Plano puro — não escreve IDB nem Supabase.
 */
export function buildCollaboratorUuidMirrorPlan(
  tenantId: string,
  localRows: CollaboratorIndexedDbRow[],
  remoteRows: CollaboratorUuidMirrorRemoteRow[],
): CollaboratorUuidMirrorPlanItem[] {
  const plan: CollaboratorUuidMirrorPlanItem[] = [];
  const { byLegacy, uuidOwners } = indexLocalByLegacy(localRows, tenantId);

  for (const remote of remoteRows) {
    const legacyId = norm(remote.legacy_id);
    const uuid = norm(remote.id);

    if (!legacyId || !isCollaboratorLegacyId(legacyId)) {
      plan.push({
        action: 'conflict',
        legacyId: legacyId || '(missing)',
        uuid,
        reason: 'legacy_id remoto ausente ou inválido.',
      });
      continue;
    }

    if (!uuid || !isCollaboratorUuid(uuid)) {
      plan.push({
        action: 'conflict',
        legacyId,
        uuid,
        reason: 'UUID canônico remoto ausente ou inválido.',
      });
      continue;
    }

    const locals = byLegacy.get(legacyId) ?? [];
    if (locals.length === 0) {
      plan.push({ action: 'notFound', legacyId, uuid });
      continue;
    }

    if (locals.length > 1) {
      plan.push({
        action: 'conflict',
        legacyId,
        uuid,
        reason: `legacy_id duplicado no IndexedDB local (${locals.length} registros).`,
      });
      continue;
    }

    const local = locals[0];
    const previousUuid = norm(local.uuid);
    const localLegacyId = norm(local.id);

    if (localLegacyId !== legacyId) {
      plan.push({
        action: 'conflict',
        legacyId,
        uuid,
        reason: 'id legado local divergente — espelhamento abortado.',
      });
      continue;
    }

    if (previousUuid === uuid) {
      plan.push({ action: 'skip', legacyId, uuid, previousUuid });
      continue;
    }

    if (previousUuid && isCollaboratorUuid(previousUuid) && previousUuid !== uuid) {
      plan.push({
        action: 'conflict',
        legacyId,
        uuid,
        previousUuid,
        reason: 'UUID local canônico divergente do remoto — conflito não resolvido automaticamente.',
      });
      continue;
    }

    const owners = uuidOwners.get(uuid) ?? [];
    if (owners.length > 0 && !owners.includes(legacyId)) {
      plan.push({
        action: 'conflict',
        legacyId,
        uuid,
        reason: `UUID canônico já pertence a outro legacy_id local (${owners.join(', ')}).`,
      });
      continue;
    }

    plan.push({ action: 'update', legacyId, uuid, previousUuid: previousUuid || undefined });
  }

  return plan;
}

export function mergeUuidMirrorPlanIntoReport(
  tenantId: string,
  plan: CollaboratorUuidMirrorPlanItem[],
): CollaboratorUuidMirrorReport {
  const report = emptyReport(tenantId);
  for (const item of plan) {
    switch (item.action) {
      case 'update':
        break;
      case 'skip':
        report.skipped.push({ legacyId: item.legacyId, uuid: item.uuid });
        break;
      case 'notFound':
        report.notFound.push({ legacyId: item.legacyId, uuid: item.uuid });
        break;
      case 'conflict':
        report.conflicts.push({
          legacyId: item.legacyId,
          reason: item.reason || 'conflito',
          uuid: item.uuid,
          existingUuid: item.previousUuid,
        });
        break;
      default:
        break;
    }
  }
  return report;
}

export function normalizeRemoteCollaboratorRows(
  rows: CollaboratorUuidMirrorRemoteRow[],
): CollaboratorUuidMirrorRemoteRow[] {
  return (rows || []).map((row) => ({
    id: norm(row.id),
    legacy_id: norm(row.legacy_id),
    tenant_id: row.tenant_id ?? null,
  }));
}
