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
import { getInviteRedirectTo as resolveInviteRedirectTo, getEmailConfig } from './email/emailConfig.js';
import { dispatchCollaboratorInvite } from './collaboratorInviteDispatch.js';
import { generatePasswordSetupLink, sendUserInviteEmail } from './email/sendUserInviteEmail.js';
import { sendPasswordResetEmail } from './email/sendPasswordResetEmail.js';
import { getPasswordResetRedirectTo } from './email/emailConfig.js';
import { logAccessEmailAudit } from './email/accessEmailAudit.js';
import { createIdentityService } from './identity/IdentityService.js';
import { isMissingIdentitiesTableError } from './identity/identityRepository.js';
import identityRoutes from './identity/routes.js';
import { hasSupabaseAuthPublicClient } from './email/supabasePublicClient.js';
import {
  LIABILITY_TERMS_VERSION,
  normalizeOnboardingPayload,
  validateOnboardingPayload,
} from './platformValidators.js';
import { sendClinicOnboardingEmail } from './email/sendClinicOnboardingEmail.js';
import { emailAudit } from './email/emailAuditLog.js';
import { provisionClinicOwnerAccess, resendClinicOwnerAccess } from './clinicOwnerAccessDispatch.js';
import {
  assertCanAssignEmailToCollaborator,
  resolveCollaboratorIdForTenantEmailAccess,
} from './collaboratorLinkPolicy.js';
import {
  acceptTermsByToken,
  buildTermsPreview,
  createAcceptanceToken,
  findLegalProfileByToken,
} from './onboardingTerms.js';
import { createPlatformBillingService } from './platformBillingService.js';
import {
  resolveClinicProfileForTenant,
  upsertClinicProfileForTenant,
} from './clinicProfileResolver.js';
import { formatBillingOverviewResponse } from './platformRevenueMetrics.js';
import {
  assertAuthUserIdForTenantWrite,
  IdentityProvisionError,
  isIdentityProvisionError,
} from './identity/identityProvisionErrors.js';
import { identityLog } from './identity/identityProvisionLog.js';
import {
  lookupAuthUserByEmail,
  requireAuthUserId,
} from './identity/identityAuthResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

/**
 * 1) `server/.env` — valores base.
 * 2) `console/.env` e `console/.env.local` — fallback dev (VITE_CONSOLE_SUPABASE_ANON_KEY etc.).
 * 3) `.env` e `.env.local` na **raiz do repositório** com `override: true` — um único sítio para
 *    `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` alinhados com a Console (5177) e o app (5176).
 * Variáveis de ambiente do sistema continuam a ser sobrescritas pelo último ficheiro carregado.
 */
dotenv.config({ path: path.join(__dirname, '.env') });
// Fallback dev: mesmas chaves VITE_CONSOLE_* que o Vite usa (console/.env) — raiz prevalece depois.
dotenv.config({ path: path.join(repoRoot, 'console', '.env'), override: false });
dotenv.config({ path: path.join(repoRoot, 'console', '.env.local'), override: false });
dotenv.config({ path: path.join(repoRoot, '.env'), override: true });
dotenv.config({ path: path.join(repoRoot, '.env.local'), override: true });
console.log(
  '[SaaS Admin API] env: server/.env → console/.env → raiz .env/.env.local (a raiz prevalece — veja .env.example na raiz).',
);

const app = express();
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Platform-Key'],
  }),
);
app.use(express.json({ limit: '1mb' }));

/** Health check leve (sem Supabase) — usado pelo script `npm run console:stack` para saber quando a API está escutando. */
app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'saas-admin-api',
    version: '2026-06-26-identity-unified',
    build: { identityModule: true },
    features: {
      identityService: true,
      supabaseAuthPublicClient: Boolean(process.env.SUPABASE_ANON_KEY),
    },
  });
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PLATFORM_API_KEY = process.env.PLATFORM_API_KEY || process.env.ADMIN_API_KEY || '';
const APP_INVITE_REDIRECT_TO = normalizeText(process.env.APP_INVITE_REDIRECT_TO);
const PORT = Number(process.env.PORT || process.env.ADMIN_API_PORT || 3001);

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
  if (lower.includes('column tenant_users.has_system_access does not exist')) {
    return (
      'A coluna tenant_users.has_system_access não existe no banco atual. '
      + 'Aplique a migration `005_app_collaborator_access_invites.sql` no mesmo projeto Supabase do backend.'
    );
  }
  if (lower.includes('stack depth limit exceeded')) {
    return (
      'O banco retornou "stack depth limit exceeded". '
      + 'Isso normalmente indica que o backend NÃO está usando a service role key correta '
      + 'e entrou em recursão de RLS no Supabase. Verifique SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  if (
    lower.includes('collaborator_id')
    && lower.includes('tenant_users')
    && lower.includes('schema cache')
  ) {
    return (
      'Migration pendente: a coluna tenant_users.collaborator_id não existe no banco atual. '
      + 'Aplique a migration `005_app_collaborator_access_invites.sql` no mesmo projeto Supabase do backend.'
    );
  }
  if (lower.includes('tenant_users_user_id_required')) {
    return (
      'Não foi possível vincular o e-mail: a conta no Auth ainda não existe. '
      + 'Se você apagou o usuário manualmente no Supabase, tente convidar novamente — o sistema criará a conta antes do vínculo.'
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
console.log('[SaaS Admin API] SUPABASE_ANON_KEY loaded', hasSupabaseAuthPublicClient());
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

/** Preenchido antes de app.listen — rotas de acesso usam IdentityService. */
let identityService;

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
    label: 'Essencial',
    priceCents: 8990,
    modules: ['Agenda', 'Pacientes'],
    limits: { agendas: 5, patients: 800, users: 8, storage_gb: 5 },
  },
  Growth: {
    label: 'Profissional',
    priceCents: 14990,
    modules: ['Agenda', 'Pacientes', 'Financeiro', 'CRM'],
    limits: { agendas: 9, patients: 2500, users: 20, storage_gb: 15 },
  },
  Scale: {
    label: 'Completo',
    priceCents: 23990,
    modules: ['Agenda', 'Pacientes', 'Financeiro', 'CRM', 'Marketing', 'IA', 'Estoque'],
    limits: { agendas: 15, patients: 8000, users: 40, storage_gb: 40 },
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

function normalizeRoleValue(value, fallback = 'atendimento') {
  const role = String(value || '').trim().toLowerCase();
  if (!role) return fallback;
  return role;
}

function normalizeInvitationStatus(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'none';
  if (['pending', 'sent', 'accepted', 'expired', 'revoked', 'none'].includes(raw)) return raw;
  return 'none';
}

function maskEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  const at = email.indexOf('@');
  if (at <= 1) return email ? '***' : '';
  return `${email.slice(0, 2)}***${email.slice(at)}`;
}

function isTenantAdminRole(role) {
  return ['owner', 'admin', 'master'].includes(normalizeRoleValue(role, ''));
}

function isMissingHasSystemAccessColumnError(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return code === '42703' && message.includes('has_system_access');
}

function isMissingInvitationStatusColumnError(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return code === '42703' && message.includes('invitation_status');
}

function isMissingCollaboratorIdColumnError(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return (
    (code === '42703' && message.includes('collaborator_id'))
    || (
      message.includes('collaborator_id')
      && message.includes('tenant_users')
      && message.includes('schema cache')
    )
  );
}

function isTenantUserDuplicateError(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '23505'
    || message.includes('duplicate key')
    || message.includes('unique constraint')
  );
}

function omitHasSystemAccess(payload = {}) {
  const cloned = { ...(payload || {}) };
  delete cloned.has_system_access;
  return cloned;
}

function omitInvitationStatus(payload = {}) {
  const cloned = { ...(payload || {}) };
  delete cloned.invitation_status;
  return cloned;
}

function omitCollaboratorId(payload = {}) {
  const cloned = { ...(payload || {}) };
  delete cloned.collaborator_id;
  return cloned;
}

const TENANT_USER_SELECT_BASE = 'id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug, is_active, status';
const TENANT_USER_SELECT_BASE_LEGACY = 'id, tenant_id, user_id, full_name, email, role, role_slug, is_active, status';
const TENANT_USER_SELECT_WITH_ACCESS = `${TENANT_USER_SELECT_BASE}, has_system_access`;

function isActiveTenantUserRow(row) {
  const status = String(row?.status || '').toLowerCase();
  if (status === 'inactive') return false;
  if (row?.is_active === false) return false;
  if (row?.has_system_access === false) return false;
  return Boolean(row?.tenant_id);
}

/**
 * Vincula auth user a tenant_users existente pelo e-mail quando user_id ainda está vazio
 * (ex.: provisionamento falhou após convite aceito).
 */
async function linkAuthUserToTenantMembership(authUserId, explicitTenantId = '', emailHint = '') {
  const normalizedAuthUserId = normalizeText(authUserId);
  if (!normalizedAuthUserId) return null;

  let email = normalizeEmail(emailHint);
  if (!email) {
    const { data: authData } = await supabase.auth.admin.getUserById(normalizedAuthUserId);
    email = normalizeEmail(authData?.user?.email);
  }
  if (!email) return null;

  const normalizedExplicit = normalizeText(explicitTenantId);
  let query = supabase
    .from('tenant_users')
    .select('id, tenant_id, collaborator_id, user_id, email, full_name, role, role_slug, is_active, status, has_system_access')
    .eq('email', email);
  if (normalizedExplicit) query = query.eq('tenant_id', normalizedExplicit);

  let { data: rows, error } = await query;
  if (error && isMissingHasSystemAccessColumnError(error)) {
    ({ data: rows, error } = await supabase
      .from('tenant_users')
      .select('id, tenant_id, collaborator_id, user_id, email, full_name, role, role_slug, is_active, status')
      .eq('email', email));
    if (normalizedExplicit) {
      rows = (rows || []).filter((row) => row?.tenant_id === normalizedExplicit);
    }
  }
  if (error) throw error;

  const candidates = (Array.isArray(rows) ? rows : []).filter(isActiveTenantUserRow);
  for (const row of candidates) {
    const linkedUserId = normalizeText(row?.user_id);
    if (linkedUserId && linkedUserId !== normalizedAuthUserId) continue;

    if (!linkedUserId) {
      const updatePayload = { user_id: normalizedAuthUserId, invitation_status: 'accepted' };
      let { error: updErr } = await supabase
        .from('tenant_users')
        .update(updatePayload)
        .eq('id', row.id);
      if (updErr && isMissingInvitationStatusColumnError(updErr)) {
        ({ error: updErr } = await supabase
          .from('tenant_users')
          .update({ user_id: normalizedAuthUserId })
          .eq('id', row.id));
      }
      if (updErr) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[linkAuthUserToTenantMembership] update skipped', updErr.message);
        }
        continue;
      }
    }

    return { ...row, user_id: normalizedAuthUserId };
  }

  return null;
}

async function resolveActiveTenantUser(authUserId, explicitTenantId = '', emailHint = '') {
  const normalizedExplicit = normalizeText(explicitTenantId);
  const baseFilters = (query) => {
    let q = query.eq('user_id', authUserId).order('created_at', { ascending: true });
    if (normalizedExplicit) q = q.eq('tenant_id', normalizedExplicit);
    return q;
  };

  let rows = null;
  let error = null;
  ({ data: rows, error } = await baseFilters(
    supabase.from('tenant_users').select('id, tenant_id, collaborator_id, user_id, email, full_name, role, role_slug, is_active, status, has_system_access'),
  ));
  if (error && isMissingHasSystemAccessColumnError(error)) {
    ({ data: rows, error } = await baseFilters(
      supabase.from('tenant_users').select('id, tenant_id, collaborator_id, user_id, email, full_name, role, role_slug, is_active, status'),
    ));
  }
  if (error) throw error;

  const activeRows = (Array.isArray(rows) ? rows : []).filter(isActiveTenantUserRow);

  if (activeRows.length === 0) {
    const linked = await linkAuthUserToTenantMembership(authUserId, explicitTenantId, emailHint);
    if (linked) return linked;
    return null;
  }

  if (!normalizedExplicit && activeRows.length > 1) {
    const err = new Error(
      'Usuário vinculado a múltiplas clínicas. Informe tenant_id explicitamente.',
    );
    err.code = 'TENANT_AMBIGUOUS';
    throw err;
  }

  return activeRows[0];
}

async function getTenantUserByAuthUserId(authUserId, explicitTenantId = '') {
  return resolveActiveTenantUser(authUserId, explicitTenantId);
}

async function getTenantAdminActorOrThrow(authUserId, explicitTenantId = '') {
  const actorTenantUser = await resolveActiveTenantUser(authUserId, explicitTenantId);
  if (!actorTenantUser?.tenant_id) {
    throw new Error('Usuário sem vínculo em tenant_users.');
  }
  if (explicitTenantId && explicitTenantId !== actorTenantUser.tenant_id) {
    throw new Error('tenant_id inválido para o usuário autenticado.');
  }
  const actorRole = normalizeRoleValue(actorTenantUser.role || actorTenantUser.role_slug);
  if (!isTenantAdminRole(actorRole)) {
    throw new Error('Apenas administradores da clínica podem executar esta operação.');
  }
  return actorTenantUser;
}

function getInviteRedirectTo() {
  if (APP_INVITE_REDIRECT_TO) return APP_INVITE_REDIRECT_TO;
  return resolveInviteRedirectTo();
}

function isInviteEmailDelivered(delivery) {
  return ['supabase_auth', 'backend_resend'].includes(delivery?.emailDelivery);
}

async function sendCollaboratorInvite({
  email,
  tenantId,
  role,
  collaboratorId,
  collaboratorName,
  userName,
  profileRole,
  mode = 'resend',
}) {
  return dispatchCollaboratorInvite(supabase, {
    email,
    tenantId,
    role,
    collaboratorId,
    collaboratorName,
    userName,
    profileRole: profileRole || role,
  }, { mode });
}

