/**
 * Motor central de variáveis de contrato odontológico.
 * Unifica resolução de hashtags, validação e detecção do modelo de partes.
 */
import { loadDb } from '../db/index.js';
import { getPatient } from '../services/patientService.js';
import { getCrmBudgetById } from '../services/crmBudgetService.js';
import { enrichClinicalBudgetContext } from '../services/clinicalBudgetContractBridge.js';
import { currencyToWordsPt } from '../utils/numberToWordsPt.js';
import { formatFriendlyBudgetNumber, formatFriendlyContractNumber, isTechnicalId } from '../utils/friendlyNumbers.js';
import { formatCpf, formatCnpj } from '../utils/validators.js';
import { PARTY_MODEL } from './contractQualificationTemplates.js';
import { detectTreatmentType, detectAllTreatmentTypes } from '../components/clinical/contract/detectTreatmentType.js';
import { buildInstallmentSchedule } from '../components/clinical/contract/clinicalContractSchedule.js';
import { getAcceptedOption, calcPlannedValue, calcOptionFinalValue } from '../components/clinical/budget/budgetUtils.js';
import { resolveClinicTechnicalResponsible, resolveAttendingProfessionalCro } from './clinicTechnicalResponsible.js';

const EMPTY_MARKERS = new Set(['', '—', '-', '________________', 'N/A', 'n/a']);

export function isEmptyVariableValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return true;
  if (EMPTY_MARKERS.has(text)) return true;
  if (/<em>Nenhum/i.test(text)) return true;
  return false;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAddress(addr) {
  if (!addr || typeof addr !== 'object') return '';
  const city = addr.cidade || addr.city || '';
  const uf = addr.uf || addr.state || '';
  const cityUf = [city, uf].filter(Boolean).join('/');
  return [
    addr.logradouro || addr.street,
    addr.numero || addr.number,
    addr.complemento || addr.complement,
    addr.bairro || addr.neighborhood,
    cityUf,
    addr.cep || addr.zip ? `CEP ${addr.cep || addr.zip}` : '',
  ].filter(Boolean).join(', ');
}

