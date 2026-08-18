/**
 * Backend SaaS local: integraÃ§Ã£o obrigatÃ³ria entre Console (5177) e App (5176).
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
import { getInviteRedirectTo as resolveInviteRedirectTo, getEmailTransportInventory } from './email/emailConfig.js';
import { getPublicSmtpVerifyHealth, scheduleSmtpVerifyOnStartup } from './email/smtpVerifyCache.js';
import { getPasswordResetRedirectTo } from './email/emailConfig.js';
import { logAccessEmailAudit } from './email/accessEmailAudit.js';
import { createIdentityService } from './identity/IdentityService.js';
import { isMissingIdentitiesTableError } from './identity/identityRepository.js';
import identityRoutes from './identity/routes.js';
import { hasSupabaseAuthPublicClient } from './email/supabasePublicClient.js';
import {
  resolveClinicProfileForTenant,
  upsertClinicProfileForTenant,
} from './clinicProfileResolver.js';
import {
  assertAuthUserIdForTenantWrite,
  isIdentityProvisionError,
} from './identity/identityProvisionErrors.js';
import { identityLog } from './identity/identityProvisionLog.js';
import {
  lookupAuthUserByEmail,
  requireAuthUserId,
} from './identity/identityAuthResolver.js';
import { createAppRouteContexts } from './core/middleware/appRouteContexts.js';
import { PERMISSIONS_ADMIN_FORBIDDEN_MESSAGE } from './lib/collaboratorsPermissionsApi.js';
import { createCollaboratorsListHandler } from './lib/collaboratorsApiList.js';
import { createAppointmentsListHandler } from './lib/appointmentsApiList.js';
import {
  createAppointmentCancelHandler,
  createAppointmentCreateHandler,
  createAppointmentUpdateHandler,
} from './lib/appointmentsApiWrite.js';
import {
  createFinancingsListHandler,
  createPayablesListHandler,
  createReceivablesListHandler,
} from './lib/financialApiList.js';
import {
  createCrmKanbanCardGetHandler,
  createCrmKanbanCardsListHandler,
  createCrmLeadGetHandler,
  createCrmLeadsListHandler,
  createCrmPipelineStageGetHandler,
  createCrmPipelineStagesListHandler,
} from './lib/crmApiList.js';
import {
  createCrmLeadCreateHandler,
  createCrmLeadMoveStageHandler,
  createCrmLeadUpdateHandler,
  createCrmPipelineStageCreateHandler,
  createCrmPipelineStageDeleteHandler,
  createCrmPipelineStageUpdateHandler,
} from './lib/crmApiWrite.js';
import {
  createFinancingCreateHandler,
  createFinancingUpdateHandler,
  createPayableCreateHandler,
  createPayableDeleteHandler,
  createPayableUpdateHandler,
  createReceivableCreateHandler,
  createReceivableUpdateHandler,
} from './lib/financialApiWrite.js';
import { createCollaboratorPermissionsHandler } from './lib/collaboratorsPermissionsApi.js';
import { createCollaboratorApplyRoleTemplateHandler } from './lib/collaboratorsApplyRoleTemplateApi.js';
import { createCollaboratorPutPermissionsHandler } from './lib/collaboratorsPutPermissionsApi.js';
import { createAssetsLogoHandler } from './lib/assetsLogoApi.js';
import {
  createAssetsAvatarGetHandler,
  createAssetsAvatarPostHandler,
} from './lib/assetsAvatarApi.js';
import {
  createDebugUserContextHandler,
} from './lib/debugUserContextApi.js';
import { normalizeRoleValue, isTenantAdminRole } from './core/rbac/roles.js';
import {
  getTenantAdminActorOrThrow as resolveTenantAdminActorOrThrow,
} from './lib/tenantAdminActor.js';
import { createTenantContextHandler } from './lib/tenantContextApi.js';
import { createClinicProfileHandler } from './lib/clinicProfileApi.js';
import { createUsersListHandler } from './lib/usersListApi.js';
import { createCollaboratorsAccessAuditHandler } from './lib/collaboratorsAccessAuditApi.js';
import { createInvitationsReconcileHandler } from './lib/invitationsReconcileApi.js';
import { createCollaboratorLinkHandler } from './lib/collaboratorLinkApi.js';
import { createCollaboratorProvisionAccessHandler } from './lib/collaboratorProvisionAccessApi.js';
import { createInvitationsResendHandler } from './lib/invitationsResendApi.js';
import { createUsersPasswordResetHandler } from './lib/usersPasswordResetApi.js';
import { createCollaboratorsAccessBundleHandler } from './lib/collaboratorsAccessBundleApi.js';
import { createUsersCreateHandler } from './lib/usersCreateApi.js';
import { createUsersPatchAccessHandler } from './lib/usersPatchAccessApi.js';
import { createUsersDeleteHandler } from './lib/usersDeleteApi.js';
import { createCollaboratorAccessToggleHandler } from './lib/collaboratorAccessToggleApi.js';
import { createContractsGeneratedHandler } from './lib/contractsGeneratedApi.js';
import { createContractsSignatureInviteEmailHandler } from './lib/contractsSignatureEmailApi.js';
import { createSigningClientContextHandler } from './lib/signingClientContextApi.js';
import { createContractsOperationalRolloutHandlers } from './lib/contractsOperationalRolloutApi.js';
import { createContractTemplatesV2Handlers } from './lib/contractTemplatesV2Api.js';
import { createContractsV2Handlers } from './lib/contractsV2Api.js';
import { createSignatureEnvelopesV2Handlers } from './lib/signatureEnvelopesV2Api.js';
import { createPublicSignaturesV2Handlers } from './lib/publicSignaturesV2Api.js';
import { createPublicSignaturesV2CorsMiddleware } from './lib/contractsV2PublicSecurity.js';
import { createContractsV2RuntimeReadinessHandlers } from './lib/contractsV2RuntimeReadinessApi.js';
import {
  resolveContractsV2PrivateStorageBinding,
  toPublicStorageBindingPayload,
} from './lib/contractsV2PrivateStorageBinding.js';
import { createContractDocumentsV2Handlers } from './lib/contractDocumentsV2Api.js';
import { createContractSigningCompletionV2Handlers } from './lib/contractSigningCompletionV2Api.js';
import { createCreateTenantUserFromApp } from './lib/createTenantUserFromApp.js';
import { createResolveTenantUserForCollaboratorAccess } from './lib/resolveTenantUserForCollaboratorAccess.js';
import { createSetCollaboratorAccessState } from './lib/setCollaboratorAccessState.js';
import { createProvisioningDependencies } from './lib/provisioning/provisioningBundle.js';
import { createMembershipDependencies } from './lib/membership/membershipBundle.js';
import { createPlatformDependencies } from './lib/platform/platformBundle.js';
import { isInviteEmailDelivered } from './lib/inviteDeliveryUtils.js';
import { isAuthUserAlreadyRegisteredError } from './lib/authUserRegisteredUtils.js';
import { createRevokeAuthUserSessions } from './lib/revokeAuthUserSessions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

/**
 * 1) `server/.env` â€” valores base.
 * 2) `console/.env` e `console/.env.local` â€” fallback dev (VITE_CONSOLE_SUPABASE_ANON_KEY etc.).
 * 3) `.env` e `.env.local` na **raiz do repositÃ³rio** com `override: true` â€” um Ãºnico sÃ­tio para
 *    `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` alinhados com a Console (5177) e o app (5176).
 * VariÃ¡veis de ambiente do sistema continuam a ser sobrescritas pelo Ãºltimo ficheiro carregado.
 */
