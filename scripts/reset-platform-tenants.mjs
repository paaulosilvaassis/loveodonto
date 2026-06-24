#!/usr/bin/env node
/**
 * Remove todas as clínicas (tenants) e usuários de acesso do Supabase.
 * Preserva platform_admin_users (ex.: admin da Console).
 *
 * Uso:
 *   node scripts/reset-platform-tenants.mjs           # dry-run
 *   node scripts/reset-platform-tenants.mjs --confirm
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { getBackendSupabaseUrl, parseEnvFile, REPO_ROOT } from './preflight-local.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_TENANT_TABLES = [
  'marketing_job_attempts',
  'marketing_automation_run_steps',
  'marketing_automation_runs',
  'marketing_automation_events',
  'marketing_scheduled_jobs',
  'marketing_automation_metrics_daily',
  'marketing_chat_messages',
  'marketing_chat_conversations',
  'marketing_chat_contacts',
  'marketing_chat_campaigns',
  'marketing_chat_automations',
  'marketing_chat_funnels',
  'marketing_chat_tags',
  'marketing_chat_departments',
  'marketing_chat_attendants',
  'crm_tasks',
  'crm_leads',
  'cash_transactions',
  'payables',
  'receivable_payments',
  'accounts_receivable',
  'transactions',
  'appointments',
  'patients',
  'invitations',
  'memberships',
  'users_profile',
  'generated_contracts',
  'contract_signatures',
  'contract_templates',
  'contract_blocks',
  'clinical_guides',
  'clinical_guide_items',
];

function loadEnv() {
  return {
    ...parseEnvFile(path.join(REPO_ROOT, 'server', '.env')),
    ...parseEnvFile(path.join(REPO_ROOT, 'server', '.env.local')),
    ...parseEnvFile(path.join(REPO_ROOT, '.env')),
    ...parseEnvFile(path.join(REPO_ROOT, '.env.local')),
  };
}

function isMissingRelation(error) {
  const code = String(error?.code || '').toUpperCase();
  const msg = String(error?.message || '').toLowerCase();
  return code === 'PGRST205' || code === '42P01'
    || (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('schema cache') && msg.includes('could not find'));
}

async function deleteByTenantIds(supabase, table, tenantIds) {
  if (!tenantIds.length) return { deleted: 0, skipped: false };
  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .in('tenant_id', tenantIds);
  if (error) {
    if (isMissingRelation(error)) return { deleted: 0, skipped: true };
    throw new Error(`${table}: ${error.message}`);
  }
  return { deleted: count ?? 0, skipped: false };
}

async function main() {
  const confirm = process.argv.includes('--confirm');
  const env = loadEnv();
  const supabaseUrl = getBackendSupabaseUrl();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em server/.env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tenants, error: tenantsError } = await supabase
    .from('tenants')
    .select('id, legal_name, trade_name, owner_email, created_at')
    .order('created_at', { ascending: true });
  if (tenantsError) throw new Error(tenantsError.message);

  const { data: platformAdmins, error: adminsError } = await supabase
    .from('platform_admin_users')
    .select('id, email, role_slug');
  if (adminsError) throw new Error(adminsError.message);

  const { data: tenantUsers, error: tenantUsersError } = await supabase
    .from('tenant_users')
    .select('id, tenant_id, user_id, email, full_name');
  if (tenantUsersError) throw new Error(tenantUsersError.message);

  const tenantIds = (tenants || []).map((row) => row.id);
  const adminIds = new Set((platformAdmins || []).map((row) => row.id));
  const authUserIds = [...new Set(
    (tenantUsers || [])
      .map((row) => row.user_id)
      .filter((id) => id && !adminIds.has(id)),
  )];

  console.log('=== Reset de clínicas (Platform Console) ===');
  console.log(`Supabase: ${supabaseUrl}`);
  console.log(`Clínicas encontradas: ${tenantIds.length}`);
  for (const tenant of tenants || []) {
    console.log(`  - ${tenant.trade_name || tenant.legal_name} (${tenant.owner_email || 'sem e-mail'})`);
  }
  console.log(`Usuários de acesso (auth) a remover: ${authUserIds.length}`);
  console.log(`Admins da plataforma preservados: ${(platformAdmins || []).length}`);

  if (!tenantIds.length) {
    console.log('\nNenhuma clínica para remover.');
    return;
  }

  if (!confirm) {
    console.log('\nDry-run apenas. Para executar a limpeza, rode:');
    console.log('  node scripts/reset-platform-tenants.mjs --confirm');
    return;
  }

  console.log('\nRemovendo dados vinculados às clínicas...');
  for (const table of APP_TENANT_TABLES) {
    const result = await deleteByTenantIds(supabase, table, tenantIds);
    if (!result.skipped && result.deleted > 0) {
      console.log(`  ${table}: ${result.deleted} registro(s)`);
    }
  }

  const { error: auditError } = await supabase
    .from('audit_logs')
    .delete()
    .in('tenant_id', tenantIds);
  if (auditError && !isMissingRelation(auditError)) {
    throw new Error(`audit_logs: ${auditError.message}`);
  }

  const { error: deleteTenantsError, count: deletedTenants } = await supabase
    .from('tenants')
    .delete({ count: 'exact' })
    .in('id', tenantIds);
  if (deleteTenantsError) throw new Error(deleteTenantsError.message);

  console.log(`Clínicas removidas: ${deletedTenants ?? tenantIds.length}`);

  let removedAuthUsers = 0;
  for (const userId of authUserIds) {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      console.warn(`  Aviso: não foi possível remover auth user ${userId}: ${error.message}`);
      continue;
    }
    removedAuthUsers += 1;
  }

  console.log(`Usuários auth removidos: ${removedAuthUsers}/${authUserIds.length}`);
  console.log('\nLimpeza concluída. A Console deve listar zero clínicas após recarregar.');
}

main().catch((err) => {
  console.error('\nFalha:', err?.message || err);
  process.exit(1);
});
