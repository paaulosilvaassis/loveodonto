/**
 * Backend SaaS local: integração obrigatória entre Console (5177) e App (5176).
 * Usa SOMENTE service role no servidor para provisionamento e snapshot do tenant.
 */
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');
/**
 * 1) `server/.env` — valores base.
 * 2) `.env` e `.env.local` na **raiz do repositório** com `override: true` — um único sítio para
 *    `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` alinhados com a Console (5177) e o app (5176).
 * Variáveis de ambiente do sistema continuam a ser sobrescritas pelo último ficheiro carregado.
 */
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env'), override: true });
dotenv.config({ path: path.join(repoRoot, '.env.local'), override: true });
console.log(
  '[SaaS Admin API] env: server/.env depois raiz .env/.env.local (a raiz prevalece — veja .env.example na raiz).',
);

const app = express();
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Platform-Key'],
  }),
);
app.use(express.json());

/** Health check leve (sem Supabase) — usado pelo script `npm run console:stack` para saber quando a API está escutando. */
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'saas-admin-api' });
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PLATFORM_API_KEY = process.env.PLATFORM_API_KEY || process.env.ADMIN_API_KEY || '';
const PORT = Number(process.env.ADMIN_API_PORT || 3001);

function decodeJwtPayload(token) {
  const raw = String(token || '').trim();
  if (!raw.startsWith('eyJ')) return null;
  const parts = raw.split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function validateServiceRoleKey(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    throw new Error('Admin API: SUPABASE_SERVICE_ROLE_KEY está vazia.');
  }
  if (raw.startsWith('sb_publishable_')) {
    throw new Error(
      'Admin API: SUPABASE_SERVICE_ROLE_KEY está com uma chave publishable (sb_publishable_), não service_role. '
      + 'Troque pela service_role key do MESMO projeto Supabase usado pela Console e pelo app.',
    );
  }
  if (raw.startsWith('sb_secret_')) {
    return;
  }
  const payload = decodeJwtPayload(raw);
  const role = String(payload?.role || payload?.app_metadata?.role || '').trim().toLowerCase();
  if (!role) {
    throw new Error(
      'Admin API: não foi possível validar SUPABASE_SERVICE_ROLE_KEY como service_role. '
      + 'Use a service_role key ou uma server secret key do mesmo projeto Supabase da Console e do app.',
    );
  }
  if (role !== 'service_role') {
    throw new Error(
      'Admin API: SUPABASE_SERVICE_ROLE_KEY não é uma service role key válida. '
      + 'Use a chave service_role do mesmo projeto Supabase da Console e do app.',
    );
  }
}

function isOptionalTenantLimitsError(error) {
  const code = String(error?.code || '').toUpperCase();
  return code === 'PGRST116' || code === 'PGRST205';
}

