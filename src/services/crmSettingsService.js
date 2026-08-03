/**
 * Configurações administrativas do CRM por tenant (IndexedDB).
 * Compatível com multi-tenant; seeds automáticos na primeira leitura.
 */

import { withDb, loadDb } from '../db/index.js';
import { createId } from './helpers.js';
import { resolveTenantIdForWrite } from './tenantWriteGuard.js';
import { LEAD_SOURCE_LABELS, LEAD_INTEREST_LABELS } from './crmService.js';

const slugify = (label) =>
  String(label || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'item';

const sortByOrder = (items) => [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

const byTenant = (items, tenantId) =>
  (items || []).filter((i) => i.tenant_id === tenantId);

// ─── Seeds padrão ────────────────────────────────────────────────────────────

const DEFAULT_SOURCES = [
  ['instagram', 'Instagram'],
  ['facebook', 'Facebook'],
  ['google', 'Google'],
  ['google_ads', 'Google Ads'],
  ['indicacao', 'Indicação'],
  ['whatsapp', 'WhatsApp'],
  ['site', 'Site'],
  ['trafego_pago', 'Tráfego Pago'],
  ['outdoor', 'Outdoor'],
  ['radio', 'Rádio'],
  ['telefone', 'Telefone'],
  ['walk_in', 'Walk-in'],
  ['manual', 'Manual'],
  ['meta', 'Meta (Lead Ads)'],
];

const DEFAULT_INTERESTS = [
  ['implante', 'Implante Unitário'],
  ['cirurgia', 'Protocolo Total'],
  ['estetica', 'Lente de Resina'],
  ['estetica_porcelana', 'Lente de Porcelana'],
  ['ortodontia', 'Ortodontia'],
  ['clareamento', 'Clareamento'],
  ['protese', 'Prótese Flexível'],
  ['ponte_fixa', 'Ponte Fixa'],
  ['harmonizacao', 'Harmonização'],
  ['geral', 'Clínica Geral'],
  ['outros', 'Outros'],
];

const DEFAULT_LOSS_REASONS = [
  'Preço',
  'Sem interesse',
  'Não respondeu',
  'Fechou com concorrente',
  'Sem condição financeira',
  'Outro',
];

const DEFAULT_WHATSAPP_MESSAGES = {
  inicial: 'Olá! Somos a clínica e gostaríamos de saber como podemos ajudar.',
  boasVindas: 'Seja bem-vindo(a)! Estamos felizes em receber seu contato.',
  followUp: 'Olá! Passando para dar continuidade ao seu atendimento. Podemos ajudar?',
  posAvaliacao: 'Olá! Esperamos que tenha tido uma ótima experiência na avaliação.',
  posOrcamento: 'Olá! Teve oportunidade de analisar o orçamento? Estamos à disposição.',
  recuperacao: 'Olá! Sentimos sua falta. Gostaríamos de saber se podemos ajudar.',
};

const DEFAULT_AUTOMATION_PRESETS = [
  { name: 'Lead novo → criar tarefa', trigger: { type: 'lead_created' }, action: { type: 'create_task' }, active: true },
  { name: 'Avaliação agendada → WhatsApp', trigger: { type: 'stage_change', stageKey: 'avaliacao_agendada' }, action: { type: 'send_whatsapp', templateKey: 'posAvaliacao' }, active: false },
  { name: 'Orçamento vencido → follow-up', trigger: { type: 'budget_stale' }, condition: { delayDays: 7 }, action: { type: 'create_followup' }, active: false },
  { name: 'Lead parado → alerta', trigger: { type: 'lead_stalled' }, condition: { delayDays: 3 }, action: { type: 'create_alert' }, active: false },
];

// ─── Bootstrap ───────────────────────────────────────────────────────────────

export function ensureCrmSettingsForTenant(user) {
  const tenantId = resolveTenantIdForWrite(user);
  withDb((db) => {
    if (!Array.isArray(db.crmLeadSources)) db.crmLeadSources = [];
    if (!Array.isArray(db.crmLeadInterests)) db.crmLeadInterests = [];
    if (!Array.isArray(db.crmCommercialTeam)) db.crmCommercialTeam = [];
    if (!Array.isArray(db.crmCommercialGoals)) db.crmCommercialGoals = [];
    if (!Array.isArray(db.crmFollowUpSettings)) db.crmFollowUpSettings = [];
    if (!Array.isArray(db.crmLossReasons)) db.crmLossReasons = [];
    if (!Array.isArray(db.crmWhatsAppSettings)) db.crmWhatsAppSettings = [];
    if (!Array.isArray(db.crmConversionSettings)) db.crmConversionSettings = [];
    if (!Array.isArray(db.crmAutomations)) db.crmAutomations = [];

    const now = new Date().toISOString();

    if (!byTenant(db.crmLeadSources, tenantId).length) {
      DEFAULT_SOURCES.forEach(([key, label], i) => {
        db.crmLeadSources.push({
          id: createId('crmsrc'),
          tenant_id: tenantId,
          key,
          label,
          isActive: true,
          order: i + 1,
          createdAt: now,
        });
      });
    }

    if (!byTenant(db.crmLeadInterests, tenantId).length) {
      const fallback = Object.entries(LEAD_INTEREST_LABELS);
      const seeds = DEFAULT_INTERESTS.length ? DEFAULT_INTERESTS : fallback;
      seeds.forEach(([key, label], i) => {
        db.crmLeadInterests.push({
          id: createId('crmint'),
          tenant_id: tenantId,
          key,
          label,
          isActive: true,
          order: i + 1,
          createdAt: now,
        });
      });
    }

    if (!byTenant(db.crmLossReasons, tenantId).length) {
      DEFAULT_LOSS_REASONS.forEach((label, i) => {
        db.crmLossReasons.push({
          id: createId('crmlost'),
          tenant_id: tenantId,
          label,
          isActive: true,
          order: i + 1,
          isDefault: true,
          createdAt: now,
        });
      });
    }

    if (!byTenant(db.crmFollowUpSettings, tenantId).length) {
      db.crmFollowUpSettings.push({
        tenant_id: tenantId,
        enabled: true,
        leadSemContatoDays: 1,
        leadParadoDays: 3,
        orcamentoSemRetornoDays: 7,
        followupVencidoAlert: true,
        updatedAt: now,
      });
    }

    if (!byTenant(db.crmWhatsAppSettings, tenantId).length) {
      db.crmWhatsAppSettings.push({
        tenant_id: tenantId,
        mainPhone: '',
        messages: { ...DEFAULT_WHATSAPP_MESSAGES },
        updatedAt: now,
      });
    }

    if (!byTenant(db.crmConversionSettings, tenantId).length) {
      db.crmConversionSettings.push({
        tenant_id: tenantId,
        manualEnabled: true,
        autoAfterEvaluation: false,
        autoAfterClosing: false,
        updatedAt: now,
      });
    }

    const tenantAutomations = (db.crmAutomations || []).filter((a) => a.tenant_id === tenantId);
    if (!tenantAutomations.length) {
      DEFAULT_AUTOMATION_PRESETS.forEach((preset) => {
        db.crmAutomations.push({
          id: createId('crmauto'),
          tenant_id: tenantId,
          ...preset,
          createdAt: now,
          updatedAt: now,
        });
      });
    } else {
      db.crmAutomations = db.crmAutomations.map((a) => ({
        ...a,
        tenant_id: a.tenant_id ?? null,
      }));
    }
  });
  return tenantId;
}

// ─── Resolvers (compatibilidade com enums legados) ───────────────────────────

export function listLeadSourcesForTenant(tenantId) {
  const db = loadDb();
  const items = sortByOrder(byTenant(db.crmLeadSources, tenantId));
  if (items.length) return items;
  return Object.entries(LEAD_SOURCE_LABELS).map(([key, label], i) => ({
    id: key, key, label, isActive: true, order: i + 1, tenant_id: tenantId,
  }));
}

export function getLeadSourceLabelsMap(tenantId) {
  const map = {};
  listLeadSourcesForTenant(tenantId)
    .filter((s) => s.isActive !== false)
    .forEach((s) => { map[s.key] = s.label; });
  return map;
}

export function listLeadInterestsForTenant(tenantId) {
  const db = loadDb();
  const items = sortByOrder(byTenant(db.crmLeadInterests, tenantId));
  if (items.length) return items;
  return Object.entries(LEAD_INTEREST_LABELS).map(([key, label], i) => ({
    id: key, key, label, isActive: true, order: i + 1, tenant_id: tenantId,
  }));
}

export function getInterestLabelsMap(tenantId) {
  const map = {};
  listLeadInterestsForTenant(tenantId)
    .filter((i) => i.isActive !== false)
    .forEach((i) => { map[i.key] = i.label; });
  return map;
}

export function listLossReasonsForTenant(tenantId) {
  const db = loadDb();
  const items = sortByOrder(byTenant(db.crmLossReasons, tenantId).filter((r) => r.isActive !== false));
  if (items.length) return items.map((r) => r.label);
  return [...DEFAULT_LOSS_REASONS];
}

// ─── CRUD genérico (origens, interesses, motivos) ────────────────────────────

function saveOrderedList(user, storeKey, tenantId, items, validate) {
  const err = validate?.(items);
  if (err) throw new Error(err);
  const now = new Date().toISOString();
  return withDb((db) => {
    if (!Array.isArray(db[storeKey])) db[storeKey] = [];
    const others = db[storeKey].filter((i) => i.tenant_id !== tenantId);
    const usedKeys = new Set();
    const normalized = items.map((item, index) => {
      const label = String(item.label || '').trim();
      if (!label) throw new Error('Todos os itens precisam de um nome.');
      let key = item.key || slugify(label);
      if (usedKeys.has(key)) {
        let suffix = 2;
        while (usedKeys.has(`${key}_${suffix}`)) suffix += 1;
        key = `${key}_${suffix}`;
      }
      usedKeys.add(key);
      return {
        ...item,
        id: item.id || createId(storeKey.slice(3, 7)),
        tenant_id: tenantId,
        key,
        label,
        isActive: item.isActive !== false,
        order: index + 1,
        updatedAt: now,
      };
    });
    db[storeKey] = [...others, ...normalized];
    return normalized;
  });
}

export function saveLeadSourcesForTenant(user, items) {
  const tenantId = resolveTenantIdForWrite(user);
  return saveOrderedList(user, 'crmLeadSources', tenantId, items);
}

export function saveLeadInterestsForTenant(user, items) {
  const tenantId = resolveTenantIdForWrite(user);
  return saveOrderedList(user, 'crmLeadInterests', tenantId, items);
}

export function saveLossReasonsForTenant(user, items) {
  const tenantId = resolveTenantIdForWrite(user);
  return saveOrderedList(user, 'crmLossReasons', tenantId, items.map((r) => ({
    ...r,
    isDefault: r.isDefault ?? false,
  })));
}

// ─── Equipe comercial ────────────────────────────────────────────────────────

export function listCommercialTeamForTenant(tenantId) {
  return sortByOrder(byTenant(loadDb().crmCommercialTeam, tenantId));
}

export function saveCommercialTeamForTenant(user, members) {
  const tenantId = resolveTenantIdForWrite(user);
  const now = new Date().toISOString();
  return withDb((db) => {
    if (!Array.isArray(db.crmCommercialTeam)) db.crmCommercialTeam = [];
    const others = db.crmCommercialTeam.filter((m) => m.tenant_id !== tenantId);
    const normalized = members.map((m, index) => ({
      id: m.id || createId('crmteam'),
      tenant_id: tenantId,
      userId: m.userId || null,
      name: String(m.name || '').trim(),
      role: m.role || '',
      jobFunction: m.jobFunction || '',
      monthlyGoal: Number(m.monthlyGoal) || 0,
      active: m.active !== false,
      crmPermission: m.crmPermission || 'consultor',
      order: index + 1,
      updatedAt: now,
    }));
    if (normalized.some((m) => !m.name)) throw new Error('Todos os membros precisam de um nome.');
    db.crmCommercialTeam = [...others, ...normalized];
    return normalized;
  });
}

// ─── Metas comerciais (estendidas) ───────────────────────────────────────────

export function getCommercialGoalsSettings(tenantId) {
  const stored = (loadDb().crmCommercialGoals || []).find((g) => g.tenant_id === tenantId);
  return {
    leadsGoal: stored?.leadsGoal ?? 100,
    appointmentsGoal: stored?.appointmentsGoal ?? 60,
    attendancesGoal: stored?.attendancesGoal ?? 45,
    conversionGoal: stored?.conversionGoal ?? 20,
    revenueGoal: stored?.revenueGoal ?? 100000,
    closingsGoal: stored?.closingsGoal ?? 25,
    consultantGoals: stored?.consultantGoals ?? [],
    updatedAt: stored?.updatedAt,
  };
}

export function saveCommercialGoalsSettings(user, input) {
  const tenantId = resolveTenantIdForWrite(user);
  const prev = getCommercialGoalsSettings(tenantId);
  return withDb((db) => {
    if (!Array.isArray(db.crmCommercialGoals)) db.crmCommercialGoals = [];
    const idx = db.crmCommercialGoals.findIndex((g) => g.tenant_id === tenantId);
    const entry = {
      tenant_id: tenantId,
      leadsGoal: Number(input.leadsGoal ?? prev.leadsGoal) || 0,
      appointmentsGoal: Number(input.appointmentsGoal ?? prev.appointmentsGoal) || 0,
      attendancesGoal: Number(input.attendancesGoal ?? prev.attendancesGoal) || 0,
      conversionGoal: Number(input.conversionGoal ?? prev.conversionGoal) || 0,
      revenueGoal: Number(input.revenueGoal ?? prev.revenueGoal) || 0,
      closingsGoal: Number(input.closingsGoal ?? prev.closingsGoal) || 0,
      consultantGoals: Array.isArray(input.consultantGoals) ? input.consultantGoals : prev.consultantGoals,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) db.crmCommercialGoals[idx] = entry;
    else db.crmCommercialGoals.push(entry);
    return entry;
  });
}

// ─── Follow-up automático ──────────────────────────────────────────────────────

export function getFollowUpSettings(tenantId) {
  const stored = byTenant(loadDb().crmFollowUpSettings, tenantId)[0];
  return {
    enabled: stored?.enabled !== false,
    leadSemContatoDays: stored?.leadSemContatoDays ?? 1,
    leadParadoDays: stored?.leadParadoDays ?? 3,
    orcamentoSemRetornoDays: stored?.orcamentoSemRetornoDays ?? 7,
    followupVencidoAlert: stored?.followupVencidoAlert !== false,
  };
}

export function saveFollowUpSettings(user, input) {
  const tenantId = resolveTenantIdForWrite(user);
  return withDb((db) => {
    if (!Array.isArray(db.crmFollowUpSettings)) db.crmFollowUpSettings = [];
    const others = db.crmFollowUpSettings.filter((s) => s.tenant_id !== tenantId);
    const entry = {
      tenant_id: tenantId,
      enabled: input.enabled !== false,
      leadSemContatoDays: Math.max(1, Number(input.leadSemContatoDays) || 1),
      leadParadoDays: Math.max(1, Number(input.leadParadoDays) || 3),
      orcamentoSemRetornoDays: Math.max(1, Number(input.orcamentoSemRetornoDays) || 7),
      followupVencidoAlert: input.followupVencidoAlert !== false,
      updatedAt: new Date().toISOString(),
    };
    db.crmFollowUpSettings = [...others, entry];
    return entry;
  });
}

// ─── WhatsApp CRM ────────────────────────────────────────────────────────────

export function getWhatsAppSettings(tenantId) {
  const stored = byTenant(loadDb().crmWhatsAppSettings, tenantId)[0];
  return {
    mainPhone: stored?.mainPhone || '',
    messages: { ...DEFAULT_WHATSAPP_MESSAGES, ...(stored?.messages || {}) },
  };
}

export function saveWhatsAppSettings(user, input) {
  const tenantId = resolveTenantIdForWrite(user);
  return withDb((db) => {
    if (!Array.isArray(db.crmWhatsAppSettings)) db.crmWhatsAppSettings = [];
    const others = db.crmWhatsAppSettings.filter((s) => s.tenant_id !== tenantId);
    const entry = {
      tenant_id: tenantId,
      mainPhone: String(input.mainPhone || '').trim(),
      messages: { ...DEFAULT_WHATSAPP_MESSAGES, ...(input.messages || {}) },
      updatedAt: new Date().toISOString(),
    };
    db.crmWhatsAppSettings = [...others, entry];
    return entry;
  });
}

export function getWhatsAppTemplatesForTenant(tenantId) {
  const { messages } = getWhatsAppSettings(tenantId);
  return [
    { id: 'inicial', label: 'Mensagem inicial', text: messages.inicial },
    { id: 'boasVindas', label: 'Boas-vindas', text: messages.boasVindas },
    { id: 'followUp', label: 'Follow-up', text: messages.followUp },
    { id: 'posAvaliacao', label: 'Pós-avaliação', text: messages.posAvaliacao },
    { id: 'posOrcamento', label: 'Pós-orçamento', text: messages.posOrcamento },
    { id: 'recuperacao', label: 'Recuperação', text: messages.recuperacao },
  ];
}

// ─── Automações ──────────────────────────────────────────────────────────────

export function listAutomationsForTenant(tenantId) {
  return (loadDb().crmAutomations || []).filter(
    (a) => a.tenant_id === tenantId || (tenantId && a.tenant_id == null)
  );
}

export function saveAutomationsForTenant(user, rules) {
  const tenantId = resolveTenantIdForWrite(user);
  const now = new Date().toISOString();
  return withDb((db) => {
    if (!Array.isArray(db.crmAutomations)) db.crmAutomations = [];
    const others = db.crmAutomations.filter((a) => a.tenant_id !== tenantId && a.tenant_id != null);
    const normalized = rules.map((r) => ({
      id: r.id || createId('crmauto'),
      tenant_id: tenantId,
      name: String(r.name || 'Nova automação').trim(),
      trigger: r.trigger || { type: 'lead_created' },
      condition: r.condition || null,
      action: r.action || { type: 'create_task' },
      active: r.active !== false,
      createdAt: r.createdAt || now,
      updatedAt: now,
    }));
    db.crmAutomations = [...others, ...normalized];
    return normalized;
  });
}

// ─── Conversão Lead → Paciente ───────────────────────────────────────────────

export function getConversionSettings(tenantId) {
  const stored = byTenant(loadDb().crmConversionSettings, tenantId)[0];
  return {
    manualEnabled: stored?.manualEnabled !== false,
    autoAfterEvaluation: stored?.autoAfterEvaluation === true,
    autoAfterClosing: stored?.autoAfterClosing === true,
  };
}

export function saveConversionSettings(user, input) {
  const tenantId = resolveTenantIdForWrite(user);
  return withDb((db) => {
    if (!Array.isArray(db.crmConversionSettings)) db.crmConversionSettings = [];
    const others = db.crmConversionSettings.filter((s) => s.tenant_id !== tenantId);
    const entry = {
      tenant_id: tenantId,
      manualEnabled: input.manualEnabled !== false,
      autoAfterEvaluation: input.autoAfterEvaluation === true,
      autoAfterClosing: input.autoAfterClosing === true,
      updatedAt: new Date().toISOString(),
    };
    db.crmConversionSettings = [...others, entry];
    return entry;
  });
}
