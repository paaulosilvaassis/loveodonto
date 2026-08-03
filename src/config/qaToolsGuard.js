/**
 * Guardas para ferramentas internas de QA (RC-01.1A).
 * LEGACY_RC01: remoção planejada RC-03.
 * Somente dev/staging — bloqueio total em Supabase produção.
 */
import { collectEnvSnapshot } from './envGuard.js';
import { getCollaboratorRepositoryFlags } from '../repositories/collaborator/collaboratorRepositoryFlags.ts';

export const PROD_PROJECT_REF = 'uoepkwhqztmsjnzirpev';
export const STAGING_PROJECT_REF = 'tckdjyunwmdpqmewrwvt';

export class QaToolsForbiddenError extends Error {
  constructor(message = 'Ferramentas QA indisponíveis neste ambiente.') {
    super(message);
    this.name = 'QaToolsForbiddenError';
    this.code = 'QA_TOOLS_FORBIDDEN';
  }
}

export function extractSupabaseProjectRef(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).hostname.split('.')[0] || '';
  } catch {
    return '';
  }
}

export function getSupabaseProjectRef() {
  const { appUrl } = collectEnvSnapshot();
  return extractSupabaseProjectRef(appUrl);
}

export function isProductionSupabaseProject() {
  return getSupabaseProjectRef() === PROD_PROJECT_REF;
}

export function isStagingSupabaseProject() {
  return getSupabaseProjectRef() === STAGING_PROJECT_REF;
}

/**
 * Rota/tela QA habilitada: DEV local ou Supabase staging — nunca produção.
 */
export function isQaToolsRouteEnabled() {
  if (isProductionSupabaseProject()) return false;
  if (import.meta.env?.DEV) return true;
  if (isStagingSupabaseProject()) return true;
  return String(import.meta.env?.VITE_QA_TOOLS_ENABLED || '').trim().toLowerCase() === 'true';
}

/** @throws {QaToolsForbiddenError} */
export function assertQaToolsAllowed() {
  if (isProductionSupabaseProject()) {
    throw new QaToolsForbiddenError(
      `Produção detectada (${PROD_PROJECT_REF}). Ferramentas QA bloqueadas.`,
    );
  }
  if (!isQaToolsRouteEnabled()) {
    throw new QaToolsForbiddenError(
      'Ferramentas QA disponíveis apenas em DEV ou ambiente staging.',
    );
  }
}

export function resolveQaToolsMode() {
  if (isProductionSupabaseProject()) return 'PRODUCTION_BLOCKED';
  if (import.meta.env?.DEV) return 'DEV';
  if (isStagingSupabaseProject()) return 'STAGING';
  return 'UNKNOWN';
}

export function getQaToolsEnvironment(tenantId) {
  const env = collectEnvSnapshot();
  const projectRef = getSupabaseProjectRef();
  const mode = resolveQaToolsMode();
  const flags = getCollaboratorRepositoryFlags();

  return {
    mode,
    allowed: isQaToolsRouteEnabled(),
    productionBlocked: isProductionSupabaseProject(),
    supabaseProjectRef: projectRef || '(não configurado)',
    supabaseHost: env.hosts.app || '(ausente)',
    tenantId: String(tenantId || '').trim() || null,
    rhFlags: {
      RH_SUPABASE_READ: flags.RH_SUPABASE_READ,
      RH_SHADOW_READ: flags.RH_SHADOW_READ,
      RH_COMPARE_IDB_SUPABASE: flags.RH_COMPARE_IDB_SUPABASE,
      RH_SUPABASE_READ_PRIMARY: flags.RH_SUPABASE_READ_PRIMARY,
      RH_SUPABASE_WRITE: flags.RH_SUPABASE_WRITE,
    },
  };
}
