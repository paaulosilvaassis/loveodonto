import defaultLogo from '../assets/love-odonto-logo.png';

/**
 * URL canónica da logomarca da clínica (tenant atual).
 * Fallback Love Odonto apenas quando não há logo cadastrada.
 */
export function getClinicLogo(clinicProfile, { includeDefault = true } = {}) {
  const url = String(
    clinicProfile?.logoUrl
    || clinicProfile?.logo_url
    || clinicProfile?.brandLogoUrl
    || clinicProfile?.logo
    || '',
  ).trim();
  if (url) return url;
  return includeDefault ? defaultLogo : '';
}

export function hasClinicLogo(clinicProfile) {
  return Boolean(
    String(
      clinicProfile?.logoUrl
      || clinicProfile?.logo_url
      || clinicProfile?.brandLogoUrl
      || clinicProfile?.logo
      || '',
    ).trim(),
  );
}

/**
 * Cache-bust para URLs http(s) do Storage (mesmo path após upsert).
 * Não altera data URLs nem assets locais importados.
 */
export function withClinicLogoCacheBust(url, version) {
  const raw = String(url || '').trim();
  if (!raw) return raw;
  if (raw.startsWith('data:') || raw.startsWith('blob:') || !/^https?:\/\//i.test(raw)) {
    return raw;
  }
  const token = String(version || '').trim();
  if (!token) return raw;
  const safe = encodeURIComponent(token.slice(0, 64));
  if (/[?&]v=/.test(raw)) {
    return raw.replace(/([?&]v=)[^&]*/, `$1${safe}`);
  }
  return `${raw}${raw.includes('?') ? '&' : '?'}v=${safe}`;
}

export function normalizeClinicProfileForClient(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const tenant_id = String(profile.tenant_id || profile.tenantId || '').trim() || null;
  const logo_url = String(profile.logo_url || profile.logoUrl || '').trim() || null;
  const name = String(profile.name || profile.nomeClinica || '').trim();
  const fantasy_name = String(profile.fantasy_name || profile.fantasyName || profile.nomeFantasia || '').trim();
  const legal_name = String(profile.legal_name || profile.legalName || profile.razaoSocial || '').trim();
  return {
    ...profile,
    id: profile.id || null,
    tenant_id,
    tenantId: tenant_id,
    name: name || fantasy_name || legal_name,
    fantasy_name: fantasy_name || name,
    fantasyName: fantasy_name || name,
    legal_name: legal_name || fantasy_name || name,
    legalName: legal_name || fantasy_name || name,
    logo_url,
    logoUrl: logo_url,
  };
}

export { defaultLogo as DEFAULT_CLINIC_LOGO };
