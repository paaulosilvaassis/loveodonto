/**
 * Phase 10.20 — Production Readiness & Gradual Rollout
 */

import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb } from '../db/index.js';
import {
  CONTRACTS_OPERATIONAL_MODES,
  CONTRACTS_ROLLOUT_PHASES,
  DEFAULT_OPERATIONAL_MODE_STATE,
  isContractsOperationalUxEnabled,
  buildRollbackState,
  evaluateGoLiveReadiness,
  canManageContractsOperationalMode,
} from '../domain/contracts/rollout/contracts-operational-mode.ts';
import {
  createEmptyMetricCounters,
  incrementMetric,
  summarizeMetrics,
  deriveMetricAlerts,
} from '../domain/contracts/rollout/contracts-rollout-metrics.ts';
import {
  emergencyRollbackOperationalUx,
  enableOperationalUxMode,
  getContractsOperationalModeState,
  getGoLiveCriteriaStatus,
  isOperationalContractsUxEnabledForCurrentClinic,
  recordContractsRolloutMetric,
  setProductionGlobalEnabled,
  setV1OnlyMode,
  updateProductionTenantAllowlist,
} from '../services/contractsOperationalRolloutService.js';
import { PRODUCTION_REF } from '../domain/contracts/staging/contracts-v2-staging-pilot.ts';
import { contractsShellNavItems } from '../contracts/contractsShellConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const admin = { id: 'u-admin', role: 'admin', tenantId: 'tenant-a' };
const recep = { id: 'u-rec', role: 'recepcao', tenantId: 'tenant-a' };

beforeEach(async () => {
  localStorage.clear();
  await resetDb();
  await initDb();
});

describe('Phase 10.20 — modo operacional e rollback', () => {
  it('default não ativa produção global', () => {
    expect(DEFAULT_OPERATIONAL_MODE_STATE.productionGlobalEnabled).toBe(false);
    expect(DEFAULT_OPERATIONAL_MODE_STATE.productionTenantAllowlist).toEqual([]);
    expect(DEFAULT_OPERATIONAL_MODE_STATE.rolloutPhase).toBe(
      CONTRACTS_ROLLOUT_PHASES.READY_FOR_PRODUCTION_ACTIVATION,
    );
  });

  it('em staging/dev, OPERATIONAL_UX habilita o wizard', () => {
    expect(isContractsOperationalUxEnabled({
      state: { mode: CONTRACTS_OPERATIONAL_MODES.OPERATIONAL_UX },
      projectRef: 'tckdjyunwmdpqmewrwvt',
      tenantId: 'tenant-a',
    })).toBe(true);
  });

  it('em produção, UX fica OFF sem global + allowlist', () => {
    expect(isContractsOperationalUxEnabled({
      state: {
        mode: CONTRACTS_OPERATIONAL_MODES.OPERATIONAL_UX,
        productionGlobalEnabled: false,
        productionTenantAllowlist: ['tenant-a'],
      },
      projectRef: PRODUCTION_REF,
      tenantId: 'tenant-a',
    })).toBe(false);

    expect(isContractsOperationalUxEnabled({
      state: {
        mode: CONTRACTS_OPERATIONAL_MODES.OPERATIONAL_UX,
        productionGlobalEnabled: true,
        productionTenantAllowlist: ['tenant-a'],
      },
      projectRef: PRODUCTION_REF,
      tenantId: 'tenant-a',
    })).toBe(true);

    expect(isContractsOperationalUxEnabled({
      state: {
        mode: CONTRACTS_OPERATIONAL_MODES.OPERATIONAL_UX,
        productionGlobalEnabled: true,
        productionTenantAllowlist: ['outro'],
      },
      projectRef: PRODUCTION_REF,
      tenantId: 'tenant-a',
    })).toBe(false);
  });

  it('rollback imediato desliga UX e registra auditoria', () => {
    enableOperationalUxMode(admin);
    expect(isOperationalContractsUxEnabledForCurrentClinic(admin)).toBe(true);
    const state = emergencyRollbackOperationalUx(admin, 'teste fase 10.20');
    expect(state.mode).toBe(CONTRACTS_OPERATIONAL_MODES.ROLLED_BACK);
    expect(state.productionGlobalEnabled).toBe(false);
    expect(isOperationalContractsUxEnabledForCurrentClinic(admin)).toBe(false);
    expect(getContractsOperationalModeState().rollbackReason).toContain('teste');
  });

  it('recepção não pode rollback', () => {
    expect(canManageContractsOperationalMode(recep)).toBe(false);
    expect(() => emergencyRollbackOperationalUx(recep, 'x')).toThrow(/Permissão/);
  });

  it('V1_ONLY desliga wizard', () => {
    setV1OnlyMode(admin, 'painel');
    expect(isOperationalContractsUxEnabledForCurrentClinic(admin)).toBe(false);
  });

  it('ativação global exige frase de confirmação', () => {
    expect(() => setProductionGlobalEnabled(admin, true, 'errada')).toThrow(/Confirmação/);
    const state = setProductionGlobalEnabled(admin, true, 'ATIVAR_PRODUCAO_OPERATIONAL_UX');
    expect(state.productionGlobalEnabled).toBe(true);
    const off = setProductionGlobalEnabled(admin, false, '');
    expect(off.productionGlobalEnabled).toBe(false);
  });

  it('allowlist não liga global automaticamente', () => {
    updateProductionTenantAllowlist(admin, ['tenant-a', 'tenant-b']);
    const state = getContractsOperationalModeState();
    expect(state.productionTenantAllowlist).toEqual(['tenant-a', 'tenant-b']);
    expect(state.productionGlobalEnabled).toBe(false);
  });

  it('buildRollbackState zera produção global', () => {
    const next = buildRollbackState({
      ...DEFAULT_OPERATIONAL_MODE_STATE,
      productionGlobalEnabled: true,
      mode: CONTRACTS_OPERATIONAL_MODES.OPERATIONAL_UX,
    }, { reason: 'emergencia' });
    expect(next.mode).toBe(CONTRACTS_OPERATIONAL_MODES.ROLLED_BACK);
    expect(next.productionGlobalEnabled).toBe(false);
  });
});

