/**
 * Aplica clinicProfile do servidor (tenant-context) no IndexedDB local.
 * Garante que convidados vejam a mesma identidade visual da clínica que o master.
 */
import { loadDb, withDb } from '../db/index.js';
import { normalizeTenantId } from './tenantIsolation.js';
import { getClinicLogo } from '../utils/clinicLogo.js';
import { emitStabilityLog } from './stabilityLogService.js';

const CLINIC_SUMMARY_CACHE_KEY = 'clinic.summary.cache';
const DEFAULT_PLACEHOLDER_NAMES = new Set(['love odonto', 'minha clínica', 'minha clinica']);

function buildClinicId(tenantId) {
  return `clinic-${String(tenantId || '').slice(0, 8)}`;
}

export function mapServerClinicProfileToLocal(serverProfile) {
  const tenantId = normalizeTenantId(serverProfile?.tenant_id);
  if (!tenantId) return null;
  const name = String(
    serverProfile?.name
    || serverProfile?.fantasy_name
    || serverProfile?.legal_name
    || '',
  ).trim();
  const fantasy = String(serverProfile?.fantasy_name || name).trim();
  const legal = String(serverProfile?.legal_name || fantasy || name).trim();
  const clinicId = String(serverProfile?.clinic_id || buildClinicId(tenantId)).trim();
  return {
    id: clinicId,
    tenant_id: tenantId,
    nomeMarca: fantasy || name,
    nomeFantasia: fantasy || name,
    razaoSocial: legal || fantasy || name,
    nomeClinica: name || fantasy || legal,
    emailPrincipal: String(serverProfile?.email || '').trim(),
    logoUrl: getClinicLogo(serverProfile, { includeDefault: false }),
    status: String(serverProfile?.status || 'ativo').toLowerCase() === 'inactive' ? 'inativo' : 'ativo',
  };
}

export function needsClinicProfileResync(tenantId) {
  const tid = normalizeTenantId(tenantId);
  if (!tid) return false;
  const db = loadDb();
  const localTid = normalizeTenantId(db?.clinicProfile?.tenant_id);
  if (!localTid || localTid !== tid) return true;
  const name = String(db?.clinicProfile?.nomeClinica || '').trim().toLowerCase();
  if (!name || DEFAULT_PLACEHOLDER_NAMES.has(name)) return true;
  return false;
}

export function syncTenantClinicProfileToLocalDb(serverProfile, expectedTenantId) {
  const expected = normalizeTenantId(expectedTenantId);
  const localProfile = mapServerClinicProfileToLocal(serverProfile);
  if (!localProfile || !expected) return false;

  if (localProfile.tenant_id !== expected) {
    emitStabilityLog('TENANT_PROFILE_MISMATCH', {
      expectedTenantId: expected,
      profileTenantId: localProfile.tenant_id,
    });
    return false;
  }

  const now = new Date().toISOString();
  withDb((db) => {
    const prev = db.clinicProfile || {};
    const clinicId = localProfile.id || buildClinicId(expected);
    db.clinicProfile = {
      ...prev,
      ...localProfile,
      id: clinicId,
      tenant_id: expected,
      updatedAt: now,
      createdAt: prev.createdAt || now,
    };

    if (localProfile.logoUrl) {
      db.clinicProfile.logoUrl = localProfile.logoUrl;
    }

    db.clinicDocumentation = {
      ...(db.clinicDocumentation || {}),
      clinicId,
      cnpj: String(serverProfile?.cnpj || db.clinicDocumentation?.cnpj || '').trim(),
    };

    const displayName = localProfile.nomeClinica || localProfile.nomeFantasia;
    const tenants = Array.isArray(db.tenants) ? [...db.tenants] : [];
    const tIdx = tenants.findIndex((t) => normalizeTenantId(t.id) === expected);
    const tenantRow = {
      id: expected,
      name: displayName,
      logo_url: db.clinicProfile.logoUrl || null,
      status: localProfile.status === 'inativo' ? 'inactive' : 'active',
      updated_at: now,
    };
    if (tIdx >= 0) {
      tenants[tIdx] = { ...tenants[tIdx], ...tenantRow };
    } else {
      tenants.push({ ...tenantRow, created_at: now, saas_bootstrapped_at: now });
    }
    db.tenants = tenants;
    return db;
  });

  try {
    sessionStorage.removeItem(CLINIC_SUMMARY_CACHE_KEY);
  } catch {
    /* ignore */
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('saas:clinic-profile-synced', {
      detail: { tenantId: expected },
    }));
  }

  return true;
}

export function buildClinicSummaryFromServerProfile(serverProfile) {
  const local = mapServerClinicProfileToLocal(serverProfile);
  if (!local) return null;
  const logoUrl = getClinicLogo(serverProfile, { includeDefault: false });
  return {
    nomeClinica: local.nomeClinica,
    nomeFantasia: local.nomeFantasia,
    logoUrl,
    cnpj: String(serverProfile?.cnpj || '').trim(),
    telefonePrincipal: String(serverProfile?.phone || '').trim(),
    enderecoPrincipal: null,
    tenant_id: local.tenant_id,
  };
}
