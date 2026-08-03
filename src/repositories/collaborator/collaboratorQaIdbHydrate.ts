/**
 * @module repositories/collaborator/collaboratorQaIdbHydrate
 * @description Hidratação QA IDB ← Supabase (RC-01.5). LEGACY_RC01 — RC-03 remove.
 * Somente `collaborators[]` local.
 */

import { withDb } from '../../db/index.js';
import { normalizeTenantId } from '../../services/tenantIsolation.js';
import {
  isCollaboratorUuid,
  mapCoreToIndexedDbMirror,
} from './collaboratorMapper.js';
import type {
  CollaboratorCore,
  CollaboratorIndexedDbRow,
  CollaboratorIndexedDbUpsertDto,
} from './collaboratorTypes.js';

export type HydratePlanAction = 'insert' | 'update' | 'skip' | 'conflict';

export interface CollaboratorIdbHydratePlanItem {
  action: HydratePlanAction;
  legacyId: string;
  uuid: string;
  email: string;
  matchBy?: 'legacy_id' | 'uuid' | 'email' | 'none';
  staleLocalId?: string;
  reason?: string;
  mirror?: CollaboratorIndexedDbUpsertDto;
}

export interface CollaboratorIdbHydratePlan {
  tenantId: string;
  remoteCount: number;
  localCountBefore: number;
  items: CollaboratorIdbHydratePlanItem[];
}

export interface CollaboratorIdbHydrateApplyReport {
  tenantId: string;
  hydratedAt: string;
  inserted: Array<{ legacyId: string; uuid: string; email: string }>;
  updated: Array<{ legacyId: string; uuid: string; email: string; previousLegacyId?: string }>;
  skipped: Array<{ legacyId: string; uuid: string; email: string; reason: string }>;
  conflicts: Array<{ legacyId: string; uuid: string; email: string; reason: string }>;
  errors: Array<{ legacyId: string; message: string }>;
  localCountAfter: number;
  supabaseWritesExecuted: false;
}

function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function rowMatchesTenant(row: CollaboratorIndexedDbRow, tenantId: string): boolean {
  const rowTenant = normalizeTenantId(row?.tenant_id || row?.tenantId);
  if (!rowTenant) return false;
  return rowTenant === tenantId;
}

function listTenantRows(rows: CollaboratorIndexedDbRow[], tenantId: string): CollaboratorIndexedDbRow[] {
  return (rows || []).filter((row) => rowMatchesTenant(row, tenantId));
}

function mirrorFieldsEqual(
  prev: CollaboratorIndexedDbRow,
  mirror: CollaboratorIndexedDbUpsertDto,
): boolean {
  return (
    String(prev.id || '').trim() === String(mirror.id || '').trim()
    && String(prev.uuid || '').trim() === String(mirror.uuid || '').trim()
    && normalizeEmail(prev.email) === normalizeEmail(mirror.email)
    && String(prev.apelido || '') === String(mirror.apelido || '')
    && String(prev.nomeCompleto || '') === String(mirror.nomeCompleto || '')
    && String(prev.status || '') === String(mirror.status || '')
    && String(prev.cargo || '') === String(mirror.cargo || '')
    && String(prev.rhCategoria || '') === String(mirror.rhCategoria || '')
    && String(prev.updatedAt || '') === String(mirror.updatedAt || '')
  );
}

function findLocalMatch(
  localRows: CollaboratorIndexedDbRow[],
  core: CollaboratorCore,
): { row: CollaboratorIndexedDbRow; matchBy: 'legacy_id' | 'uuid' | 'email' } | null {
  const legacyId = String(core.legacyId || '').trim();
  const uuid = String(core.uuid || '').trim();
  const email = normalizeEmail(core.email);

  if (legacyId) {
    const byLegacy = localRows.find((row) => String(row.id || '').trim() === legacyId);
    if (byLegacy) return { row: byLegacy, matchBy: 'legacy_id' };
  }

  if (uuid && isCollaboratorUuid(uuid)) {
    const byUuid = localRows.find((row) => {
      const rowUuid = String(row.uuid || '').trim();
      return rowUuid === uuid || String(row.id || '').trim() === uuid;
    });
    if (byUuid) return { row: byUuid, matchBy: 'uuid' };
  }

  if (email) {
    const matches = localRows.filter((row) => normalizeEmail(row.email) === email);
    if (matches.length > 1) {
      return null;
    }
    if (matches.length === 1) {
      return { row: matches[0], matchBy: 'email' };
    }
  }

  return null;
}

function detectEmailAmbiguity(
  localRows: CollaboratorIndexedDbRow[],
  core: CollaboratorCore,
): string | null {
  const email = normalizeEmail(core.email);
  if (!email) return null;
  const matches = localRows.filter((row) => normalizeEmail(row.email) === email);
  if (matches.length > 1) {
    return `Múltiplos registros locais para e-mail ${email}.`;
  }
  return null;
}

/**
 * Plano puro de hidratação — nenhuma mutação.
 */
