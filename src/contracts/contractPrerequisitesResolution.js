/**
 * Resolução acionável de pré-requisitos do contrato clínico.
 * Não altera o validator (getContractReadinessChecklist) — mapeia pendências → CTAs oficiais.
 */

import {
  ASSIGN_CLINICAL_PROFESSIONAL_ACTION,
  ASSIGN_CLINICAL_PROFESSIONAL_LABEL,
  ASSIGN_CLINICAL_PROFESSIONAL_MODE,
  isMissingClinicalProfessionalItem,
} from './clinicalProfessionalAssignmentCta.js';
import { buildClinicalAppointmentUrl } from '../services/budgetNavigationService.js';

export const UNKNOWN_BLOCKER_FAILSAFE =
  'Pendência reconhecida sem rota de correção automática neste fluxo. Recarregue o atendimento ou corrija o cadastro correspondente.';

export const PATIENT_FIELD_MESSAGES = {
  full_name: 'Nome do paciente não informado',
  cpf_or_rg: 'CPF ou RG do paciente não informado',
  birth_date: 'Data de nascimento não informada',
  phone: 'Telefone não informado',
  address_min: 'Endereço do paciente não informado',
  street: 'Endereço do paciente não informado',
  sex: 'Sexo não informado',
  responsible_name: 'Nome do responsável não informado',
  responsible_cpf: 'CPF do responsável não informado',
};

const PATIENT_FIELD_TO_TAG = {
  full_name: '#pacienteNomeCompleto',
  cpf_or_rg: '#pacienteCPF',
  address_min: '#pacienteEndereco',
  street: '#pacienteEndereco',
};

const PATIENT_FIELD_TO_GROUP = {
  responsible_name: 'responsavel',
  responsible_cpf: 'responsavel',
};

export const PREREQ_GROUP_META = {
  clinica: {
    key: 'clinica',
    title: 'Clínica',
    completeLabel: 'Dados da clínica completos',
    ctaLabel: 'Corrigir dados da clínica',
    action: 'fix_clinic_data',
  },
  paciente: {
    key: 'paciente',
    title: 'Paciente',
    completeLabel: 'Cadastro do paciente completo',
    ctaLabel: 'Completar cadastro do paciente',
    action: 'fix_patient_data',
  },
  responsavel: {
    key: 'responsavel',
    title: 'Responsável legal',
    completeLabel: 'Responsável legal completo',
    ctaLabel: 'Completar cadastro do paciente',
    action: 'fix_patient_data',
  },
  dependente: {
    key: 'dependente',
    title: 'Dependente',
    completeLabel: 'Dados do dependente completos',
    ctaLabel: 'Completar cadastro do paciente',
    action: 'fix_patient_data',
  },
  profissional: {
    key: 'profissional',
    title: 'Profissional',
    completeLabel: 'Dados do profissional completos',
    ctaLabel: 'Corrigir dados do profissional',
    action: 'fix_professional_data',
  },
  tcle: {
    key: 'tcle',
    title: 'Documentação',
    completeLabel: 'TCLE obrigatório configurado',
    ctaLabel: 'Resolver TCLE',
    action: 'resolve_tcle',
  },
  lgpd: {
    key: 'lgpd',
    title: 'LGPD',
    completeLabel: 'LGPD pronto',
    ctaLabel: 'Resolver LGPD',
    action: 'resolve_lgpd',
  },
  financeiro: {
    key: 'financeiro',
    title: 'Financeiro',
    completeLabel: 'Condição financeira completa',
    ctaLabel: 'Corrigir condição financeira',
    action: 'fix_payment_data',
  },
  contrato: {
    key: 'contrato',
    title: 'Orçamento',
    completeLabel: 'Dados do orçamento completos',
    ctaLabel: 'Revisar orçamento',
    action: 'fix_contract_data',
  },
  template: {
    key: 'template',
    title: 'Modelo do contrato',
    completeLabel: 'Modelo do contrato ok',
    ctaLabel: 'Revisar modelo',
    action: 'fix_template',
  },
};

