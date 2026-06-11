/**
 * Relatórios executivos Comercial/CRM.
 * Compatível com pipeline personalizado (stageType) e multi-tenant (tenant_id).
 */

import { loadDb, withDb } from '../db/index.js';
import {
  listLeads,
  listLeadEvents,
  listFollowUps,
  CRM_EVENT_TYPE,
  LEAD_INTEREST_LABELS,
  LEAD_SOURCE_LABELS,
} from './crmService.js';
import { listPipelineStagesForTenant, STAGE_TYPE } from './crmPipelineStageService.js';
import { resolveTenantIdForWrite } from './tenantWriteGuard.js';
import { BUDGET_STATUS } from './crmBudgetService.js';
import { listTasks, TASK_STATUS } from './crmTaskService.js';
import {
  getCommercialGoalsSettings,
  saveCommercialGoalsSettings,
} from './crmSettingsService.js';

const RANGE_CUSTOM = 'custom';

const DEFAULT_LOSS_BUCKETS = [
  'Preço',
  'Não respondeu',
  'Sem interesse',
  'Fechou com concorrente',
  'Sem condição financeira',
  'Outro',
];

const TREATMENT_DISPLAY = {
  implante: 'Implante Unitário',
  protese: 'Prótese Flexível',
  estetica: 'Estética / Lentes',
  ortodontia: 'Ortodontia',
  endodontia: 'Endodontia',
  periodontia: 'Periodontia',
  cirurgia: 'Cirurgia / Protocolo',
  geral: 'Clínica Geral',
  outros: 'Outros',
};

// ─── Helpers de período e filtro ─────────────────────────────────────────────

function normalizeRange(range) {
  if (range === 'personalizado' || range === 'customRange' || range === 'dateRange') return RANGE_CUSTOM;
  return range;
}

export function resolveRange(range, customStart, customEnd) {
  const normalizedRange = normalizeRange(range);
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  let start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (normalizedRange === '7d') {
    start.setDate(start.getDate() - 7);
  } else if (normalizedRange === '30d') {
    start.setDate(start.getDate() - 30);
  } else if (normalizedRange === 'current_month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (normalizedRange === RANGE_CUSTOM && customStart && customEnd) {
    start = new Date(customStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(customEnd);
    end.setHours(23, 59, 59, 999);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  } else {
    start.setDate(start.getDate() - 30);
  }
  return { startDate: start.toISOString(), endDate: now.toISOString() };
}

function resolvePreviousRange(startDate, endDate) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const span = end - start;
  return {
    startDate: new Date(start - span).toISOString(),
    endDate: new Date(start - 1).toISOString(),
  };
}

function inRange(iso, startDate, endDate) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= new Date(startDate).getTime() && t <= new Date(endDate).getTime();
}

function leadBelongsToTenant(lead, tenantId) {
  if (!tenantId) return true;
  return lead.tenant_id === tenantId || !lead.tenant_id;
}

