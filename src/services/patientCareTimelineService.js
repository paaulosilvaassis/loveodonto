import { loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from './appointmentService.js';
import { listFiles } from './patientFilesService.js';
import { listClinicalEvolutions } from './clinicalService.js';
import { BUDGET_STATUS } from './clinicalBudgetConstants.js';
import { listPatientBudgetHistory } from './clinicalBudgetLockService.js';
import { listPatientContracts } from './contractModuleService.js';
import { CONTRACT_STATUS_LABELS } from '../contracts/contractConstants.js';
import { formatCurrencyBRL } from '../utils/currency.js';
import {
  formatFriendlyBudgetNumber,
  formatFriendlyContractNumber,
  isTechnicalId,
} from '../utils/friendlyNumbers.js';
import { buildPatientFinancialTimelineEvents } from './patientFinancialSummaryService.js';

export { formatFriendlyBudgetNumber, formatFriendlyContractNumber, isTechnicalId };

export const CARE_INTELLIGENCE_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'atendimento', label: 'Atendimento', types: ['consultas', 'evolucoes'] },
  { id: 'orcamentos', label: 'Orçamentos', types: ['orcamentos'] },
  { id: 'contratos', label: 'Contratos', types: ['contratos'] },
  { id: 'financeiro', label: 'Financeiro', types: ['financeiro'] },
  { id: 'exames', label: 'Exames', types: ['exames'] },
  { id: 'documentos', label: 'Documentos', types: ['documentos'] },
  { id: 'receitas', label: 'Receitas', types: ['receitas'] },
  { id: 'atestados', label: 'Atestados', types: ['atestados'] },
  { id: 'mensagens', label: 'Mensagens', types: ['mensagens'] },
];

/** @deprecated use CARE_INTELLIGENCE_FILTERS */
export const CARE_CENTRAL_TIMELINE_FILTERS = CARE_INTELLIGENCE_FILTERS.filter(
  (f) => !['receitas', 'atestados', 'mensagens'].includes(f.id),
);

const TYPE_TO_CATEGORY_KEY = {
  consultas: 'atendimento',
  evolucoes: 'clinico',
  orcamentos: 'orcamento',
  contratos: 'contrato',
  financeiro: 'financeiro',
  exames: 'exame',
  documentos: 'documento',
  receitas: 'receita',
  atestados: 'atestado',
  mensagens: 'whatsapp',
};

const CATEGORY_LABELS = {
  consultas: 'Consulta',
  orcamentos: 'Orçamento',
  contratos: 'Contrato',
  financeiro: 'Financeiro',
  exames: 'Exame',
  evolucoes: 'Evolução clínica',
  documentos: 'Documento',
};

const APPOINTMENT_STATUS_LABELS = {
  [APPOINTMENT_STATUS.AGENDADO]: 'Agendado',
  [APPOINTMENT_STATUS.CONFIRMADO]: 'Confirmado',
  [APPOINTMENT_STATUS.EM_CONFIRMACAO]: 'Em confirmação',
  [APPOINTMENT_STATUS.CHEGOU]: 'Paciente chegou',
  [APPOINTMENT_STATUS.EM_ESPERA]: 'Em espera',
  [APPOINTMENT_STATUS.CHAMADO]: 'Chamado',
  [APPOINTMENT_STATUS.EM_ATENDIMENTO]: 'Em atendimento',
  [APPOINTMENT_STATUS.FINALIZADO]: 'Finalizado',
  [APPOINTMENT_STATUS.ATENDIDO]: 'Atendido',
  [APPOINTMENT_STATUS.CANCELADO]: 'Cancelado',
  [APPOINTMENT_STATUS.FALTOU]: 'Faltou',
  [APPOINTMENT_STATUS.REAGENDAR]: 'Reagendar',
};

