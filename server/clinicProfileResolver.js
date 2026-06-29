/**
 * Resolve clinicProfile canónico por tenant (Supabase).
 * Fonte: clinic_profiles → fallback tenants (auto-upsert).
 */

import { persistClinicLogoUrl } from './clinicLogoStorage.js';

function normalizeText(value) {
  return String(value || '').trim();
}

function buildClinicId(tenantId) {
  return `clinic-${String(tenantId || '').slice(0, 8)}`;
}

export function buildClinicProfileFromTenantRow(tenantRow) {
  const tenantId = normalizeText(tenantRow?.id);
  if (!tenantId) return null;
  const tradeName = normalizeText(tenantRow?.trade_name);
  const legalName = normalizeText(tenantRow?.legal_name);
  const displayName = tradeName || legalName || 'Minha Clínica';
  return {
    id: buildClinicId(tenantId),
    tenant_id: tenantId,
    clinic_id: buildClinicId(tenantId),
    name: displayName,
    fantasy_name: tradeName || displayName,
    legal_name: legalName || tradeName || displayName,
    logo_url: normalizeText(tenantRow?.logo_url) || null,
    email: normalizeText(tenantRow?.owner_email) || null,
    phone: normalizeText(tenantRow?.phone) || null,
    cnpj: normalizeText(tenantRow?.cnpj) || null,
    status: normalizeText(tenantRow?.status) || 'active',
  };
}

function mapClinicProfileRow(row, tenantRow) {
  if (!row?.tenant_id) return normalizeClinicProfileForClient(buildClinicProfileFromTenantRow(tenantRow));
  const tenantId = normalizeText(row.tenant_id);
  const name = normalizeText(row.name)
    || normalizeText(row.fantasy_name)
    || normalizeText(tenantRow?.trade_name)
    || 'Minha Clínica';
  return normalizeClinicProfileForClient({
    id: normalizeText(row.id) || buildClinicId(tenantId),
    tenant_id: tenantId,
    clinic_id: buildClinicId(tenantId),
    name,
    fantasy_name: normalizeText(row.fantasy_name) || normalizeText(tenantRow?.trade_name) || name,
    legal_name: normalizeText(row.legal_name) || normalizeText(tenantRow?.legal_name) || name,
    logo_url: normalizeText(row.logo_url) || null,
    email: normalizeText(row.email) || normalizeText(tenantRow?.owner_email) || null,
    phone: normalizeText(row.phone) || normalizeText(tenantRow?.phone) || null,
    cnpj: normalizeText(row.cnpj) || normalizeText(tenantRow?.cnpj) || null,
    status: normalizeText(row.status) || normalizeText(tenantRow?.status) || 'active',
  });
}

export function normalizeClinicProfileForClient(profile) {
  if (!profile) return null;
  const tenant_id = normalizeText(profile.tenant_id || profile.tenantId);
  const logo_url = normalizeText(profile.logo_url || profile.logoUrl) || null;
  const name = normalizeText(profile.name || profile.nomeClinica);
  const fantasy_name = normalizeText(profile.fantasy_name || profile.fantasyName || profile.nomeFantasia) || name;
  const legal_name = normalizeText(profile.legal_name || profile.legalName || profile.razaoSocial) || fantasy_name || name;
  return {
    ...profile,
    id: profile.id || (tenant_id ? buildClinicId(tenant_id) : null),
    tenant_id: tenant_id || null,
    tenantId: tenant_id || null,
    clinic_id: profile.clinic_id || (tenant_id ? buildClinicId(tenant_id) : null),
    name: name || fantasy_name || legal_name || 'Minha Clínica',
    fantasy_name: fantasy_name || name,
    fantasyName: fantasy_name || name,
    legal_name: legal_name || fantasy_name || name,
    legalName: legal_name || fantasy_name || name,
    logo_url,
    logoUrl: logo_url,
  };
}

