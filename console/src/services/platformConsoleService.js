const STORAGE_KEY = 'loveodonto_platform_console_state_v1';

const MODULE_CATALOG = ['Agenda', 'Pacientes', 'CRM', 'Financeiro', 'Marketing', 'IA', 'Estoque'];
const INTEGRATION_CATALOG = ['WhatsApp Cloud API', 'Meta Ads', 'Webhook API', 'N8N', 'Pagar.me'];
const PLAN_CATALOG = ['Start', 'Growth', 'Scale'];
const PLAN_PRICES_CENTS = {
  Start: 59900,
  Growth: 99900,
  Scale: 149900,
};
const PLAN_MODULES = {
  Start: ['Agenda', 'Pacientes'],
  Growth: ['Agenda', 'Pacientes', 'Financeiro', 'CRM'],
  Scale: [...MODULE_CATALOG],
};
const ALLOWED_ONBOARDING_ROLES = new Set(['owner', 'super_admin']);

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-5)}`;
}

function currency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function createSeedState() {
  const now = nowIso();
  const clinics = [
    {
      id: 'tenant_01',
      name: 'Clínica Sorriso Prime',
      tradeName: 'Sorriso Prime',
      cnpj: '12.345.678/0001-10',
      city: 'São Paulo',
      state: 'SP',
      ownerName: 'Dra. Camila Nunes',
      ownerEmail: 'camila@sorrisoprime.com.br',
      status: 'active',
      plan: 'Scale',
      health: 'healthy',
      assistedAccessEnabled: false,
      modules: ['Agenda', 'CRM', 'Financeiro', 'Marketing', 'IA'],
      integrations: [
        { name: 'WhatsApp Cloud API', status: 'connected', lastSyncAt: now },
        { name: 'Webhook API', status: 'connected', lastSyncAt: now },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tenant_02',
      name: 'Odonto Vida Centro',
      tradeName: 'Odonto Vida',
      cnpj: '45.901.222/0001-90',
      city: 'Belo Horizonte',
      state: 'MG',
      ownerName: 'Dr. Rafael Braga',
      ownerEmail: 'rafael@odontovida.com.br',
      status: 'suspended',
      plan: 'Growth',
      health: 'attention',
      assistedAccessEnabled: false,
      modules: ['Agenda', 'CRM', 'Financeiro'],
      integrations: [
        { name: 'WhatsApp Cloud API', status: 'error', lastSyncAt: now },
        { name: 'Pagar.me', status: 'connected', lastSyncAt: now },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'tenant_03',
      name: 'Orto Family Clinic',
      tradeName: 'Orto Family',
      cnpj: '88.177.445/0001-72',
      city: 'Curitiba',
      state: 'PR',
      ownerName: 'Dra. Giulia Prado',
      ownerEmail: 'giulia@ortofamily.com.br',
      status: 'active',
      plan: 'Start',
      health: 'healthy',
      assistedAccessEnabled: false,
      modules: ['Agenda', 'CRM'],
      integrations: [
        { name: 'WhatsApp Cloud API', status: 'connected', lastSyncAt: now },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];

  const subscriptions = clinics.map((clinic, index) => ({
    id: `sub_${index + 1}`,
    tenantId: clinic.id,
    clinicName: clinic.name,
    plan: clinic.plan,
    status: clinic.status === 'active' ? 'active' : 'past_due',
    amountCents: clinic.plan === 'Scale' ? 149900 : clinic.plan === 'Growth' ? 99900 : 59900,
    cycle: 'monthly',
    nextBillingAt: new Date(Date.now() + (index + 2) * 86400000).toISOString(),
    updatedAt: now,
  }));

  const billingEvents = [
    {
      id: 'bill_01',
      tenantId: 'tenant_01',
      clinicName: 'Clínica Sorriso Prime',
      type: 'invoice.paid',
      status: 'paid',
      amountCents: 149900,
      dueAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    },
    {
      id: 'bill_02',
      tenantId: 'tenant_02',
      clinicName: 'Odonto Vida Centro',
      type: 'invoice.overdue',
      status: 'overdue',
      amountCents: 99900,
      dueAt: new Date(Date.now() - 12 * 86400000).toISOString(),
      createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
    },
    {
      id: 'bill_03',
      tenantId: 'tenant_03',
      clinicName: 'Orto Family Clinic',
      type: 'invoice.pending',
      status: 'pending',
      amountCents: 59900,
      dueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      createdAt: now,
    },
  ];

  const supportTickets = [
    {
      id: 'ticket_01',
      tenantId: 'tenant_01',
      clinicName: 'Clínica Sorriso Prime',
      subject: 'Instabilidade no webhook de campanhas',
      priority: 'high',
      status: 'open',
      updatedAt: now,
      lastMessage: 'Falhas intermitentes em envios agendados.',
    },
    {
      id: 'ticket_02',
      tenantId: 'tenant_03',
      clinicName: 'Orto Family Clinic',
      subject: 'Dúvida sobre upgrade de plano',
      priority: 'medium',
      status: 'pending',
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
      lastMessage: 'Precisamos habilitar módulo Financeiro este mês.',
    },
  ];

  const systemHealthChecks = [
    { id: 'hc_01', component: 'api-core', status: 'healthy', latencyMs: 58, checkedAt: now },
    { id: 'hc_02', component: 'jobs-worker', status: 'healthy', latencyMs: 92, checkedAt: now },
    { id: 'hc_03', component: 'supabase-db', status: 'attention', latencyMs: 188, checkedAt: now },
    { id: 'hc_04', component: 'billing-webhooks', status: 'warning', latencyMs: 321, checkedAt: now },
  ];

  const featureFlags = [
    { id: 'flag_01', key: 'chat_inteligente_v2', scopeType: 'global', scopeRef: '*', enabled: true, updatedAt: now },
    { id: 'flag_02', key: 'automacao_runtime_observability', scopeType: 'tenant', scopeRef: 'tenant_01', enabled: true, updatedAt: now },
    { id: 'flag_03', key: 'ai_assistant_beta', scopeType: 'tenant', scopeRef: 'tenant_03', enabled: false, updatedAt: now },
  ];

  return {
    clinics,
    subscriptions,
    billingEvents,
    supportTickets,
    supportMessages: [],
    auditLogs: [
      {
        id: 'audit_01',
        actor: 'system',
        actorRole: 'owner',
        action: 'platform.bootstrap',
        targetType: 'platform',
        targetId: 'core',
        metadata: 'Seed inicial da Platform Console',
        createdAt: now,
      },
    ],
    systemHealthChecks,
    featureFlags,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return createSeedState();
    parsed.clinics = Array.isArray(parsed.clinics) ? parsed.clinics : [];
    parsed.subscriptions = Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [];
    parsed.billingEvents = Array.isArray(parsed.billingEvents) ? parsed.billingEvents : [];
    parsed.supportTickets = Array.isArray(parsed.supportTickets) ? parsed.supportTickets : [];
    parsed.supportMessages = Array.isArray(parsed.supportMessages) ? parsed.supportMessages : [];
    parsed.auditLogs = Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [];
    parsed.systemHealthChecks = Array.isArray(parsed.systemHealthChecks) ? parsed.systemHealthChecks : [];
    parsed.featureFlags = Array.isArray(parsed.featureFlags) ? parsed.featureFlags : [];
    parsed.tenantModules = Array.isArray(parsed.tenantModules) ? parsed.tenantModules : [];
    parsed.tenantUsers = Array.isArray(parsed.tenantUsers) ? parsed.tenantUsers : [];
    parsed.usersProfile = Array.isArray(parsed.usersProfile) ? parsed.usersProfile : [];
    parsed.memberships = Array.isArray(parsed.memberships) ? parsed.memberships : [];
    parsed.authUsers = Array.isArray(parsed.authUsers) ? parsed.authUsers : [];
    return parsed;
  } catch {
    return createSeedState();
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

function withState(mutator) {
  const state = loadState();
  const result = mutator(state);
  saveState(state);
  return result;
}

function appendAudit(state, actor, action, targetType, targetId, metadata) {
  state.auditLogs.unshift({
    id: createId('audit'),
    actor: actor?.email || 'unknown',
    actorRole: actor?.role || 'unknown',
    action,
    targetType,
    targetId,
    metadata: typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {}),
    createdAt: nowIso(),
  });
}

function includeQuery(values, query) {
  if (!query) return true;
  const normalizedQuery = String(query).toLowerCase();
  return values.some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function ensureCanCreateClinic(actor) {
  const role = String(actor?.role || '').toLowerCase();
  if (!ALLOWED_ONBOARDING_ROLES.has(role)) {
    throw new Error('Somente owner ou super_admin pode criar nova clínica.');
  }
}

export async function createClinicOnboarding(actor, payload) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'24093c'},body:JSON.stringify({sessionId:'24093c',runId:'initial',hypothesisId:'H4',location:'platformConsoleService.js:createClinicOnboarding',message:'Onboarding service entry',data:{actorRole:String(actor?.role||''),hasPayload:Boolean(payload),planCode:String(payload?.planCode||'')},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  ensureCanCreateClinic(actor);

  const clinicName = normalizeText(payload?.clinicName);
  const city = normalizeText(payload?.city);
  const ownerName = normalizeText(payload?.ownerName);
  const adminName = normalizeText(payload?.adminName);
  const adminEmail = normalizeEmail(payload?.adminEmail);
  const adminPassword = String(payload?.adminPassword || '');
  const planCode = normalizeText(payload?.planCode);

  if (!clinicName) throw new Error('Nome da clínica é obrigatório.');
  if (!adminEmail) throw new Error('E-mail do administrador é obrigatório.');
  if (adminPassword.length < 8) throw new Error('A senha deve ter no mínimo 8 caracteres.');
  if (!PLAN_CATALOG.includes(planCode)) throw new Error('Plano inválido.');

  return withState((state) => {
    const emailTakenInClinics = state.clinics.some(
      (item) => normalizeEmail(item.ownerEmail) === adminEmail
    );
    const emailTakenInProfiles = (state.usersProfile || []).some(
      (item) => normalizeEmail(item.email) === adminEmail
    );
    const emailTakenInTenantUsers = (state.tenantUsers || []).some(
      (item) => normalizeEmail(item.email) === adminEmail
    );
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'24093c'},body:JSON.stringify({sessionId:'24093c',runId:'initial',hypothesisId:'H3',location:'platformConsoleService.js:createClinicOnboarding',message:'Email uniqueness check',data:{emailTakenInClinics,emailTakenInProfiles,emailTakenInTenantUsers},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (emailTakenInClinics || emailTakenInProfiles || emailTakenInTenantUsers) {
      throw new Error('Este e-mail já está em uso. Informe outro e-mail.');
    }

    const now = nowIso();
    const tenantId = createId('tenant');
    const userId = createId('user');
    const subscriptionId = createId('sub');
    const modulesFromPlan = PLAN_MODULES[planCode] || [];

    const clinic = {
      id: tenantId,
      name: clinicName,
      tradeName: clinicName,
      cnpj: '',
      city,
      state: '',
      ownerName: ownerName || adminName,
      ownerEmail: adminEmail,
      status: 'active',
      billing_status: 'ok',
      plan: planCode,
      health: 'healthy',
      assistedAccessEnabled: false,
      modules: [...modulesFromPlan],
      integrations: [],
      createdAt: now,
      updatedAt: now,
    };

    state.clinics.unshift(clinic);

    state.subscriptions.unshift({
      id: subscriptionId,
      tenantId,
      clinicName,
      plan: planCode,
      status: 'active',
      amountCents: PLAN_PRICES_CENTS[planCode] ?? 0,
      cycle: 'monthly',
      nextBillingAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      updatedAt: now,
    });

    state.tenantModules = state.tenantModules || [];
    modulesFromPlan.forEach((moduleName) => {
      state.tenantModules.push({
        id: createId('tmod'),
        tenant_id: tenantId,
        module_key: moduleName,
        enabled: true,
        created_at: now,
        updated_at: now,
      });
    });

    state.tenantUsers = state.tenantUsers || [];
    state.tenantUsers.push({
      id: createId('tusr'),
      tenant_id: tenantId,
      user_id: userId,
      full_name: adminName,
      email: adminEmail,
      role_slug: 'admin',
      status: 'active',
      created_at: now,
      updated_at: now,
    });

    // Espelha o vínculo esperado pelo app principal.
    state.usersProfile = state.usersProfile || [];
    state.usersProfile.push({
      id: userId,
      full_name: adminName,
      email: adminEmail,
      tenant_id: tenantId,
      created_at: now,
      updated_at: now,
    });

    state.memberships = state.memberships || [];
    state.memberships.push({
      id: createId('memb'),
      tenant_id: tenantId,
      user_id: userId,
      role: 'admin',
      has_system_access: true,
      status: 'active',
      created_at: now,
      updated_at: now,
    });

    // Simulação local de credencial para onboarding.
    state.authUsers = state.authUsers || [];
    state.authUsers.push({
      id: createId('auth'),
      user_id: userId,
      email: adminEmail,
      password_hash: `local_hash_${createId('pwd')}`,
      status: 'active',
      created_at: now,
    });

    appendAudit(state, actor, 'tenant.onboarding.created', 'tenant', tenantId, {
      clinicName,
      adminEmail,
      planCode,
      modules: modulesFromPlan,
    });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'24093c'},body:JSON.stringify({sessionId:'24093c',runId:'initial',hypothesisId:'H5',location:'platformConsoleService.js:createClinicOnboarding',message:'Onboarding service success',data:{tenantId,userId,subscriptionId,moduleCount:modulesFromPlan.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    return clinic;
  });
}

export function getPlatformDashboardSnapshot() {
  const state = loadState();
  const activeClinics = state.clinics.filter((item) => item.status === 'active').length;
  const blockedClinics = state.clinics.filter((item) => item.status === 'suspended').length;
  const overdue = state.billingEvents.filter((item) => item.status === 'overdue').length;
  const mrrCents = state.subscriptions
    .filter((item) => item.status === 'active')
    .reduce((acc, item) => acc + Number(item.amountCents || 0), 0);
  const openTickets = state.supportTickets.filter((item) => item.status === 'open').length;
  const incidents = state.systemHealthChecks.filter((item) => item.status !== 'healthy').length;
  return {
    cards: [
      { id: 'active_clinics', label: 'Clínicas ativas', value: activeClinics },
      { id: 'blocked_clinics', label: 'Clínicas bloqueadas', value: blockedClinics },
      { id: 'mrr', label: 'MRR', value: currency(mrrCents / 100) },
      { id: 'overdue', label: 'Inadimplentes', value: overdue },
      { id: 'tickets', label: 'Tickets abertos', value: openTickets },
      { id: 'incidents', label: 'Alertas de saúde', value: incidents },
    ],
    healthChecks: [...state.systemHealthChecks],
    overdueEvents: state.billingEvents.filter((item) => item.status === 'overdue'),
    recentAudits: [...state.auditLogs].slice(0, 8),
  };
}

export function listClinics({ query = '', status = 'all', plan = 'all' } = {}) {
  const state = loadState();
  return state.clinics
    .filter((clinic) => (status === 'all' ? true : clinic.status === status))
    .filter((clinic) => (plan === 'all' ? true : clinic.plan === plan))
    .filter((clinic) => includeQuery([clinic.name, clinic.tradeName, clinic.ownerEmail, clinic.city, clinic.state], query))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function getClinicDetail(tenantId) {
  const state = loadState();
  const clinic = state.clinics.find((item) => item.id === tenantId);
  if (!clinic) return null;
  return {
    clinic,
    subscription: state.subscriptions.find((item) => item.tenantId === tenantId) || null,
    billingHistory: state.billingEvents.filter((item) => item.tenantId === tenantId).slice(0, 20),
    supportHistory: state.supportTickets.filter((item) => item.tenantId === tenantId).slice(0, 20),
    recentErrors: state.systemHealthChecks.filter((item) => item.status !== 'healthy').slice(0, 8),
  };
}

export function listSubscriptions() {
  return [...loadState().subscriptions];
}

export function listBillingEvents() {
  return [...loadState().billingEvents].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function listConnectivityRows() {
  const state = loadState();
  return state.clinics.flatMap((clinic) =>
    clinic.integrations.map((integration) => ({
      id: `${clinic.id}_${integration.name}`,
      tenantId: clinic.id,
      clinicName: clinic.name,
      integrationName: integration.name,
      status: integration.status,
      lastSyncAt: integration.lastSyncAt,
    }))
  );
}

export function listSupportTickets({ query = '', status = 'all' } = {}) {
  const state = loadState();
  return state.supportTickets
    .filter((item) => (status === 'all' ? true : item.status === status))
    .filter((item) => includeQuery([item.clinicName, item.subject, item.lastMessage], query))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function listAuditLogs({ query = '' } = {}) {
  const state = loadState();
  return state.auditLogs.filter((item) => includeQuery([item.actor, item.action, item.targetType, item.targetId, item.metadata], query));
}

export function listFeatureFlags() {
  return [...loadState().featureFlags];
}

export function listCatalogs() {
  return {
    modules: [...MODULE_CATALOG],
    integrations: [...INTEGRATION_CATALOG],
    plans: [...PLAN_CATALOG],
  };
}

export function toggleClinicStatus(actor, tenantId) {
  return withState((state) => {
    const clinic = state.clinics.find((item) => item.id === tenantId);
    if (!clinic) throw new Error('Clínica não encontrada.');
    clinic.status = clinic.status === 'active' ? 'suspended' : 'active';
    clinic.updatedAt = nowIso();
    const subscription = state.subscriptions.find((item) => item.tenantId === tenantId);
    if (subscription) {
      subscription.status = clinic.status === 'active' ? 'active' : 'paused';
      subscription.updatedAt = nowIso();
    }
    appendAudit(state, actor, clinic.status === 'active' ? 'tenant.unblocked' : 'tenant.blocked', 'tenant', clinic.id, {
      clinicName: clinic.name,
    });
    return clinic;
  });
}

export function toggleClinicModule(actor, tenantId, moduleName) {
  return withState((state) => {
    const clinic = state.clinics.find((item) => item.id === tenantId);
    if (!clinic) throw new Error('Clínica não encontrada.');
    const hasModule = clinic.modules.includes(moduleName);
    clinic.modules = hasModule
      ? clinic.modules.filter((item) => item !== moduleName)
      : [...clinic.modules, moduleName];
    clinic.updatedAt = nowIso();
    appendAudit(state, actor, hasModule ? 'tenant.module.disabled' : 'tenant.module.enabled', 'tenant_module', clinic.id, {
      moduleName,
      enabled: !hasModule,
    });
    return clinic.modules;
  });
}

export function changeClinicPlan(actor, tenantId, nextPlan) {
  return withState((state) => {
    const clinic = state.clinics.find((item) => item.id === tenantId);
    const subscription = state.subscriptions.find((item) => item.tenantId === tenantId);
    if (!clinic || !subscription) throw new Error('Assinatura da clínica não encontrada.');
    if (!PLAN_CATALOG.includes(nextPlan)) throw new Error('Plano inválido.');
    clinic.plan = nextPlan;
    clinic.updatedAt = nowIso();
    subscription.plan = nextPlan;
    subscription.amountCents = nextPlan === 'Scale' ? 149900 : nextPlan === 'Growth' ? 99900 : 59900;
    subscription.updatedAt = nowIso();
    appendAudit(state, actor, 'tenant.plan.changed', 'tenant_subscription', clinic.id, {
      nextPlan,
    });
    return subscription;
  });
}

export function toggleAssistedAccess(actor, tenantId) {
  return withState((state) => {
    const clinic = state.clinics.find((item) => item.id === tenantId);
    if (!clinic) throw new Error('Clínica não encontrada.');
    clinic.assistedAccessEnabled = !clinic.assistedAccessEnabled;
    clinic.updatedAt = nowIso();
    appendAudit(state, actor, clinic.assistedAccessEnabled ? 'tenant.assisted_access.enabled' : 'tenant.assisted_access.disabled', 'tenant', clinic.id, {
      clinicName: clinic.name,
    });
    return clinic.assistedAccessEnabled;
  });
}

export function updateFeatureFlag(actor, flagId, enabled) {
  return withState((state) => {
    const flag = state.featureFlags.find((item) => item.id === flagId);
    if (!flag) throw new Error('Funcionalidade não encontrada.');
    flag.enabled = Boolean(enabled);
    flag.updatedAt = nowIso();
    appendAudit(state, actor, 'feature_flag.updated', 'feature_flag', flag.id, {
      key: flag.key,
      enabled: flag.enabled,
    });
    return flag;
  });
}