async function upsertInvitationRecord({
  tenantId,
  tenantUserId,
  collaboratorId,
  email,
  profileRole,
  createdBy,
  status = 'pending',
  expiresAt,
}) {
  const normalizedStatus = normalizeInvitationStatus(status);
  const { data: existing, error: existingError } = await supabase
    .from('invitations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .in('status', ['pending', 'sent'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  const payload = {
    tenant_id: tenantId,
    tenant_user_id: tenantUserId || null,
    collaborator_id: collaboratorId || null,
    email,
    profile_role: profileRole,
    status: normalizedStatus,
    expires_at: expiresAt,
    sent_at: normalizedStatus === 'sent' ? new Date().toISOString() : null,
    created_by: createdBy || null,
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from('invitations')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('invitations')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
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
  roleSlug = 'master',
  cpf = '',
  phone = '',
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
  const authUserId = assertAuthUserIdForTenantWrite(authCreateData.user.id, { email, tenantId });
  identityLog('user_id encontrado', { userId: authUserId, source: 'createUser' });

  const tenantUserPayload = {
    tenant_id: tenantId,
    email,
    full_name: fullName,
    user_id: authUserId,
    role: roleSlug,
    role_slug: roleSlug,
    is_active: true,
    status: 'active',
    ...(cpf ? { cpf } : {}),
    ...(phone ? { phone } : {}),
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

async function findAuthUserByEmail(email) {
  const target = normalizeEmail(email);
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = Array.isArray(data?.users) ? data.users : [];
    const match = users.find((u) => normalizeEmail(u?.email) === target);
    if (match) return match;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

async function getValidAuthUserId(userId) {
  const id = normalizeText(userId);
  if (!id) return null;
  const { data, error } = await supabase.auth.admin.getUserById(id);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

async function getValidAuthUserIdWithRetry(userId, { attempts = 4, delayMs = 350 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const valid = await getValidAuthUserId(userId);
    if (valid) return valid;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}


function logCollabInviteProdAudit(audit = {}) {
  console.log('[COLLAB_INVITE_PROD_AUDIT]', {
    environment: process.env.NODE_ENV || 'development',
    apiBaseUrl: SUPABASE_URL ? String(SUPABASE_URL).replace(/\/+$/, '') : '',
    ...audit,
  });
}

function logCollaboratorAccessAudit(audit = {}) {
  console.log('[COLLAB_ACCESS_AUDIT]', {
    environment: process.env.NODE_ENV || 'development',
    at: new Date().toISOString(),
    ...audit,
  });
}

function resolveClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || null;
}

async function getAuthUserMeta(userId) {
  const id = normalizeText(userId);
  if (!id) return null;
  const { data, error } = await supabase.auth.admin.getUserById(id);
  if (error || !data?.user) return null;
  return {
    last_sign_in_at: data.user.last_sign_in_at || null,
    created_at: data.user.created_at || null,
    user_metadata: data.user.user_metadata || {},
    app_metadata: data.user.app_metadata || {},
  };
}

function extractPermissionFieldsFromAppMetadata(appMetadata) {
  const meta = appMetadata && typeof appMetadata === 'object' ? appMetadata : {};
  const permissionOverrides = meta.permission_overrides
    && typeof meta.permission_overrides === 'object'
    && !Array.isArray(meta.permission_overrides)
    ? meta.permission_overrides
    : {};
  const hasCustomPermissions = meta.has_custom_permissions === true;
  const customPermissions = hasCustomPermissions
    && meta.custom_permissions
    && typeof meta.custom_permissions === 'object'
    && !Array.isArray(meta.custom_permissions)
    ? meta.custom_permissions
    : null;
  return {
    has_custom_permissions: hasCustomPermissions,
    custom_permissions: customPermissions,
    permission_overrides: permissionOverrides,
  };
}

async function enrichTeamRosterWithPermissionFields(rosterRows = []) {
  return Promise.all((rosterRows || []).map(async (row) => {
    const userId = normalizeText(row?.user_id);
    if (!userId) return { ...row, has_custom_permissions: false, custom_permissions: null, permission_overrides: {} };
    const authMeta = await getAuthUserMeta(userId);
    const permissionFields = extractPermissionFieldsFromAppMetadata(authMeta?.app_metadata);
    return { ...row, ...permissionFields };
  }));
}

async function appendAccessAuditToAuthUser(authUserId, auditEntry) {
  const meta = await getAuthUserMeta(authUserId);
  if (!meta) return null;
  const existing = Array.isArray(meta.app_metadata?.access_audit_log)
    ? meta.app_metadata.access_audit_log
    : [];
  const nextLog = [{ ...auditEntry, at: auditEntry.at || new Date().toISOString() }, ...existing].slice(0, 20);
  const { error } = await supabase.auth.admin.updateUserById(authUserId, {
    app_metadata: {
      ...meta.app_metadata,
      access_audit_log: nextLog,
      last_password_reset_requested_at: auditEntry.action === 'password_reset_requested'
        ? auditEntry.at || new Date().toISOString()
        : meta.app_metadata?.last_password_reset_requested_at || null,
    },
  });
  if (error) {
    console.error('[COLLAB_ACCESS_AUDIT] falha ao persistir audit em app_metadata', error.message);
  }
  return nextLog;
}

function formatProvisionErrorResponse(err, fallbackMessage = 'Não foi possível concluir a operação de acesso. Tente novamente.') {
  if (isIdentityProvisionError(err)) {
    return {
      ok: false,
      code: err.code,
      message: err.message,
      error: err.message,
      setup_link: err.details?.setupLink || err.setupLink || null,
    };
  }
  const raw = normalizeDatabaseError(err, fallbackMessage);
  const lower = String(raw || '').toLowerCase();
  const isStaleAuth = lower.includes('sem conta no auth')
    || lower.includes('tenant_users_user_id_required')
    || lower.includes('falha ao ler usuário no auth')
    || lower.includes('conta no auth ausente')
    || lower.includes('conta no auth não existe');
  const isUserExists = lower.includes('already registered')
    || lower.includes('already exists')
    || lower.includes('user already');
  const isInvalidLink = lower.includes('email link is invalid')
    || lower.includes('otp_expired')
    || lower.includes('link expirado');

  let message = raw || fallbackMessage;
  if (isStaleAuth) {
    message = 'Não foi possível enviar o convite. O sistema tentará corrigir o vínculo — tente reenviar em instantes.';
  } else if (isUserExists) {
    message = 'Este e-mail já possui cadastro. O sistema reenviará o acesso automaticamente.';
  } else if (isInvalidLink) {
    message = 'O link anterior expirou. Solicite um novo convite ou redefinição de senha.';
  } else if (lower.includes('provedor de e-mail não configurado')) {
    message = 'Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.';
  } else if (lower.includes('vínculo de acesso não encontrado') || lower.includes('usuário interno não encontrado')) {
    message = 'Salve o acesso na aba Acesso ao sistema e tente enviar o convite novamente.';
  }

  return {
    ok: false,
    message,
    error: raw,
    setup_link: err?.setupLink || null,
    code: err?.code || null,
  };
}

async function resolveAuthUserIdForTenantLink({
  normalizedEmail,
  explicitAuthUserId = null,
  existingTenantUser = null,
}) {
  const explicitRaw = normalizeText(explicitAuthUserId);
  if (explicitRaw) {
    const validated = await getValidAuthUserIdWithRetry(explicitRaw);
    if (validated) return validated;
  }

  const byEmail = await findAuthUserByEmail(normalizedEmail);
  if (byEmail?.id) return byEmail.id;

  const existing = await getValidAuthUserId(existingTenantUser?.user_id);
  if (existing) return existing;

  return null;
}

async function clearStaleTenantUserAuthReference(tenantId, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!tenantId || !normalizedEmail) return false;

  const { data: existing, error } = await supabase
    .from('tenant_users')
    .select('id, user_id')
    .eq('tenant_id', tenantId)
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (error || !existing?.id || !existing.user_id) return false;

  const valid = await getValidAuthUserId(existing.user_id);
  if (valid) return false;

  identityLog('user_id órfão detectado — será reparado no próximo upsert', {
    tenantUserId: existing.id,
    orphanedUserId: existing.user_id,
  });
  // PROIBIDO gravar user_id NULL — o upsert subsequente corrige com authUserId válido.
  return true;
}

function isAuthUserAlreadyRegisteredError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return (
    message.includes('already registered')
    || message.includes('already exists')
    || message.includes('user already')
    || message.includes('email address has already been registered')
    || code.includes('email_exists')
    || error?.status === 422
  );
}

async function createAuthUserForCollaboratorInvite({
  normalizedEmail,
  tenantId,
  role,
  collaboratorId,
  collaboratorFullName,
}) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
    user_metadata: { full_name: collaboratorFullName || normalizedEmail },
    app_metadata: {
      tenant_id: tenantId,
      role,
      collaborator_id: collaboratorId || null,
    },
  });
  if (error) {
    if (isAuthUserAlreadyRegisteredError(error)) {
      return findAuthUserByEmail(normalizedEmail);
    }
    throw error;
  }
  return data?.user || null;
}

async function upsertTenantUserAccess({
  tenantId,
  collaboratorId,
  fullName,
  email,
  role,
  hasSystemAccess = true,
  invitationStatus = 'none',
  authUserId: explicitAuthUserId = null,
}) {
  const roleSlug = normalizeRoleValue(role);
  const normalizedInvitationStatus = normalizeInvitationStatus(invitationStatus);
  const normalizedEmail = normalizeEmail(email);

  const { data: existingTenantUser, error: existingTenantUserError } = await supabase
    .from('tenant_users')
    .select('id, user_id')
    .eq('tenant_id', tenantId)
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (existingTenantUserError) throw existingTenantUserError;

  const resolvedFromLink = await resolveAuthUserIdForTenantLink({
    normalizedEmail,
    explicitAuthUserId,
    existingTenantUser,
  });
  const authUserId = assertAuthUserIdForTenantWrite(resolvedFromLink, {
    tenantId,
    email: normalizedEmail,
    collaboratorId,
    existingTenantUserId: existingTenantUser?.id || null,
  });

  const payload = {
    tenant_id: tenantId,
    collaborator_id: normalizeText(collaboratorId) || null,
    full_name: normalizeText(fullName),
    email: normalizedEmail,
    user_id: authUserId,
    role: roleSlug,
    role_slug: roleSlug,
    has_system_access: Boolean(hasSystemAccess),
    is_active: Boolean(hasSystemAccess),
    status: hasSystemAccess ? 'active' : 'inactive',
    invitation_status: normalizedInvitationStatus,
  };

  const executeUpsert = async (nextPayload, includeAccessOnSelect, includeCollaboratorOnSelect = true) => {
    assertAuthUserIdForTenantWrite(nextPayload.user_id, { tenantId, email: normalizedEmail });
    let query;
    if (existingTenantUser?.id) {
      query = supabase.from('tenant_users').update(nextPayload).eq('id', existingTenantUser.id);
    } else {
      query = supabase.from('tenant_users').insert(nextPayload);
    }
    let { data, error } = await query
      .select(
        includeAccessOnSelect
          ? (includeCollaboratorOnSelect ? TENANT_USER_SELECT_WITH_ACCESS : `${TENANT_USER_SELECT_BASE_LEGACY}, has_system_access`)
          : (includeCollaboratorOnSelect ? TENANT_USER_SELECT_BASE : TENANT_USER_SELECT_BASE_LEGACY),
      )
      .single();

    if (error && !existingTenantUser?.id && isTenantUserDuplicateError(error)) {
      const { data: dupRow, error: dupErr } = await supabase
        .from('tenant_users')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('email', normalizedEmail)
        .maybeSingle();
      if (dupErr || !dupRow?.id) throw error;
      const retry = await supabase
        .from('tenant_users')
        .update(nextPayload)
        .eq('id', dupRow.id)
        .select(
          includeAccessOnSelect
            ? (includeCollaboratorOnSelect ? TENANT_USER_SELECT_WITH_ACCESS : `${TENANT_USER_SELECT_BASE_LEGACY}, has_system_access`)
            : (includeCollaboratorOnSelect ? TENANT_USER_SELECT_BASE : TENANT_USER_SELECT_BASE_LEGACY),
        )
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    assertAuthUserIdForTenantWrite(data?.user_id, {
      tenantId,
      email: normalizedEmail,
      tenantUserId: data?.id,
      phase: 'after_upsert',
    });
    identityLog('tenant_user atualizado', {
      tenantUserId: data.id,
      userId: data.user_id,
      operation: existingTenantUser?.id ? 'update' : 'insert',
    });
    return data;
  };

  try {
    return await executeUpsert(payload, true);
  } catch (error) {
    if (
      !isMissingHasSystemAccessColumnError(error)
      && !isMissingInvitationStatusColumnError(error)
      && !isMissingCollaboratorIdColumnError(error)
    ) throw error;
    return executeUpsert(
      omitCollaboratorId(omitInvitationStatus(omitHasSystemAccess(payload))),
      false,
      false,
    );
  }
}

async function assertEmailAvailableForTenantInvite(resolvedTenantId, normalizedEmail, { collaboratorId } = {}) {
  const { data: existing, error } = await supabase
    .from('tenant_users')
    .select('id, user_id, status, has_system_access, invitation_status, collaborator_id')
    .eq('tenant_id', resolvedTenantId)
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (error) throw error;
  if (!existing?.id) return;

  if (existing.user_id) {
    const authStillValid = await getValidAuthUserId(existing.user_id);
    if (!authStillValid) return;
  }

  const normalizedCollaboratorId = normalizeText(collaboratorId) || null;
  if (normalizedCollaboratorId) {
    if (!existing.collaborator_id || existing.collaborator_id === normalizedCollaboratorId) {
      return;
    }
    await assertCanAssignEmailToCollaborator(supabase, {
      tenantId: resolvedTenantId,
      tenantUserId: existing.id,
      collaboratorId: normalizedCollaboratorId,
      email: normalizedEmail,
    });
    return;
  }

  const invitationStatus = normalizeInvitationStatus(existing.invitation_status);
  const isRevoked = invitationStatus === 'revoked';
  const isInactive = String(existing.status || '').toLowerCase() === 'inactive'
    || existing.has_system_access === false;
  if (isRevoked || isInactive) return;

  const duplicateErr = new Error('Este e-mail já possui acesso nesta clínica.');
  duplicateErr.code = 'EMAIL_ALREADY_HAS_ACCESS';
  throw duplicateErr;
}

async function linkCollaboratorToTenantUser({
  actorAuthUserId,
  tenantId,
  collaboratorId,
  email,
  fullName,
}) {
  const actorTenantUser = await getTenantAdminActorOrThrow(actorAuthUserId, tenantId);
  const resolvedTenantId = actorTenantUser.tenant_id;
  const normalizedEmail = normalizeEmail(email);
  const normalizedCollaboratorId = normalizeText(collaboratorId);

  if (!normalizedEmail) throw new Error('E-mail é obrigatório para vincular colaborador.');
  if (!normalizedCollaboratorId) throw new Error('collaborator_id é obrigatório para vincular colaborador.');

  const { data: existing, error: existingError } = await supabase
    .from('tenant_users')
    .select('id, collaborator_id, email, full_name, tenant_id')
    .eq('tenant_id', resolvedTenantId)
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing?.id) {
    const notFoundErr = new Error('Nenhum usuário encontrado com este e-mail nesta clínica.');
    notFoundErr.code = 'TENANT_USER_NOT_FOUND';
    throw notFoundErr;
  }

  if (existing.collaborator_id && existing.collaborator_id !== normalizedCollaboratorId) {
    await assertCanAssignEmailToCollaborator(supabase, {
      tenantId: resolvedTenantId,
      tenantUserId: existing.id,
      collaboratorId: normalizedCollaboratorId,
      email: normalizedEmail,
    });
  }

  if (existing.collaborator_id === normalizedCollaboratorId) {
    return { tenantUser: existing, linked: false };
  }

  const updatePayload = { collaborator_id: normalizedCollaboratorId };
  const normalizedFullName = normalizeText(fullName);
  if (normalizedFullName) updatePayload.full_name = normalizedFullName;

  let tenantUser;
  try {
    const result = await supabase
      .from('tenant_users')
      .update(updatePayload)
      .eq('id', existing.id)
      .select(TENANT_USER_SELECT_WITH_ACCESS)
      .single();
    if (result.error) throw result.error;
    tenantUser = result.data;
  } catch (error) {
    if (!isMissingCollaboratorIdColumnError(error)) throw error;
    const fallbackResult = await supabase
      .from('tenant_users')
      .update(omitCollaboratorId(updatePayload))
      .eq('id', existing.id)
      .select(TENANT_USER_SELECT_BASE_LEGACY)
      .single();
    if (fallbackResult.error) throw fallbackResult.error;
    tenantUser = fallbackResult.data;
  }

  const invUpdate = await supabase
    .from('invitations')
    .update({ collaborator_id: normalizedCollaboratorId })
    .eq('tenant_id', resolvedTenantId)
    .eq('email', normalizedEmail)
    .is('collaborator_id', null);
  if (invUpdate.error && process.env.NODE_ENV !== 'production') {
    console.debug('[linkCollaboratorToTenantUser] falha ao atualizar invitations', invUpdate.error);
  }

  await supabase
    .from('identities')
    .update({ collaborator_id: normalizedCollaboratorId, updated_at: new Date().toISOString() })
    .eq('tenant_id', resolvedTenantId)
    .eq('email', normalizedEmail)
    .then(({ error: identityErr }) => {
      if (identityErr && process.env.NODE_ENV !== 'production') {
        console.debug('[linkCollaboratorToTenantUser] identities sync skipped', identityErr.message);
      }
    });

  return { tenantUser, linked: true };
}

/**
 * Resolve tenant_user por collaborator_id ou e-mail; re-vincula collaborator_id se órfão.
 */
