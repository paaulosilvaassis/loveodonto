/**
 * Health/readiness interno Contracts V2 — Phase 10.12.
 * GET /internal/app/contracts-v2/runtime-readiness
 * Sem secrets; exige auth + permissão elevada.
 */

import {
  getPublicSigningCorsPolicy,
  parseBool,
} from './contractsV2PublicSecurity.js';
import {
  resolveContractsV2PrivateStorageBinding,
  toPublicStorageBindingPayload,
} from './contractsV2PrivateStorageBinding.js';

const EXPECTED_MIGRATIONS = [
  '028_app_contracts_v2_foundation.sql',
  '029_app_contracts_v2_rls.sql',
  '030_app_contract_ledger.sql',
  '031_app_contract_number_sequences.sql',
  '032_app_signature_sessions_and_challenges.sql',
  '033_app_contract_private_storage_local.sql',
  '034_app_signature_delivery_attempts.sql',
];

const ELEVATED_PERMS = [
  'contracts:runtime_readiness',
  'contracts:staging_preflight',
  'contracts:view_security_diagnostics',
  'contract_signatures:runtime_readiness',
  'contract_signatures:staging_preflight',
  'contract_signatures:view_security_diagnostics',
  'perm-contract_signatures-runtime_readiness',
  'perm-contract_signatures-staging_preflight',
  'perm-contract_signatures-view_security_diagnostics',
];

function resolvePermissions(req) {
  return req.tenantContext?.permissions
    || req.appAuthUser?.permissions
    || [];
}

function hasElevatedContractsRuntimePermission(req) {
  const perms = resolvePermissions(req);
  if (!Array.isArray(perms)) return false;
  return ELEVATED_PERMS.some((p) => perms.includes(p));
}

export function createContractsV2RuntimeReadinessHandlers(deps = {}) {
  const env = deps.env || process.env;
  const getProbe = deps.getProbe;

  return {
    async getRuntimeReadiness(req, res) {
      if (!hasElevatedContractsRuntimePermission(req)) {
        return res.status(403).json({
          error: 'Permissão insuficiente.',
          code: 'PERMISSION_DENIED',
        });
      }

      const mode = String(env.CONTRACTS_V2_RUNTIME_MODE || 'disabled').trim().toLowerCase();
      const origins = getPublicSigningCorsPolicy(env).allowedOrigins;
      const storageBinding = resolveContractsV2PrivateStorageBinding(env);
      const storagePublic = toPublicStorageBindingPayload(storageBinding);
      const deliveryMode = String(env.CONTRACTS_V2_DELIVERY_MODE || 'disabled').trim().toLowerCase();
      const rateLimitMode = String(env.CONTRACTS_V2_RATE_LIMIT_MODE || 'disabled').trim().toLowerCase();
      const trustProxy = String(env.CONTRACTS_V2_TRUST_PROXY ?? '0');
      const secretPresent = Boolean(env.CONTRACTS_V2_SIGNING_TOKEN_SECRET
        && String(env.CONTRACTS_V2_SIGNING_TOKEN_SECRET).length >= 32);

      const blockers = [];
      if (mode === 'disabled') blockers.push('RUNTIME_DISABLED');
      if (mode === 'staging-disabled' && origins.length === 0) {
        blockers.push('CONTRACTS_V2_PUBLIC_ORIGIN_CONFIGURATION_REQUIRED');
      }
      if ((mode === 'local-integration' || mode === 'staging-disabled') && !secretPresent) {
        blockers.push('CONTRACTS_V2_SIGNING_TOKEN_SECRET_WEAK');
      }
      if (mode === 'staging-disabled' && rateLimitMode === 'memory-test') {
        blockers.push('STAGING_RATE_LIMIT_NOT_PERSISTED');
      }
      if (deliveryMode !== 'disabled' && mode === 'staging-disabled') {
        blockers.push('DELIVERY_MUST_BE_DISABLED_IN_STAGING');
      }

      let probeExtras = {};
      if (typeof getProbe === 'function') {
        try {
          probeExtras = await getProbe() || {};
        } catch {
          blockers.push('PROBE_FAILED');
        }
      }

      const components = [
        { name: 'configuration', ok: mode !== 'unknown' },
        { name: 'public_origins', ok: mode === 'disabled' || origins.length > 0 },
        { name: 'secrets', ok: mode === 'disabled' || secretPresent },
        { name: 'trust_proxy', ok: true, detail: `hops=${trustProxy}` },
        { name: 'rate_limit_mode', ok: mode !== 'staging-disabled' || rateLimitMode === 'persisted' },
        { name: 'delivery', ok: deliveryMode === 'disabled' || mode === 'local-integration' },
        { name: 'feature_flags', ok: !parseBool(env.VITE_CONTRACTS_DOMAIN_V2_ENABLED) },
        {
          name: 'bucket_configured',
          ok: storageBinding.ok && (
            storagePublic.bound
            || storageBinding.storageMode === 'unavailable'
            || storageBinding.storageMode === 'memory'
            || mode === 'memory-test'
          ),
        },
        { name: 'storage_binding', ok: storageBinding.ok },
      ];

      for (const c of components) {
        if (!c.ok) blockers.push(`${c.name.toUpperCase()}_NOT_READY`);
      }

      let state = 'NOT_READY';
      if (mode === 'disabled') state = 'DISABLED';
      else if (blockers.length === 0 && (mode === 'local-integration' || mode === 'memory-test')) {
        state = 'READY_FOR_LOCAL_TEST';
      } else if (blockers.length === 0 && mode === 'staging-disabled') {
        state = 'READY_FOR_STAGING_VALIDATION';
      } else if (!env.CONTRACTS_V2_RUNTIME_MODE) {
        state = 'NOT_CONFIGURED';
      }

      return res.json({
        mode,
        ready: blockers.length === 0 && mode !== 'disabled',
        state,
        components: components.map((c) => ({ name: c.name, ok: c.ok })),
        expectedMigrations: EXPECTED_MIGRATIONS,
        bucketConfigured: Boolean(storagePublic.bound),
        storageBinding: storagePublic,
        flagsEnabled: false,
        flagsAllDisabled: true,
        blockers: [...new Set(blockers)],
        readyForProduction: false,
        ...probeExtras,
      });
    },
  };
}
