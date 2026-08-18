/**
 * Identidade da clínica para o e-mail de assinatura.
 * SSOT: clinicProfile + clinicAddresses + clinicPhones + clinicDocumentation.
 */
import { getClinic } from './clinicService.js';

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function formatPhone(phone) {
  if (!phone) return '';
  const ddd = normalizeText(phone.ddd);
  const numero = normalizeText(phone.numero || phone.number);
  if (ddd && numero) return `(${ddd}) ${numero}`;
  return normalizeText(phone.telefonePrincipal || `${ddd}${numero}`);
}

function formatAddressLine(address) {
  if (!address || typeof address !== 'object') return '';
  return [
    address.logradouro,
    address.numero,
    address.complemento,
    address.bairro,
  ].map(normalizeText).filter(Boolean).join(', ');
}

function formatCityState(address) {
  if (!address || typeof address !== 'object') return '';
  return [address.cidade, address.uf].map(normalizeText).filter(Boolean).join('/');
}

export function resolveClinicEmailIdentity() {
  const { profile, documentation, phones, addresses } = getClinic();
  const clinic = profile || {};
  const docs = documentation || {};
  const phoneRow = (phones || []).find((item) => item.principal) || (phones || [])[0];
  const addressRow = (addresses || []).find((item) => item.principal) || (addresses || [])[0];
  const logoCandidate = normalizeText(clinic.logoUrl || clinic.logo_url);
  const logoUrl = /^https?:\/\//i.test(logoCandidate) ? logoCandidate : '';

  return {
    name: normalizeText(clinic.nomeFantasia || clinic.nomeClinica || clinic.razaoSocial || clinic.name),
    legalName: normalizeText(clinic.razaoSocial || clinic.legalName),
    logoUrl,
    address: formatAddressLine(addressRow),
    cityState: formatCityState(addressRow),
    phone: formatPhone(phoneRow) || normalizeText(clinic.phone || clinic.telefonePrincipal),
    email: normalizeText(clinic.emailPrincipal || clinic.email || clinic.contatoEmail),
    technicalResponsible: normalizeText(docs.responsavelTecnico || docs.responsavel_tecnico),
    cro: normalizeText(docs.croResponsavelTecnico || docs.cro_responsavel),
  };
}