const CARD_ORDER = [
  'clinica',
  'paciente',
  'responsavel',
  'dependente',
  'profissional',
  'tcle',
  'lgpd',
  'financeiro',
  'contrato',
  'template',
];

const PATIENT_TAB_BY_HINT = [
  { test: /endere[cç]o|address_min|street|cidade|cep/i, tab: 'enderecos' },
  { test: /cpf|nascimento|birth|documento|sexo|full_name|dados-pessoais/i, tab: 'dados' },
  { test: /respons[aá]vel|guardi[aã]o|guardian/i, tab: 'dados' },
  { test: /telefone|phone|contato/i, tab: 'contatos' },
];

export function isSafeClinicalReturnUrl(url) {
  const raw = String(url || '').trim();
  if (!raw.startsWith('/atendimento-clinico/')) return false;
  if (raw.includes('://') || raw.includes('\\') || raw.includes('\n') || raw.includes('\r')) {
    return false;
  }
  if (raw.startsWith('//')) return false;
  return true;
}

export function buildContractReturnUrl({
  appointmentId,
  budgetId = null,
  contractId = null,
  patientId = null,
} = {}) {
  if (!appointmentId) return '';
  const url = buildClinicalAppointmentUrl({
    appointmentId,
    budgetId,
    contractId,
    section: 'contratos',
  });
  if (!isSafeClinicalReturnUrl(url)) return '';
  if (patientId) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}patientId=${encodeURIComponent(patientId)}&revalidate=1`;
  }
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}revalidate=1`;
}

export function resolvePatientCadastroTab(items = []) {
  for (const item of items) {
    const text = `${item?.label || ''} ${item?.hint || ''} ${item?.tag || ''} ${item?.field || ''}`;
    for (const rule of PATIENT_TAB_BY_HINT) {
      if (rule.test.test(text)) return rule.tab;
    }
  }
  return 'dados';
}

export function resolveTcleTemplateHint(items = []) {
  const first = items[0];
  const tag = String(first?.tag || '');
  const tcleId = tag.startsWith('tcle:') ? tag.slice(5) : '';
  if (tcleId === 'tcle_implante') return 'consent_implante';
  if (tcleId === 'tcle_ortodontia') return 'consent_ortodontia';
  if (tcleId === 'tcle_endodontia') return 'consent_endodontia';
  if (tcleId === 'tcle_cirurgia') return 'consent_exodontia';
  if (tcleId === 'tcle_estetica') return 'consent_toxina_botulinica';
  if (tcleId === 'tcle_clareamento') return 'consent_clareamento';
  return '';
}

export function resolveClinicDestinationFocus(items = []) {
  const blob = items.map((item) => `${item?.tag || ''} ${item?.label || ''}`).join(' ');
  const hasRt = /responsavelTecnico|respons[aá]vel t[eé]cnico/i.test(blob);
  const hasAddr = /#clinicaEndereco|#clinicaCidade|#clinicaEstado|#clinicaCidadeEstado|endere[cç]o da cl[ií]nica|cidade da cl[ií]nica|UF da cl[ií]nica|foro/i.test(blob);
  const hasCadastro = /#emissor|#emissorCNPJ|CNPJ da cl[ií]nica|raz[aã]o social/i.test(blob);
  if (hasRt) return { section: 'documentacao', highlight: 'responsavel-tecnico' };
  if (hasAddr) return { section: 'enderecos', highlight: '' };
  if (hasCadastro) return { section: 'cadastro', highlight: '' };
  return { section: 'documentacao', highlight: 'responsavel-tecnico' };
}

function isPaymentItem(item) {
  return /formaPagamento|pagamento|financeira/i.test(`${item?.tag || ''} ${item?.label || ''}`);
}

