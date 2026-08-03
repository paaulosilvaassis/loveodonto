/**
 * Phase 8.5 — CQRS Architecture Certification.
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
} from '../domain-events/read-models/index.ts';
import { __clearAnalyticsProjectionStoreForTest } from '../domain-events/projections/index.ts';
import {
  LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION,
  LOVE_ODONTO_V3_CQRS_CERTIFICATION_VERSION,
  CQRS_CERTIFIED_READ_MODEL_IDS,
  CQRS_RECERTIFICATION_TRIGGERS,
  createCqrsCertificationEvidence,
  assertCqrsCertificationEvidenceValid,
  buildCqrsStagingEvidenceContract,
  buildCqrsHumanApprovalGate,
  runCqrsCertificationGates,
  buildCqrsArchitectureCertificationReport,
  getCqrsArchitectureCertificationHealth,
  inspectCqrsArchitectureCertification,
  __clearCqrsCertificationHistoryForTest,
  __resetCqrsCertificationSeqForTest,
  __resetCqrsCertificationEvidenceSeqForTest,
} from '../domain-events/certification/index.ts';
import { DOMAIN_EVENTS_FLAGS_RESOLVED } from './rhTestFlagContract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT_A = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const FLAGS_ON = { overrides: DOMAIN_EVENTS_FLAGS_RESOLVED };
const NOW = '2026-07-13T22:00:00.000Z';

function projectionFor(id) {
  if (id === 'lead-analytics') {
    return {
      crm: {
        counters: { leadsCreated: 2, leadsUpdated: 0, leadsMoved: 1 },
        version: 3,
        updatedAt: NOW,
      },
    };
  }
  if (id === 'appointment-analytics') {
    return {
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
    };
  }
  return {
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
}

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
  __clearCqrsCertificationHistoryForTest();
  __resetCqrsCertificationSeqForTest();
  __resetCqrsCertificationEvidenceSeqForTest();
}

function runSoakAll() {
  for (const id of CQRS_CERTIFIED_READ_MODEL_IDS) {
    const run = runReadModelSoakValidation({
      readModelId: id,
      tenantId: TENANT_A,
      projectionSnapshots: projectionFor(id),
      iterations: 2,
      flagsInput: FLAGS_ON,
      now: NOW,
    });
    expect(run.status).toBe('passing');
  }
}

describe('cqrsArchitectureCertification — contract / version', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('versão estável e read models oficiais', () => {
    expect(LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION).toBe('3.8.5-cqrs-local');
    expect(LOVE_ODONTO_V3_CQRS_CERTIFICATION_VERSION).toBe('1.0.0');
    expect([...CQRS_CERTIFIED_READ_MODEL_IDS]).toEqual([
      'lead-analytics',
      'appointment-analytics',
      'financial-analytics',
    ]);
  });

  it('contrato imutável + humanApprovalRequired + autoPromotionAllowed false', () => {
    const report = buildCqrsArchitectureCertificationReport(FLAGS_ON);
    expect(report.humanApprovalRequired).toBe(true);
    expect(report.autoPromotionAllowed).toBe(false);
    expect(report.architectureVersion).toBe(LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION);
    expect(report.certificationVersion).toBe(LOVE_ODONTO_V3_CQRS_CERTIFICATION_VERSION);
    expect(Object.isFrozen(report)).toBe(true);
    expect(() => {
      // @ts-expect-error imutabilidade
      report.status = 'promoted';
    }).toThrow();
    expect(report.status).not.toBe('promoted');
    expect(['not_evaluated', 'failed', 'blocked', 'conditional', 'certified']).toContain(
      report.status,
    );
  });

  it('recertification triggers documentados', () => {
    expect(CQRS_RECERTIFICATION_TRIGGERS.length).toBeGreaterThanOrEqual(10);
    expect(CQRS_RECERTIFICATION_TRIGGERS.map((t) => t.triggerId)).toContain('new_read_model');
  });
});

describe('cqrsArchitectureCertification — evidence', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('evidência válida e sanitizada', () => {
    const ev = createCqrsCertificationEvidence({
      gateId: 'domain_event_integrity',
      source: 'test',
      type: 'contract',
      description: 'ok',
      result: 'pass',
      detailsSanitized: 'noop',
    });
    expect(assertCqrsCertificationEvidenceValid(ev).valid).toBe(true);
  });

  it('rejeita conteúdo sensível', () => {
    const ev = createCqrsCertificationEvidence({
      gateId: 'domain_event_integrity',
      source: 'test',
      type: 'contract',
      description: 'password leak',
      result: 'pass',
      detailsSanitized: 'password=secret',
    });
    expect(assertCqrsCertificationEvidenceValid(ev).valid).toBe(false);
  });

  it('staging ausente = manual-required', () => {
    const staging = buildCqrsStagingEvidenceContract();
    expect(staging.state).toBe('manual-required');
    expect(staging.result).toBeNull();
  });

  it('human approval permanece pending', () => {
    const human = buildCqrsHumanApprovalGate();
    expect(human.state).toBe('pending');
    expect(human.required).toBe(true);
  });
});

describe('cqrsArchitectureCertification — gates', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('sete gates formais existem', () => {
    const { gates } = runCqrsCertificationGates(FLAGS_ON);
    const ids = gates.map((g) => g.gateId);
    expect(ids).toEqual([
      'domain_event_integrity',
      'tenant_isolation',
      'read_model_consistency',
      'soak_validation',
      'promotion_readiness',
      'production_safety',
      'regression',
    ]);
  });

  it('domain_event_integrity e production_safety passam estruturalmente', () => {
    const { gates } = runCqrsCertificationGates(FLAGS_ON);
    expect(gates.find((g) => g.gateId === 'domain_event_integrity')?.result).toBe('pass');
    expect(gates.find((g) => g.gateId === 'production_safety')?.result).toBe('pass');
    expect(gates.find((g) => g.gateId === 'regression')?.result).toBe('pass');
  });

  it('tenant_isolation passa com scopes tenant', () => {
    const { gates } = runCqrsCertificationGates(FLAGS_ON);
    expect(gates.find((g) => g.gateId === 'tenant_isolation')?.result).toBe('pass');
  });
});

describe('cqrsArchitectureCertification — report / certified', () => {
  beforeEach(() => {
    clearAll();
    attachAnalyticsReadModels(FLAGS_ON);
  });
  afterEach(clearAll);

  it('sem soak → conditional (não certified por falta de evidência)', () => {
    const report = buildCqrsArchitectureCertificationReport(FLAGS_ON);
    expect(['conditional', 'not_evaluated']).toContain(report.status);
    expect(report.status).not.toBe('certified');
    expect(report.humanApproval.state).toBe('pending');
    expect(report.staging.state).toBe('manual-required');
    expect(report.autoPromotionAllowed).toBe(false);
  });

  it('após attach + soak → certified local + recommendation correta', () => {
    runSoakAll();
    const report = buildCqrsArchitectureCertificationReport(FLAGS_ON);
    expect(report.status).toBe('certified');
    expect(report.recommendation).toBe(
      'architecture_certified_awaiting_staging_and_human_approval',
    );
    expect(report.autoPromotionAllowed).toBe(false);
    expect(report.humanApproval.state).toBe('pending');
    expect(report.staging.state).toBe('manual-required');
    expect(report.blockers).toEqual([]);
    expect(report.statement).toMatch(/Architecture Certified ≠ Production Promoted/);
    for (const id of CQRS_CERTIFIED_READ_MODEL_IDS) {
      expect(report.byReadModel[id]).toBe('certified');
    }
  });

  it('nunca recomenda promoção automática', () => {
    runSoakAll();
    const report = buildCqrsArchitectureCertificationReport(FLAGS_ON);
    expect(report.recommendation).not.toMatch(/auto.?promot/i);
    expect(report.recommendation).not.toBe('promote');
  });
});

describe('cqrsArchitectureCertification — inspector / health', () => {
  beforeEach(() => {
    clearAll();
    attachAnalyticsReadModels(FLAGS_ON);
  });
  afterEach(clearAll);

  it('health certificado localmente; promoção operacional false', () => {
    runSoakAll();
    const health = getCqrsArchitectureCertificationHealth(FLAGS_ON);
    expect(health.overall).toBe('certified');
    expect(health.operationalPromotionAuthorized).toBe(false);
  });

  it('inspector: histórico, human pending, staging pending', () => {
    runSoakAll();
    const snap = inspectCqrsArchitectureCertification(FLAGS_ON);
    expect(snap.current.status).toBe('certified');
    expect(snap.humanApprovalState).toBe('pending');
    expect(snap.stagingState).toBe('manual-required');
    expect(snap.autoPromotionAllowed).toBe(false);
    expect(snap.history.length).toBeGreaterThan(0);
    expect(snap.recertificationTriggers.length).toBeGreaterThanOrEqual(10);
  });
});

describe('cqrsArchitectureCertification — safety / flags', () => {
  it('flags defaults OFF e locks preservados', () => {
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.DOMAIN_EVENTS).toBe(false);
    expect(DOMAIN_EVENT_FLAG_DEFAULTS.CQRS_READ_MODEL).toBe(false);
    expect(DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS).toContain('CQRS_READ_MODEL');
    expect(DOMAIN_EVENT_PRODUCTION_LOCKED_FLAGS).toContain('LEAD_ANALYTICS_READ_MODEL');
  });

  it('camada certification sem HTTP / UI / persistência', () => {
    const dir = path.join(__dirname, '../domain-events/certification');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));
    const forbiddenImport = /from\s+['"][^'"]*(?:Repository|supabase)[^'"]*['"]/;
    for (const f of files) {
      if (f === 'cqrsCertificationGates.ts') continue; // scanner estático
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(src).not.toMatch(forbiddenImport);
      expect(src).not.toMatch(/createClient\(/);
      expect(src).not.toMatch(/\bapp\.(get|post|use)\(/);
    }
  });

  it('manifesto normativo existe', () => {
    const p = path.join(
      __dirname,
      '../../docs/platform/LOVE_ODONTO_V3_CQRS_ARCHITECTURE_CERTIFICATION.md',
    );
    expect(fs.existsSync(p)).toBe(true);
  });
});
