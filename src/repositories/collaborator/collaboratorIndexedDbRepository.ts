/**
 * @module repositories/collaborator/collaboratorIndexedDbRepository
 * @description Adapter IndexedDB — ficha RH core (`collaborators[]`).
 * **Ticket:** Sprint 1A — 1.4 internal wiring
 */

import { loadDb, withDb } from '../../db/index.js';
import { isAgendaProfessional } from '../../constants/collaboratorRhCatalog.js';
import { normalizeTenantId } from '../../services/tenantIsolation.js';
import {
  isCollaboratorUuid,
  mapCoreToIndexedDbMirror,
  mapIndexedDbRowToCore,
} from './collaboratorMapper.js';
import { requireRepositoryTenantId } from './collaboratorRepositoryGuards.js';
import type {
  CollaboratorCore,
  CollaboratorIndexedDbRow,
  CollaboratorIndexedDbUpsertDto,
  CollaboratorListFilters,
  LegacyCollaboratorServiceListFilters,
  LegacyProfessionalOptionsFilters,
  CollaboratorLegacyAccessLink,
  CollaboratorLegacySatellitesBundle,
  ICollaboratorIndexedDbRepository,
} from './collaboratorTypes.js';

export const IDB_COLLABORATORS_COLLECTION = 'collaborators';

function rowMatchesTenant(row: CollaboratorIndexedDbRow, tenantId: string): boolean {
  const rowTenant = normalizeTenantId(row?.tenant_id);
  if (!rowTenant) return true;
  return rowTenant === tenantId;
}

function mapRow(row: CollaboratorIndexedDbRow, tenantId: string): CollaboratorCore {
  return mapIndexedDbRowToCore({
    ...row,
    tenant_id: row.tenant_id ?? tenantId,
  });
}

function applyListFilters(
  items: CollaboratorCore[],
  filters?: CollaboratorListFilters,
): CollaboratorCore[] {
  if (!filters) return items;
  let result = items;
  if (filters.status) {
    result = result.filter((item) => item.status === filters.status);
  }
  if (filters.agendaEnabled !== undefined) {
    result = result.filter((item) => item.agendaEnabled === filters.agendaEnabled);
  }
  if (filters.search) {
    const q = filters.search.trim().toLowerCase();
    result = result.filter(
      (item) =>
        item.apelido.toLowerCase().includes(q)
        || item.nomeCompleto.toLowerCase().includes(q)
        || String(item.email || '').toLowerCase().includes(q),
    );
  }
  if (!filters.includeDeleted) {
    result = result.filter((item) => !item.deletedAt && item.status !== 'inativo');
  }
  return result;
}

function normalizeLegacyAccess(raw: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const userId = (raw.userId ?? raw.user_id ?? '').toString().trim();
  return { ...raw, userId: userId || undefined };
}

function filterCollaboratorsByTenant(
  rows: CollaboratorIndexedDbRow[],
  tenantId: string,
): CollaboratorIndexedDbRow[] {
  const tid = normalizeTenantId(tenantId);
  if (!tid) return [];
  return rows.filter((row) => {
    const rowTenant = normalizeTenantId(row?.tenant_id || row?.tenantId);
    if (!rowTenant) return false;
    return rowTenant === tid;
  });
}

export class CollaboratorIndexedDbRepository implements ICollaboratorIndexedDbRepository {
  findByLegacyId(tenantId: string, legacyId: string): CollaboratorCore | null {
    requireRepositoryTenantId(tenantId);
    const id = String(legacyId || '').trim();
    if (!id) return null;
    const row = (loadDb().collaborators || []).find(
      (item) => item.id === id && rowMatchesTenant(item, tenantId),
    );
    return row ? mapRow(row, tenantId) : null;
  }

