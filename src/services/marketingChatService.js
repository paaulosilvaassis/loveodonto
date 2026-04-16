import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';

const SIMULATED_DELAY_MS = 180;

const ROLES_CAN_WRITE = new Set(['admin', 'gerente', 'comercial', 'recepcao', 'atendimento']);
const RUNTIME_TICK_MS = 5000;
const JOB_MAX_ATTEMPTS = 3;
const JOB_RETRY_BASE_SECONDS = 15;
const JOB_LOCK_TTL_MS = 45000;
const DEDUPE_WINDOW_MINUTES = 10;
const runtimeRegistry = new Map();

function wait(ms = SIMULATED_DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || '').trim();
}

function assertCanWrite(user) {
  const role = user?.role;
  if (!role || !ROLES_CAN_WRITE.has(role)) {
    throw new Error('Permissao insuficiente para operacao de escrita no modulo de marketing.');
  }
}

const SCOPE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveScope(db, user) {
  const tenants = Array.isArray(db.tenants) ? db.tenants : [];
  let tenantId = user?.tenantId || '';
  if (tenantId && !SCOPE_UUID_RE.test(tenantId) && !tenants.some((t) => t.id === tenantId)) {
    tenantId = '';
  }
  if (!tenantId) {
    tenantId = tenants[0]?.id || 'tenant-1';
  }
  const clinicId = db?.clinicProfile?.id || 'clinic-1';
  return { tenantId, clinicId };
}

function paginate(items, page = 1, pageSize = 10) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    data: items.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}

function defaultTags(now) {
  return [
    { id: createId('mkt-tag'), name: 'lead_quente', color: '#ef4444', createdAt: now },
    { id: createId('mkt-tag'), name: 'retorno', color: '#0ea5e9', createdAt: now },
    { id: createId('mkt-tag'), name: 'financeiro', color: '#f59e0b', createdAt: now },
    { id: createId('mkt-tag'), name: 'agendamento', color: '#22c55e', createdAt: now },
  ];
}

