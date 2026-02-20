/**
 * Serviços de relatórios Comercial/CRM.
 * Usa crmLeads, crmLeadEvents, crmTasks, crmBudgetLinks, appointments.
 */

import { loadDb } from '../db/index.js';
import { listLeads, listLeadEvents, CRM_EVENT_TYPE } from './crmService.js';
import { listTasks, getTaskSummary, TASK_STATUS } from './crmTaskService.js';
import { getPipelineStages } from './crmService.js';

const DEFAULT_CLINIC_ID = 'clinic-1';

function getClinicId() {
  const db = loadDb();
  return db?.clinicProfile?.id || DEFAULT_CLINIC_ID;
}

/**
 * Resolve range para { startDate, endDate } ISO
 */
function resolveRange(range, customStart, customEnd) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  let start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (range === '7d') {
    start.setDate(start.getDate() - 7);
  } else if (range === '30d') {
    start.setDate(start.getDate() - 30);
  } else if (range === 'current_month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (range === 'custom' && customStart && customEnd) {
    start = new Date(customStart);
    const end = new Date(customEnd);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  } else {
    start.setDate(start.getDate() - 30);
  }

  return {
    startDate: start.toISOString(),
    endDate: now.toISOString(),
  };
}

function inRange(iso, startDate, endDate) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= new Date(startDate).getTime() && t <= new Date(endDate).getTime();
}

function getFirstContactEvent(events) {
  const contactTypes = [
    CRM_EVENT_TYPE.CONTACT,
    CRM_EVENT_TYPE.MESSAGE_SENT,
    CRM_EVENT_TYPE.STATUS_CHANGE,
  ];
  const sorted = [...events].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return sorted.find((e) => contactTypes.includes(e.type));
}

/**
 * @param {Object} opts
 * @param {string} [opts.clinicId]
 * @param {string} [opts.range] - '7d' | '30d' | 'current_month' | 'custom'
 * @param {string} [opts.customStart]
 * @param {string} [opts.customEnd]
 * @param {string} [opts.channel] - source filter
 * @param {string} [opts.ownerId] - assignedToUserId filter
 */
export function getCrmKpis(opts = {}) {
  getClinicId(); // reservado para filtro multi-clínica
  const { startDate, endDate } = resolveRange(opts.range, opts.customStart, opts.customEnd);
  const db = loadDb();
  const allLeads = listLeads();
  const leads = allLeads.filter((l) => {
    if (opts.channel && l.source !== opts.channel) return false;
    if (opts.ownerId && l.assignedToUserId !== opts.ownerId) return false;
    return inRange(l.createdAt, startDate, endDate);
  });

  const leadsInPeriod = leads.length;
  const activeStages = ['novo_lead', 'contato_realizado', 'avaliacao_agendada', 'avaliacao_realizada', 'orcamento_apresentado', 'em_negociacao'];
  const leadsAtivos = leads.filter((l) => activeStages.includes(l.stageKey || '')).length;
  const avaliacoesAgendadas = leads.filter((l) => l.stageKey === 'avaliacao_agendada').length;
  const avaliacoesRealizadas = leads.filter((l) => l.stageKey === 'avaliacao_realizada').length;

  const budgetLinks = db.crmBudgetLinks || [];
  const stagesComOrcamento = ['orcamento_apresentado', 'em_negociacao', 'aprovado', 'em_tratamento', 'finalizado'];
  const orcamentosEnviados = leads.filter(
    (l) =>
      stagesComOrcamento.includes(l.stageKey || '') ||
      budgetLinks.some((b) => b.leadId === l.id)
  ).length;

  const fechadosStages = ['aprovado', 'em_tratamento', 'finalizado'];
  const fechados = leads.filter((l) => fechadosStages.includes(l.stageKey || '') || l.patientId).length;
  const taxaConversao = leadsInPeriod ? Math.round((fechados / leadsInPeriod) * 100) : 0;

  let tempoMedioPrimeiroContato = 0;
  const tempos = [];
  const eventsByLead = {};
  (db.crmLeadEvents || []).forEach((e) => {
    if (!eventsByLead[e.leadId]) eventsByLead[e.leadId] = [];
    eventsByLead[e.leadId].push(e);
  });
  leads.forEach((l) => {
    const firstContact = getFirstContactEvent(eventsByLead[l.id] || []);
    if (firstContact) {
      const created = new Date(l.createdAt).getTime();
      const contact = new Date(firstContact.createdAt).getTime();
      tempos.push((contact - created) / (60 * 60 * 1000));
    }
  });
  let hasTempoMedioPrimeiroContatoData = false;
  if (tempos.length) {
    tempoMedioPrimeiroContato = Math.round((tempos.reduce((a, b) => a + b, 0) / tempos.length) * 10) / 10;
    hasTempoMedioPrimeiroContatoData = true;
  }

  const taskSummary = getTaskSummary();
  const followUpsAtrasados = taskSummary.atrasados;

  return {
    leadsNoPeriodo: leadsInPeriod,
    leadsAtivos,
    avaliacoesAgendadas,
    avaliacoesRealizadas,
    orcamentosEnviados,
    fechadosGanhos: fechados,
    taxaConversaoGeral: taxaConversao,
    tempoMedioPrimeiroContato,
    hasTempoMedioPrimeiroContatoData,
    followUpsAtrasados,
  };
}

