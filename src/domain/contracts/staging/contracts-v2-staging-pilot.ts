/**
 * @module domain/contracts/staging/contracts-v2-staging-pilot
 * @description Phase 10.14 — piloto staging-only por tenant técnico.
 *
 * Nunca habilita flags em produção. Nunca altera defaults globais (permanecem false).
 */

import {
  CONTRACT_FEATURE_FLAGS,
  type ContractFeatureFlag,
  type ContractFeatureFlagMap,
} from '../contract-feature-flags.js';
import {
  extractSupabaseProjectRef,
  isProductionSupabaseHostConfigured,
  parseBooleanLike,
} from '../../../repositories/shared/repositoryV3FlagHelpers.js';

/** Código estável do tenant técnico fictício. */
export const STAGING_CONTRACTS_PILOT_TENANT_CODE = 'STAGING_CONTRACTS_PILOT';

/** UUID determinístico do tenant piloto (fictício). */
export const STAGING_CONTRACTS_PILOT_TENANT_ID = 'c0140000-1111-4111-8111-111111111014';

export const STAGING_REF = 'tckdjyunwmdpqmewrwvt';
export const PRODUCTION_REF = 'uoepkwhqztmsjnzirpev';

/**
 * Aliases de produto (Phase 10.14) → flags canônicas existentes.
 * Não remove nem renomeia as 15 flags oficiais.
 */
export const CONTRACTS_V2_PILOT_FLAG_ALIASES = {
  'contracts.v2.templates': [
    'contracts_domain_v2_enabled',
    'contract_templates_v2_enabled',
  ],
  'contracts.v2.instances': [
    'contracts_domain_v2_enabled',
    'contracts_module_v2_enabled',
    'contract_versioning_enabled',
    'contract_packages_enabled',
  ],
  'contracts.v2.signatures': [
    'contracts_domain_v2_enabled',
    'contracts_module_v2_enabled',
    'contract_versioning_enabled',
    'contract_internal_signature_v2_enabled',
  ],
  'contracts.v2.pdf': [
    'contracts_domain_v2_enabled',
    'contract_pdf_v2_enabled',
  ],
  'contracts.v2.storage': [
    'contracts_domain_v2_enabled',
    'contract_storage_v2_enabled',
    'contract_audit_ledger_enabled',
  ],
} as const;

export type ContractsV2PilotAlias = keyof typeof CONTRACTS_V2_PILOT_FLAG_ALIASES;

/** Flags canônicas ligadas no piloto (união dos aliases). */
export const STAGING_PILOT_ENABLED_CANONICAL_FLAGS: readonly ContractFeatureFlag[] = Object.freeze(
  Array.from(
    new Set(
      Object.values(CONTRACTS_V2_PILOT_FLAG_ALIASES).flat() as ContractFeatureFlag[],
    ),
  ),
);

export function isStagingContractsPilotTenantId(tenantId: unknown): boolean {
  return String(tenantId || '').trim() === STAGING_CONTRACTS_PILOT_TENANT_ID;
}

export function isStagingHostRef(projectRef: unknown): boolean {
  return String(projectRef || '').trim() === STAGING_REF;
}

export function isProductionHostRef(projectRef: unknown): boolean {
  return String(projectRef || '').trim() === PRODUCTION_REF;
}

/**
 * Ambiente permite piloto: host staging (ou marker explícito) e nunca produção.
 */
export function isContractsV2StagingPilotEnvironment(options: {
  projectRef?: string;
  environmentMarker?: string;
  forceAllowInTest?: boolean;
} = {}): boolean {
  if (options.forceAllowInTest) return true;
  if (isProductionSupabaseHostConfigured()) return false;

  const ref = String(options.projectRef || extractSupabaseProjectRef(
    (typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.VITE_SUPABASE_APP_URL
        || import.meta.env.VITE_SUPABASE_URL
        || import.meta.env.VITE_SUPABASE_PLATFORM_URL
        || '')
      : ''),
  ) || '').trim();

  if (isProductionHostRef(ref)) return false;
  if (isStagingHostRef(ref)) return true;

  const marker = String(options.environmentMarker || '').trim();
  return marker === 'staging-pilot' || marker === 'staging-candidate';
}

/** Mapa de tenantFlags (canônicas + aliases) para o tenant piloto. */
export function buildStagingPilotTenantFlags(): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const flag of CONTRACT_FEATURE_FLAGS) {
    map[flag] = STAGING_PILOT_ENABLED_CANONICAL_FLAGS.includes(flag);
  }
  for (const alias of Object.keys(CONTRACTS_V2_PILOT_FLAG_ALIASES) as ContractsV2PilotAlias[]) {
    map[alias] = true;
  }
  return map;
}

/**
 * Resolve se uma flag canônica está ligada via alias de piloto no mapa tenantFlags.
 */
export function resolveCanonicalFlagFromPilotAliases(
  flag: ContractFeatureFlag,
  tenantFlags: Record<string, unknown> | undefined,
): boolean | undefined {
  if (!tenantFlags) return undefined;
  for (const [alias, deps] of Object.entries(CONTRACTS_V2_PILOT_FLAG_ALIASES)) {
    if (!(deps as readonly string[]).includes(flag)) continue;
    if (alias in tenantFlags) {
      return parseBooleanLike(tenantFlags[alias], false);
    }
  }
  return undefined;
}

/**
 * Overrides seguros do piloto: só para o tenant técnico e só em staging.
 * Retorna undefined fora do piloto (defaults/env/tenantFlags normais).
 */
export function getStagingPilotFlagOverrides(options: {
  tenantId?: string;
  projectRef?: string;
  environmentMarker?: string;
  forceAllowInTest?: boolean;
}): Partial<ContractFeatureFlagMap> | undefined {
  if (!isStagingContractsPilotTenantId(options.tenantId)) return undefined;
  if (!isContractsV2StagingPilotEnvironment(options)) return undefined;

  const overrides: Partial<ContractFeatureFlagMap> = {};
  for (const flag of STAGING_PILOT_ENABLED_CANONICAL_FLAGS) {
    overrides[flag] = true;
  }
  return overrides;
}