const BUDGET_STATUS_LABELS = {
  [BUDGET_STATUS.RASCUNHO]: 'Em elaboração',
  [BUDGET_STATUS.ENVIADO]: 'Enviado',
  [BUDGET_STATUS.NEGOCIACAO]: 'Em negociação',
  [BUDGET_STATUS.APROVADO]: 'Aprovado',
  [BUDGET_STATUS.CONTRATO_GERADO]: 'Contrato gerado',
  [BUDGET_STATUS.HISTORICO]: 'Histórico',
  [BUDGET_STATUS.REPROVADO]: 'Reprovado',
  [BUDGET_STATUS.CANCELADO]: 'Cancelado',
  DRAFT: 'Em elaboração',
  APPROVED: 'Aprovado',
  CANCELLED: 'Cancelado',
  SENT: 'Enviado',
  GENERATED: 'Gerado',
  HISTORICO: 'Histórico',
  RASCUNHO: 'Em elaboração',
};

const CLINICAL_EVENT_MAP = {
  budget_generated: {
    title: 'Orçamento criado',
    category: 'orcamentos',
    buildDescription: (ctx) => [
      `${ctx.budgetLabel} criado para este paciente.`,
      ctx.value != null ? `Valor: ${formatCurrencyBRL(ctx.value)}` : null,
      ctx.statusLabel ? `Status: ${ctx.statusLabel}` : null,
    ],
    actions: [{ key: 'budget', label: 'Ver orçamento' }],
  },
  budget_new_version_created: {
    title: 'Nova versão do orçamento criada',
    category: 'orcamentos',
    buildFields: (ctx, pro) => [
      { label: 'Orçamento', value: ctx.budgetLabel },
      ...(ctx.value != null ? [{ label: 'Valor', value: formatCurrencyBRL(ctx.value) }] : []),
      ...(pro ? [{ label: 'Criado por', value: pro }] : []),
    ],
    actions: [
      { key: 'budget', label: 'Ver orçamento' },
      { key: 'budget_print', label: 'Imprimir' },
      { key: 'open', label: 'Abrir atendimento' },
    ],
  },
  budget_sent: {
    title: 'Orçamento apresentado ao paciente',
    category: 'orcamentos',
    buildDescription: (ctx) => [
      `${ctx.budgetLabel} apresentado ao paciente.`,
      ctx.value != null ? `Valor: ${formatCurrencyBRL(ctx.value)}` : null,
    ],
    actions: [{ key: 'budget', label: 'Ver orçamento' }, { key: 'budget_print', label: 'Imprimir' }],
  },
  budget_approved: {
    title: 'Orçamento aprovado',
    category: 'orcamentos',
    buildDescription: (ctx) => [
      `${ctx.budgetLabel} aprovado pelo paciente.`,
      ctx.value != null ? `Valor: ${formatCurrencyBRL(ctx.value)}` : null,
    ],
    actions: [{ key: 'budget', label: 'Ver orçamento' }],
  },
  budget_rejected: {
    title: 'Orçamento reprovado',
    category: 'orcamentos',
    buildDescription: (ctx) => [`${ctx.budgetLabel} reprovado pelo paciente.`],
    actions: [{ key: 'budget', label: 'Ver orçamento' }],
  },
  budget_payment_presented: {
    title: 'Opções de pagamento apresentadas',
    category: 'orcamentos',
    buildDescription: (ctx) => [`Formas de pagamento apresentadas para ${ctx.budgetLabel}.`],
    actions: [{ key: 'budget', label: 'Ver orçamento' }],
  },
  budget_payment_chosen: {
    title: 'Forma de pagamento escolhida',
    category: 'orcamentos',
    buildDescription: (ctx) => [`Paciente escolheu forma de pagamento para ${ctx.budgetLabel}.`],
    actions: [{ key: 'budget', label: 'Ver orçamento' }],
  },
  budget_contract_generated: {
    title: 'Contrato gerado',
    category: 'contratos',
    buildDescription: (ctx) => [
      `Contrato gerado a partir de ${ctx.budgetLabel}.`,
      ctx.planName ? `Plano: ${ctx.planName}` : null,
    ],
    actions: [{ key: 'contract', label: 'Ver contrato' }, { key: 'contract_pdf', label: 'Baixar PDF' }],
  },
  budget_procedures_imported: {
    title: 'Procedimentos importados',
    category: 'orcamentos',
    buildDescription: (ctx) => [
      `Procedimentos importados de orçamento anterior para ${ctx.budgetLabel}.`,
    ],
    actions: [{ key: 'budget', label: 'Ver orçamento' }],
  },
  budget_status_changed: {
    title: 'Status do orçamento alterado',
    category: 'orcamentos',
    buildDescription: (ctx) => [
      `${ctx.budgetLabel}: status alterado para ${ctx.statusLabel || 'atualizado'}.`,
    ],
    actions: [{ key: 'budget', label: 'Ver orçamento' }],
  },
  contract_canceled: {
    title: 'Contrato cancelado',
    category: 'contratos',
    buildDescription: (ctx) => [
      ctx.contractLabel ? `${ctx.contractLabel} cancelado.` : 'Contrato cancelado.',
      ctx.reason ? `Motivo: ${ctx.reason}` : null,
    ],
    actions: [{ key: 'contract', label: 'Ver contrato' }],
  },
  evolution_saved: {
    title: 'Evolução clínica registrada',
    category: 'evolucoes',
    buildDescription: (ctx) => [ctx.content || 'Nova evolução clínica registrada no prontuário.'],
    actions: [{ key: 'chart', label: 'Ver prontuário' }],
  },
  evolution_edited: {
    title: 'Evolução clínica editada',
    category: 'evolucoes',
    buildDescription: () => ['Evolução clínica atualizada no prontuário.'],
    actions: [{ key: 'chart', label: 'Ver prontuário' }],
  },
  procedure_planned: {
    title: 'Procedimento planejado',
    category: 'evolucoes',
    buildDescription: (ctx) => [
      ctx.procedureName ? `Procedimento "${ctx.procedureName}" adicionado ao planejamento.` : 'Procedimento adicionado ao planejamento.',
    ],
    actions: [{ key: 'open', label: 'Abrir atendimento' }],
  },
  procedure_added: {
    title: 'Procedimento adicionado',
    category: 'evolucoes',
    buildDescription: (ctx) => [
      ctx.procedureName ? `Procedimento "${ctx.procedureName}" registrado.` : 'Procedimento registrado no atendimento.',
    ],
    actions: [{ key: 'open', label: 'Abrir atendimento' }],
  },
  appointment_finished: {
    title: 'Atendimento encerrado',
    category: 'consultas',
    buildDescription: (ctx) => [
      'Atendimento encerrado.',
      ctx.reason ? `Motivo: ${ctx.reason}` : null,
      ctx.content ? `Obs.: ${ctx.content}` : null,
      ctx.budgetLabel && ctx.statusLabel ? `${ctx.budgetLabel} permanece em ${ctx.statusLabel}.` : null,
    ],
    buildFields: (ctx, professionalName) => [
      { label: 'Motivo', value: ctx.reason || '—' },
      { label: 'Profissional', value: professionalName || '—' },
      ctx.budgetLabel ? { label: 'Orçamento', value: ctx.budgetLabel } : null,
    ].filter(Boolean),
    actions: [{ key: 'budget', label: 'Abrir orçamento' }],
  },
};

