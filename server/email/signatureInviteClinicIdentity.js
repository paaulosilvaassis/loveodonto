/**
 * Identidade da clínica no e-mail de assinatura.
 * Sanitiza DTO multi-tenant. Não hardcoda clínica. Não aceita HTML.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_TREATMENT = new Set([
  '',
  '-',
  '—',
  'n/a',
  'na',
  'null',
  'undefined',
  'tratamento',
  'tratamentos',
  'tratamento odontologico',
  'tratamento odontológico',
  'tratamento odontologico.',
  'tratamento odontológico.',
]);

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function foldKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function isGenericTreatmentName(value) {
  const key = foldKey(value);
  if (!key) return true;
  if (GENERIC_TREATMENT.has(key)) return true;
  return false;
}

export function resolveTreatmentName(value) {
  const raw = normalizeText(value);
  if (isGenericTreatmentName(raw)) return '';
  return raw;
}

export function sanitizeHttpUrl(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    if (parsed.username || parsed.password) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function sanitizeEmailAddress(value) {
  const raw = normalizeText(value).toLowerCase();
  return EMAIL_RE.test(raw) ? raw : '';
}

export function sanitizeFromDisplayName(value) {
  const raw = normalizeText(value)
    .replace(/[<>\r\n]/g, '')
    .replace(/"/g, '')
    .slice(0, 78);
  return raw;
}

export function sanitizeClinicIdentity(input = {}) {
  const name = sanitizeFromDisplayName(
    input.name || input.nomeFantasia || input.nomeClinica || input.clinicName || '',
  );
  const legalName = sanitizeFromDisplayName(input.legalName || input.razaoSocial || '');
  return {
    name,
    legalName: legalName && legalName !== name ? legalName : '',
    logoUrl: sanitizeHttpUrl(input.logoUrl || input.logo_url || ''),
    address: normalizeText(input.address || input.clinicAddress || ''),
    cityState: normalizeText(input.cityState || input.clinicCityState || ''),
    phone: normalizeText(input.phone || input.clinicPhone || ''),
    email: sanitizeEmailAddress(input.email || input.clinicEmail || ''),
    technicalResponsible: normalizeText(input.technicalResponsible || ''),
    cro: normalizeText(input.cro || ''),
  };
}