async function resolveTenantUserForCollaboratorAccess({
  actorAuthUserId,
  tenantId,
  collaboratorId,
  email = '',
  fullName = '',
}) {
  const actorTenantUser = await getTenantAdminActorOrThrow(actorAuthUserId, tenantId);
  const resolvedTenantId = actorTenantUser.tenant_id;
  const normalizedCollaboratorId = normalizeText(collaboratorId);
  const normalizedEmail = normalizeEmail(email);

  if (normalizedCollaboratorId) {
    const { data: byCollaborator, error: byCollaboratorError } = await supabase
      .from('tenant_users')
      .select('id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug, is_active, status, has_system_access, invitation_status, created_at, updated_at')
      .eq('tenant_id', resolvedTenantId)
      .eq('collaborator_id', normalizedCollaboratorId)
      .maybeSingle();
    if (byCollaboratorError && !isMissingCollaboratorIdColumnError(byCollaboratorError)) {
      throw byCollaboratorError;
    }
    if (byCollaborator?.id) return byCollaborator;
  }

  if (!normalizedEmail) return null;

  const { data: byEmail, error: byEmailError } = await supabase
    .from('tenant_users')
    .select('id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug, is_active, status, has_system_access, invitation_status, created_at, updated_at')
    .eq('tenant_id', resolvedTenantId)
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (byEmailError) throw byEmailError;
  if (!byEmail?.id) return null;

  if (
    normalizedCollaboratorId
    && (!byEmail.collaborator_id || byEmail.collaborator_id === normalizedCollaboratorId)
  ) {
    if (byEmail.collaborator_id === normalizedCollaboratorId) return byEmail;
    const linked = await linkCollaboratorToTenantUser({
      actorAuthUserId,
      tenantId: resolvedTenantId,
      collaboratorId: normalizedCollaboratorId,
      email: normalizedEmail,
      fullName: fullName || byEmail.full_name,
    });
    return linked.tenantUser || byEmail;
  }

  return byEmail;
}

async function revokeAuthUserSessions(authUserId) {
  const id = normalizeText(authUserId);
  if (!id) return false;
  try {
    const { error } = await supabase.auth.admin.signOut(id, 'global');
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[COLLAB_ACCESS] falha ao revogar sessões', { authUserId: id, message: err?.message });
    return false;
  }
}

async function resolveAuthUserForInvite({
  normalizedEmail,
  sendInvite,
  tenantId,
  role,
  collaboratorId,
  collaboratorFullName,
  requestedAction = 'provision',
}) {
  let authUser = await lookupAuthUserByEmail(supabase, normalizedEmail);
  const authUserExisted = Boolean(authUser?.id);
  let inviteDelivery = null;
  const inviteMode = requestedAction === 'resend' || authUserExisted ? 'resend' : 'invite';

  if (sendInvite) {
    identityLog('iniciando envio de acesso', {
      tenantId,
      collaboratorId,
      authUserExisted,
      mode: inviteMode,
    });
    inviteDelivery = await dispatchCollaboratorInvite(supabase, {
      email: normalizedEmail,
      tenantId,
      role,
      collaboratorId,
      collaboratorName: collaboratorFullName,
      userName: collaboratorFullName || normalizedEmail,
      profileRole: role,
    }, { mode: inviteMode });

    authUser = await requireAuthUserId(supabase, normalizedEmail, {
      explicitUser: inviteDelivery?.user || authUser,
    });
  } else if (!authUser?.id) {
    authUser = await createAuthUserForCollaboratorInvite({
      normalizedEmail,
      tenantId,
      role,
      collaboratorId,
      collaboratorFullName,
    });
    authUser = await requireAuthUserId(supabase, normalizedEmail, { explicitUser: authUser });
  } else {
    identityLog('user_id encontrado', { userId: authUser.id, sendInvite: false });
  }

  return { authUser, inviteDelivery, authUserExisted };
}

function formatCollaboratorProvisionResponse(provisioned, { authUserExisted = false, requestedAction = 'provision' } = {}) {
  const inviteStatus = normalizeInvitationStatus(
    provisioned.tenantUser?.invitation_status
    || provisioned.invitation?.status
    || 'none',
  );
  const emailSent = isInviteEmailDelivered(provisioned.inviteDelivery);
  const hasSetupLink = Boolean(provisioned.inviteDelivery?.setupLink);
  const inviteSent = emailSent;
  let message = 'Acesso vinculado com sucesso.';
  if (emailSent) {
    message = 'Convite enviado por e-mail. Verifique a caixa de entrada e o spam.';
  } else if (hasSetupLink) {
    message = 'Link de acesso gerado. Se o e-mail não chegar, copie o link e envie manualmente ao colaborador.';
  } else if (authUserExisted) {
    message = 'Usuário já existia. Acesso vinculado — use Reenviar convite se o e-mail não chegou.';
  } else if (requestedAction === 'resend' && emailSent) {
    message = 'Convite reenviado por e-mail.';
  } else if (requestedAction === 'resend') {
    message = hasSetupLink
      ? 'Link de acesso gerado. Se o e-mail não chegar, copie o link e envie manualmente.'
      : 'Não foi possível enviar o e-mail automaticamente. Tente novamente ou verifique o SMTP do Supabase.';
  }

  return {
    ok: true,
    success: true,
    authUserId: provisioned.tenantUser?.user_id || null,
    tenantUserId: provisioned.tenantUser?.id || null,
    emailSent,
    inviteSent,
    inviteStatus: emailSent ? 'sent' : inviteStatus,
    linkedExisting: Boolean(authUserExisted),
    repairedBrokenLink: Boolean(provisioned.repairedBrokenLink),
    message,
    tenant_user: provisioned.tenantUser,
    invitation: provisioned.invitation,
    invite_delivery: provisioned.inviteDelivery || null,
  };
}

async function provisionCollaboratorAccess({
  actorAuthUserId,
  tenantId,
  collaboratorId,
  collaboratorFullName,
  email,
  profileRole,
  sendInvite = true,
  repairStaleAuth = false,
  requestedAction = 'provision',
}) {
  const audit = {
    tenantId: normalizeText(tenantId) || null,
    collaboratorId: normalizeText(collaboratorId) || null,
    email: maskEmail(email),
    requestedAction,
    repairStaleAuth: Boolean(repairStaleAuth),
    existingTenantUserId: null,
    existingCollaboratorAccessUserId: null,
    authUserFound: false,
    authUserId: null,
    linkType: null,
    inviteSent: false,
    recoverySent: false,
    repairedBrokenLink: false,
    finalStatus: null,
    error: null,
    emailDelivery: null,
  };

  let repairedBrokenLink = false;

  try {
    const actorTenantUser = await getTenantAdminActorOrThrow(actorAuthUserId, tenantId);
    const resolvedTenantId = actorTenantUser.tenant_id;
    audit.tenantId = resolvedTenantId;
    const normalizedEmail = normalizeEmail(email);
    const normalizedRole = normalizeRoleValue(profileRole);

    if (!normalizedEmail) throw new Error('E-mail é obrigatório para criar acesso.');
    if (!normalizedRole) throw new Error('Perfil de acesso é obrigatório.');

    const { data: existingTenantUserRow } = await supabase
      .from('tenant_users')
      .select('id, user_id, collaborator_id')
      .eq('tenant_id', resolvedTenantId)
      .eq('email', normalizedEmail)
      .maybeSingle();
    audit.existingTenantUserId = existingTenantUserRow?.id || null;
    audit.existingCollaboratorAccessUserId = existingTenantUserRow?.user_id || null;

    collaboratorId = await resolveCollaboratorIdForTenantEmailAccess(supabase, {
      tenantId: resolvedTenantId,
      tenantUserId: existingTenantUserRow?.id || null,
      tenantUserCollaboratorId: existingTenantUserRow?.collaborator_id,
      requestedCollaboratorId: collaboratorId,
      email: normalizedEmail,
    }) || collaboratorId;

    const shouldRepairStale = repairStaleAuth
      || sendInvite
      || Boolean(existingTenantUserRow?.user_id);
    if (shouldRepairStale) {
      repairedBrokenLink = await clearStaleTenantUserAuthReference(resolvedTenantId, normalizedEmail);
      audit.repairedBrokenLink = repairedBrokenLink;
    }

    await assertEmailAvailableForTenantInvite(resolvedTenantId, normalizedEmail, { collaboratorId });

    const authBeforeInvite = await findAuthUserByEmail(normalizedEmail);
    audit.authUserFound = Boolean(authBeforeInvite?.id);

    const {
      authUser,
      inviteDelivery: earlyInviteDelivery,
      authUserExisted = false,
    } = await resolveAuthUserForInvite({
      normalizedEmail,
      sendInvite,
      tenantId: resolvedTenantId,
      role: normalizedRole,
      collaboratorId,
      collaboratorFullName,
      requestedAction,
    });

    audit.authUserFound = Boolean(authBeforeInvite?.id) || Boolean(authUserExisted);
    audit.authUserId = assertAuthUserIdForTenantWrite(authUser?.id, {
      email: normalizedEmail,
      tenantId: resolvedTenantId,
      phase: 'before_tenant_upsert',
    });

    const tenantUser = await upsertTenantUserAccess({
      tenantId: resolvedTenantId,
      collaboratorId,
      fullName: collaboratorFullName || normalizedEmail,
      email: normalizedEmail,
      role: normalizedRole,
      hasSystemAccess: true,
      invitationStatus: sendInvite ? 'pending' : 'none',
      authUserId: authUser?.id || null,
    });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const inviteDelivery = earlyInviteDelivery;
    let invitationStatus = sendInvite ? 'pending' : 'none';

    if (sendInvite) {
      invitationStatus = isInviteEmailDelivered(inviteDelivery) ? 'sent' : 'pending';
    }
    audit.inviteSent = isInviteEmailDelivered(inviteDelivery);
    audit.emailDelivery = inviteDelivery?.emailDelivery || null;
    audit.linkType = inviteDelivery?.emailDelivery || null;
    audit.finalStatus = audit.inviteSent ? 'invite_sent' : (inviteDelivery?.setupLink ? 'setup_link' : 'access_linked');

    let invitation = await upsertInvitationRecord({
      tenantId: resolvedTenantId,
      tenantUserId: tenantUser.id,
      collaboratorId,
      email: normalizedEmail,
      profileRole: normalizedRole,
      createdBy: actorAuthUserId,
      status: sendInvite ? invitationStatus : 'pending',
      expiresAt,
    });

    let finalTenantUser = tenantUser;
    if (sendInvite) {
      const { data: updatedTenantUser, error: updatedTenantUserError } = await supabase
        .from('tenant_users')
        .update({ invitation_status: invitationStatus })
        .eq('id', tenantUser.id)
        .select(TENANT_USER_SELECT_BASE)
        .single();
      if (updatedTenantUserError) {
        if (!isMissingInvitationStatusColumnError(updatedTenantUserError)) throw updatedTenantUserError;
      } else {
        finalTenantUser = updatedTenantUser;
      }
    }

    logAccessEmailAudit(audit);

    if (sendInvite && !isInviteEmailDelivered(inviteDelivery)) {
      const err = new Error(
        inviteDelivery?.message
        || 'Não foi possível enviar o convite por e-mail. Verifique SUPABASE_ANON_KEY, SMTP do Supabase Auth ou EMAIL_API_KEY no Railway.',
      );
      err.code = 'INVITE_EMAIL_NOT_SENT';
      err.setupLink = inviteDelivery?.setupLink || null;
      throw err;
    }

    if (sendInvite && authUser?.id) {
      await appendAccessAuditToAuthUser(authUser.id, {
        action: requestedAction === 'resend' ? 'invite_resent' : 'invite_sent',
        label: requestedAction === 'resend' ? 'Reenviou convite de acesso' : 'Enviou convite de acesso',
        actor_id: actorAuthUserId,
        tenant_id: resolvedTenantId,
        collaborator_id: collaboratorId,
        target_email: normalizedEmail,
        email_sent: audit.inviteSent,
        repaired_broken_link: repairedBrokenLink,
      });
    }

    return {
      tenantUser: finalTenantUser,
      invitation,
      inviteDelivery: inviteDelivery || null,
      authUserExisted,
      repairedBrokenLink,
    };
  } catch (err) {
    audit.error = String(err?.message || err || 'unknown');
    audit.finalStatus = 'error';
    logAccessEmailAudit(audit);
    throw err;
  }
}

async function createTenantUserFromApp({
  actorAuthUserId,
  tenantId,
  collaboratorId,
  fullName,
  email,
  password,
  profileRole,
  status = 'active',
  sendInvite = false,
}) {
  const actorTenantUser = await getTenantAdminActorOrThrow(actorAuthUserId, tenantId);
  const resolvedTenantId = actorTenantUser.tenant_id;
  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = normalizeRoleValue(profileRole);
  const normalizedFullName = normalizeText(fullName);
  const passwordRaw = normalizeText(password);
  const isActive = String(status || 'active').toLowerCase() !== 'inactive';

  if (!normalizedEmail) throw new Error('email é obrigatório.');
  if (!passwordRaw || passwordRaw.length < 8) throw new Error('password deve ter pelo menos 8 caracteres.');
  if (!normalizedRole) throw new Error('profile_role é obrigatório.');
  if (!normalizedFullName) throw new Error('full_name é obrigatório.');

  const { data: existingByTenantEmail, error: existingByTenantEmailError } = await supabase
    .from('tenant_users')
    .select('id, user_id')
    .eq('tenant_id', resolvedTenantId)
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (existingByTenantEmailError) throw existingByTenantEmailError;
  if (existingByTenantEmail?.id) {
    const duplicateErr = new Error('Este e-mail já possui acesso nesta clínica.');
    duplicateErr.code = 'EMAIL_ALREADY_HAS_ACCESS';
    throw duplicateErr;
  }

  let authUser = await lookupAuthUserByEmail(supabase, normalizedEmail);
  if (!authUser?.id) {
    const { data: authCreateData, error: authCreateError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: passwordRaw,
      email_confirm: true,
      user_metadata: { full_name: normalizedFullName },
      app_metadata: { tenant_id: resolvedTenantId, role: normalizedRole },
    });
    if (authCreateError) {
      if (isAuthUserAlreadyRegisteredError(authCreateError)) {
        authUser = await requireAuthUserId(supabase, normalizedEmail, { afterInviteError: authCreateError });
      } else {
        throw authCreateError;
      }
    } else {
      authUser = authCreateData?.user || null;
      authUser = await requireAuthUserId(supabase, normalizedEmail, { explicitUser: authUser });
    }
  }

  const tenantUser = await upsertTenantUserAccess({
    tenantId: resolvedTenantId,
    collaboratorId: normalizeText(collaboratorId) || null,
    fullName: normalizedFullName,
    email: normalizedEmail,
    role: normalizedRole,
    hasSystemAccess: isActive,
    invitationStatus: sendInvite ? 'pending' : 'none',
    authUserId: assertAuthUserIdForTenantWrite(authUser.id, { email: normalizedEmail, tenantId: resolvedTenantId }),
  });

  if (!tenantUser?.id) throw new Error('Falha ao criar vínculo do usuário no tenant.');

  let invitation = null;
  if (sendInvite) {
    const inviteDelivery = await sendCollaboratorInvite({
      email: normalizedEmail,
      tenantId: resolvedTenantId,
      role: normalizedRole,
      collaboratorId: normalizeText(collaboratorId) || null,
      collaboratorName: normalizedFullName,
      userName: normalizedFullName,
      profileRole: normalizedRole,
    });
    const invitationStatus = isInviteEmailDelivered(inviteDelivery) ? 'sent' : 'pending';
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    invitation = await upsertInvitationRecord({
      tenantId: resolvedTenantId,
      tenantUserId: tenantUser.id,
      collaboratorId: normalizeText(collaboratorId) || null,
      email: normalizedEmail,
      profileRole: normalizedRole,
      createdBy: actorAuthUserId,
      status: invitationStatus,
      expiresAt,
    });
    return { tenantUser, invitation, authUserId: authUser.id, inviteDelivery };
  }

  return { tenantUser, invitation, authUserId: authUser.id, inviteDelivery: null };
}

