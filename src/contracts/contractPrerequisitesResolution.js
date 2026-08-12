/**
 * Resolução acionável de pré-requisitos do contrato clínico.
 * Não altera validações — apenas mapeia pendências → CTAs/destinos oficiais.
 */

import { buildClinicalAppointmentUrl } from '../services/budgetNavigationService.js';

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
  tcle: {
    key: 'tcle',
    title: 'Documentação',
    completeLabel: 'TCLE obrigatório configurado',
    ctaLabel: 'Resolver TCLE',
    action: 'resolve_tcle',
  },
  contrato: {
    key: 'contrato',
    title: 'Orçamento e contrato',
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

const PATIENT_TAB_BY_HINT = [
  { test: /endere[cç]o/i, tab: 'enderecos' },
  { test: /cpf|nascimento|birth|documento/i, tab: 'dados' },
  { test: /respons[aá]vel|guardi[aã]o|guardian/i, tab: 'dados' },
  { test: /telefone|phone|contato/i, tab: 'contatos' },
];

export function isSafeClinicalReturnUrl(url) {
  const raw = String(url || '').trim();
  if (!raw.startsWith('/atendimento-clinico/')) return false;
  if (raw.includes('://') || raw.includes('\\') || raw.includes('\n') || raw.includes('\r')) {
    return false;
  }
  // Bloqueia protocolo relativo //evil.com
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
  // patientId fica no atendimento; query só para auditoria/contexto sem abrir outro paciente.
  if (patientId) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}patientId=${encodeURIComponent(patientId)}&revalidate=1`;
  }
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}revalidate=1`;
}

export function resolvePatientCadastroTab(items = []) {
  for (const item of items) {
    const text = `${item?.label || ''} ${item?.hint || ''} ${item?.tag || ''}`;
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
  return '';
}

/**
 * Destino oficial de resolução — sem formulários paralelos.
 */
export function buildPrerequisiteDestination(groupKey, {
  patientId,
  appointmentId,
  budgetId = null,
  contractId = null,
  items = [],
} = {}) {
  const returnUrl = buildContractReturnUrl({
    appointmentId,
    budgetId,
    contractId,
    patientId,
  });
  const meta = PREREQ_GROUP_META[groupKey] || PREREQ_GROUP_META.contrato;

  if (groupKey === 'clinica') {
    const params = new URLSearchParams({
      section: 'documentacao',
      highlight: 'responsavel-tecnico',
    });
    if (returnUrl) params.set('returnTo', returnUrl);
    return {
      ...meta,
      href: `/admin/dados-clinica?${params.toString()}`,
      mode: 'navigate',
      focus: 'responsavel-tecnico',
      returnUrl,
      patientId: patientId || null,
      appointmentId: appointmentId || null,
      budgetId: budgetId || null,
    };
  }

  if (groupKey === 'paciente' || groupKey === 'responsavel' || groupKey === 'dependente') {
    if (!patientId) {
      return {
        ...meta,
        href: null,
        mode: 'blocked',
        reason: 'patientId ausente',
        returnUrl,
        patientId: null,
        appointmentId: appointmentId || null,
        budgetId: budgetId || null,
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
      ...meta,
      href: `/pacientes/cadastro/${encodeURIComponent(patientId)}?${params.toString()}`,
      mode: 'navigate',
      focus: tab,
      returnUrl,
      patientId,
      appointmentId: appointmentId || null,
      budgetId: budgetId || null,
    };
  }

  if (groupKey === 'tcle') {
    const templateKey = resolveTcleTemplateHint(items);
    const qs = new URLSearchParams();
    if (budgetId) qs.set('budgetId', budgetId);
    if (contractId) qs.set('contractId', contractId);
    qs.set('section', 'documentos');
    qs.set('docCategory', 'consentimentos');
    if (templateKey) qs.set('docTemplate', templateKey);
    if (returnUrl) qs.set('returnTo', returnUrl);
    if (patientId) qs.set('patientId', patientId);
    return {
      ...meta,
      href: `/atendimento-clinico/${appointmentId}?${qs.toString()}`,
      mode: 'clinical_section',
      focus: 'consentimentos',
      templateKey: templateKey || null,
      returnUrl,
      patientId: patientId || null,
      appointmentId: appointmentId || null,
      budgetId: budgetId || null,
    };
  }

  if (groupKey === 'contrato') {
    const href = buildClinicalAppointmentUrl({
      appointmentId,
      budgetId,
      contractId,
      section: 'orcamento',
    });
    return {
      ...meta,
      href,
      mode: 'clinical_section',
      focus: 'orcamento',
      returnUrl,
      patientId: patientId || null,
      appointmentId: appointmentId || null,
      budgetId: budgetId || null,
    };
  }

  return {
    ...meta,
    href: returnUrl || null,
    mode: returnUrl ? 'navigate' : 'blocked',
    returnUrl,
    patientId: patientId || null,
    appointmentId: appointmentId || null,
    budgetId: budgetId || null,
  };
}

/**
 * Cards de resolução para o painel "Dados obrigatórios pendentes".
 */
export function buildContractPrerequisiteResolutionCards({
  checklist,
  patientId = null,
  appointmentId = null,
  budgetId = null,
  contractId = null,
} = {}) {
  if (!checklist) return { cards: [], canGenerate: false, returnUrl: '' };

  const groups = checklist.groups || {};
  const returnUrl = buildContractReturnUrl({
    appointmentId,
    budgetId,
    contractId,
    patientId,
  });
  const requiredTcles = Array.isArray(checklist.requiredTcles) ? checklist.requiredTcles : [];
  const order = ['clinica', 'paciente', 'responsavel', 'dependente', 'tcle', 'contrato', 'template'];
  const cards = [];

  for (const key of order) {
    const items = Array.isArray(groups[key]) ? groups[key] : [];
    const meta = PREREQ_GROUP_META[key];
    if (!meta) continue;

    const isTcleRelevant = key !== 'tcle' || requiredTcles.length > 0 || items.length > 0;
    if (!isTcleRelevant) continue;

    // Grupos vazios e irrelevantes (ex.: dependente sem pendência) não poluem o painel.
    if (!items.length && !['clinica', 'paciente', 'tcle'].includes(key)) continue;
    if (!items.length && key === 'tcle' && requiredTcles.length === 0) continue;

    if (!items.length) {
      // Mostra estado concluído só enquanto ainda houver outras pendências.
      if (!checklist.canGenerate && ['clinica', 'paciente', 'tcle'].includes(key)) {
        if (key === 'tcle' && requiredTcles.length === 0) continue;
        cards.push({
          group: key,
          title: meta.title,
          status: 'complete',
          completeLabel: key === 'tcle' && requiredTcles[0]
            ? `TCLE configurado: ${requiredTcles[0].title}`
            : meta.completeLabel,
          items: [],
          destination: null,
        });
      }
      continue;
    }

    const destination = buildPrerequisiteDestination(key, {
      patientId,
      appointmentId,
      budgetId,
      contractId,
      items,
    });

    cards.push({
      group: key,
      title: meta.title,
      status: 'pending',
      completeLabel: meta.completeLabel,
      items: items.map((item) => ({
        tag: item.tag,
        label: item.label,
        hint: item.hint || null,
        critical: Boolean(item.critical),
      })),
      destination,
    });
  }

  return {
    cards,
    canGenerate: Boolean(checklist.canGenerate),
    returnUrl,
    patientId: patientId || null,
    appointmentId: appointmentId || null,
    budgetId: budgetId || null,
  };
}