function normalizeDatabaseError(error, fallbackMessage) {
  const raw = String(error?.message || error || '').trim();
  const lower = raw.toLowerCase();
  if (lower.includes('stack depth limit exceeded')) {
    return (
      'O banco retornou "stack depth limit exceeded". '
      + 'Isso normalmente indica que o backend NÃO está usando a service role key correta '
      + 'e entrou em recursão de RLS no Supabase. Verifique SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  return raw || fallbackMessage;
}

/** Só para diagnóstico local: compara host da Console em `console/.env` com `server/.env` (sem expor segredos). */
function parseEnvFileKeyValues(filePath) {
  const out = {};
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
  } catch {
    /* ficheiro ausente */
  }
  return out;
}

function warnIfConsoleSupabaseHostnameDiffersFromServer() {
  const consoleDir = path.join(repoRoot, 'console');
  /** Último ganha; inclui raiz do repo (onde o Vite da Console também lê). */
  const merged = {
    ...parseEnvFileKeyValues(path.join(consoleDir, '.env')),
    ...parseEnvFileKeyValues(path.join(consoleDir, '.env.local')),
    ...parseEnvFileKeyValues(path.join(consoleDir, '.env.development')),
    ...parseEnvFileKeyValues(path.join(consoleDir, '.env.development.local')),
    ...parseEnvFileKeyValues(path.join(repoRoot, '.env')),
    ...parseEnvFileKeyValues(path.join(repoRoot, '.env.local')),
  };
  const raw = String(
    merged.VITE_CONSOLE_SUPABASE_URL
    || merged.VITE_SUPABASE_URL
    || '',
  ).trim();
  if (!raw || !SUPABASE_URL) return;
  let consoleHost;
  let serverHost;
  try {
    consoleHost = new URL(raw).hostname;
    serverHost = new URL(SUPABASE_URL).hostname;
  } catch {
    return;
  }
  if (consoleHost === serverHost) return;
  console.error(
    '[Admin API] AVISO: projeto Supabase da Console ≠ SUPABASE_URL do backend — login JWT falha (kid).\n'
    + `  console (VITE_CONSOLE_SUPABASE_URL host): ${consoleHost}\n`
    + `  backend (SUPABASE_URL host):              ${serverHost}\n`
    + '  Ação: copie o MESMO URL e service_role para `.env` na RAIZ do repo (prevalece sobre server/.env) ou edite server/.env. '
    + 'Supabase → Settings → API. Reinicie o backend.\n',
  );
}

console.log('[SaaS Admin API] SUPABASE_URL loaded', Boolean(SUPABASE_URL));
if (SUPABASE_URL) {
  try {
    console.log('[SaaS Admin API] SUPABASE_URL host', new URL(SUPABASE_URL).hostname);
  } catch {
    console.log('[SaaS Admin API] SUPABASE_URL não é uma URL http(s) válida — corrija .env na raiz ou server/.env');
  }
}
console.log('[SaaS Admin API] SERVICE_ROLE_KEY loaded', Boolean(SUPABASE_SERVICE_ROLE_KEY));
console.log('[SaaS Admin API] PLATFORM_API_KEY loaded', Boolean(PLATFORM_API_KEY));
warnIfConsoleSupabaseHostnameDiffersFromServer();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[SaaS Admin API] FATAL: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de iniciar.');
  console.error('  Use `.env` na RAIZ do repositório (prevalece sobre server/.env). Veja `.env.example`.');
  process.exit(1);
}
try {
  validateServiceRoleKey(SUPABASE_SERVICE_ROLE_KEY);
} catch (e) {
  console.error('[SaaS Admin API] SUPABASE_SERVICE_ROLE_KEY inválida:', e?.message || e);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Host do `iss` do JWT (sem verificar assinatura) — só para diagnóstico de projeto errado. */
function jwtAccessTokenIssuerHost(accessToken) {
  try {
    const raw = String(accessToken || '').trim();
    if (!raw.startsWith('eyJ')) return null;
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const iss = String(payload.iss || '').trim();
    if (!iss) return null;
    return new URL(iss).hostname;
  } catch {
    return null;
  }
}

function configuredSupabaseHost() {
  try {
    return new URL(SUPABASE_URL).hostname;
  } catch {
    return null;
  }
}

/**
 * Enriquece mensagem de falha do GoTrue (ex.: unrecognized kid) comparando emissor do token e SUPABASE_URL.
 */
function explainJwtVerifyFailure(userError, accessToken) {
  const base = normalizeDatabaseError(userError, '') || String(userError?.message || '').trim();
  const lower = base.toLowerCase();
  const looksLikeJwt =
    lower.includes('jwt')
    || lower.includes('kid')
    || lower.includes('unverifiable')
    || lower.includes('signature')
    || lower.includes('token');
  if (!looksLikeJwt) return base || 'Token inválido.';

  const tokenHost = jwtAccessTokenIssuerHost(accessToken);
  const serverHost = configuredSupabaseHost();
  if (tokenHost && serverHost && tokenHost !== serverHost) {
    return (
      `${base} — Diagnóstico: o access token foi emitido pelo Auth de "${tokenHost}", `
      + `mas SUPABASE_URL deste servidor aponta para "${serverHost}". `
      + 'Alinhe `.env` na raiz do repo (prevalece) ou `console/.env` e `server/.env` ao mesmo projeto (Settings → API), reinicie Vite e o backend, '
      + 'limpe dados do site em localhost:5177 e faça login de novo.'
    );
  }
  if (tokenHost && serverHost && tokenHost === serverHost) {
    return (
      `${base} — Mesmo projeto (${tokenHost}), mas a assinatura não bateu. `
      + 'Limpe sessão no browser (Application → Clear site data), faça login de novo; confira se anon/publishable '
      + 'e service_role no .env são do projeto atual (sem chaves antigas ou cortadas).'
    );
  }
  return base;
}

const PLAN_CONFIG = {
  Start: {
    priceCents: 0,
    modules: ['Agenda', 'Pacientes'],
    limits: { patients: 500, users: 10, storage_gb: 5 },
  },
  Growth: {
    priceCents: 19900,
    modules: ['Agenda', 'Pacientes', 'Financeiro', 'CRM'],
    limits: { patients: 1500, users: 30, storage_gb: 20 },
  },
  Scale: {
    priceCents: 49900,
    modules: ['Agenda', 'Pacientes', 'Financeiro', 'CRM', 'Estoque', 'Marketing', 'Suporte'],
    limits: { patients: 5000, users: 100, storage_gb: 50 },
  },
};

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePlanCode(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'start') return 'Start';
  if (lower === 'growth') return 'Growth';
  if (lower === 'scale') return 'Scale';
  return PLAN_CONFIG[raw] ? raw : '';
}

