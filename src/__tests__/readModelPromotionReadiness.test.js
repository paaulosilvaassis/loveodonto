/**
 * Phase 8.4 — CQRS Read Model Promotion Readiness.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOMAIN_EVENT_FLAG_DEFAULTS,
  DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS,
} from '../domain-events/domainEventFlags.ts';
import {
  attachAnalyticsReadModels,
  detachAllAnalyticsReadModels,
  __clearAnalyticsReadModelAttachForTest,
  __clearReadModelRegistryForTest,
  __clearReadModelBuilderStateForTest,
  __clearReadModelLifecycleForTest,
  __clearReadModelFoundationMetricsForTest,
  __clearReadModelCacheForTest,
  __clearLeadAnalyticsStoreForTest,
  __clearLeadAnalyticsMetricsForTest,
  __clearReadModelSoakMetricsForTest,
  __clearReadModelDriftLogForTest,
  __clearReadModelPromotionHistoryForTest,
  runReadModelSoakValidation,
  buildReadModelPromotionReport,
  evaluateReadModelPromotion,
  runReadModelPromotionChecklist,
  getReadModelPromotionHealth,
  inspectReadModelPromotion,
  inspectReadModelPromotionById,
  inspectReadModelFoundation,
  CQRS_PROMOTION_READ_MODEL_IDS,
} from '../domain-events/read-models/index.ts';
import { __clearAnalyticsProjectionStoreForTest } from '../domain-events/projections/index.ts';
import { DOMAIN_EVENTS_FLAGS_RESOLVED } from './rhTestFlagContract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT_A = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const FLAGS_ON = { overrides: DOMAIN_EVENTS_FLAGS_RESOLVED };
const NOW = '2026-07-13T22:00:00.000Z';

const CRM_PROJ = {
  crm: {
    counters: { leadsCreated: 2, leadsUpdated: 0, leadsMoved: 1 },
    version: 3,
    updatedAt: NOW,
  },
};

function clearAll() {
  detachAllAnalyticsReadModels();
  __clearAnalyticsReadModelAttachForTest();
  __clearReadModelRegistryForTest();
  __clearReadModelBuilderStateForTest();
  __clearReadModelLifecycleForTest();
  __clearReadModelFoundationMetricsForTest();
  __clearReadModelCacheForTest();
  __clearLeadAnalyticsStoreForTest();
  __clearLeadAnalyticsMetricsForTest();
  __clearAnalyticsProjectionStoreForTest();
  __clearReadModelSoakMetricsForTest();
  __clearReadModelDriftLogForTest();
  __clearReadModelPromotionHistoryForTest();
}

describe('readModelPromotionReadiness — contrato / checklist', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('IDs oficiais cobrem os três Read Models', () => {
    expect([...CQRS_PROMOTION_READ_MODEL_IDS]).toEqual([
      'lead-analytics',
      'appointment-analytics',
      'financial-analytics',
    ]);
  });

  it('checklist retorna checks individuais', () => {
    const checks = runReadModelPromotionChecklist('lead-analytics', FLAGS_ON);
    const ids = checks.map((c) => c.checkId);
    expect(ids).toContain('tenant_isolation');
    expect(ids).toContain('projection_scope');
    expect(ids).toContain('registry');
    expect(ids).toContain('lifecycle');
    expect(ids).toContain('snapshot');
    expect(ids).toContain('cache');
    expect(ids).toContain('consistency');
    expect(ids).toContain('drift');
    expect(ids).toContain('soak');
    expect(ids).toContain('health');
    expect(ids).toContain('metrics');
    expect(ids).toContain('inspector');
    expect(ids).toContain('flags');
    expect(ids).toContain('production_guards');
  });

  it('projection_scope tenant passa', () => {
    const checks = runReadModelPromotionChecklist('lead-analytics', FLAGS_ON);
    expect(checks.find((c) => c.checkId === 'projection_scope')?.result).toBe('pass');
  });

  it('flags defaults OFF + production locks', () => {
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.CQRS_READ_MODEL).toBe(false);
    expect(DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS).toContain('CQRS_READ_MODEL');
    const checks = runReadModelPromotionChecklist('financial-analytics', FLAGS_ON);
    expect(checks.find((c) => c.checkId === 'flags')?.result).toBe('pass');
    expect(checks.find((c) => c.checkId === 'production_guards')?.result).toBe('pass');
  });

  it('sem registry → warning / not_ready', () => {
    const contract = evaluateReadModelPromotion('lead-analytics', FLAGS_ON);
    expect(['not_ready', 'warning']).toContain(contract.promotionStatus);
    expect(contract.promotionStatus).not.toBe('ready');
    expect(contract.checks.some((c) => c.checkId === 'registry' && c.result === 'warn')).toBe(true);
  });
});

describe('readModelPromotionReadiness — report / status / readiness', () => {
  beforeEach(() => {
    clearAll();
    attachAnalyticsReadModels(FLAGS_ON);
  });
  afterEach(clearAll);

  it('report consolida três modelos e nunca auto-promove', () => {
    const report = buildReadModelPromotionReport(FLAGS_ON);
    expect(report.autoPromote).toBe(false);
    expect(Object.keys(report.byReadModel)).toEqual(
      expect.arrayContaining([...CQRS_PROMOTION_READ_MODEL_IDS]),
    );
    expect(report.contracts).toHaveLength(3);
    expect(['not_ready', 'warning', 'blocked', 'ready']).toContain(report.overall);
    expect(report.recommendation).not.toMatch(/promot(?!ion)/i);
  });

  it('após soak passing → ready possível', () => {
    for (const id of CQRS_PROMOTION_READ_MODEL_IDS) {
      const snaps =
        id === 'lead-analytics'
          ? CRM_PROJ
          : id === 'appointment-analytics'
            ? {
                appointment: {
                  counters: {
                    appointmentsCreated: 1,
                    appointmentsCancelled: 0,
                    appointmentsRescheduled: 0,
                    appointmentsConfirmed: 0,
                    appointmentsStatusChanged: 0,
                    appointmentsUpdated: 0,
                  },
                  version: 1,
                  updatedAt: NOW,
                },
              }
            : {
                financial: {
                  counters: {
                    receivablesCreated: 1,
                    receivablesUpdated: 0,
                    payablesCreated: 0,
                    payablesUpdated: 0,
                    payablesDeleted: 0,
                    financingsCreated: 0,
                    financingsUpdated: 0,
                    paymentsReceived: 0,
                  },
                  version: 1,
                  updatedAt: NOW,
                },
              };
      const run = runReadModelSoakValidation({
        readModelId: id,
        tenantId: TENANT_A,
        projectionSnapshots: snaps,
        iterations: 2,
        flagsInput: FLAGS_ON,
        now: NOW,
      });
      expect(run.status).toBe('passing');
    }

    const report = buildReadModelPromotionReport(FLAGS_ON);
    expect(report.overall).toBe('ready');
    expect(report.recommendation).toBe('architecturally_ready_awaiting_human');
    expect(report.autoPromote).toBe(false);
    for (const id of CQRS_PROMOTION_READ_MODEL_IDS) {
      expect(report.byReadModel[id]).toBe('ready');
    }
  });

  it('contract contém campos oficiais', () => {
    attachAnalyticsReadModels(FLAGS_ON);
    runReadModelSoakValidation({
      readModelId: 'lead-analytics',
      tenantId: TENANT_A,
      projectionSnapshots: CRM_PROJ,
      flagsInput: FLAGS_ON,
      now: NOW,
    });
    const c = evaluateReadModelPromotion('lead-analytics', FLAGS_ON);
    expect(c.readModelId).toBe('lead-analytics');
    expect(c.projectionScope).toBe('tenant');
    expect(c.tenantScope).toBe('tenant');
    expect(c.lifecycle.autoRebuild).toBe(false);
    expect(c.inspector.available).toBe(true);
    expect(c.promotionStatus).toBeDefined();
    expect(Array.isArray(c.promotionWarnings)).toBe(true);
    expect(Array.isArray(c.promotionBlockers)).toBe(true);
    expect(c.checks.length).toBeGreaterThan(0);
  });
});

describe('readModelPromotionReadiness — inspector / health', () => {
  beforeEach(() => {
    clearAll();
    attachAnalyticsReadModels(FLAGS_ON);
  });
  afterEach(clearAll);

  it('promotion health separado do operacional', () => {
    const health = getReadModelPromotionHealth(FLAGS_ON);
    expect(['blocked', 'warning', 'ready']).toContain(health.overall);
  });

  it('inspector expõe status / blockers / checklist / history', () => {
    const snap = inspectReadModelPromotion(FLAGS_ON);
    expect(snap.autoPromote).toBe(false);
    expect(snap.byReadModel).toHaveLength(3);
    expect(snap.report).toBeTruthy();
    expect(snap.evaluationHistory.length).toBeGreaterThan(0);

    const byId = inspectReadModelPromotionById('appointment-analytics', FLAGS_ON);
    expect(byId.status).toBeDefined();
    expect(byId.checklist.length).toBeGreaterThan(0);
    expect(byId.history.length).toBeGreaterThan(0);
  });

  it('foundation inspector inclui promotion', () => {
    const foundation = inspectReadModelFoundation(FLAGS_ON);
    expect(foundation.promotion.report.autoPromote).toBe(false);
    expect(foundation.promotion.health).toBeTruthy();
  });
});

describe('readModelPromotionReadiness — safety', () => {
  it('sem HTTP / persistência / auto-promote / bootstrap', () => {
    const dir = path.join(__dirname, '../domain-events/read-models/shared');
    for (const f of fs.readdirSync(dir).filter((x) => x.includes('Promotion'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(src).not.toMatch(/indexedDB|localStorage|createClient|express\.|fetch\(/i);
      expect(src).not.toMatch(/\bsetInterval\s*\(|\bsetTimeout\s*\(/);
      expect(src).not.toMatch(/\bstatus\s*[:=]\s*['"]promoted['"]/);
      expect(src).not.toMatch(/flags\.\w+\s*=\s*true/);
    }
  });

  it('não cria flag CQRS_PROMOTION_READINESS (fase sem flag nova)', () => {
    expect(DOMAIN_EVENT_FLAG_DEFAULTS).not.toHaveProperty('CQRS_PROMOTION_READINESS');
  });
});
