import { formatCurrencyBRL } from '../../../utils/currency.js';
import { formatCpf, formatCnpj } from '../../../utils/validators.js';
import { calcProcedureTotal } from '../budget/budgetUtils.js';
import { detectTreatmentType, getTreatmentTypeLabel } from './detectTreatmentType.js';
import {
  LEGAL_CONTRACT_TEXTS,
  LINKED_DOCUMENTS,
  getTreatmentWarrantyText,
} from './professionalContractClauses.js';
import { buildFinancialSection } from './clinicalContractSchedule.js';
import { CONTRACT_STATUS_LABELS } from '../../../contracts/contractConstants.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hasText(value) {
  const text = String(value ?? '').trim();
  return Boolean(text && !/^(—|-+|n\/a)$/i.test(text));
}

function formatDateBR(value) {
  if (!value) return '—';
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-');
    return `${d}/${m}/${y}`;
  }
  const parsed = new Date(str.includes('T') ? str : `${str}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return str;
  return parsed.toLocaleDateString('pt-BR');
}

function formatDateExtenso(value) {
  const formatted = formatDateBR(value);
  if (formatted === '—') return formatted;
  return formatted;
}

function formatAddress(addr) {
  if (!addr) return '';
  const city = addr.cidade || addr.city || '';
  const uf = addr.uf || addr.state || '';
  const cityUf = [city, uf].filter(hasText).join('/');
  return [
    addr.logradouro || addr.street,
    addr.numero || addr.number,
    addr.complemento || addr.complement,
    addr.bairro || addr.neighborhood,
    cityUf,
    addr.cep || addr.zip ? `CEP ${addr.cep || addr.zip}` : '',
  ].filter(hasText).join(', ');
}

function resolveCity(addr) {
  if (!addr) return '—';
  const city = addr.cidade || addr.city || '';
  const uf = addr.uf || addr.state || '';
  return [city, uf].filter(hasText).join(' — ') || '—';
}

function formatPhoneEntry(phone) {
  if (!phone) return '';
  if (typeof phone === 'string') return phone.trim();
  const ddd = phone.ddd || '';
  const num = phone.numero || phone.number || '';
  if (!ddd && !num) return '';
  return `(${ddd}) ${num}`.trim();
}

function sanitizeLogoUrl(url) {
  if (!hasText(url)) return '';
  const value = String(url).trim();
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value)) return '';
  return value;
}

function resolveProfessional(professional) {
  if (!professional) return { name: '—', cro: '—', specialty: '—' };
  const profile = professional.profile || professional;
  const name =
    professional.nomeCompleto ||
    professional.name ||
    professional.apelido ||
    profile.nomeCompleto ||
    '—';
  const croRaw =
    profile.conselhoNumero ||
    profile.conselho_numero ||
    professional.registroProfissional ||
    professional.conselhoNumero ||
    professional.cro ||
    '';
  const croUf = profile.conselhoUf || profile.uf || professional.conselhoUf || '';
  let cro = '—';
  if (hasText(croRaw)) {
    const num = String(croRaw).replace(/^CRO[-\s]*/i, '').trim();
    cro = croUf ? `CRO-${croUf} ${num}` : `CRO ${num}`;
  }
  const specialties = profile.especialidades || professional.especialidades || [];
  const specialty =
    (Array.isArray(specialties) ? specialties.filter(hasText).join(', ') : '') ||
    profile.especialidade ||
    professional.especialidade ||
    professional.specialty ||
    '—';
  return { name, cro, specialty };
}

function formatContractNumber(appointmentId, contractNumber) {
  if (contractNumber) return contractNumber;
  const year = new Date().getFullYear();
  const suffix = String(appointmentId || '').slice(-6).toUpperCase() || '000000';
  return `CTR-${year}-${suffix}`;
}

function buildValidationHash(context) {
  const payload = [
    context.meta.contractNumber,
    context.patient.cpf,
    context.financial.finalValue,
    context.treatment.planName,
    new Date().toISOString().slice(0, 10),
  ].join('|');
  let hash = 5381;
  for (let i = 0; i < payload.length; i += 1) {
    hash = ((hash << 5) + hash) + payload.charCodeAt(i);
    hash &= 0xffffffff;
  }
  return `LOVE-${Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')}`;
}

function regionLabel(proc) {
  return proc.tooth || proc.region || proc.regiao || '—';
}

export function buildProfessionalContractContext({
  db,
  patientBundle,
  professional,
  appointment,
  budget,
  financials,
  contractNumber,
  contractStatus,
}) {
  const clinic = db.clinicProfile || {};
  const docs = db.clinicDocumentation || {};
  const phones = db.clinicPhones || [];
  const addresses = db.clinicAddresses || [];
  const correspondence = db.clinicCorrespondence || {};
  const web = db.clinicWebPresence || {};

  const mainPhone = phones.find((p) => p.principal) || phones[0];
  const mainAddress = addresses.find((a) => a.principal) || addresses[0];
  const profile = patientBundle?.profile || {};
  const pdocs = patientBundle?.documents || {};
  const paddr = (patientBundle?.addresses || []).find((a) => a.principal)
    || patientBundle?.addresses?.[0]
    || {};
  const patientPhones = patientBundle?.phones || [];
  const primaryPhone = patientPhones.find((p) => p.is_primary) || patientPhones[0];

  const prof = resolveProfessional(professional);
  const procedures = budget?.procedures || [];
  const originalValue = financials?.originalValue ?? 0;
  const accepted = financials?.accepted ?? null;
  const patientId = patientBundle?.id || appointment?.patientId;

  const financial = buildFinancialSection(
    accepted,
    originalValue,
    patientId,
    [appointment?.appointmentId, budget?.id].filter(Boolean),
  );

  const treatmentType = detectTreatmentType({
    planName: budget?.planName || budget?.title || '',
    procedures,
  });

  const appointmentDate = appointment?.date || appointment?.startDate || appointment?.scheduledAt;
  const endDate = budget?.endDate || budget?.expectedEndDate || '';

  const statusKey = contractStatus || 'draft';
  const statusLabel = CONTRACT_STATUS_LABELS[statusKey] || 'Em elaboração';

  const legalRepresentative =
    docs.responsavelTecnico ||
    docs.responsavel_tecnico ||
    docs.representanteLegal ||
    clinic.representanteLegal ||
    prof.name;

  const meta = {
    contractNumber: formatContractNumber(appointment?.appointmentId, contractNumber),
    issueDate: formatDateBR(new Date().toISOString()),
    issueDateExtenso: formatDateExtenso(new Date().toISOString()),
    issueDateTime: new Date().toLocaleString('pt-BR'),
    status: statusLabel,
    budgetNumber: budget?.id || appointment?.appointmentId || '—',
    budgetDate: formatDateBR(budget?.approvedAt || budget?.updatedAt || budget?.createdAt),
    city: resolveCity(mainAddress),
  };

  const ctx = {
    meta,
    clinic: {
      logoUrl: sanitizeLogoUrl(clinic.logoUrl),
      name: clinic.nomeClinica || clinic.nomeFantasia || clinic.razaoSocial || 'Clínica Odontológica',
      legalName: clinic.razaoSocial || clinic.nomeFantasia || clinic.nomeClinica || '',
      cnpj: docs.cnpj ? formatCnpj(String(docs.cnpj).replace(/\D/g, '')) : '—',
      address: formatAddress(mainAddress) || '—',
      city: resolveCity(mainAddress),
      phone: formatPhoneEntry(mainPhone) || '—',
      email: clinic.emailPrincipal || correspondence.emailPrincipal || correspondence.email || '—',
      site: web.site || web.website || web.url || '—',
      legalRepresentative: legalRepresentative || '—',
    },
    patient: {
      name: profile.full_name || patientBundle?.full_name || '—',
      cpf: profile.cpf ? formatCpf(String(profile.cpf).replace(/\D/g, '')) : '—',
      rg: pdocs.rg || profile.rg || '—',
      birthDate: formatDateBR(profile.birth_date || profile.birthDate),
      maritalStatus: profile.marital_status || profile.estadoCivil || '—',
      profession: profile.profession || profile.profissao || '—',
      address: formatAddress(paddr) || '—',
      phone: formatPhoneEntry(primaryPhone) || '—',
      email: profile.email || patientBundle?.email || '—',
      guardian:
        profile.guardian_full_name ||
        profile.legal_guardian_name ||
        '—',
    },
    professional: prof,
    treatment: {
      planName: budget?.planName || budget?.title || 'Plano de tratamento',
      typeLabel: getTreatmentTypeLabel(treatmentType),
      treatmentType,
      startDate: formatDateBR(appointmentDate || budget?.startDate),
      endDate: formatDateBR(endDate),
      notes: budget?.commercialNotes || budget?.notes || '',
    },
    procedures,
    financial,
    legalTexts: LEGAL_CONTRACT_TEXTS,
    treatmentWarranty: getTreatmentWarrantyText(treatmentType),
    linkedDocuments: LINKED_DOCUMENTS,
    validationHash: '',
  };

  ctx.validationHash = buildValidationHash(ctx);
  return ctx;
}

export { escapeHtml, hasText, formatDateBR, regionLabel, calcProcedureTotal };