function buildModuleMap(rows = []) {
  const map = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.module_key || '').trim().toUpperCase();
    if (key) map[key] = Boolean(row?.enabled !== false);
  }
  return map;
}

function buildFeatureFlags(globalRows = [], tenantRows = []) {
  const map = {};
  for (const row of Array.isArray(globalRows) ? globalRows : []) {
    const key = normalizeText(row?.flag_key);
    if (key) map[key] = Boolean(row?.enabled);
  }
  for (const row of Array.isArray(tenantRows) ? tenantRows : []) {
    const key = normalizeText(row?.flag_key);
    if (key) map[key] = Boolean(row?.enabled);
  }
  return map;
}

function makeTemporaryPassword() {
  return `Lo#${randomUUID().replace(/-/g, '').slice(0, 18)}Aa1`;
}

async function createAuthUserAndTenantLink({
  email,
  password,
  fullName,
  tenantId,
  roleSlug = 'owner',
}) {
  const { data: authCreateData, error: authCreateError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { tenant_id: tenantId, role: roleSlug },
  });
  if (authCreateError || !authCreateData?.user?.id) {
    throw authCreateError || new Error('Falha ao criar usuário no Supabase Auth.');
  }
  const authUserId = authCreateData.user.id;
  console.log('[ProvisionUser] auth user criado', { authUserId, email, tenantId });

  const tenantUserPayload = {
    tenant_id: tenantId,
    email,
    full_name: fullName,
    user_id: authUserId,
    role: roleSlug,
    role_slug: roleSlug,
    is_active: true,
    status: 'active',
  };

  const { data: existingTenantUser, error: existingTenantUserError } = await supabase
    .from('tenant_users')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .maybeSingle();
  if (existingTenantUserError) {
    await supabase.auth.admin.deleteUser(authUserId).catch(() => {});
    throw existingTenantUserError;
  }

  let tenantUserQuery;
  if (existingTenantUser?.id) {
    tenantUserQuery = supabase
      .from('tenant_users')
      .update(tenantUserPayload)
      .eq('id', existingTenantUser.id);
  } else {
    tenantUserQuery = supabase
      .from('tenant_users')
      .insert(tenantUserPayload);
  }

  const { data: tenantUser, error: tenantUserError } = await tenantUserQuery
    .select('id, tenant_id, user_id, email, full_name, role, role_slug, is_active, status')
    .single();
  if (tenantUserError) {
    await supabase.auth.admin.deleteUser(authUserId).catch(() => {});
    throw tenantUserError;
  }
  if (!tenantUser?.user_id) {
    await supabase.auth.admin.deleteUser(authUserId).catch(() => {});
    throw new Error('Falha crítica: tenant_users persistido sem user_id.');
  }
  console.log('[ProvisionUser] tenant_users atualizado com user_id', {
    tenantUserId: tenantUser.id,
    userId: tenantUser.user_id,
    tenantId,
  });

  return {
    authUserId,
    tenantUser,
  };
}