const HIDDEN_CLINICAL_EVENT_TYPES = new Set(['budget_updated']);

export function formatBudgetStatusLabel(status) {
  if (!status) return 'Em elaboração';
  return BUDGET_STATUS_LABELS[status] || BUDGET_STATUS_LABELS[String(status).toUpperCase()] || 'Em elaboração';
}

function formatContractStatusLabel(status) {
  if (!status) return '—';
  return CONTRACT_STATUS_LABELS[status] || String(status);
}

function buildBudgetNumberMap(patientId) {
  const budgets = [...listPatientBudgetHistory(patientId)].sort(
    (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0),
  );
  const map = new Map();
  budgets.forEach((budget, index) => {
    map.set(budget.id, formatFriendlyBudgetNumber(budget.budgetNumber, index + 1));
  });
  return map;
}

function buildContractNumberMap(patientId) {
  const contracts = [...listPatientContracts(patientId)].sort(
    (a, b) => new Date(a.generatedAt || a.createdAt || 0) - new Date(b.createdAt || 0),
  );
  const map = new Map();
  contracts.forEach((contract, index) => {
    map.set(contract.id, formatFriendlyContractNumber(contract.contractNumber, index + 1));
  });
  return map;
}

function resolveProfessionalName(userId, db) {
  if (!userId) return null;
  const user = (db.users || []).find((u) => u.id === userId);
  if (user?.name || user?.full_name) return user.name || user.full_name;
  const collab = (db.collaborators || []).find((c) => c.id === userId || c.userId === userId);
  return collab?.nomeCompleto || collab?.name || null;
}

