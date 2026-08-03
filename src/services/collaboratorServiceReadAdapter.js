/**
 * Adapter de leitura RH — Sprint 1C Tickets 1.8 / 1.9.
 * Phase 5.2 — read cutover: repository + hydrate cache quando READ_PRIMARY.
 * Única ponte entre services RH e collaboratorRepository para leituras.
 */
import { mapCollaboratorToProfessionalOption } from '../utils/avatarUtils.js';
import { isSaasModeEnabled } from './saasAuthService.js';
import { normalizeTenantId } from './tenantIsolation.js';
import {
  getCollaboratorRepositoryForRead,
  scheduleCollaboratorRhCacheRehydrate,
  scheduleCollaboratorShadowRead,
  shouldUseCollaboratorRepositoryRead,
} from './collaboratorServiceRepositoryBridge.js';

function scheduleReadPrimaryHydrateIfNeeded(tenantId) {
  if (!shouldUseCollaboratorRepositoryRead()) return;
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return;
  scheduleCollaboratorRhCacheRehydrate(normalized);
}

/**
 * @param {object} [filters]
 */
export function readListCollaborators(filters = {}) {
  const tenantFilter = normalizeTenantId(filters.tenantId || filters.tenant_id);
  scheduleReadPrimaryHydrateIfNeeded(tenantFilter);
  const result = getCollaboratorRepositoryForRead().listLegacySync(filters, isSaasModeEnabled());
  scheduleCollaboratorShadowRead(tenantFilter, 'listCollaborators');
  return result;
}

/**
 * @param {string} collaboratorId
 */
export function readGetCollaborator(collaboratorId) {
  const profile = getCollaboratorRepositoryForRead().getLegacyProfileSync(collaboratorId);
  if (!profile) return null;
  const satellites = getCollaboratorRepositoryForRead().getLegacySatellitesSync(collaboratorId);
  scheduleReadPrimaryHydrateIfNeeded(normalizeTenantId(profile.tenant_id || profile.tenantId));
  scheduleCollaboratorShadowRead(
    normalizeTenantId(profile.tenant_id || profile.tenantId),
    'getCollaborator',
  );
  return {
    profile,
    ...satellites,
  };
}

/**
 * @param {object} [options]
 */
export function readGetProfessionalOptions(options = {}) {
  const tenantFilter = normalizeTenantId(
    options.tenantId || options.tenant_id || getCollaboratorRepositoryForRead().getClinicProfileTenantIdSync(),
  );
  scheduleReadPrimaryHydrateIfNeeded(tenantFilter);
  const rows = getCollaboratorRepositoryForRead().listProfessionalOptionsLegacySync(
    options,
    isSaasModeEnabled(),
  );
  return rows.map((item) => mapCollaboratorToProfessionalOption(item));
}

/** @param {string} collaboratorId */
export function readGetCollaboratorAccessLink(collaboratorId) {
  return getCollaboratorRepositoryForRead().getLegacyAccessLinkSync(collaboratorId);
}

/** @param {string} tenantId */
export function readListCollaboratorsByTenant(tenantId) {
  scheduleReadPrimaryHydrateIfNeeded(tenantId);
  return getCollaboratorRepositoryForRead().listCollaboratorsByTenantLegacySync(tenantId);
}

/** @param {string} collaboratorId */
export function readGetPrimaryPhone(collaboratorId) {
  return getCollaboratorRepositoryForRead().getPrimaryPhoneLegacySync(collaboratorId);
}
