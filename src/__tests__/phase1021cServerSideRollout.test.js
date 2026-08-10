/**
 * Phase 10.21C — Server-side rollout via feature_flags
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTRACTS_OPERATIONAL_UX_GLOBAL_FLAG,
  CONTRACTS_OPERATIONAL_UX_TENANT_FLAG,
  computeOperationalUxEnabled,
  mapFeatureFlagsToRolloutState,
  buildRolloutActorPayload,
  normalizeRolloutMode,
} from '../domain/contracts/rollout/contracts-operational-rollout-flags.ts';
import {
  CONTRACTS_OPERATIONAL_MODES,
  isContractsOperationalUxEnabled,
} from '../domain/contracts/rollout/contracts-operational-mode.ts';
import { PRODUCTION_REF } from '../domain/contracts/staging/contracts-v2-staging-pilot.ts';
import { createContractsOperationalRolloutHandlers } from '../../server/lib/contractsOperationalRolloutApi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

describe('Phase 10.21C — mapeamento feature_flags', () => {
  it('flags canônicas e defaults OFF', () => {
    expect(CONTRACTS_OPERATIONAL_UX_GLOBAL_FLAG).toBe('contracts_operational_ux_global_enabled');
    expect(CONTRACTS_OPERATIONAL_UX_TENANT_FLAG).toBe('contracts_operational_ux_enabled');
    const snap = mapFeatureFlagsToRolloutState('tenant-a', null, null);
    expect(snap.state.productionGlobalEnabled).toBe(false);
    expect(snap.state.tenantEnabled).toBe(false);
    expect(snap.operationalUxEnabled).toBe(false);
  });

  it('runtime exige global && tenant && mode operacional', () => {
    expect(computeOperationalUxEnabled({
      globalEnabled: true,
      tenantEnabled: true,
      mode: 'OPERATIONAL_UX',
    })).toBe(true);
    expect(computeOperationalUxEnabled({
      globalEnabled: true,
      tenantEnabled: true,
      mode: 'ROLLED_BACK',
    })).toBe(false);
    expect(computeOperationalUxEnabled({
      globalEnabled: false,
      tenantEnabled: true,
      mode: 'OPERATIONAL_UX',
    })).toBe(false);
  });

  it('isContractsOperationalUxEnabled respeita SSOT feature_flags', () => {
    expect(isContractsOperationalUxEnabled({
      projectRef: PRODUCTION_REF,
      tenantId: 'tenant-a',
      state: {
        source: 'feature_flags',
        mode: CONTRACTS_OPERATIONAL_MODES.OPERATIONAL_UX,
        productionGlobalEnabled: true,
        tenantEnabled: true,
        productionTenantAllowlist: ['tenant-a'],
      },
    })).toBe(true);

    expect(isContractsOperationalUxEnabled({
      projectRef: PRODUCTION_REF,
      tenantId: 'tenant-a',
      state: {
        source: 'feature_flags',
        mode: CONTRACTS_OPERATIONAL_MODES.OPERATIONAL_UX,
        productionGlobalEnabled: true,
        tenantEnabled: false,
        productionTenantAllowlist: [],
      },
    })).toBe(false);
  });

  it('payload de auditoria inclui actor sem PII sensível', () => {
    const payload = buildRolloutActorPayload({
      mode: CONTRACTS_OPERATIONAL_MODES.ROLLED_BACK,
      rollbackReason: 'incidente',
      changedByUserId: 'user-1',
      changedByRole: 'master',
      auditAction: 'ROLLBACK',
    });
    expect(payload.mode).toBe('ROLLED_BACK');
    expect(payload.rollbackReason).toBe('incidente');
    expect(payload.changedByRole).toBe('master');
    expect(Array.isArray(payload.audit)).toBe(true);
    expect(normalizeRolloutMode('nope')).toBe(CONTRACTS_OPERATIONAL_MODES.V1_ONLY);
  });
});

describe('Phase 10.21C — API handlers', () => {
  function mockRes() {
    const out = { statusCode: 200, body: null };
    return {
      out,
      status(code) { out.statusCode = code; return this; },
      json(payload) { out.body = payload; return this; },
    };
  }

  it('GET retorna estado OFF por default', async () => {
    const supabase = {
      from(table) {
        expect(table).toBe('feature_flags');
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: null, error: null }),
        };
      },
    };
    const { handleGet } = createContractsOperationalRolloutHandlers({
      supabase,
      resolveActiveTenantUser: async () => ({
        tenant_id: 'b721c2c9-d924-41ee-8911-dc00c8208326',
        role: 'master',
        status: 'active',
      }),
      isActiveTenantUserRow: () => true,
      getTenantAdminActorOrThrow: async () => ({
        tenant_id: 'b721c2c9-d924-41ee-8911-dc00c8208326',
        role: 'master',
      }),
    });
    const res = mockRes();
    await handleGet({ appAuthUser: { id: 'u1', email: 'a@b.c' }, query: {}, body: {} }, res);
    expect(res.out.statusCode).toBe(200);
    expect(res.out.body.ok).toBe(true);
    expect(res.out.body.source).toBe('feature_flags');
    expect(res.out.body.operationalUxEnabled).toBe(false);
    expect(res.out.body.state.productionGlobalEnabled).toBe(false);
  });

  it('PUT bloqueia cross-tenant', async () => {
    const { handlePut } = createContractsOperationalRolloutHandlers({
      supabase: { from: () => ({}) },
      resolveActiveTenantUser: async () => ({
        tenant_id: 'tenant-a',
        role: 'master',
        status: 'active',
      }),
      isActiveTenantUserRow: () => true,
      getTenantAdminActorOrThrow: async () => ({
        tenant_id: 'tenant-a',
        role: 'master',
      }),
    });
    const res = mockRes();
    await handlePut({
      appAuthUser: { id: 'u1' },
      query: {},
      body: { tenantId: 'tenant-b', tenantEnabled: true, mode: 'OPERATIONAL_UX' },
    }, res);
    expect(res.out.statusCode).toBe(403);
    expect(res.out.body.code).toBe('TENANT_FORBIDDEN');
  });

  it('artefatos da fase existem', () => {
    const files = [
      'server/lib/contractsOperationalRolloutApi.js',
      'src/domain/contracts/rollout/contracts-operational-rollout-flags.ts',
      'src/services/contractsOperationalRolloutService.js',
      'src/pages/contratos/ContractsRolloutPage.jsx',
    ];
    for (const rel of files) {
      expect(fs.existsSync(path.join(ROOT, rel)), rel).toBe(true);
    }
    const indexSrc = fs.readFileSync(path.join(ROOT, 'server/index.js'), 'utf8');
    expect(indexSrc).toContain('/internal/app/contracts/operational-rollout');
    expect(indexSrc).toContain('operational-rollout/rollback');
  });
});
