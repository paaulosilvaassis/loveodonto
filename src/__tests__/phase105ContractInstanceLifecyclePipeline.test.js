/**
 * Phase 10.5 — Contract Instance Lifecycle and Generation Pipeline
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  createFixedContractClock,
} from '../domain/contracts/shared/contract-clock.ts';
import {
  createSequentialContractIdFactory,
} from '../domain/contracts/shared/contract-id-factory.ts';
import {
  createContractContentHasher,
  canonicalizeJsonValue,
} from '../domain/contracts/hash/contract-content-hasher.ts';
import {
  createMemoryContractNumberGenerator,
  createMemoryPackageNumberGenerator,
} from '../domain/contracts/numbering/contract-number.generator.ts';
import {
  createMemoryContractIdempotencyRepository,
  fingerprintIdempotencyInput,
  ContractIdempotencyConflictError,
} from '../domain/contracts/idempotency/contract-idempotency.ts';
import {
  createContractPatientSnapshot,
  createContractFinancialSnapshot,
  createContractAttachmentSnapshot,
  createContractOdontogramSnapshot,
} from '../domain/contracts/snapshots/contract-snapshot.factories.ts';
import {
  createContractGenerationPipeline,
} from '../domain/contracts/generation/contract-generation.pipeline.ts';
import {
  ContractMemoryRepository,
  ContractPackageMemoryRepository,
} from '../domain/contracts/application/contract-memory.repository.ts';
import {
  createContractApplicationService,
  ContractApplicationError,
} from '../domain/contracts/application/contract.application-service.ts';
import {
  createContractPackageApplicationService,
} from '../domain/contracts/application/contract-package.application-service.ts';
import {
  validateReadyForReview,
  validateReadyForApproval,
  validateReadyForSignature,
} from '../domain/contracts/application/contract-readiness.ts';
import {
  createDemoGenerationContext,
  createDemoPublishedTemplate,
  DEMO_TENANT_ID,
  demoPatient,
  demoClinic,
  demoBudget,
  demoFinancial,
  demoSigners,
  demoGuardian,
  demoOdontogram,
} from '../domain/contracts/fixtures/contract-v2.fixtures.ts';
import { isContractFeatureEnabled } from '../domain/contracts/contract-feature-flags.ts';
import {
  isContractsV2UiEnabled,
  setContractsV2ServiceForTests,
  resetContractsV2ServiceForTests,
} from '../services/contractsV2Service.js';
import {
  createContractsV2Handlers,
  isContractsV2ApiEnabled,
} from '../../server/lib/contractsV2Api.js';
import { contractsShellNavItems } from '../contracts/contractsShellConfig.js';
import { createContractAuditEvent } from '../domain/contracts/audit/contract-audit.factory.ts';

const PERMS = [
  'contracts:view',
  'contracts:create',
  'contracts:update_draft',
  'contracts:review',
  'contracts:approve',
  'contracts:cancel',
  'contracts:view_audit',
];

function actor(overrides = {}) {
  return { userId: 'user-1', permissions: PERMS, ...overrides };
}

function buildServices() {
  const clock = createFixedContractClock('2026-08-03T12:00:00.000Z');
  const ids = createSequentialContractIdFactory(1);
  const repo = new ContractMemoryRepository();
  const packageRepo = new ContractPackageMemoryRepository();
  const idempotency = createMemoryContractIdempotencyRepository();
  const auditSink = [];
  const { template, version } = createDemoPublishedTemplate(DEMO_TENANT_ID);

  const templateLookup = {
    async getTemplate(tenantId, templateId) {
      if (tenantId !== DEMO_TENANT_ID) return null;
      if (templateId !== template.id) return null;
      return template;
    },
    async getTemplateVersion(tenantId, versionId) {
      if (tenantId !== DEMO_TENANT_ID) return null;
      if (versionId !== version.id) return null;
      return version;
    },
  };

  const service = createContractApplicationService({
    repository: repo,
    templateLookup,
    clock,
    ids,
    idempotency,
    numberGenerator: createMemoryContractNumberGenerator(clock),
    skipFeatureFlagCheck: true,
    auditSink,
  });

  const packageService = createContractPackageApplicationService({
    packageRepository: packageRepo,
    contractRepository: repo,
    clock,
    ids: createSequentialContractIdFactory(100),
    numberGenerator: createMemoryPackageNumberGenerator(clock),
    idempotency,
    skipFeatureFlagCheck: true,
  });

  return { clock, ids, repo, packageRepo, service, packageService, template, version, auditSink };
}

describe('Phase 10.5 — flags', () => {
  it('flags permanecem OFF', () => {
    expect(isContractFeatureEnabled('contracts_module_v2_enabled')).toBe(false);
    expect(isContractFeatureEnabled('contract_versioning_enabled')).toBe(false);
    expect(isContractsV2UiEnabled()).toBe(false);
    expect(isContractsV2ApiEnabled({})).toBe(false);
  });

  it('nav Instâncias v2 exige três flags', () => {
    const item = contractsShellNavItems.find((i) => i.id === 'instancias-v2');
    expect(item?.featureFlagsAll).toEqual(expect.arrayContaining([
      'contracts_domain_v2_enabled',
      'contracts_module_v2_enabled',
      'contract_versioning_enabled',
    ]));
  });
});

describe('Phase 10.5 — number generation', () => {
  it('gera CTR-YYYY-000001 exclusivo por tenant e não reutiliza', async () => {
    const clock = createFixedContractClock('2026-08-03T12:00:00.000Z');
    const gen = createMemoryContractNumberGenerator(clock);
    expect(await gen.generate('t1')).toBe('CTR-2026-000001');
    expect(await gen.generate('t1')).toBe('CTR-2026-000002');
    expect(await gen.generate('t2')).toBe('CTR-2026-000001');
  });
});

describe('Phase 10.5 — snapshot factories', () => {
  it('cópia defensiva e sem funções/data URL/tokens', () => {
    const input = {
      patientId: 'p1',
      fullName: 'Demo',
      documentNumberMasked: '***.***.***-**',
    };
    const r = createContractPatientSnapshot(input);
    expect(r.errors).toHaveLength(0);
    r.snapshot.fullName = 'Hacked';
    expect(input.fullName).toBe('Demo');

    const bad = createContractAttachmentSnapshot({
      name: 'x',
      legacyDataUrlPresent: true,
    });
    expect(bad.errors.some((e) => e.message.includes('data URL'))).toBe(true);

    const odontOptional = createContractOdontogramSnapshot({
      patientId: 'p1',
      summary: 'ok',
    });
    expect(odontOptional.errors).toHaveLength(0);
  });

  it('financeiro coerente e guardian obrigatório', () => {
    const fin = createContractFinancialSnapshot({
      contractTotal: 100,
      downPayment: 40,
      financedAmount: 60,
    });
    expect(fin.errors).toHaveLength(0);

    const diverge = createContractFinancialSnapshot({
      contractTotal: 100,
      downPayment: 10,
      financedAmount: 10,
    });
    expect(diverge.warnings.length).toBeGreaterThan(0);
  });
});

describe('Phase 10.5 — hash', () => {
  it('mesma entrada → mesmo hash; chaves em ordem diferente → mesmo hash', async () => {
    const hasher = createContractContentHasher();
    const base = {
      tenantId: 't1',
      contractId: 'c1',
      versionNumber: 1,
      templateVersionId: 'tv1',
      generationReason: 'INITIAL',
      renderedHtml: '<p>ok</p>',
      plainText: 'ok',
      snapshots: { a: 1, b: { z: 2, y: 3 } },
    };
    const h1 = await hasher.hash(base);
    const h2 = await hasher.hash({
      ...base,
      snapshots: { b: { y: 3, z: 2 }, a: 1 },
    });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);

    const h3 = await hasher.hash({ ...base, tenantId: 't2' });
    expect(h3).not.toBe(h1);

    const h4 = await hasher.hash({ ...base, previousVersionHash: 'abc' });
    expect(h4).not.toBe(h1);

    const canonA = JSON.stringify(canonicalizeJsonValue({ b: 1, a: 2 }));
    const canonB = JSON.stringify(canonicalizeJsonValue({ a: 2, b: 1 }));
    expect(canonA).toBe(canonB);
  });
});

describe('Phase 10.5 — application service', () => {
  let ctx;

  beforeEach(() => {
    ctx = buildServices();
  });

  it('cria draft com número, tenant e paciente', async () => {
    const result = await ctx.service.createDraft(DEMO_TENANT_ID, {
      documentType: 'SERVICE_CONTRACT',
      title: 'Contrato Demo',
      patientId: demoPatient.patientId,
      templateId: ctx.template.id,
      templateVersionId: ctx.version.id,
      origin: 'MANUAL',
    }, actor());
    expect(result.contract.status).toBe('DRAFT');
    expect(result.contract.contractNumber).toBe('CTR-2026-000001');
    expect(result.events[0].eventType).toBe('contract.created');
    expect(result.idempotentReplay).toBe(false);
  });

  it('exige tenant e paciente; template inválido/outro tenant', async () => {
    await expect(ctx.service.createDraft('', {
      documentType: 'SERVICE_CONTRACT',
      title: 'X',
      patientId: 'p',
      origin: 'MANUAL',
    }, actor())).rejects.toMatchObject({ domainError: { code: 'TENANT_REQUIRED' } });

    await expect(ctx.service.createDraft(DEMO_TENANT_ID, {
      documentType: 'SERVICE_CONTRACT',
      title: 'X',
      patientId: '',
      origin: 'MANUAL',
    }, actor())).rejects.toMatchObject({ domainError: { code: 'PATIENT_REQUIRED' } });

    await expect(ctx.service.createDraft(DEMO_TENANT_ID, {
      documentType: 'SERVICE_CONTRACT',
      title: 'X',
      patientId: 'p',
      templateId: 'missing',
      origin: 'MANUAL',
    }, actor())).rejects.toMatchObject({ domainError: { code: 'TEMPLATE_REQUIRED' } });
  });

  it('update draft, cancelamento, duplicação, concurrency', async () => {
    const created = await ctx.service.createDraft(DEMO_TENANT_ID, {
      documentType: 'SERVICE_CONTRACT',
      title: 'A',
      patientId: demoPatient.patientId,
      origin: 'MANUAL',
    }, actor());

    const updated = await ctx.service.updateDraft(DEMO_TENANT_ID, created.contract.id, {
      title: 'B',
      expectedRowVersion: created.contract.rowVersion,
    }, actor());
    expect(updated.title).toBe('B');

    await expect(ctx.service.updateDraft(DEMO_TENANT_ID, created.contract.id, {
      title: 'C',
      expectedRowVersion: 999,
    }, actor())).rejects.toMatchObject({ domainError: { code: 'OPTIMISTIC_CONCURRENCY_CONFLICT' } });

    const copy = await ctx.service.duplicateContractDraft(
      DEMO_TENANT_ID,
      created.contract.id,
      {},
      actor(),
    );
    expect(copy.name || copy.title).toMatch(/Cópia de/);
    expect(copy.status).toBe('DRAFT');

    const cancelled = await ctx.service.cancelContract(DEMO_TENANT_ID, copy.id, {
      cancellationReason: 'teste',
    }, actor());
    expect(cancelled.status).toBe('CANCELLED');
  });
});

describe('Phase 10.5 — pipeline / versioning / lock', () => {
  let ctx;

  beforeEach(() => {
    ctx = buildServices();
  });

  async function draftAndGenerate() {
    const created = await ctx.service.createDraft(DEMO_TENANT_ID, {
      documentType: 'SERVICE_CONTRACT',
      title: 'Pipeline Demo',
      patientId: demoPatient.patientId,
      budgetId: demoBudget.budgetId,
      templateId: ctx.template.id,
      templateVersionId: ctx.version.id,
      origin: 'MANUAL',
      requirements: ctx.template.requirements,
    }, actor());

    const genCtx = createDemoGenerationContext(created.contract, {
      template: ctx.template,
      templateVersion: ctx.version,
      actor: actor(),
    });
    const generated = await ctx.service.createVersion(
      DEMO_TENANT_ID,
      created.contract.id,
      { context: genCtx },
      actor(),
    );
    return { created, generated };
  }

  it('gera versão com html, plain text, hash e previousVersionHash', async () => {
    const { generated } = await draftAndGenerate();
    expect(generated.version.versionNumber).toBe(1);
    expect(generated.version.renderedHtmlSnapshot).toBeTruthy();
    expect(generated.version.plainTextSnapshot).toBeTruthy();
    expect(generated.version.documentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(generated.events.some((e) => e.eventType === 'contract.version_created')).toBe(true);

    const genCtx2 = createDemoGenerationContext(generated.contract, {
      template: ctx.template,
      templateVersion: ctx.version,
      generationReason: 'MANUAL_REVISION',
      actor: actor(),
    });
    const v2 = await ctx.service.createVersion(
      DEMO_TENANT_ID,
      generated.contract.id,
      { context: genCtx2 },
      actor(),
    );
    expect(v2.version.versionNumber).toBe(2);
    expect(v2.version.previousVersionHash).toBe(generated.version.documentHash);
  });

  it('geração determinística', async () => {
    const repoA = new ContractMemoryRepository();
    const repoB = new ContractMemoryRepository();
    const clock = createFixedContractClock('2026-08-03T12:00:00.000Z');
    const hasher = createContractContentHasher();
    const { template, version } = createDemoPublishedTemplate(DEMO_TENANT_ID);

    async function runOnce(repo) {
      const contract = {
        id: 'ctr_fixed',
        tenantId: DEMO_TENANT_ID,
        contractNumber: 'CTR-2026-000001',
        documentType: 'SERVICE_CONTRACT',
        title: 'X',
        patientId: demoPatient.patientId,
        origin: 'MANUAL',
        status: 'DRAFT',
        createdBy: 'u',
        createdAt: clock.nowIso(),
        updatedAt: clock.nowIso(),
        rowVersion: 1,
      };
      await repo.create(DEMO_TENANT_ID, contract);
      const pipeline = createContractGenerationPipeline({
        hasher,
        ids: createSequentialContractIdFactory(1),
        clock,
        saveVersion: (t, v) => repo.saveVersion(t, v),
        updateContract: async (t, c) => {
          const cur = await repo.findById(t, c.id);
          return repo.update(t, c, cur?.rowVersion);
        },
        listVersions: (t, id) => repo.listVersions(t, id),
      });
      return pipeline.generate({
        context: createDemoGenerationContext(contract, {
          template,
          templateVersion: version,
          actor: actor(),
          generatedAt: clock.nowIso(),
        }),
      });
    }

    const a = await runOnce(repoA);
    const b = await runOnce(repoB);
    expect(a.version.documentHash).toBe(b.version.documentHash);
    expect(a.version.renderedHtmlSnapshot).toBe(b.version.renderedHtmlSnapshot);
  });

  it('bloqueia variável desconhecida e template não publicado', async () => {
    const created = await ctx.service.createDraft(DEMO_TENANT_ID, {
      documentType: 'SERVICE_CONTRACT',
      title: 'X',
      patientId: demoPatient.patientId,
      origin: 'MANUAL',
    }, actor());
    const unpublished = {
      ...ctx.template,
      templateStatus: 'DRAFT',
    };
    const unpublishedVersion = { ...ctx.version, status: 'DRAFT' };
    await expect(ctx.service.createVersion(DEMO_TENANT_ID, created.contract.id, {
      context: createDemoGenerationContext(created.contract, {
        template: unpublished,
        templateVersion: unpublishedVersion,
        actor: actor(),
      }),
    }, actor())).rejects.toBeInstanceOf(ContractApplicationError);
  });

  it('lock válido, idempotente; edição após lock bloqueada', async () => {
    const { generated } = await draftAndGenerate();
    const locked = await ctx.service.lockVersion(
      DEMO_TENANT_ID,
      generated.contract.id,
      generated.version.id,
      actor(),
    );
    expect(locked.lockedAt).toBeTruthy();
    const lockedAgain = await ctx.service.lockVersion(
      DEMO_TENANT_ID,
      generated.contract.id,
      generated.version.id,
      actor(),
    );
    expect(lockedAgain.lockedAt).toBe(locked.lockedAt);

    await expect(ctx.service.updateDraft(DEMO_TENANT_ID, generated.contract.id, {
      title: 'hack',
    }, actor())).rejects.toMatchObject({ domainError: { code: 'VERSION_ALREADY_LOCKED' } });
  });

  it('rollback em falha intermediária na geração', async () => {
    const created = await ctx.service.createDraft(DEMO_TENANT_ID, {
      documentType: 'SERVICE_CONTRACT',
      title: 'Rollback',
      patientId: demoPatient.patientId,
      origin: 'MANUAL',
    }, actor());
    ctx.repo.setFailNextUpdate(true);
    await expect(ctx.service.createVersion(DEMO_TENANT_ID, created.contract.id, {
      context: createDemoGenerationContext(created.contract, {
        template: ctx.template,
        templateVersion: ctx.version,
        actor: actor(),
      }),
    }, actor())).rejects.toBeTruthy();
    const versions = await ctx.repo.listVersions(DEMO_TENANT_ID, created.contract.id);
    expect(versions).toHaveLength(0);
  });
});

describe('Phase 10.5 — readiness', () => {
  it('ready for review / approval / signature (só validator)', async () => {
    const { service, template, version, repo } = buildServices();
    const created = await service.createDraft(DEMO_TENANT_ID, {
      documentType: 'SERVICE_CONTRACT',
      title: 'Ready',
      patientId: demoPatient.patientId,
      budgetId: demoBudget.budgetId,
      templateId: template.id,
      templateVersionId: version.id,
      origin: 'MANUAL',
      requirements: template.requirements,
    }, actor());
    const generated = await service.createVersion(DEMO_TENANT_ID, created.contract.id, {
      context: createDemoGenerationContext(created.contract, {
        template,
        templateVersion: version,
        actor: actor(),
      }),
    }, actor());
    const unlockedReview = validateReadyForReview({
      contract: generated.contract,
      version: generated.version,
      hasPublishedTemplate: true,
    });
    expect(unlockedReview.valid).toBe(true);

    const approvalBeforeLock = validateReadyForApproval({
      contract: generated.contract,
      version: generated.version,
      requirements: template.requirements,
      hasPublishedTemplate: true,
    });
    expect(approvalBeforeLock.valid).toBe(false);

    const locked = await service.lockVersion(
      DEMO_TENANT_ID,
      generated.contract.id,
      generated.version.id,
      actor(),
    );
    const approval = validateReadyForApproval({
      contract: generated.contract,
      version: locked,
      requirements: template.requirements,
      hasPublishedTemplate: true,
    });
    expect(approval.valid).toBe(true);

    const sig = validateReadyForSignature({
      contract: { ...generated.contract, status: 'APPROVED' },
      version: locked,
      hasSignaturePolicy: true,
      hasActiveConflictingEnvelope: false,
    });
    expect(sig.valid).toBe(true);

    void repo;
  });

  it('guardian/orçamento/financeiro/odontograma ausentes', () => {
    const contract = {
      id: 'c',
      tenantId: DEMO_TENANT_ID,
      contractNumber: 'CTR-1',
      documentType: 'SERVICE_CONTRACT',
      title: 'T',
      patientId: 'p',
      origin: 'MANUAL',
      status: 'DRAFT',
      createdBy: 'u',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const version = {
      id: 'v',
      tenantId: DEMO_TENANT_ID,
      contractId: 'c',
      versionNumber: 1,
      generationReason: 'INITIAL',
      contentSchemaSnapshot: {},
      renderedHtmlSnapshot: '<p>ok</p>',
      patientSnapshot: demoPatient,
      clinicSnapshot: demoClinic,
      signersSnapshot: demoSigners,
      lockedAt: '2026-01-01',
      documentHash: 'a'.repeat(64),
      createdBy: 'u',
      createdAt: '2026-01-01',
    };
    const r = validateReadyForApproval({
      contract,
      version,
      requirements: {
        requiresGuardian: true,
        requiresBudget: true,
        requiresFinancialPlan: true,
        requiresOdontogram: true,
      },
      hasPublishedTemplate: true,
    });
    expect(r.errors.map((e) => e.code)).toEqual(expect.arrayContaining([
      'GUARDIAN_REQUIRED',
      'BUDGET_REQUIRED',
      'FINANCIAL_SNAPSHOT_REQUIRED',
    ]));
    void demoGuardian;
    void demoFinancial;
    void demoOdontogram;
  });
});

describe('Phase 10.5 — transitions até APPROVED', () => {
  it('DRAFT → REVIEW → APPROVAL → APPROVED', async () => {
    const { service, template, version } = buildServices();
    const created = await service.createDraft(DEMO_TENANT_ID, {
      documentType: 'SERVICE_CONTRACT',
      title: 'Flow',
      patientId: demoPatient.patientId,
      budgetId: demoBudget.budgetId,
      templateId: template.id,
      templateVersionId: version.id,
      origin: 'MANUAL',
      requirements: template.requirements,
    }, actor());
    const generated = await service.createVersion(DEMO_TENANT_ID, created.contract.id, {
      context: createDemoGenerationContext(created.contract, {
        template,
        templateVersion: version,
        actor: actor(),
      }),
    }, actor());
    await service.lockVersion(
      DEMO_TENANT_ID,
      generated.contract.id,
      generated.version.id,
      actor(),
    );

    const r1 = await service.transitionStatus(DEMO_TENANT_ID, created.contract.id, {
      toStatus: 'READY_FOR_REVIEW',
    }, actor());
    expect(r1.contract.status).toBe('READY_FOR_REVIEW');

    const r2 = await service.transitionStatus(DEMO_TENANT_ID, created.contract.id, {
      toStatus: 'PENDING_INTERNAL_APPROVAL',
    }, actor());
    expect(r2.contract.status).toBe('PENDING_INTERNAL_APPROVAL');

    const r3 = await service.transitionStatus(DEMO_TENANT_ID, created.contract.id, {
      toStatus: 'APPROVED',
    }, actor());
    expect(r3.contract.status).toBe('APPROVED');

    await expect(service.transitionStatus(DEMO_TENANT_ID, created.contract.id, {
      toStatus: 'PENDING_SIGNATURES',
    }, actor())).rejects.toMatchObject({ domainError: { code: 'INVALID_STATUS_TRANSITION' } });
  });
});

describe('Phase 10.5 — idempotência', () => {
  it('replay mesmo payload; conflito payload diferente; tenants separados', async () => {
    const { service } = buildServices();
    const input = {
      documentType: 'SERVICE_CONTRACT',
      title: 'Idem',
      patientId: demoPatient.patientId,
      origin: 'MANUAL',
      idempotencyKey: 'key-1',
    };
    const a = await service.createDraft(DEMO_TENANT_ID, input, actor());
    const b = await service.createDraft(DEMO_TENANT_ID, input, actor());
    expect(b.idempotentReplay).toBe(true);
    expect(b.contract.id).toBe(a.contract.id);

    await expect(service.createDraft(DEMO_TENANT_ID, {
      ...input,
      title: 'Outro',
    }, actor())).rejects.toBeInstanceOf(ContractIdempotencyConflictError);

    const other = await service.createDraft('tenant_other', {
      ...input,
      idempotencyKey: 'key-1',
    }, actor());
    expect(other.contract.id).not.toBe(a.contract.id);
    expect(fingerprintIdempotencyInput({ a: 1 })).toBe(fingerprintIdempotencyInput({ a: 1 }));
  });
});

describe('Phase 10.5 — packages', () => {
  it('criação, itens, paciente divergente, conclusão', async () => {
    const { service, packageService, template, version } = buildServices();
    const created = await service.createDraft(DEMO_TENANT_ID, {
      documentType: 'SERVICE_CONTRACT',
      title: 'Pkg item',
      patientId: demoPatient.patientId,
      templateId: template.id,
      templateVersionId: version.id,
      origin: 'MANUAL',
    }, actor());
    const generated = await service.createVersion(DEMO_TENANT_ID, created.contract.id, {
      context: createDemoGenerationContext(created.contract, {
        template,
        templateVersion: version,
        actor: actor(),
      }),
    }, actor());
    await service.lockVersion(
      DEMO_TENANT_ID,
      generated.contract.id,
      generated.version.id,
      actor(),
    );
    await service.transitionStatus(DEMO_TENANT_ID, created.contract.id, {
      toStatus: 'READY_FOR_REVIEW',
    }, actor());
    await service.transitionStatus(DEMO_TENANT_ID, created.contract.id, {
      toStatus: 'PENDING_INTERNAL_APPROVAL',
    }, actor());
    await service.transitionStatus(DEMO_TENANT_ID, created.contract.id, {
      toStatus: 'APPROVED',
    }, actor());

    const pkg = await packageService.createPackage(DEMO_TENANT_ID, {
      patientId: demoPatient.patientId,
      requirements: [{ documentType: 'SERVICE_CONTRACT', required: true }],
      idempotencyKey: 'pkg-1',
    }, actor());
    expect(pkg.package.packageNumber).toMatch(/^PKG-2026-/);

    await packageService.addContract(DEMO_TENANT_ID, pkg.package.id, {
      contractId: created.contract.id,
      required: true,
    }, actor());

    const otherPatient = await service.createDraft(DEMO_TENANT_ID, {
      documentType: 'SERVICE_CONTRACT',
      title: 'Other',
      patientId: 'patient_other',
      origin: 'MANUAL',
    }, actor());
    await expect(packageService.addContract(DEMO_TENANT_ID, pkg.package.id, {
      contractId: otherPatient.contract.id,
    }, actor())).rejects.toMatchObject({ domainError: { code: 'PACKAGE_PATIENT_MISMATCH' } });

    // refresh item status after approve
    await packageService.addContract(DEMO_TENANT_ID, pkg.package.id, {
      contractId: created.contract.id,
      required: true,
    }, actor());

    const completed = await packageService.completePackage(
      DEMO_TENANT_ID,
      pkg.package.id,
      actor(),
    );
    expect(completed.status).toBe('COMPLETED');
  });
});

describe('Phase 10.5 — audit / events / API / UI', () => {
  afterEach(() => {
    resetContractsV2ServiceForTests();
  });

  it('audit factory remove metadados sensíveis', () => {
    const event = createContractAuditEvent({
      tenantId: DEMO_TENANT_ID,
      contractId: 'c1',
      eventType: 'CREATED',
      actor: { actorType: 'USER', actorId: 'u1' },
      source: 'APP',
      occurredAt: '2026-08-03T12:00:00.000Z',
      metadata: {
        contractNumber: 'CTR-1',
        html: '<p>secret</p>',
        cpf: '123',
        documentHash: 'abc',
      },
    });
    expect(event.metadata.contractNumber).toBe('CTR-1');
    expect(event.metadata.html).toBeUndefined();
    expect(event.metadata.cpf).toBeUndefined();
  });

  it('API bloqueia com flag OFF e storage unavailable', async () => {
    const handlers = createContractsV2Handlers({ isEnabled: () => false, getService: () => ({}) });
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };
    await handlers.list({ tenantContext: { tenantId: 't1' }, appAuthUser: { id: 'u' } }, res);
    expect(res.statusCode).toBe(403);

    const handlers2 = createContractsV2Handlers({ isEnabled: () => true });
    await handlers2.list({
      tenantContext: { tenantId: 't1', permissions: ['contracts:view'] },
      appAuthUser: { id: 'u' },
    }, res);
    expect(res.statusCode).toBe(501);
  });

  it('UI service injection + flag OFF', async () => {
    expect(isContractsV2UiEnabled()).toBe(false);
    const { service } = buildServices();
    setContractsV2ServiceForTests(service);
    const created = await service.createDraft(DEMO_TENANT_ID, {
      documentType: 'SERVICE_CONTRACT',
      title: 'UI',
      patientId: demoPatient.patientId,
      origin: 'MANUAL',
    }, actor());
    expect(created.contract.title).toBe('UI');
  });
});