function joinDescription(lines) {
  return lines.filter(Boolean).join('\n');
}

function createTimelineItem({
  id,
  type,
  timestamp,
  date,
  categoryLabel,
  categoryKey,
  title,
  description,
  fields = [],
  professionalName = null,
  actions = [],
  meta = {},
}) {
  const key = categoryKey || TYPE_TO_CATEGORY_KEY[type] || 'documento';
  const normalizedFields = fields.length ? fields : descriptionToFields(description, professionalName);
  return {
    id,
    type,
    categoryKey: key,
    timestamp: timestamp || date,
    date: date || timestamp,
    categoryLabel: categoryLabel || CATEGORY_LABELS[type] || 'Registro',
    title,
    description: description || fieldsToDescription(normalizedFields),
    summary: description || fieldsToDescription(normalizedFields),
    fields: normalizedFields,
    professionalName: professionalName || '—',
    actions,
    ...meta,
  };
}

function fieldsToDescription(fields) {
  return (fields || []).map((f) => `${f.label}: ${f.value}`).join('\n');
}

function descriptionToFields(description, professionalName) {
  const fields = [];
  if (description) {
    for (const line of String(description).split('\n')) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        fields.push({ label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() });
      } else if (line.trim()) {
        fields.push({ label: 'Detalhe', value: line.trim() });
      }
    }
  }
  if (professionalName && professionalName !== '—' && !fields.some((f) => /criado por|profissional|dentista|registrado por/i.test(f.label))) {
    fields.push({ label: 'Profissional', value: professionalName });
  }
  return fields;
}

function enrichTimelineEvent(event) {
  return createTimelineItem({
    id: event.id,
    type: event.type,
    timestamp: event.timestamp,
    date: event.date,
    categoryLabel: event.categoryLabel,
    categoryKey: event.categoryKey || TYPE_TO_CATEGORY_KEY[event.type],
    title: event.title,
    description: event.description,
    fields: event.fields,
    professionalName: event.professionalName,
    actions: event.actions,
    meta: {
      appointmentId: event.appointmentId,
      budgetId: event.budgetId,
      contractId: event.contractId,
      fileId: event.fileId,
      receivableId: event.receivableId,
      financingId: event.financingId,
    },
  });
}

function mapClinicalEvent(evt, ctx) {
  if (HIDDEN_CLINICAL_EVENT_TYPES.has(evt.type)) return null;

  const config = CLINICAL_EVENT_MAP[evt.type];
  if (!config) return null;

  const data = evt.data || {};
  let budgetId = data.budgetId || data.budget_id;
  if (!budgetId && evt.appointmentId) {
    const clinical = (ctx.db.clinicalAppointments || []).find(
      (row) => row.appointmentId === evt.appointmentId,
    );
    budgetId = clinical?.budget?.id
      || clinical?.budgetHistory?.[clinical.budgetHistory.length - 1]?.id
      || null;
  }
  const budgetLabel = data.budgetNumber && !isTechnicalId(data.budgetNumber)
    ? data.budgetNumber
    : (budgetId ? ctx.budgetNumberMap.get(budgetId) : null) || 'Orçamento';

  const eventCtx = {
    budgetLabel,
    budgetId,
    value: data.totalValue ?? data.value ?? null,
    statusLabel: formatBudgetStatusLabel(data.status || data.newStatus),
    planName: data.planName || null,
    contractLabel: data.contractNumber
      ? formatFriendlyContractNumber(data.contractNumber, 1)
      : 'Contrato',
    reason: data.reasonLabel || data.reason || data.cancelReason || null,
    procedureName: data.procedureName || data.name || null,
    content: data.notes
      ? String(data.notes).slice(0, 160)
      : (data.content ? String(data.content).slice(0, 160) : null),
  };

  const professionalName = resolveProfessionalName(evt.userId, ctx.db);
  const description = joinDescription(config.buildDescription?.(eventCtx) || []);
  const fields = config.buildFields?.(eventCtx, professionalName)
    || descriptionToFields(description, professionalName);

  return createTimelineItem({
    id: `evt-${evt.id}`,
    type: config.category,
    timestamp: evt.timestamp,
    categoryLabel: CATEGORY_LABELS[config.category],
    title: config.title,
    description,
    professionalName,
    actions: config.actions,
    meta: {
      appointmentId: evt.appointmentId,
      budgetId,
      budgetNumber: budgetLabel,
      contractId: data.contractId,
    },
  });
}