/** Ordem fixa do funil (obrigatório) */
const FUNNEL_STAGE_ORDER = [
  'novo_lead',
  'contato_realizado',
  'avaliacao_agendada',
  'avaliacao_realizada',
  'orcamento_apresentado',
  'em_negociacao',
  'aprovado',
  'em_tratamento',
  'finalizado',
  'perdido',
];

/**
 * Retorna funil real com totalEtapa, conversaoEtapa, conversaoAcumulada.
 * @param {Object} opts
 */
export function getCrmFunnel(opts = {}) {
  getClinicId(); // reservado para filtro multi-clínica
  const { startDate, endDate } = resolveRange(opts.range, opts.customStart, opts.customEnd);
  const allLeads = listLeads();
  const leads = allLeads.filter((l) => {
    if (opts.channel && l.source !== opts.channel) return false;
    if (opts.ownerId && l.assignedToUserId !== opts.ownerId) return false;
    return inRange(l.createdAt, startDate, endDate);
  });

  const stages = getPipelineStages();
  const stageMap = Object.fromEntries(stages.map((s) => [s.key, s]));

  const funnelSteps = FUNNEL_STAGE_ORDER.map((key, i) => {
    const stage = stageMap[key] || { key, label: key, color: '#94a3b8' };
    const totalEtapa = leads.filter((l) => l.stageKey === key).length;
    return {
      stageKey: key,
      label: stage.label,
      totalEtapa,
      color: stage.color || '#6366f1',
      order: i + 1,
    };
  });

  const totalPrimeira = funnelSteps[0]?.totalEtapa ?? 0;

  funnelSteps.forEach((step, i) => {
    const totalAnterior = i > 0 ? funnelSteps[i - 1].totalEtapa : step.totalEtapa;
    step.conversaoEtapa =
      i === 0
        ? 100
        : totalAnterior > 0
          ? Math.round((step.totalEtapa / totalAnterior) * 1000) / 10
          : 0;
    step.conversaoAcumulada =
      totalPrimeira > 0 ? Math.round((step.totalEtapa / totalPrimeira) * 1000) / 10 : 0;
  });

  let maiorQuedaIndex = -1;
  let menorConversao = 100;
  for (let i = 1; i < funnelSteps.length; i++) {
    const conv = funnelSteps[i].conversaoEtapa;
    if (conv < menorConversao && conv < 100) {
      menorConversao = conv;
      maiorQuedaIndex = i;
    }
  }

  const conversionMatrix = [];
  for (let i = 0; i < funnelSteps.length - 1; i++) {
    const from = funnelSteps[i];
    const to = funnelSteps[i + 1];
    const rate = from.totalEtapa > 0 ? Math.round((to.totalEtapa / from.totalEtapa) * 1000) / 10 : 0;
    conversionMatrix.push({
      from: from.stageKey,
      fromLabel: from.label,
      to: to.stageKey,
      toLabel: to.label,
      fromCount: from.totalEtapa,
      toCount: to.totalEtapa,
      rate,
    });
  }

  return {
    funnelSteps,
    conversionMatrix,
    total: leads.length,
    totalPrimeira,
    maiorQuedaIndex,
    maiorQuedaStage: maiorQuedaIndex >= 0 ? funnelSteps[maiorQuedaIndex] : null,
    leads,
  };
}

