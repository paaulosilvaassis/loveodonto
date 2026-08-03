/**
 * Phase 4.10 Wave 3I — mapa de módulos habilitados por tenant.
 */

export function buildModuleMap(rows = []) {
  const map = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.module_key || '').trim().toUpperCase();
    if (key) map[key] = Boolean(row?.enabled !== false);
  }
  return map;
}