function mapBudgetHistoryItem(budget, ctx) {
  const budgetLabel = ctx.budgetNumberMap.get(budget.id) || formatFriendlyBudgetNumber(budget.budgetNumber, 1);
  const statusLabel = formatBudgetStatusLabel(budget.status);

  const titleByStatus = {
    [BUDGET_STATUS.APROVADO]: 'Orçamento aprovado',
    [BUDGET_STATUS.CONTRATO_GERADO]: 'Contrato gerado a partir do orçamento',
    [BUDGET_STATUS.ENVIADO]: 'Orçamento enviado',
    [BUDGET_STATUS.HISTORICO]: 'Orçamento arquivado',
    [BUDGET_STATUS.REPROVADO]: 'Orçamento reprovado',
    [BUDGET_STATUS.CANCELADO]: 'Orçamento cancelado',
    [BUDGET_STATUS.NEGOCIACAO]: 'Orçamento em negociação',
  };

  const title = titleByStatus[budget.status] || 'Orçamento criado';
  const description = joinDescription([
    `${budgetLabel} ${budget.status === BUDGET_STATUS.HISTORICO ? 'movido para histórico' : 'registrado para este paciente'}.`,
    budget.planName ? `Plano: ${budget.planName}` : null,
    `Valor: ${formatCurrencyBRL(budget.totalValue || 0)}`,
    `Status: ${statusLabel}`,
  ]);

  const actions = [{ key: 'budget', label: 'Ver orçamento' }];
  if (budget.contractId) actions.push({ key: 'contract', label: 'Ver contrato' });
  if (budget.status === BUDGET_STATUS.APROVADO || budget.status === BUDGET_STATUS.ENVIADO) {
    actions.push({ key: 'budget_print', label: 'Imprimir' });
  }

  return createTimelineItem({
    id: `budget-${budget.id}-${budget.status}`,
    type: 'orcamentos',
    timestamp: budget.archivedAt || budget.createdAt,
    categoryLabel: 'Orçamento',
    title,
    fields: [
      { label: 'Orçamento', value: budgetLabel },
      { label: 'Valor', value: formatCurrencyBRL(budget.totalValue || 0) },
      { label: 'Status', value: statusLabel },
      ...(budget.planName ? [{ label: 'Plano', value: budget.planName }] : []),
    ],
    actions,
    meta: {
      appointmentId: budget.appointmentId,
      budgetId: budget.id,
      budgetNumber: budgetLabel,
      contractId: budget.contractId,
    },
  });
}

function mapAppointmentItem(apt, ctx) {
  const pro = (ctx.db.collaborators || []).find((c) => c.id === apt.professionalId);
  const statusLabel = APPOINTMENT_STATUS_LABELS[apt.status] || 'Consulta';
  const isActive = apt.status === APPOINTMENT_STATUS.EM_ATENDIMENTO;
  const isFinished = [APPOINTMENT_STATUS.FINALIZADO, APPOINTMENT_STATUS.ATENDIDO].includes(apt.status);

  let title = 'Consulta agendada';
  if (isActive) title = 'Atendimento em andamento';
  else if (isFinished) title = 'Atendimento finalizado';

  const description = joinDescription([
    apt.procedureName || 'Consulta odontológica',
    apt.date ? `Data: ${new Date(`${apt.date}T12:00:00`).toLocaleDateString('pt-BR')}` : null,
    `Status: ${statusLabel}`,
  ]);

  return createTimelineItem({
    id: `apt-${apt.id}-${apt.status}`,
    type: 'consultas',
    timestamp: apt.finishedAt || apt.startedAt || apt.calledAt || apt.checkInAt || apt.createdAt || apt.date,
    date: apt.date,
    categoryLabel: 'Consulta',
    title,
    description,
    professionalName: pro?.nomeCompleto || pro?.name || null,
    actions: isActive
      ? [{ key: 'open', label: 'Abrir atendimento' }]
      : [{ key: 'chart', label: 'Ver prontuário' }],
    meta: { appointmentId: apt.id },
  });
}

