/** Catálogos de produto (rótulos / planos), não são dados de tenant. */
export const MODULE_CATALOG = ['Agenda', 'Pacientes', 'CRM', 'Financeiro', 'Marketing', 'IA', 'Estoque'];

export const INTEGRATION_LABELS = {
  whatsapp_cloud_api: 'WhatsApp Cloud API',
  meta_ads: 'Meta Ads',
  webhook_api: 'Webhook API',
  n8n: 'N8N',
  pagar_me: 'Pagar.me',
};

export const INTEGRATION_KEYS = Object.keys(INTEGRATION_LABELS);

/**
 * Planos comerciais Love Odonto.
 * Códigos internos (Start/Growth/Scale) preservados para compatibilidade com tenant_subscriptions.
 */
export const PLAN_DEFINITIONS = {
  Start: {
    code: 'Start',
    label: 'Essencial',
    tagline: 'Estruture agenda e pacientes com segurança',
    priceCents: 8990,
    agendas: 5,
    modules: ['Agenda', 'Pacientes'],
    limits: { agendas: 5, patients: 800, users: 8, storage_gb: 5 },
    benefits: [
      '5 agendas de profissionais',
      'Agenda completa e cadastro de pacientes',
      'Orçamentos, convênios e fluxo do paciente',
    ],
  },
  Growth: {
    code: 'Growth',
    label: 'Profissional',
    tagline: 'Financeiro e CRM para clínicas em crescimento',
    priceCents: 14990,
    agendas: 9,
    modules: ['Agenda', 'Pacientes', 'Financeiro', 'CRM'],
    limits: { agendas: 9, patients: 2500, users: 20, storage_gb: 15 },
    benefits: [
      '9 agendas de profissionais',
      'Financeiro completo (caixa, CR/CP, comissões)',
      'CRM com pipeline, leads e follow-up',
    ],
  },
  Scale: {
    code: 'Scale',
    label: 'Completo',
    tagline: 'Operação integrada com marketing e estoque',
    priceCents: 23990,
    agendas: 15,
    modules: [...MODULE_CATALOG],
    limits: { agendas: 15, patients: 8000, users: 40, storage_gb: 40 },
    benefits: [
      '15 agendas de profissionais',
      'Marketing, Chat Inteligente e automações',
      'Estoque, IA e integrações avançadas',
    ],
  },
};

export const PLAN_CATALOG = Object.keys(PLAN_DEFINITIONS);

export const PLAN_PRICES_CENTS = Object.fromEntries(
  PLAN_CATALOG.map((code) => [code, PLAN_DEFINITIONS[code].priceCents]),
);

export const PLAN_MODULES = Object.fromEntries(
  PLAN_CATALOG.map((code) => [code, [...PLAN_DEFINITIONS[code].modules]]),
);

export const PLAN_ALIASES = {
  start: 'Start',
  essencial: 'Start',
  growth: 'Growth',
  profissional: 'Growth',
  scale: 'Scale',
  completo: 'Scale',
};

export const ALLOWED_ONBOARDING_ROLES = new Set(['owner', 'super_admin']);

export function resolvePlanCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (PLAN_DEFINITIONS[raw]) return raw;
  return PLAN_ALIASES[raw.toLowerCase()] || '';
}

export function getPlanDefinition(planCode) {
  const code = resolvePlanCode(planCode);
  return code ? PLAN_DEFINITIONS[code] : null;
}

export function getPlanLabel(planCode) {
  return getPlanDefinition(planCode)?.label || String(planCode || '—');
}

export function getPlanLimits(planCode) {
  return { ...(getPlanDefinition(planCode)?.limits || {}) };
}

export function formatPlanPrice(planCode) {
  const cents = getPlanDefinition(planCode)?.priceCents ?? 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function integrationKeyToLabel(key) {
  const k = String(key || '').trim();
  return INTEGRATION_LABELS[k] || k || '—';
}