async function ensureConsoleAdminCredentials({
  email = 'admin@loveodonto.com',
  password = 'admin123',
  fullName = 'Admin Love Odonto',
}) {
  const emailNorm = normalizeEmail(email);
  let authUser = await findAuthUserByEmail(emailNorm);

  if (!authUser?.id) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: emailNorm,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !data?.user?.id) {
      throw error || new Error('Falha ao criar usuário admin da Console.');
    }
    authUser = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, {
      email: emailNorm,
      password,
      email_confirm: true,
      user_metadata: {
        ...(authUser.user_metadata || {}),
        full_name: fullName,
      },
    });
    if (error || !data?.user?.id) {
      throw error || new Error('Falha ao atualizar senha do admin da Console.');
    }
    authUser = data.user;
  }

  const { error: profileError } = await supabase
    .from('platform_admin_users')
    .upsert(
      {
        id: authUser.id,
        email: emailNorm,
        full_name: fullName,
        role_slug: 'super_admin',
        is_active: true,
      },
      { onConflict: 'id' },
    );
  if (profileError) throw profileError;

  return {
    id: authUser.id,
    email: emailNorm,
    full_name: fullName,
    role_slug: 'super_admin',
    is_active: true,
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

const platformBilling = createPlatformBillingService({
  supabase,
  planConfig: PLAN_CONFIG,
  insertAuditLog,
});

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

function isSupabaseNetworkError(err) {
  const code = String(err?.cause?.code || err?.code || '').trim();
  const message = String(err?.message || err?.cause?.message || '');
  return ['ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN'].includes(code)
    || message.includes('fetch failed');
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
    if (isSupabaseNetworkError(err)) {
      return res.status(503).json({
        error: 'Não foi possível contactar o Supabase. Verifique a ligação à internet e tente novamente.',
      });
    }
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
    const explicitTenantId = normalizeText(req.query?.tenant_id);
    const tenantUser = await resolveActiveTenantUser(
      authUserId,
      explicitTenantId,
      req.appAuthUser.email,
    );
    if (!tenantUser?.tenant_id) {
      return res.status(403).json({
        error:
          'Usuário sem vínculo ativo em tenant_users. '
          + 'Entre em contato com o administrador da clínica.',
        code: 'TENANT_MEMBERSHIP_REQUIRED',
      });
    }

    console.log('[TENANT_AUDIT]', {
      user_id: authUserId,
      email: req.appAuthUser.email,
      tenant_id: tenantUser.tenant_id,
      role: tenantUser.role || tenantUser.role_slug,
      link_source: 'tenant_users',
      status: tenantUser.status,
      at: new Date().toISOString(),
    });

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
    if (['blocked', 'billing_blocked', 'suspended', 'cancelled', 'canceled'].includes(tenantStatus)) {
      warnings.push(`Status da clínica: ${tenantStatus}`);
    }
    if (tenantStatus === 'billing_blocked') {
      warnings.push('Acesso suspenso por inadimplência SaaS');
    }
    if (['overdue', 'past_due', 'block_recommended', 'due_today'].includes(billingStatus)) {
      warnings.push('Existem pendências de cobrança');
    }

    let teamRoster = [];
    const rosterSelects = [
      'id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug, is_active, status, has_system_access',
      'id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug, is_active, status',
    ];
    for (const sel of rosterSelects) {
      const { data: rosterRows, error: rosterErr } = await supabase
        .from('tenant_users')
        .select(sel)
        .eq('tenant_id', tenantId)
        .order('full_name', { ascending: true });
      if (!rosterErr) {
        teamRoster = await enrichTeamRosterWithPermissionFields(
          (rosterRows || []).filter(isActiveTenantUserRow),
        );
        break;
      }
      if (!isMissingHasSystemAccessColumnError(rosterErr)) throw rosterErr;
    }

    let clinicProfile = null;
    try {
      clinicProfile = await resolveClinicProfileForTenant(supabase, tenantId, tenant);
    } catch (profileErr) {
      if (profileErr?.code === 'TENANT_PROFILE_MISMATCH') {
        console.error('[TENANT_PROFILE_MISMATCH]', {
          tenant_id: tenantId,
          user_id: authUserId,
          email: req.appAuthUser.email,
        });
        return res.status(403).json({
          error: 'Perfil da clínica inconsistente com o vínculo do usuário.',
          code: 'TENANT_PROFILE_MISMATCH',
        });
      }
      throw profileErr;
    }

    if (!clinicProfile?.tenant_id) {
      console.error('[TENANT_PROFILE_MISSING]', {
        tenant_id: tenantId,
        user_id: authUserId,
        email: req.appAuthUser.email,
      });
      return res.status(422).json({
        error: 'Clínica não configurada para este usuário.',
        code: 'TENANT_PROFILE_MISSING',
      });
    }

    const authMeta = req.appAuthUser?.app_metadata && typeof req.appAuthUser.app_metadata === 'object'
      ? req.appAuthUser.app_metadata
      : {};
    const currentUserAuthMeta = await getAuthUserMeta(authUserId);
    const permissionFields = extractPermissionFieldsFromAppMetadata(
      currentUserAuthMeta?.app_metadata || authMeta,
    );

    res.json({
      tenant,
      clinicProfile,
      modules: buildModuleMap(modulesResult.data || []),
      flags: buildFeatureFlags(globalFlagsResult.data || [], tenantFlagsResult.data || []),
      limits: limitsResult.data?.limits_json || {},
      subscription,
      warnings,
      access: {
        tenantId,
        role: tenantUser.role || tenantUser.role_slug || 'atendimento',
        isActive: tenantUser.is_active ?? tenantUser.status === 'active',
        invitationStatus: tenantUser.invitation_status || 'none',
        collaboratorId: tenantUser.collaborator_id || null,
        clinicId: clinicProfile.clinic_id || null,
      },
      currentUser: {
        id: authUserId,
        fullName: tenantUser.full_name || req.appAuthUser.user_metadata?.full_name || '',
        email: tenantUser.email || req.appAuthUser.email || '',
        role: tenantUser.role || tenantUser.role_slug || 'atendimento',
        isActive: tenantUser.is_active ?? true,
        collaboratorId: tenantUser.collaborator_id || null,
        permissionOverrides: permissionFields.permission_overrides,
        has_custom_permissions: permissionFields.has_custom_permissions,
        custom_permissions: permissionFields.custom_permissions,
      },
      teamRoster,
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

/**
 * Diagnóstico de sincronização SaaS (usuário autenticado).
 * GET /internal/app/debug-user-context?tenant_id=...&target_user_id=... (opcional)
 */
app.get('/internal/app/debug-user-context', requireAppUser, async (req, res) => {
  try {
    const explicitTenantId = normalizeText(req.query?.tenant_id);
    const targetUserIdInput = normalizeText(req.query?.target_user_id);
    const authUserId = targetUserIdInput || req.appAuthUser.id;

    const actorTenantUser = await getTenantAdminActorOrThrow(req.appAuthUser.id, explicitTenantId);
    const tenantId = actorTenantUser.tenant_id;

    const { data: tenantRow } = await supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle();
    const clinicProfile = await resolveClinicProfileForTenant(supabase, tenantId, tenantRow || { id: tenantId });

    const { data: tuRow } = await supabase
      .from('tenant_users')
      .select('id, tenant_id, user_id, collaborator_id, full_name, email, role, role_slug, is_active, status, has_system_access')
      .eq('tenant_id', tenantId)
      .eq('user_id', authUserId)
      .maybeSingle();

    const authMeta = await getAuthUserMeta(authUserId);
    const permissionFields = extractPermissionFieldsFromAppMetadata(authMeta?.app_metadata || {});

    let collaborator = null;
    const collabId = tuRow?.collaborator_id || null;

    const permissionsCount = permissionFields.has_custom_permissions && permissionFields.custom_permissions
      ? Object.values(permissionFields.custom_permissions).filter(Boolean).length
      : Object.values(permissionFields.permission_overrides || {}).filter((v) => v === true).length;

    const roleSlug = normalizeRoleValue(tuRow?.role || tuRow?.role_slug || 'atendimento');
    const agendaPermKeys = ['agenda'];
    const agendaEnabled = permissionFields.has_custom_permissions && permissionFields.custom_permissions
      ? agendaPermKeys.some((mod) => Object.entries(permissionFields.custom_permissions)
        .some(([key, val]) => key.includes(mod) && val === true))
      : ['dentista', 'profissional', 'atendimento', 'recepcao', 'gerente', 'administrativo'].includes(roleSlug);

    return res.status(200).json({
      user_id: authUserId,
      email: tuRow?.email || req.appAuthUser.email || '',
      tenant_id: tenantId,
      tenant_name: tenantRow?.trade_name || tenantRow?.name || '',
      role_slug: roleSlug,
      tenant_user_status: tuRow?.status || (tuRow?.is_active ? 'active' : 'inactive') || 'unknown',
      collaborator_id: collabId,
      collaborator_name: tuRow?.full_name || '',
      collaborator_status: tuRow?.is_active === false ? 'inativo' : 'ativo',
      access_id: tuRow?.id || null,
      access_status: tuRow?.has_system_access !== false ? 'active' : 'inactive',
      has_custom_permissions: permissionFields.has_custom_permissions,
      permissions_count: permissionsCount,
      agenda_enabled: agendaEnabled,
      logo_url: clinicProfile?.logo_url || null,
      avatar_url: authMeta?.user_metadata?.avatar_url || null,
      source: 'debug-user-context',
      permission_overrides_keys: Object.keys(permissionFields.permission_overrides || {}).length,
      custom_permissions_keys: permissionFields.custom_permissions
        ? Object.keys(permissionFields.custom_permissions).length
        : 0,
    });
  } catch (err) {
    console.error('[debug-user-context]', err);
    return res.status(400).json({
      error: normalizeDatabaseError(err, 'Falha no diagnóstico de contexto do usuário.'),
    });
  }
});

app.put('/internal/app/clinic-profile', requireAppUser, async (req, res) => {
  try {
    const explicitTenantId = normalizeText(req.body?.tenant_id);
    const actorTenantUser = await getTenantAdminActorOrThrow(req.appAuthUser.id, explicitTenantId);
    const tenantId = actorTenantUser.tenant_id;

    const rawLogo = req.body?.logo_url || req.body?.logoUrl;
    if (rawLogo && String(rawLogo).trim().toLowerCase().startsWith('data:')) {
      return res.status(400).json({
        error: 'logo_url deve ser URL pública do Supabase Storage. Envie a imagem ao bucket clinic-logos antes de salvar.',
        code: 'LOGO_MUST_BE_STORAGE_URL',
      });
    }

    const row = await upsertClinicProfileForTenant(supabase, tenantId, {
      name: req.body?.name || req.body?.nomeClinica,
      fantasy_name: req.body?.fantasy_name || req.body?.nomeFantasia,
      legal_name: req.body?.legal_name || req.body?.razaoSocial,
      logo_url: req.body?.logo_url || req.body?.logoUrl,
      email: req.body?.email || req.body?.emailPrincipal,
      phone: req.body?.phone,
      cnpj: req.body?.cnpj,
      status: req.body?.status,
    });

    const { data: tenantRow } = await supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle();
    const clinicProfile = await resolveClinicProfileForTenant(supabase, tenantId, tenantRow || { id: tenantId });

    return res.status(200).json({ success: true, clinicProfile: clinicProfile || row });
  } catch (err) {
    console.error('[app-clinic-profile]', err);
    return res.status(400).json({
      error: normalizeDatabaseError(err, 'Falha ao salvar perfil da clínica.'),
    });
  }
});

app.post('/internal/app/collaborators/link', requireAppUser, async (req, res) => {
  try {
    const explicitTenantId = normalizeText(req.body?.tenant_id);
    const collaboratorId = normalizeText(req.body?.collaborator_id);
    const email = normalizeEmail(req.body?.email);
    const fullName = normalizeText(req.body?.full_name);

    const linked = await linkCollaboratorToTenantUser({
      actorAuthUserId: req.appAuthUser.id,
      tenantId: explicitTenantId,
      collaboratorId,
      email,
      fullName,
    });

    return res.status(200).json({
      success: true,
      linked: linked.linked,
      tenant_user: linked.tenantUser,
    });
  } catch (err) {
    console.error('[app-collaborators-link]', err);
    return res.status(400).json({
      error: normalizeDatabaseError(err, 'Falha ao vincular colaborador ao usuário.'),
    });
  }
});

async function handleCollaboratorProvisionAccess(req, res) {
  try {
    const explicitTenantId = normalizeText(req.body?.tenant_id);
    const createSystemAccess = Boolean(req.body?.create_system_access);
    const collaboratorId = normalizeText(req.body?.collaborator_id || req.params?.collaboratorId);
    const collaboratorFullName = normalizeText(
      req.body?.collaborator_full_name || req.body?.full_name || req.body?.fullName,
    );
    const email = normalizeEmail(req.body?.email);
    const profileRoleRaw = normalizeText(req.body?.profile_role || req.body?.role);
    const sendInvite = req.body?.send_invite !== false;
    const repairStaleAuth = req.body?.repair_stale_auth === true || sendInvite;

    if (!createSystemAccess) {
      return res.status(200).json({
        ok: true,
        success: true,
        create_system_access: false,
        message: 'Colaborador criado sem acesso ao sistema.',
      });
    }
    if (!email) {
      return res.status(400).json({ ok: false, error: 'E-mail inválido ou ausente. Informe um e-mail válido para criar acesso.' });
    }
    if (!profileRoleRaw) {
      return res.status(400).json({ ok: false, error: 'profile_role é obrigatório quando create_system_access=true.' });
    }
    if (!collaboratorId) {
      return res.status(400).json({ ok: false, error: 'collaborator_id é obrigatório.' });
    }

    console.log('[COLLAB_ACCESS] creating collaborator access', {
      collaboratorId,
      tenantId: explicitTenantId,
      email: maskEmail(email),
    });

    logCollabInviteProdAudit({
      tenantId: explicitTenantId,
      collaboratorId,
      email: maskEmail(email),
      repairStaleAuth,
      endpoint: req.path,
    });

    const result = await identityService.provisionIdentity({
      actorAuthUserId: req.appAuthUser.id,
      tenantId: explicitTenantId,
      collaboratorId,
      collaboratorFullName,
      email,
      profileRole: normalizeRoleValue(profileRoleRaw),
      sendInvite,
      repairStaleAuth,
      actor: { id: req.appAuthUser.id, email: req.appAuthUser.email, ip: resolveClientIp(req) },
      requestedAction: 'provision',
    });

    return res.status(200).json({
      ...result.formatted,
      identity: result.identity,
    });
  } catch (err) {
    console.error('[COLLAB_ACCESS] error', err);
    const payload = formatProvisionErrorResponse(err);
    return res.status(400).json(payload);
  }
}

app.post('/internal/app/collaborators/provision', requireAppUser, handleCollaboratorProvisionAccess);
app.post('/internal/app/collaborators/:collaboratorId/provision-access', requireAppUser, handleCollaboratorProvisionAccess);

/**
 * Persistência canónica (SaaS): credenciais, perfil e overrides de permissão no Supabase Auth + tenant_users.
 * Overrides ficam em app_metadata.permission_overrides (o JWT passa a refletir após refresh/login).
 */
app.post('/internal/app/collaborators/access-bundle', requireAppUser, async (req, res) => {
  try {
    const explicitTenantId = normalizeText(req.body?.tenant_id);
    const collaboratorId = normalizeText(req.body?.collaborator_id);
    const targetUserIdInput = normalizeText(req.body?.target_user_id);
    const emailFromBody = normalizeEmail(req.body?.email);
    const passwordRaw = normalizeText(req.body?.password);
    const roleSlug = normalizeRoleValue(req.body?.role);
    const hasSystemAccess = req.body?.has_system_access !== false;
    const rawOverrides = req.body?.permission_overrides;
    const permissionOverrides =
      rawOverrides && typeof rawOverrides === 'object' && !Array.isArray(rawOverrides) ? rawOverrides : {};
    const hasCustomPermissions = req.body?.has_custom_permissions === true;
    const rawCustomPermissions = req.body?.custom_permissions;
    const customPermissions = hasCustomPermissions
      && rawCustomPermissions
      && typeof rawCustomPermissions === 'object'
      && !Array.isArray(rawCustomPermissions)
      ? rawCustomPermissions
      : null;

    if (!targetUserIdInput) {
      return res.status(400).json({ error: 'target_user_id é obrigatório.' });
    }
    if (passwordRaw && passwordRaw.length > 0 && passwordRaw.length < 8) {
      return res.status(400).json({ error: 'password deve ter pelo menos 8 caracteres.' });
    }

    const actorTenantUser = await getTenantAdminActorOrThrow(req.appAuthUser.id, explicitTenantId);
    const tenantId = actorTenantUser.tenant_id;

    let validTargetUserId = await getValidAuthUserId(targetUserIdInput);
    if (!validTargetUserId && emailFromBody) {
      await clearStaleTenantUserAuthReference(tenantId, emailFromBody);
    }

    const { data: tuByUserId, error: tuByUserErr } = await supabase
      .from('tenant_users')
      .select('id, user_id, tenant_id, full_name, email, collaborator_id')
      .eq('tenant_id', tenantId)
      .eq('user_id', validTargetUserId || targetUserIdInput)
      .maybeSingle();
    let resolvedTuRow = tuByUserId;
    let tuLookupErr = tuByUserErr;

    if (!resolvedTuRow?.id && emailFromBody) {
      const byEmail = await supabase
        .from('tenant_users')
        .select('id, user_id, tenant_id, full_name, email, collaborator_id')
        .eq('tenant_id', tenantId)
        .eq('email', emailFromBody)
        .maybeSingle();
      tuLookupErr = byEmail.error;
      resolvedTuRow = byEmail.data || null;
      if (resolvedTuRow?.user_id) {
        validTargetUserId = await getValidAuthUserId(resolvedTuRow.user_id);
      }
    }

    if (tuLookupErr) throw tuLookupErr;
    if (!resolvedTuRow?.id) {
      return res.status(404).json({
        error: 'Usuário não encontrado em tenant_users para esta clínica. Vincule o acesso em /configuracoes/usuarios antes de editar credenciais.',
      });
    }

    const email = emailFromBody || normalizeEmail(resolvedTuRow.email);
    if (!email) {
      return res.status(400).json({ error: 'email é obrigatório (informe no formulário ou em tenant_users).' });
    }

    validTargetUserId = validTargetUserId
      || await resolveAuthUserIdForTenantLink({
        normalizedEmail: email,
        explicitAuthUserId: targetUserIdInput,
        existingTenantUser: resolvedTuRow,
      });

    if (!validTargetUserId) {
      return res.status(400).json({
        error:
          'Não foi possível vincular o e-mail: conta no Auth ausente. '
          + 'Salve o acesso novamente na aba Acesso ao sistema para reenviar o convite.',
      });
    }

    const tuRow = resolvedTuRow;
    const targetUserId = assertAuthUserIdForTenantWrite(validTargetUserId, {
      email,
      tenantId,
      tenantUserId: tuRow.id,
      phase: 'access_bundle',
    });

    const baseTenantUpdate = {
      email,
      user_id: targetUserId,
      role: roleSlug,
      role_slug: roleSlug,
      is_active: hasSystemAccess,
      status: hasSystemAccess ? 'active' : 'inactive',
    };
    const tenantVariants = [];
    const withAccess = { ...baseTenantUpdate, has_system_access: hasSystemAccess };
    if (collaboratorId) {
      tenantVariants.push({ ...withAccess, collaborator_id: collaboratorId });
    }
    tenantVariants.push({ ...withAccess });
    if (collaboratorId) {
      tenantVariants.push({ ...baseTenantUpdate, collaborator_id: collaboratorId });
    }
    tenantVariants.push({ ...baseTenantUpdate });

    let lastTenantUpdErr = null;
    for (const variant of tenantVariants) {
      const { error: updErr } = await supabase
        .from('tenant_users')
        .update(variant)
        .eq('id', tuRow.id)
        .eq('tenant_id', tenantId);
      if (!updErr) {
        lastTenantUpdErr = null;
        break;
      }
      lastTenantUpdErr = updErr;
    }
    if (lastTenantUpdErr) throw lastTenantUpdErr;

    const { data: authData, error: authGetErr } = await supabase.auth.admin.getUserById(targetUserId);
    if (authGetErr || !authData?.user?.id) {
      throw authGetErr || new Error('Falha ao ler usuário no Auth.');
    }
    const prevMeta = authData.user.app_metadata && typeof authData.user.app_metadata === 'object'
      ? authData.user.app_metadata
      : {};
    const nextMeta = {
      ...prevMeta,
      tenant_id: tenantId,
      role: roleSlug,
      has_custom_permissions: hasCustomPermissions,
      permission_overrides: hasCustomPermissions ? permissionOverrides : {},
    };
    if (hasCustomPermissions && customPermissions) {
      nextMeta.custom_permissions = customPermissions;
    } else {
      delete nextMeta.custom_permissions;
    }
    const authUpdate = { app_metadata: nextMeta };
    const prevEmail = normalizeEmail(authData.user.email);
    if (email && email !== prevEmail) {
      authUpdate.email = email;
    }
    if (passwordRaw && passwordRaw.length >= 8) {
      authUpdate.password = passwordRaw;
    }
    const { error: authUpdErr } = await supabase.auth.admin.updateUserById(targetUserId, authUpdate);
    if (authUpdErr) throw authUpdErr;

    if (identityService) {
      try {
        const linkedIdentity = await identityService.resolveIdentityForCollaborator({
          tenantId,
          collaboratorId: collaboratorId || tuRow.collaborator_id,
          email,
        });
        if (linkedIdentity?.id) {
          await identityService.syncIdentity({
            identityId: linkedIdentity.id,
            tenantId,
            actor: { id: req.appAuthUser.id, email: req.appAuthUser.email, ip: resolveClientIp(req) },
          });
        } else if (collaboratorId || email) {
          await identityService.createIdentity({
            tenantId,
            email,
            fullName: tuRow.full_name || email,
            roleSlug: roleSlug,
            collaboratorId: collaboratorId || tuRow.collaborator_id,
            actor: { id: req.appAuthUser.id, email: req.appAuthUser.email },
          });
        }
      } catch (identityErr) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[access-bundle] identity sync skipped', identityErr?.message);
        }
      }
    }

    return res.status(200).json({
      success: true,
      tenant_user_id: tuRow.id,
      target_user_id: targetUserId,
    });
  } catch (err) {
    console.error('[app-collaborators-access-bundle]', err);
    return res.status(400).json({
      error: normalizeDatabaseError(err, 'Falha ao salvar credenciais e permissões.'),
    });
  }
});

app.post('/internal/app/users/create', requireAppUser, async (req, res) => {
  try {
    const explicitTenantId = normalizeText(req.body?.tenant_id);
    const collaboratorId = normalizeText(req.body?.collaborator_id);
    const fullName = normalizeText(req.body?.full_name);
    const email = normalizeEmail(req.body?.email);
    const password = normalizeText(req.body?.password);
    const profileRoleRaw = normalizeText(req.body?.profile_role);
    const status = normalizeText(req.body?.status || 'active');
    const sendInvite = req.body?.send_invite === true;

    const created = await createTenantUserFromApp({
      actorAuthUserId: req.appAuthUser.id,
      tenantId: explicitTenantId,
      collaboratorId,
      fullName,
      email,
      password,
      profileRole: profileRoleRaw,
      status,
      sendInvite,
    });

    return res.status(201).json({
      success: true,
      tenant_user: created.tenantUser,
      invitation: created.invitation,
      auth_user_id: created.authUserId,
    });
  } catch (err) {
    const normalizedError = normalizeDatabaseError(err, 'Falha ao criar usuário.');
    const msg = String(normalizedError || '');
    const lower = msg.toLowerCase();
    if (lower.includes('já possui acesso')) {
      return res.status(409).json({ error: 'Este e-mail já possui acesso.' });
    }
    return res.status(400).json({ error: normalizedError });
  }
});

app.post('/internal/app/invitations/resend', requireAppUser, async (req, res) => {
  try {
    const explicitTenantId = normalizeText(req.body?.tenant_id);
    const targetEmail = normalizeEmail(req.body?.email);
    const collaboratorId = normalizeText(req.body?.collaborator_id);
    const collaboratorFullName = normalizeText(req.body?.collaborator_full_name || req.body?.full_name);

    if (!targetEmail) {
      return res.status(400).json({ error: 'Informe um e-mail válido para reenviar o convite.' });
    }

    const actorTenantUser = await getTenantAdminActorOrThrow(req.appAuthUser.id, explicitTenantId);
    const tenantId = actorTenantUser.tenant_id;

    const { data: tenantUser } = await supabase
      .from('tenant_users')
      .select('id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug')
      .eq('tenant_id', tenantId)
      .eq('email', targetEmail)
      .maybeSingle();

    const resolvedCollaboratorId = tenantUser?.collaborator_id || collaboratorId || '';
    const resolvedFullName = collaboratorFullName || tenantUser?.full_name || targetEmail;
    const resolvedRole = normalizeRoleValue(tenantUser?.role || tenantUser?.role_slug || req.body?.profile_role || 'atendimento');

    if (!resolvedCollaboratorId) {
      return res.status(400).json({
        error: 'Colaborador não identificado. Salve o acesso na aba Acesso ao sistema antes de reenviar.',
      });
    }

    const result = await identityService.resendInviteByEmail({
      actorAuthUserId: req.appAuthUser.id,
      tenantId,
      email: targetEmail,
      collaboratorId: resolvedCollaboratorId,
      collaboratorFullName: resolvedFullName,
      profileRole: resolvedRole,
      actor: { id: req.appAuthUser.id, email: req.appAuthUser.email, ip: resolveClientIp(req) },
    });

    return res.status(200).json({
      success: true,
      tenant_user: result.formatted?.tenant_user,
      invitation: result.formatted?.invitation,
      invite_delivery: result.formatted?.invite_delivery,
      email_sent: result.formatted?.emailSent,
      message: result.formatted?.message,
      identity: result.identity,
      repaired_broken_link: result.formatted?.repairedBrokenLink,
    });
  } catch (err) {
    console.error('[app-invitations-resend]', err);
    const payload = formatProvisionErrorResponse(err, 'Não foi possível reenviar o convite. Tente novamente.');
    return res.status(400).json(payload);
  }
});

app.post('/internal/app/users/password-reset', requireAppUser, async (req, res) => {
  try {
    const explicitTenantId = normalizeText(req.body?.tenant_id);
    const targetEmail = normalizeEmail(req.body?.email);
    const collaboratorId = normalizeText(req.body?.collaborator_id);

    if (!targetEmail) {
      return res.status(400).json({ message: 'E-mail é obrigatório para redefinir a senha.' });
    }

    const actorTenantUser = await getTenantAdminActorOrThrow(req.appAuthUser.id, explicitTenantId);
    const tenantId = actorTenantUser.tenant_id;
    const clientIp = resolveClientIp(req);
    const actorName = actorTenantUser.full_name || req.appAuthUser.email || 'Administrador';

    const result = await identityService.resetPasswordByEmail({
      tenantId,
      email: targetEmail,
      collaboratorId,
      actorAuthUserId: req.appAuthUser.id,
      collaboratorFullName: normalizeText(req.body?.collaborator_full_name) || targetEmail,
      profileRole: req.body?.profile_role,
      actor: {
        id: req.appAuthUser.id,
        email: req.appAuthUser.email,
        ip: clientIp,
        name: actorName,
      },
    });

    const auditEntry = {
      action: result.auth_recreated ? 'auth_recreated_invite_sent' : 'password_reset_requested',
      label: result.auth_recreated
        ? 'Recriou conta e enviou convite'
        : 'Solicitou redefinição de senha',
      actor_name: actorName,
      actor_id: req.appAuthUser.id,
      ip: clientIp,
      target_email: targetEmail,
    };
    logCollaboratorAccessAudit(auditEntry);
    if (result.auth_user_id) {
      await appendAccessAuditToAuthUser(result.auth_user_id, auditEntry);
    }

    return res.status(200).json({
      ok: true,
      message: result.message || `Link de redefinição enviado para: ${targetEmail}`,
      email: targetEmail,
      email_sent: Boolean(result.email_sent),
      auth_recreated: Boolean(result.auth_recreated),
      invite_resent: Boolean(result.invite_resent),
      identity: result.identity || null,
      audit: auditEntry,
    });
  } catch (err) {
    console.error('[app-password-reset]', err);
    return res.status(400).json({
      message: err?.message || 'Não foi possível enviar o e-mail. Tente novamente.',
    });
  }
});

app.get('/internal/app/collaborators/access-audit', requireAppUser, async (req, res) => {
  try {
    const explicitTenantId = normalizeText(req.query?.tenant_id);
    const targetEmail = normalizeEmail(req.query?.email);
    if (!targetEmail) {
      return res.status(400).json({ message: 'E-mail é obrigatório.' });
    }

    const actorTenantUser = await getTenantAdminActorOrThrow(req.appAuthUser.id, explicitTenantId);
    const tenantId = actorTenantUser.tenant_id;

    const { data: tenantUser, error } = await supabase
      .from('tenant_users')
      .select('id, user_id, email')
      .eq('tenant_id', tenantId)
      .eq('email', targetEmail)
      .maybeSingle();
    if (error) throw error;
    if (!tenantUser?.user_id) {
      return res.status(200).json({ success: true, events: [] });
    }

    const meta = await getAuthUserMeta(tenantUser.user_id);
    const events = Array.isArray(meta?.app_metadata?.access_audit_log)
      ? meta.app_metadata.access_audit_log
      : [];

    return res.status(200).json({ success: true, events });
  } catch (err) {
    return res.status(400).json({
      message: 'Não foi possível carregar o histórico de acesso.',
    });
  }
});

app.post('/internal/app/invitations/reconcile', requireAppUser, async (req, res) => {
  try {
    let tenantUser = await getTenantUserByAuthUserId(req.appAuthUser.id);
    if (!tenantUser?.tenant_id) {
      tenantUser = await linkAuthUserToTenantMembership(
        req.appAuthUser.id,
        '',
        req.appAuthUser.email,
      );
    }
    if (!tenantUser?.tenant_id || !tenantUser?.email) {
      return res.status(200).json({ success: true, updated: 0 });
    }

    const acceptedAt = new Date().toISOString();
    const { data: invitationRows, error: invitationsError } = await supabase
      .from('invitations')
      .update({
        status: 'accepted',
        accepted_at: acceptedAt,
      })
      .eq('tenant_id', tenantUser.tenant_id)
      .eq('email', normalizeEmail(tenantUser.email))
      .in('status', ['pending', 'sent'])
      .select('id');
    if (invitationsError) throw invitationsError;

    const { error: tenantUserUpdateError } = await supabase
      .from('tenant_users')
      .update({ invitation_status: 'accepted' })
      .eq('tenant_id', tenantUser.tenant_id)
      .eq('user_id', req.appAuthUser.id);
    if (tenantUserUpdateError && !isMissingInvitationStatusColumnError(tenantUserUpdateError)) {
      throw tenantUserUpdateError;
    }

    return res.status(200).json({
      success: true,
      updated: Array.isArray(invitationRows) ? invitationRows.length : 0,
    });
  } catch (err) {
    console.error('[app-invitations-reconcile]', err);
    return res.status(400).json({
      error: normalizeDatabaseError(err, 'Falha ao reconciliar convite do primeiro acesso.'),
    });
  }
});

app.get('/internal/app/users/list', requireAppUser, async (req, res) => {
  try {
    const explicitTenantId = normalizeText(req.query?.tenant_id);
    if (!explicitTenantId) {
      return res.status(400).json({
        error: 'tenant_id é obrigatório na query string.',
        code: 'TENANT_REQUIRED',
      });
    }
    const actorTenantUser = await getTenantAdminActorOrThrow(req.appAuthUser.id, explicitTenantId);
    const tenantId = actorTenantUser.tenant_id;

    const tenantUsersListSelects = [
      'id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug, is_active, status, has_system_access, invitation_status, created_at, updated_at',
      'id, tenant_id, user_id, full_name, email, role, role_slug, is_active, status, has_system_access, invitation_status, created_at, updated_at',
      'id, tenant_id, user_id, full_name, email, role, role_slug, is_active, status, has_system_access, created_at, updated_at',
      'id, tenant_id, user_id, full_name, email, role, role_slug, is_active, status, invitation_status, created_at, updated_at',
      'id, tenant_id, user_id, full_name, email, role, role_slug, is_active, status, created_at, updated_at',
    ];
    let tenantUsers;
    let lastTenantUsersError = null;
    for (const sel of tenantUsersListSelects) {
      const { data, error } = await supabase
        .from('tenant_users')
        .select(sel)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });
      if (!error) {
        tenantUsers = data;
        lastTenantUsersError = null;
        break;
      }
      lastTenantUsersError = error;
    }
    if (lastTenantUsersError) throw lastTenantUsersError;

    let invitations = [];
    const invResult = await supabase
      .from('invitations')
      .select('id, tenant_id, tenant_user_id, collaborator_id, email, profile_role, status, expires_at, sent_at, accepted_at, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (invResult.error) {
      const invCode = String(invResult.error?.code || '').toUpperCase();
      const invMsg = String(invResult.error?.message || '').toLowerCase();
      if (
        invCode === 'PGRST205'
        || invCode === '42P01'
        || (invMsg.includes('relation') && invMsg.includes('does not exist'))
      ) {
        invitations = [];
      } else {
        throw invResult.error;
      }
    } else {
      invitations = invResult.data || [];
    }

    const latestInvitationByEmail = new Map();
    for (const inv of invitations || []) {
      const key = normalizeEmail(inv?.email);
      if (!key || latestInvitationByEmail.has(key)) continue;
      latestInvitationByEmail.set(key, inv);
    }

    const users = await Promise.all((tenantUsers || []).map(async (row) => {
      const email = normalizeEmail(row?.email);
      const invitation = latestInvitationByEmail.get(email) || null;
      const role = normalizeRoleValue(row?.role || row?.role_slug || invitation?.profile_role || 'atendimento');
      const hasSystemAccess = row?.has_system_access ?? row?.is_active ?? row?.status === 'active';
      const invitationStatus = normalizeInvitationStatus(row?.invitation_status || invitation?.status || 'none');
      const authUserValid = row?.user_id ? Boolean(await getValidAuthUserId(row.user_id)) : false;
      const authMeta = row?.user_id ? await getAuthUserMeta(row.user_id) : null;
      const permissionFields = extractPermissionFieldsFromAppMetadata(authMeta?.app_metadata);
      return {
        id: row.id,
        tenant_id: row.tenant_id,
        user_id: row.user_id || null,
        auth_user_valid: authUserValid,
        collaborator_id: row.collaborator_id || null,
        full_name: row.full_name || '',
        email: email || '',
        role,
        is_active: Boolean(row?.is_active ?? row?.status === 'active'),
        has_system_access: Boolean(hasSystemAccess),
        status: String(row?.status || (hasSystemAccess ? 'active' : 'inactive')),
        invitation_status: invitationStatus,
        created_at: row?.created_at || null,
        updated_at: row?.updated_at || null,
        last_sign_in_at: authMeta?.last_sign_in_at || null,
        password_reset_sent_at: authMeta?.app_metadata?.last_password_reset_requested_at || null,
        auth_meta: authMeta?.app_metadata || null,
        ...permissionFields,
        invitation,
      };
    }));

    return res.status(200).json({
      success: true,
      tenant_id: tenantId,
      users,
    });
  } catch (err) {
    return res.status(400).json({
      error: normalizeDatabaseError(err, 'Falha ao listar usuários da clínica.'),
    });
  }
});

