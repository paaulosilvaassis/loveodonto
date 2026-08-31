/**
 * PHASE 11.P — setup de sessão sintética em STAGING.
 * Service role só aqui (fixture). O transport da app usa anon + sessão.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
} from '../../contracts/financialV2RemoteSchemaContract.js';
import {
  PHASE_11P_SYNTHETIC_EMAIL_A,
  PHASE_11P_SYNTHETIC_EMAIL_B,
  PHASE_11P_TENANT,
  PHASE_11P_TENANT_B,
  PHASE_11P_USER,
  PHASE_11P_USER_B,
} from '../../services/financialV2Phase11pFixtures.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function parseEnvFile(name) {
  const env = {};
  let text = '';
  try {
    text = readFileSync(join(ROOT, name), 'utf8');
  } catch {
    return env;
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

export function loadPhase11pStagingEnv() {
  const env = parseEnvFile('.env.staging.local');
  const url = env.STAGING_SUPABASE_URL || env.VITE_SUPABASE_APP_URL || env.SUPABASE_URL || '';
  const anon = env.STAGING_SUPABASE_ANON_KEY || env.VITE_SUPABASE_APP_ANON_KEY || env.SUPABASE_ANON_KEY || '';
  const service = env.STAGING_SUPABASE_SERVICE_ROLE_KEY || '';
  const ref = String(url).includes(STAGING_SUPABASE_PROJECT_REF)
    ? STAGING_SUPABASE_PROJECT_REF
    : '';
  if (!url || !anon || !ref) return null;
  if (url.includes(PRODUCTION_SUPABASE_PROJECT_REF)) {
    throw new Error('FINANCIAL_V2_APP_RUNTIME_PRODUCTION_FORBIDDEN');
  }
  return { url, anon, service, ref };
}

export function createPhase11pAnonClient(env, { persist = false } = {}) {
  return createClient(env.url, env.anon, {
    auth: { persistSession: persist, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function createAdminClient(env) {
  if (!env.service) return null;
  return createClient(env.url, env.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function seedPhase11pTenants(env) {
  const admin = createAdminClient(env);
  if (!admin) throw new Error('PHASE_11P_ADMIN_SETUP_REQUIRED');
  const { error: tenantError } = await admin.from('tenants').upsert([
    {
      id: PHASE_11P_TENANT, legal_name: 'phase11p-clinic-a', trade_name: 'phase11p-a',
      clinic_code: 'phase11p-a', status: 'active',
    },
    {
      id: PHASE_11P_TENANT_B, legal_name: 'phase11p-clinic-b', trade_name: 'phase11p-b',
      clinic_code: 'phase11p-b', status: 'active',
    },
  ], { onConflict: 'id' });
  if (tenantError) throw tenantError;
  const { error: memberError } = await admin.from('tenant_users').insert([
    {
      tenant_id: PHASE_11P_TENANT, user_id: PHASE_11P_USER, full_name: 'phase11p-user-a',
      email: PHASE_11P_SYNTHETIC_EMAIL_A, role_slug: 'admin', status: 'active',
      has_custom_permissions: false, is_active: true, has_system_access: true,
    },
    {
      tenant_id: PHASE_11P_TENANT_B, user_id: PHASE_11P_USER_B, full_name: 'phase11p-user-b',
      email: PHASE_11P_SYNTHETIC_EMAIL_B, role_slug: 'admin', status: 'active',
      has_custom_permissions: false, is_active: true, has_system_access: true,
    },
  ]);
  if (memberError && !/duplicate|unique/i.test(memberError.message || '')) throw memberError;
}

export async function cleanupPhase11pFixtures(env) {
  const admin = createAdminClient(env);
  if (!admin) return { leftovers: null };
  const tenants = [PHASE_11P_TENANT, PHASE_11P_TENANT_B];
  await admin.from('financial_v2_charges').delete().in('tenant_id', tenants);
  await admin.from('financial_v2_payments').delete().in('tenant_id', tenants);
  await admin.from('financial_v2_receivables').delete().in('tenant_id', tenants);
  await admin.from('financial_v2_financings').delete().in('tenant_id', tenants);
  await admin.from('tenant_users').delete().in('tenant_id', tenants);
  await admin.from('tenants').delete().in('id', tenants);
  await admin.auth.admin.deleteUser(PHASE_11P_USER).catch(() => {});
  await admin.auth.admin.deleteUser(PHASE_11P_USER_B).catch(() => {});
  const leftover = async (table, column = 'tenant_id') => {
    const { count } = await admin.from(table).select('*', { count: 'exact', head: true }).in(column, tenants);
    return count || 0;
  };
  return {
    leftovers: {
      receivables: await leftover('financial_v2_receivables'),
      payments: await leftover('financial_v2_payments'),
      financings: await leftover('financial_v2_financings'),
      charges: await leftover('financial_v2_charges'),
      tenants: await leftover('tenants', 'id'),
      tenant_users: await leftover('tenant_users'),
    },
  };
}

export async function provisionPhase11pSessions(env) {
  const admin = createAdminClient(env);
  if (!admin) throw new Error('PHASE_11P_ADMIN_SETUP_REQUIRED');
  await cleanupPhase11pFixtures(env);
  const password = `Phase11p-${crypto.randomUUID()}`;
  const users = [
    { id: PHASE_11P_USER, email: PHASE_11P_SYNTHETIC_EMAIL_A, tenantId: PHASE_11P_TENANT },
    { id: PHASE_11P_USER_B, email: PHASE_11P_SYNTHETIC_EMAIL_B, tenantId: PHASE_11P_TENANT_B },
  ];
  for (const item of users) {
    await admin.auth.admin.deleteUser(item.id).catch(() => {});
    const { error } = await admin.auth.admin.createUser({
      id: item.id,
      email: item.email,
      password,
      email_confirm: true,
      app_metadata: { tenant_id: item.tenantId },
    });
    if (error) throw error;
  }
  await seedPhase11pTenants(env);
  const clientA = createPhase11pAnonClient(env);
  const clientB = createPhase11pAnonClient(env);
  const signA = await clientA.auth.signInWithPassword({
    email: PHASE_11P_SYNTHETIC_EMAIL_A, password,
  });
  const signB = await clientB.auth.signInWithPassword({
    email: PHASE_11P_SYNTHETIC_EMAIL_B, password,
  });
  if (signA.error || !signA.data.session) throw signA.error || new Error('SIGNIN_A_FAILED');
  if (signB.error || !signB.data.session) throw signB.error || new Error('SIGNIN_B_FAILED');
  return {
    clientA,
    clientB,
    userA: signA.data.user,
    userB: signB.data.user,
    async dispose() {
      await clientA.auth.signOut().catch(() => {});
      await clientB.auth.signOut().catch(() => {});
      await admin.auth.admin.deleteUser(PHASE_11P_USER).catch(() => {});
      await admin.auth.admin.deleteUser(PHASE_11P_USER_B).catch(() => {});
    },
  };
}