/**
 * @param {Object} opts
 */
export function getCrmSpeedMetrics(opts = {}) {
  const { startDate, endDate } = resolveRange(opts.range, opts.customStart, opts.customEnd);
  const db = loadDb();
  const allLeads = listLeads();
  const leads = allLeads.filter((l) => inRange(l.createdAt, startDate, endDate));

  const eventsByLead = {};
  (db.crmLeadEvents || []).forEach((e) => {
    if (!eventsByLead[e.leadId]) eventsByLead[e.leadId] = [];
    eventsByLead[e.leadId].push(e);
  });

  let tempoMedioPrimeiroContato = 0;
  const temposPrimeiroContato = [];
  leads.forEach((l) => {
    const first = getFirstContactEvent(eventsByLead[l.id] || []);
    if (first) {
      temposPrimeiroContato.push(
        (new Date(first.createdAt) - new Date(l.createdAt)) / (60 * 60 * 1000)
      );
    }
  });
  let hasTempoMedioPrimeiroContatoData = false;
  if (temposPrimeiroContato.length) {
    tempoMedioPrimeiroContato =
      Math.round(
        (temposPrimeiroContato.reduce((a, b) => a + b, 0) / temposPrimeiroContato.length) * 10
      ) / 10;
    hasTempoMedioPrimeiroContatoData = true;
  }

  const stageDurations = {};
  const stages = getPipelineStages();
  stages.forEach((s) => {
    stageDurations[s.key] = { totalHours: 0, count: 0 };
  });

  leads.forEach((l) => {
    const evs = (eventsByLead[l.id] || [])
      .filter((e) => e.type === CRM_EVENT_TYPE.STATUS_CHANGE)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    for (let i = 0; i < evs.length; i++) {
      const toStage = evs[i].data?.toStage;
      if (!toStage || !stageDurations[toStage]) continue;
      const enter = new Date(evs[i].createdAt).getTime();
      const exit = i + 1 < evs.length
        ? new Date(evs[i + 1].createdAt).getTime()
        : Date.now();
      stageDurations[toStage].totalHours += (exit - enter) / (60 * 60 * 1000);
      stageDurations[toStage].count += 1;
    }
  });

  const tempoMedioPorEtapa = stages.map((s) => ({
    stageKey: s.key,
    label: s.label,
    mediaHoras: stageDurations[s.key]?.count
      ? Math.round((stageDurations[s.key].totalHours / stageDurations[s.key].count) * 10) / 10
      : 0,
    count: stageDurations[s.key]?.count || 0,
  }));

  const now = Date.now();
  const diasSemEvento = (dias) => {
    const cutoff = now - dias * 24 * 60 * 60 * 1000;
    return leads.filter((l) => {
      const lastEv = (eventsByLead[l.id] || []).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      )[0];
      const lastUpdate = lastEv ? new Date(lastEv.createdAt).getTime() : new Date(l.updatedAt || l.createdAt).getTime();
      return lastUpdate < cutoff && activeStages.includes(l.stageKey || '');
    });
  };

  const activeStages = ['novo_lead', 'contato_realizado', 'avaliacao_agendada', 'avaliacao_realizada', 'orcamento_apresentado', 'em_negociacao'];
  const leadsParados3 = diasSemEvento(3);
  const leadsParados7 = diasSemEvento(7);
  const leadsParados14 = diasSemEvento(14);

  return {
    tempoMedioPrimeiroContato,
    hasTempoMedioPrimeiroContatoData,
    tempoMedioPorEtapa,
    leadsParados: { 3: leadsParados3, 7: leadsParados7, 14: leadsParados14 },
  };
}

/**
 * @param {Object} opts
 */