function buildStageMeta(tenantId) {
  const stages = listPipelineStagesForTenant(tenantId, { includeInactive: true });
  const byKey = Object.fromEntries(stages.map((s) => [s.key, s]));
  const conversionKeys = new Set(stages.filter((s) => s.stageType === STAGE_TYPE.CONVERSION).map((s) => s.key));
  const lostKeys = new Set(stages.filter((s) => s.stageType === STAGE_TYPE.LOST).map((s) => s.key));
  const activeKeys = new Set(
    stages.filter((s) => s.isActive !== false && s.stageType === STAGE_TYPE.NORMAL).map((s) => s.key)
  );
  const funnelOrder = stages
    .filter((s) => s.isActive !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return { stages, byKey, conversionKeys, lostKeys, activeKeys, funnelOrder };
}

function filterLeads(allLeads, opts, stageMeta, { dateField = 'createdAt' } = {}) {
  const rangeResolved = resolveRange(opts.range, opts.customStart, opts.customEnd);
  const startDate = opts.startDate || rangeResolved.startDate;
  const endDate = opts.endDate || rangeResolved.endDate;
  return allLeads.filter((l) => {
    if (opts.tenantId && !leadBelongsToTenant(l, opts.tenantId)) return false;
    if (opts.channel && l.source !== opts.channel) return false;
    if (opts.ownerId && l.assignedToUserId !== opts.ownerId) return false;
    if (opts.interest && l.interest !== opts.interest) return false;
    if (opts.stageKey && l.stageKey !== opts.stageKey) return false;
    const iso = dateField === 'updatedAt' ? (l.updatedAt || l.createdAt) : l.createdAt;
    return inRange(iso, startDate, endDate);
  });
}

function leadValue(lead, db) {
  if (Number(lead.estimatedValue) > 0) return Number(lead.estimatedValue);
  const approved = (db.crmBudgets || []).filter(
    (b) => b.leadId === lead.id && b.status === BUDGET_STATUS.APROVADO
  );
  if (approved.length) return approved.reduce((s, b) => s + (Number(b.totalValue) || 0), 0);
  return 0;
}

function isConverted(lead, stageMeta) {
  return Boolean(lead.patientId) || stageMeta.conversionKeys.has(lead.stageKey);
}

function isLost(lead, stageMeta) {
  return stageMeta.lostKeys.has(lead.stageKey);
}

function isActive(lead, stageMeta) {
  return !isConverted(lead, stageMeta) && !isLost(lead, stageMeta);
}

function calcDelta(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function categorizeLossReason(reason) {
  const r = String(reason || '').toLowerCase();
  if (!r.trim()) return 'Outro';
  if (r.includes('preço') || r.includes('preco') || r.includes('orçamento') || r.includes('orcamento') || r.includes('caro')) return 'Preço';
  if (r.includes('responde') || r.includes('retorno') || r.includes('sumiu')) return 'Não respondeu';
  if (r.includes('sem interesse') || r.includes('desist')) return 'Sem interesse';
  if (r.includes('concorrent') || r.includes('outra clínica') || r.includes('outra clinica')) return 'Fechou com concorrente';
  if (r.includes('financeir') || r.includes('condição') || r.includes('condicao') || r.includes('crédito')) return 'Sem condição financeira';
  return 'Outro';
}

function getFirstContactEvent(events) {
  const types = [CRM_EVENT_TYPE.CONTACT, CRM_EVENT_TYPE.MESSAGE_SENT, CRM_EVENT_TYPE.STATUS_CHANGE];
  const sorted = [...events].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return sorted.find((e) => types.includes(e.type));
}

function ownerNameMap(db) {
  const map = {};
  (db.users || []).forEach((u) => { map[u.id] = u.name || u.id; });
  (db.collaborators || []).forEach((c) => { map[c.id] = c.nomeCompleto || c.id; });
  return map;
}

function kpiTrend(current, previous) {
  const delta = calcDelta(current, previous);
  return {
    value: current,
    previous,
    delta,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
  };
}

// ─── Metas comerciais (por tenant) ───────────────────────────────────────────

export function getCrmCommercialGoals(tenantId) {
  const g = getCommercialGoalsSettings(tenantId);
  return {
    leadsGoal: g.leadsGoal,
    revenueGoal: g.revenueGoal,
    closingsGoal: g.closingsGoal,
    conversionGoal: g.conversionGoal,
    appointmentsGoal: g.appointmentsGoal,
    attendancesGoal: g.attendancesGoal,
    consultantGoals: g.consultantGoals,
  };
}

export function saveCrmCommercialGoals(user, goalsInput) {
  return saveCommercialGoalsSettings(user, goalsInput);
}

// ─── Dashboard executivo (agregador principal) ───────────────────────────────

/**
 * @param {Object} opts
 * @param {string} opts.tenantId
 * @param {string} [opts.range]
 * @param {string} [opts.customStart]
 * @param {string} [opts.customEnd]
 * @param {string} [opts.channel]
 * @param {string} [opts.ownerId]
 * @param {string} [opts.interest]
 * @param {string} [opts.stageKey]
 */
export function getCrmExecutiveDashboard(opts = {}) {
  const db = loadDb();
  const stageMeta = buildStageMeta(opts.tenantId);
  const period = resolveRange(opts.range, opts.customStart, opts.customEnd);
  const previousPeriod = resolvePreviousRange(period.startDate, period.endDate);

  const allLeads = listLeads();
  const leads = filterLeads(allLeads, { ...opts, startDate: period.startDate, endDate: period.endDate }, stageMeta);
  const prevLeads = filterLeads(
    allLeads,
    { ...opts, startDate: previousPeriod.startDate, endDate: previousPeriod.endDate },
    stageMeta
  );

  const eventsByLead = {};
  (db.crmLeadEvents || []).forEach((e) => {
    if (!eventsByLead[e.leadId]) eventsByLead[e.leadId] = [];
    eventsByLead[e.leadId].push(e);
  });

  const countMetric = (list, fn) => list.filter(fn).length;
  const sumValue = (list) => list.reduce((s, l) => s + leadValue(l, db), 0);

  const leadsCaptados = leads.length;
  const leadsAtivos = countMetric(leads, (l) => isActive(l, stageMeta));
  const agendadas = countMetric(leads, (l) => l.stageKey === 'avaliacao_agendada' || eventsByLead[l.id]?.some((e) => e.type === CRM_EVENT_TYPE.APPOINTMENT_SCHEDULED));
  const realizadas = countMetric(leads, (l) => l.stageKey === 'avaliacao_realizada');
  const orcamentos = countMetric(
    leads,
    (l) =>
      ['orcamento_apresentado', 'em_negociacao'].includes(l.stageKey) ||
      (db.crmBudgetLinks || []).some((b) => b.leadId === l.id)
  );
  const fechados = countMetric(leads, (l) => isConverted(l, stageMeta));
  const perdidos = countMetric(leads, (l) => isLost(l, stageMeta));
  const taxaConversao = leadsCaptados ? Math.round((fechados / leadsCaptados) * 1000) / 10 : 0;

  const prevFechados = countMetric(prevLeads, (l) => isConverted(l, stageMeta));
  const prevTaxa = prevLeads.length ? Math.round((prevFechados / prevLeads.length) * 100) : 0;

  const executiveKpis = [
    { id: 'leads', label: 'Leads captados', ...kpiTrend(leadsCaptados, prevLeads.length), format: 'number' },
    { id: 'ativos', label: 'Leads ativos', ...kpiTrend(leadsAtivos, countMetric(prevLeads, (l) => isActive(l, stageMeta))), format: 'number' },
    { id: 'agendadas', label: 'Avaliações agendadas', ...kpiTrend(agendadas, countMetric(prevLeads, (l) => l.stageKey === 'avaliacao_agendada')), format: 'number' },
    { id: 'realizadas', label: 'Avaliações realizadas', ...kpiTrend(realizadas, countMetric(prevLeads, (l) => l.stageKey === 'avaliacao_realizada')), format: 'number' },
    { id: 'orcamentos', label: 'Orçamentos enviados', ...kpiTrend(orcamentos, countMetric(prevLeads, (l) => l.stageKey === 'orcamento_apresentado')), format: 'number' },
    { id: 'fechados', label: 'Tratamentos fechados', ...kpiTrend(fechados, prevFechados), format: 'number', variant: 'success' },
    { id: 'perdidos', label: 'Leads perdidos', ...kpiTrend(perdidos, countMetric(prevLeads, (l) => isLost(l, stageMeta))), format: 'number', variant: 'danger' },
    { id: 'conversao', label: 'Taxa de conversão', value: taxaConversao, previous: prevTaxa, delta: taxaConversao - prevTaxa, direction: taxaConversao >= prevTaxa ? 'up' : 'down', format: 'percent', variant: 'accent' },
  ];

  const openLeads = leads.filter((l) => isActive(l, stageMeta));
  const closedLeads = leads.filter((l) => isConverted(l, stageMeta));
  const lostLeadsList = leads.filter((l) => isLost(l, stageMeta));

  const orcamentoLeads = leads.filter(
    (l) =>
      l.stageKey === 'orcamento_apresentado' ||
      (db.crmBudgetLinks || []).some((b) => b.leadId === l.id)
  );
  const negociacaoLeads = leads.filter((l) => l.stageKey === 'em_negociacao');

  const financial = {
    oportunidadesAbertas: sumValue(openLeads),
    orcamentosEnviados: sumValue(orcamentoLeads),
    valorNegociacao: sumValue(negociacaoLeads),
    valorFechado: sumValue(closedLeads),
    ticketMedio: fechados ? Math.round(sumValue(closedLeads) / fechados) : 0,
    valorPerdido: sumValue(lostLeadsList),
    potencialAberto: sumValue(openLeads),
    faturamentoCrm: sumValue(closedLeads),
    prevFechado: sumValue(prevLeads.filter((l) => isConverted(l, stageMeta))),
  };
  financial.deltaFechado = calcDelta(financial.valorFechado, financial.prevFechado);

  const resumoComercial = {
    leads: leadsCaptados,
    avaliacoes: agendadas,
    comparecimentos: realizadas,
    fechamentos: fechados,
    conversao: taxaConversao,
    receita: financial.valorFechado,
  };

  const funnelSteps = stageMeta.funnelOrder.map((stage, i) => {
    const totalEtapa = leads.filter((l) => l.stageKey === stage.key).length;
    const totalAnterior = i > 0
      ? leads.filter((l) => l.stageKey === stageMeta.funnelOrder[i - 1].key).length
      : totalEtapa;
    const totalPrimeira = leads.filter((l) => l.stageKey === stageMeta.funnelOrder[0]?.key).length || leadsCaptados;
    return {
      stageKey: stage.key,
      label: stage.label,
      color: stage.color,
      totalEtapa,
      conversaoEtapa: i === 0 ? 100 : totalAnterior > 0 ? Math.round((totalEtapa / totalAnterior) * 1000) / 10 : 0,
      conversaoAcumulada: totalPrimeira > 0 ? Math.round((totalEtapa / totalPrimeira) * 1000) / 10 : 0,
      stageType: stage.stageType,
    };
  });

  let maiorQuedaIndex = -1;
  let menorConversao = 100;
  for (let i = 1; i < funnelSteps.length; i++) {
    if (funnelSteps[i].conversaoEtapa < menorConversao && funnelSteps[i].conversaoEtapa < 100) {
      menorConversao = funnelSteps[i].conversaoEtapa;
      maiorQuedaIndex = i;
    }
  }

  const conversionMatrix = [];
  for (let i = 0; i < funnelSteps.length - 1; i++) {
    const from = funnelSteps[i];
    const to = funnelSteps[i + 1];
    conversionMatrix.push({
      from: from.stageKey,
      fromLabel: from.label,
      to: to.stageKey,
      toLabel: to.label,
      fromCount: from.totalEtapa,
      toCount: to.totalEtapa,
      rate: from.totalEtapa > 0 ? Math.round((to.totalEtapa / from.totalEtapa) * 1000) / 10 : 0,
    });
  }

  let gargalo = null;
  let maxDrop = 0;
  for (let i = 1; i < funnelSteps.length; i++) {
    const from = funnelSteps[i - 1];
    const to = funnelSteps[i];
    if (from.totalEtapa > 0 && to.stageType !== STAGE_TYPE.LOST) {
      const drop = Math.round((1 - to.totalEtapa / from.totalEtapa) * 1000) / 10;
      if (drop > maxDrop) {
        maxDrop = drop;
        gargalo = { fromLabel: from.label, toLabel: to.label, dropPercent: drop };
      }
    }
  }

  const funnel = {
    funnelSteps,
    conversionMatrix,
    total: leadsCaptados,
    maiorQuedaIndex,
    maiorQuedaStage: maiorQuedaIndex >= 0 ? funnelSteps[maiorQuedaIndex] : null,
    maiorQuedaFrom: maiorQuedaIndex > 0 ? funnelSteps[maiorQuedaIndex - 1] : null,
    conversaoGeral: taxaConversao,
    gargalo,
  };

  const names = ownerNameMap(db);
  const ownerIds = new Set();
  leads.forEach((l) => { if (l.assignedToUserId) ownerIds.add(l.assignedToUserId); });

  const owners = [...ownerIds].map((ownerId) => {
    const ownerLeads = leads.filter((l) => l.assignedToUserId === ownerId);
    const agend = ownerLeads.filter((l) => l.stageKey === 'avaliacao_agendada').length;
    const compareceu = ownerLeads.filter((l) => l.stageKey === 'avaliacao_realizada').length;
    const closed = ownerLeads.filter((l) => isConverted(l, stageMeta)).length;
    const receita = sumValue(ownerLeads.filter((l) => isConverted(l, stageMeta)));
    return {
      ownerId,
      ownerName: names[ownerId] || ownerId,
      leads: ownerLeads.length,
      agendamentos: agend,
      comparecimentos: compareceu,
      fechamentos: closed,
      conversao: ownerLeads.length ? Math.round((closed / ownerLeads.length) * 100) : 0,
      receita,
    };
  }).sort((a, b) => b.receita - a.receita || b.fechamentos - a.fechamentos);

  const sourceMap = {};
  leads.forEach((l) => {
    const key = l.source || 'manual';
    if (!sourceMap[key]) {
      sourceMap[key] = { source: key, label: LEAD_SOURCE_LABELS[key] || key, leads: 0, fechamentos: 0, receita: 0 };
    }
    sourceMap[key].leads += 1;
    if (isConverted(l, stageMeta)) {
      sourceMap[key].fechamentos += 1;
      sourceMap[key].receita += leadValue(l, db);
    }
  });
  const sources = Object.values(sourceMap)
    .map((s) => ({
      ...s,
      conversao: s.leads ? Math.round((s.fechamentos / s.leads) * 100) : 0,
    }))
    .sort((a, b) => b.leads - a.leads);

  const treatmentMap = {};
  leads.forEach((l) => {
    const key = l.interest || 'outros';
    if (!treatmentMap[key]) {
      treatmentMap[key] = {
        key,
        label: TREATMENT_DISPLAY[key] || LEAD_INTEREST_LABELS[key] || key,
        interessados: 0,
        orcamentos: 0,
        fechamentos: 0,
        receita: 0,
      };
    }
    treatmentMap[key].interessados += 1;
    if (['orcamento_apresentado', 'em_negociacao'].includes(l.stageKey) || (db.crmBudgetLinks || []).some((b) => b.leadId === l.id)) {
      treatmentMap[key].orcamentos += 1;
    }
    if (isConverted(l, stageMeta)) {
      treatmentMap[key].fechamentos += 1;
      treatmentMap[key].receita = (treatmentMap[key].receita || 0) + leadValue(l, db);
    }
  });
  const treatments = Object.values(treatmentMap)
    .map((t) => ({
      ...t,
      receita: t.receita || 0,
      conversao: t.interessados ? Math.round((t.fechamentos / t.interessados) * 100) : 0,
    }))
    .sort((a, b) => b.receita - a.receita || b.fechamentos - a.fechamentos);

  const tenantPool = allLeads.filter((l) => {
    if (opts.tenantId && !leadBelongsToTenant(l, opts.tenantId)) return false;
    if (opts.ownerId && l.assignedToUserId !== opts.ownerId) return false;
    if (opts.channel && l.source !== opts.channel) return false;
    if (opts.interest && l.interest !== opts.interest) return false;
    return true;
  });

  const lastActivityMs = (lead) => {
    const lastEv = (eventsByLead[lead.id] || []).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    )[0];
    return lastEv
      ? new Date(lastEv.createdAt).getTime()
      : new Date(lead.updatedAt || lead.createdAt).getTime();
  };

  const now = Date.now();
  const stalled = {};
  [3, 7, 14, 30].forEach((days) => {
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    stalled[days] = tenantPool.filter(
      (l) => isActive(l, stageMeta) && lastActivityMs(l) < cutoff
    );
  });

  const pendingTasks = listTasks({ status: TASK_STATUS.PENDING });
  const leadIdsComTask = new Set(pendingTasks.filter((t) => t.leadId).map((t) => t.leadId));
  const pendingFollowUpsAll = listFollowUps({ pending: true });
  const leadIdsComFollowUp = new Set(pendingFollowUpsAll.map((f) => f.leadId));
  const leadsSemFollowUp = tenantPool.filter(
    (l) => isActive(l, stageMeta) && !leadIdsComTask.has(l.id) && !leadIdsComFollowUp.has(l.id)
  );

  const todayStartDate = new Date();
  todayStartDate.setHours(0, 0, 0, 0);
  const avaliacoesNaoCompareceram = tenantPool.filter((l) => {
    if (l.stageKey !== 'avaliacao_agendada') return false;
    const apptEvents = (eventsByLead[l.id] || [])
      .filter((e) => e.type === CRM_EVENT_TYPE.APPOINTMENT_SCHEDULED)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!apptEvents.length) return false;
    const apptDate = apptEvents[0].data?.date;
    if (!apptDate) return false;
    return new Date(`${apptDate}T23:59:59`) < todayStartDate;
  });

  const retornoCutoff = now - 7 * 24 * 60 * 60 * 1000;
  const orcamentosSemRetorno = tenantPool.filter((l) => {
    if (!['orcamento_apresentado', 'em_negociacao'].includes(l.stageKey || '')) return false;
    return lastActivityMs(l) < retornoCutoff;
  });

  const monthStartIso = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const perdidosEsteMes = tenantPool.filter(
    (l) => isLost(l, stageMeta) && inRange(l.updatedAt || l.createdAt, monthStartIso, period.endDate)
  );

  const alerts = [
    {
      id: 'sem_contato_3d',
      message: 'Leads sem contato há mais de 3 dias',
      count: stalled[3]?.length || 0,
      route: '/crm/leads',
      state: { stalledDays: 3 },
    },
    {
      id: 'sem_followup',
      message: 'Leads sem follow-up',
      count: leadsSemFollowUp.length,
      route: '/crm/leads',
      state: { semFollowUp: true },
    },
    {
      id: 'nao_compareceu',
      message: 'Avaliações que não compareceram',
      count: avaliacoesNaoCompareceram.length,
      route: '/crm/leads',
      state: { filterStageKey: 'avaliacao_agendada', noShow: true },
    },
    {
      id: 'orcamento_sem_retorno',
      message: 'Orçamentos aguardando retorno',
      count: orcamentosSemRetorno.length,
      route: '/crm/leads',
      state: { filterStageKey: 'orcamento_apresentado', awaitingReturn: true },
    },
    {
      id: 'perdidos_mes',
      message: 'Leads perdidos este mês',
      count: perdidosEsteMes.length,
      route: '/crm/leads',
      state: { filterStageKey: 'perdido', lostThisMonth: true },
    },
  ].filter((a) => a.count > 0);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const in7 = new Date(todayStart);
  in7.setDate(in7.getDate() + 7);
  const pendingFollowUps = listFollowUps({ pending: true }).filter((f) => {
    const lead = allLeads.find((l) => l.id === f.leadId);
    return lead && (!opts.tenantId || leadBelongsToTenant(lead, opts.tenantId));
  });
  const followup = {
    atrasados: pendingFollowUps.filter((f) => f.dueAt && new Date(f.dueAt) < todayStart).length,
    hoje: pendingFollowUps.filter((f) => {
      if (!f.dueAt) return false;
      const d = new Date(f.dueAt);
      return d >= todayStart && d <= todayEnd;
    }).length,
    proximos7: pendingFollowUps.filter((f) => {
      if (!f.dueAt) return false;
      const d = new Date(f.dueAt);
      return d > todayEnd && d <= in7;
    }).length,
    items: {
      atrasados: pendingFollowUps.filter((f) => f.dueAt && new Date(f.dueAt) < todayStart),
      hoje: pendingFollowUps.filter((f) => f.dueAt && new Date(f.dueAt) >= todayStart && new Date(f.dueAt) <= todayEnd),
      proximos7: pendingFollowUps.filter((f) => f.dueAt && new Date(f.dueAt) > todayEnd && new Date(f.dueAt) <= in7),
    },
  };

  const perdidosPeriodo = filterLeads(
    allLeads,
    { ...opts, startDate: period.startDate, endDate: period.endDate },
    stageMeta,
    { dateField: 'updatedAt' }
  ).filter((l) => isLost(l, stageMeta));
  const lossBuckets = {};
  DEFAULT_LOSS_BUCKETS.forEach((b) => { lossBuckets[b] = { motivo: b, count: 0, valor: 0 }; });
  perdidosPeriodo.forEach((l) => {
    const bucket = categorizeLossReason(l.lossReason);
    if (!lossBuckets[bucket]) lossBuckets[bucket] = { motivo: bucket, count: 0, valor: 0 };
    lossBuckets[bucket].count += 1;
    lossBuckets[bucket].valor += leadValue(l, db);
  });
  const totalLoss = perdidosPeriodo.length;
  const lossReasons = Object.values(lossBuckets)
    .filter((b) => b.count > 0)
    .map((b) => ({
      ...b,
      percent: totalLoss ? Math.round((b.count / totalLoss) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const avgHours = (pairs) => {
    if (!pairs.length) return null;
    return Math.round((pairs.reduce((s, h) => s + h, 0) / pairs.length) * 10) / 10;
  };

  const leadToContact = [];
  const contactToEval = [];
  const evalToBudget = [];
  const budgetToClose = [];
  const allConversion = [];

  leads.forEach((l) => {
    const firstContact = getFirstContactEvent(eventsByLead[l.id] || []);
    if (firstContact) {
      leadToContact.push((new Date(firstContact.createdAt) - new Date(l.createdAt)) / 3600000);
    }
    const evs = (eventsByLead[l.id] || [])
      .filter((e) => e.type === CRM_EVENT_TYPE.STATUS_CHANGE)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const created = new Date(l.createdAt).getTime();
    const evalEv = evs.find((e) => e.data?.toStage === 'avaliacao_agendada' || e.data?.toStage === 'avaliacao_realizada');
    const budgetEv = evs.find((e) => e.data?.toStage === 'orcamento_apresentado');
    const closeEv = evs.find((e) => stageMeta.conversionKeys.has(e.data?.toStage));

    if (firstContact && evalEv) {
      contactToEval.push((new Date(evalEv.createdAt) - new Date(firstContact.createdAt)) / 3600000);
    } else if (firstContact) {
      contactToEval.push((new Date(firstContact.createdAt) - created) / 3600000);
    }
    if (evalEv && budgetEv) {
      evalToBudget.push((new Date(budgetEv.createdAt) - new Date(evalEv.createdAt)) / 3600000);
    }
    if (budgetEv && closeEv) {
      budgetToClose.push((new Date(closeEv.createdAt) - new Date(budgetEv.createdAt)) / 3600000);
    }
    if (closeEv) {
      allConversion.push((new Date(closeEv.createdAt) - created) / 3600000);
    }
  });

  const conversionTimes = {
    leadParaPrimeiroContato: avgHours(leadToContact),
    contatoParaAvaliacao: avgHours(contactToEval),
    avaliacaoParaOrcamento: avgHours(evalToBudget),
    orcamentoParaFechamento: avgHours(budgetToClose),
    tempoMedioGeral: avgHours(allConversion),
  };

  const goals = getCrmCommercialGoals(opts.tenantId);
  const goalsProgress = {
    ...goals,
    leadsAtual: leadsCaptados,
    receitaAtual: financial.valorFechado,
    fechamentosAtual: fechados,
    conversaoAtual: taxaConversao,
    leadsPercent: goals.leadsGoal ? Math.min(100, Math.round((leadsCaptados / goals.leadsGoal) * 100)) : 0,
    receitaPercent: goals.revenueGoal ? Math.min(100, Math.round((financial.valorFechado / goals.revenueGoal) * 100)) : 0,
    closingsPercent: goals.closingsGoal ? Math.min(100, Math.round((fechados / goals.closingsGoal) * 100)) : 0,
    conversionPercent: goals.conversionGoal ? Math.min(100, Math.round((taxaConversao / goals.conversionGoal) * 100)) : 0,
  };

  return {
    period,
    previousPeriod,
    resumoComercial,
    alerts,
    executiveKpis,
    financial,
    funnel,
    owners,
    sources,
    treatments,
    stalled,
    followup,
    lossReasons,
    totalPerdidos: totalLoss,
    conversionTimes,
    goals: goalsProgress,
    leads,
  };
}

// ─── Wrappers legados (compatibilidade) ──────────────────────────────────────

export function getCrmKpis(opts = {}) {
  const d = getCrmExecutiveDashboard(opts);
  const map = Object.fromEntries(d.executiveKpis.map((k) => [k.id, k]));
  return {
    leadsNoPeriodo: map.leads?.value ?? 0,
    leadsAtivos: map.ativos?.value ?? 0,
    avaliacoesAgendadas: map.agendadas?.value ?? 0,
    avaliacoesRealizadas: map.realizadas?.value ?? 0,
    orcamentosEnviados: map.orcamentos?.value ?? 0,
    fechadosGanhos: map.fechados?.value ?? 0,
    taxaConversaoGeral: map.conversao?.value ?? 0,
    tempoMedioPrimeiroContato: d.conversionTimes.contatoParaAvaliacao,
    hasTempoMedioPrimeiroContatoData: d.conversionTimes.contatoParaAvaliacao != null,
    followUpsAtrasados: d.followup.atrasados,
  };
}

export function getCrmFunnel(opts = {}) {
  const d = getCrmExecutiveDashboard(opts);
  return {
    ...d.funnel,
    leads: d.leads,
    totalPrimeira: d.funnel.funnelSteps[0]?.totalEtapa ?? 0,
  };
}

export function getCrmSpeedMetrics(opts = {}) {
  const d = getCrmExecutiveDashboard(opts);
  return {
    tempoMedioPrimeiroContato: d.conversionTimes.contatoParaAvaliacao,
    hasTempoMedioPrimeiroContatoData: d.conversionTimes.contatoParaAvaliacao != null,
    tempoMedioPorEtapa: [],
    leadsParados: { 3: d.stalled[3], 7: d.stalled[7], 14: d.stalled[14], 30: d.stalled[30] },
  };
}

export function getCrmFollowupMetrics(opts = {}) {
  const d = getCrmExecutiveDashboard(opts);
  return {
    atrasados: d.followup.atrasados,
    hoje: d.followup.hoje,
    proximos7: d.followup.proximos7,
    leadsSemFollowUp: [],
  };
}

export function getCrmOwnerPerformance(opts = {}) {
  const d = getCrmExecutiveDashboard(opts);
  return d.owners.map((o, i) => ({
    ownerId: o.ownerId,
    ownerName: o.ownerName,
    leadsAtribuidos: o.leads,
    ganhos: o.fechamentos,
    taxaConversao: o.conversao,
    tempoMedioPrimeiroContato: 0,
    hasTempoMedioData: false,
    followUpsAtrasados: 0,
    agendamentos: o.agendamentos,
    comparecimentos: o.comparecimentos,
    receita: o.receita,
    rank: i + 1,
  }));
}

export function getCrmLossMetrics(opts = {}) {
  const d = getCrmExecutiveDashboard(opts);
  return {
    totalPerdidos: d.totalPerdidos,
    porMotivo: d.lossReasons.map((r) => ({ motivo: r.motivo, count: r.count, valor: r.valor })),
    leadsPerdidos: [],
  };
}