function seedMarketingState(db, scope) {
  const now = new Date().toISOString();
  if (!Array.isArray(db.marketingChatTags)) db.marketingChatTags = [];
  if (!Array.isArray(db.marketingChatContacts)) db.marketingChatContacts = [];
  if (!Array.isArray(db.marketingChatConversations)) db.marketingChatConversations = [];
  if (!Array.isArray(db.marketingChatMessages)) db.marketingChatMessages = [];
  if (!Array.isArray(db.marketingChatCampaigns)) db.marketingChatCampaigns = [];
  if (!Array.isArray(db.marketingChatFunnels)) db.marketingChatFunnels = [];
  if (!Array.isArray(db.marketingChatAutomations)) db.marketingChatAutomations = [];
  if (!Array.isArray(db.marketingChatMetricsSnapshots)) db.marketingChatMetricsSnapshots = [];
  if (!Array.isArray(db.marketingChatAssignments)) db.marketingChatAssignments = [];
  if (!Array.isArray(db.marketingChatNotes)) db.marketingChatNotes = [];
  if (!Array.isArray(db.marketingChatWebhookLogs)) db.marketingChatWebhookLogs = [];
  if (!Array.isArray(db.marketingChatDepartments)) db.marketingChatDepartments = [];
  if (!Array.isArray(db.marketingChatAttendants)) db.marketingChatAttendants = [];
  if (!Array.isArray(db.marketingChatChannels)) db.marketingChatChannels = [];
  if (!Array.isArray(db.marketingAutomationEvents)) db.marketingAutomationEvents = [];
  if (!Array.isArray(db.marketingAutomationRuns)) db.marketingAutomationRuns = [];
  if (!Array.isArray(db.marketingAutomationRunSteps)) db.marketingAutomationRunSteps = [];
  if (!Array.isArray(db.marketingScheduledJobs)) db.marketingScheduledJobs = [];
  if (!Array.isArray(db.marketingJobAttempts)) db.marketingJobAttempts = [];
  if (!Array.isArray(db.marketingAutomationMetricsDaily)) db.marketingAutomationMetricsDaily = [];
  if (!db.marketingChatApiConfig || typeof db.marketingChatApiConfig !== 'object') db.marketingChatApiConfig = {};
  if (!db.marketingChatSettings || typeof db.marketingChatSettings !== 'object') db.marketingChatSettings = {};

  const hasData = db.marketingChatConversations.some((item) => item.tenantId === scope.tenantId && item.clinicId === scope.clinicId);
  if (hasData) return;

  const tags = defaultTags(now).map((tag) => ({ ...tag, tenantId: scope.tenantId, clinicId: scope.clinicId }));
  db.marketingChatTags.push(...tags);

  const departments = [
    { id: createId('mkt-dept'), tenantId: scope.tenantId, clinicId: scope.clinicId, name: 'Comercial', description: 'Time comercial e pre-venda', active: true, createdAt: now, updatedAt: now },
    { id: createId('mkt-dept'), tenantId: scope.tenantId, clinicId: scope.clinicId, name: 'Atendimento', description: 'Atendimento e suporte ao paciente', active: true, createdAt: now, updatedAt: now },
    { id: createId('mkt-dept'), tenantId: scope.tenantId, clinicId: scope.clinicId, name: 'Financeiro', description: 'Cobranças e negociacoes', active: true, createdAt: now, updatedAt: now },
  ];
  db.marketingChatDepartments.push(...departments);

  const attendants = [
    { id: createId('mkt-att'), tenantId: scope.tenantId, clinicId: scope.clinicId, name: 'Marina', email: 'marina@loveodonto.com', role: 'comercial', active: true, departmentIds: [departments[0].id], channelIds: [], createdAt: now, updatedAt: now },
    { id: createId('mkt-att'), tenantId: scope.tenantId, clinicId: scope.clinicId, name: 'Pedro', email: 'pedro@loveodonto.com', role: 'atendimento', active: true, departmentIds: [departments[1].id], channelIds: [], createdAt: now, updatedAt: now },
    { id: createId('mkt-att'), tenantId: scope.tenantId, clinicId: scope.clinicId, name: 'Bruna', email: 'bruna@loveodonto.com', role: 'comercial', active: true, departmentIds: [departments[0].id, departments[2].id], channelIds: [], createdAt: now, updatedAt: now },
  ];
  db.marketingChatAttendants.push(...attendants);

  const channels = [
    { id: createId('mkt-chn'), tenantId: scope.tenantId, clinicId: scope.clinicId, name: 'WhatsApp Principal', type: 'WhatsApp', provider: 'cloud-api', status: 'conectado', connectedAt: now, createdAt: now, updatedAt: now },
    { id: createId('mkt-chn'), tenantId: scope.tenantId, clinicId: scope.clinicId, name: 'Instagram Direct', type: 'Instagram', provider: 'meta', status: 'conectado', connectedAt: now, createdAt: now, updatedAt: now },
    { id: createId('mkt-chn'), tenantId: scope.tenantId, clinicId: scope.clinicId, name: 'Facebook Inbox', type: 'Facebook', provider: 'meta', status: 'desconectado', connectedAt: null, createdAt: now, updatedAt: now },
  ];
  db.marketingChatChannels.push(...channels);
  attendants.forEach((item) => {
    item.channelIds = channels.slice(0, 2).map((ch) => ch.id);
  });

  const contactsSeed = [
    ['Ana Souza', '(11) 99876-1111', 'WhatsApp', 'lead_quente'],
    ['Lucas Ferreira', '(11) 99755-2233', 'Instagram', 'retorno'],
    ['Clara Mendes', '(21) 98888-7621', 'WhatsApp', 'financeiro'],
    ['Rafael Dias', '(31) 99211-5509', 'Webchat', 'agendamento'],
    ['Beatriz Costa', '(41) 99644-9910', 'Facebook', 'retorno'],
    ['Henrique Lima', '(51) 99422-1088', 'WhatsApp', 'lead_quente'],
  ];
  const contacts = contactsSeed.map(([name, phone, origin, stage]) => ({
    id: createId('mkt-contact'),
    tenantId: scope.tenantId,
    clinicId: scope.clinicId,
    name,
    phone,
    origin,
    stage,
    tags: stage ? [stage] : [],
    createdAt: now,
    updatedAt: now,
  }));
  db.marketingChatContacts.push(...contacts);

  const conversations = contacts.map((contact, index) => ({
    id: createId('mkt-conv'),
    tenantId: scope.tenantId,
    clinicId: scope.clinicId,
    contactId: contact.id,
    channel: contact.origin,
    channelId: channels.find((ch) => ch.type === contact.origin)?.id || channels[0].id,
    departmentId: index % 2 === 0 ? departments[0].id : departments[1].id,
    department: index % 2 === 0 ? 'Comercial' : 'Atendimento',
    assigneeId: index % 3 === 0 ? attendants[0].id : index % 3 === 1 ? attendants[1].id : attendants[2].id,
    assignee: index % 3 === 0 ? 'Marina' : index % 3 === 1 ? 'Pedro' : 'Bruna',
    status: index % 4 === 0 ? 'resolvida' : index % 4 === 1 ? 'aguardando_humano' : 'aberta',
    iaMode: index % 3 === 0 ? 'desativada' : 'ativa',
    unreadCount: Math.max(0, (index + 1) % 5),
    lastMessageAt: new Date(Date.now() - (index + 1) * 600000).toISOString(),
    preview: `Mensagem inicial de ${contact.name}.`,
    tags: [...contact.tags],
    createdAt: now,
    updatedAt: now,
  }));
  db.marketingChatConversations.push(...conversations);

  conversations.forEach((conv, index) => {
    const contact = contacts.find((item) => item.id === conv.contactId);
    if (!contact) return;
    db.marketingChatMessages.push(
      {
        id: createId('mkt-msg'),
        tenantId: scope.tenantId,
        clinicId: scope.clinicId,
        conversationId: conv.id,
        direction: 'inbound',
        author: contact.name,
        text: `Oi, sou ${contact.name} e preciso de ajuda.`,
        at: new Date(Date.now() - (index + 1) * 900000).toISOString(),
      },
      {
        id: createId('mkt-msg'),
        tenantId: scope.tenantId,
        clinicId: scope.clinicId,
        conversationId: conv.id,
        direction: 'outbound',
        author: conv.assignee,
        text: 'Perfeito, vou te ajudar agora.',
        at: new Date(Date.now() - (index + 1) * 820000).toISOString(),
      }
    );
    db.marketingChatNotes.push({
      id: createId('mkt-note'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      conversationId: conv.id,
      text: `Nota inicial da conversa com ${contact.name}.`,
      createdAt: now,
      createdBy: 'seed-system',
    });
  });

  db.marketingChatCampaigns.push(
    {
      id: createId('mkt-cp'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      name: 'Reativacao semestral',
      channel: 'WhatsApp',
      status: 'processando',
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      sentCount: 112,
      failedCount: 4,
      totalCount: 260,
      messageTemplate: 'Oi [[primeiro_nome]], temos condicoes especiais este mes.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: createId('mkt-cp'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      name: 'Pos-atendimento NPS',
      channel: 'WhatsApp',
      status: 'enviado',
      scheduledAt: new Date(Date.now() - 86400000).toISOString(),
      sentCount: 180,
      failedCount: 0,
      totalCount: 180,
      messageTemplate: 'Como foi sua experiencia? Responda com uma nota de 0 a 10.',
      createdAt: now,
      updatedAt: now,
    }
  );

  db.marketingChatAutomations.push(
    {
      id: createId('mkt-auto'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      name: 'Recuperacao de conversas sem resposta',
      description: 'Retoma contato apos periodo sem resposta.',
      status: 'active',
      trigger: 'no_reply',
      channel: 'WhatsApp',
      conditionEntry: 'status=aberta; sem resposta por 60 minutos',
      delayMinutes: 60,
      actionMessage: 'Oi [[primeiro_nome]], posso te ajudar com algo mais?',
      departmentId: departments[0].id,
      assigneeId: attendants[0].id,
      steps: [
        { id: createId('mkt-step'), order: 1, type: 'wait', config: { minutes: 60 } },
        { id: createId('mkt-step'), order: 2, type: 'send_message', config: { message: 'Oi [[primeiro_nome]], posso te ajudar com algo mais?' } },
      ],
      lastRunAt: null,
      lastRunStatus: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: createId('mkt-auto'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      name: 'Pos atendimento NPS',
      description: 'Solicita nota apos finalizar conversa.',
      status: 'inactive',
      trigger: 'conversation_resolved',
      channel: 'WhatsApp',
      conditionEntry: 'status=resolvida',
      delayMinutes: 30,
      actionMessage: 'Como foi seu atendimento? Responda de 0 a 10.',
      departmentId: departments[1].id,
      assigneeId: attendants[1].id,
      steps: [
        { id: createId('mkt-step'), order: 1, type: 'wait', config: { minutes: 30 } },
        { id: createId('mkt-step'), order: 2, type: 'send_message', config: { message: 'Como foi seu atendimento? Responda de 0 a 10.' } },
      ],
      lastRunAt: null,
      lastRunStatus: null,
      createdAt: now,
      updatedAt: now,
    }
  );

  db.marketingChatFunnels.push({
    id: createId('mkt-funnel'),
    tenantId: scope.tenantId,
    clinicId: scope.clinicId,
    name: 'Funil principal',
    stages: [
      { id: createId('mkt-stage'), name: 'Novo lead', color: '#6366F1', position: 1 },
      { id: createId('mkt-stage'), name: 'Contato iniciado', color: '#0EA5E9', position: 2 },
      { id: createId('mkt-stage'), name: 'Proposta enviada', color: '#8B5CF6', position: 3 },
      { id: createId('mkt-stage'), name: 'Fechado', color: '#10B981', position: 4 },
    ],
    cards: conversations.slice(0, 5).map((conv, idx) => ({
      id: createId('mkt-card'),
      conversationId: conv.id,
      stagePosition: (idx % 4) + 1,
      title: contacts.find((contact) => contact.id === conv.contactId)?.name || 'Contato',
      updatedAt: conv.updatedAt,
    })),
    createdAt: now,
    updatedAt: now,
  });

  db.marketingChatSettings = {
    ...db.marketingChatSettings,
    tenantId: scope.tenantId,
    clinicId: scope.clinicId,
    accountName: 'LoveOdonto Marketing',
    defaultChannel: 'WhatsApp',
    aiModel: 'Assistente interno (recomendado)',
    autoAssign: true,
    businessHoursOnly: true,
    webhookConfigured: false,
    updatedAt: now,
  };

  db.marketingChatApiConfig = {
    tenantId: scope.tenantId,
    clinicId: scope.clinicId,
    apiToken: `mkt_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
    webhookUrl: '',
    updatedAt: now,
  };

  db.marketingChatWebhookLogs.push({
    id: createId('mkt-log'),
    tenantId: scope.tenantId,
    clinicId: scope.clinicId,
    provider: 'whatsapp',
    eventType: 'message.received',
    status: 'ok',
    payloadPreview: 'Mensagem inbound recebida para conv inicial.',
    createdAt: now,
  });
}

function withMarketingDb(user, mutator) {
  return withDb((db) => {
    const scope = resolveScope(db, user);
    seedMarketingState(db, scope);
    return mutator(db, scope);
  });
}

function readMarketingDb(user) {
  const db = loadDb();
  const scope = resolveScope(db, user);
  seedMarketingState(db, scope);
  return { db, scope };
}

function inScope(item, scope) {
  return item.tenantId === scope.tenantId && item.clinicId === scope.clinicId;
}

function getContactMap(db, scope) {
  const contacts = (db.marketingChatContacts || []).filter((item) => inScope(item, scope));
  return Object.fromEntries(contacts.map((item) => [item.id, item]));
}

function getDepartmentMap(db, scope) {
  const departments = (db.marketingChatDepartments || []).filter((item) => inScope(item, scope));
  return Object.fromEntries(departments.map((item) => [item.id, item]));
}

function getAttendantMap(db, scope) {
  const attendants = (db.marketingChatAttendants || []).filter((item) => inScope(item, scope));
  return Object.fromEntries(attendants.map((item) => [item.id, item]));
}

function scopeKey(scope) {
  return `${scope.tenantId}:${scope.clinicId}`;
}

function toDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function createStepLogBase(step, nowIso) {
  return {
    id: createId('mkt-run-step'),
    stepId: step?.id || null,
    order: Number(step?.order || 0),
    type: step?.type || 'send_message',
    startedAt: nowIso,
    finishedAt: nowIso,
    durationMs: 0,
    status: 'success',
    error: null,
    channel: normalizeText(step?.config?.channel || ''),
    messagePreview: normalizeText(step?.config?.message || '').slice(0, 120),
  };
}

function parseScheduledTime(automation) {
  const text = normalizeText(automation?.conditionEntry || '');
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Math.min(Math.max(Number(match[1] || 0), 0), 23);
  const minute = Math.min(Math.max(Number(match[2] || 0), 0), 59);
  return { hour, minute };
}

function getChannelName(db, scope, channelId, fallbackType = '') {
  const channel = (db.marketingChatChannels || []).find((item) => inScope(item, scope) && item.id === channelId);
  if (channel?.name) return channel.name;
  return normalizeText(fallbackType) || 'Canal';
}

function toComparableValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.getTime();
  return value;
}

function evaluateRule(actualValue, operator, expectedValue) {
  const op = normalizeText(operator || 'equals');
  const actual = toComparableValue(actualValue);
  const expected = toComparableValue(expectedValue);
  if (op === 'equals') return String(actual) === String(expected);
  if (op === 'not_equals') return String(actual) !== String(expected);
  if (op === 'contains') return String(actual).toLowerCase().includes(String(expected).toLowerCase());
  if (op === 'exists') return actual !== '' && actual !== null && actual !== undefined;
  if (op === 'greater_than') return Number(actual) > Number(expected);
  if (op === 'less_than') return Number(actual) < Number(expected);
  if (op === 'in') {
    const list = Array.isArray(expected) ? expected : String(expected).split(',').map((item) => item.trim());
    return list.map(String).includes(String(actual));
  }
  if (op === 'not_in') {
    const list = Array.isArray(expected) ? expected : String(expected).split(',').map((item) => item.trim());
    return !list.map(String).includes(String(actual));
  }
  return false;
}

function evaluateDslConditions(conditionDsl, context) {
  if (!conditionDsl || typeof conditionDsl !== 'object') return true;
  const mode = normalizeText(conditionDsl.mode || 'all').toLowerCase();
  const rules = Array.isArray(conditionDsl.rules) ? conditionDsl.rules : [];
  if (rules.length === 0) return true;
  const evalRule = (rule) => {
    const field = normalizeText(rule?.field);
    const operator = normalizeText(rule?.operator || 'equals');
    const expected = rule?.value;
    if (!field) return true;
    if (field === 'conversation_status') return evaluateRule(context.conversation?.status, operator, expected);
    if (field === 'channel') return evaluateRule(context.channel?.type || context.channel?.name, operator, expected);
    if (field === 'tag_exists' || field === 'contact_has_tag') {
      const tags = new Set([...(context.conversation?.tags || []), ...(context.contact?.tags || [])].map((item) => String(item)));
      if (operator === 'exists') return tags.size > 0;
      if (operator === 'contains' || operator === 'equals') return tags.has(String(expected));
      if (operator === 'not_equals') return !tags.has(String(expected));
      return evaluateRule(Array.from(tags).join(','), operator, expected);
    }
    if (field === 'department_id') return evaluateRule(context.conversation?.departmentId, operator, expected);
    if (field === 'attendant_id') return evaluateRule(context.conversation?.assigneeId, operator, expected);
    if (field === 'contact_last_interaction_at') {
      const actualMs = toDate(context.conversation?.lastMessageAt)?.getTime() || 0;
      const expectedMs = toDate(expected)?.getTime() || Number(expected || 0);
      return evaluateRule(actualMs, operator, expectedMs);
    }
    if (field === 'no_reply_minutes') {
      const lastMs = toDate(context.conversation?.lastMessageAt)?.getTime() || 0;
      const diffMin = Math.floor((Date.now() - lastMs) / 60000);
      return evaluateRule(diffMin, operator, Number(expected || 0));
    }
    if (field === 'conversation_created_at') {
      const actualMs = toDate(context.conversation?.createdAt)?.getTime() || 0;
      const expectedMs = toDate(expected)?.getTime() || Number(expected || 0);
      return evaluateRule(actualMs, operator, expectedMs);
    }
    if (field === 'scheduled_time_window') {
      const windowText = String(expected || '');
      const [start, end] = windowText.split('-').map((item) => item.trim());
      const nowText = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
      return nowText >= (start || '00:00') && nowText <= (end || '23:59');
    }
    return true;
  };
  const values = rules.map(evalRule);
  return mode === 'any' ? values.some(Boolean) : values.every(Boolean);
}

function renderMarketingTemplateInternal(template, context) {
  const input = String(template || '');
  const map = {
    'contact.name': context.contact?.name || '',
    'contact.phone': context.contact?.phone || '',
    'conversation.id': context.conversation?.id || '',
    'conversation.status': context.conversation?.status || '',
    'channel.name': context.channel?.name || context.channel?.type || '',
    'clinic.name': context.clinic?.name || '',
    'department.name': context.department?.name || '',
    'attendant.name': context.attendant?.name || '',
    now: new Date().toISOString(),
  };
  return input.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key) => {
    return map[key] !== undefined ? String(map[key]) : '';
  });
}

function updateRuntimeDailyMetrics(db, scope, run, stepLogs) {
  const day = String(run.startedAt || new Date().toISOString()).slice(0, 10);
  if (!Array.isArray(db.marketingAutomationMetricsDaily)) db.marketingAutomationMetricsDaily = [];
  let record = db.marketingAutomationMetricsDaily.find(
    (item) => inScope(item, scope) && item.day === day
  );
  if (!record) {
    record = {
      id: createId('mkt-metric'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      day,
      totalRuns: 0,
      successRuns: 0,
      failedRuns: 0,
      totalDurationMs: 0,
      byAutomation: {},
      byChannel: {},
      stepFailures: {},
      updatedAt: new Date().toISOString(),
    };
    db.marketingAutomationMetricsDaily.push(record);
  }
  record.totalRuns += 1;
  if (run.status === 'success') record.successRuns += 1;
  if (run.status === 'failed') record.failedRuns += 1;
  record.totalDurationMs += Number(run.durationMs || 0);
  record.byAutomation[run.automationId] = Number(record.byAutomation[run.automationId] || 0) + 1;
  record.byChannel[run.channel || 'Desconhecido'] = Number(record.byChannel[run.channel || 'Desconhecido'] || 0) + 1;
  stepLogs
    .filter((step) => step.status === 'failed')
    .forEach((step) => {
      const key = `${step.type || 'unknown'}#${step.order || 0}`;
      record.stepFailures[key] = Number(record.stepFailures[key] || 0) + 1;
    });
  record.updatedAt = new Date().toISOString();
}

function queueEventToJobs(db, scope, event) {
  const nowIso = new Date().toISOString();
  const forcedAutomationId = event?.payload?.automationId || null;
  const dedupeBucket = Math.floor(Date.now() / (DEDUPE_WINDOW_MINUTES * 60000));
  const automations = (db.marketingChatAutomations || []).filter((automation) => {
    if (!inScope(automation, scope)) return false;
    if (automation.status !== 'active') return false;
    if (forcedAutomationId && forcedAutomationId !== automation.id) return false;
    if (!forcedAutomationId && normalizeText(automation.trigger) !== normalizeText(event.type)) return false;
    return true;
  });
  const createdJobs = [];
  automations.forEach((automation) => {
    const dedupeKey = normalizeText(event.dedupeKey)
      || `${event.type}:${automation.id}:${event.conversationId || 'none'}:${event.contactId || 'none'}:${dedupeBucket}`;
    const exists = (db.marketingScheduledJobs || []).some(
      (job) => inScope(job, scope) && job.dedupeKey === dedupeKey && !['cancelled'].includes(job.status)
    );
    if (exists) return;
    const job = {
      id: createId('mkt-job'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      dedupeKey,
      idempotencyKey: `job:${dedupeKey}`,
      eventId: event.id,
      automationId: automation.id,
      triggerType: event.type,
      conversationId: event.conversationId || null,
      contactId: event.contactId || null,
      channel: event.channel || automation.channel || 'WhatsApp',
      status: 'queued',
      runAt: event.scheduledAt || nowIso,
      lockedAt: null,
      completedAt: null,
      attemptCount: 0,
      maxAttempts: JOB_MAX_ATTEMPTS,
      nextStepIndex: 0,
      runId: null,
      lockToken: null,
      lockExpiresAt: null,
      reprocessCount: 0,
      reprocessOfJobId: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastError: null,
    };
    db.marketingScheduledJobs.push(job);
    createdJobs.push(job);
  });
  event.status = createdJobs.length > 0 ? 'dispatched' : 'ignored';
  event.processedAt = nowIso;
  return createdJobs;
}

function createAutomationEvent(db, scope, payload) {
  if (!Array.isArray(db.marketingAutomationEvents)) db.marketingAutomationEvents = [];
  const dedupeKey = normalizeText(payload.dedupeKey);
  if (dedupeKey) {
    const already = db.marketingAutomationEvents.some(
      (item) => inScope(item, scope) && item.dedupeKey === dedupeKey
    );
    if (already) return null;
  }
  const event = {
    id: createId('mkt-event'),
    tenantId: scope.tenantId,
    clinicId: scope.clinicId,
    type: payload.type,
    status: 'pending',
    channel: payload.channel || null,
    conversationId: payload.conversationId || null,
    contactId: payload.contactId || null,
    tag: payload.tag || null,
    scheduledAt: payload.scheduledAt || null,
    payload: payload.payload && typeof payload.payload === 'object' ? payload.payload : {},
    dedupeKey: dedupeKey || '',
    idempotencyKey: dedupeKey ? `event:${dedupeKey}` : `event:${payload.type}:${Date.now()}`,
    createdAt: new Date().toISOString(),
    processedAt: null,
  };
  db.marketingAutomationEvents.push(event);
  return event;
}

function generateSyntheticRuntimeEvents(db, scope, nowDate) {
  const nowIso = nowDate.toISOString();
  const nowMs = nowDate.getTime();
  const automations = (db.marketingChatAutomations || []).filter(
    (item) => inScope(item, scope) && item.status === 'active'
  );
  const conversations = (db.marketingChatConversations || []).filter((item) => inScope(item, scope));

  conversations.forEach((conversation) => {
    createAutomationEvent(db, scope, {
      type: 'conversation_created',
      channel: conversation.channel,
      conversationId: conversation.id,
      contactId: conversation.contactId,
      dedupeKey: `conversation_created:${conversation.id}`,
      payload: { conversationId: conversation.id },
    });
  });

  automations
    .filter((item) => item.trigger === 'no_reply')
    .forEach((automation) => {
      const thresholdMin = Math.max(1, Number(automation.delayMinutes || 30));
      conversations
        .filter((conversation) => conversation.status !== 'resolvida')
        .forEach((conversation) => {
          const last = toDate(conversation.lastMessageAt)?.getTime() || 0;
          if (nowMs - last < thresholdMin * 60000) return;
          const bucket = Math.floor(nowMs / (thresholdMin * 60000));
          createAutomationEvent(db, scope, {
            type: 'no_reply',
            channel: conversation.channel,
            conversationId: conversation.id,
            contactId: conversation.contactId,
            dedupeKey: `no_reply:${automation.id}:${conversation.id}:${bucket}`,
            payload: { automationId: automation.id, thresholdMin },
          });
        });
    });

  automations
    .filter((item) => item.trigger === 'scheduled_time')
    .forEach((automation) => {
      const hhmm = parseScheduledTime(automation);
      if (!hhmm) return;
      if (nowDate.getHours() !== hhmm.hour || nowDate.getMinutes() !== hhmm.minute) return;
      createAutomationEvent(db, scope, {
        type: 'scheduled_time',
        channel: automation.channel,
        dedupeKey: `scheduled_time:${automation.id}:${nowIso.slice(0, 13)}:${hhmm.minute}`,
        payload: { automationId: automation.id, scheduled: `${hhmm.hour}:${String(hhmm.minute).padStart(2, '0')}` },
      });
    });
}

function ensureRunForJob(db, scope, job, automation, nowIso) {
  let run = (db.marketingAutomationRuns || []).find((item) => inScope(item, scope) && item.id === job.runId);
  if (!run) {
    run = (db.marketingAutomationRuns || []).find(
      (item) => inScope(item, scope) && item.jobId === job.id && item.idempotencyKey === `run:${job.idempotencyKey || job.id}`
    );
  }
  if (run) return run;
  run = {
    id: createId('mkt-run'),
    tenantId: scope.tenantId,
    clinicId: scope.clinicId,
    automationId: automation.id,
    eventId: job.eventId,
    jobId: job.id,
    triggerType: job.triggerType,
    conversationId: job.conversationId,
    contactId: job.contactId,
    channel: job.channel || automation.channel || 'WhatsApp',
    status: 'running',
    startedAt: nowIso,
    finishedAt: null,
    durationMs: 0,
    error: null,
    idempotencyKey: `run:${job.idempotencyKey || job.id}`,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  db.marketingAutomationRuns.push(run);
  job.runId = run.id;
  return run;
}

function finishRun(run, status, nowIso, errorMessage = null) {
  run.status = status;
  run.error = errorMessage;
  run.finishedAt = nowIso;
  run.durationMs = Math.max(0, new Date(nowIso).getTime() - new Date(run.startedAt).getTime());
  run.updatedAt = nowIso;
}

function processSingleScheduledJob(db, scope, job, runtimeUser) {
  const now = new Date();
  const nowIso = now.toISOString();
  const automation = (db.marketingChatAutomations || []).find((item) => inScope(item, scope) && item.id === job.automationId);
  if (!automation || automation.status !== 'active') {
    job.status = 'cancelled';
    job.updatedAt = nowIso;
    job.lastError = 'Automacao inativa ou inexistente.';
    return;
  }
  const lockExpiresMs = toDate(job.lockExpiresAt)?.getTime() || 0;
  const isLocked = Boolean(job.lockToken) && lockExpiresMs > now.getTime();
  if (isLocked) return;

  const lockToken = createId('mkt-lock');
  job.status = 'running';
  job.lockToken = lockToken;
  job.lockedAt = nowIso;
  job.lockExpiresAt = new Date(now.getTime() + JOB_LOCK_TTL_MS).toISOString();
  job.updatedAt = nowIso;

  const steps = [...(automation.steps || [])].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const run = ensureRunForJob(db, scope, job, automation, nowIso);
  const createdStepLogs = [];
  try {
    let continueLoop = true;
    while (continueLoop && job.nextStepIndex < steps.length) {
      if (job.lockToken !== lockToken) {
        throw new Error('Lock invalido para processamento do job.');
      }
      const step = steps[job.nextStepIndex];
      const existingSuccessStep = (db.marketingAutomationRunSteps || []).find(
        (item) => inScope(item, scope)
          && item.jobId === job.id
          && Number(item.order || 0) === Number(step?.order || 0)
          && item.status === 'success'
      );
      if (existingSuccessStep) {
        job.nextStepIndex += 1;
        continue;
      }

      const startedAt = new Date();
      const startedAtIso = startedAt.toISOString();
      const stepBase = createStepLogBase(step, startedAtIso);
      stepBase.runId = run.id;
      stepBase.jobId = job.id;
      stepBase.automationId = automation.id;
      stepBase.channel = normalizeText(step?.config?.channel || job.channel || automation.channel || '');
      stepBase.idempotencyKey = `step:${job.id}:${step.id || step.order || job.nextStepIndex}`;

      const conversation = (db.marketingChatConversations || []).find(
        (item) => inScope(item, scope) && item.id === job.conversationId
      ) || (db.marketingChatConversations || []).find((item) => inScope(item, scope) && item.status !== 'resolvida');
      const contact = (db.marketingChatContacts || []).find((item) => inScope(item, scope) && item.id === (job.contactId || conversation?.contactId));
      const channelItem = (db.marketingChatChannels || []).find((item) => inScope(item, scope) && item.id === conversation?.channelId);
      const department = (db.marketingChatDepartments || []).find((item) => inScope(item, scope) && item.id === conversation?.departmentId);
      const attendant = (db.marketingChatAttendants || []).find((item) => inScope(item, scope) && item.id === conversation?.assigneeId);
      const context = {
        conversation,
        contact,
        channel: channelItem || { name: getChannelName(db, scope, conversation?.channelId, conversation?.channel) },
        clinic: { name: db?.clinicProfile?.nomeClinica || db?.clinicProfile?.nomeFantasia || 'Clinica' },
        department,
        attendant,
      };

      const conditionDsl = step?.config?.conditionDsl;
      const legacyCondition = normalizeText(step?.config?.condition);
      const conditionOk = conditionDsl
        ? evaluateDslConditions(conditionDsl, context)
        : legacyCondition
          ? evaluateDslConditions({ mode: 'all', rules: [{ field: 'conversation_status', operator: 'equals', value: legacyCondition.split('=')[1] }] }, context)
          : true;
      if (!conditionOk) {
        stepBase.status = 'skipped';
        stepBase.error = 'Condicao do step nao atendida.';
        db.marketingAutomationRunSteps.push(stepBase);
        createdStepLogs.push(stepBase);
        job.nextStepIndex += 1;
        continue;
      }

      const actionType = normalizeText(step?.type || 'send_message');
      const config = step?.config && typeof step.config === 'object' ? step.config : {};

      if (actionType === 'wait') {
        const minutes = Math.max(0, Number(config.minutes ?? automation.delayMinutes ?? 0));
        stepBase.finishedAt = new Date().toISOString();
        stepBase.durationMs = Math.max(0, new Date(stepBase.finishedAt).getTime() - startedAt.getTime());
        db.marketingAutomationRunSteps.push(stepBase);
        createdStepLogs.push(stepBase);
        job.nextStepIndex += 1;
        if (minutes > 0) {
          job.status = 'queued';
          job.lockToken = null;
          job.lockedAt = null;
          job.lockExpiresAt = null;
          job.runAt = new Date(Date.now() + minutes * 60000).toISOString();
          continueLoop = false;
        }
        continue;
      }

      if (!conversation) throw new Error('Conversa nao encontrada para o step.');
      const targetTag = normalizeText(config.tag || config.value);
      const targetDepartmentId = config.departmentId || config.value || null;
      const targetAttendantId = config.attendantId || config.value || null;

      if (actionType === 'send_message') {
        const template = normalizeText(config.message) || normalizeText(automation.actionMessage);
        if (!template) throw new Error('Step send_message sem template configurado.');
        const renderedText = renderMarketingTemplateInternal(template, context);
        db.marketingChatMessages.push({
          id: createId('mkt-msg'),
          tenantId: scope.tenantId,
          clinicId: scope.clinicId,
          conversationId: conversation.id,
          direction: 'outbound',
          author: runtimeUser?.name || 'Automacao',
          text: renderedText,
          at: new Date().toISOString(),
        });
        conversation.preview = renderedText;
        conversation.lastMessageAt = new Date().toISOString();
        conversation.updatedAt = new Date().toISOString();
        stepBase.messagePreview = renderedText.slice(0, 120);
      } else if (actionType === 'add_tag') {
        if (!targetTag) throw new Error('Step add_tag sem tag.');
        const tags = new Set(conversation.tags || []);
        tags.add(targetTag);
        conversation.tags = Array.from(tags);
      } else if (actionType === 'remove_tag') {
        if (!targetTag) throw new Error('Step remove_tag sem tag.');
        conversation.tags = (conversation.tags || []).filter((item) => item !== targetTag);
      } else if (actionType === 'assign_department') {
        if (!targetDepartmentId) throw new Error('Step assign_department sem departmentId.');
        const departmentItem = (db.marketingChatDepartments || []).find((item) => inScope(item, scope) && item.id === targetDepartmentId);
        if (!departmentItem) throw new Error('Departamento informado nao existe.');
        conversation.departmentId = departmentItem.id;
        conversation.department = departmentItem.name;
      } else if (actionType === 'assign_attendant') {
        if (!targetAttendantId) throw new Error('Step assign_attendant sem attendantId.');
        const attendantItem = (db.marketingChatAttendants || []).find((item) => inScope(item, scope) && item.id === targetAttendantId);
        if (!attendantItem) throw new Error('Atendente informado nao existe.');
        conversation.assigneeId = attendantItem.id;
        conversation.assignee = attendantItem.name;
      } else if (actionType === 'resolve_conversation') {
        conversation.status = 'resolvida';
      } else if (actionType === 'reopen_conversation') {
        conversation.status = 'aberta';
      } else if (actionType === 'webhook_outbound') {
        const webhookTarget = normalizeText(config.url || db.marketingChatApiConfig?.webhookUrl);
        if (!webhookTarget) throw new Error('Webhook outbound sem URL configurada.');
        db.marketingChatWebhookLogs.push({
          id: createId('mkt-log'),
          tenantId: scope.tenantId,
          clinicId: scope.clinicId,
          provider: 'webhook_outbound',
          eventType: 'automation.step',
          status: 'ok',
          payloadPreview: `POST simulado para ${webhookTarget}`,
          createdAt: new Date().toISOString(),
        });
      } else {
        stepBase.status = 'skipped';
        stepBase.error = `Tipo de step nao suportado: ${actionType}`;
      }

      stepBase.finishedAt = new Date().toISOString();
      stepBase.durationMs = Math.max(0, new Date(stepBase.finishedAt).getTime() - startedAt.getTime());
      db.marketingAutomationRunSteps.push(stepBase);
      createdStepLogs.push(stepBase);
      job.nextStepIndex += 1;
    }

    if (job.nextStepIndex >= steps.length) {
      const doneAt = new Date().toISOString();
      job.status = 'completed';
      job.lockToken = null;
      job.lockedAt = null;
      job.lockExpiresAt = null;
      job.completedAt = doneAt;
      job.updatedAt = doneAt;
      finishRun(run, 'success', doneAt, null);
      automation.lastRunAt = doneAt;
      automation.lastRunStatus = 'success';
      automation.updatedAt = doneAt;
      updateRuntimeDailyMetrics(db, scope, run, createdStepLogs);
    }
  } catch (error) {
    const failedNow = new Date().toISOString();
    const errorText = error?.message || 'Falha na execucao da automacao.';
    db.marketingAutomationRunSteps.push({
      id: createId('mkt-run-step'),
      runId: run.id,
      jobId: job.id,
      automationId: automation.id,
      stepId: steps[job.nextStepIndex]?.id || null,
      order: Number(steps[job.nextStepIndex]?.order || job.nextStepIndex + 1),
      type: steps[job.nextStepIndex]?.type || 'unknown',
      startedAt: failedNow,
      finishedAt: failedNow,
      durationMs: 0,
      status: 'failed',
      error: errorText,
      channel: job.channel || '',
      messagePreview: '',
      idempotencyKey: `step-fail:${job.id}:${job.nextStepIndex}`,
    });
    const fallbackMessage = normalizeText(steps[job.nextStepIndex]?.config?.fallbackMessage);
    const fallbackConversation = (db.marketingChatConversations || []).find(
      (item) => inScope(item, scope) && item.id === job.conversationId
    );
    if (fallbackMessage && fallbackConversation) {
      const fallbackRendered = renderMarketingTemplateInternal(fallbackMessage, {
        conversation: fallbackConversation,
        contact: (db.marketingChatContacts || []).find((item) => inScope(item, scope) && item.id === fallbackConversation.contactId),
        channel: (db.marketingChatChannels || []).find((item) => inScope(item, scope) && item.id === fallbackConversation.channelId) || { name: fallbackConversation.channel },
        clinic: { name: db?.clinicProfile?.nomeClinica || db?.clinicProfile?.nomeFantasia || 'Clinica' },
        department: (db.marketingChatDepartments || []).find((item) => inScope(item, scope) && item.id === fallbackConversation.departmentId),
        attendant: (db.marketingChatAttendants || []).find((item) => inScope(item, scope) && item.id === fallbackConversation.assigneeId),
      });
      db.marketingChatMessages.push({
        id: createId('mkt-msg'),
        tenantId: scope.tenantId,
        clinicId: scope.clinicId,
        conversationId: fallbackConversation.id,
        direction: 'outbound',
        author: runtimeUser?.name || 'Automacao',
        text: fallbackRendered,
        at: failedNow,
      });
      fallbackConversation.preview = fallbackRendered;
      fallbackConversation.lastMessageAt = failedNow;
      fallbackConversation.updatedAt = failedNow;
    }
    job.attemptCount = Number(job.attemptCount || 0) + 1;
    job.lastError = errorText;
    db.marketingJobAttempts.push({
      id: createId('mkt-attempt'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      jobId: job.id,
      runId: run.id,
      attempt: job.attemptCount,
      status: job.attemptCount >= Number(job.maxAttempts || JOB_MAX_ATTEMPTS) ? 'failed' : 'retrying',
      error: errorText,
      createdAt: failedNow,
    });
    if (job.attemptCount >= Number(job.maxAttempts || JOB_MAX_ATTEMPTS)) {
      job.status = 'failed';
      job.lockToken = null;
      job.lockedAt = null;
      job.lockExpiresAt = null;
      job.completedAt = failedNow;
      job.updatedAt = failedNow;
      finishRun(run, 'failed', failedNow, errorText);
      automation.lastRunAt = failedNow;
      automation.lastRunStatus = 'failed';
      automation.updatedAt = failedNow;
      updateRuntimeDailyMetrics(db, scope, run, [{ status: 'failed', type: steps[job.nextStepIndex]?.type, order: steps[job.nextStepIndex]?.order }]);
    } else {
      job.status = 'retrying';
      job.lockToken = null;
      job.lockedAt = null;
      job.lockExpiresAt = null;
      job.runAt = new Date(new Date(failedNow).getTime() + JOB_RETRY_BASE_SECONDS * 1000 * job.attemptCount).toISOString();
      job.updatedAt = failedNow;
      run.status = 'running';
      run.updatedAt = failedNow;
    }
  }
}

function buildRuntimeMetricsFromDb(db, scope) {
  const runs = (db.marketingAutomationRuns || []).filter((item) => inScope(item, scope));
  const steps = (db.marketingAutomationRunSteps || []).filter((item) => inScope(item, scope));
  const totalRuns = runs.length;
  const successRuns = runs.filter((item) => item.status === 'success').length;
  const failedRuns = runs.filter((item) => item.status === 'failed').length;
  const successRate = totalRuns > 0 ? Number(((successRuns / totalRuns) * 100).toFixed(1)) : 0;
  const avgDurationMs = totalRuns > 0
    ? Math.round(runs.reduce((acc, run) => acc + Number(run.durationMs || 0), 0) / totalRuns)
    : 0;
  const byAutomationRaw = runs.reduce((acc, run) => {
    acc[run.automationId] = Number(acc[run.automationId] || 0) + 1;
    return acc;
  }, {});
  const automationMap = Object.fromEntries(
    (db.marketingChatAutomations || []).filter((item) => inScope(item, scope)).map((item) => [item.id, item.name])
  );
  const topAutomations = Object.entries(byAutomationRaw)
    .map(([automationId, volume]) => ({ automationId, automationName: automationMap[automationId] || automationId, volume }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5);
  const stepFailureMap = steps
    .filter((item) => item.status === 'failed')
    .reduce((acc, step) => {
      const key = `${step.type || 'unknown'}#${step.order || 0}`;
      acc[key] = Number(acc[key] || 0) + 1;
      return acc;
    }, {});
  const topFailedSteps = Object.entries(stepFailureMap)
    .map(([stepKey, failures]) => ({ stepKey, failures }))
    .sort((a, b) => b.failures - a.failures)
    .slice(0, 5);
  const channelMap = runs.reduce((acc, run) => {
    const key = run.channel || 'Desconhecido';
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {});
  const channelsVolume = Object.entries(channelMap)
    .map(([channel, volume]) => ({ channel, volume }))
    .sort((a, b) => b.volume - a.volume);
  return {
    totalRuns,
    successRuns,
    failedRuns,
    successRate,
    avgDurationMs,
    topAutomations,
    topFailedSteps,
    channelsVolume,
  };
}

function runMarketingAutomationTickSync(user) {
  return withMarketingDb(user, (db, scope) => {
    const now = new Date();
    const nowIso = now.toISOString();
    if (!Array.isArray(db.marketingAutomationEvents)) db.marketingAutomationEvents = [];
    if (!Array.isArray(db.marketingScheduledJobs)) db.marketingScheduledJobs = [];
    if (!Array.isArray(db.marketingAutomationRuns)) db.marketingAutomationRuns = [];
    if (!Array.isArray(db.marketingAutomationRunSteps)) db.marketingAutomationRunSteps = [];
    if (!Array.isArray(db.marketingJobAttempts)) db.marketingJobAttempts = [];

    generateSyntheticRuntimeEvents(db, scope, now);

    (db.marketingAutomationEvents || [])
      .filter((event) => inScope(event, scope) && event.status === 'pending')
      .forEach((event) => {
        queueEventToJobs(db, scope, event);
      });

    (db.marketingScheduledJobs || [])
      .filter((job) => inScope(job, scope))
      .filter((job) => ['queued', 'retrying', 'running'].includes(job.status))
      .filter((job) => {
        const runAt = toDate(job.runAt)?.getTime() || 0;
        return runAt <= now.getTime();
      })
      .forEach((job) => {
        processSingleScheduledJob(db, scope, job, user);
      });

    const oldCut = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    db.marketingScheduledJobs = (db.marketingScheduledJobs || []).filter((job) => {
      if (!inScope(job, scope)) return true;
      if (!['completed', 'failed', 'cancelled'].includes(job.status)) return true;
      return String(job.updatedAt || '') >= oldCut;
    });
    db.marketingAutomationEvents = (db.marketingAutomationEvents || []).filter((event) => {
      if (!inScope(event, scope)) return true;
      return String(event.createdAt || '') >= oldCut;
    });

    return {
      processedAt: nowIso,
    };
  });
}

export function startMarketingAutomationRuntime(user) {
  if (!user) return () => {};
  const { scope } = readMarketingDb(user);
  const key = scopeKey(scope);
  if (runtimeRegistry.has(key)) {
    return runtimeRegistry.get(key).stop;
  }
  runMarketingAutomationTickSync(user);
  const intervalId = setInterval(() => {
    try {
      runMarketingAutomationTickSync(user);
    } catch (error) {
      console.error('Erro no runtime de automacoes:', error);
    }
  }, RUNTIME_TICK_MS);
  const stop = () => {
    clearInterval(intervalId);
    runtimeRegistry.delete(key);
  };
  runtimeRegistry.set(key, { intervalId, stop });
  return stop;
}

export function stopMarketingAutomationRuntime(user) {
  if (!user) {
    runtimeRegistry.forEach((entry) => entry.stop());
    runtimeRegistry.clear();
    return;
  }
  const { scope } = readMarketingDb(user);
  const key = scopeKey(scope);
  const entry = runtimeRegistry.get(key);
  if (entry) entry.stop();
}

export async function runMarketingAutomationSchedulerTick(user) {
  return runMarketingAutomationTickSync(user);
}

export async function emitMarketingAutomationEvent(user, payload) {
  await wait();
  assertCanWrite(user);
  const type = normalizeText(payload?.type);
  if (!type) throw new Error('Tipo de evento obrigatorio.');
  return withMarketingDb(user, (db, scope) => {
    const event = createAutomationEvent(db, scope, {
      type,
      channel: payload?.channel || null,
      conversationId: payload?.conversationId || null,
      contactId: payload?.contactId || null,
      tag: payload?.tag || null,
      scheduledAt: payload?.scheduledAt || null,
      dedupeKey: payload?.dedupeKey || '',
      payload: payload?.payload || {},
    });
    if (!event) return null;
    queueEventToJobs(db, scope, event);
    return event;
  });
}

export async function listMarketingAutomationRuns({
  user,
  page = 1,
  pageSize = 10,
  status = 'todos',
  search = '',
  automationId = 'todos',
  channel = 'todos',
  period = '30d',
  conversationId = '',
  contactId = '',
} = {}) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  const normalized = String(search || '').toLowerCase();
  const periodDays = period === '7d' ? 7 : period === 'today' ? 1 : 30;
  const periodCut = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const automationsMap = Object.fromEntries(
    (db.marketingChatAutomations || []).filter((item) => inScope(item, scope)).map((item) => [item.id, item])
  );
  const eventsMap = Object.fromEntries(
    (db.marketingAutomationEvents || []).filter((item) => inScope(item, scope)).map((item) => [item.id, item])
  );
  const jobsMap = Object.fromEntries(
    (db.marketingScheduledJobs || []).filter((item) => inScope(item, scope)).map((item) => [item.id, item])
  );
  const runs = (db.marketingAutomationRuns || [])
    .filter((item) => inScope(item, scope))
    .map((item) => ({
      ...item,
      automationName: automationsMap[item.automationId]?.name || 'Automacao',
      eventPayload: eventsMap[item.eventId]?.payload || {},
      eventType: eventsMap[item.eventId]?.type || item.triggerType,
      eventDedupeKey: eventsMap[item.eventId]?.dedupeKey || '',
      jobStatus: jobsMap[item.jobId]?.status || '',
      jobAttempts: Number(jobsMap[item.jobId]?.attemptCount || 0),
    }))
    .filter((item) => {
      const statusOk = status === 'todos' ? true : item.status === status;
      const automationOk = automationId === 'todos' ? true : item.automationId === automationId;
      const channelOk = channel === 'todos' ? true : String(item.channel || '').toLowerCase() === String(channel).toLowerCase();
      const conversationOk = conversationId ? item.conversationId === conversationId : true;
      const contactOk = contactId ? item.contactId === contactId : true;
      const periodOk = (toDate(item.startedAt)?.getTime() || 0) >= periodCut;
      const text = `${item.automationName} ${item.triggerType} ${item.channel} ${item.error || ''}`.toLowerCase();
      const searchOk = normalized ? text.includes(normalized) : true;
      return statusOk && searchOk && automationOk && channelOk && periodOk && conversationOk && contactOk;
    })
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const paged = paginate(runs, page, pageSize);
  const runIds = new Set(paged.data.map((item) => item.id));
  const steps = (db.marketingAutomationRunSteps || [])
    .filter((step) => inScope(step, scope) && runIds.has(step.runId))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const byRun = steps.reduce((acc, step) => {
    if (!acc[step.runId]) acc[step.runId] = [];
    acc[step.runId].push(step);
    return acc;
  }, {});
  return {
    ...paged,
    data: paged.data.map((run) => ({
      ...run,
      steps: byRun[run.id] || [],
    })),
  };
}

export async function listMarketingAutomationObservability({
  user,
  status = 'todos',
  automationId = 'todos',
  channel = 'todos',
  period = '30d',
  search = '',
  conversationId = '',
  contactId = '',
  page = 1,
  pageSize = 10,
} = {}) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  const jobs = (db.marketingScheduledJobs || []).filter((item) => inScope(item, scope));
  const runsResponse = await listMarketingAutomationRuns({
    user,
    status,
    automationId,
    channel,
    period,
    search,
    conversationId,
    contactId,
    page,
    pageSize,
  });
  const byStatus = jobs.reduce((acc, job) => {
    acc[job.status] = Number(acc[job.status] || 0) + 1;
    return acc;
  }, {});
  const runsById = Object.fromEntries(runsResponse.data.map((item) => [item.id, item]));
  return {
    summary: {
      queued: Number(byStatus.queued || 0),
      running: Number(byStatus.running || 0),
      retrying: Number(byStatus.retrying || 0),
      failed: Number(byStatus.failed || 0),
      completed: Number(byStatus.completed || 0),
      cancelled: Number(byStatus.cancelled || 0),
    },
    jobs: jobs
      .filter((job) => {
        const statusOk = status === 'todos' ? true : job.status === status;
        const automationOk = automationId === 'todos' ? true : job.automationId === automationId;
        const channelOk = channel === 'todos' ? true : String(job.channel || '').toLowerCase() === String(channel).toLowerCase();
        const conversationOk = conversationId ? job.conversationId === conversationId : true;
        const contactOk = contactId ? job.contactId === contactId : true;
        return statusOk && automationOk && channelOk && conversationOk && contactOk;
      })
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 80),
    runs: runsResponse,
    timeline: runsResponse.data.map((run) => ({
      runId: run.id,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      status: run.status,
      steps: run.steps || [],
      payload: run.eventPayload || {},
      error: run.error || null,
      durationMs: run.durationMs || 0,
      jobStatus: run.jobStatus || '',
      jobAttempts: run.jobAttempts || 0,
      sourceJob: jobs.find((job) => job.id === run.jobId) || null,
      sourceRun: runsById[run.id] || null,
    })),
  };
}

export async function getMarketingAutomationRuntimeMetrics(user) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  return buildRuntimeMetricsFromDb(db, scope);
}

export async function getMarketingDashboardSnapshot(user) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  const conversations = (db.marketingChatConversations || []).filter((item) => inScope(item, scope));
  const messages = (db.marketingChatMessages || []).filter((item) => inScope(item, scope));
  const campaigns = (db.marketingChatCampaigns || []).filter((item) => inScope(item, scope));

  const openCount = conversations.filter((item) => item.status === 'aberta').length;
  const resolvedCount = conversations.filter((item) => item.status === 'resolvida').length;
  const waitingHuman = conversations.filter((item) => item.status === 'aguardando_humano').length;
  const unread = conversations.reduce((acc, item) => acc + Number(item.unreadCount || 0), 0);
  const iaActive = conversations.filter((item) => item.iaMode === 'ativa').length;
  const avgResponseMinutes = 3 + Math.floor((messages.length % 5) + 1);
  const campaignTotal = campaigns.reduce((acc, item) => acc + Number(item.totalCount || 0), 0);
  const campaignSent = campaigns.reduce((acc, item) => acc + Number(item.sentCount || 0), 0);
  const deliveryRate = campaignTotal > 0 ? `${((campaignSent / campaignTotal) * 100).toFixed(1)}%` : '0.0%';
  const runtimeMetrics = buildRuntimeMetricsFromDb(db, scope);

  const waitingConversations = conversations
    .filter((item) => item.status !== 'resolvida')
    .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
    .slice(0, 6)
    .map((item) => {
      const diffMin = Math.max(1, Math.floor((Date.now() - new Date(item.lastMessageAt).getTime()) / 60000));
      return {
        id: item.id,
        contactName: getContactMap(db, scope)[item.contactId]?.name || 'Contato',
        waitingSince: `${diffMin}m`,
        channel: item.channel,
      };
    });

  return {
    kpis: [
      { id: 'msgs-total', label: 'Mensagens totais', value: messages.length, delta: '+0.0%' },
      { id: 'conv-open', label: 'Conversas abertas', value: openCount, delta: '+0.0%' },
      { id: 'conv-resolved', label: 'Resolvidas no período', value: resolvedCount, delta: '+0.0%' },
      { id: 'auto-total-runs', label: 'Execucoes de automacao', value: runtimeMetrics.totalRuns, delta: '+0.0%' },
      { id: 'sla', label: 'Tempo médio de resposta', value: `0${avgResponseMinutes}m 12s`, delta: '-0.0%' },
      { id: 'auto-success-rate', label: 'Taxa de sucesso automacoes', value: `${runtimeMetrics.successRate}%`, delta: '+0.0pp' },
      { id: 'ia-rate', label: 'Respostas por IA', value: `${Math.round((iaActive / Math.max(conversations.length, 1)) * 100)}%`, delta: '+0.0pp' },
      { id: 'sat', label: 'Taxa de entrega campanhas', value: deliveryRate, delta: '+0.0pp' },
    ],
    nowCards: [
      { id: 'unread', label: 'Nao lidas', value: unread },
      { id: 'waiting-human', label: 'Aguardando humano', value: waitingHuman },
      { id: 'active-ia', label: 'IA ativa', value: iaActive },
      { id: 'scheduled-today', label: 'Mensagens agendadas (hoje)', value: campaigns.filter((item) => item.status === 'processando').length },
      { id: 'auto-failed', label: 'Falhas de automacao', value: runtimeMetrics.failedRuns },
    ],
    waitingConversations,
  };
}

export async function listMarketingInboxConversations({
  user,
  status = 'todas',
  channel = 'todos',
  assignee = 'todos',
  search = '',
  page = 1,
  pageSize = 8,
} = {}) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  const contactMap = getContactMap(db, scope);
  const departmentMap = getDepartmentMap(db, scope);
  const attendantMap = getAttendantMap(db, scope);
  const normalizedSearch = String(search || '').toLowerCase();
  const list = (db.marketingChatConversations || [])
    .filter((item) => inScope(item, scope))
    .map((item) => ({
      ...item,
      contactName: contactMap[item.contactId]?.name || 'Contato sem nome',
      department: item.department || departmentMap[item.departmentId]?.name || 'Sem departamento',
      assignee: item.assignee || attendantMap[item.assigneeId]?.name || 'Sem atendente',
    }))
    .filter((item) => {
      const statusOk = status === 'todas' ? true : item.status === status;
      const channelOk = channel === 'todos' ? true : String(item.channel || '').toLowerCase() === String(channel).toLowerCase();
      const assigneeOk = assignee === 'todos'
        ? true
        : item.assigneeId === assignee || String(item.assignee || '').toLowerCase() === String(assignee).toLowerCase();
      const text = `${item.contactName} ${item.channel} ${item.department} ${item.preview || ''}`.toLowerCase();
      const searchOk = normalizedSearch ? text.includes(normalizedSearch) : true;
      return statusOk && channelOk && assigneeOk && searchOk;
    })
    .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
  return paginate(list, page, pageSize);
}

export async function getMarketingConversationDetails(user, conversationId) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  const departmentMap = getDepartmentMap(db, scope);
  const attendantMap = getAttendantMap(db, scope);
  const conversation = (db.marketingChatConversations || []).find((item) => inScope(item, scope) && item.id === conversationId);
  if (!conversation) return null;
  const contact = (db.marketingChatContacts || []).find((item) => inScope(item, scope) && item.id === conversation.contactId);
  const messages = (db.marketingChatMessages || [])
    .filter((item) => inScope(item, scope) && item.conversationId === conversation.id)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  const notes = (db.marketingChatNotes || [])
    .filter((item) => inScope(item, scope) && item.conversationId === conversation.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((item) => item.text);
  return {
    ...conversation,
    contactName: contact?.name || 'Contato',
    contactPhone: contact?.phone || '',
    department: conversation.department || departmentMap[conversation.departmentId]?.name || 'Sem departamento',
    assignee: conversation.assignee || attendantMap[conversation.assigneeId]?.name || 'Sem atendente',
    tags: Array.isArray(conversation.tags) ? conversation.tags : [],
    messages,
    notes,
  };
}

export async function sendMarketingConversationMessage(user, { conversationId, text }) {
  await wait();
  assertCanWrite(user);
  const cleanText = normalizeText(text);
  if (!cleanText) throw new Error('Mensagem obrigatoria.');
  return withMarketingDb(user, (db, scope) => {
    const conversation = (db.marketingChatConversations || []).find((item) => inScope(item, scope) && item.id === conversationId);
    if (!conversation) throw new Error('Conversa nao encontrada.');
    const now = new Date().toISOString();
    const newMessage = {
      id: createId('mkt-msg'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      conversationId,
      direction: 'outbound',
      author: user?.name || 'Atendente',
      text: cleanText,
      at: now,
    };
    db.marketingChatMessages.push(newMessage);
    conversation.preview = cleanText;
    conversation.lastMessageAt = now;
    conversation.unreadCount = 0;
    conversation.updatedAt = now;
    return newMessage;
  });
}

export async function bulkUpdateMarketingConversations(user, { conversationIds = [], action, payload = {} } = {}) {
  await wait();
  assertCanWrite(user);
  if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
    throw new Error('Selecione ao menos uma conversa para acao em lote.');
  }
  return withMarketingDb(user, (db, scope) => {
    const now = new Date().toISOString();
    const convs = (db.marketingChatConversations || []).filter((item) => inScope(item, scope) && conversationIds.includes(item.id));
    if (convs.length === 0) return { updated: 0 };
    const departments = (db.marketingChatDepartments || []).filter((item) => inScope(item, scope));
    const attendants = (db.marketingChatAttendants || []).filter((item) => inScope(item, scope));
    const generatedEvents = [];
    convs.forEach((conv) => {
      if (action === 'resolve') {
        conv.status = 'resolvida';
        const event = createAutomationEvent(db, scope, {
          type: 'conversation_resolved',
          channel: conv.channel,
          conversationId: conv.id,
          contactId: conv.contactId,
          dedupeKey: `conversation_resolved:${conv.id}:${now.slice(0, 16)}`,
          payload: { source: 'bulk_update' },
        });
        if (event) generatedEvents.push(event);
      }
      if (action === 'setStatus' && payload.status) {
        conv.status = payload.status;
        if (payload.status === 'resolvida') {
          const event = createAutomationEvent(db, scope, {
            type: 'conversation_resolved',
            channel: conv.channel,
            conversationId: conv.id,
            contactId: conv.contactId,
            dedupeKey: `conversation_resolved:${conv.id}:${now.slice(0, 16)}`,
            payload: { source: 'bulk_status' },
          });
          if (event) generatedEvents.push(event);
        }
      }
      if (action === 'assign' && payload.assignee) {
        const target = attendants.find((att) => att.id === payload.assignee || att.name === payload.assignee);
        conv.assigneeId = target?.id || conv.assigneeId;
        conv.assignee = target?.name || payload.assignee;
      }
      if (action === 'setDepartment' && payload.department) {
        const target = departments.find((dep) => dep.id === payload.department || dep.name === payload.department);
        conv.departmentId = target?.id || conv.departmentId;
        conv.department = target?.name || payload.department;
      }
      if (action === 'setIaMode' && payload.iaMode) conv.iaMode = payload.iaMode;
      if (action === 'applyTag' && payload.tag) {
        const tags = new Set(Array.isArray(conv.tags) ? conv.tags : []);
        tags.add(payload.tag);
        conv.tags = Array.from(tags);
        const event = createAutomationEvent(db, scope, {
          type: 'tag_added',
          tag: payload.tag,
          channel: conv.channel,
          conversationId: conv.id,
          contactId: conv.contactId,
          dedupeKey: `tag_added:${conv.id}:${payload.tag}:${now.slice(0, 16)}`,
          payload: { tag: payload.tag, source: 'bulk_update' },
        });
        if (event) generatedEvents.push(event);
      }
      conv.updatedAt = now;
    });
    generatedEvents.forEach((event) => {
      queueEventToJobs(db, scope, event);
    });
    return { updated: convs.length };
  });
}

export async function listMarketingContacts({ user, stage = 'todos', search = '', page = 1, pageSize = 8 } = {}) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  const normalized = String(search || '').toLowerCase();
  const filtered = (db.marketingChatContacts || [])
    .filter((item) => inScope(item, scope))
    .filter((item) => {
      const stageOk = stage === 'todos' ? true : item.stage === stage;
      const text = `${item.name} ${item.phone} ${item.origin} ${(item.tags || []).join(' ')}`.toLowerCase();
      const searchOk = normalized ? text.includes(normalized) : true;
      return stageOk && searchOk;
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return paginate(filtered, page, pageSize);
}

export async function listMarketingTags(user) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  return (db.marketingChatTags || [])
    .filter((item) => inScope(item, scope))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function createMarketingTag(user, payload) {
  await wait();
  assertCanWrite(user);
  const name = normalizeText(payload?.name).toLowerCase();
  if (!name) throw new Error('Nome da tag obrigatorio.');
  return withMarketingDb(user, (db, scope) => {
    const exists = (db.marketingChatTags || []).some((item) => inScope(item, scope) && item.name.toLowerCase() === name);
    if (exists) throw new Error('Ja existe uma tag com este nome.');
    const tag = {
      id: createId('mkt-tag'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      name,
      color: normalizeText(payload?.color) || '#6366F1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.marketingChatTags.push(tag);
    return tag;
  });
}

export async function updateMarketingTag(user, tagId, payload) {
  await wait();
  assertCanWrite(user);
  return withMarketingDb(user, (db, scope) => {
    const tag = (db.marketingChatTags || []).find((item) => inScope(item, scope) && item.id === tagId);
    if (!tag) throw new Error('Tag nao encontrada.');
    const nextName = normalizeText(payload?.name);
    if (nextName) tag.name = nextName.toLowerCase();
    if (payload?.color) tag.color = payload.color;
    tag.updatedAt = new Date().toISOString();
    return tag;
  });
}

export async function deleteMarketingTag(user, tagId) {
  await wait();
  assertCanWrite(user);
  return withMarketingDb(user, (db, scope) => {
    const idx = (db.marketingChatTags || []).findIndex((item) => inScope(item, scope) && item.id === tagId);
    if (idx < 0) throw new Error('Tag nao encontrada.');
    const [removed] = db.marketingChatTags.splice(idx, 1);
    (db.marketingChatConversations || [])
      .filter((item) => inScope(item, scope))
      .forEach((conv) => {
        conv.tags = (conv.tags || []).filter((tag) => tag !== removed.name);
      });
    return removed;
  });
}

export async function listMarketingCampaigns({ user, status = 'todos', search = '' } = {}) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  const normalized = String(search || '').toLowerCase();
  return (db.marketingChatCampaigns || [])
    .filter((item) => inScope(item, scope))
    .filter((item) => {
      const statusOk = status === 'todos' ? true : item.status === status;
      const text = `${item.name} ${item.channel} ${item.id}`.toLowerCase();
      const searchOk = normalized ? text.includes(normalized) : true;
      return statusOk && searchOk;
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function createMarketingCampaign(user, payload) {
  await wait();
  assertCanWrite(user);
  const name = normalizeText(payload?.name);
  if (!name) throw new Error('Nome da campanha obrigatorio.');
  return withMarketingDb(user, (db, scope) => {
    const now = new Date().toISOString();
    const campaign = {
      id: createId('mkt-cp'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      name,
      channel: normalizeText(payload?.channel) || 'WhatsApp',
      status: normalizeText(payload?.status) || 'rascunho',
      scheduledAt: payload?.scheduledAt || now,
      sentCount: Number(payload?.sentCount || 0),
      failedCount: Number(payload?.failedCount || 0),
      totalCount: Number(payload?.totalCount || 0),
      messageTemplate: normalizeText(payload?.messageTemplate) || '',
      createdAt: now,
      updatedAt: now,
    };
    db.marketingChatCampaigns.push(campaign);
    return campaign;
  });
}

export async function updateMarketingCampaign(user, campaignId, payload) {
  await wait();
  assertCanWrite(user);
  return withMarketingDb(user, (db, scope) => {
    const campaign = (db.marketingChatCampaigns || []).find((item) => inScope(item, scope) && item.id === campaignId);
    if (!campaign) throw new Error('Campanha nao encontrada.');
    if (payload?.name !== undefined) campaign.name = normalizeText(payload.name);
    if (payload?.channel !== undefined) campaign.channel = normalizeText(payload.channel);
    if (payload?.status !== undefined) campaign.status = normalizeText(payload.status);
    if (payload?.scheduledAt !== undefined) campaign.scheduledAt = payload.scheduledAt;
    if (payload?.messageTemplate !== undefined) campaign.messageTemplate = normalizeText(payload.messageTemplate);
    if (payload?.totalCount !== undefined) campaign.totalCount = Number(payload.totalCount || 0);
    campaign.updatedAt = new Date().toISOString();
    return campaign;
  });
}

export async function listMarketingFunnels(user) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  const contactMap = getContactMap(db, scope);
  const convMap = Object.fromEntries(
    (db.marketingChatConversations || []).filter((item) => inScope(item, scope)).map((item) => [item.id, item])
  );
  return (db.marketingChatFunnels || [])
    .filter((item) => inScope(item, scope))
    .map((funnel) => ({
      ...funnel,
      stages: [...(funnel.stages || [])].sort((a, b) => Number(a.position || 0) - Number(b.position || 0)),
      cards: (funnel.cards || []).map((card) => ({
        ...card,
        stageId: (funnel.stages || []).find((stage) => Number(stage.position) === Number(card.stagePosition))?.id || null,
        title: card.title || contactMap[convMap[card.conversationId]?.contactId]?.name || 'Contato',
      })),
    }));
}

export async function createMarketingFunnelStage(user, payload) {
  await wait();
  assertCanWrite(user);
  const name = normalizeText(payload?.name);
  if (!name) throw new Error('Nome da coluna obrigatorio.');
  return withMarketingDb(user, (db, scope) => {
    const funnel = (db.marketingChatFunnels || []).find((item) => inScope(item, scope) && item.id === payload?.funnelId);
    if (!funnel) throw new Error('Funil nao encontrado.');
    const stage = {
      id: createId('mkt-stage'),
      name,
      color: normalizeText(payload?.color) || '#6366F1',
      position: (funnel.stages || []).length + 1,
    };
    funnel.stages = [...(funnel.stages || []), stage];
    funnel.updatedAt = new Date().toISOString();
    return stage;
  });
}

export async function updateMarketingFunnelStage(user, payload) {
  await wait();
  assertCanWrite(user);
  return withMarketingDb(user, (db, scope) => {
    const funnel = (db.marketingChatFunnels || []).find((item) => inScope(item, scope) && item.id === payload?.funnelId);
    if (!funnel) throw new Error('Funil nao encontrado.');
    const stage = (funnel.stages || []).find((item) => item.id === payload?.stageId);
    if (!stage) throw new Error('Coluna nao encontrada.');
    if (payload?.name !== undefined) stage.name = normalizeText(payload.name);
    if (payload?.color !== undefined) stage.color = normalizeText(payload.color);
    funnel.updatedAt = new Date().toISOString();
    return stage;
  });
}

export async function moveMarketingFunnelCard(user, payload) {
  await wait();
  assertCanWrite(user);
  return withMarketingDb(user, (db, scope) => {
    const funnel = (db.marketingChatFunnels || []).find((item) => inScope(item, scope) && item.id === payload?.funnelId);
    if (!funnel) throw new Error('Funil nao encontrado.');
    const card = (funnel.cards || []).find((item) => item.id === payload?.cardId);
    if (!card) throw new Error('Card nao encontrado.');
    const stage = (funnel.stages || []).find((item) => item.id === payload?.targetStageId);
    if (!stage) throw new Error('Coluna de destino nao encontrada.');
    card.stagePosition = stage.position;
    card.updatedAt = new Date().toISOString();
    funnel.updatedAt = new Date().toISOString();
    return card;
  });
}

export async function listMarketingAutomations({ user, status = 'todos', channel = 'todos', search = '', page = 1, pageSize = 8 } = {}) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  const normalized = String(search || '').toLowerCase();
  const list = (db.marketingChatAutomations || [])
    .filter((item) => inScope(item, scope))
    .filter((item) => {
      const statusOk = status === 'todos' ? true : item.status === status;
      const channelOk = channel === 'todos' ? true : String(item.channel || '').toLowerCase() === String(channel).toLowerCase();
      const text = `${item.name} ${item.description} ${item.trigger} ${item.conditionEntry}`.toLowerCase();
      const searchOk = normalized ? text.includes(normalized) : true;
      return statusOk && channelOk && searchOk;
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return paginate(list, page, pageSize);
}

function normalizeAutomationStep(step, idx = 0) {
  const type = normalizeText(step?.type || 'send_message');
  const config = step?.config && typeof step.config === 'object' ? { ...step.config } : {};
  const allowedTypes = new Set([
    'send_message',
    'wait',
    'add_tag',
    'remove_tag',
    'assign_department',
    'assign_attendant',
    'resolve_conversation',
    'reopen_conversation',
    'webhook_outbound',
  ]);
  if (!allowedTypes.has(type)) {
    throw new Error(`Tipo de step nao suportado: ${type}`);
  }
  if (type === 'send_message' && !normalizeText(config.message)) {
    throw new Error('Step send_message exige campo message.');
  }
  if (type === 'wait') {
    config.minutes = Number(config.minutes || 0);
    if (config.minutes < 0) throw new Error('Step wait exige minutos >= 0.');
  }
  if (type === 'add_tag' || type === 'remove_tag') {
    if (!normalizeText(config.tag || config.value)) throw new Error(`Step ${type} exige tag.`);
  }
  if (type === 'assign_department') {
    if (!normalizeText(config.departmentId || config.value)) throw new Error('Step assign_department exige departmentId.');
  }
  if (type === 'assign_attendant') {
    if (!normalizeText(config.attendantId || config.value)) throw new Error('Step assign_attendant exige attendantId.');
  }
  if (type === 'webhook_outbound') {
    if (!normalizeText(config.url) && !normalizeText(config.useDefaultWebhook)) {
      config.useDefaultWebhook = true;
    }
  }
  if (config.conditionDsl && typeof config.conditionDsl !== 'object') {
    throw new Error('conditionDsl deve ser um objeto valido.');
  }
  return {
    id: step.id || createId('mkt-step'),
    order: Number(step.order || idx + 1),
    type,
    config,
  };
}

export async function createMarketingAutomation(user, payload) {
  await wait();
  assertCanWrite(user);
  const name = normalizeText(payload?.name);
  if (!name) throw new Error('Nome da automacao obrigatorio.');
  return withMarketingDb(user, (db, scope) => {
    const now = new Date().toISOString();
    const automation = {
      id: createId('mkt-auto'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      name,
      description: normalizeText(payload?.description),
      status: normalizeText(payload?.status) || 'active',
      trigger: normalizeText(payload?.trigger) || 'manual',
      channel: normalizeText(payload?.channel) || 'WhatsApp',
      conditionEntry: normalizeText(payload?.conditionEntry) || '',
      delayMinutes: Number(payload?.delayMinutes || 0),
      actionMessage: normalizeText(payload?.actionMessage) || '',
      departmentId: payload?.departmentId || null,
      assigneeId: payload?.assigneeId || null,
      steps: Array.isArray(payload?.steps) && payload.steps.length > 0
        ? payload.steps.map((step, idx) => normalizeAutomationStep(step, idx))
        : [
          normalizeAutomationStep({ type: 'wait', config: { minutes: Number(payload?.delayMinutes || 0) } }, 0),
          normalizeAutomationStep({ type: 'send_message', config: { message: normalizeText(payload?.actionMessage) || '' } }, 1),
        ],
      lastRunAt: null,
      lastRunStatus: null,
      createdAt: now,
      updatedAt: now,
    };
    db.marketingChatAutomations.push(automation);
    return automation;
  });
}

export async function updateMarketingAutomation(user, automationId, payload) {
  await wait();
  assertCanWrite(user);
  return withMarketingDb(user, (db, scope) => {
    const automation = (db.marketingChatAutomations || []).find((item) => inScope(item, scope) && item.id === automationId);
    if (!automation) throw new Error('Automacao nao encontrada.');
    if (payload?.name !== undefined) automation.name = normalizeText(payload.name);
    if (payload?.description !== undefined) automation.description = normalizeText(payload.description);
    if (payload?.status !== undefined) automation.status = normalizeText(payload.status);
    if (payload?.trigger !== undefined) automation.trigger = normalizeText(payload.trigger);
    if (payload?.channel !== undefined) automation.channel = normalizeText(payload.channel);
    if (payload?.conditionEntry !== undefined) automation.conditionEntry = normalizeText(payload.conditionEntry);
    if (payload?.delayMinutes !== undefined) automation.delayMinutes = Number(payload.delayMinutes || 0);
    if (payload?.actionMessage !== undefined) automation.actionMessage = normalizeText(payload.actionMessage);
    if (payload?.departmentId !== undefined) automation.departmentId = payload.departmentId || null;
    if (payload?.assigneeId !== undefined) automation.assigneeId = payload.assigneeId || null;
    if (Array.isArray(payload?.steps)) {
      automation.steps = payload.steps.map((step, idx) => normalizeAutomationStep(step, idx));
    }
    if (payload?.lastRunAt !== undefined) automation.lastRunAt = payload.lastRunAt;
    if (payload?.lastRunStatus !== undefined) automation.lastRunStatus = payload.lastRunStatus;
    automation.updatedAt = new Date().toISOString();
    return automation;
  });
}

export async function deleteMarketingAutomation(user, automationId) {
  await wait();
  assertCanWrite(user);
  return withMarketingDb(user, (db, scope) => {
    const idx = (db.marketingChatAutomations || []).findIndex((item) => inScope(item, scope) && item.id === automationId);
    if (idx < 0) throw new Error('Automacao nao encontrada.');
    const [removed] = db.marketingChatAutomations.splice(idx, 1);
    return removed;
  });
}

export async function runMarketingAutomationNow(user, automationId) {
  await wait();
  assertCanWrite(user);
  const queued = withMarketingDb(user, (db, scope) => {
    const automation = (db.marketingChatAutomations || []).find((item) => inScope(item, scope) && item.id === automationId);
    if (!automation) throw new Error('Automacao nao encontrada.');
    const targetConversation = (db.marketingChatConversations || []).find((item) => inScope(item, scope) && item.status !== 'resolvida')
      || (db.marketingChatConversations || []).find((item) => inScope(item, scope));
    const event = createAutomationEvent(db, scope, {
      type: 'manual',
      channel: automation.channel,
      conversationId: targetConversation?.id || null,
      contactId: targetConversation?.contactId || null,
      dedupeKey: `manual_run:${automation.id}:${Date.now()}`,
      payload: { automationId: automation.id, source: 'manual_run' },
    });
    if (!event) throw new Error('Nao foi possivel enfileirar a execucao manual.');
    const jobs = queueEventToJobs(db, scope, event);
    return {
      automationId: automation.id,
      conversationId: targetConversation?.id || null,
      queuedJobs: jobs.length,
      eventId: event.id,
    };
  });
  runMarketingAutomationTickSync(user);
  return queued;
}

export async function cancelMarketingScheduledJob(user, jobId) {
  await wait();
  assertCanWrite(user);
  return withMarketingDb(user, (db, scope) => {
    const job = (db.marketingScheduledJobs || []).find((item) => inScope(item, scope) && item.id === jobId);
    if (!job) throw new Error('Job nao encontrado.');
    if (!['queued', 'retrying'].includes(job.status)) {
      throw new Error('Somente jobs pendentes podem ser cancelados.');
    }
    const now = new Date().toISOString();
    job.status = 'cancelled';
    job.updatedAt = now;
    job.completedAt = now;
    job.lockedAt = null;
    job.lockToken = null;
    job.lockExpiresAt = null;
    return job;
  });
}

export async function reprocessMarketingScheduledJob(user, { jobId, stepOrder = null } = {}) {
  await wait();
  assertCanWrite(user);
  const result = withMarketingDb(user, (db, scope) => {
    const sourceJob = (db.marketingScheduledJobs || []).find((item) => inScope(item, scope) && item.id === jobId);
    if (!sourceJob) throw new Error('Job origem nao encontrado.');
    if (!['failed', 'cancelled'].includes(sourceJob.status)) {
      throw new Error('Reprocessamento permitido apenas para jobs falhos/cancelados.');
    }
    const now = new Date().toISOString();
    const newJob = {
      ...sourceJob,
      id: createId('mkt-job'),
      idempotencyKey: `reprocess:${sourceJob.id}:${Date.now()}`,
      dedupeKey: `${sourceJob.dedupeKey}:reprocess:${Date.now()}`,
      status: 'queued',
      runAt: now,
      lockedAt: null,
      lockToken: null,
      lockExpiresAt: null,
      completedAt: null,
      attemptCount: 0,
      nextStepIndex: stepOrder && Number(stepOrder) > 0 ? Number(stepOrder) - 1 : 0,
      runId: null,
      lastError: null,
      reprocessCount: Number(sourceJob.reprocessCount || 0) + 1,
      reprocessOfJobId: sourceJob.id,
      updatedAt: now,
      createdAt: now,
      reprocessedBy: user?.id || user?.uid || 'runtime-user',
    };
    db.marketingScheduledJobs.push(newJob);
    sourceJob.updatedAt = now;
    sourceJob.reprocessedAt = now;
    sourceJob.reprocessedBy = user?.id || user?.uid || 'runtime-user';
    return newJob;
  });
  runMarketingAutomationTickSync(user);
  return result;
}

export async function previewMarketingTemplate(user, { template = '', conversationId = '' } = {}) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  const conversation = conversationId
    ? (db.marketingChatConversations || []).find((item) => inScope(item, scope) && item.id === conversationId)
    : (db.marketingChatConversations || []).find((item) => inScope(item, scope));
  const contact = conversation
    ? (db.marketingChatContacts || []).find((item) => inScope(item, scope) && item.id === conversation.contactId)
    : (db.marketingChatContacts || []).find((item) => inScope(item, scope));
  const channel = conversation
    ? (db.marketingChatChannels || []).find((item) => inScope(item, scope) && item.id === conversation.channelId)
    : (db.marketingChatChannels || []).find((item) => inScope(item, scope));
  const department = conversation
    ? (db.marketingChatDepartments || []).find((item) => inScope(item, scope) && item.id === conversation.departmentId)
    : null;
  const attendant = conversation
    ? (db.marketingChatAttendants || []).find((item) => inScope(item, scope) && item.id === conversation.assigneeId)
    : null;
  const context = {
    conversation,
    contact,
    channel: channel || { name: getChannelName(db, scope, conversation?.channelId, conversation?.channel) },
    clinic: { name: db?.clinicProfile?.nomeClinica || db?.clinicProfile?.nomeFantasia || 'Clinica' },
    department,
    attendant,
  };
  return {
    preview: renderMarketingTemplateInternal(template, context),
    context,
  };
}

export async function listMarketingDepartments(user) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  return (db.marketingChatDepartments || [])
    .filter((item) => inScope(item, scope))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function createMarketingDepartment(user, payload) {
  await wait();
  assertCanWrite(user);
  const name = normalizeText(payload?.name);
  if (!name) throw new Error('Nome do departamento obrigatorio.');
  return withMarketingDb(user, (db, scope) => {
    const dept = {
      id: createId('mkt-dept'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      name,
      description: normalizeText(payload?.description),
      active: payload?.active !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.marketingChatDepartments.push(dept);
    return dept;
  });
}

export async function updateMarketingDepartment(user, departmentId, payload) {
  await wait();
  assertCanWrite(user);
  return withMarketingDb(user, (db, scope) => {
    const dept = (db.marketingChatDepartments || []).find((item) => inScope(item, scope) && item.id === departmentId);
    if (!dept) throw new Error('Departamento nao encontrado.');
    if (payload?.name !== undefined) dept.name = normalizeText(payload.name);
    if (payload?.description !== undefined) dept.description = normalizeText(payload.description);
    if (payload?.active !== undefined) dept.active = Boolean(payload.active);
    dept.updatedAt = new Date().toISOString();
    return dept;
  });
}

export async function deleteMarketingDepartment(user, departmentId) {
  await wait();
  assertCanWrite(user);
  return withMarketingDb(user, (db, scope) => {
    const idx = (db.marketingChatDepartments || []).findIndex((item) => inScope(item, scope) && item.id === departmentId);
    if (idx < 0) throw new Error('Departamento nao encontrado.');
    const [removed] = db.marketingChatDepartments.splice(idx, 1);
    (db.marketingChatConversations || []).filter((item) => inScope(item, scope)).forEach((conv) => {
      if (conv.departmentId === departmentId) {
        conv.departmentId = null;
        conv.department = 'Sem departamento';
      }
    });
    return removed;
  });
}

export async function listMarketingAttendants(user) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  return (db.marketingChatAttendants || [])
    .filter((item) => inScope(item, scope))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function createMarketingAttendant(user, payload) {
  await wait();
  assertCanWrite(user);
  const name = normalizeText(payload?.name);
  if (!name) throw new Error('Nome do atendente obrigatorio.');
  return withMarketingDb(user, (db, scope) => {
    const attendant = {
      id: createId('mkt-att'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      name,
      email: normalizeText(payload?.email),
      role: normalizeText(payload?.role) || 'atendimento',
      active: payload?.active !== false,
      departmentIds: Array.isArray(payload?.departmentIds) ? payload.departmentIds : [],
      channelIds: Array.isArray(payload?.channelIds) ? payload.channelIds : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.marketingChatAttendants.push(attendant);
    return attendant;
  });
}

export async function updateMarketingAttendant(user, attendantId, payload) {
  await wait();
  assertCanWrite(user);
  return withMarketingDb(user, (db, scope) => {
    const attendant = (db.marketingChatAttendants || []).find((item) => inScope(item, scope) && item.id === attendantId);
    if (!attendant) throw new Error('Atendente nao encontrado.');
    if (payload?.name !== undefined) attendant.name = normalizeText(payload.name);
    if (payload?.email !== undefined) attendant.email = normalizeText(payload.email);
    if (payload?.role !== undefined) attendant.role = normalizeText(payload.role);
    if (payload?.active !== undefined) attendant.active = Boolean(payload.active);
    if (Array.isArray(payload?.departmentIds)) attendant.departmentIds = payload.departmentIds;
    if (Array.isArray(payload?.channelIds)) attendant.channelIds = payload.channelIds;
    attendant.updatedAt = new Date().toISOString();
    return attendant;
  });
}

export async function deleteMarketingAttendant(user, attendantId) {
  await wait();
  assertCanWrite(user);
  return withMarketingDb(user, (db, scope) => {
    const idx = (db.marketingChatAttendants || []).findIndex((item) => inScope(item, scope) && item.id === attendantId);
    if (idx < 0) throw new Error('Atendente nao encontrado.');
    const [removed] = db.marketingChatAttendants.splice(idx, 1);
    (db.marketingChatConversations || []).filter((item) => inScope(item, scope)).forEach((conv) => {
      if (conv.assigneeId === attendantId) {
        conv.assigneeId = null;
        conv.assignee = 'Sem atendente';
      }
    });
    return removed;
  });
}

export async function listMarketingChannels({ user, status = 'todos', search = '' } = {}) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  const normalized = String(search || '').toLowerCase();
  return (db.marketingChatChannels || [])
    .filter((item) => inScope(item, scope))
    .filter((item) => {
      const statusOk = status === 'todos' ? true : item.status === status;
      const text = `${item.name} ${item.type} ${item.provider}`.toLowerCase();
      const searchOk = normalized ? text.includes(normalized) : true;
      return statusOk && searchOk;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function pickWhatsAppChannel(channels) {
  const whatsappChannels = channels.filter((item) => String(item.type || '').toLowerCase() === 'whatsapp');
  if (whatsappChannels.length === 0) return null;
  const connected = whatsappChannels.find((item) => item.status === 'conectado');
  return connected || whatsappChannels[0];
}

export async function getMarketingWhatsAppConnectionOverview(user) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  const channels = (db.marketingChatChannels || []).filter((item) => inScope(item, scope));
  const logs = (db.marketingChatWebhookLogs || [])
    .filter((item) => inScope(item, scope))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);
  const whatsappChannel = pickWhatsAppChannel(channels);
  const hasConnecting = channels.some((item) => String(item.type).toLowerCase() === 'whatsapp' && item.status === 'conectando');
  const hasError = channels.some((item) => String(item.type).toLowerCase() === 'whatsapp' && item.status === 'erro');
  const status = whatsappChannel?.status === 'conectado'
    ? 'conectado'
    : hasConnecting
      ? 'conectando'
      : hasError
        ? 'erro'
        : 'nao_conectado';

  const lastSyncLog = logs.find((item) => item.eventType === 'channel.sync');
  const lastConnectLog = logs.find((item) => item.eventType === 'channel.connected');
  return {
    status,
    channel: whatsappChannel,
    onboarding: {
      qrCodeToken: status === 'conectando' ? `QR-${Date.now()}` : '',
      steps: [
        '1. Clique em Conectar numero para iniciar onboarding oficial.',
        '2. Escaneie o QR code no WhatsApp Business.',
        '3. Valide webhook e eventos de mensagens.',
        '4. Defina atendentes e automacoes no inbox.',
      ],
    },
    technical: {
      token: db?.marketingChatApiConfig?.apiToken || '',
      webhookConfigured: Boolean(db?.marketingChatApiConfig?.webhookUrl),
      webhookUrl: db?.marketingChatApiConfig?.webhookUrl || '',
      lastSyncAt: lastSyncLog?.createdAt || '',
      connectedNumber: whatsappChannel?.connectedNumber || '',
      channelName: whatsappChannel?.name || 'WhatsApp Principal',
      connectedAt: whatsappChannel?.connectedAt || lastConnectLog?.createdAt || '',
    },
    logs,
  };
}

export async function connectMarketingWhatsAppChannel(user, payload = {}) {
  await wait();
  assertCanWrite(user);
  return withMarketingDb(user, (db, scope) => {
    const now = new Date().toISOString();
    const channels = (db.marketingChatChannels || []).filter((item) => inScope(item, scope) && String(item.type || '').toLowerCase() === 'whatsapp');
    let channel = channels[0];
    if (!channel) {
      channel = {
        id: createId('mkt-chn'),
        tenantId: scope.tenantId,
        clinicId: scope.clinicId,
        name: normalizeText(payload?.name) || 'WhatsApp Principal',
        type: 'WhatsApp',
        provider: 'meta',
        status: 'conectando',
        connectedAt: null,
        connectedNumber: normalizeText(payload?.phone) || '',
        createdAt: now,
        updatedAt: now,
      };
      db.marketingChatChannels.push(channel);
    } else {
      channel.status = 'conectando';
      channel.connectedNumber = normalizeText(payload?.phone) || channel.connectedNumber || '';
      channel.updatedAt = now;
    }
    db.marketingChatWebhookLogs.push({
      id: createId('mkt-log'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      provider: 'whatsapp',
      eventType: 'channel.connecting',
      status: 'ok',
      payloadPreview: `Iniciando onboarding do canal ${channel.name}.`,
      createdAt: now,
    });
    return channel;
  });
}

export async function refreshMarketingWhatsAppConnectionStatus(user) {
  await wait();
  return withMarketingDb(user, (db, scope) => {
    const now = new Date().toISOString();
    const channel = (db.marketingChatChannels || []).find((item) => inScope(item, scope) && String(item.type || '').toLowerCase() === 'whatsapp');
    if (!channel) {
      db.marketingChatWebhookLogs.push({
        id: createId('mkt-log'),
        tenantId: scope.tenantId,
        clinicId: scope.clinicId,
        provider: 'whatsapp',
        eventType: 'channel.sync',
        status: 'error',
        payloadPreview: 'Canal WhatsApp ainda nao criado.',
        createdAt: now,
      });
      throw new Error('Nenhum canal WhatsApp encontrado para atualizar status.');
    }
    if (channel.status === 'conectando') {
      channel.status = 'conectado';
      channel.connectedAt = now;
      if (!channel.connectedNumber) channel.connectedNumber = '+55 11 99999-0000';
      db.marketingChatWebhookLogs.push({
        id: createId('mkt-log'),
        tenantId: scope.tenantId,
        clinicId: scope.clinicId,
        provider: 'whatsapp',
        eventType: 'channel.connected',
        status: 'ok',
        payloadPreview: `Canal ${channel.name} conectado com sucesso.`,
        createdAt: now,
      });
    }
    db.marketingChatWebhookLogs.push({
      id: createId('mkt-log'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      provider: 'whatsapp',
      eventType: 'channel.sync',
      status: 'ok',
      payloadPreview: `Status atual do canal: ${channel.status}.`,
      createdAt: now,
    });
    channel.updatedAt = now;
    return channel;
  });
}

export async function disconnectMarketingWhatsAppChannel(user) {
  await wait();
  assertCanWrite(user);
  return withMarketingDb(user, (db, scope) => {
    const now = new Date().toISOString();
    const channel = (db.marketingChatChannels || []).find((item) => inScope(item, scope) && String(item.type || '').toLowerCase() === 'whatsapp');
    if (!channel) throw new Error('Canal WhatsApp nao encontrado.');
    channel.status = 'desconectado';
    channel.connectedAt = null;
    channel.updatedAt = now;
    db.marketingChatWebhookLogs.push({
      id: createId('mkt-log'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      provider: 'whatsapp',
      eventType: 'channel.disconnected',
      status: 'ok',
      payloadPreview: `Canal ${channel.name} desconectado.`,
      createdAt: now,
    });
    return channel;
  });
}

export async function createMarketingChannel(user, payload) {
  await wait();
  assertCanWrite(user);
  const name = normalizeText(payload?.name);
  if (!name) throw new Error('Nome do canal obrigatorio.');
  return withMarketingDb(user, (db, scope) => {
    const channel = {
      id: createId('mkt-chn'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      name,
      type: normalizeText(payload?.type) || 'WhatsApp',
      provider: normalizeText(payload?.provider) || 'custom',
      status: normalizeText(payload?.status) || 'desconectado',
      connectedAt: payload?.status === 'conectado' ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.marketingChatChannels.push(channel);
    return channel;
  });
}

export async function updateMarketingChannel(user, channelId, payload) {
  await wait();
  assertCanWrite(user);
  return withMarketingDb(user, (db, scope) => {
    const channel = (db.marketingChatChannels || []).find((item) => inScope(item, scope) && item.id === channelId);
    if (!channel) throw new Error('Canal nao encontrado.');
    if (payload?.name !== undefined) channel.name = normalizeText(payload.name);
    if (payload?.type !== undefined) channel.type = normalizeText(payload.type);
    if (payload?.provider !== undefined) channel.provider = normalizeText(payload.provider);
    if (payload?.status !== undefined) {
      channel.status = normalizeText(payload.status);
      channel.connectedAt = channel.status === 'conectado' ? new Date().toISOString() : null;
    }
    channel.updatedAt = new Date().toISOString();
    return channel;
  });
}

export async function deleteMarketingChannel(user, channelId) {
  await wait();
  assertCanWrite(user);
  return withMarketingDb(user, (db, scope) => {
    const idx = (db.marketingChatChannels || []).findIndex((item) => inScope(item, scope) && item.id === channelId);
    if (idx < 0) throw new Error('Canal nao encontrado.');
    const [removed] = db.marketingChatChannels.splice(idx, 1);
    return removed;
  });
}

export async function getMarketingApiConfig(user) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  const cfg = db.marketingChatApiConfig || {};
  return {
    apiToken: cfg.apiToken || '',
    webhookUrl: cfg.webhookUrl || '',
    tenantId: scope.tenantId,
    clinicId: scope.clinicId,
  };
}

export async function regenerateMarketingApiToken(user) {
  await wait();
  assertCanWrite(user);
  return withMarketingDb(user, (db, scope) => {
    const token = `mkt_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    db.marketingChatApiConfig = {
      ...(db.marketingChatApiConfig || {}),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      apiToken: token,
      webhookUrl: db.marketingChatApiConfig?.webhookUrl || '',
      updatedAt: new Date().toISOString(),
    };
    return db.marketingChatApiConfig;
  });
}

export async function saveMarketingWebhookConfig(user, webhookUrl) {
  await wait();
  assertCanWrite(user);
  const url = normalizeText(webhookUrl);
  if (url && !/^https?:\/\//i.test(url)) throw new Error('Informe uma URL valida iniciando com http:// ou https://');
  return withMarketingDb(user, (db, scope) => {
    db.marketingChatApiConfig = {
      ...(db.marketingChatApiConfig || {}),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      apiToken: db.marketingChatApiConfig?.apiToken || '',
      webhookUrl: url,
      updatedAt: new Date().toISOString(),
    };
    db.marketingChatSettings = {
      ...(db.marketingChatSettings || {}),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      webhookConfigured: Boolean(url),
      updatedAt: new Date().toISOString(),
    };
    db.marketingChatWebhookLogs.push({
      id: createId('mkt-log'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      provider: 'webhook',
      eventType: 'config.updated',
      status: 'ok',
      payloadPreview: url || 'Webhook removido',
      createdAt: new Date().toISOString(),
    });
    return db.marketingChatApiConfig;
  });
}

export async function listMarketingWebhookLogs(user) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  return (db.marketingChatWebhookLogs || [])
    .filter((item) => inScope(item, scope))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 40);
}

export async function testMarketingWebhookConnection(user) {
  await wait();
  assertCanWrite(user);
  return withMarketingDb(user, (db, scope) => {
    const now = new Date().toISOString();
    const webhookUrl = normalizeText(db?.marketingChatApiConfig?.webhookUrl);
    const isConfigured = Boolean(webhookUrl && /^https?:\/\//i.test(webhookUrl));
    const log = {
      id: createId('mkt-log'),
      tenantId: scope.tenantId,
      clinicId: scope.clinicId,
      provider: 'webhook',
      eventType: 'connection.test',
      status: isConfigured ? 'ok' : 'error',
      payloadPreview: isConfigured
        ? `Teste enviado para ${webhookUrl}`
        : 'Webhook nao configurado para teste',
      createdAt: now,
    };
    db.marketingChatWebhookLogs.push(log);
    return {
      ok: isConfigured,
      message: isConfigured ? 'Teste de webhook registrado com sucesso.' : 'Configure um webhook valido antes de testar.',
      log,
    };
  });
}

export async function getMarketingSettings(user) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  const settings = db.marketingChatSettings || {};
  if (settings.tenantId && settings.tenantId !== scope.tenantId) {
    return {
      accountName: 'LoveOdonto Marketing',
      defaultChannel: 'WhatsApp',
      aiModel: 'Assistente interno (recomendado)',
      autoAssign: true,
      businessHoursOnly: true,
      webhookConfigured: false,
    };
  }
  return settings;
}

export async function getMarketingReportsSnapshot(user) {
  await wait();
  const { db, scope } = readMarketingDb(user);
  const conversations = (db.marketingChatConversations || []).filter((item) => inScope(item, scope));
  const campaigns = (db.marketingChatCampaigns || []).filter((item) => inScope(item, scope));
  const runtimeMetrics = buildRuntimeMetricsFromDb(db, scope);
  const totalCampaign = campaigns.reduce((acc, item) => acc + Number(item.totalCount || 0), 0);
  const totalSent = campaigns.reduce((acc, item) => acc + Number(item.sentCount || 0), 0);
  const open = conversations.filter((item) => item.status === 'aberta').length;
  const resolved = conversations.filter((item) => item.status === 'resolvida').length;
  const conversionRate = `${((resolved / Math.max(open + resolved, 1)) * 100).toFixed(1)}%`;
  const channelCount = conversations.reduce((acc, conv) => {
    acc[conv.channel] = Number(acc[conv.channel] || 0) + 1;
    return acc;
  }, {});
  const topChannels = Object.entries(channelCount).map(([channel, volume]) => ({ channel, volume }));
  return {
    conversionRate,
    avgFirstResponse: '03m 10s',
    campaignDeliveryRate: `${((totalSent / Math.max(totalCampaign, 1)) * 100).toFixed(1)}%`,
    topChannels,
    runtime: runtimeMetrics,
  };
}