export function buildCollaboratorIdbHydratePlan(
  tenantId: string,
  localRows: CollaboratorIndexedDbRow[],
  remoteCores: CollaboratorCore[],
): CollaboratorIdbHydratePlan {
  const tid = normalizeTenantId(tenantId);
  if (!tid) {
    throw new Error('tenant_id é obrigatório para hidratação QA.');
  }

  const scopedLocal = listTenantRows(localRows, tid);
  const remoteForTenant = remoteCores.filter((core) => normalizeTenantId(core.tenantId) === tid);

  const items: CollaboratorIdbHydratePlanItem[] = [];

  for (const core of remoteForTenant) {
    const legacyId = String(core.legacyId || '').trim();
    const uuid = String(core.uuid || '').trim();
    const email = normalizeEmail(core.email);
    const mirror = mapCoreToIndexedDbMirror(core);

    const ambiguity = detectEmailAmbiguity(scopedLocal, core);
    if (ambiguity) {
      items.push({
        action: 'conflict',
        legacyId,
        uuid,
        email,
        reason: ambiguity,
      });
      continue;
    }

    const match = findLocalMatch(scopedLocal, core);
    if (!match) {
      items.push({
        action: 'insert',
        legacyId,
        uuid,
        email,
        matchBy: 'none',
        mirror,
        reason: 'Registro ausente no IndexedDB local.',
      });
      continue;
    }

    const prev = match.row;
    const prevId = String(prev.id || '').trim();
    const staleLocalId = prevId !== legacyId ? prevId : undefined;

    if (
      staleLocalId
      && scopedLocal.some(
        (row) => row.id === legacyId && normalizeEmail(row.email) !== email,
      )
    ) {
      items.push({
        action: 'conflict',
        legacyId,
        uuid,
        email,
        reason: `legacy_id ${legacyId} já pertence a outro colaborador local.`,
      });
      continue;
    }

    if (mirrorFieldsEqual(prev, mirror)) {
      items.push({
        action: 'skip',
        legacyId,
        uuid,
        email,
        matchBy: match.matchBy,
        mirror,
        reason: 'Registro local já alinhado ao remoto.',
      });
      continue;
    }

    items.push({
      action: 'update',
      legacyId,
      uuid,
      email,
      matchBy: match.matchBy,
      staleLocalId,
      mirror,
      reason: staleLocalId
        ? `Atualizar registro local (${match.matchBy}) e corrigir legacy id.`
        : `Atualizar registro local (${match.matchBy}).`,
    });
  }

  return {
    tenantId: tid,
    remoteCount: remoteForTenant.length,
    localCountBefore: scopedLocal.length,
    items,
  };
}

/**
 * Aplica plano somente em `db.collaborators` — sem Supabase, appointments ou satellites.
 */
export function applyCollaboratorIdbHydratePlan(
  plan: CollaboratorIdbHydratePlan,
): CollaboratorIdbHydrateApplyReport {
  const report: CollaboratorIdbHydrateApplyReport = {
    tenantId: plan.tenantId,
    hydratedAt: new Date().toISOString(),
    inserted: [],
    updated: [],
    skipped: [],
    conflicts: [],
    errors: [],
    localCountAfter: 0,
    supabaseWritesExecuted: false,
  };

  for (const item of plan.items) {
    if (item.action === 'conflict') {
      report.conflicts.push({
        legacyId: item.legacyId,
        uuid: item.uuid,
        email: item.email,
        reason: item.reason || 'Conflito de hidratação.',
      });
      continue;
    }

    if (item.action === 'skip') {
      report.skipped.push({
        legacyId: item.legacyId,
        uuid: item.uuid,
        email: item.email,
        reason: item.reason || 'skip',
      });
      continue;
    }

    if (!item.mirror) {
      report.errors.push({
        legacyId: item.legacyId,
        message: 'Plano sem payload mirror.',
      });
      continue;
    }

    try {
      withDb((db) => {
        db.collaborators = db.collaborators || [];
        const tenantId = plan.tenantId;
        const mirror = item.mirror!;

        if (item.action === 'insert') {
          const dupIdx = db.collaborators.findIndex(
            (row) => row.id === mirror.id && rowMatchesTenant(row, tenantId),
          );
          if (dupIdx >= 0) {
            db.collaborators[dupIdx] = { ...db.collaborators[dupIdx], ...mirror, tenant_id: tenantId };
          } else {
            db.collaborators.push({ ...mirror, tenant_id: tenantId });
          }
          return db;
        }

        const email = normalizeEmail(mirror.email);
        let idx = db.collaborators.findIndex(
          (row) => row.id === mirror.id && rowMatchesTenant(row, tenantId),
        );

        if (idx < 0 && item.staleLocalId) {
          idx = db.collaborators.findIndex(
            (row) => row.id === item.staleLocalId && rowMatchesTenant(row, tenantId),
          );
        }

        if (idx < 0 && email) {
          idx = db.collaborators.findIndex(
            (row) => rowMatchesTenant(row, tenantId) && normalizeEmail(row.email) === email,
          );
        }

        if (idx < 0) {
          db.collaborators.push({ ...mirror, tenant_id: tenantId });
          return db;
        }

        const prev = db.collaborators[idx];
        db.collaborators[idx] = {
          ...prev,
          ...mirror,
          id: mirror.id,
          uuid: mirror.uuid,
          tenant_id: tenantId,
        };

        if (item.staleLocalId && item.staleLocalId !== mirror.id) {
          db.collaborators = db.collaborators.filter(
            (row) => !(rowMatchesTenant(row, tenantId) && row.id === item.staleLocalId),
          );
        }

        return db;
      });

      if (item.action === 'insert') {
        report.inserted.push({
          legacyId: item.legacyId,
          uuid: item.uuid,
          email: item.email,
        });
      } else {
        report.updated.push({
          legacyId: item.legacyId,
          uuid: item.uuid,
          email: item.email,
          previousLegacyId: item.staleLocalId,
        });
      }
    } catch (err) {
      report.errors.push({
        legacyId: item.legacyId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  withDb((db) => {
    report.localCountAfter = listTenantRows(db.collaborators || [], plan.tenantId).length;
    return db;
  });

  return report;
}