  findByUuid(tenantId: string, uuid: string): CollaboratorCore | null {
    requireRepositoryTenantId(tenantId);
    const needle = String(uuid || '').trim();
    if (!needle) return null;
    const row = (loadDb().collaborators || []).find((item) => {
      if (!rowMatchesTenant(item, tenantId)) return false;
      if (item.uuid === needle) return true;
      if (isCollaboratorUuid(needle) && item.id === needle) return true;
      return false;
    });
    return row ? mapRow(row, tenantId) : null;
  }

  list(tenantId: string, filters?: CollaboratorListFilters): CollaboratorCore[] {
    requireRepositoryTenantId(tenantId);
    const rows = (loadDb().collaborators || []).filter((row) => rowMatchesTenant(row, tenantId));
    return applyListFilters(rows.map((row) => mapRow(row, tenantId)), filters);
  }

  listLegacySync(
    filters: LegacyCollaboratorServiceListFilters,
    saasModeEnabled: boolean,
  ): CollaboratorIndexedDbRow[] {
    const tenantFilter = normalizeTenantId(filters.tenantId || filters.tenant_id);
    if (saasModeEnabled && !tenantFilter) {
      return [];
    }
    return (loadDb().collaborators || []).filter((item) => {
      if (tenantFilter) {
        const rowTenant = normalizeTenantId(item.tenant_id || item.tenantId);
        if (!rowTenant || rowTenant !== tenantFilter) return false;
      } else if (saasModeEnabled) {
        return false;
      }
      if (filters.status && item.status !== filters.status) return false;
      if (filters.cargo && item.cargo !== filters.cargo) return false;
      if (filters.especialidade && !item.especialidades?.includes(filters.especialidade)) {
        return false;
      }
      return true;
    });
  }

  getLegacyProfileSync(collaboratorId: string): CollaboratorIndexedDbRow | null {
    const id = String(collaboratorId || '').trim();
    if (!id) return null;
    return (loadDb().collaborators || []).find((item) => item.id === id) ?? null;
  }

  getLegacySatellitesSync(collaboratorId: string): CollaboratorLegacySatellitesBundle {
    const id = String(collaboratorId || '').trim();
    const db = loadDb();
    const rawAccess = db.collaboratorAccess.find((item) => item.collaboratorId === id) || {};
    return {
      documents: db.collaboratorDocuments.find((item) => item.collaboratorId === id) || {},
      education: db.collaboratorEducation.filter((item) => item.collaboratorId === id),
      nationality: db.collaboratorNationality.find((item) => item.collaboratorId === id) || {},
      phones: db.collaboratorPhones.filter((item) => item.collaboratorId === id),
      addresses: db.collaboratorAddresses.filter((item) => item.collaboratorId === id),
      relationships: db.collaboratorRelationships.find((item) => item.collaboratorId === id) || {},
      characteristics: db.collaboratorCharacteristics.find((item) => item.collaboratorId === id) || {},
      additional: db.collaboratorAdditional.find((item) => item.collaboratorId === id) || { notes: '' },
      insurances: db.collaboratorInsurances.filter((item) => item.collaboratorId === id),
      access: normalizeLegacyAccess(rawAccess),
      workHours: db.collaboratorWorkHours.filter((item) => item.collaboratorId === id),
      finance: db.collaboratorFinance.find((item) => item.collaboratorId === id) || {},
    };
  }

  listProfessionalOptionsLegacySync(
    filters: LegacyProfessionalOptionsFilters,
    saasModeEnabled: boolean,
  ): CollaboratorIndexedDbRow[] {
    const db = loadDb();
    const tenantFilter = normalizeTenantId(
      filters.tenantId
      || filters.tenant_id
      || db.clinicProfile?.tenant_id,
    );
    if (saasModeEnabled && !tenantFilter) {
      return [];
    }
    return (db.collaborators ?? [])
      .filter((item) => item.status === 'ativo')
      .filter((item) => {
        if (!tenantFilter) return true;
        const rowTenant = normalizeTenantId(item.tenant_id || item.tenantId);
        return rowTenant === tenantFilter;
      })
      .filter((item) => isAgendaProfessional(item));
  }