dotenv.config({ path: path.join(__dirname, '.env') });
// Fallback dev: mesmas chaves VITE_CONSOLE_* que o Vite usa (console/.env) — raiz prevalece depois.
dotenv.config({ path: path.join(repoRoot, 'console', '.env'), override: false });
dotenv.config({ path: path.join(repoRoot, 'console', '.env.local'), override: false });
dotenv.config({ path: path.join(repoRoot, '.env'), override: true });
dotenv.config({ path: path.join(repoRoot, '.env.local'), override: true });
/** PHASE_10.21X — staging browser isolation: `.env.staging.local` prevalece e fail-closed em production. */
dotenv.config({ path: path.join(repoRoot, '.env.staging.local'), override: true });

function stagingTestModeActive() {
  const v = (k) => String(process.env[k] || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(v('LOVE_ODONTO_STAGING_TEST_MODE'))
    || ['1', 'true', 'yes', 'on'].includes(v('STAGING_TEST_MODE'))
    || ['1', 'true', 'yes', 'on'].includes(v('VITE_STAGING_TEST_MODE'));
}

if (stagingTestModeActive()) {
  const STAGING_REF = 'tckdjyunwmdpqmewrwvt';
  const PRODUCTION_REF = 'uoepkwhqztmsjnzirpev';
  const url = String(process.env.SUPABASE_URL || '').trim();
  let ref = '';
  try {
    ref = new URL(url).hostname.split('.')[0] || '';
  } catch {
    ref = '';
  }
  if (!url || url.includes(PRODUCTION_REF) || ref === PRODUCTION_REF) {
    console.error('[SaaS Admin API] HARD STOP STAGING_TEST_MODE: SUPABASE_URL aponta para PRODUCTION ou está vazio.');
    process.exit(2);
  }
  if (ref !== STAGING_REF) {
    console.error(`[SaaS Admin API] HARD STOP STAGING_TEST_MODE: esperado ${STAGING_REF}, obtido "${ref}".`);
    process.exit(2);
  }
  process.env.CONTRACTS_V2_DELIVERY_MODE = 'disabled';
  console.log('[SaaS Admin API] STAGING_TEST_MODE ativo — project', STAGING_REF, '— delivery disabled');
}

console.log(
  '[SaaS Admin API] env: server/.env → console/.env → raiz .env/.env.local → .env.staging.local (se presente).',
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

/** Health check leve (sem Supabase) â€” usado pelo script `npm run console:stack` para saber quando a API estÃ¡ escutando. */
app.get('/health', (_req, res) => {
  const contractsV2Storage = toPublicStorageBindingPayload(
    resolveContractsV2PrivateStorageBinding(process.env),
  );
  const inventory = getEmailTransportInventory();
  const smtpVerify = getPublicSmtpVerifyHealth();
  res.status(200).json({
    ok: true,
    service: 'saas-admin-api',
    version: '2026-06-26-identity-unified',
    build: { identityModule: true },
    features: {
      identityService: true,
      supabaseAuthPublicClient: Boolean(process.env.SUPABASE_ANON_KEY),
      authEmailConfigured: inventory.authEmailConfigured,
      authEmailTransport: 'supabase_auth_smtp',
      directSmtpConfigured: inventory.directSmtpConfigured,
      directSmtpProvider: inventory.directSmtpProvider,
      directSmtpVerified: smtpVerify.directSmtpVerified,
      directSmtpVerifyCode: smtpVerify.directSmtpVerifyCode,
      resendConfigured: inventory.resendConfigured,
      emailTransactionalConfigured: inventory.transactionalConfigured,
      emailTransactionalProvider: inventory.transactionalProvider,
    },
    smtp: {
      configured: smtpVerify.directSmtpConfigured,
      verified: smtpVerify.directSmtpVerified,
      verifyCode: smtpVerify.directSmtpVerifyCode,
      verifyErrorCode: smtpVerify.directSmtpVerifyErrorCode,
      verifyResponseCode: smtpVerify.directSmtpVerifyResponseCode,
      verifyCommand: smtpVerify.directSmtpVerifyCommand,
      host: smtpVerify.directSmtpHost,
      port: smtpVerify.directSmtpPort,
      secure: smtpVerify.directSmtpSecure,
      alternatePort: smtpVerify.directSmtpAlternatePort,
      alternateVerified: smtpVerify.directSmtpAlternateVerified,
      alternateVerifyCode: smtpVerify.directSmtpAlternateVerifyCode,
    },
    contractsV2Storage,
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
    throw new Error('Admin API: SUPABASE_SERVICE_ROLE_KEY estÃ¡ vazia.');
  }
  if (raw.startsWith('sb_publishable_')) {
    throw new Error(
      'Admin API: SUPABASE_SERVICE_ROLE_KEY estÃ¡ com uma chave publishable (sb_publishable_), nÃ£o service_role. '
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
      'Admin API: nÃ£o foi possÃ­vel validar SUPABASE_SERVICE_ROLE_KEY como service_role. '
      + 'Use a service_role key ou uma server secret key do mesmo projeto Supabase da Console e do app.',
    );
  }
  if (role !== 'service_role') {
    throw new Error(
      'Admin API: SUPABASE_SERVICE_ROLE_KEY nÃ£o Ã© uma service role key vÃ¡lida. '
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
      'A coluna tenant_users.has_system_access nÃ£o existe no banco atual. '
      + 'Aplique a migration `005_app_collaborator_access_invites.sql` no mesmo projeto Supabase do backend.'
    );
  }
  if (lower.includes('stack depth limit exceeded')) {
    return (
      'O banco retornou "stack depth limit exceeded". '
      + 'Isso normalmente indica que o backend NÃƒO estÃ¡ usando a service role key correta '
      + 'e entrou em recursÃ£o de RLS no Supabase. Verifique SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  if (
    lower.includes('collaborator_id')
    && lower.includes('tenant_users')
    && lower.includes('schema cache')
  ) {
    return (
      'Migration pendente: a coluna tenant_users.collaborator_id nÃ£o existe no banco atual. '
      + 'Aplique a migration `005_app_collaborator_access_invites.sql` no mesmo projeto Supabase do backend.'
    );
  }
  if (lower.includes('tenant_users_user_id_required')) {
    return (
      'NÃ£o foi possÃ­vel vincular o e-mail: a conta no Auth ainda nÃ£o existe. '
      + 'Se vocÃª apagou o usuÃ¡rio manualmente no Supabase, tente convidar novamente â€” o sistema criarÃ¡ a conta antes do vÃ­nculo.'
    );
  }
  return raw || fallbackMessage;
}

/** SÃ³ para diagnÃ³stico local: compara host da Console em `console/.env` com `server/.env` (sem expor segredos). */
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
  /** Ãšltimo ganha; inclui raiz do repo (onde o Vite da Console tambÃ©m lÃª). */
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
    '[Admin API] AVISO: projeto Supabase da Console â‰  SUPABASE_URL do backend â€” login JWT falha (kid).\n'
    + `  console (VITE_CONSOLE_SUPABASE_URL host): ${consoleHost}\n`
    + `  backend (SUPABASE_URL host):              ${serverHost}\n`
    + '  AÃ§Ã£o: copie o MESMO URL e service_role para `.env` na RAIZ do repo (prevalece sobre server/.env) ou edite server/.env. '
    + 'Supabase â†’ Settings â†’ API. Reinicie o backend.\n',
  );
}

console.log('[SaaS Admin API] SUPABASE_URL loaded', Boolean(SUPABASE_URL));
if (SUPABASE_URL) {
  try {
    console.log('[SaaS Admin API] SUPABASE_URL host', new URL(SUPABASE_URL).hostname);
  } catch {
    console.log('[SaaS Admin API] SUPABASE_URL nÃ£o Ã© uma URL http(s) vÃ¡lida â€” corrija .env na raiz ou server/.env');
  }
}
console.log('[SaaS Admin API] SERVICE_ROLE_KEY loaded', Boolean(SUPABASE_SERVICE_ROLE_KEY));
console.log('[SaaS Admin API] PLATFORM_API_KEY loaded', Boolean(PLATFORM_API_KEY));
console.log('[SaaS Admin API] SUPABASE_ANON_KEY loaded', hasSupabaseAuthPublicClient());
warnIfConsoleSupabaseHostnameDiffersFromServer();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[SaaS Admin API] FATAL: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de iniciar.');
  console.error('  Use `.env` na RAIZ do repositÃ³rio (prevalece sobre server/.env). Veja `.env.example`.');
  process.exit(1);
}
try {
  validateServiceRoleKey(SUPABASE_SERVICE_ROLE_KEY);
} catch (e) {
  console.error('[SaaS Admin API] SUPABASE_SERVICE_ROLE_KEY invÃ¡lida:', e?.message || e);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Preenchido antes de app.listen â€” rotas de acesso usam IdentityService. */
let identityService;

/** Host do `iss` do JWT (sem verificar assinatura) â€” sÃ³ para diagnÃ³stico de projeto errado. */
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
  if (!looksLikeJwt) return base || 'Token invÃ¡lido.';

  const tokenHost = jwtAccessTokenIssuerHost(accessToken);
  const serverHost = configuredSupabaseHost();
  if (tokenHost && serverHost && tokenHost !== serverHost) {
    return (
      `${base} â€” DiagnÃ³stico: o access token foi emitido pelo Auth de "${tokenHost}", `
      + `mas SUPABASE_URL deste servidor aponta para "${serverHost}". `
      + 'Alinhe `.env` na raiz do repo (prevalece) ou `console/.env` e `server/.env` ao mesmo projeto (Settings â†’ API), reinicie Vite e o backend, '
      + 'limpe dados do site em localhost:5177 e faÃ§a login de novo.'
    );
  }
  if (tokenHost && serverHost && tokenHost === serverHost) {
    return (
      `${base} â€” Mesmo projeto (${tokenHost}), mas a assinatura nÃ£o bateu. `
      + 'Limpe sessÃ£o no browser (Application â†’ Clear site data), faÃ§a login de novo; confira se anon/publishable '
      + 'e service_role no .env sÃ£o do projeto atual (sem chaves antigas ou cortadas).'
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

function getInviteRedirectTo() {
  if (APP_INVITE_REDIRECT_TO) return APP_INVITE_REDIRECT_TO;
  return resolveInviteRedirectTo();
}

function makeTemporaryPassword() {
  return `Lo#${randomUUID().replace(/-/g, '').slice(0, 18)}Aa1`;
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

function isSupabaseNetworkError(err) {
  const code = String(err?.cause?.code || err?.code || '').trim();
  const message = String(err?.message || err?.cause?.message || '');
  return ['ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN'].includes(code)
    || message.includes('fetch failed');
}

/** Phase 4.10 Wave 3H â€” domÃ­nio membership (reconciliaÃ§Ã£o + metadata Auth) */
const membership = createMembershipDependencies({
  supabase,
  normalizeText,
  normalizeEmail,
});

const {
  isActiveTenantUserRow,
  linkAuthUserToTenantMembership,
  resolveActiveTenantUser,
  getTenantUserByAuthUserId,
  getAuthUserMeta,
  extractPermissionFieldsFromAppMetadata,
  enrichTeamRosterWithPermissionFields,
  appendAccessAuditToAuthUser,
  ensureConsoleAdminCredentials,
  isMissingHasSystemAccessColumnError,
  isMissingInvitationStatusColumnError,
  isMissingCollaboratorIdColumnError,
} = membership;

async function getTenantAdminActorOrThrow(authUserId, explicitTenantId = '') {
  return resolveTenantAdminActorOrThrow(authUserId, explicitTenantId, {
    resolveActiveTenantUser,
  });
}

/** Phase 4.10 Wave 3A â€” contextos Core Auth/Tenant (singleton) */
const appRouteContexts = createAppRouteContexts({
  supabase,
  explainJwtVerifyFailure,
  normalizeDatabaseError,
  isSupabaseNetworkError,
  resolveActiveTenantUser,
  isActiveTenantUserRow,
  permissionsAdminForbiddenMessage: PERMISSIONS_ADMIN_FORBIDDEN_MESSAGE,
  nodeEnv: process.env.NODE_ENV,
  supabaseUrl: SUPABASE_URL,
});

const { requireAppUser } = appRouteContexts.auth;
const {
  requireAppUser: requireAppUserCollaboratorsList,
  requireTenantMembership: requireTenantMembershipCollaboratorsList,
} = appRouteContexts.collaborators.list;
const {
  requireAppUser: requireAppUserCollaboratorsPermissions,
  requireTenantAdmin: requireTenantAdminCollaboratorsPermissions,
} = appRouteContexts.collaborators.permissions;
const {
  requireAppUser: requireAppUserAssetsWrite,
  requireTenantAdmin: requireTenantAdminAssetsWrite,
} = appRouteContexts.assets.write;
const {
  requireAppUser: requireAppUserAssetsRead,
  requireTenantMembership: requireTenantMembershipAssetsRead,
} = appRouteContexts.assets.read;
const {
  assertNonProductionDebug: assertNonProductionDebugUserContext,
  requireAppUser: requireAppUserDebugUserContext,
  requireTenantAdmin: requireTenantAdminDebugUserContext,
} = appRouteContexts.debug;
const {
  requireTenantAdminBody: requireLegacyTenantAdminBody,
  requireTenantAdminQuery: requireLegacyTenantAdminQuery,
} = appRouteContexts.legacy;

const revokeAuthUserSessions = createRevokeAuthUserSessions({ supabase });

const provisioning = createProvisioningDependencies({
  supabase,
  getTenantAdminActorOrThrow,
  normalizeText,
  normalizeEmail,
  normalizeRoleValue,
  normalizeInvitationStatus,
  maskEmail,
  appendAccessAuditToAuthUser,
  logAccessEmailAudit,
  getPasswordResetRedirectTo,
});

const {
  provisionCollaboratorAccess,
  sendPasswordResetFlow,
  sendCollaboratorInvite,
  upsertInvitationRecord,
  formatCollaboratorProvisionResponse,
  upsertTenantUserAccess,
  linkCollaboratorToTenantUser,
  clearStaleTenantUserAuthReference,
  findAuthUserByEmail,
  getValidAuthUserId,
  resolveAuthUserIdForTenantLink,
} = provisioning;

/** Phase 4.10 Wave 3I â€” domÃ­nio Platform (Console, onboarding, billing, response builders) */
const platform = createPlatformDependencies({
  supabase,
  normalizeText,
  normalizeEmail,
  normalizeDatabaseError,
  explainJwtVerifyFailure,
  normalizeStatus,
  normalizePlanCode,
  assertAuthUserIdForTenantWrite,
  identityLog,
  isIdentityProvisionError,
  planConfig: PLAN_CONFIG,
  platformApiKey: PLATFORM_API_KEY,
  ensureConsoleAdminCredentials,
  nodeEnv: process.env.NODE_ENV,
});

const {
  buildModuleMap,
  buildFeatureFlags,
  formatProvisionErrorResponse,
  mountPlatformRoutes,
} = platform;

const resolveTenantUserForCollaboratorAccess = createResolveTenantUserForCollaboratorAccess({
  supabase,
  getTenantAdminActorOrThrow,
  normalizeEmail,
  isMissingCollaboratorIdColumnError,
  linkCollaboratorToTenantUser,
});

const createTenantUserFromApp = createCreateTenantUserFromApp({
  supabase,
  getTenantAdminActorOrThrow,
  normalizeEmail,
  normalizeRoleValue,
  lookupAuthUserByEmail,
  requireAuthUserId,
  isAuthUserAlreadyRegisteredError,
  assertAuthUserIdForTenantWrite,
  upsertTenantUserAccess,
  sendCollaboratorInvite,
  isInviteEmailDelivered,
  upsertInvitationRecord,
});

const setCollaboratorAccessState = createSetCollaboratorAccessState({
  supabase,
  resolveTenantUserForCollaboratorAccess,
  revokeAuthUserSessions,
  isMissingHasSystemAccessColumnError,
});

const handleContractsGenerated = createContractsGeneratedHandler({
  supabase,
  normalizeDatabaseError,
});
const handleContractsSignatureInviteEmail = createContractsSignatureInviteEmailHandler();
const handleSigningClientContext = createSigningClientContextHandler();

/** Modelos v2 — flags OFF; sem getService ⇒ storage unavailable se alguém forçar flag. */
const contractTemplatesV2 = createContractTemplatesV2Handlers({});

/** Instâncias v2 — flags OFF; sem getService. */
const contractsV2 = createContractsV2Handlers({});

/** Assinaturas/envelopes v2 — flags OFF; sem getService. */
const signatureEnvelopesV2 = createSignatureEnvelopesV2Handlers({});

/**
 * Assinatura pública v2 — Phase 10.11 + hardening 10.12.
 * Flags OFF + sem getSignerService ⇒ 403/501. Sem delivery real.
 * Rate limit persistido somente quando deps.persistedRateLimitService injetado.
 */
const publicSignaturesV2 = createPublicSignaturesV2Handlers({});
const publicSignaturesV2Cors = createPublicSignaturesV2CorsMiddleware();
/** Readiness interno — Phase 10.12 (sem secrets; permissão elevada). */
const contractsV2RuntimeReadiness = createContractsV2RuntimeReadinessHandlers({});

/** Documentos/PDF v2 — flags OFF; sem getPipeline/storage. */
const contractDocumentsV2 = createContractDocumentsV2Handlers({});
/** Conclusão SIGNED / ledger v2 — Phase 10.8 (flags OFF; sem wiring de efeitos). */
const contractSigningCompletionV2 = createContractSigningCompletionV2Handlers({});

const handleTenantContext = createTenantContextHandler({
  supabase,
  resolveActiveTenantUser,
  isActiveTenantUserRow,
  isOptionalTenantLimitsError,
  isMissingHasSystemAccessColumnError,
  resolveClinicProfileForTenant,
  enrichTeamRosterWithPermissionFields,
  getAuthUserMeta,
  extractPermissionFieldsFromAppMetadata,
  buildModuleMap,
  buildFeatureFlags,
  normalizeStatus,
  normalizeDatabaseError,
});

const contractsOperationalRollout = createContractsOperationalRolloutHandlers({
  supabase,
  getTenantAdminActorOrThrow,
  resolveActiveTenantUser,
  isActiveTenantUserRow,
});

const handleClinicProfile = createClinicProfileHandler({
  supabase,
  upsertClinicProfileForTenant,
  resolveClinicProfileForTenant,
  normalizeDatabaseError,
});

const handleUsersList = createUsersListHandler({
  supabase,
  getTenantAdminActorOrThrow,
  normalizeEmail,
  normalizeRoleValue,
  normalizeInvitationStatus,
  getValidAuthUserId,
  getAuthUserMeta,
  extractPermissionFieldsFromAppMetadata,
  normalizeDatabaseError,
});

const handleCollaboratorsAccessAudit = createCollaboratorsAccessAuditHandler({
  supabase,
  getTenantAdminActorOrThrow,
  normalizeEmail,
  getAuthUserMeta,
});

const handleInvitationsReconcile = createInvitationsReconcileHandler({
  supabase,
  getTenantUserByAuthUserId,
  linkAuthUserToTenantMembership,
  normalizeEmail,
  isMissingInvitationStatusColumnError,
  normalizeDatabaseError,
});

const handleCollaboratorLink = createCollaboratorLinkHandler({
  linkCollaboratorToTenantUser,
  normalizeEmail,
  normalizeDatabaseError,
});

const handleCollaboratorProvisionAccess = createCollaboratorProvisionAccessHandler({
  identityService,
  normalizeEmail,
  normalizeRoleValue,
  maskEmail,
  logCollabInviteProdAudit,
  formatProvisionErrorResponse,
  resolveClientIp,
});

const handleInvitationsResend = createInvitationsResendHandler({
  supabase,
  identityService,
  getTenantAdminActorOrThrow,
  normalizeEmail,
  normalizeRoleValue,
  formatProvisionErrorResponse,
  resolveClientIp,
});

const handleUsersPasswordReset = createUsersPasswordResetHandler({
  identityService,
  getTenantAdminActorOrThrow,
  normalizeEmail,
  resolveClientIp,
  logCollaboratorAccessAudit,
  appendAccessAuditToAuthUser,
});

const handleCollaboratorsAccessBundle = createCollaboratorsAccessBundleHandler({
  supabase,
  identityService,
  getTenantAdminActorOrThrow,
  getValidAuthUserId,
  clearStaleTenantUserAuthReference,
  resolveAuthUserIdForTenantLink,
  assertAuthUserIdForTenantWrite,
  normalizeEmail,
  normalizeRoleValue,
  normalizeDatabaseError,
  resolveClientIp,
  nodeEnv: process.env.NODE_ENV,
});

const handleUsersCreate = createUsersCreateHandler({
  createTenantUserFromApp,
  normalizeEmail,
  normalizeDatabaseError,
});

const handleUsersPatchAccess = createUsersPatchAccessHandler({
  supabase,
  getTenantAdminActorOrThrow,
  revokeAuthUserSessions,
  isMissingHasSystemAccessColumnError,
  normalizeDatabaseError,
});

const handleUsersDelete = createUsersDeleteHandler({
  supabase,
  getTenantAdminActorOrThrow,
  normalizeEmail,
  normalizeDatabaseError,
});

const handleCollaboratorAccessToggle = createCollaboratorAccessToggleHandler({
  supabase,
  identityService,
  getTenantAdminActorOrThrow,
  resolveTenantUserForCollaboratorAccess,
  linkCollaboratorToTenantUser,
  revokeAuthUserSessions,
  isMissingHasSystemAccessColumnError,
  isMissingIdentitiesTableError,
  normalizeEmail,
  normalizeRoleValue,
  normalizeDatabaseError,
  resolveClientIp,
  logCollaboratorAccessAudit,
  appendAccessAuditToAuthUser,
  nodeEnv: process.env.NODE_ENV,
});

mountPlatformRoutes(app);

app.get('/internal/app/tenant-context', requireAppUser, handleTenantContext);

/** Phase 10.21C — rollout operacional SSOT em feature_flags (sem migration). */
app.get(
  '/internal/app/contracts/operational-rollout',
  requireAppUser,
  contractsOperationalRollout.handleGet,
);
app.put(
  '/internal/app/contracts/operational-rollout',
  requireAppUser,
  contractsOperationalRollout.handlePut,
);
app.post(
  '/internal/app/contracts/operational-rollout/rollback',
  requireAppUser,
  contractsOperationalRollout.handleRollback,
);

/**
 * DiagnÃ³stico de sincronizaÃ§Ã£o SaaS (admin, DEV/STAGING only).
 * GET /internal/app/debug-user-context?target_user_id=... (opcional)
 */
app.get(
  '/internal/app/debug-user-context',
  assertNonProductionDebugUserContext,
  requireAppUserDebugUserContext,
  requireTenantAdminDebugUserContext,
  createDebugUserContextHandler({
    supabase,
    getTenantAdminActorOrThrow,
    resolveActiveTenantUser,
    getAuthUserMeta,
    extractPermissionFieldsFromAppMetadata,
    resolveClinicProfileForTenant,
    maskEmail,
    nodeEnv: process.env.NODE_ENV,
  }),
);

app.put(
  '/internal/app/clinic-profile',
  requireAppUser,
  requireLegacyTenantAdminBody,
  handleClinicProfile,
);

app.post('/internal/app/collaborators/link', requireAppUser, handleCollaboratorLink);

app.post('/internal/app/collaborators/provision', requireAppUser, handleCollaboratorProvisionAccess);
app.post(
  '/internal/app/collaborators/:collaboratorId/provision-access',
  requireAppUser,
  handleCollaboratorProvisionAccess,
);

/**
 * PersistÃªncia canÃ³nica (SaaS): credenciais, perfil e overrides de permissÃ£o no Supabase Auth + tenant_users.
 * Overrides ficam em app_metadata.permission_overrides (o JWT passa a refletir apÃ³s refresh/login).
 */
app.post('/internal/app/collaborators/access-bundle', requireAppUser, handleCollaboratorsAccessBundle);

app.post('/internal/app/users/create', requireAppUser, handleUsersCreate);

app.post('/internal/app/invitations/resend', requireAppUser, handleInvitationsResend);

app.post('/internal/app/users/password-reset', requireAppUser, handleUsersPasswordReset);

app.get('/internal/app/collaborators/access-audit', requireAppUser, handleCollaboratorsAccessAudit);

app.post('/internal/app/invitations/reconcile', requireAppUser, handleInvitationsReconcile);

app.get('/internal/app/users/list', requireAppUser, handleUsersList);

/**
 * Phase 4.2 â€” Lista oficial de colaboradores RH (read-only, Supabase SSOT).
 * GET /internal/app/collaborators
 */
app.get(
  '/internal/app/collaborators',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createCollaboratorsListHandler({
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  }),
);

app.get(
  '/internal/app/appointments',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createAppointmentsListHandler({
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  }),
);

app.post(
  '/internal/app/appointments',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createAppointmentCreateHandler({ supabase }),
);

app.put(
  '/internal/app/appointments/:id',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createAppointmentUpdateHandler({ supabase }),
);

app.patch(
  '/internal/app/appointments/:id/cancel',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createAppointmentCancelHandler({ supabase }),
);

/**
 * Phase 5.12 — Leitura financeira (read-only, Supabase SSOT quando disponível).
 */
app.get(
  '/internal/app/financial/receivables',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createReceivablesListHandler({
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  }),
);

app.get(
  '/internal/app/financial/payables',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createPayablesListHandler({
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  }),
);

app.get(
  '/internal/app/financial/financings',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createFinancingsListHandler({
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  }),
);

/**
 * Phase 6.2 — Leitura CRM/Kanban (read-only, Supabase SSOT quando disponível).
 */
app.get(
  '/internal/app/crm/leads',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createCrmLeadsListHandler({
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  }),
);

app.get(
  '/internal/app/crm/leads/:id',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createCrmLeadGetHandler({
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  }),
);

app.get(
  '/internal/app/crm/pipeline-stages',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createCrmPipelineStagesListHandler({
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  }),
);

app.get(
  '/internal/app/crm/pipeline-stages/:id',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createCrmPipelineStageGetHandler({
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  }),
);

app.get(
  '/internal/app/crm/kanban/cards',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createCrmKanbanCardsListHandler({
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  }),
);

app.get(
  '/internal/app/crm/kanban/cards/:id',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createCrmKanbanCardGetHandler({
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  }),
);

/**
 * Phase 6.3 — Escrita CRM (dual-write shadow, tabela ausente → 503).
 */
app.post(
  '/internal/app/crm/leads',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createCrmLeadCreateHandler({ supabase }),
);

app.put(
  '/internal/app/crm/leads/:id',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createCrmLeadUpdateHandler({ supabase }),
);

app.patch(
  '/internal/app/crm/leads/:id/stage',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createCrmLeadMoveStageHandler({ supabase }),
);

app.post(
  '/internal/app/crm/pipeline-stages',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createCrmPipelineStageCreateHandler({ supabase }),
);

app.put(
  '/internal/app/crm/pipeline-stages/:id',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createCrmPipelineStageUpdateHandler({ supabase }),
);

app.delete(
  '/internal/app/crm/pipeline-stages/:id',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createCrmPipelineStageDeleteHandler({ supabase }),
);

/**
 * Phase 5.13 — Escrita financeira (dual-write remoto, tabela ausente → 503).
 */
app.post(
  '/internal/app/financial/receivables',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createReceivableCreateHandler({ supabase }),
);

app.put(
  '/internal/app/financial/receivables/:id',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createReceivableUpdateHandler({ supabase }),
);

app.post(
  '/internal/app/financial/payables',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createPayableCreateHandler({ supabase }),
);

app.put(
  '/internal/app/financial/payables/:id',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createPayableUpdateHandler({ supabase }),
);

app.delete(
  '/internal/app/financial/payables/:id',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createPayableDeleteHandler({ supabase }),
);

app.post(
  '/internal/app/financial/financings',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createFinancingCreateHandler({ supabase }),
);

app.put(
  '/internal/app/financial/financings/:id',
  requireAppUserCollaboratorsList,
  requireTenantMembershipCollaboratorsList,
  createFinancingUpdateHandler({ supabase }),
);

/**
 * Phase 4.4 â€” PermissÃµes efetivas do colaborador (read-only).
 * GET /internal/app/collaborators/:id/permissions
 */
app.get(
  '/internal/app/collaborators/:id/permissions',
  requireAppUserCollaboratorsPermissions,
  requireTenantAdminCollaboratorsPermissions,
  createCollaboratorPermissionsHandler({
    supabase,
    getTenantAdminActorOrThrow,
    resolveActiveTenantUser,
    getAuthUserMeta,
    isTenantAdminRole,
  }),
);

/**
 * Phase 4.5B â€” Aplica template de permissÃµes por role (write sensÃ­vel).
 * POST /internal/app/collaborators/:id/apply-role-template
 */
app.post(
  '/internal/app/collaborators/:id/apply-role-template',
  requireAppUserCollaboratorsPermissions,
  requireTenantAdminCollaboratorsPermissions,
  createCollaboratorApplyRoleTemplateHandler({
    supabase,
    getTenantAdminActorOrThrow,
    resolveActiveTenantUser,
    getAuthUserMeta,
    appendAccessAuditToAuthUser,
    logCollaboratorAccessAudit,
  }),
);

/**
 * Phase 4.7 â€” Salvar permissÃµes customizadas (manual override).
 * PUT /internal/app/collaborators/:id/permissions
 */
app.put(
  '/internal/app/collaborators/:id/permissions',
  requireAppUserCollaboratorsPermissions,
  requireTenantAdminCollaboratorsPermissions,
  createCollaboratorPutPermissionsHandler({
    supabase,
    getTenantAdminActorOrThrow,
    resolveActiveTenantUser,
    getAuthUserMeta,
    appendAccessAuditToAuthUser,
    logCollaboratorAccessAudit,
  }),
);

/**
 * Phase 4.8C â€” Upload logomarca da clÃ­nica.
 * POST /internal/app/assets/logo
 */
app.post(
  '/internal/app/assets/logo',
  requireAppUserAssetsWrite,
  requireTenantAdminAssetsWrite,
  createAssetsLogoHandler({
    supabase,
    getTenantAdminActorOrThrow,
    resolveActiveTenantUser,
  }),
);

/**
 * Phase 4.8E â€” Avatar colaborador (bucket privado + signed URL).
 * POST /internal/app/assets/avatar
 * GET /internal/app/assets/avatar/:collaboratorId
 */
app.post(
  '/internal/app/assets/avatar',
  requireAppUserAssetsWrite,
  requireTenantAdminAssetsWrite,
  createAssetsAvatarPostHandler({
    supabase,
    getTenantAdminActorOrThrow,
    resolveActiveTenantUser,
  }),
);

app.get(
  '/internal/app/assets/avatar/:collaboratorId',
  requireAppUserAssetsRead,
  requireTenantMembershipAssetsRead,
  createAssetsAvatarGetHandler({
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  }),
);

app.patch('/internal/app/users/:tenantUserId/access', requireAppUser, handleUsersPatchAccess);

app.delete('/internal/app/users/:tenantUserId', requireAppUser, handleUsersDelete);

app.patch('/internal/app/collaborators/:collaboratorId/access', requireAppUser, handleCollaboratorAccessToggle);

/** Espelha contrato gerado (IndexedDB â†’ Postgres) quando a migration 006 existir. */
app.post('/internal/app/contracts/generated', requireAppUser, handleContractsGenerated);
app.get('/internal/app/contracts/signature-invite-email', (_req, res) => {
  res.set('Allow', 'POST');
  res.status(405).json({
    ok: false,
    code: 'METHOD_NOT_ALLOWED',
    allow: ['POST'],
    path: '/internal/app/contracts/signature-invite-email',
  });
});
app.post('/internal/app/contracts/signature-invite-email', requireAppUser, handleContractsSignatureInviteEmail);
app.get('/internal/app/contracts/signing-client-context', handleSigningClientContext);

/** Contract templates v2 — Phase 10.4 (feature flags OFF por padrão). */
app.get('/internal/app/contract-templates-v2', requireAppUser, contractTemplatesV2.list);
app.post('/internal/app/contract-templates-v2', requireAppUser, contractTemplatesV2.create);
app.get('/internal/app/contract-templates-v2/:id', requireAppUser, contractTemplatesV2.get);
app.patch('/internal/app/contract-templates-v2/:id', requireAppUser, contractTemplatesV2.patch);
app.post('/internal/app/contract-templates-v2/:id/duplicate', requireAppUser, contractTemplatesV2.duplicate);
app.post('/internal/app/contract-templates-v2/:id/archive', requireAppUser, contractTemplatesV2.archive);
app.get('/internal/app/contract-templates-v2/:id/versions', requireAppUser, contractTemplatesV2.listVersions);
app.post('/internal/app/contract-templates-v2/:id/versions', requireAppUser, contractTemplatesV2.createVersion);
app.get('/internal/app/contract-template-versions-v2/:versionId', requireAppUser, contractTemplatesV2.getVersion);
app.patch('/internal/app/contract-template-versions-v2/:versionId', requireAppUser, contractTemplatesV2.patchVersion);
app.post('/internal/app/contract-template-versions-v2/:versionId/review', requireAppUser, contractTemplatesV2.reviewVersion);
app.post('/internal/app/contract-template-versions-v2/:versionId/publish', requireAppUser, contractTemplatesV2.publishVersion);
app.post('/internal/app/contract-template-versions-v2/:versionId/validate', requireAppUser, contractTemplatesV2.validateVersion);
app.post('/internal/app/contract-template-versions-v2/:versionId/preview', requireAppUser, contractTemplatesV2.previewVersion);

/** Contracts v2 instances — Phase 10.5 (feature flags OFF por padrão). */
app.get('/internal/app/contracts-v2', requireAppUser, contractsV2.list);
app.post('/internal/app/contracts-v2', requireAppUser, contractsV2.create);
app.get('/internal/app/contracts-v2/:id', requireAppUser, contractsV2.get);
app.patch('/internal/app/contracts-v2/:id', requireAppUser, contractsV2.patch);
app.post('/internal/app/contracts-v2/:id/versions', requireAppUser, contractsV2.createVersion);
app.post('/internal/app/contracts-v2/:id/versions/:versionId/lock', requireAppUser, contractsV2.lockVersion);
app.post('/internal/app/contracts-v2/:id/validate', requireAppUser, contractsV2.validate);
app.post('/internal/app/contracts-v2/:id/transition', requireAppUser, contractsV2.transition);
app.get('/internal/app/contract-packages-v2', requireAppUser, contractsV2.listPackages);
app.post('/internal/app/contract-packages-v2', requireAppUser, contractsV2.createPackage);
app.get('/internal/app/contract-packages-v2/:id', requireAppUser, contractsV2.getPackage);
app.post('/internal/app/contract-packages-v2/:id/validate', requireAppUser, contractsV2.validatePackage);

/** Signature envelopes v2 — Phase 10.6 (feature flags OFF por padrão). */
app.get('/internal/app/signature-policies-v2', requireAppUser, signatureEnvelopesV2.listPolicies);
app.post('/internal/app/signature-policies-v2', requireAppUser, signatureEnvelopesV2.createPolicy);
app.get('/internal/app/signature-envelopes-v2', requireAppUser, signatureEnvelopesV2.listEnvelopes);
app.post('/internal/app/signature-envelopes-v2', requireAppUser, signatureEnvelopesV2.createEnvelope);
app.get('/internal/app/signature-envelopes-v2/:id', requireAppUser, signatureEnvelopesV2.getEnvelope);
app.post('/internal/app/signature-envelopes-v2/:id/signers', requireAppUser, signatureEnvelopesV2.addSigner);
app.post('/internal/app/signature-envelopes-v2/:id/ready', requireAppUser, signatureEnvelopesV2.markReady);
app.post('/internal/app/signature-envelopes-v2/:id/send', requireAppUser, signatureEnvelopesV2.sendEnvelope);
app.post('/internal/app/signature-envelopes-v2/:id/cancel', requireAppUser, signatureEnvelopesV2.cancelEnvelope);
app.post('/internal/app/signature-envelopes-v2/:id/expire', requireAppUser, signatureEnvelopesV2.expireEnvelope);
app.post('/internal/app/signature-envelopes-v2/:id/reconcile', requireAppUser, signatureEnvelopesV2.reconcileEnvelope);

/** Rotas públicas signatures-v2 — Phase 10.11/10.12 (flags OFF; CORS allowlist; sem delivery real). */
app.options('/public/signatures-v2/:token/*', publicSignaturesV2Cors);
app.options('/public/signatures-v2/:token/open', publicSignaturesV2Cors);
app.options('/public/signatures-v2/:token/view', publicSignaturesV2Cors);
app.options('/public/signatures-v2/:token/challenge', publicSignaturesV2Cors);
app.options('/public/signatures-v2/:token/verify', publicSignaturesV2Cors);
app.options('/public/signatures-v2/:token/accept', publicSignaturesV2Cors);
app.options('/public/signatures-v2/:token/sign', publicSignaturesV2Cors);
app.options('/public/signatures-v2/:token/decline', publicSignaturesV2Cors);
app.options('/public/signatures-v2/:token/status', publicSignaturesV2Cors);
app.options('/public/signatures-v2/:token/document', publicSignaturesV2Cors);
app.post('/public/signatures-v2/:token/open', publicSignaturesV2Cors, publicSignaturesV2.publicOpen);
app.post('/public/signatures-v2/:token/view', publicSignaturesV2Cors, publicSignaturesV2.publicView);
app.post('/public/signatures-v2/:token/challenge', publicSignaturesV2Cors, publicSignaturesV2.publicChallenge);
app.post('/public/signatures-v2/:token/verify', publicSignaturesV2Cors, publicSignaturesV2.publicVerify);
app.post('/public/signatures-v2/:token/accept', publicSignaturesV2Cors, publicSignaturesV2.publicAccept);
app.post('/public/signatures-v2/:token/sign', publicSignaturesV2Cors, publicSignaturesV2.publicSign);
app.post('/public/signatures-v2/:token/decline', publicSignaturesV2Cors, publicSignaturesV2.publicDecline);
app.get('/public/signatures-v2/:token/status', publicSignaturesV2Cors, publicSignaturesV2.publicStatus);
app.get('/public/signatures-v2/:token/document', publicSignaturesV2Cors, publicSignaturesV2.publicDocument);

/** Runtime readiness Contracts V2 — Phase 10.12 (interno; sem secrets). */
app.get(
  '/internal/app/contracts-v2/runtime-readiness',
  requireAppUser,
  contractsV2RuntimeReadiness.getRuntimeReadiness,
);

/** Contract documents / PDF v2 — Phase 10.7 (feature flags OFF por padrão). */
app.post('/internal/app/contracts-v2/:id/versions/:versionId/render', requireAppUser, contractDocumentsV2.renderVersion);
app.post('/internal/app/contracts-v2/:id/versions/:versionId/generate-unsigned-pdf', requireAppUser, contractDocumentsV2.generateUnsignedPdf);
app.post('/internal/app/signature-envelopes-v2/:id/generate-signed-artifacts', requireAppUser, contractDocumentsV2.generateSignedArtifacts);
app.get('/internal/app/contracts-v2/:id/files', requireAppUser, contractDocumentsV2.listFiles);
app.get('/internal/app/contract-files-v2/:fileId', requireAppUser, contractDocumentsV2.getFile);
app.post('/internal/app/contract-files-v2/:fileId/verify', requireAppUser, contractDocumentsV2.verifyFile);
app.post('/internal/app/contract-files-v2/:fileId/download', requireAppUser, contractDocumentsV2.downloadFile);

/** Contract signing completion / ledger v2 — Phase 10.8 (feature flags OFF por padrão). */
app.post('/internal/app/contracts-v2/:id/validate-signing-completion', requireAppUser, contractSigningCompletionV2.validateSigningCompletion);
app.post('/internal/app/contracts-v2/:id/complete-signing', requireAppUser, contractSigningCompletionV2.completeSigning);
app.get('/internal/app/contracts-v2/:id/ledger', requireAppUser, contractSigningCompletionV2.getLedger);
app.post('/internal/app/contracts-v2/:id/ledger/verify', requireAppUser, contractSigningCompletionV2.verifyLedger);
app.get('/internal/app/contracts-v2/:id/signed-effects', requireAppUser, contractSigningCompletionV2.getSignedEffects);
app.post('/internal/app/contracts-v2/:id/reconcile-signed-state', requireAppUser, contractSigningCompletionV2.reconcileSignedState);

/** Webhook de plataformas de assinatura eletrÃ´nica (Clicksign, DocuSign, ZapSign, etc.) */
app.post('/api/signature/webhook', (req, res) => {
  try {
    const secret = process.env.SIGNATURE_WEBHOOK_SECRET || '';
    const headerSecret = req.headers['x-signature-secret'] || req.headers['x-webhook-secret'] || '';
    if (secret && headerSecret !== secret) {
      return res.status(401).json({ error: 'Webhook nÃ£o autorizado.' });
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
      message: 'Evento recebido. O app sincronizarÃ¡ o status via polling ou push interno.',
    });
  } catch (err) {
    console.error('[signature-webhook]', err);
    return res.status(400).json({ error: err?.message || 'Payload invÃ¡lido.' });
  }
});

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

/** Rotas internas desconhecidas â€” sempre JSON (evita HTML no frontend). */
app.use('/internal/app', (req, res) => {
  res.status(404).json({
    ok: false,
    error: `Rota nÃ£o encontrada: ${req.method} ${req.originalUrl}`,
    message: 'Admin API desatualizada ou rota inexistente. Reinicie o backend (npm run dev:stack).',
    hint: 'Reinicie a Admin API local: pare o processo na porta 3001 e rode npm run dev:stack.',
  });
});

app.use('/internal/platform', (req, res) => {
  res.status(404).json({
    ok: false,
    error: `Rota nÃ£o encontrada: ${req.method} ${req.originalUrl}`,
    hint: 'Reinicie a Admin API local com npm run server:restart se a rota foi adicionada recentemente.',
  });
});

const httpServer = app.listen(PORT, () => {
  const inventory = getEmailTransportInventory();
  console.log(`[SaaS Admin API] rodando na porta ${PORT}`);
  console.log(`[SaaS Admin API] e-mail transacional: ${inventory.transactionalConfigured ? `sim (${inventory.transactionalProvider})` : 'NÃO — convites usam SMTP Auth'}`);
  if (!inventory.directSmtpConfigured) {
    console.warn('[SaaS Admin API] SMTP direto ausente. Defina SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD e EMAIL_FROM_ADDRESS no Railway para assinatura.');
  }
  scheduleSmtpVerifyOnStartup();
  if (!hasSupabaseAuthPublicClient()) {
    console.warn(
      '[SaaS Admin API] SUPABASE_ANON_KEY ausente — convites Auth exigem a anon key do mesmo projeto.',
    );
  }

  if (process.env.IDENTITY_HEALTH_ON_STARTUP === '1') {
    console.log('[IDENTITY_AUDIT] Health check disponÃ­vel via POST /internal/app/identity-health/evaluate');
  }
});
httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[SaaS Admin API] Porta ${PORT} jÃ¡ em uso. Encerre o processo nessa porta ou defina ADMIN_API_PORT com outro valor.`,
    );
  } else {
    console.error('[SaaS Admin API] Erro ao escutar:', err?.message || err);
  }
  process.exit(1);
});
