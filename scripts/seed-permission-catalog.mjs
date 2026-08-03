#!/usr/bin/env node
/**
 * Seed permission_catalog + role_permission_defaults via service role (dev/local).
 * Equivalente ao INSERT da migration 015 (após DDL aplicado).
 */
import { createClient } from '@supabase/supabase-js';
import { buildPermissionsCatalog } from '../src/permissions/catalog.js';
import { ROLE_DEFAULT_PERMISSIONS } from '../src/permissions/roleDefaults.js';
import { parseEnvFile, REPO_ROOT, getBackendSupabaseUrl } from './preflight-local.mjs';

function loadServiceRoleKey() {
  const merged = {
    ...parseEnvFile(`${REPO_ROOT}/server/.env`),
    ...parseEnvFile(`${REPO_ROOT}/.env`),
  };
  return String(merged.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function buildRoleDefaultRows(catalogIds) {
  const extraRoles = ['owner', 'admin', 'master', 'atendimento', 'gerente', 'recepcao', 'profissional'];
  const roleRows = new Map();
  for (const [role, perms] of Object.entries(ROLE_DEFAULT_PERMISSIONS)) {
    for (const pid of perms) {
      if (!catalogIds.has(pid)) continue;
      roleRows.set(`${role}::${pid}`, { role_slug: role, permission_id: pid });
    }
  }
  for (const role of extraRoles) {
    const base = ROLE_DEFAULT_PERMISSIONS[role] || ROLE_DEFAULT_PERMISSIONS.atendimento || [];
    for (const pid of base) {
      if (!catalogIds.has(pid)) continue;
      roleRows.set(`${role}::${pid}`, { role_slug: role, permission_id: pid });
    }
  }
  return [...roleRows.values()];
}

const url = getBackendSupabaseUrl();
const key = loadServiceRoleKey();
if (!url || !key) {
  console.error('[seed] SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY obrigatórios em server/.env');
  process.exit(1);
}

const ref = new URL(url).hostname.split('.')[0];
console.log(`[seed] Projeto: ${ref}.supabase.co`);

const catalog = buildPermissionsCatalog().map((p, i) => ({
  id: p.id,
  module_group_key: p.module_group_key,
  module_group_label: p.module_group_label,
  module_key: p.module_key,
  module_label: p.module_label,
  action_key: p.action_key,
  description: p.description,
  sort_order: i + 1,
}));

const catalogIds = new Set(catalog.map((p) => p.id));
const roleDefaults = buildRoleDefaultRows(catalogIds);

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { error: catErr } = await supabase.from('permission_catalog').upsert(catalog, { onConflict: 'id' });
if (catErr) {
  console.error('[seed] permission_catalog:', catErr.message);
  process.exit(1);
}

const { error: roleErr } = await supabase.from('role_permission_defaults').upsert(roleDefaults, {
  onConflict: 'role_slug,permission_id',
  ignoreDuplicates: true,
});
if (roleErr) {
  console.error('[seed] role_permission_defaults:', roleErr.message);
  process.exit(1);
}

console.log(`[seed] OK — ${catalog.length} permissões, ${roleDefaults.length} role defaults`);