app.patch('/internal/app/users/:tenantUserId/access', requireAppUser, async (req, res) => {
  try {
    const explicitTenantId = normalizeText(req.body?.tenant_id);
    const tenantUserId = normalizeText(req.params?.tenantUserId);
    const hasSystemAccess = Boolean(req.body?.has_system_access);
    if (!tenantUserId) return res.status(400).json({ error: 'tenantUserId é obrigatório.' });

    const actorTenantUser = await getTenantAdminActorOrThrow(req.appAuthUser.id, explicitTenantId);
    const tenantId = actorTenantUser.tenant_id;

    const payload = {
      has_system_access: hasSystemAccess,
      is_active: hasSystemAccess,
      status: hasSystemAccess ? 'active' : 'inactive',
    };
    let result;
    try {
      result = await supabase
        .from('tenant_users')
        .update(payload)
        .eq('id', tenantUserId)
        .eq('tenant_id', tenantId)
        .select(TENANT_USER_SELECT_WITH_ACCESS)
        .single();
      if (result.error) throw result.error;
    } catch (error) {
      if (!isMissingHasSystemAccessColumnError(error)) throw error;
      result = await supabase
        .from('tenant_users')
        .update(omitHasSystemAccess(payload))
        .eq('id', tenantUserId)
        .eq('tenant_id', tenantId)
        .select(TENANT_USER_SELECT_BASE)
        .single();
      if (result.error) throw result.error;
    }

    const tenantUser = result.data;
    if (!hasSystemAccess && tenantUser?.user_id) {
      await revokeAuthUserSessions(tenantUser.user_id);
    }

    return res.status(200).json({ success: true, tenant_user: tenantUser });
  } catch (err) {
    return res.status(400).json({
      error: normalizeDatabaseError(err, 'Falha ao atualizar status de acesso do usuário.'),
    });
  }
});

