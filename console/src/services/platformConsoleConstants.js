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

export const PLAN_CATALOG = ['Start', 'Growth', 'Scale'];

export const PLAN_PRICES_CENTS = {
  Start: 59900,
  Growth: 99900,
  Scale: 149900,
};

export const PLAN_MODULES = {
  Start: ['Agenda', 'Pacientes'],
  Growth: ['Agenda', 'Pacientes', 'Financeiro', 'CRM'],
  Scale: [...MODULE_CATALOG],
};

export const ALLOWED_ONBOARDING_ROLES = new Set(['owner', 'super_admin']);

export function integrationKeyToLabel(key) {
  const k = String(key || '').trim();
  return INTEGRATION_LABELS[k] || k || '—';
}
