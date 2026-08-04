/**
 * @module domain/contracts/contract-feature-flags
 * @description Feature flags do domínio Contracts V2 — todas OFF por padrão (Phase 10.2).
 *
 * Usa helpers do Repository V3. Não altera comportamento operacional do legado.
 * Ausência de configuração ⇒ false (diferente de `tenantAccess.isFeatureFlagEnabled`).
 */

import {
  parseBooleanLike,
  readEnvFlag,
  readTenantFlag,
} from '../../repositories/shared/repositoryV3FlagHelpers.js';
import {
  getStagingPilotFlagOverrides,
  resolveCanonicalFlagFromPilotAliases,
} from './staging/contracts-v2-staging-pilot.js';

export const CONTRACT_FEATURE_FLAGS = [
  'contracts_domain_v2_enabled',
  'contracts_module_v2_enabled',
  'contract_templates_v2_enabled',
  'contract_packages_enabled',
  'contract_versioning_enabled',
  'contract_pdf_v2_enabled',
  'contract_internal_signature_v2_enabled',
  'contract_external_signature_enabled',
  'contract_storage_v2_enabled',
  'contract_budget_integration_v2_enabled',
  'contract_financial_activation_on_signed_enabled',
  'contract_odontogram_snapshot_enabled',
  'contract_patient_portal_enabled',
  'contract_audit_ledger_enabled',
  'contract_public_verification_enabled',
] as const;

export type ContractFeatureFlag = (typeof CONTRACT_FEATURE_FLAGS)[number];

export type ContractFeatureFlagMap = Record<ContractFeatureFlag, boolean>;

export const CONTRACT_FEATURE_FLAG_DEFAULTS: Readonly<ContractFeatureFlagMap> = Object.freeze(
  CONTRACT_FEATURE_FLAGS.reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {} as ContractFeatureFlagMap),
);

const ENV_KEY_MAP: Record<ContractFeatureFlag, string> = {
  contracts_domain_v2_enabled: 'VITE_CONTRACTS_DOMAIN_V2_ENABLED',
  contracts_module_v2_enabled: 'VITE_CONTRACTS_MODULE_V2_ENABLED',
  contract_templates_v2_enabled: 'VITE_CONTRACT_TEMPLATES_V2_ENABLED',
  contract_packages_enabled: 'VITE_CONTRACT_PACKAGES_ENABLED',
  contract_versioning_enabled: 'VITE_CONTRACT_VERSIONING_ENABLED',
  contract_pdf_v2_enabled: 'VITE_CONTRACT_PDF_V2_ENABLED',
  contract_internal_signature_v2_enabled: 'VITE_CONTRACT_INTERNAL_SIGNATURE_V2_ENABLED',
  contract_external_signature_enabled: 'VITE_CONTRACT_EXTERNAL_SIGNATURE_ENABLED',
  contract_storage_v2_enabled: 'VITE_CONTRACT_STORAGE_V2_ENABLED',
  contract_budget_integration_v2_enabled: 'VITE_CONTRACT_BUDGET_INTEGRATION_V2_ENABLED',
  contract_financial_activation_on_signed_enabled: 'VITE_CONTRACT_FINANCIAL_ACTIVATION_ON_SIGNED_ENABLED',
  contract_odontogram_snapshot_enabled: 'VITE_CONTRACT_ODONTOGRAM_SNAPSHOT_ENABLED',
  contract_patient_portal_enabled: 'VITE_CONTRACT_PATIENT_PORTAL_ENABLED',
  contract_audit_ledger_enabled: 'VITE_CONTRACT_AUDIT_LEDGER_ENABLED',
  contract_public_verification_enabled: 'VITE_CONTRACT_PUBLIC_VERIFICATION_ENABLED',
};

export interface ContractFeatureFlagContext {
  tenantId?: string;
  tenantFlags?: Record<string, unknown>;
  /** Overrides explícitos (testes) — nunca ligados em produção nesta fase. */
  overrides?: Partial<ContractFeatureFlagMap>;
  /** Project ref / marker para allowlist do piloto staging (Phase 10.14). */
  projectRef?: string;
  environmentMarker?: string;
  /** Somente testes unitários do piloto. */
  forceAllowPilotInTest?: boolean;
}

export function isValidContractFeatureFlag(flag: string): flag is ContractFeatureFlag {
  return (CONTRACT_FEATURE_FLAGS as readonly string[]).includes(flag);
}

/**
 * Resolve uma flag. Default e ausência ⇒ false.
 * Precedência: overrides > piloto staging (tenant técnico) > tenantFlags
 * (canônicas + aliases contracts.v2.*) > env > default(false).
 */
export function isContractFeatureEnabled(
  flag: ContractFeatureFlag | string,
  context: ContractFeatureFlagContext = {},
): boolean {
  if (!isValidContractFeatureFlag(flag)) return false;

  if (context.overrides && flag in context.overrides) {
    return Boolean(context.overrides[flag]);
  }

  const pilotOverrides = getStagingPilotFlagOverrides({
    tenantId: context.tenantId,
    projectRef: context.projectRef,
    environmentMarker: context.environmentMarker,
    forceAllowInTest: context.forceAllowPilotInTest,
  });
  if (pilotOverrides && flag in pilotOverrides) {
    return Boolean(pilotOverrides[flag]);
  }

  const fallback = CONTRACT_FEATURE_FLAG_DEFAULTS[flag];
  if (context.tenantFlags && flag in context.tenantFlags) {
    const fromTenant = readTenantFlag(context.tenantFlags, flag, fallback);
    return readEnvFlag(ENV_KEY_MAP[flag], fromTenant);
  }

  const fromAlias = resolveCanonicalFlagFromPilotAliases(flag, context.tenantFlags);
  if (fromAlias !== undefined) {
    return readEnvFlag(ENV_KEY_MAP[flag], fromAlias);
  }

  return readEnvFlag(ENV_KEY_MAP[flag], fallback);
}

/**
 * Monta contexto a partir do TenantContext / flags persistidas.
 * Seguro: sem tenantId de piloto + staging ⇒ nenhuma flag liga via allowlist.
 */
export function buildContractFeatureFlagContext(input: {
  tenantId?: string | null;
  tenantFlags?: Record<string, unknown> | null;
  projectRef?: string;
  environmentMarker?: string;
  overrides?: Partial<ContractFeatureFlagMap>;
} = {}): ContractFeatureFlagContext {
  return {
    tenantId: input.tenantId ? String(input.tenantId) : undefined,
    tenantFlags: input.tenantFlags || undefined,
    projectRef: input.projectRef,
    environmentMarker: input.environmentMarker,
    overrides: input.overrides,
  };
}

export function getContractFeatureFlags(
  context: ContractFeatureFlagContext = {},
): ContractFeatureFlagMap {
  const map = { ...CONTRACT_FEATURE_FLAG_DEFAULTS };
  for (const flag of CONTRACT_FEATURE_FLAGS) {
    map[flag] = isContractFeatureEnabled(flag, context);
  }
  return map;
}

/** Garante que nenhuma flag sensível está ligada sem override explícito de teste. */
export function assertAllContractFeatureFlagsDisabled(
  context: ContractFeatureFlagContext = {},
): boolean {
  const flags = getContractFeatureFlags({
    tenantFlags: context.tenantFlags,
    // ignores overrides propositalmente para auditoria de defaults/env/tenant
  });
  return CONTRACT_FEATURE_FLAGS.every((flag) => flags[flag] === false);
}

export function parseContractFlagValue(value: unknown): boolean {
  return parseBooleanLike(value, false);
}