async function insertAuditLog({ actor, action, targetType, targetId, tenantId = null, metadata = {} }) {
  const payload = {
    actor_admin_id: actor?.id || null,
    actor_role: actor?.role || null,
    action,
    target_type: targetType,
    target_id: String(targetId || ''),
    tenant_id: tenantId,
    metadata: {
      ...(metadata && typeof metadata === 'object' ? metadata : { note: String(metadata || '') }),
      actor_email: actor?.email || null,
    },
  };
  const { error } = await supabase.from('audit_logs').insert(payload);
  if (error) throw error;
}

async function getConsoleActorFromBearerToken(accessToken) {
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user?.id) {
    throw new Error(
      explainJwtVerifyFailure(userError, accessToken)
      || 'Token da Console inválido. Verifique se a Console usa o mesmo projeto Supabase configurado no backend.',
    );
  }
  const authUser = userData.user;
  const { data: actorRow, error: actorError } = await supabase
    .from('platform_admin_users')
    .select('id, email, full_name, role_slug, is_active')
    .eq('id', authUser.id)
    .eq('is_active', true)
    .maybeSingle();
  if (actorError) throw actorError;
  if (!actorRow?.id) {
    throw new Error(
      'Usuário autenticado não possui perfil ativo em platform_admin_users. '
      + 'Crie ou corrija esse vínculo no mesmo projeto Supabase da Console.',
    );
  }
  return {
    id: actorRow.id,
    email: actorRow.email || authUser.email || '',
    name: actorRow.full_name || actorRow.email || authUser.email || 'Operador',
    role: actorRow.role_slug || 'leitura',
  };
}

async function requireConsoleAccess(req, res, next) {
  try {
    const platformKey = normalizeText(req.headers['x-platform-key']);
    if (PLATFORM_API_KEY && platformKey && platformKey === PLATFORM_API_KEY) {
      req.platformActor = { id: null, email: '', name: 'system', role: 'system' };
      return next();
    }
    const authHeader = normalizeText(req.headers.authorization);
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const accessToken = match?.[1] || '';
    if (!accessToken) {
      return res.status(401).json({ error: 'Sessão da Console ausente.' });
    }
    req.platformActor = await getConsoleActorFromBearerToken(accessToken);
    next();
  } catch (err) {
    res.status(401).json({ error: err?.message || 'Falha ao validar sessão da Console.' });
  }
}

async function requireAppUser(req, res, next) {
  try {
    const authHeader = normalizeText(req.headers.authorization);
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const accessToken = match?.[1] || '';
    if (!accessToken) {
      return res.status(401).json({ error: 'Token do app ausente.' });
    }
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user?.id) {
      return res.status(401).json({
        error:
          explainJwtVerifyFailure(error, accessToken)
          || normalizeDatabaseError(error, '')
          || 'Token do app inválido. O login SaaS (app 5176) e server/.env (SUPABASE_URL) devem ser o mesmo projeto Supabase.',
      });
    }
    req.appAuthUser = data.user;
    next();
  } catch (err) {
    res.status(401).json({ error: err?.message || 'Falha ao validar sessão do app.' });
  }
}

/**
 * Perfil do operador da Console: leitura com service role (sem RLS no cliente).
 * Evita 54001 / recursão de policies em platform_admin_users via PostgREST.
 */