function cloneGroups(groups = {}) {
  const next = {
    clinica: [],
    paciente: [],
    dependente: [],
    responsavel: [],
    profissional: [],
    contrato: [],
    financeiro: [],
    tcle: [],
    lgpd: [],
    template: [],
  };
  for (const [key, items] of Object.entries(groups || {})) {
    next[key] = Array.isArray(items) ? items.map((item) => ({ ...item })) : [];
  }
  return next;
}

function hasTag(groups, tag) {
  return Object.values(groups).some((items) => (items || []).some((item) => item.tag === tag));
}

/**
 * Acrescenta blockers de UI já existentes (profissional / cadastro incompleto)
 * sem inventar regras novas no validator.
 * pendingCriticalFields NÃO desliga canGenerate — só explica o campo e oferece CTA.
 */
export const PROFESSIONAL_GATE_TAGS = {
  MISSING_CLINICAL: 'professional:missing-clinical',
  MISSING_CRO: 'professional:cro',
  MISSING: 'professional:missing',
};

export function enrichContractReadinessChecklist(checklist, extras = {}) {
  if (!checklist) return null;
  const groups = cloneGroups(checklist.groups);
  const {
    pendingCriticalFields = [],
    professionalId,
    professionalCro = '',
    requiresProfessionalRegistration,
    clinicalProfessionalName = '',
    professionalGate = null,
  } = extras;
  const hasProfessionalGate = Object.prototype.hasOwnProperty.call(extras, 'professionalId')
    || Object.prototype.hasOwnProperty.call(extras, 'professionalGate');

  for (const field of pendingCriticalFields) {
    const tag = PATIENT_FIELD_TO_TAG[field] || `patient:${field}`;
    if (hasTag(groups, tag) || hasTag(groups, `#${field}`)) continue;
    const group = PATIENT_FIELD_TO_GROUP[field] || 'paciente';
    const overlapsRequired = Boolean(PATIENT_FIELD_TO_TAG[field]);
    groups[group] = groups[group] || [];
    groups[group].push({
      tag,
      field,
      label: PATIENT_FIELD_MESSAGES[field] || `Campo pendente: ${field}`,
      group,
      critical: overlapsRequired,
    });
  }

  if (hasProfessionalGate) {
    const namedCroLabel = clinicalProfessionalName
      ? `Registro profissional de ${clinicalProfessionalName} não informado.`
      : 'Registro profissional de profissional clínico não informado.';
    if (professionalGate === 'missing_clinical') {
      if (!hasTag(groups, PROFESSIONAL_GATE_TAGS.MISSING_CLINICAL)) {
        groups.profissional = groups.profissional || [];
        groups.profissional.push({
          tag: PROFESSIONAL_GATE_TAGS.MISSING_CLINICAL,
          label: 'Defina o profissional clínico responsável pelo atendimento.',
          group: 'profissional',
          critical: true,
        });
      }
    } else if (professionalGate === 'missing_registration') {
      if (!hasTag(groups, PROFESSIONAL_GATE_TAGS.MISSING_CRO)) {
        groups.profissional = groups.profissional || [];
        groups.profissional.push({
          tag: PROFESSIONAL_GATE_TAGS.MISSING_CRO,
          label: namedCroLabel,
          group: 'profissional',
          critical: true,
        });
      }
    } else if (professionalGate !== 'ok' && requiresProfessionalRegistration !== false) {
      if (!professionalId) {
        if (!hasTag(groups, PROFESSIONAL_GATE_TAGS.MISSING)) {
          groups.profissional = groups.profissional || [];
          groups.profissional.push({
            tag: PROFESSIONAL_GATE_TAGS.MISSING,
            label: 'Defina o profissional clínico responsável pelo atendimento.',
            group: 'profissional',
            critical: true,
          });
        }
      } else if (!String(professionalCro || '').trim()) {
        if (!hasTag(groups, PROFESSIONAL_GATE_TAGS.MISSING_CRO)) {
          groups.profissional = groups.profissional || [];
          groups.profissional.push({
            tag: PROFESSIONAL_GATE_TAGS.MISSING_CRO,
            label: namedCroLabel,
            group: 'profissional',
            critical: true,
          });
        }
      }
    }
  }

  const contratoItems = Array.isArray(groups.contrato) ? groups.contrato : [];
  const financeiroFromContrato = contratoItems.filter(isPaymentItem);
  const contratoRest = contratoItems.filter((item) => !isPaymentItem(item));
  groups.contrato = contratoRest;
  groups.financeiro = [
    ...(groups.financeiro || []),
    ...financeiroFromContrato.map((item) => ({ ...item, group: 'financeiro' })),
  ];

  const extraBlocking = (groups.profissional || []).some((item) => item.critical);
  const canGenerate = Boolean(checklist.canGenerate) && !extraBlocking;

  return {
    ...checklist,
    groups,
    canGenerate,
    ok: canGenerate,
  };
}