app.delete('/internal/app/users/:tenantUserId', requireAppUser, async (req, res) => {
  try {
    const explicitTenantId = normalizeText(req.body?.tenant_id);
    const tenantUserId = normalizeText(req.params?.tenantUserId);
    if (!tenantUserId) return res.status(400).json({ error: 'tenantUserId é obrigatório.' });

    const actorTenantUser = await getTenantAdminActorOrThrow(req.appAuthUser.id, explicitTenantId);
    const tenantId = actorTenantUser.tenant_id;

    if (tenantUserId === actorTenantUser.id) {
      return res.status(400).json({ error: 'Você não pode remover seu próprio vínculo com a clínica.' });
    }

    const { data: target, error: targetError } = await supabase
      .from('tenant_users')
      .select('id, tenant_id, user_id, email, role, role_slug')
      .eq('id', tenantUserId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target?.id) {
      return res.status(404).json({ error: 'Usuário não encontrado nesta clínica.' });
    }

    if (target.user_id && target.user_id === req.appAuthUser.id) {
      return res.status(400).json({ error: 'Você não pode remover seu próprio vínculo com a clínica.' });
    }

    const email = normalizeEmail(target.email);
    const { error: revokeError } = await supabase
      .from('invitations')
      .update({
        status: 'revoked',
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('email', email)
      .in('status', ['pending', 'sent']);
    if (revokeError) {
      const code = String(revokeError?.code || '').toUpperCase();
      const msg = String(revokeError?.message || '').toLowerCase();
      const missingInvitations = code === 'PGRST205' || code === '42P01'
        || (msg.includes('relation') && msg.includes('does not exist'));
      if (!missingInvitations) throw revokeError;
    }

    const { error: deleteError } = await supabase
      .from('tenant_users')
      .delete()
      .eq('id', tenantUserId)
      .eq('tenant_id', tenantId);
    if (deleteError) throw deleteError;

    return res.status(200).json({
      success: true,
      removed_tenant_user_id: tenantUserId,
      email,
    });
  } catch (err) {
    console.error('[app-users-unlink]', err);
    return res.status(400).json({
      error: normalizeDatabaseError(err, 'Falha ao remover vínculo do usuário.'),
    });
  }
});

app.patch('/internal/app/collaborators/:collaboratorId/access', requireAppUser, async (req, res) => {
  try {
    const explicitTenantId = normalizeText(req.body?.tenant_id);
    const collaboratorId = normalizeText(req.params?.collaboratorId);
    const hasSystemAccess = Boolean(req.body?.has_system_access);
    const targetEmail = normalizeEmail(req.body?.email);
    const fullName = normalizeText(req.body?.full_name);
    const explicitTenantUserId = normalizeText(req.body?.tenant_user_id);
    const clientIp = resolveClientIp(req);

    if (!collaboratorId) {
      return res.status(400).json({ error: 'collaboratorId é obrigatório.' });
    }

    const actorTenantUser = await getTenantAdminActorOrThrow(req.appAuthUser.id, explicitTenantId);
    const tenantId = actorTenantUser.tenant_id;
    const actorName = actorTenantUser.full_name || req.appAuthUser.email || 'Administrador';

    let existingTenantUser = await resolveTenantUserForCollaboratorAccess({
      actorAuthUserId: req.appAuthUser.id,
      tenantId,
      collaboratorId,
      email: targetEmail,
      fullName,
    });

    if (!existingTenantUser?.id && targetEmail) {
      existingTenantUser = await resolveTenantUserForCollaboratorAccess({
        actorAuthUserId: req.appAuthUser.id,
        tenantId,
        collaboratorId,
        email: targetEmail,
        fullName,
      });
    }

    if (!existingTenantUser?.id && explicitTenantUserId) {
      const { data: byId, error: byIdError } = await supabase
        .from('tenant_users')
        .select('id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug, is_active, status, has_system_access, invitation_status, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .eq('id', explicitTenantUserId)
        .maybeSingle();
      if (byIdError) throw byIdError;
      existingTenantUser = byId || null;
      if (
        existingTenantUser?.id
        && collaboratorId
        && targetEmail
        && existingTenantUser.collaborator_id !== collaboratorId
      ) {
        try {
          const linked = await linkCollaboratorToTenantUser({
            actorAuthUserId: req.appAuthUser.id,
            tenantId,
            collaboratorId,
            email: targetEmail,
            fullName,
          });
          existingTenantUser = linked.tenantUser || existingTenantUser;
        } catch (linkErr) {
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[app-collaborator-access-toggle] link skipped', linkErr?.message);
          }
        }
      }
    }

    if (!existingTenantUser?.id) {
      return res.status(404).json({
        error: 'Nenhum usuário de acesso encontrado para este colaborador. Envie um convite primeiro.',
      });
    }

    const resolvedEmail = targetEmail || existingTenantUser.email;
    const linkedIdentity = await identityService.resolveIdentityForCollaborator({
      tenantId,
      collaboratorId,
      email: resolvedEmail,
    }).catch((err) => {
      if (isMissingIdentitiesTableError(err)) return null;
      throw err;
    });

    if (linkedIdentity?.id) {
      const actor = {
        id: req.appAuthUser.id,
        email: req.appAuthUser.email,
        ip: clientIp,
        name: actorName,
      };
      const disableReason = normalizeText(req.body?.reason) || 'admin_request';
      const disableDescription = normalizeText(req.body?.reason_description);
      const expectedReturnAt = req.body?.expected_return_at || null;
      const isSuspension = req.body?.suspended === true || disableReason === 'suspension';

      let updatedIdentity;
      if (!hasSystemAccess) {
        updatedIdentity = await identityService.deactivateIdentity({
          identityId: linkedIdentity.id,
          tenantId,
          actorAuthUserId: req.appAuthUser.id,
          reason: disableReason,
          reasonDescription: disableDescription,
          expectedReturnAt,
          suspended: isSuspension,
          actor,
        });
      } else {
        updatedIdentity = await identityService.reactivateIdentity({
          identityId: linkedIdentity.id,
          tenantId,
          actorAuthUserId: req.appAuthUser.id,
          reason: normalizeText(req.body?.reason) || 'admin_correction',
          actor,
        });
      }

      const { data: tenantUserAfterIdentity } = await supabase
        .from('tenant_users')
        .select(TENANT_USER_SELECT_WITH_ACCESS)
        .eq('id', existingTenantUser.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const auditEntry = {
        action: hasSystemAccess ? 'access_reactivated' : 'access_deactivated',
        label: hasSystemAccess ? 'Reativou acesso ao sistema' : 'Desativou acesso ao sistema',
        actor_name: actorName,
        actor_id: req.appAuthUser.id,
        ip: clientIp,
        tenant_id: tenantId,
        collaborator_id: collaboratorId,
        target_email: resolvedEmail,
        reason: disableReason,
      };
      logCollaboratorAccessAudit(auditEntry);

      return res.status(200).json({
        success: true,
        tenant_user: tenantUserAfterIdentity || existingTenantUser,
        identity: updatedIdentity,
        audit: auditEntry,
        sessions_revoked: !hasSystemAccess,
      });
    }

    const previousStatus = {
      has_system_access: existingTenantUser.has_system_access !== false,
      role: normalizeRoleValue(existingTenantUser.role || existingTenantUser.role_slug || 'atendimento'),
      is_active: existingTenantUser.is_active !== false,
    };

    const updatePayload = {
      has_system_access: hasSystemAccess,
      is_active: hasSystemAccess,
      status: hasSystemAccess ? 'active' : 'inactive',
    };
    let tenantUser;
    try {
      const result = await supabase
        .from('tenant_users')
        .update(updatePayload)
        .eq('id', existingTenantUser.id)
        .eq('tenant_id', tenantId)
        .select(TENANT_USER_SELECT_WITH_ACCESS)
        .single();
      if (result.error) throw result.error;
      tenantUser = result.data;
    } catch (error) {
      if (!isMissingHasSystemAccessColumnError(error)) throw error;
      const fallbackResult = await supabase
        .from('tenant_users')
        .update(omitHasSystemAccess(updatePayload))
        .eq('id', existingTenantUser.id)
        .eq('tenant_id', tenantId)
        .select(TENANT_USER_SELECT_BASE)
        .single();
      if (fallbackResult.error) throw fallbackResult.error;
      tenantUser = fallbackResult.data;
    }

    if (!hasSystemAccess && tenantUser?.user_id) {
      await revokeAuthUserSessions(tenantUser.user_id);
    }

    const auditEntry = {
      action: hasSystemAccess ? 'access_reactivated' : 'access_deactivated',
      label: hasSystemAccess ? 'Reativou acesso ao sistema' : 'Desativou acesso ao sistema',
      actor_name: actorName,
      actor_id: req.appAuthUser.id,
      ip: clientIp,
      tenant_id: tenantId,
      collaborator_id: collaboratorId,
      target_email: tenantUser?.email || targetEmail || null,
      before: previousStatus,
      after: {
        has_system_access: hasSystemAccess,
        role: normalizeRoleValue(tenantUser?.role || tenantUser?.role_slug || previousStatus.role),
        is_active: hasSystemAccess,
      },
    };
    logCollaboratorAccessAudit(auditEntry);
    if (tenantUser?.user_id) {
      await appendAccessAuditToAuthUser(tenantUser.user_id, auditEntry);
    }

    return res.status(200).json({
      success: true,
      tenant_user: tenantUser,
      audit: auditEntry,
      sessions_revoked: !hasSystemAccess,
    });
  } catch (err) {
    console.error('[app-collaborator-access-toggle]', err);
    return res.status(400).json({
      error: normalizeDatabaseError(err, 'Falha ao atualizar bloqueio de acesso do colaborador.'),
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
      roleSlug: 'master',
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

app.post('/internal/platform/dev/reset-console-admin', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Endpoint disponível apenas em ambiente local.' });
    }
    const platformKey = normalizeText(req.headers['x-platform-key']);
    if (!PLATFORM_API_KEY || platformKey !== PLATFORM_API_KEY) {
      return res.status(401).json({ error: 'Chave de plataforma inválida.' });
    }

    const email = normalizeEmail(req.body?.email || 'admin@loveodonto.com');
    const password = normalizeText(req.body?.password || 'admin123');
    const fullName = normalizeText(req.body?.full_name || 'Admin Love Odonto');

    if (!email) return res.status(400).json({ error: 'email é obrigatório.' });
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'password deve ter pelo menos 8 caracteres.' });
    }

    const user = await ensureConsoleAdminCredentials({ email, password, fullName });
    return res.json({
      success: true,
      user,
      password,
    });
  } catch (err) {
    console.error('[reset-console-admin]', err?.message || err);
    return res.status(400).json({
      error: normalizeDatabaseError(err, 'Falha ao resetar admin da Console.'),
    });
  }
});

app.post('/internal/platform/tenants/provision', requireConsoleAccess, async (req, res) => {
  let createdTenantId = null;
  let createdAuthUserId = null;
  let createdAuthUser = false;

  try {
    const actor = req.platformActor;
    const onboarding = normalizeOnboardingPayload(req.body);
    const validationError = validateOnboardingPayload(onboarding);
    if (validationError) return res.status(400).json({ error: validationError });

    const tradeName = onboarding.tradeName;
    const legalName = onboarding.legalName;
    const responsibleName = onboarding.adminName || onboarding.legalRepresentativeName;
    const responsibleEmail = onboarding.adminEmail || onboarding.legalRepresentativeEmail;
    const responsiblePassword = onboarding.adminPassword;
    const accessEmail = onboarding.legalRepresentativeEmail || responsibleEmail;
    const city = onboarding.city;
    const status = normalizeStatus(onboarding.status || 'active') || 'active';
    const planCode = normalizePlanCode(onboarding.plan);

    if (!planCode) return res.status(400).json({ error: 'plan inválido. Use Start, Growth ou Scale.' });

    const { data: existingTenantByCnpj, error: existingTenantByCnpjError } = await supabase
      .from('tenants')
      .select('id, legal_name')
      .eq('cnpj', onboarding.cnpj)
      .maybeSingle();
    if (existingTenantByCnpjError) throw existingTenantByCnpjError;
    if (existingTenantByCnpj?.id) {
      return res.status(409).json({ error: 'Este CNPJ já está cadastrado em outra clínica.' });
    }

    const { data: existingTenantUserByEmail, error: existingTenantUserError } = await supabase
      .from('tenant_users')
      .select('id, tenant_id, user_id')
      .eq('email', accessEmail)
      .maybeSingle();
    if (existingTenantUserError) throw existingTenantUserError;
    if (existingTenantUserByEmail?.tenant_id) {
      return res.status(409).json({ error: 'Este e-mail já está vinculado a outra clínica em tenant_users.' });
    }

    const passwordWasGenerated = !responsiblePassword;

    emailAudit('iniciando provisionamento clínica', {
      accessEmail,
      passwordWasGenerated,
      hasExplicitPassword: Boolean(responsiblePassword),
    });

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        legal_name: legalName,
        trade_name: tradeName,
        cnpj: onboarding.cnpj,
        phone: onboarding.clinicPhone,
        zip_code: onboarding.zipCode,
        street: onboarding.street,
        street_number: onboarding.streetNumber,
        address_complement: onboarding.addressComplement || null,
        neighborhood: onboarding.neighborhood,
        status,
        billing_status: 'ok',
        plan_code: planCode,
        owner_name: onboarding.legalRepresentativeName,
        owner_email: onboarding.legalRepresentativeEmail,
        city,
        state: onboarding.state,
        created_by: actor?.id || null,
        updated_by: actor?.id || null,
      })
      .select('id, legal_name, trade_name, cnpj, owner_name, owner_email, city, state, status, billing_status, plan_code, created_at, updated_at')
      .single();
    if (tenantError || !tenant?.id) throw tenantError || new Error('Falha ao criar tenant.');
    createdTenantId = tenant.id;
    console.log('[Provision] tenant criado', { tenantId: createdTenantId, planCode, accessEmail });

    const accessResult = await provisionClinicOwnerAccess(supabase, {
      email: accessEmail,
      password: responsiblePassword,
      fullName: responsibleName,
      tenantId: createdTenantId,
      roleSlug: 'master',
      cpf: onboarding.legalRepresentativeCpf || onboarding.adminCpf,
      phone: onboarding.legalRepresentativePhone || onboarding.adminPhone,
      passwordWasGenerated,
    });
    const {
      authUserId,
      tenantUser,
      emailDelivery,
      setupLink: accessSetupLink,
      accessEmailSent,
    } = accessResult;
    createdAuthUserId = authUserId;
    createdAuthUser = true;
    console.log('[Provision] acesso do responsável provisionado', {
      accessEmail,
      emailDelivery,
      accessEmailSent: Boolean(accessEmailSent),
    });

    const acceptanceToken = createAcceptanceToken();

    const { error: legalProfileError } = await supabase.from('tenant_legal_profiles').insert({
      tenant_id: createdTenantId,
      legal_representative_name: onboarding.legalRepresentativeName,
      legal_representative_cpf: onboarding.legalRepresentativeCpf,
      legal_representative_email: onboarding.legalRepresentativeEmail,
      legal_representative_phone: onboarding.legalRepresentativePhone,
      legal_representative_role: onboarding.legalRepresentativeRole || null,
      billing_contact_name: onboarding.billingContactName,
      billing_contact_email: onboarding.billingContactEmail,
      billing_contact_phone: onboarding.billingContactPhone,
      billing_same_as_legal: onboarding.billingSameAsLegal,
      liability_terms_version: acceptanceToken.termsVersion,
      liability_status: 'pending',
      liability_accepted_at: null,
      liability_acceptance_token_hash: acceptanceToken.tokenHash,
      liability_acceptance_expires_at: acceptanceToken.expiresAt,
      liability_accepted_by_admin_id: null,
      liability_accepted_by_name: null,
    });
    if (legalProfileError) throw legalProfileError;

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

    let platformBillingRecord = null;
    try {
      platformBillingRecord = await platformBilling.provisionBillingForTenant({
        tenantId: createdTenantId,
        planCode,
        actorId: actor?.id || null,
        amountCents: PLAN_CONFIG[planCode].priceCents,
      });
      console.log('[Provision] cobrança SaaS criada', {
        tenantId: createdTenantId,
        subscriptionId: platformBillingRecord?.subscription?.id,
        invoiceId: platformBillingRecord?.invoice?.id,
      });
    } catch (billingErr) {
      console.warn('[Provision] falha ao criar cobrança SaaS (migração 015 aplicada?)', billingErr?.message || billingErr);
    }

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
        responsible_email: accessEmail,
        responsible_user_id: createdAuthUserId,
        cnpj: onboarding.cnpj,
        legal_representative_cpf: onboarding.legalRepresentativeCpf,
        billing_contact_email: onboarding.billingContactEmail,
        liability_terms_version: acceptanceToken.termsVersion,
        liability_status: 'pending',
        plan: planCode,
        modules: PLAN_CONFIG[planCode].modules,
      },
    });
    console.log('[Provision] audit log criado', { tenantId: createdTenantId });

    let onboardingEmail = null;
    try {
      onboardingEmail = await sendClinicOnboardingEmail(supabase, {
        tenantId: createdTenantId,
        clinicName: tenant.trade_name || tenant.legal_name,
        planLabel: PLAN_CONFIG[planCode]?.label || planCode,
        userName: responsibleName,
        email: accessEmail,
        acceptTermsToken: acceptanceToken.token,
        setupLink: accessSetupLink,
        skipSetupLink: Boolean(accessEmailSent),
        accessEmailDelivery: emailDelivery,
      });
      onboardingEmail = {
        ...onboardingEmail,
        accessEmailDelivery: emailDelivery,
        accessEmailSent: Boolean(accessEmailSent) || Boolean(onboardingEmail?.sent),
      };
      if (onboardingEmail.accessEmailSent || onboardingEmail.sent) {
        await supabase
          .from('tenant_legal_profiles')
          .update({ onboarding_email_sent_at: new Date().toISOString() })
          .eq('tenant_id', createdTenantId);
      }
      if (onboardingEmail.accessEmailSent && emailDelivery === 'supabase_auth') {
        console.log('[Provision] e-mail de primeiro acesso enviado via Supabase Auth', { accessEmail });
      } else if (onboardingEmail.sent) {
        console.log('[Provision] e-mail de onboarding enviado', { accessEmail, provider: onboardingEmail.provider });
      } else {
        emailAudit('provisionamento sem e-mail entregue', {
          accessEmail,
          emailDelivery,
          reason: onboardingEmail.reason,
          setupLink: onboardingEmail.setupLink || accessSetupLink || null,
        });
      }
    } catch (emailErr) {
      console.warn('[Provision] falha ao enviar e-mail de onboarding', emailErr?.message || emailErr);
      onboardingEmail = {
        sent: false,
        accessEmailDelivery: emailDelivery,
        accessEmailSent: Boolean(accessEmailSent),
        reason: emailErr?.message || 'Falha ao enviar e-mail de onboarding.',
      };
    }

    return res.status(201).json({
      tenant,
      tenantUser,
      responsibleUser: {
        id: createdAuthUserId,
        email: accessEmail,
        full_name: responsibleName,
      },
      subscription,
      platformBilling: platformBillingRecord,
      tenantModules: tenantModules || [],
      onboarding_email: onboardingEmail,
      accessEmailDelivery: emailDelivery,
      access_email_sent: Boolean(accessEmailSent),
      access_setup_link: accessSetupLink || onboardingEmail?.setupLink || null,
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

app.post('/internal/platform/tenants/:tenantId/resend-access', requireConsoleAccess, async (req, res) => {
  try {
    const tenantId = normalizeText(req.params?.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenantId é obrigatório.' });

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, trade_name, legal_name, owner_email')
      .eq('id', tenantId)
      .maybeSingle();
    if (tenantError) throw tenantError;
    if (!tenant?.id) return res.status(404).json({ error: 'Clínica não encontrada.' });

    const { data: legalProfile, error: legalError } = await supabase
      .from('tenant_legal_profiles')
      .select('legal_representative_name, legal_representative_email')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (legalError) throw legalError;

    const accessEmail = normalizeEmail(
      legalProfile?.legal_representative_email || tenant.owner_email || req.body?.email,
    );
    if (!accessEmail) {
      return res.status(400).json({ error: 'E-mail de acesso não encontrado para esta clínica.' });
    }

    const fullName = normalizeText(
      legalProfile?.legal_representative_name || tenant.trade_name || tenant.legal_name,
    );

    const result = await resendClinicOwnerAccess(supabase, {
      tenantId,
      email: accessEmail,
      fullName,
      roleSlug: 'master',
    });

    if (result.accessEmailSent || result.sent) {
      await supabase
        .from('tenant_legal_profiles')
        .update({ onboarding_email_sent_at: new Date().toISOString() })
        .eq('tenant_id', tenantId);
    }

    await insertAuditLog({
      actor: req.platformActor,
      action: 'tenant.access.resent',
      targetType: 'tenant',
      targetId: tenantId,
      tenantId,
      metadata: {
        access_email: accessEmail,
        email_delivery: result.emailDelivery,
        sent: Boolean(result.sent),
      },
    });

    return res.status(200).json({
      success: true,
      accessEmail,
      ...result,
    });
  } catch (err) {
    console.error('[resend-access]', err?.message || err);
    return res.status(400).json({
      error: normalizeDatabaseError(err, 'Falha ao reenviar acesso da clínica.'),
    });
  }
});

app.get('/internal/platform/billing/overview', requireConsoleAccess, async (req, res) => {
  try {
    const overview = await platformBilling.getBillingOverview();
    return res.status(200).json(formatBillingOverviewResponse(overview));
  } catch (err) {
    console.error('[billing/overview]', err);
    return res.status(400).json({
      ok: false,
      error: normalizeDatabaseError(err, 'Falha ao carregar visão geral de cobrança.'),
    });
  }
});

app.get('/internal/platform/tenants/:tenantId/billing', requireConsoleAccess, async (req, res) => {
  try {
    const tenantId = normalizeText(req.params?.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenantId é obrigatório.' });
    const detail = await platformBilling.getTenantBilling(tenantId);
    if (!detail) return res.status(404).json({ error: 'Clínica não encontrada.' });
    return res.status(200).json(detail);
  } catch (err) {
    console.error('[billing/tenant]', err);
    return res.status(400).json({
      error: normalizeDatabaseError(err, 'Falha ao carregar cobrança da clínica.'),
    });
  }
});

app.post('/internal/platform/tenants/:tenantId/invoices/:invoiceId/mark-paid', requireConsoleAccess, async (req, res) => {
  try {
    const tenantId = normalizeText(req.params?.tenantId);
    const invoiceId = normalizeText(req.params?.invoiceId);
    if (!tenantId || !invoiceId) {
      return res.status(400).json({ error: 'tenantId e invoiceId são obrigatórios.' });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const amountCents = body.amountCents != null ? Number(body.amountCents) : undefined;
    const result = await platformBilling.markInvoicePaid({
      tenantId,
      invoiceId,
      actor: req.platformActor,
      amountCents,
      paidAt: body.paidAt || body.data_pagamento || null,
      paymentMethod: normalizeText(body.paymentMethod || body.metodo || ''),
      notes: normalizeText(body.notes || body.observacao || ''),
      nextDueRule: normalizeText(body.nextDueRule || 'from_payment') === 'from_previous_due'
        ? 'from_previous_due'
        : 'from_payment',
    });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[billing/mark-paid]', err);
    return res.status(400).json({
      error: normalizeDatabaseError(err, 'Falha ao registrar pagamento.'),
    });
  }
});

app.post('/internal/platform/tenants/:tenantId/block-for-billing', requireConsoleAccess, async (req, res) => {
  try {
    const tenantId = normalizeText(req.params?.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenantId é obrigatório.' });
    const reason = normalizeText(req.body?.reason) || 'atraso_financeiro';
    const tenant = await platformBilling.blockTenantForBilling({
      tenantId,
      actor: req.platformActor,
      reason,
    });
    return res.status(200).json({ success: true, tenant });
  } catch (err) {
    console.error('[billing/block]', err);
    return res.status(400).json({
      error: normalizeDatabaseError(err, 'Falha ao bloquear clínica por cobrança.'),
    });
  }
});

app.post('/internal/platform/tenants/:tenantId/unblock', requireConsoleAccess, async (req, res) => {
  try {
    const tenantId = normalizeText(req.params?.tenantId);
    if (!tenantId) return res.status(400).json({ error: 'tenantId é obrigatório.' });
    const tenant = await platformBilling.unblockTenant({
      tenantId,
      actor: req.platformActor,
    });
    return res.status(200).json({ success: true, tenant });
  } catch (err) {
    console.error('[billing/unblock]', err);
    return res.status(400).json({
      error: normalizeDatabaseError(err, 'Falha ao desbloquear clínica.'),
    });
  }
});

app.patch('/internal/platform/tenants/:tenantId/invoices/:invoiceId/due-date', requireConsoleAccess, async (req, res) => {
  try {
    const tenantId = normalizeText(req.params?.tenantId);
    const invoiceId = normalizeText(req.params?.invoiceId);
    const dueDate = req.body?.dueDate || req.body?.due_date;
    if (!tenantId || !invoiceId || !dueDate) {
      return res.status(400).json({ error: 'tenantId, invoiceId e dueDate são obrigatórios.' });
    }
    const invoice = await platformBilling.updateInvoiceDueDate({
      tenantId,
      invoiceId,
      dueDate,
      actor: req.platformActor,
    });
    return res.status(200).json({ success: true, invoice });
  } catch (err) {
    console.error('[billing/due-date]', err);
    return res.status(400).json({ error: normalizeDatabaseError(err, 'Falha ao alterar vencimento.') });
  }
});

app.patch('/internal/platform/tenants/:tenantId/subscription/plan', requireConsoleAccess, async (req, res) => {
  try {
    const tenantId = normalizeText(req.params?.tenantId);
    const planCode = normalizeText(req.body?.planCode || req.body?.plan);
    if (!tenantId || !planCode) {
      return res.status(400).json({ error: 'tenantId e planCode são obrigatórios.' });
    }
    const result = await platformBilling.updateSubscriptionPlan({
      tenantId,
      planCode,
      actor: req.platformActor,
    });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[billing/plan]', err);
    return res.status(400).json({ error: normalizeDatabaseError(err, 'Falha ao alterar plano.') });
  }
});

app.post('/internal/platform/tenants/:tenantId/invoices/:invoiceId/discount', requireConsoleAccess, async (req, res) => {
  try {
    const tenantId = normalizeText(req.params?.tenantId);
    const invoiceId = normalizeText(req.params?.invoiceId);
    const discountCents = Number(req.body?.discountCents ?? req.body?.discount_cents ?? 0);
    if (!tenantId || !invoiceId) {
      return res.status(400).json({ error: 'tenantId e invoiceId são obrigatórios.' });
    }
    const invoice = await platformBilling.applyInvoiceDiscount({
      tenantId,
      invoiceId,
      discountCents,
      notes: normalizeText(req.body?.notes || ''),
      actor: req.platformActor,
    });
    return res.status(200).json({ success: true, invoice });
  } catch (err) {
    console.error('[billing/discount]', err);
    return res.status(400).json({ error: normalizeDatabaseError(err, 'Falha ao aplicar desconto.') });
  }
});

app.post('/internal/platform/billing/evaluate', requireConsoleAccess, async (req, res) => {
  try {
    const result = await platformBilling.evaluateBillingStatus({
      actorId: req.platformActor?.id || null,
    });
    return res.status(200).json({
      ok: true,
      evaluated: true,
      summary: {
        evaluated: result.evaluated ?? 0,
        updated: result.updated ?? 0,
        alertsCreated: result.alertsCreated ?? 0,
        asOf: result.asOf ?? null,
        skipped: Boolean(result.skipped),
      },
    });
  } catch (err) {
    console.error('[billing/evaluate]', err);
    return res.status(400).json({
      ok: false,
      error: normalizeDatabaseError(err, 'Falha ao avaliar status de cobrança.'),
    });
  }
});

app.get('/public/platform/onboarding/terms', async (req, res) => {
  try {
    const token = normalizeText(req.query?.token);
    if (!token) return res.status(400).json({ error: 'Token é obrigatório.' });
    const profile = await findLegalProfileByToken(supabase, token);
    const preview = buildTermsPreview(profile);
    if (!preview) return res.status(404).json({ error: 'Link de aceite inválido ou expirado.' });
    return res.status(200).json(preview);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'Falha ao carregar contrato.' });
  }
});

app.post('/public/platform/onboarding/accept-terms', async (req, res) => {
  try {
    const token = normalizeText(req.body?.token);
    if (!token) return res.status(400).json({ error: 'Token é obrigatório.' });
    const result = await acceptTermsByToken(supabase, token);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'Falha ao registrar aceite.' });
  }
});

/** Espelha contrato gerado (IndexedDB → Postgres) quando a migration 006 existir. */
app.post('/internal/app/contracts/generated', requireAppUser, async (req, res) => {
  try {
    const authUserId = req.appAuthUser.id;
    const { data: tenantUser, error: tenantUserError } = await supabase
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', authUserId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (tenantUserError) throw tenantUserError;
    if (!tenantUser?.tenant_id) {
      return res.status(404).json({ error: 'Tenant não encontrado para o usuário autenticado.' });
    }
    const tenantId = tenantUser.tenant_id;
    const rec = req.body?.record || {};
    const id = normalizeText(rec.id);
    if (!id) return res.status(400).json({ error: 'record.id é obrigatório.' });

    const row = {
      id,
      tenant_id: tenantId,
      patient_id: normalizeText(rec.patientId),
      quote_id: normalizeText(rec.quoteId),
      quote_source: normalizeText(rec.quoteSource),
      template_id: normalizeText(rec.templateId) || null,
      template_version: Number(rec.templateVersion) || 1,
      contract_number: normalizeText(rec.contractNumber) || null,
      final_content: String(rec.finalContent ?? ''),
      rendered_html: String(rec.renderedHtml ?? ''),
      pdf_url: rec.pdfUrl ? String(rec.pdfUrl) : null,
      status: normalizeText(rec.status) || 'draft',
      generated_by: authUserId,
      generated_at: rec.generatedAt || new Date().toISOString(),
      canceled_at: rec.canceledAt || null,
      signed_at: rec.signedAt || null,
      metadata: rec.metadata && typeof rec.metadata === 'object' ? rec.metadata : {},
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('generated_contracts').upsert(row, { onConflict: 'id' });
    if (error) {
      const msg = normalizeDatabaseError(error, '');
      const lower = msg.toLowerCase();
      if (lower.includes('generated_contracts') && (lower.includes('does not exist') || lower.includes('not exist'))) {
        return res.status(501).json({
          error:
            'Tabela generated_contracts ausente. Aplique a migration supabase/migrations/006_app_contracts.sql no projeto Supabase do backend.',
        });
      }
      throw error;
    }
    return res.json({ ok: true, id });
  } catch (err) {
    console.error('[contracts-generated]', err);
    return res.status(400).json({ error: normalizeDatabaseError(err, 'Falha ao sincronizar contrato.') });
  }
});

/** Webhook de plataformas de assinatura eletrônica (Clicksign, DocuSign, ZapSign, etc.) */
app.post('/api/signature/webhook', (req, res) => {
  try {
    const secret = process.env.SIGNATURE_WEBHOOK_SECRET || '';
    const headerSecret = req.headers['x-signature-secret'] || req.headers['x-webhook-secret'] || '';
    if (secret && headerSecret !== secret) {
      return res.status(401).json({ error: 'Webhook não autorizado.' });
    }

    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const event = payload.event || payload.type || 'unknown';
    const externalId = payload.externalId || payload.document_id || payload.data?.id || null;

    if (process.env.NODE_ENV !== 'production') {
      console.log('[signature-webhook]', { event, externalId, contractId: payload.contractId });
    }

    return res.status(200).json({
      ok: true,
      received: true,
      event,
      externalId,
      message: 'Evento recebido. O app sincronizará o status via polling ou push interno.',
    });
  } catch (err) {
    console.error('[signature-webhook]', err);
    return res.status(400).json({ error: err?.message || 'Payload inválido.' });
  }
});

async function sendPasswordResetFlow({
  actorAuthUserId,
  tenantId,
  email,
  collaboratorId,
  fullName,
  actor = {},
}) {
  const targetEmail = normalizeEmail(email);
  const clientIp = actor.ip || null;
  const actorName = actor.name || actor.email || 'Administrador';

  const { data: tenantUser, error: tenantUserError } = await supabase
    .from('tenant_users')
    .select('id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug, invitation_status')
    .eq('tenant_id', tenantId)
    .eq('email', targetEmail)
    .maybeSingle();
  if (tenantUserError) throw tenantUserError;

  if (!tenantUser?.id) {
    if (!collaboratorId) {
      throw new Error('Salve o acesso do colaborador antes de redefinir a senha.');
    }
    const provisioned = await provisionCollaboratorAccess({
      actorAuthUserId,
      tenantId,
      collaboratorId,
      collaboratorFullName: fullName || targetEmail,
      email: targetEmail,
      profileRole: 'atendimento',
      sendInvite: true,
      repairStaleAuth: true,
      requestedAction: 'provision',
    });
    const formatted = formatCollaboratorProvisionResponse(provisioned);
    return { message: formatted.message, auth_recreated: true, email_sent: formatted.emailSent };
  }

  await clearStaleTenantUserAuthReference(tenantId, targetEmail);

  let authUserId = await getValidAuthUserId(tenantUser.user_id);
  let authRecreated = false;
  if (!authUserId) authUserId = (await findAuthUserByEmail(targetEmail))?.id || null;
  if (!authUserId) {
    const role = normalizeRoleValue(tenantUser.role || tenantUser.role_slug || 'atendimento');
    const recreated = await createAuthUserForCollaboratorInvite({
      normalizedEmail: targetEmail,
      tenantId,
      role,
      collaboratorId: collaboratorId || tenantUser.collaborator_id,
      collaboratorFullName: tenantUser.full_name || targetEmail,
    });
    authUserId = recreated?.id || null;
    authRecreated = Boolean(authUserId);
    if (authUserId && authUserId !== tenantUser.user_id) {
      const safeUserId = assertAuthUserIdForTenantWrite(authUserId, {
        email: targetEmail,
        tenantId,
        tenantUserId: tenantUser.id,
        phase: 'password_reset_relink',
      });
      await supabase.from('tenant_users').update({ user_id: safeUserId }).eq('id', tenantUser.id);
      identityLog('tenant_user atualizado', { tenantUserId: tenantUser.id, userId: safeUserId });
    }
  }

  assertAuthUserIdForTenantWrite(authUserId, {
    email: targetEmail,
    tenantId,
    phase: 'password_reset',
  });

  if (authRecreated) {
    const role = normalizeRoleValue(tenantUser.role || tenantUser.role_slug || 'atendimento');
    const inviteDelivery = await sendCollaboratorInvite({
      email: targetEmail,
      tenantId,
      role,
      collaboratorId: collaboratorId || tenantUser.collaborator_id,
      collaboratorName: tenantUser.full_name,
      userName: tenantUser.full_name || targetEmail,
      profileRole: role,
    });
    return {
      message: 'Encontramos um problema na conta. Ela foi recriada automaticamente. Um novo convite foi enviado.',
      auth_recreated: true,
      email_sent: isInviteEmailDelivered(inviteDelivery),
    };
  }

  const invStatus = normalizeInvitationStatus(tenantUser.invitation_status || 'none');
  if (['sent', 'pending', 'expired'].includes(invStatus)) {
    const provisioned = await provisionCollaboratorAccess({
      actorAuthUserId,
      tenantId,
      collaboratorId: collaboratorId || tenantUser.collaborator_id || '',
      collaboratorFullName: tenantUser.full_name || targetEmail,
      email: targetEmail,
      profileRole: tenantUser.role || tenantUser.role_slug || 'atendimento',
      sendInvite: true,
      repairStaleAuth: true,
      requestedAction: 'resend',
    });
    const formatted = formatCollaboratorProvisionResponse(provisioned, { requestedAction: 'resend' });
    return {
      message: 'O colaborador ainda não concluiu o primeiro acesso. Reenviamos o convite por e-mail.',
      invite_resent: true,
      email_sent: formatted.emailSent,
    };
  }

  const resetDelivery = await sendPasswordResetEmail(supabase, {
    email: targetEmail,
    userName: tenantUser.full_name || targetEmail,
    redirectTo: getPasswordResetRedirectTo(),
    tenantId,
    collaboratorId: collaboratorId || tenantUser.collaborator_id || null,
  });

  return {
    message: `Link de redefinição enviado para: ${targetEmail}`,
    email_sent: Boolean(resetDelivery?.emailSent),
    auth_user_id: authUserId,
  };
}

async function setCollaboratorAccessState({
  collaboratorId,
  tenantId,
  email,
  fullName,
  tenantUserId,
  hasSystemAccess,
  actorAuthUserId,
}) {
  let existingTenantUser = await resolveTenantUserForCollaboratorAccess({
    actorAuthUserId,
    tenantId,
    collaboratorId,
    email,
    fullName,
  });

  if (!existingTenantUser?.id && tenantUserId) {
    const { data: byId } = await supabase
      .from('tenant_users')
      .select('id, tenant_id, collaborator_id, user_id, full_name, email, role, role_slug, is_active, status, has_system_access, invitation_status, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .eq('id', tenantUserId)
      .maybeSingle();
    existingTenantUser = byId || null;
  }

  if (!existingTenantUser?.id) {
    throw new Error('Usuário de acesso não encontrado para esta clínica.');
  }

  const updatePayload = {
    has_system_access: hasSystemAccess,
    is_active: hasSystemAccess,
    status: hasSystemAccess ? 'active' : 'inactive',
  };

  let tenantUser;
  try {
    const result = await supabase
      .from('tenant_users')
      .update(updatePayload)
      .eq('id', existingTenantUser.id)
      .eq('tenant_id', tenantId)
      .select(TENANT_USER_SELECT_WITH_ACCESS)
      .single();
    if (result.error) throw result.error;
    tenantUser = result.data;
  } catch (error) {
    if (!isMissingHasSystemAccessColumnError(error)) throw error;
    const fallbackResult = await supabase
      .from('tenant_users')
      .update(omitHasSystemAccess(updatePayload))
      .eq('id', existingTenantUser.id)
      .eq('tenant_id', tenantId)
      .select(TENANT_USER_SELECT_BASE)
      .single();
    if (fallbackResult.error) throw fallbackResult.error;
    tenantUser = fallbackResult.data;
  }

  if (!hasSystemAccess && tenantUser?.user_id) {
    await revokeAuthUserSessions(tenantUser.user_id);
  }

  return tenantUser;
}

identityService = createIdentityService({
  supabase,
  provisionCollaboratorAccess,
  clearStaleTenantUserAuthReference,
  findAuthUserByEmail,
  getValidAuthUserId,
  revokeAuthUserSessions,
  normalizeEmail,
  normalizeRoleValue,
  maskEmail,
  isInviteEmailDelivered,
  formatCollaboratorProvisionResponse,
  sendPasswordResetFlow,
  setCollaboratorAccessState,
});

app.use('/internal/app', identityRoutes({
  identityService,
  requireAppUser,
  getTenantAdminActorOrThrow,
  resolveClientIp,
  normalizeText,
  normalizeEmail,
}));

/** Rotas internas desconhecidas — sempre JSON (evita HTML no frontend). */
app.use('/internal/app', (req, res) => {
  res.status(404).json({
    ok: false,
    error: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
    message: 'Admin API desatualizada ou rota inexistente. Reinicie o backend (npm run dev:stack).',
    hint: 'Reinicie a Admin API local: pare o processo na porta 3001 e rode npm run dev:stack.',
  });
});

app.use('/internal/platform', (req, res) => {
  res.status(404).json({
    ok: false,
    error: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
    hint: 'Reinicie a Admin API local com npm run server:restart se a rota foi adicionada recentemente.',
  });
});

const httpServer = app.listen(PORT, () => {
  const emailCfg = getEmailConfig();
  console.log(`[SaaS Admin API] rodando na porta ${PORT}`);
  console.log(`[SaaS Admin API] e-mail transacional: ${emailCfg.isConfigured ? `sim (${emailCfg.provider})` : 'NÃO — convites usam SMTP Supabase (entrega limitada)'}`);
  if (!emailCfg.isConfigured) {
    console.warn('[SaaS Admin API] Configure EMAIL_API_KEY e EMAIL_FROM_ADDRESS no Railway para entrega confiável.');
    if (!hasSupabaseAuthPublicClient()) {
      console.warn(
        '[SaaS Admin API] SUPABASE_ANON_KEY ausente — convites usam SMTP Supabase via resetPasswordForEmail/invite, '
        + 'mas exigem a anon key do mesmo projeto (VITE_SUPABASE_APP_ANON_KEY na raiz).',
      );
    }
  }

  if (process.env.IDENTITY_HEALTH_ON_STARTUP === '1') {
    console.log('[IDENTITY_AUDIT] Health check disponível via POST /internal/app/identity-health/evaluate');
  }
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