app.get('/internal/platform/console-profile', async (req, res) => {
  try {
    const authHeader = normalizeText(req.headers.authorization);
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const accessToken = match?.[1] || '';
    if (!accessToken) {
      return res.status(401).json({ error: 'Token ausente.' });
    }
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData?.user?.id) {
      return res.status(401).json({
        error:
          explainJwtVerifyFailure(userError, accessToken)
          || 'Token inválido. Console e backend devem usar o mesmo projeto Supabase.',
      });
    }
    const uid = userData.user.id;
    const { data: row, error: rowError } = await supabase
      .from('platform_admin_users')
      .select('id, email, full_name, role_slug, is_active')
      .eq('id', uid)
      .eq('is_active', true)
      .maybeSingle();
    if (rowError) {
      console.error('[console-profile]', rowError);
      return res.status(400).json({
        error: normalizeDatabaseError(rowError, 'Falha ao ler platform_admin_users.'),
      });
    }
    if (!row?.id) {
      return res.status(404).json({
        error:
          'Sem perfil ativo em platform_admin_users. Crie a linha com id = UUID do usuário em Authentication.',
      });
    }
    return res.json({
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      role_slug: row.role_slug,
      is_active: row.is_active,
    });
  } catch (err) {
    console.error('[console-profile]', err);
    return res.status(400).json({
      error: normalizeDatabaseError(err, 'Erro ao carregar perfil da Console.'),
    });
  }
});

app.get('/internal/app/tenant-context', requireAppUser, async (req, res) => {
  try {
    const authUserId = req.appAuthUser.id;
    const { data: tenantUser, error: tenantUserError } = await supabase
      .from('tenant_users')
      .select('tenant_id, role, role_slug, is_active, status')
      .eq('user_id', authUserId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (tenantUserError) throw tenantUserError;
    if (!tenantUser?.tenant_id) {
      return res.status(404).json({
        error:
          'Usuário sem vínculo ativo em tenant_users. '
          + 'Faça o provisionamento da clínica pela Console antes de acessar o app.',
      });
    }

    const tenantId = tenantUser.tenant_id;
    const [
      tenantResult,
      modulesResult,
      globalFlagsResult,
      tenantFlagsResult,
      subscriptionResult,
      limitsResult,
    ] = await Promise.all([
      supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle(),
      supabase.from('tenant_modules').select('module_key, enabled').eq('tenant_id', tenantId),
      supabase.from('feature_flags').select('flag_key, enabled').eq('scope_type', 'global'),
      supabase.from('feature_flags').select('flag_key, enabled').eq('scope_type', 'tenant').eq('scope_ref', tenantId),
      supabase.from('tenant_subscriptions').select('*').eq('tenant_id', tenantId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('tenant_limits').select('limits_json').eq('tenant_id', tenantId).maybeSingle(),
    ]);

    if (tenantResult.error) throw tenantResult.error;
    if (modulesResult.error) throw modulesResult.error;
    if (globalFlagsResult.error) throw globalFlagsResult.error;
    if (tenantFlagsResult.error) throw tenantFlagsResult.error;
    if (subscriptionResult.error) throw subscriptionResult.error;
    if (limitsResult.error && !isOptionalTenantLimitsError(limitsResult.error)) {
      throw limitsResult.error;
    }

    const tenant = tenantResult.data || null;
    if (!tenant) {
      return res.status(404).json({
        error:
          'Clínica não encontrada em `tenants` para o vínculo em tenant_users. '
          + 'O provisionamento pode estar incompleto — refaça ou corrija na Platform Console (5177).',
      });
    }
    const subscription = subscriptionResult.data || null;
    const warnings = [];
    const tenantStatus = normalizeStatus(tenant?.status);
    const billingStatus = normalizeStatus(tenant?.billing_status || subscription?.status);
    if (['blocked', 'suspended', 'cancelled', 'canceled'].includes(tenantStatus)) {
      warnings.push(`Status da clínica: ${tenantStatus}`);
    }
    if (['overdue', 'past_due'].includes(billingStatus)) {
      warnings.push('Existem pendências de cobrança');
    }

    res.json({
      tenant,
      modules: buildModuleMap(modulesResult.data || []),
      flags: buildFeatureFlags(globalFlagsResult.data || [], tenantFlagsResult.data || []),
      limits: limitsResult.data?.limits_json || {},
      subscription,
      warnings,
      access: {
        tenantId,
        role: tenantUser.role || tenantUser.role_slug || 'atendimento',
        isActive: tenantUser.is_active ?? tenantUser.status === 'active',
      },
    });
  } catch (err) {
    console.error('[tenant-context]', err);
    const raw = normalizeDatabaseError(err, 'Falha ao carregar contexto da clínica.');
    const lower = String(raw || '').toLowerCase();
    const hint =
      lower.includes('relation') && lower.includes('does not exist')
        ? ' Rode as migrations do schema SaaS no Supabase (mesmo projeto que app e backend).'
        : '';
    res.status(400).json({
      error: `${raw}${hint}`,
    });
  }
});

app.post('/internal/platform/provision-user', requireConsoleAccess, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = normalizeText(req.body?.password);
    const fullName = normalizeText(req.body?.full_name);
    const tenantId = normalizeText(req.body?.tenant_id);

    if (!email) return res.status(400).json({ error: 'email é obrigatório.' });
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'password deve ter pelo menos 8 caracteres.' });
    }
    if (!fullName) return res.status(400).json({ error: 'full_name é obrigatório.' });
    if (!tenantId) return res.status(400).json({ error: 'tenant_id é obrigatório.' });

    const { authUserId, tenantUser } = await createAuthUserAndTenantLink({
      email,
      password,
      fullName,
      tenantId,
      roleSlug: 'owner',
    });

    return res.status(201).json({
      success: true,
      email,
      password,
      user: {
        id: authUserId,
        email,
        full_name: fullName,
      },
      tenantUser,
    });
  } catch (err) {
    console.error('[ProvisionUser] erro detalhado', {
      message: normalizeDatabaseError(err, String(err || '')),
      email: normalizeEmail(req.body?.email),
      tenantId: normalizeText(req.body?.tenant_id),
    });
    res.status(400).json({
      error: normalizeDatabaseError(err, 'Falha ao provisionar usuário da clínica.'),
    });
  }
});