function isMissingClinicProfilesTableError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === 'PGRST205'
    || code === '42P01'
    || (message.includes('relation') && message.includes('clinic_profiles'))
  );
}

export async function fetchClinicProfileRow(supabase, tenantId) {
  const { data, error } = await supabase
    .from('clinic_profiles')
    .select('id, tenant_id, name, fantasy_name, legal_name, logo_url, email, phone, cnpj, status')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error && !isMissingClinicProfilesTableError(error)) throw error;
  if (error) return null;
  return data || null;
}

export async function ensureClinicProfileForTenant(supabase, tenantId, tenantRow) {
  const existing = await fetchClinicProfileRow(supabase, tenantId);
  if (existing?.tenant_id) return existing;

  const seed = buildClinicProfileFromTenantRow(tenantRow);
  if (!seed) return null;

  const payload = {
    tenant_id: tenantId,
    name: seed.name,
    fantasy_name: seed.fantasy_name,
    legal_name: seed.legal_name,
    logo_url: seed.logo_url,
    email: seed.email,
    phone: seed.phone,
    cnpj: seed.cnpj,
    status: seed.status,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('clinic_profiles')
    .upsert(payload, { onConflict: 'tenant_id' })
    .select('id, tenant_id, name, fantasy_name, legal_name, logo_url, email, phone, cnpj, status')
    .single();

  if (error && isMissingClinicProfilesTableError(error)) {
    return null;
  }
  if (error) throw error;
  return data || null;
}

export async function resolveClinicProfileForTenant(supabase, tenantId, tenantRow) {
  const normalizedTenantId = normalizeText(tenantId);
  if (!normalizedTenantId || !tenantRow?.id) return null;

  let row = await fetchClinicProfileRow(supabase, normalizedTenantId);
  if (!row) {
    row = await ensureClinicProfileForTenant(supabase, normalizedTenantId, tenantRow);
  }

  const profile = mapClinicProfileRow(row, tenantRow);
  if (!profile) return null;

  if (normalizeText(profile.tenant_id) !== normalizedTenantId) {
    const err = new Error('clinic_profiles.tenant_id diverge do tenant da sessão.');
    err.code = 'TENANT_PROFILE_MISMATCH';
    throw err;
  }

  return profile;
}

export async function upsertClinicProfileForTenant(supabase, tenantId, payload = {}) {
  const normalizedTenantId = normalizeText(tenantId);
  if (!normalizedTenantId) throw new Error('tenant_id é obrigatório.');

  const updatePayload = {
    tenant_id: normalizedTenantId,
    updated_at: new Date().toISOString(),
  };
  if (payload.name !== undefined) updatePayload.name = normalizeText(payload.name);
  if (payload.fantasy_name !== undefined) updatePayload.fantasy_name = normalizeText(payload.fantasy_name);
  if (payload.legal_name !== undefined) updatePayload.legal_name = normalizeText(payload.legal_name);
  if (payload.logo_url !== undefined || payload.logoUrl !== undefined) {
    const rawLogo = payload.logo_url ?? payload.logoUrl;
    updatePayload.logo_url = await persistClinicLogoUrl(supabase, normalizedTenantId, rawLogo);
  }
  if (payload.email !== undefined) updatePayload.email = normalizeText(payload.email) || null;
  if (payload.phone !== undefined) updatePayload.phone = normalizeText(payload.phone) || null;
  if (payload.cnpj !== undefined) updatePayload.cnpj = normalizeText(payload.cnpj) || null;
  if (payload.status !== undefined) updatePayload.status = normalizeText(payload.status) || 'active';

  const { data, error } = await supabase
    .from('clinic_profiles')
    .upsert(updatePayload, { onConflict: 'tenant_id' })
    .select('id, tenant_id, name, fantasy_name, legal_name, logo_url, email, phone, cnpj, status')
    .single();

  if (error) throw error;
  return normalizeClinicProfileForClient(data);
}