function destinationBase(meta, {
  returnUrl,
  patientId,
  appointmentId,
  budgetId,
  professionalId = null,
}) {
  return {
    ...meta,
    returnUrl,
    patientId: patientId || null,
    appointmentId: appointmentId || null,
    budgetId: budgetId || null,
    professionalId: professionalId || null,
  };
}

/**
 * Destino oficial de resolução — sem formulários paralelos.
 */
export function buildPrerequisiteDestination(groupKey, {
  patientId,
  appointmentId,
  budgetId = null,
  contractId = null,
  professionalId = null,
  items = [],
} = {}) {
  const returnUrl = buildContractReturnUrl({
    appointmentId,
    budgetId,
    contractId,
    patientId,
  });
  const meta = PREREQ_GROUP_META[groupKey];
  const ctx = {
    returnUrl,
    patientId,
    appointmentId,
    budgetId,
    professionalId,
  };

  if (!meta) {
    return {
      ...destinationBase({
        key: groupKey,
        title: 'Outros',
        ctaLabel: null,
        action: null,
      }, ctx),
      href: null,
      mode: 'blocked',
      explicitlyNonActionable: true,
      reason: UNKNOWN_BLOCKER_FAILSAFE,
    };
  }

  if (groupKey === 'clinica') {
    const focus = resolveClinicDestinationFocus(items);
    const params = new URLSearchParams({ section: focus.section });
    if (focus.highlight) params.set('highlight', focus.highlight);
    if (returnUrl) params.set('returnTo', returnUrl);
    return {
      ...destinationBase(meta, ctx),
      href: `/admin/dados-clinica?${params.toString()}`,
      mode: 'navigate',
      focus: focus.highlight || focus.section,
      section: focus.section,
    };
  }

  if (groupKey === 'paciente' || groupKey === 'responsavel' || groupKey === 'dependente') {
    if (!patientId) {
      return {
        ...destinationBase(meta, ctx),
        href: null,
        mode: 'blocked',
        reason: 'patientId ausente',
        patientId: null,
      };
    }
    const tab = resolvePatientCadastroTab(items);
    const params = new URLSearchParams({
      highlight: 'pending',
      tab,
    });
    if (returnUrl) params.set('returnTo', returnUrl);
    if (appointmentId) params.set('appointmentId', appointmentId);
    if (budgetId) params.set('budgetId', budgetId);
    return {
      ...destinationBase(meta, ctx),
      href: `/pacientes/cadastro/${encodeURIComponent(patientId)}?${params.toString()}`,
      mode: 'navigate',
      focus: tab,
    };
  }

  if (groupKey === 'profissional') {
    const missingClinical = (items || []).some(isMissingClinicalProfessionalItem);
    if (missingClinical) {
      return {
        ...destinationBase({
          ...meta,
          ctaLabel: ASSIGN_CLINICAL_PROFESSIONAL_LABEL,
          action: ASSIGN_CLINICAL_PROFESSIONAL_ACTION,
        }, ctx),
        professionalId: null,
        href: null,
        mode: ASSIGN_CLINICAL_PROFESSIONAL_MODE,
        focus: 'profissional-clinico',
        reason: appointmentId ? null : 'appointmentId ausente',
      };
    }
    const params = new URLSearchParams({ tab: 'profissional' });
    if (professionalId) params.set('collaboratorId', professionalId);
    if (returnUrl) params.set('returnTo', returnUrl);
    if (patientId) params.set('patientId', patientId);
    if (appointmentId) params.set('appointmentId', appointmentId);
    if (budgetId) params.set('budgetId', budgetId);
    return {
      ...destinationBase(meta, ctx),
      professionalId: professionalId || null,
      href: `/admin/colaboradores?${params.toString()}`,
      mode: 'navigate',
      focus: 'profissional',
    };
  }

  if (groupKey === 'tcle' || groupKey === 'lgpd') {
    const templateKey = groupKey === 'tcle' ? resolveTcleTemplateHint(items) : '';
    const qs = new URLSearchParams();
    if (budgetId) qs.set('budgetId', budgetId);
    if (contractId) qs.set('contractId', contractId);
    qs.set('section', 'documentos');
    qs.set('docCategory', 'consentimentos');
    if (templateKey) qs.set('docTemplate', templateKey);
    if (returnUrl) qs.set('returnTo', returnUrl);
    if (patientId) qs.set('patientId', patientId);
    return {
      ...destinationBase(meta, ctx),
      href: appointmentId ? `/atendimento-clinico/${appointmentId}?${qs.toString()}` : null,
      mode: appointmentId ? 'clinical_section' : 'blocked',
      focus: 'consentimentos',
      templateKey: templateKey || null,
      reason: appointmentId ? null : 'appointmentId ausente',
    };
  }

  if (groupKey === 'contrato' || groupKey === 'financeiro') {
    const href = buildClinicalAppointmentUrl({
      appointmentId,
      budgetId,
      contractId,
      section: 'orcamento',
    });
    return {
      ...destinationBase(meta, ctx),
      href,
      mode: 'clinical_section',
      focus: groupKey === 'financeiro' ? 'pagamento' : 'orcamento',
    };
  }

  return {
    ...destinationBase(meta, ctx),
    href: returnUrl || null,
    mode: returnUrl ? 'navigate' : 'blocked',
  };
}