export function getCrmFollowupMetrics(opts = {}) {
  const taskSummary = getTaskSummary();
  const db = loadDb();
  const allLeads = listLeads();
  const activeStages = ['novo_lead', 'contato_realizado', 'avaliacao_agendada', 'avaliacao_realizada', 'orcamento_apresentado', 'em_negociacao'];
  const leadsAtivos = allLeads.filter((l) => activeStages.includes(l.stageKey || ''));
  const pendingTasks = listTasks({ status: TASK_STATUS.PENDING });
  const leadIdsComTask = new Set(pendingTasks.filter((t) => t.leadId).map((t) => t.leadId));
  const leadsSemFollowUp = leadsAtivos.filter((l) => !leadIdsComTask.has(l.id));

  return {
    atrasados: taskSummary.atrasados,
    hoje: taskSummary.hoje,
    proximos7: taskSummary.proximos7,
    orcamentosPendentes: taskSummary.orcamentosPendentes,
    leadsSemFollowUp,
  };
}

/**
 * @param {Object} opts
 */
export function getCrmOwnerPerformance(opts = {}) {
  const { startDate, endDate } = resolveRange(opts.range, opts.customStart, opts.customEnd);
  const db = loadDb();
  const allLeads = listLeads();
  const users = db.users || [];
  const collaborators = db.collaborators || [];
  const userMap = {};
  users.forEach((u) => { userMap[u.id] = u.name || u.id; });
  collaborators.forEach((c) => { userMap[c.id] = c.nomeCompleto || c.id; });

  const taskSummary = getTaskSummary();
  const tasks = listTasks({ status: TASK_STATUS.PENDING });
  const overdueByOwner = {};
  tasks.filter((t) => t.assignedTo && new Date(t.dueAt) < new Date()).forEach((t) => {
    overdueByOwner[t.assignedTo] = (overdueByOwner[t.assignedTo] || 0) + 1;
  });

  const eventsByLead = {};
  (db.crmLeadEvents || []).forEach((e) => {
    if (!eventsByLead[e.leadId]) eventsByLead[e.leadId] = [];
    eventsByLead[e.leadId].push(e);
  });

  const ownerIds = new Set();
  allLeads.forEach((l) => {
    if (l.assignedToUserId) ownerIds.add(l.assignedToUserId);
  });

  const performance = [];
  ownerIds.forEach((ownerId) => {
    const leads = allLeads.filter(
      (l) => l.assignedToUserId === ownerId && inRange(l.createdAt, startDate, endDate)
    );
    const fechadosStages = ['aprovado', 'em_tratamento', 'finalizado'];
    const ganhos = leads.filter(
      (l) => fechadosStages.includes(l.stageKey || '') || l.patientId
    ).length;
    let tempo1oContato = 0;
    let hasTempoData = false;
    const tempos = [];
    leads.forEach((l) => {
      const first = getFirstContactEvent(eventsByLead[l.id] || []);
      if (first) {
        tempos.push((new Date(first.createdAt) - new Date(l.createdAt)) / (60 * 60 * 1000));
      }
    });
    if (tempos.length) {
      tempo1oContato = Math.round((tempos.reduce((a, b) => a + b, 0) / tempos.length) * 10) / 10;
      hasTempoData = true;
    }

    performance.push({
      ownerId,
      ownerName: userMap[ownerId] || ownerId,
      leadsAtribuidos: leads.length,
      ganhos,
      taxaConversao: leads.length ? Math.round((ganhos / leads.length) * 100) : 0,
      tempoMedioPrimeiroContato: tempo1oContato,
      hasTempoMedioData: hasTempoData,
      followUpsAtrasados: overdueByOwner[ownerId] || 0,
    });
  });

  performance.sort((a, b) => {
    if (b.ganhos !== a.ganhos) return b.ganhos - a.ganhos;
    return b.taxaConversao - a.taxaConversao;
  });
  return performance;
}

/**
 * @param {Object} opts
 */
export function getCrmLossMetrics(opts = {}) {
  const { startDate, endDate } = resolveRange(opts.range, opts.customStart, opts.customEnd);
  const db = loadDb();
  const allLeads = listLeads();
  const perdidos = allLeads.filter(
    (l) => l.stageKey === 'perdido' && inRange(l.updatedAt || l.createdAt, startDate, endDate)
  );

  const porMotivo = {};
  perdidos.forEach((l) => {
    const motivo = l.lossReason || 'Não informado';
    porMotivo[motivo] = (porMotivo[motivo] || 0) + 1;
  });

  return {
    totalPerdidos: perdidos.length,
    porMotivo: Object.entries(porMotivo).map(([motivo, count]) => ({ motivo, count })),
    leadsPerdidos: perdidos,
  };
}