function mapContractItem(contract, ctx) {
  const contractLabel = ctx.contractNumberMap.get(contract.id)
    || formatFriendlyContractNumber(contract.contractNumber, 1);
  const statusLabel = formatContractStatusLabel(contract.status);

  return createTimelineItem({
    id: `contract-${contract.id}`,
    type: 'contratos',
    timestamp: contract.signedAt || contract.generatedAt || contract.createdAt,
    categoryLabel: 'Contrato',
    title: contract.signedAt ? 'Contrato assinado' : 'Contrato gerado',
    fields: [
      { label: 'Contrato', value: contractLabel },
      { label: 'Valor', value: formatCurrencyBRL(contract.totalValue || contract.value || 0) },
      ...(contract.title ? [{ label: 'Título', value: contract.title }] : []),
      { label: 'Assinatura', value: contract.signedAt ? 'Assinado' : 'Pendente' },
      { label: 'Status', value: statusLabel },
    ],
    actions: [
      { key: 'contract', label: 'Ver contrato' },
      { key: 'contract_pdf', label: 'Baixar PDF' },
    ],
    meta: {
      appointmentId: contract.quoteId,
      contractId: contract.id,
    },
  });
}

function mapFileItem(file) {
  const name = String(file.file_name || '').toLowerCase();
  const categoryStr = String(file.category || '').toLowerCase();
  let type = 'documentos';
  let categoryKey = 'documento';
  let categoryLabel = 'Documento';
  let title = 'Documento anexado';

  if (/exame|radio|panor|tomograf|foto/i.test(categoryStr || name)) {
    type = 'exames';
    categoryKey = 'exame';
    categoryLabel = 'Exame';
    title = 'Exame anexado';
  } else if (/receita/i.test(categoryStr || name)) {
    type = 'receitas';
    categoryKey = 'receita';
    categoryLabel = 'Receita';
    title = 'Receita emitida';
  } else if (/atestado/i.test(categoryStr || name)) {
    type = 'atestados';
    categoryKey = 'atestado';
    categoryLabel = 'Atestado';
    title = 'Atestado emitido';
  }

  return createTimelineItem({
    id: `file-${file.id}`,
    type,
    categoryKey,
    timestamp: file.uploaded_at,
    categoryLabel,
    title,
    fields: [
      { label: 'Arquivo', value: file.file_name || 'Documento' },
      ...(file.category ? [{ label: 'Categoria', value: file.category }] : []),
    ],
    actions: [{ key: type === 'exames' ? 'exam' : 'file', label: type === 'exames' ? 'Visualizar exame' : 'Visualizar' }],
    meta: { fileId: file.id },
  });
}

function mapEvolutionItem(evo) {
  const content = String(evo.content || '').trim();
  return createTimelineItem({
    id: `evo-${evo.id}`,
    type: 'evolucoes',
    timestamp: evo.createdAt,
    categoryLabel: 'Evolução clínica',
    title: 'Evolução clínica registrada',
    description: content ? content.slice(0, 160) : 'Registro de evolução clínica no prontuário.',
    actions: [{ key: 'chart', label: 'Ver prontuário' }],
    meta: { appointmentId: evo.appointmentId },
  });
}

function normalizeFinancialEvent(event) {
  const summary = event.summary || '';
  const fields = [];
  const parts = summary.split(' — ');
  if (parts.length >= 2) {
    fields.push({ label: 'Descrição', value: parts[0] });
    fields.push({ label: 'Valor', value: parts[parts.length - 1].includes('R$') ? parts[parts.length - 1] : summary });
  } else if (summary.includes('R$')) {
    fields.push({ label: 'Valor', value: summary });
  } else {
    fields.push({ label: 'Detalhe', value: summary || event.title });
  }

  return createTimelineItem({
    id: event.id,
    type: 'financeiro',
    categoryKey: 'financeiro',
    timestamp: event.timestamp || event.date,
    date: event.date,
    categoryLabel: 'Financeiro',
    title: event.title,
    fields,
    actions: event.actions?.length
      ? event.actions
      : [{ key: 'finance', label: 'Ver financeiro' }],
    meta: {
      receivableId: event.receivableId,
      financingId: event.financingId,
      contractId: event.contractId,
    },
  });
}

function dedupeTimelineEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    const key = `${event.type}|${event.title}|${event.timestamp}|${event.description?.slice(0, 40)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildHumanPatientTimeline(patientId, appointmentId) {
  if (!patientId) return [];

  const db = loadDb();
  const ctx = {
    db,
    budgetNumberMap: buildBudgetNumberMap(patientId),
    contractNumberMap: buildContractNumberMap(patientId),
  };

  const events = [];
  const apptIds = new Set(
    (db.appointments || []).filter((a) => a.patientId === patientId).map((a) => a.id),
  );

  for (const apt of db.appointments || []) {
    if (apt.patientId !== patientId) continue;
    events.push(mapAppointmentItem(apt, ctx));
  }

  const budgets = listPatientBudgetHistory(patientId);
  const significantBudgetStatuses = new Set([
    BUDGET_STATUS.APROVADO,
    BUDGET_STATUS.CONTRATO_GERADO,
    BUDGET_STATUS.ENVIADO,
    BUDGET_STATUS.HISTORICO,
    BUDGET_STATUS.REPROVADO,
    BUDGET_STATUS.CANCELADO,
  ]);

  for (const budget of budgets) {
    if (budget.status === BUDGET_STATUS.RASCUNHO) {
      const hasCreationEvent = (db.clinicalEvents || []).some(
        (e) => apptIds.has(e.appointmentId)
          && ['budget_generated', 'budget_new_version_created'].includes(e.type)
          && (e.data?.budgetId === budget.id),
      );
      if (hasCreationEvent) continue;
    }
    if (budget.status === BUDGET_STATUS.RASCUNHO || significantBudgetStatuses.has(budget.status)) {
      events.push(mapBudgetHistoryItem(budget, ctx));
    }
  }

  for (const contract of listPatientContracts(patientId)) {
    events.push(mapContractItem(contract, ctx));
  }

  for (const finEvent of buildPatientFinancialTimelineEvents(patientId)) {
    events.push(normalizeFinancialEvent(finEvent));
  }

  for (const file of listFiles(patientId)) {
    events.push(mapFileItem(file));
  }

  for (const evo of listClinicalEvolutions(patientId, null, 50)) {
    events.push(mapEvolutionItem(evo));
  }

  for (const evt of db.clinicalEvents || []) {
    if (!apptIds.has(evt.appointmentId)) continue;
    const mapped = mapClinicalEvent(evt, ctx);
    if (mapped) events.push(mapped);
  }

  return dedupeTimelineEvents(events)
    .map(enrichTimelineEvent)
    .sort(
      (a, b) => new Date(b.timestamp || b.date || 0) - new Date(a.timestamp || a.date || 0),
    );
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function groupTimelineByDate(events) {
  const groups = [];
  const map = new Map();
  for (const event of events) {
    const raw = event.timestamp || event.date;
    const dateKey = raw ? String(raw).slice(0, 10) : 'unknown';
    if (!map.has(dateKey)) {
      const group = {
        dateKey,
        label: formatDateGroupLabel(dateKey),
        events: [],
      };
      map.set(dateKey, group);
      groups.push(group);
    }
    map.get(dateKey).events.push(event);
  }
  return groups;
}

function formatDateGroupLabel(dateKey) {
  if (dateKey === 'unknown') return 'Sem data';
  const today = todayIso();
  const yesterday = new Date(`${today}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);
  const formatted = new Date(`${dateKey}T12:00:00`).toLocaleDateString('pt-BR');
  if (dateKey === today) return `Hoje — ${formatted}`;
  if (dateKey === yesterdayKey) return `Ontem — ${formatted}`;
  return formatted;
}

export function filterTimelineEvents(events, filterId) {
  if (!filterId || filterId === 'all') return events;
  const config = CARE_INTELLIGENCE_FILTERS.find((f) => f.id === filterId);
  if (!config?.types) return events;
  return events.filter((e) => config.types.includes(e.type));
}

export function formatTimelineDisplayDate(timestamp, date) {
  const raw = timestamp || date;
  if (!raw) return '—';
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) {
    try {
      return new Date(`${String(raw).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
    } catch {
      return '—';
    }
  }
  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