function formatDateBR(value) {
  if (!value) return '';
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const [y, m, d] = str.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const parsed = new Date(str.includes('T') ? str : `${str}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('pt-BR');
}

export function calcPatientAge(birthDate) {
  if (!birthDate) return null;
  const birth = new Date(`${String(birthDate).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

export function detectPartyModel(profile = {}, patientBundle = {}) {
  const age = calcPatientAge(profile.birth_date);
  const isMinor = age != null && age < 18;
  const hasFinancialResponsible = Boolean(profile.has_financial_responsible);
  const hasGuardian = Boolean(
    profile.guardian_full_name
    || profile.legal_guardian_name
    || profile.guardian_cpf,
  );
  const dependentName = String(profile.dependent_full_name || profile.full_name || '').trim();

  if (isMinor || hasFinancialResponsible || hasGuardian) {
    return {
      model: PARTY_MODEL.WITH_RESPONSIBLE,
      isMinor,
      hasFinancialResponsible,
      hasGuardian,
      dependentName,
    };
  }

  return {
    model: PARTY_MODEL.PATIENT_ONLY,
    isMinor: false,
    hasFinancialResponsible: false,
    hasGuardian: false,
    dependentName: dependentName || String(profile.full_name || '').trim(),
  };
}

function buildProceduresTable(procedures = [], professionalName = '') {
  const rows = Array.isArray(procedures) ? procedures : [];
  if (!rows.length) return '';
  let html = '<table class="contract-table"><thead><tr><th>Procedimento</th><th>Dente/Região</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr></thead><tbody>';
  for (const p of rows) {
    const q = Number(p.quantity || 1);
    const u = Number(p.unitValue || 0);
    const t = Number(p.totalValue ?? q * u);
    const region = p.tooth || p.region || p.dente || (Array.isArray(p.teeth) ? p.teeth.join(', ') : '');
    html += `<tr><td>${escapeHtml(p.name || p.description || '')}</td><td>${escapeHtml(region)}</td><td>${q}</td><td>${u.toFixed(2)}</td><td>${t.toFixed(2)}</td></tr>`;
  }
  html += '</tbody></table>';
  if (professionalName) {
    html += `<p><strong>Profissional responsável:</strong> ${escapeHtml(professionalName)}</p>`;
  }
  return html;
}

function buildParcelasTable(schedule = []) {
  if (!schedule.length) return '';
  let html = '<table class="contract-table"><thead><tr><th>Parcela</th><th>Valor</th><th>Vencimento</th><th>Forma de pagamento</th><th>Status</th></tr></thead><tbody>';
  for (const row of schedule) {
    html += `<tr><td>${escapeHtml(row.parcelLabel || row.label || '')}</td><td>${escapeHtml(row.amountFormatted || '')}</td><td>${escapeHtml(row.dueDateFormatted || '')}</td><td>${escapeHtml(row.paymentMethod || '')}</td><td>${escapeHtml(row.statusLabel || 'Previsto')}</td></tr>`;
  }
  html += '</tbody></table>';
  return html;
}

function crmItemsAsProcedures(itemsJson) {
  return (Array.isArray(itemsJson) ? itemsJson : []).map((it) => ({
    name: it.description || it.label || '',
    quantity: 1,
    unitValue: Number(it.value || 0),
    totalValue: Number(it.value || 0),
  }));
}

const REQUIRED_RULES = [
  { tag: '#emissorNomeRazaoSocial', label: 'Razão social da clínica', group: 'clinica' },
  { tag: '#emissorCNPJCPF', label: 'CNPJ da clínica', group: 'clinica' },
  { tag: '#clinicaEndereco', label: 'Endereço da clínica', group: 'clinica' },
  { tag: '#clinicaCidade', label: 'Cidade da clínica', group: 'clinica' },
  { tag: '#clinicaEstado', label: 'UF da clínica', group: 'clinica' },
  { tag: '#clinicaCidadeEstado', label: 'Cidade/UF do foro', group: 'clinica' },
  { tag: '#pacienteNomeCompleto', label: 'Nome do paciente', group: 'paciente', when: (m) => m.partyModel === PARTY_MODEL.PATIENT_ONLY },
  { tag: '#pacienteCPF', label: 'CPF do paciente', group: 'paciente', when: (m) => m.partyModel === PARTY_MODEL.PATIENT_ONLY },
  { tag: '#pacienteEndereco', label: 'Endereço do paciente', group: 'paciente', when: (m) => m.partyModel === PARTY_MODEL.PATIENT_ONLY },
  { tag: '#dependenteNomeCompleto', label: 'Nome do dependente/paciente', group: 'dependente', when: (m) => m.partyModel === PARTY_MODEL.WITH_RESPONSIBLE },
  { tag: '#responsavelNomeCompleto', label: 'Nome do responsável', group: 'responsavel', when: (m) => m.partyModel === PARTY_MODEL.WITH_RESPONSIBLE },
  { tag: '#responsavelCPF', label: 'CPF do responsável', group: 'responsavel', when: (m) => m.partyModel === PARTY_MODEL.WITH_RESPONSIBLE },
  { tag: '#responsavelEndereco', label: 'Endereço do responsável', group: 'responsavel', when: (m) => m.partyModel === PARTY_MODEL.WITH_RESPONSIBLE },
  { tag: '#responsavelTecnicoNome', label: 'Nome do responsável técnico (CRO)', group: 'clinica' },
  { tag: '#responsavelTecnicoCRO', label: 'CRO do responsável técnico', group: 'clinica' },
  { tag: '#procedimentos', label: 'Procedimentos do orçamento', group: 'contrato' },
  { tag: '#totalContrato', label: 'Valor total do contrato', group: 'contrato' },
  { tag: '#formaPagamento', label: 'Forma de pagamento', group: 'contrato' },
];

/**
 * @param {object} params
 * @param {'crm_budget'|'clinical_budget'} params.quoteSource
 * @param {string} params.quoteId
 * @param {string} params.patientId
 * @param {object} [params.currentUser]
 * @param {string} [params.contractNumber]
 * @param {string} [params.contractDate]
 * @param {string} [params.observacoes]
 */
export function resolveContractVariables(params) {
  const {
    quoteSource,
    quoteId,
    patientId,
    currentUser,
    contractNumber = null,
    contractDate = null,
    observacoes = '',
  } = params;

  const db = loadDb();
  const clinic = db.clinicProfile || {};
  const doc = db.clinicDocumentation || {};
  const addresses = db.clinicAddresses || [];
  const mainClinicAddr = addresses.find((a) => a.principal) || addresses[0] || {};
  const patientBundle = getPatient(patientId);
  const profile = patientBundle?.profile || {};
  const pdocs = patientBundle?.documents || {};
  const paddr = (patientBundle?.addresses || []).find((a) => a.principal) || patientBundle?.addresses?.[0] || {};
  const party = detectPartyModel(profile, patientBundle);

  let procedures = [];
  let clinicalBudget = null;
  let clinicalMeta = null;
  let crmBudget = null;
  let obs = observacoes;
  let receivableIds = quoteId ? [quoteId] : [];
  let planName = '';
  let maintenanceMonths = '';

  if (quoteSource === 'crm_budget') {
    crmBudget = getCrmBudgetById(quoteId);
    if (crmBudget) {
      procedures = crmItemsAsProcedures(crmBudget.itemsJson);
      planName = crmBudget.title || '';
    }
  } else {
    const ca = (db.clinicalAppointments || []).find((c) => c.appointmentId === quoteId);
    clinicalBudget = ca?.budget || null;
    if (clinicalBudget) {
      clinicalMeta = enrichClinicalBudgetContext(clinicalBudget, quoteId);
      procedures = clinicalBudget.procedures || [];
      planName = clinicalMeta?.planName || clinicalBudget.planName || '';
      obs = obs || String(clinicalBudget.commercialNotes || clinicalBudget.notes || '');
      receivableIds = clinicalMeta?.receivableOriginIds || receivableIds;
      maintenanceMonths = String(clinicalBudget.maintenanceMonths || clinicalBudget.orthoMonths || '').trim();
    }
  }

  const treatmentType = detectTreatmentType({ planName, procedures });
  const treatmentTypes = detectAllTreatmentTypes({ planName, procedures });
  if (!maintenanceMonths && treatmentType === 'ortodontia') maintenanceMonths = '24';

  const originalValue = procedures.reduce(
    (sum, p) => sum + Number(p.totalValue ?? Number(p.quantity || 1) * Number(p.unitValue || 0)),
    0,
  );
  const accepted = clinicalBudget ? getAcceptedOption(clinicalBudget) : null;
  const finalValue = accepted ? calcOptionFinalValue(accepted, originalValue || calcPlannedValue(procedures)) : originalValue;
  const entryAmount = Number(
    accepted?.entry
    ?? accepted?.downPayment
    ?? clinicalMeta?.entryAmount
    ?? crmBudget?.downPayment
    ?? 0,
  );
  const balance = Math.max(0, finalValue - entryAmount);

  const schedule = clinicalBudget && accepted
    ? buildInstallmentSchedule(accepted, originalValue, patientId, receivableIds)
    : [];
  const installmentRows = schedule.filter((r) => !r.isEntry);
  const installmentCount = installmentRows.length || (accepted?.installments ? Number(accepted.installments) : 0);
  const firstDue = schedule[0]?.dueDateFormatted || schedule[0]?.dueDate || '';
  const installmentValue = installmentRows[0]?.amount || (installmentCount ? balance / installmentCount : balance);

  const totalMan = 0;
  const totalGeral = finalValue + totalMan;

  const razao = (clinic.razaoSocial || clinic.nomeFantasia || clinic.nomeClinica || '').trim();
  const cnpjRaw = (doc.cnpj || '').trim();
  const cnpj = cnpjRaw ? formatCnpj(cnpjRaw) : '';
  const clinEnd = formatAddress(mainClinicAddr);
  const clinicCity = String(mainClinicAddr.cidade || mainClinicAddr.city || '').trim();
  const clinicState = String(mainClinicAddr.uf || mainClinicAddr.state || '').trim();
  const cityState = clinicCity && clinicState ? `${clinicCity}/${clinicState}` : '';

  const phones = patientBundle?.phones || [];
  const clinicPhones = db.clinicPhones || [];
  const mainPhone = phones.find((p) => p.is_primary) || phones[0];
  const clinicPhone = clinicPhones.find((p) => p.principal) || clinicPhones[0];
  const phoneStr = mainPhone ? `(${mainPhone.ddd || ''}) ${mainPhone.number || ''}`.trim() : '';
  const clinicPhoneStr = clinicPhone
    ? `(${clinicPhone.ddd || ''}) ${clinicPhone.numero || clinicPhone.number || ''}`.trim()
    : '';

  const pacNome = String(profile.full_name || '').trim();
  const pacCpf = formatCpf(profile.cpf || '');
  const pacRg = String(pdocs.rg || profile.rg || '').trim();
  const pacEnd = formatAddress(paddr);
  const pacEmail = String(profile.email || patientBundle?.patient?.email || '').trim();
  const pacBirth = formatDateBR(profile.birth_date);

  const respNome = String(
    profile.guardian_full_name
    || profile.legal_guardian_name
    || profile.financial_responsible_name
    || (party.hasFinancialResponsible ? pacNome : ''),
  ).trim();
  const respCpf = formatCpf(profile.guardian_cpf || profile.financial_responsible_cpf || profile.cpf || '');
  const respEnd = formatAddress(
    (patientBundle?.addresses || []).find((a) => a.type === 'guardian') || paddr,
  ) || pacEnd;
  const respEmail = String(profile.guardian_email || profile.legal_guardian_email || profile.email || '').trim();
  const respPhone = phoneStr;
  const respParentesco = String(profile.guardian_relationship || profile.guardian_parentesco || '').trim();

  const depNome = String(profile.dependent_full_name || pacNome).trim();

  const profName = String(currentUser?.name || currentUser?.nomeCompleto || '').trim();
  const profCro = resolveAttendingProfessionalCro(currentUser || {});
  const { name: respTecnico, cro: respTecnicoCro } = resolveClinicTechnicalResponsible(doc, clinic);

  const budgetNumberRaw = clinicalBudget?.budgetNumber || crmBudget?.code || '';
  const budgetNumber = isTechnicalId(budgetNumberRaw)
    ? formatFriendlyBudgetNumber(budgetNumberRaw, 1)
    : formatFriendlyBudgetNumber(budgetNumberRaw, 1);

  const contractNum = contractNumber
    ? formatFriendlyContractNumber(contractNumber, 1)
    : formatFriendlyContractNumber(null, 1);

  const formaPag = clinicalMeta?.paymentLabel
    || accepted?.label
    || crmBudget?.paymentMethod
    || crmBudget?.formaPagamento
    || '';

  const procHtml = buildProceduresTable(procedures, profName);
  const parcelasHtml = buildParcelasTable(schedule);

  const map = {
    '#emissorNomeRazaoSocial': razao,
    '#emissorCNPJCPF': cnpj,
    '#clinicaRazaoSocial': razao,
    '#clinicaCNPJCPF': cnpj,
    '#clinicaEndereco': clinEnd,
    '#clinicaCidade': clinicCity,
    '#clinicaEstado': clinicState,
    '#clinicaCidadeEstado': cityState,
    '#clinicaTelefone': clinicPhoneStr,
    '#clinicaEmail': String(clinic.email || clinic.contatoEmail || doc.email || '').trim(),
    '#responsavelTecnicoNome': respTecnico,
    '#responsavelTecnicoCRO': respTecnicoCro,
    '#pacienteNomeCompleto': pacNome,
    '#pacienteCPF': pacCpf,
    '#pacienteRG': pacRg,
    '#pacienteDataNascimento': pacBirth,
    '#pacienteEndereco': pacEnd,
    '#pacienteTelefone': phoneStr,
    '#pacienteEmail': pacEmail,
    '#dependenteNomeCompleto': depNome,
    '#dependenteCPF': pacCpf,
    '#dependenteDataNascimento': pacBirth,
    '#responsavelNomeCompleto': respNome,
    '#responsavelCPF': respCpf,
    '#responsavelEndereco': respEnd,
    '#responsavelTelefone': respPhone,
    '#responsavelEmail': respEmail,
    '#responsavelParentesco': respParentesco,
    '#numeroContrato': contractNum,
    '#dataContrato': formatDateBR(contractDate || new Date().toISOString()),
    '#procedimentos': procHtml,
    '#totalContrato': finalValue.toFixed(2),
    '#totalContratoExtenso': currencyToWordsPt(finalValue),
    '#totalManutencoes': totalMan.toFixed(2),
    '#totalManutencoesExtenso': currencyToWordsPt(totalMan),
    '#totalGeralContrato': totalGeral.toFixed(2),
    '#totalGeralContratoExtenso': currencyToWordsPt(totalGeral),
    '#parcelas': parcelasHtml,
    '#formaPagamento': formaPag,
    '#forma_pagamento': formaPag,
    '#entrada': entryAmount.toFixed(2),
    '#saldo': balance.toFixed(2),
    '#quantidadeParcelas': String(installmentCount || (entryAmount > 0 ? 1 : 0)),
    '#valorParcela': Number(installmentValue || 0).toFixed(2),
    '#dataPrimeiroVencimento': firstDue,
    '#manutencaoMeses': maintenanceMonths || '—',
    '#clausula': '',
    '#testemunha1Nome': '',
    '#testemunha1CPF': '',
    '#testemunha2Nome': '',
    '#testemunha2CPF': '',
    '#orcamento_numero': budgetNumber,
    '#orcamento_data': clinicalBudget?.createdAt
      ? formatDateBR(clinicalBudget.createdAt)
      : (crmBudget?.createdAt ? formatDateBR(crmBudget.createdAt) : ''),
    '#tratamento_nome': escapeHtml(planName),
    '#data_assinatura': formatDateBR(new Date().toISOString()),
    '#responsavel_legal': respNome,
    '#responsavel_cpf': respCpf.replace(/\D/g, ''),
    '#dependenteNomeCompleto': depNome,
    '#pessoaCPF': pacCpf.replace(/\D/g, ''),
    '#pessoaRG': pacRg,
    '#dentistaNomeCompleto': profName,
    '#dentistaConselhoNumero': profCro,
    '#orcamentoObservacoes': escapeHtml(obs).replace(/\n/g, '<br/>'),
    '#clinica_nome': razao,
    '#clinica_cnpj': cnpj,
    '#clinica_endereco': clinEnd,
    '#responsavel_tecnico': respTecnico,
    '#cro_responsavel': respTecnicoCro,
    '#paciente_nome': pacNome,
    '#paciente_cpf': pacCpf,
    '#paciente_endereco': pacEnd,
    '#paciente_telefone': phoneStr,
    '#profissional_nome': profName,
    '#profissional_cro': profCro,
    '#valor_total': finalValue.toFixed(2),
  };

  const meta = {
    partyModel: party.model,
    isMinor: party.isMinor,
    hasFinancialResponsible: party.hasFinancialResponsible,
    includeOrthodontics: treatmentType === 'ortodontia',
    treatmentTypes,
    treatmentType,
    budgetTotal: finalValue,
    procedureCount: procedures.length,
    budgetId: clinicalBudget?.id || crmBudget?.id || null,
    quoteId,
    quoteSource,
    patientId,
    valueMismatch: false,
  };

  if (clinicalBudget?.totalValue != null && Math.abs(Number(clinicalBudget.totalValue) - finalValue) > 0.01) {
    meta.valueMismatch = true;
  }

  const missing = validateResolvedVariables(map, meta);

  return { map, meta, missing, party };
}

export function validateResolvedVariables(map, meta = {}) {
  const missing = [];
  for (const rule of REQUIRED_RULES) {
    if (rule.when && !rule.when(meta)) continue;
    const value = map[rule.tag];
    if (isEmptyVariableValue(value)) {
      missing.push({
        tag: rule.tag,
        label: rule.label,
        group: rule.group,
      });
    }
  }
  if (meta.isMinor && isEmptyVariableValue(map['#responsavelNomeCompleto'])) {
    missing.push({
      tag: '#responsavelNomeCompleto',
      label: 'Responsável legal obrigatório para menor de idade',
      group: 'responsavel',
      critical: true,
    });
  }
  if (!meta.procedureCount) {
    missing.push({
      tag: '#procedimentos',
      label: 'Orçamento aprovado sem procedimentos',
      group: 'contrato',
      critical: true,
    });
  }
  if (meta.valueMismatch) {
    missing.push({
      tag: '#totalContrato',
      label: 'Divergência entre valor do orçamento e condição financeira',
      group: 'contrato',
      critical: true,
      warning: true,
    });
  }
  return missing;
}

export function applyContractHashtags(html, map) {
  let out = String(html || '');
  for (const [k, v] of Object.entries(map || {})) {
    if (!k.startsWith('#')) continue;
    const re = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    out = out.replace(re, v == null ? '' : String(v));
  }
  return out;
}

const OPTIONAL_TAGS = new Set([
  '#orcamentoObservacoes',
  '#parcelas',
  '#dataPrimeiroVencimento',
  '#manutencaoMeses',
  '#totalManutencoes',
  '#totalManutencoesExtenso',
  '#clausula',
  '#testemunha1Nome',
  '#testemunha1CPF',
  '#testemunha2Nome',
  '#testemunha2CPF',
  '#dependenteCPF',
  '#dependenteDataNascimento',
  '#responsavelParentesco',
  '#responsavelTelefone',
  '#responsavelEmail',
  '#dentes',
]);

export function isRequiredContractTag(tag) {
  return REQUIRED_RULES.some((r) => r.tag === tag);
}

export function findUnresolvedTagsInHtml(html, map) {
  const tags = html.match(/#[a-zA-Z0-9_]+/g) || [];
  const unresolved = [];
  for (const tag of [...new Set(tags)]) {
    if (OPTIONAL_TAGS.has(tag)) continue;
    if (!isRequiredContractTag(tag)) continue;
    if (isEmptyVariableValue(map[tag])) unresolved.push(tag);
  }
  return unresolved;
}

export function fromProfessionalContext(ctx) {
  if (!ctx) return {};
  const p = ctx.patient || {};
  const c = ctx.clinic || {};
  const f = ctx.financial || {};
  const m = ctx.meta || {};
  return {
    '#numeroContrato': m.contractNumber || '',
    '#dataContrato': m.issueDate || '',
    '#pacienteNomeCompleto': p.name || '',
    '#pacienteCPF': p.cpf || '',
    '#pacienteRG': p.rg || '',
    '#pacienteDataNascimento': p.birthDate || '',
    '#pacienteEndereco': p.address || '',
    '#pacienteTelefone': p.phone || '',
    '#pacienteEmail': p.email || '',
    '#emissorNomeRazaoSocial': c.legalName || c.name || '',
    '#emissorCNPJCPF': c.cnpj || '',
    '#clinicaEndereco': c.address || '',
    '#clinicaCidade': c.city || '',
    '#clinicaEstado': c.state || '',
    '#clinicaCidadeEstado': c.clinicForumCity?.replace(' - ', '/') || `${c.city || ''}/${c.state || ''}`,
    '#clinicaTelefone': c.phone || '',
    '#clinicaEmail': c.email || '',
    '#responsavelTecnicoNome': c.technicalResponsible || '',
    '#responsavelTecnicoCRO': c.technicalResponsibleCro || '',
    '#totalContrato': String(f.finalValue || f.totalValue || 0),
    '#totalContratoExtenso': f.finalValueExtenso || '',
    '#formaPagamento': f.paymentLabel || '',
    '#entrada': f.entryFormatted || '',
    '#saldo': f.balanceFormatted || '',
    '#quantidadeParcelas': String(f.installmentCount || ''),
    '#valorParcela': f.installmentValueFormatted || '',
    '#orcamento_numero': m.budgetNumber || '',
  };
}