function mapCardItems(items = []) {
  return items.map((item) => ({
    tag: item.tag,
    field: item.field || null,
    label: item.label,
    hint: item.hint || null,
    critical: item.critical !== false,
  }));
}

function pushPendingCard(cards, key, items, ctx) {
  const meta = PREREQ_GROUP_META[key];
  const destination = buildPrerequisiteDestination(key, { ...ctx, items });
  const isBlocking = items.some((item) => item.critical !== false);
  cards.push({
    group: key,
    title: meta?.title || 'Outros',
    status: 'pending',
    completeLabel: meta?.completeLabel || '',
    isBlocking,
    items: mapCardItems(items),
    destination,
    explicitlyNonActionable: Boolean(destination.explicitlyNonActionable),
    nonActionableReason: destination.explicitlyNonActionable ? destination.reason : null,
  });
}

/**
 * Cards de resolução para o painel de pendências do contrato.
 */
export function buildContractPrerequisiteResolutionCards({
  checklist,
  patientId = null,
  appointmentId = null,
  budgetId = null,
  contractId = null,
  professionalId = null,
  clinicalProfessionalName = '',
  clinicalProfessionalCro = '',
} = {}) {
  if (!checklist) return { cards: [], canGenerate: false, returnUrl: '' };

  const groups = cloneGroups(checklist.groups || {});
  const contratoItems = Array.isArray(groups.contrato) ? groups.contrato : [];
  groups.financeiro = [
    ...(groups.financeiro || []),
    ...contratoItems.filter(isPaymentItem).map((item) => ({ ...item, group: 'financeiro' })),
  ];
  groups.contrato = contratoItems.filter((item) => !isPaymentItem(item));
  const returnUrl = buildContractReturnUrl({
    appointmentId,
    budgetId,
    contractId,
    patientId,
  });
  const requiredTcles = Array.isArray(checklist.requiredTcles) ? checklist.requiredTcles : [];
  const ctx = {
    patientId,
    appointmentId,
    budgetId,
    contractId,
    professionalId,
  };
  const cards = [];
  const seen = new Set();

  for (const key of CARD_ORDER) {
    seen.add(key);
    const items = Array.isArray(groups[key]) ? groups[key] : [];
    const meta = PREREQ_GROUP_META[key];
    if (!meta) continue;

    const isTcleRelevant = key !== 'tcle' || requiredTcles.length > 0 || items.length > 0;
    if (!isTcleRelevant) continue;
    if (key === 'lgpd' && !items.length) continue;

    if (!items.length && key === 'profissional') {
      const assignedName = String(clinicalProfessionalName || '').trim();
      if (assignedName) {
        const cro = String(clinicalProfessionalCro || '').trim();
        cards.push({
          group: key,
          title: meta.title,
          status: 'complete',
          completeLabel: cro ? `${assignedName} · ${cro}` : assignedName,
          isBlocking: false,
          items: [],
          destination: null,
          explicitlyNonActionable: false,
        });
      }
      continue;
    }
    if (!items.length && !['clinica', 'paciente', 'tcle'].includes(key)) continue;
    if (!items.length && key === 'tcle' && requiredTcles.length === 0) continue;

    if (!items.length) {
      if (!checklist.canGenerate && ['clinica', 'paciente', 'tcle'].includes(key)) {
        if (key === 'tcle' && requiredTcles.length === 0) continue;
        cards.push({
          group: key,
          title: meta.title,
          status: 'complete',
          completeLabel: key === 'tcle' && requiredTcles[0]
            ? `TCLE configurado: ${requiredTcles[0].title}`
            : meta.completeLabel,
          isBlocking: false,
          items: [],
          destination: null,
          explicitlyNonActionable: false,
        });
      }
      continue;
    }

    pushPendingCard(cards, key, items, ctx);
  }

  for (const [key, items] of Object.entries(groups)) {
    if (seen.has(key) || !items?.length) continue;
    const destination = buildPrerequisiteDestination(key, { ...ctx, items });
    cards.push({
      group: key,
      title: 'Outros',
      status: 'pending',
      completeLabel: '',
      isBlocking: items.some((item) => item.critical !== false),
      items: mapCardItems(items),
      destination,
      explicitlyNonActionable: true,
      nonActionableReason: UNKNOWN_BLOCKER_FAILSAFE,
    });
  }

  return {
    cards,
    canGenerate: Boolean(checklist.canGenerate),
    returnUrl,
    patientId: patientId || null,
    appointmentId: appointmentId || null,
    budgetId: budgetId || null,
    professionalId: professionalId || null,
  };
}

/**
 * Invariante: blocker crítico conhecido precisa de CTA ou ser marcado não-acionável.
 */
export function listUnactionableBlockingCards(resolution) {
  const cards = resolution?.cards || [];
  return cards.filter((card) => {
    if (card.status !== 'pending') return false;
    if (!card.isBlocking) return false;
    if (card.explicitlyNonActionable) return false;
    const dest = card.destination;
    const hasAction = dest?.mode === ASSIGN_CLINICAL_PROFESSIONAL_MODE
      || dest?.action === ASSIGN_CLINICAL_PROFESSIONAL_ACTION
      || (
        Boolean(dest?.href)
        && dest.mode !== 'blocked'
        && Boolean(dest.action)
      );
    return !hasAction;
  });
}
