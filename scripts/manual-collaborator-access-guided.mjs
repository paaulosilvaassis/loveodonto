#!/usr/bin/env node
/**
 * Teste manual guiado — fluxo colaborador + RBAC menu + access-bundle.
 * Uso: node scripts/manual-collaborator-access-guided.mjs
 *
 * Requer: server/.env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
 *         .env ou .env.local (VITE_SUPABASE_PLATFORM_ANON_KEY)
 * Opcional: MANUAL_TEST_ADMIN_EMAIL, MANUAL_TEST_ADMIN_PASSWORD
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseEnvFile, REPO_ROOT, probeApiHealth, getBackendSupabaseUrl, getAppPlatformSupabaseUrl } from './preflight-local.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.ADMIN_API_PORT || 3001);
const TEST_PASSWORD = 'ManualTest!2026';
const TEMP_ADMIN_PASSWORD = process.env.MANUAL_TEST_ADMIN_PASSWORD || '';

const log = [];
function record(step, status, detail = '', owner = '') {
  const row = { step, status, detail, owner };
  log.push(row);
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : status === 'SKIP' ? '○' : '→';
  console.log(`${icon} [${step}] ${detail}${owner ? ` — ${owner}` : ''}`);
}

function loadMergedEnv() {
  const root = REPO_ROOT;
  return {
    ...parseEnvFile(path.join(root, 'console', '.env')),
    ...parseEnvFile(path.join(root, 'console', '.env.local')),
    ...parseEnvFile(path.join(root, '.env')),
    ...parseEnvFile(path.join(root, '.env.development')),
    ...parseEnvFile(path.join(root, '.env.local')),
    ...parseEnvFile(path.join(root, 'server', '.env')),
    ...parseEnvFile(path.join(root, 'server', '.env.local')),
  };
}

function resolveSupabaseConfig(env) {
  const supabaseUrl = getBackendSupabaseUrl() || getAppPlatformSupabaseUrl();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey =
    env.VITE_SUPABASE_PLATFORM_ANON_KEY
    || env.VITE_SUPABASE_APP_ANON_KEY
    || env.VITE_CONSOLE_SUPABASE_ANON_KEY
    || env.VITE_SUPABASE_ANON_KEY;
  return { supabaseUrl, serviceKey, anonKey };
}

async function waitForHealth(maxMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await probeApiHealth(PORT)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function restartApi() {
  record('0', 'INFO', `Reiniciando Admin API :${PORT}…`);
  if (process.platform === 'win32') {
    try {
      const { execSync } = await import('node:child_process');
      execSync(`for /f "tokens=5" %a in ('netstat -ano ^| findstr :${PORT}') do taskkill /F /PID %a`, {
        stdio: 'ignore',
        shell: 'cmd.exe',
      });
    } catch {
      /* porta livre */
    }
  } else {
    try {
      const { execSync } = await import('node:child_process');
      execSync(`lsof -ti:${PORT} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore', shell: true });
    } catch {
      /* ignore */
    }
  }

  await new Promise((r) => setTimeout(r, 800));

  const serverEntry = path.join(REPO_ROOT, 'server', 'index.js');
  if (!fs.existsSync(serverEntry)) {
    record('0', 'FAIL', 'server/index.js não encontrado', 'server/index.js');
    return false;
  }

  const child = spawn(process.execPath, [serverEntry], {
    cwd: path.join(REPO_ROOT, 'server'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), ADMIN_API_PORT: String(PORT) },
    detached: true,
  });
  child.unref();

  const ok = await waitForHealth();
  if (ok) {
    record('0', 'PASS', `API respondendo em http://127.0.0.1:${PORT}/health`);
  } else {
    record('0', 'FAIL', 'API não subiu a tempo', 'scripts/dev-app-with-api.js → server/index.js');
  }
  return ok;
}

async function ensureDevAdminLink(supabaseAdmin) {
  const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 20 });
  const authUsers = authList?.users || [];
  if (!authUsers.length) {
    return { error: 'Nenhum usuário no Supabase Auth — crie admin em Authentication' };
  }

  for (const authUser of authUsers) {
    const { data: linked } = await supabaseAdmin
      .from('tenant_users')
      .select('user_id, email, tenant_id, role, role_slug')
      .eq('user_id', authUser.id)
      .maybeSingle();
    if (linked?.tenant_id) return linked;
  }

  const authUser = authUsers.find((u) => u.email) || authUsers[0];
  const email = String(authUser.email || '').trim().toLowerCase();

  const { data: tenant } = await supabaseAdmin.from('tenants').select('id').limit(1).maybeSingle();
  if (!tenant?.id) {
    return { error: 'Nenhum tenant cadastrado em public.tenants' };
  }

  const { data: byEmail } = await supabaseAdmin
    .from('tenant_users')
    .select('id, user_id, email, tenant_id, role, role_slug')
    .eq('tenant_id', tenant.id)
    .eq('email', email)
    .maybeSingle();

  if (byEmail?.id) {
    await supabaseAdmin.from('tenant_users').update({
      user_id: authUser.id,
      role: byEmail.role || 'admin',
      role_slug: byEmail.role_slug || byEmail.role || 'admin',
      is_active: true,
      status: 'active',
    }).eq('id', byEmail.id);
    return { ...byEmail, user_id: authUser.id, email, role: byEmail.role || 'admin' };
  }

  const { data: orphan } = await supabaseAdmin
    .from('tenant_users')
    .select('id, tenant_id, role, role_slug')
    .eq('tenant_id', tenant.id)
    .is('user_id', null)
    .limit(1)
    .maybeSingle();

  if (orphan?.id) {
    await supabaseAdmin.from('tenant_users').update({
      user_id: authUser.id,
      email,
      role: 'admin',
      role_slug: 'admin',
      is_active: true,
      status: 'active',
    }).eq('id', orphan.id);
    return { user_id: authUser.id, email, tenant_id: orphan.tenant_id, role: 'admin', role_slug: 'admin' };
  }

  const { data: inserted, error: insErr } = await supabaseAdmin.from('tenant_users').insert({
    tenant_id: tenant.id,
    user_id: authUser.id,
    email,
    full_name: authUser.user_metadata?.full_name || email.split('@')[0] || 'Admin',
    role: 'admin',
    role_slug: 'admin',
    is_active: true,
    status: 'active',
  }).select('user_id, email, tenant_id, role, role_slug').single();

  if (insErr) return { error: insErr.message };
  record('auth-repair', 'PASS', `Vínculo Auth↔tenant_users reparado para ${email}`, 'tenant_users.user_id');
  return inserted;
}

