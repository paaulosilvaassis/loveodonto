const ALL_MODULES = ['CORE', 'AGENDA', 'CRM', 'FINANCEIRO', 'MARKETING', 'ESTOQUE', 'SUPORTE'];

const ROUTE_MODULE_RULES = [
  { prefix: '/marketing', module: 'MARKETING' },
  { prefix: '/crm', module: 'CRM' },
  { prefix: '/comercial', module: 'MARKETING' },
  { prefix: '/financeiro', module: 'FINANCEIRO' },
  { prefix: '/estoque', module: 'ESTOQUE' },
  { prefix: '/suporte', module: 'SUPORTE' },
  { prefix: '/gestao/agenda', module: 'AGENDA' },
];

const ROUTE_FEATURE_FLAG_RULES = [
  { prefix: '/comercial/whatsapp/ia', flag: 'whatsapp_ai_enabled' },
  { prefix: '/marketing/chat-inteligente/observabilidade', flag: 'marketing_automation_observability' },
];

export function normalizeModuleKey(value) {
  return String(value || '').trim().toUpperCase();
}

export function createDefaultModuleMap() {
  return ALL_MODULES.reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});
}

export function isModuleEnabled(modules, moduleName) {
  if (!moduleName) return true;
  const normalized = normalizeModuleKey(moduleName);
  if (!normalized) return true;
  if (!modules || typeof modules !== 'object') return true;
  if (Object.keys(modules).length === 0) return true;
  return modules[normalized] !== false;
}

export function getRequiredModuleForRoute(routePath) {
  const path = String(routePath || '').trim();
  const rule = ROUTE_MODULE_RULES.find((item) => path === item.prefix || path.startsWith(`${item.prefix}/`));
  return rule?.module || null;
}

export function getRequiredFeatureFlagForRoute(routePath) {
  const path = String(routePath || '').trim();
  const rule = ROUTE_FEATURE_FLAG_RULES.find((item) => path === item.prefix || path.startsWith(`${item.prefix}/`));
  return rule?.flag || null;
}

export function isFeatureFlagEnabled(flags, flagKey) {
  if (!flagKey) return true;
  if (!flags || typeof flags !== 'object') return true;
  if (flags[flagKey] === undefined) return true;
  return Boolean(flags[flagKey] === true);
}

export function canAccessRoute(routePath, modules, flags) {
  const moduleName = getRequiredModuleForRoute(routePath);
  if (!isModuleEnabled(modules, moduleName)) return false;
  const flagKey = getRequiredFeatureFlagForRoute(routePath);
  if (!isFeatureFlagEnabled(flags, flagKey)) return false;
  return true;
}