describe('Phase 10.20 — métricas', () => {
  it('incrementa e resume sem PII', () => {
    let c = createEmptyMetricCounters();
    c = incrementMetric(c, 'wizard_opened');
    c = incrementMetric(c, 'wizard_completed');
    c = incrementMetric(c, 'public_sign_opened', 5);
    c = incrementMetric(c, 'public_sign_completed', 2);
    const summary = summarizeMetrics(c);
    expect(summary.wizardCompletionRate).toBe(100);
    expect(summary.publicSuccessRate).toBe(40);
    const alerts = deriveMetricAlerts(summary);
    expect(alerts.some((a) => a.level === 'critical')).toBe(true);
  });

  it('serviço persiste métricas localmente', () => {
    recordContractsRolloutMetric('wizard_opened', admin);
    recordContractsRolloutMetric('wizard_completed', admin);
    const s = summarizeMetrics(
      JSON.parse(localStorage.getItem('loveodonto.contracts.operationalRollout.v1')).metrics,
    );
    expect(s.wizardOpened).toBe(1);
    expect(s.wizardCompleted).toBe(1);
  });
});

describe('Phase 10.20 — go-live e artefatos', () => {
  it('critérios objetivos atingem READY_FOR_PRODUCTION_ACTIVATION', () => {
    const ready = evaluateGoLiveReadiness({
      legalChecklistComplete: true,
      trainingDocReady: true,
      rollbackTested: true,
      monitoringReady: true,
    });
    expect(ready.ready).toBe(true);
    expect(ready.gate).toBe('READY_FOR_PRODUCTION_ACTIVATION');
    expect(getGoLiveCriteriaStatus().gate).toBe('READY_FOR_PRODUCTION_ACTIVATION');
  });

  it('documentação e painel existem', () => {
    const files = [
      'docs/reports/PHASE_10_20_PRODUCTION_READINESS.md',
      'docs/contracts/TRAINING_10_MIN.md',
      'docs/contracts/LEGAL_CHECKLIST.md',
      'docs/contracts/EMERGENCY_ROLLBACK.md',
      'docs/contracts/TENANT_BY_TENANT_ROLLOUT.md',
      'src/pages/contratos/ContractsRolloutPage.jsx',
      'src/domain/contracts/rollout/contracts-operational-mode.ts',
      'src/domain/contracts/rollout/contracts-rollout-metrics.ts',
      'src/services/contractsOperationalRolloutService.js',
    ];
    for (const rel of files) {
      expect(fs.existsSync(path.join(ROOT, rel)), rel).toBe(true);
    }
  });

  it('nav rollout admin-only e rota protegida no shell', () => {
    const item = contractsShellNavItems.find((n) => n.id === 'rollout');
    expect(item?.route).toBe('/gestao/contratos/rollout');
    expect(item?.rolesAllowed).toEqual(['admin', 'master']);
    const protectedApp = fs.readFileSync(path.join(ROOT, 'src/ProtectedApp.jsx'), 'utf8');
    expect(protectedApp).toContain('ContractsRolloutPage');
    expect(protectedApp).toContain('path="rollout"');
  });

  it('hub respeita operationalUxEnabled', () => {
    const hub = fs.readFileSync(path.join(ROOT, 'src/pages/BudgetsHubPage.jsx'), 'utf8');
    expect(hub).toContain('isOperationalContractsUxEnabledForCurrentClinic');
    expect(hub).toContain('operationalUxEnabled');
    const card = fs.readFileSync(path.join(ROOT, 'src/components/budgets/BudgetHubCard.jsx'), 'utf8');
    expect(card).toContain('operationalUxEnabled = true');
  });

  it('não há migration/schema/RLS nesta fase', () => {
    const report = fs.readFileSync(
      path.join(ROOT, 'docs/reports/PHASE_10_20_PRODUCTION_READINESS.md'),
      'utf8',
    );
    expect(report).toMatch(/Sem migration|sem migration/i);
    expect(report).toMatch(/READY_FOR_PRODUCTION_ACTIVATION/);
    expect(report).toMatch(/Não ativar produção automaticamente|não ativa produção/i);
  });
});