  listCollaboratorsByTenantLegacySync(tenantId: string): CollaboratorIndexedDbRow[] {
    return filterCollaboratorsByTenant(loadDb().collaborators || [], tenantId);
  }

  getPrimaryPhoneLegacySync(collaboratorId: string): string {
    const id = String(collaboratorId || '').trim();
    const phones = (loadDb().collaboratorPhones || []).filter((p) => p.collaboratorId === id);
    const primary = phones.find((p) => p.principal) || phones[0];
    if (primary?.ddd && primary?.numero) {
      return `${primary.ddd}${primary.numero}`;
    }
    return '';
  }

  getLegacyAccessLinkSync(collaboratorId: string): CollaboratorLegacyAccessLink | null {
    const id = String(collaboratorId || '').trim();
    if (!id) return null;
    const row = (loadDb().collaboratorAccess || []).find((item) => item.collaboratorId === id);
    if (!row?.userId) return null;
    return {
      collaboratorId: id,
      userId: row.userId,
      role: row.role || 'atendimento',
    };
  }

  getClinicProfileTenantIdSync(): string | null {
    return normalizeTenantId(loadDb().clinicProfile?.tenant_id);
  }

  upsertMirror(row: CollaboratorIndexedDbUpsertDto): CollaboratorCore {
    const tenantId = requireRepositoryTenantId(row?.tenant_id);
    const legacyId = String(row.id || '').trim();
    if (!legacyId) {
      throw new Error('IndexedDB mirror exige id (legacy_id).');
    }
    withDb((db) => {
      db.collaborators = db.collaborators || [];
      const idx = db.collaborators.findIndex(
        (item) => item.id === legacyId && rowMatchesTenant(item, tenantId),
      );
      const next = { ...row, tenant_id: tenantId };
      if (idx >= 0) {
        db.collaborators[idx] = { ...db.collaborators[idx], ...next };
      } else {
        db.collaborators.push(next);
      }
      return db;
    });
    return mapRow({ ...row, tenant_id: tenantId }, tenantId);
  }

  mirrorCollaboratorUuidOnly(
    tenantId: string,
    legacyId: string,
    canonicalUuid: string,
  ): 'updated' | 'skipped' | 'not_found' {
    const normalizedTenant = requireRepositoryTenantId(tenantId);
    const id = String(legacyId || '').trim();
    const uuid = String(canonicalUuid || '').trim();
    if (!id || !uuid || !isCollaboratorUuid(uuid)) {
      throw new Error('mirrorCollaboratorUuidOnly exige legacyId e UUID canônico válidos.');
    }

    let outcome: 'updated' | 'skipped' | 'not_found' = 'not_found';

    withDb((db) => {
      db.collaborators = db.collaborators || [];
      const idx = db.collaborators.findIndex(
        (item) => item.id === id && rowMatchesTenant(item, normalizedTenant),
      );
      if (idx < 0) {
        outcome = 'not_found';
        return db;
      }

      const before = db.collaborators[idx];
      const previousUuid = String(before.uuid || '').trim();
      if (previousUuid === uuid) {
        outcome = 'skipped';
        return db;
      }

      db.collaborators[idx] = { ...before, uuid };
      outcome = 'updated';
      return db;
    });

    return outcome;
  }

  removeMirror(tenantId: string, legacyId: string): void {
    requireRepositoryTenantId(tenantId);
    const id = String(legacyId || '').trim();
    withDb((db) => {
      db.collaborators = (db.collaborators || []).filter(
        (item) => !(item.id === id && rowMatchesTenant(item, tenantId)),
      );
      return db;
    });
  }
}

export const collaboratorIndexedDbRepository: ICollaboratorIndexedDbRepository =
  new CollaboratorIndexedDbRepository();
