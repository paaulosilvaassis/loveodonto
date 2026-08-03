/**
 * Phase 4.10 Wave 3I — feature flags globais + por tenant.
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createBuildFeatureFlags(deps = {}) {
  const normalize = deps.normalizeText || normalizeText;

  return function buildFeatureFlags(globalRows = [], tenantRows = []) {
    const map = {};
    for (const row of Array.isArray(globalRows) ? globalRows : []) {
      const key = normalize(row?.flag_key);
      if (key) map[key] = Boolean(row?.enabled);
    }
    for (const row of Array.isArray(tenantRows) ? tenantRows : []) {
      const key = normalize(row?.flag_key);
      if (key) map[key] = Boolean(row?.enabled);
    }
    return map;
  };
}
