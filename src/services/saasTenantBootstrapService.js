/**
 * Bootstrap do IndexedDB para clínicas provisionadas via SaaS (Console).
 * Cada tenant UUID recebe estado local limpo — sem herdar dados de outra clínica/sessão.
 */
import { defaultDbState } from '../db/schema.js';
import { loadDb, saveDb } from '../db/index.js';
import { getSeedCrmTags } from '../db/migrations.js';
import { createId } from './helpers.js';
import { getTenant } from './tenantService.js';
import { readTenantAccessSnapshot } from './platformAccessService.js';

const SAAS_TENANT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLINIC_SUMMARY_CACHE_KEY = 'clinic.summary.cache';

export function isSaasTenantUuid(tenantId) {
  return SAAS_TENANT_UUID_RE.test(String(tenantId || '').trim());
}

function clearSaasLocalUiCaches() {
  try {
    sessionStorage.removeItem(CLINIC_SUMMARY_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function buildClinicId(tenantId) {
  return `clinic-${String(tenantId).slice(0, 8)}`;
}

function patchClinicIdRefs(state, clinicId) {
  const keys = [
    'clinicDocumentation',
    'clinicCorrespondence',
    'clinicAdditional',
    'clinicTax',
    'clinicNfse',
    'clinicIntegrations',
    'clinicWebPresence',
    'clinicLicense',
    'clinicPricing',
  ];
  keys.forEach((key) => {
    if (state[key] && typeof state[key] === 'object' && 'clinicId' in state[key]) {
      state[key].clinicId = clinicId;
    }
  });
}

function normalizeTenantSnapshot(snapshot = {}) {
  return {
    trade_name: String(snapshot.trade_name || snapshot.tradeName || '').trim(),
    legal_name: String(snapshot.legal_name || snapshot.legalName || '').trim(),
    cnpj: String(snapshot.cnpj || '').trim(),
    phone: String(snapshot.phone || '').trim(),
    owner_email: String(snapshot.owner_email || snapshot.ownerEmail || '').trim(),
    city: String(snapshot.city || '').trim(),
    state: String(snapshot.state || '').trim(),
    zip_code: String(snapshot.zip_code || snapshot.zipCode || '').trim(),
    street: String(snapshot.street || '').trim(),
    street_number: String(snapshot.street_number || snapshot.streetNumber || '').trim(),
    neighborhood: String(snapshot.neighborhood || '').trim(),
    plan_code: String(snapshot.plan_code || snapshot.planCode || '').trim(),
    status: String(snapshot.status || 'active').trim(),
    logo_url: snapshot.logo_url || snapshot.logoUrl || null,
    created_at: snapshot.created_at || snapshot.createdAt || null,
  };
}

function applyPlatformTenantToFreshState(state, tenantId, snapshot) {
  const tenant = normalizeTenantSnapshot(snapshot);
  const now = new Date().toISOString();
  const clinicId = buildClinicId(tenantId);
  const displayName = tenant.trade_name || tenant.legal_name || 'Minha Clínica';

  state.clinicProfile = {
    ...state.clinicProfile,
    id: clinicId,
    tenant_id: tenantId,
    nomeMarca: displayName,
    nomeFantasia: tenant.trade_name || displayName,
    razaoSocial: tenant.legal_name || tenant.trade_name || displayName,
    nomeClinica: displayName,
    emailPrincipal: tenant.owner_email || '',
    logoUrl: tenant.logo_url || '',
    status: 'ativo',
    createdAt: now,
    updatedAt: now,
  };

  state.clinicDocumentation = {
    ...state.clinicDocumentation,
    clinicId,
    cnpj: tenant.cnpj || '',
  };

  patchClinicIdRefs(state, clinicId);

  if (tenant.city || tenant.state) {
    state.clinicPricing = {
      ...state.clinicPricing,
      profile: {
        ...state.clinicPricing.profile,
        city: tenant.city || '',
        state: tenant.state || 'SP',
      },
    };
  }

  if (tenant.zip_code && tenant.street) {
    state.clinicAddresses = [{
      id: createId('addr'),
      clinicId,
      principal: true,
      tipo: 'comercial',
      cep: tenant.zip_code,
      logradouro: tenant.street,
      numero: tenant.street_number || 'S/N',
      bairro: tenant.neighborhood || '',
      cidade: tenant.city || '',
      uf: tenant.state || '',
    }];
  } else {
    state.clinicAddresses = [];
  }

  if (tenant.phone) {
    const digits = tenant.phone.replace(/\D/g, '');
    state.clinicPhones = [{
      id: createId('phone'),
      clinicId,
      principal: true,
      ddd: digits.slice(0, 2),
      numero: digits.slice(2),
    }];
  } else {
    state.clinicPhones = [];
  }

  state.tenants = [{
    id: tenantId,
    name: displayName,
    logo_url: tenant.logo_url || null,
    status: tenant.status || 'active',
    plan_id: tenant.plan_code || null,
    saas_bootstrapped_at: now,
    created_at: tenant.created_at || now,
    updated_at: now,
  }];

  state.crmTags = getSeedCrmTags(createId, clinicId, now);
  state.users = [];
  state.users_profile = [];
  state.memberships = [];
  state.collaborators = [];
  state.collaboratorAccess = [];
  state.userAuth = [];
  state.patients = [];
  state.appointments = [];
  state.crmLeads = [];

  return state;
}

function shouldBootstrapFreshTenant(tenantId, previousTenantId) {
  if (!isSaasTenantUuid(tenantId)) return false;
  if (previousTenantId && previousTenantId !== tenantId) return true;
  const local = getTenant(tenantId);
  if (!local) return true;
  if (!local.saas_bootstrapped_at) return true;
  return false;
}

/**
 * @param {object} user — usuário resolvido (authMode saas, tenantId)
 * @param {{ previousTenantId?: string, tenantSnapshot?: object }} options
 * @returns {Promise<boolean>} true se o IndexedDB foi reinicializado para o tenant
 */
export async function bootstrapSaasTenantLocalDb(user, options = {}) {
  const tenantId = String(user?.tenantId || '').trim();
  if (!user || user.authMode !== 'saas' || !isSaasTenantUuid(tenantId)) {
    return false;
  }

  const previousTenantId = String(options.previousTenantId || '').trim();
  if (!shouldBootstrapFreshTenant(tenantId, previousTenantId)) {
    return false;
  }

  let tenantSnapshot = options.tenantSnapshot;
  if (!tenantSnapshot) {
    try {
      const snapshot = await readTenantAccessSnapshot(tenantId);
      tenantSnapshot = snapshot?.tenant || {};
    } catch {
      tenantSnapshot = {};
    }
  }

  const fresh = applyPlatformTenantToFreshState(defaultDbState(), tenantId, tenantSnapshot);
  saveDb(fresh);
  clearSaasLocalUiCaches();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('saas:tenant-bootstrapped', { detail: { tenantId } }));
  }

  if (import.meta.env?.DEV) {
    console.debug('[saas-bootstrap] IndexedDB limpo para tenant', tenantId);
  }

  return true;
}