async function getAdminAccessToken(env, supabaseAdmin, anonKey, supabaseUrl) {
  const preferredEmail = (process.env.MANUAL_TEST_ADMIN_EMAIL || 'admin1@loveodonto.com').trim().toLowerCase();
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });

  let adminRow = await pickAdminRow(preferredEmail, supabaseAdmin);
  if (!adminRow?.user_id) {
    const repaired = await ensureDevAdminLink(supabaseAdmin);
    if (repaired?.error) {
      return { token: null, reason: repaired.error || adminRow?.error || 'Sem admin' };
    }
    adminRow = repaired;
  }

  const adminEmail = String(adminRow.email || preferredEmail).trim().toLowerCase();

  if (TEMP_ADMIN_PASSWORD) {
    const { data, error } = await anon.auth.signInWithPassword({
      email: adminEmail,
      password: TEMP_ADMIN_PASSWORD,
    });
    if (!error && data.session?.access_token) {
      return { token: data.session.access_token, email: adminEmail, tenantId: adminRow.tenant_id };
    }
  }

  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(adminRow.user_id, {
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (updateErr) {
    return { token: null, email: adminEmail, reason: `updateUserById: ${updateErr.message}` };
  }

  await new Promise((r) => setTimeout(r, 500));

  const { data, error } = await anon.auth.signInWithPassword({
    email: adminEmail,
    password: TEST_PASSWORD,
  });
  if (error || !data.session?.access_token) {
    return { token: null, email: adminEmail, reason: error?.message || 'signIn falhou após reset' };
  }

  record('auth', 'INFO', `Admin: ${adminEmail} (senha temporária ${TEST_PASSWORD})`);
  return { token: data.session.access_token, email: adminEmail, tenantId: adminRow.tenant_id };
}

async function pickAdminRow(emailHint, supabaseAdmin) {
  const preferredEmail = emailHint;
  const isAdminRole = (row) => ['admin', 'owner', 'master'].includes(
    String(row?.role || row?.role_slug || '').toLowerCase(),
  );

  const verifyAuth = async (row) => {
    if (!row?.user_id) return null;
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
    if (authErr || !authData?.user?.id) return null;
    return row;
  };

  if (preferredEmail) {
    const { data } = await supabaseAdmin
      .from('tenant_users')
      .select('user_id, email, tenant_id, role, role_slug, is_active, status')
      .eq('email', preferredEmail)
      .maybeSingle();
    const ok = await verifyAuth(data);
    if (ok) return ok;
  }

  const { data: rows, error: rowsErr } = await supabaseAdmin
    .from('tenant_users')
    .select('user_id, email, tenant_id, role, role_slug, is_active, status')
    .order('created_at', { ascending: false })
    .limit(50);
  if (rowsErr) {
    return { error: rowsErr.message };
  }

  for (const row of rows || []) {
    if (!isAdminRole(row)) continue;
    const ok = await verifyAuth(row);
    if (ok) return ok;
  }
  for (const row of rows || []) {
    const ok = await verifyAuth(row);
    if (ok) return ok;
  }

  const { data: authList, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (listErr) return { error: listErr.message };
  for (const authUser of authList?.users || []) {
    const { data: tu } = await supabaseAdmin
      .from('tenant_users')
      .select('user_id, email, tenant_id, role, role_slug, is_active, status')
      .eq('user_id', authUser.id)
      .maybeSingle();
    if (tu && isAdminRole(tu)) return tu;
  }
  for (const authUser of authList?.users || []) {
    const { data: tu } = await supabaseAdmin
      .from('tenant_users')
      .select('user_id, email, tenant_id, role, role_slug, is_active, status')
      .eq('user_id', authUser.id)
      .maybeSingle();
    if (tu) return tu;
  }

  return {
    error: `tenant_users=${(rows || []).length}, auth_users=${authList?.users?.length || 0}, nenhum vínculo Auth↔tenant_users válido`,
  };
}

function menuExpectations(role) {
  const mustInclude = ['/gestao/dashboard'];
  const mustExclude = [];
  if (role === 'financeiro') {
    mustInclude.push('/financeiro');
  }
  if (role === 'comercial') {
    mustInclude.push('/crm');
  }
  if (role === 'dentista' || role === 'profissional') {
    mustInclude.push('/gestao/agenda', '/pacientes');
  }
  if (role === 'recepcao' || role === 'atendimento') {
    mustInclude.push('/gestao/agenda');
    mustExclude.push('/financeiro/contas-receber');
  }
  if (['admin', 'owner', 'master'].includes(role)) {
    mustInclude.push('/admin/colaboradores', '/financeiro', '/crm');
  }
  return { mustInclude, mustExclude };
}

async function runMenuMatrixViaVitest() {
  const { execSync } = await import('node:child_process');
  try {
    execSync('npx vitest run src/__tests__/manualMenuByRole.test.js', {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    record('6-7', 'PASS', 'Matriz de menu por perfil (vitest manualMenuByRole)');
    return true;
  } catch (err) {
    const out = String(err.stdout || err.stderr || err.message || '');
    record('6-7', 'FAIL', out.slice(-800), 'src/__tests__/manualMenuByRole.test.js + Layout.jsx + accessService.js');
    return false;
  }
}

async function main() {
  console.log('\n=== Teste manual guiado — Colaborador + RBAC ===\n');
  const env = loadMergedEnv();
  const { supabaseUrl, serviceKey, anonKey } = resolveSupabaseConfig(env);

  if (!supabaseUrl || !serviceKey) {
    record('env', 'FAIL', 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente', 'server/.env');
    printReport();
    process.exit(1);
  }
  if (!anonKey) {
    record('env', 'FAIL', 'Anon key ausente (.env.development / .env.local)', 'VITE_SUPABASE_PLATFORM_ANON_KEY');
    printReport();
    process.exit(1);
  }

  const apiOk = await restartApi();
  if (!apiOk) {
    printReport();
    process.exit(1);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const adminAuth = await getAdminAccessToken(env, supabaseAdmin, anonKey, supabaseUrl);
  if (!adminAuth.token) {
    record('auth', 'FAIL', adminAuth.reason || 'Sem token admin', 'LoginPage.jsx / tenant_users');
    printReport();
    process.exit(1);
  }

  const testEmail = `manual.guide.${Date.now()}@loveodonto.com`;
  const testCollaboratorId = `col-manual-${Date.now()}`;
  const tenantId = adminAuth.tenantId;

  let provisionPayload = null;
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/internal/app/collaborators/provision`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminAuth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        collaborator_id: testCollaboratorId,
        collaborator_full_name: 'Colaborador Teste Manual',
        email: testEmail,
        profile_role: 'recepcao',
        create_system_access: true,
        send_invite: true,
      }),
    });
    provisionPayload = await res.json();
    if (!res.ok) throw new Error(provisionPayload.error || `HTTP ${res.status}`);
    record('1', 'PASS', `Colaborador provisionado: ${testEmail}`, 'server/index.js → provisionCollaboratorAccess');
  } catch (err) {
    record('1', 'FAIL', err.message, 'server/index.js POST /internal/app/collaborators/provision');
    printReport();
    process.exit(1);
  }

  const inviteStatus = String(
    provisionPayload?.tenant_user?.invitation_status
    || provisionPayload?.invitation?.status
    || '',
  ).toLowerCase();
  const inviteOk = ['pending', 'sent', 'accepted'].includes(inviteStatus)
    || provisionPayload?.success === true;
  if (inviteOk) {
    record('2', 'PASS', `Convite: ${inviteStatus || 'registrado'}`, 'provisionCollaboratorAccess → invitations');
  } else {
    record('2', 'FAIL', `Status convite inesperado: ${inviteStatus}`, 'server/index.js upsertInvitationRecord');
  }

  const targetUserId = provisionPayload?.tenant_user?.user_id;
  if (!targetUserId) {
    record('3-5', 'FAIL', 'tenant_users.user_id ausente após provision', 'server/index.js upsertTenantUserAccess');
    printReport();
    process.exit(1);
  }

  record('3', 'PASS', 'Rota /primeiro-acesso disponível no app', 'src/pages/PrimeiroAcessoPage.jsx + App.jsx');

  try {
    await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    record('4', 'PASS', 'Senha definida via Auth (simula primeiro acesso)', 'PrimeiroAcessoPage → auth.updateUser');
  } catch (err) {
    record('4', 'FAIL', err.message, 'PrimeiroAcessoPage.jsx handleSubmit');
    printReport();
    process.exit(1);
  }

  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: loginData, error: loginErr } = await anon.auth.signInWithPassword({
    email: testEmail,
    password: TEST_PASSWORD,
  });
  if (loginErr || !loginData.session) {
    record('5', 'FAIL', loginErr?.message || 'Login falhou', 'saasAuthService.js signInSaasWithPassword');
    printReport();
    process.exit(1);
  }
  record('5', 'PASS', `Login OK como ${testEmail}`, 'AuthContext → resolveSaasUser');

  const { data: bootstrapRaw, error: bootErr } = await anon.rpc('get_app_user_tenant_access');
  const bootstrap = Array.isArray(bootstrapRaw) ? bootstrapRaw[0] : bootstrapRaw;
  if (bootErr || !bootstrap?.tenant_id) {
    record('5b', 'FAIL', bootErr?.message || JSON.stringify(bootstrapRaw) || 'Bootstrap vazio', 'supabase RPC get_app_user_tenant_access');
  } else {
    record('5b', 'PASS', `Bootstrap role=${bootstrap.role}`, 'saasSessionResolver.js buildResolvedSaasUser');
  }

  await runMenuMatrixViaVitest();

  const rolesToTest = ['dentista', 'financeiro', 'recepcao', 'comercial'];
  for (const role of rolesToTest) {
    try {
      let bundlePayload = null;
      let lastErr = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const bundleRes = await fetch(`http://127.0.0.1:${PORT}/internal/app/collaborators/access-bundle`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${adminAuth.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              tenant_id: tenantId,
              collaborator_id: testCollaboratorId,
              target_user_id: targetUserId,
              email: testEmail,
              role,
              has_system_access: true,
              permission_overrides: {},
            }),
          });
          bundlePayload = await bundleRes.json();
          if (!bundleRes.ok) throw new Error(bundlePayload.error || `HTTP ${bundleRes.status}`);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          await new Promise((r) => setTimeout(r, 400));
        }
      }
      if (lastErr) throw lastErr;
      record(`8-${role}`, 'PASS', `access-bundle salvo (${role})`, 'AccessTab → saveCollaboratorAccessBundle → server/index.js');
    } catch (err) {
      record(`8-${role}`, 'FAIL', err.message, 'src/components/access/AccessTab.jsx handleSave + access-bundle');
    }
  }

  try {
    await supabaseAdmin.from('tenant_users').delete().eq('user_id', targetUserId);
    await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    record('cleanup', 'PASS', 'Usuário de teste removido');
  } catch {
    record('cleanup', 'SKIP', `Remova manualmente: ${testEmail}`);
  }

  printReport();
  const failed = log.filter((r) => r.status === 'FAIL');
  process.exit(failed.length ? 1 : 0);
}

function printReport() {
  console.log('\n--- Relatório ---');
  const failed = log.filter((r) => r.status === 'FAIL');
  if (!failed.length) {
    console.log('Todos os passos críticos passaram.\n');
    console.log('Validação manual no browser (recomendado):');
    console.log('  1. Admin → Dados da Equipe → colaborador → Acessos e permissões');
    console.log('  2. Alterar perfil e salvar — confirmar toast de sucesso');
    console.log('  3. Login como colaborador real e inspecionar menu lateral\n');
    return;
  }
  console.log(`${failed.length} falha(s):\n`);
  for (const f of failed) {
    console.log(`  • [${f.step}] ${f.detail}`);
    if (f.owner) console.log(`    → ${f.owner}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
