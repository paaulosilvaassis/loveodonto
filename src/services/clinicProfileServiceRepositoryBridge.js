/**
 * Ponte controlada entre clinicService (legado IDB) e clinicProfileRepository V3.
 * Phase 5.5 — read cutover only.
 */
import { normalizeTenantId } from './tenantIsolation.js';
import {
  createClinicProfileRepository,
  rehydrateClinicProfileCacheIfPrimary,
  registerClinicProfileOnlineCacheSync,
} from '../repositories/clinicProfile/clinicProfileRepository.ts';
import {
  getClinicProfileRepositoryFlags,
  isClinicProfileReadPrimaryEnabled,
  isClinicProfileWriteEnabled,
  shouldCompareClinicProfileIdbVsRemote,
} from '../repositories/clinicProfile/clinicProfileRepositoryFlags.ts';
import {
  registerClinicProfileRemoteFetch,
  registerClinicProfileRemoteSave,
} from '../repositories/clinicProfile/clinicProfileAdminApiRepository.ts';
import { getTenantContext } from './tenantContextService.js';
import { saveClinicProfileRemote } from './clinicProfileApi.js';
import { normalizeClinicProfileForClient } from '../utils/clinicLogo.js';

/** @type {import('../repositories/clinicProfile/clinicProfileRepositoryFlags.ts').ClinicProfileRepositoryFlagsInput | null} */
let flagsInputOverride = null;

/** @type {(() => import('../repositories/clinicProfile/clinicProfileTypes.ts').IClinicProfileRepository) | null} */
let repositoryFactoryOverride = null;

let remoteFetchRegistered = false;
let remoteSaveRegistered = false;

function ensureRemoteFetchRegistered() {
  if (remoteFetchRegistered) return;
  remoteFetchRegistered = true;
  registerClinicProfileRemoteFetch(async (tenantId) => {
    const context = await getTenantContext(tenantId);
    return normalizeClinicProfileForClient(context?.clinicProfile);
  });
}

function ensureRemoteSaveRegistered() {
  if (remoteSaveRegistered) return;
  remoteSaveRegistered = true;
  registerClinicProfileRemoteSave(async (tenantId, payload) => {
    const body = {
      tenant_id: tenantId,
      nomeClinica: payload.nomeClinica,
      nomeFantasia: payload.nomeFantasia,
      razaoSocial: payload.razaoSocial,
      emailPrincipal: payload.emailPrincipal,
    };
    if (payload.logoUrl) {
      body.logoUrl = payload.logoUrl;
    }
    const res = await saveClinicProfileRemote(body);
    return res?.clinicProfile ? normalizeClinicProfileForClient(res.clinicProfile) : null;
  });
}

function ensureRemoteClientsRegistered() {
  ensureRemoteFetchRegistered();
  ensureRemoteSaveRegistered();
}

/**
 * Apenas testes — injeta overrides de flags.
 * @param {import('../repositories/clinicProfile/clinicProfileRepositoryFlags.ts').ClinicProfileRepositoryFlagsInput | null} input
 */
export function __setClinicProfileServiceBridgeFlagsForTest(input) {
  flagsInputOverride = input;
}

/**
 * Apenas testes — injeta factory do repository.
 * @param {(() => import('../repositories/clinicProfile/clinicProfileTypes.ts').IClinicProfileRepository) | null} factory
 */
export function __setClinicProfileRepositoryFactoryForTest(factory) {
  repositoryFactoryOverride = factory;
}

/** @returns {import('../repositories/clinicProfile/clinicProfileRepositoryFlags.ts').ClinicProfileRepositoryFlagsInput} */
function bridgeFlagsInput() {
  return flagsInputOverride ?? {};
}

function getRepository() {
  ensureRemoteClientsRegistered();
  const factory = repositoryFactoryOverride ?? createClinicProfileRepository;
  return factory({ flagsInput: bridgeFlagsInput() });
}

export function getClinicProfileRepositoryForRead() {
  return getRepository();
}

export function shouldUseClinicProfileRepositoryRead() {
  return isClinicProfileReadPrimaryEnabled(bridgeFlagsInput());
}

export function shouldUseClinicProfileRepositoryWrite() {
  return isClinicProfileWriteEnabled(bridgeFlagsInput());
}

export function shouldRunClinicProfileShadowRead() {
  return shouldCompareClinicProfileIdbVsRemote(bridgeFlagsInput());
}

export function scheduleClinicProfileShadowCompare(tenantId, context = 'write') {
  if (!shouldRunClinicProfileShadowRead()) return;
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return;
  queueMicrotask(() => {
    void getRepository().compareIdbVsRemote(normalized).catch((err) => {
      if (import.meta.env?.DEV) {
        console.debug('[CLINIC_PROFILE_SHADOW] skipped:', err instanceof Error ? err.message : err);
      }
    });
  });
}

export function scheduleClinicProfileCacheRehydrate(tenantId) {
  if (!shouldUseClinicProfileRepositoryRead()) return;
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return;
  queueMicrotask(() => {
    void rehydrateClinicProfileCacheIfPrimary(normalized);
  });
}

export function initClinicProfileOnlineCacheSync(getTenantId) {
  registerClinicProfileOnlineCacheSync(getTenantId);
}

export function getClinicProfileRepositoryFlagsForBridge() {
  return getClinicProfileRepositoryFlags(bridgeFlagsInput());
}