app.post('/internal/platform/tenants/provision', requireConsoleAccess, async (req, res) => {
  let createdTenantId = null;
  let createdAuthUserId = null;
  let createdAuthUser = false;

  try {
    const actor = req.platformActor;
    const tradeName = normalizeText(req.body?.tradeName);
    const legalName = normalizeText(req.body?.legalName || tradeName);
    const responsibleName = normalizeText(req.body?.responsibleName);
    const responsibleEmail = normalizeEmail(req.body?.responsibleEmail);
    const responsiblePassword = normalizeText(req.body?.responsiblePassword);
    const city = normalizeText(req.body?.city);
    const status = normalizeStatus(req.body?.status || 'active') || 'active';
    const planCode = normalizePlanCode(req.body?.plan);

    if (!tradeName) return res.status(400).json({ error: 'tradeName é obrigatório.' });
    if (!responsibleName) return res.status(400).json({ error: 'responsibleName é obrigatório.' });
    if (!responsibleEmail) return res.status(400).json({ error: 'responsibleEmail é obrigatório.' });
    if (!planCode) return res.status(400).json({ error: 'plan inválido. Use Start, Growth ou Scale.' });
    if (responsiblePassword && responsiblePassword.length < 8) {
      return res.status(400).json({ error: 'responsiblePassword deve ter pelo menos 8 caracteres.' });
    }

    const { data: existingTenantUserByEmail, error: existingTenantUserError } = await supabase
      .from('tenant_users')
      .select('id, tenant_id, user_id')
      .eq('email', responsibleEmail)
      .maybeSingle();
    if (existingTenantUserError) throw existingTenantUserError;
    if (existingTenantUserByEmail?.tenant_id) {
      return res.status(409).json({ error: 'Este e-mail já está vinculado a outra clínica em tenant_users.' });
    }

    const generatedPassword = responsiblePassword || makeTemporaryPassword();
    const passwordWasGenerated = !responsiblePassword;

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        legal_name: legalName,
        trade_name: tradeName,
        status,
        billing_status: 'ok',
        plan_code: planCode,
        owner_name: responsibleName,
        owner_email: responsibleEmail,
        city: city || null,
        created_by: actor?.id || null,
        updated_by: actor?.id || null,
      })
      .select('id, legal_name, trade_name, owner_name, owner_email, city, status, billing_status, plan_code, created_at, updated_at')
      .single();
    if (tenantError || !tenant?.id) throw tenantError || new Error('Falha ao criar tenant.');
    createdTenantId = tenant.id;
    console.log('[Provision] tenant criado', { tenantId: createdTenantId, planCode, responsibleEmail });

    const { authUserId, tenantUser } = await createAuthUserAndTenantLink({
      email: responsibleEmail,
      password: generatedPassword,
      fullName: responsibleName,
      tenantId: createdTenantId,
      roleSlug: 'owner',
    });
    createdAuthUserId = authUserId;
    createdAuthUser = true;

    const { data: subscription, error: subscriptionError } = await supabase
      .from('tenant_subscriptions')
      .insert({
        tenant_id: createdTenantId,
        plan_code: planCode,
        status: status === 'active' ? 'active' : 'paused',
        amount_cents: PLAN_CONFIG[planCode].priceCents,
        cycle: 'monthly',
        next_billing_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        updated_by: actor?.id || null,
      })
      .select('id, tenant_id, plan_code, status, amount_cents, cycle, next_billing_at, created_at, updated_at')
      .single();
    if (subscriptionError) throw subscriptionError;
    console.log('[Provision] assinatura criada', { subscriptionId: subscription.id, tenantId: createdTenantId });

    const moduleRows = PLAN_CONFIG[planCode].modules.map((moduleKey) => ({
      tenant_id: createdTenantId,
      module_key: moduleKey,
      enabled: true,
      updated_by: actor?.id || null,
    }));
    const { data: tenantModules, error: tenantModulesError } = await supabase
      .from('tenant_modules')
      .insert(moduleRows)
      .select('id, tenant_id, module_key, enabled, created_at, updated_at');
    if (tenantModulesError) throw tenantModulesError;
    console.log('[Provision] módulos criados', { tenantId: createdTenantId, modules: PLAN_CONFIG[planCode].modules });

    const { error: tenantLimitsError } = await supabase.from('tenant_limits').upsert({
      tenant_id: createdTenantId,
      limits_json: PLAN_CONFIG[planCode].limits,
      updated_by: actor?.id || null,
    }, { onConflict: 'tenant_id' });
    if (tenantLimitsError) throw tenantLimitsError;

    await insertAuditLog({
      actor,
      action: 'tenant.provision.completed',
      targetType: 'tenant',
      targetId: createdTenantId,
      tenantId: createdTenantId,
      metadata: {
        responsible_email: responsibleEmail,
        responsible_user_id: createdAuthUserId,
        plan: planCode,
        modules: PLAN_CONFIG[planCode].modules,
      },
    });
    console.log('[Provision] audit log criado', { tenantId: createdTenantId });

    return res.status(201).json({
      tenant,
      tenantUser,
      responsibleUser: {
        id: createdAuthUserId,
        email: responsibleEmail,
        full_name: responsibleName,
      },
      subscription,
      tenantModules: tenantModules || [],
      ...(passwordWasGenerated ? { temporaryPassword: generatedPassword } : {}),
    });
  } catch (err) {
    console.error('[Provision] erro detalhado', {
      message: normalizeDatabaseError(err, String(err || '')),
      tenantId: createdTenantId,
      authUserId: createdAuthUserId,
    });
    if (createdAuthUser && createdAuthUserId) {
      const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(createdAuthUserId);
      if (deleteAuthError) {
        console.error('[Provision] rollback auth user falhou', deleteAuthError.message);
      }
    }
    if (createdTenantId) {
      const { error: deleteTenantError } = await supabase.from('tenants').delete().eq('id', createdTenantId);
      if (deleteTenantError) {
        console.error('[Provision] rollback tenant falhou', deleteTenantError.message);
      }
    }
    res.status(400).json({
      error: normalizeDatabaseError(err, 'Falha ao provisionar clínica.'),
    });
  }
});

const httpServer = app.listen(PORT, () => {
  console.log(`[SaaS Admin API] rodando na porta ${PORT}`);
});
httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[SaaS Admin API] Porta ${PORT} já em uso. Encerre o processo nessa porta ou defina ADMIN_API_PORT com outro valor.`,
    );
  } else {
    console.error('[SaaS Admin API] Erro ao escutar:', err?.message || err);
  }
  process.exit(1);
});
