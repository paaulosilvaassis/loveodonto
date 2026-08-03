/**
 * Phase 10.2 — Contracts Domain Foundation (unitário, sem IDB/Postgres/rede).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALLOWED_CONTRACT_TRANSITIONS,
  CONTRACT_DOCUMENT_TYPES,
  CONTRACT_DOMAIN_EVENT_TYPES,
  CONTRACT_FEATURE_FLAG_DEFAULTS,
  CONTRACT_FEATURE_FLAGS,
  CONTRACT_STATUSES,
  ContractRepositoryNotImplementedError,
  assertAllContractFeatureFlagsDisabled,
  assertTenantMatch,
  canTransitionContract,
  createContractDomainEvent,
  createPermissiveTransitionContext,
  getAllowedContractTransitions,
  getContractFeatureFlags,
  isContractContentLocked,
  isContractFeatureEnabled,
  isTerminalContractStatus,
  isValidContractFeatureFlag,
  mapDomainContractStatusToLegacy,
  mapDomainContractToLegacyGeneratedContract,
  mapLegacyAttachmentToDomain,
  mapLegacyContractStatusToDomain,
  mapLegacyDocumentTypeToDomain,
  mapLegacyGeneratedContractToDomain,
  mapLegacySignatureToDomain,
  mapRemoteContractStatusToDomain,
  validateContract,
  validateContractPackage,
  validateContractReadyForApproval,
  validateContractReadyForCompletion,
  validateContractReadyForReview,
  validateContractReadyForSignature,
  validateContractTemplate,
  validateContractVersion,
  validateSignatureEnvelope,
  validateSignatureSigner,
} from '../domain/contracts/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const DOMAIN_ROOT = path.join(REPO_ROOT, 'src/domain/contracts');

function baseContract(overrides = {}) {
  return {
    id: 'ctr-1',
    tenantId: 'tenant-1',
    contractNumber: 'CTR-2026-00001',
    documentType: 'SERVICE_CONTRACT',
    title: 'Contrato de Prestação de Serviços',
    patientId: 'patient-1',
    origin: 'CLINICAL_BUDGET',
    status: 'DRAFT',
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function baseVersion(overrides = {}) {
  return {
    id: 'ver-1',
    tenantId: 'tenant-1',
    contractId: 'ctr-1',
    versionNumber: 1,
    generationReason: 'INITIAL',
    contentSchemaSnapshot: {},
    patientSnapshot: { patientId: 'patient-1', fullName: 'Paciente Teste' },
    clinicSnapshot: { legalName: 'Clínica Teste LTDA' },
    signersSnapshot: [
      { role: 'patient', name: 'Paciente Teste', required: true, order: 1 },
    ],
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function legacyFixture(overrides = {}) {
  return {
    id: 'gc-legacy-1',
    clinicId: 'clinic-1',
    tenant_id: 'tenant-1',
    patientId: 'patient-1',
    quoteId: 'appt-1',
    quoteSource: 'clinical_budget',
    budgetId: 'budget-1',
    templateId: 'tpl-1',
    templateVersion: 1,
    contractNumber: 'CTR-2026-00099',
    finalContent: 'Texto final',
    renderedHtml: '<p>Contrato</p>',
    pdfUrl: 'data:application/pdf;base64,AAA',
    status: 'generated',
    generatedBy: 'user-1',
    generatedAt: '2026-02-01T10:00:00.000Z',
    title: 'Contrato Clínico',
    category: 'servicos',
    treatmentType: null,
    patientSnapshotJson: {
      id: 'patient-1',
      full_name: 'Maria Silva',
      cpf: '12345678901',
      birth_date: '1990-01-01',
    },
    clinicSnapshotJson: {
      razaoSocial: 'Love Odonto Clínica',
      cnpj: '12345678000199',
    },
    professionalSnapshotJson: { name: 'Dr. Paulo', cro: '12345', userId: 'user-1' },
    clinicalSnapshotJson: { procedimentos: '<ul></ul>', dentes: '11,21', observacoes: 'ok' },
    financialSnapshotJson: {
      budgetId: 'budget-1',
      valorTotal: 1500,
      entrada: 300,
      formaPagamento: 'cartao',
      parcelas: [],
      financiamentos: [],
    },
    totalValueSnapshot: 1500,
    documentHash: 'h1a2b3c4',
    version: 1,
    metadata: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Artefatos
// ---------------------------------------------------------------------------

describe('Phase 10.2 — Artefatos de domínio', () => {
  it('cria a árvore domain/contracts isolada do legado operacional', () => {
    expect(fs.existsSync(DOMAIN_ROOT)).toBe(true);
    expect(fs.existsSync(path.join(DOMAIN_ROOT, 'contract-status.machine.ts'))).toBe(true);
    expect(fs.existsSync(path.join(DOMAIN_ROOT, 'legacy/legacy-contract.mapper.ts'))).toBe(true);
    expect(fs.existsSync(path.join(DOMAIN_ROOT, 'contract-feature-flags.ts'))).toBe(true);
    // legado operacional permanece
    expect(fs.existsSync(path.join(REPO_ROOT, 'src/contracts/contractConstants.js'))).toBe(true);
    expect(fs.existsSync(path.join(REPO_ROOT, 'src/services/contractModuleService.js'))).toBe(true);
  });

  it('domínio Phase 10.2 não altera migration legado 006', () => {
    const mig006 = path.join(REPO_ROOT, 'supabase/migrations/006_app_contracts.sql');
    expect(fs.existsSync(mig006)).toBe(true);
    const sql = fs.readFileSync(mig006, 'utf8');
    expect(sql).toMatch(/generated_contracts/);
    // Persistence V2 (028/029) é escopo da Phase 10.3 — não do domínio 10.2.
  });

  it('exporta enums canônicos estáveis', () => {
    expect(CONTRACT_STATUSES).toContain('PARTIALLY_SIGNED');
    expect(CONTRACT_STATUSES).toContain('SIGNED');
    expect(CONTRACT_DOCUMENT_TYPES).toContain('SERVICE_CONTRACT');
    expect(CONTRACT_DOCUMENT_TYPES).toContain('CUSTOM');
    expect(CONTRACT_DOMAIN_EVENT_TYPES).toContain('contract.signed');
    expect(CONTRACT_FEATURE_FLAGS).toHaveLength(15);
  });
});

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

describe('Phase 10.2 — State machine', () => {
  const ctx = createPermissiveTransitionContext();

  it('permite todas as transições do grafo mínimo com contexto válido', () => {
    for (const [from, tos] of Object.entries(ALLOWED_CONTRACT_TRANSITIONS)) {
      for (const to of tos) {
        const result = canTransitionContract(from, to, ctx);
        expect(result.allowed, `${from} → ${to}`).toBe(true);
      }
    }
  });

  it('bloqueia SIGNED → DRAFT e SIGNED → APPROVED', () => {
    expect(canTransitionContract('SIGNED', 'DRAFT', ctx).allowed).toBe(false);
    expect(canTransitionContract('SIGNED', 'APPROVED', ctx).allowed).toBe(false);
    expect(canTransitionContract('SIGNED', 'DRAFT', ctx).errors[0].code)
      .toBe('INVALID_STATUS_TRANSITION');
  });

  it('bloqueia transições fora do grafo', () => {
    const result = canTransitionContract('DRAFT', 'SIGNED', ctx);
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_STATUS_TRANSITION')).toBe(true);
  });

  it('exige motivo para CANCELLED', () => {
    const result = canTransitionContract(
      'DRAFT',
      'CANCELLED',
      createPermissiveTransitionContext({ cancellationReason: '' }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.code === 'CANCELLATION_REASON_REQUIRED')).toBe(true);
  });

  it('SIGNED exige assinaturas completas e versão bloqueada', () => {
    const incomplete = canTransitionContract(
      'PENDING_SIGNATURES',
      'SIGNED',
      createPermissiveTransitionContext({
        allRequiredSignaturesCompleted: false,
        hasLockedVersion: true,
      }),
    );
    expect(incomplete.allowed).toBe(false);
    expect(incomplete.errors.some((e) => e.code === 'SIGNATURES_INCOMPLETE')).toBe(true);

    const unlocked = canTransitionContract(
      'PENDING_SIGNATURES',
      'SIGNED',
      createPermissiveTransitionContext({ hasLockedVersion: false }),
    );
    expect(unlocked.errors.some((e) => e.code === 'VERSION_NOT_LOCKED')).toBe(true);
  });

  it('PENDING_SIGNATURES exige versão bloqueada', () => {
    const result = canTransitionContract(
      'APPROVED',
      'PENDING_SIGNATURES',
      createPermissiveTransitionContext({ hasLockedVersion: false }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.code === 'VERSION_NOT_LOCKED')).toBe(true);
  });

  it('PARTIALLY_SIGNED bloqueia conteúdo', () => {
    expect(isContractContentLocked('PARTIALLY_SIGNED')).toBe(true);
    expect(isContractContentLocked('SIGNED')).toBe(true);
    expect(isContractContentLocked('DRAFT')).toBe(false);
  });

  it('estados terminais permanecem fechados', () => {
    for (const terminal of ['DECLINED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED', 'TERMINATED', 'VOIDED']) {
      expect(isTerminalContractStatus(terminal)).toBe(true);
      expect(getAllowedContractTransitions(terminal, ctx)).toEqual([]);
      expect(canTransitionContract(terminal, 'DRAFT', ctx).allowed).toBe(false);
    }
  });

  it('TERMINATED exige origem SIGNED', () => {
    // grafo já impede APPROVED→TERMINATED; reforça regra
    expect(canTransitionContract('APPROVED', 'TERMINATED', ctx).allowed).toBe(false);
    expect(canTransitionContract('SIGNED', 'TERMINATED', ctx).allowed).toBe(true);
  });

  it('SUPERSEDED exige referência de substituição', () => {
    const result = canTransitionContract(
      'SIGNED',
      'SUPERSEDED',
      createPermissiveTransitionContext({ supersededByContractId: '' }),
    );
    expect(result.allowed).toBe(false);
    expect(result.errors.some((e) => e.code === 'SUPERSEDE_REFERENCE_REQUIRED')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

describe('Phase 10.2 — Validators', () => {
  it('valida contrato completo', () => {
    expect(validateContract(baseContract()).valid).toBe(true);
  });

  it('rejeita tenant e paciente ausentes', () => {
    const r = validateContract(baseContract({ tenantId: '', patientId: '' }));
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(['TENANT_REQUIRED', 'PATIENT_REQUIRED']),
    );
  });

  it('rejeita tipo/status inválidos e datas inconsistentes', () => {
    const r = validateContract(baseContract({
      documentType: 'NOT_A_TYPE',
      status: 'weird',
      effectiveDate: '2026-06-01T00:00:00.000Z',
      expirationDate: '2026-01-01T00:00:00.000Z',
    }));
    expect(r.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(['INVALID_DOCUMENT_TYPE', 'INVALID_STATUS', 'INVALID_DATE_RANGE']),
    );
  });

  it('cancelamento exige motivo', () => {
    const r = validateContract(baseContract({
      status: 'CANCELLED',
      cancellationReason: '',
    }));
    expect(r.errors.some((e) => e.code === 'CANCELLATION_REASON_REQUIRED')).toBe(true);
  });

  it('versão exige snapshots mínimos e versionNumber >= 1', () => {
    const bad = validateContractVersion({
      tenantId: 't1',
      contractId: 'c1',
      versionNumber: 0,
      signersSnapshot: [],
    });
    expect(bad.valid).toBe(false);
    expect(bad.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining([
        'VERSION_NUMBER_INVALID',
        'SNAPSHOT_REQUIRED',
        'REQUIRED_SIGNER_MISSING',
      ]),
    );
    expect(validateContractVersion(baseVersion()).valid).toBe(true);
  });

  it('ready for review exige responsável/orçamento quando requeridos', () => {
    const r = validateContractReadyForReview({
      contract: baseContract(),
      version: baseVersion(),
      requiresGuardian: true,
      requiresBudget: true,
    });
    expect(r.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(['GUARDIAN_REQUIRED', 'BUDGET_REQUIRED']),
    );
  });

  it('ready for approval exige template publicado e financeiro', () => {
    const r = validateContractReadyForApproval({
      contract: baseContract({ guardianPatientId: 'g1', budgetId: 'b1' }),
      version: baseVersion(),
      requiresGuardian: true,
      requiresBudget: true,
      requiresFinancialSnapshot: true,
      hasPublishedTemplate: false,
    });
    expect(r.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(['TEMPLATE_NOT_PUBLISHED', 'FINANCIAL_SNAPSHOT_REQUIRED']),
    );
  });

  it('ready for signature exige versão bloqueada e signatário', () => {
    const r = validateContractReadyForSignature({
      contract: baseContract({
        status: 'APPROVED',
        guardianPatientId: 'g1',
        budgetId: 'b1',
      }),
      version: baseVersion({ lockedAt: undefined, signersSnapshot: [] }),
      requiresGuardian: true,
      requiresBudget: true,
      hasPublishedTemplate: true,
    });
    expect(r.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(['VERSION_NOT_LOCKED', 'REQUIRED_SIGNER_MISSING']),
    );
  });

  it('completion exige assinaturas e evidências', () => {
    const r = validateContractReadyForCompletion({
      contract: baseContract({ status: 'PARTIALLY_SIGNED', budgetId: 'b1', guardianPatientId: 'g1' }),
      version: baseVersion({
        lockedAt: '2026-01-02T00:00:00.000Z',
        financialSnapshot: { contractTotal: 100 },
      }),
      requiresGuardian: true,
      requiresBudget: true,
      requiresFinancialSnapshot: true,
      hasPublishedTemplate: true,
      allRequiredSignaturesCompleted: false,
      evidenceAvailable: false,
    });
    expect(r.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(['SIGNATURES_INCOMPLETE', 'EVIDENCE_PENDING']),
    );
  });

  it('assertTenantMatch detecta mismatch', () => {
    expect(assertTenantMatch('t1', 't2')?.code).toBe('TENANT_MISMATCH');
    expect(assertTenantMatch('t1', 't1')).toBeNull();
  });

  it('valida template, package, envelope e signer', () => {
    expect(validateContractTemplate({
      tenantId: 't1',
      name: 'Modelo',
      documentType: 'SERVICE_CONTRACT',
    }).valid).toBe(true);

    expect(validateContractPackage({
      tenantId: 't1',
      patientId: 'p1',
      packageNumber: 'PKG-1',
      status: 'COMPLETED',
      requirements: [{ documentType: 'SERVICE_CONTRACT', required: true }],
      items: [],
    }).errors.some((e) => e.code === 'PACKAGE_INCOMPLETE')).toBe(true);

    expect(validateSignatureEnvelope({
      tenantId: 't1',
      contractId: 'c1',
      contractVersionId: 'v1',
      status: 'SENT',
      expiresAt: '2000-01-01T00:00:00.000Z',
    }).errors.some((e) => e.code === 'ENVELOPE_EXPIRED')).toBe(true);

    expect(validateSignatureSigner({
      tenantId: 't1',
      envelopeId: 'e1',
      name: '',
      required: true,
    }).errors.some((e) => e.code === 'REQUIRED_SIGNER_MISSING')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Legacy mapper
// ---------------------------------------------------------------------------

describe('Phase 10.2 — Legacy mapper', () => {
  it('mapeia status conhecidos legado → domínio', () => {
    expect(mapLegacyContractStatusToDomain('draft').value).toBe('DRAFT');
    expect(mapLegacyContractStatusToDomain('sent').value).toBe('PENDING_SIGNATURES');
    expect(mapLegacyContractStatusToDomain('signed_by_patient').value).toBe('PARTIALLY_SIGNED');
    expect(mapLegacyContractStatusToDomain('completed').value).toBe('SIGNED');
    expect(mapLegacyContractStatusToDomain('refused').value).toBe('DECLINED');
    expect(mapLegacyContractStatusToDomain('replaced').value).toBe('SUPERSEDED');
    expect(mapLegacyContractStatusToDomain('rescindido').value).toBe('TERMINATED');
  });

  it('falha em status legado desconhecido', () => {
    const r = mapLegacyContractStatusToDomain('totally_unknown');
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('LEGACY_STATUS_NOT_MAPPABLE');
  });

  it('mapeia documento conhecido e customizado sem converter tipo clínico errado', () => {
    expect(mapLegacyDocumentTypeToDomain({ category: 'servicos' }).value).toBe('SERVICE_CONTRACT');
    expect(mapLegacyDocumentTypeToDomain({ category: 'lgpd' }).value).toBe('LGPD_TERM');
    expect(mapLegacyDocumentTypeToDomain({
      category: 'consentimento',
      treatmentType: 'implante_unitario',
    }).value).toBe('IMPLANT_CONSENT');

    const custom = mapLegacyDocumentTypeToDomain({ category: 'garantia' });
    expect(custom.value).toBe('CUSTOM');
    expect(custom.warnings.some((w) => w.code === 'LEGACY_DOCUMENT_TYPE_CUSTOM')).toBe(true);

    const unknown = mapLegacyDocumentTypeToDomain({ category: 'xyz_desconhecido' });
    expect(unknown.value).toBe('CUSTOM');
  });

  it('não reduz silenciosamente status canônicos sem equivalente seguro', () => {
    expect(mapDomainContractStatusToLegacy('READY_FOR_REVIEW').ok).toBe(false);
    expect(mapDomainContractStatusToLegacy('PENDING_INTERNAL_APPROVAL').ok).toBe(false);
    expect(mapDomainContractStatusToLegacy('VOIDED').ok).toBe(false);
    expect(mapDomainContractStatusToLegacy('DECLINED').value.status).toBe('refused');
    expect(mapDomainContractStatusToLegacy('EXPIRED').value.status).toBe('expired');
    expect(mapDomainContractStatusToLegacy('SUPERSEDED').value.status).toBe('replaced');
    expect(mapDomainContractStatusToLegacy('TERMINATED').value.status).toBe('rescindido');
  });

  it('mapeia remote status 006', () => {
    expect(mapRemoteContractStatusToDomain('signed').value).toBe('SIGNED');
    expect(mapRemoteContractStatusToDomain('sent').ok).toBe(false);
  });

  it('preserva IDs/tenant e marca ausência de odontograma/storage', () => {
    const r = mapLegacyGeneratedContractToDomain(legacyFixture());
    expect(r.ok).toBe(true);
    expect(r.value.contract.id).toBe('gc-legacy-1');
    expect(r.value.contract.tenantId).toBe('tenant-1');
    expect(r.value.contract.origin).toBe('CLINICAL_BUDGET');
    expect(r.value.contract.status).toBe('APPROVED');
    expect(r.value.version?.odontogramSnapshot).toBeUndefined();
    expect(r.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining([
        'LEGACY_ODONTOGRAM_SNAPSHOT_ABSENT',
        'LEGACY_DATA_URL_ATTACHMENT',
        'LEGACY_HASH_NOT_CRYPTOGRAPHIC',
      ]),
    );
  });

  it('mapeia contrato CRM sem orçamento e sem inventar assinatura', () => {
    const r = mapLegacyGeneratedContractToDomain(legacyFixture({
      quoteSource: 'crm_budget',
      quoteId: 'crm-budget-9',
      budgetId: null,
      status: 'draft',
      signedAt: null,
      financialSnapshotJson: undefined,
      clinicalSnapshotJson: { procedimentos: 'x' },
    }));
    expect(r.ok).toBe(true);
    expect(r.value.contract.origin).toBe('CRM_BUDGET');
    expect(r.value.contract.budgetId).toBeUndefined();
    expect(r.value.version?.lockedAt).toBeUndefined();
  });

  it('mapeia assinatura interna e anexo data URL sem storage inventado', () => {
    const sig = mapLegacySignatureToDomain({
      id: 'sig-1',
      contractId: 'gc-1',
      tenant_id: 'tenant-1',
      role: 'patient',
      name: 'Maria',
      signatureType: 'on_screen',
      signatureImageUrl: 'data:image/png;base64,AAA',
      signedAt: '2026-03-01T00:00:00.000Z',
    }, 'tenant-1');
    expect(sig.ok).toBe(true);
    expect(sig.value.status).toBe('SIGNED');
    expect(sig.warnings.some((w) => w.code === 'LEGACY_DATA_URL_ATTACHMENT')).toBe(true);

    const att = mapLegacyAttachmentToDomain({
      id: 'att-1',
      contractId: 'gc-1',
      fileName: 'doc.pdf',
      fileUrl: 'data:application/pdf;base64,AAA',
      mimeType: 'application/pdf',
    }, 'tenant-1');
    expect(att.value.snapshot.legacyDataUrlPresent).toBe(true);
    expect(att.value.fileHint.storage).toBeUndefined();
  });

  it('reverse map preserva id e falha quando status não mapeável', () => {
    const mapped = mapLegacyGeneratedContractToDomain(legacyFixture({ status: 'signed' }));
    const reverse = mapDomainContractToLegacyGeneratedContract(
      mapped.value.contract,
      mapped.value.version,
    );
    expect(reverse.ok).toBe(true);
    expect(reverse.value.id).toBe('gc-legacy-1');
    expect(reverse.value.tenant_id).toBe('tenant-1');

    const unmapped = mapDomainContractToLegacyGeneratedContract(
      baseContract({ status: 'READY_FOR_REVIEW' }),
    );
    expect(unmapped.ok).toBe(false);
    expect(unmapped.error.code).toBe('DOMAIN_STATUS_NOT_MAPPABLE_TO_LEGACY');
  });
});

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

describe('Phase 10.2 — Feature flags', () => {
  it('todas false por padrão e ausência retorna false', () => {
    expect(CONTRACT_FEATURE_FLAG_DEFAULTS.contracts_domain_v2_enabled).toBe(false);
    expect(assertAllContractFeatureFlagsDisabled()).toBe(true);
    const flags = getContractFeatureFlags();
    for (const key of CONTRACT_FEATURE_FLAGS) {
      expect(flags[key]).toBe(false);
      expect(isContractFeatureEnabled(key)).toBe(false);
    }
  });

  it('helper reconhece apenas flags válidas', () => {
    expect(isValidContractFeatureFlag('contracts_domain_v2_enabled')).toBe(true);
    expect(isValidContractFeatureFlag('not_a_real_flag')).toBe(false);
    expect(isContractFeatureEnabled('not_a_real_flag')).toBe(false);
  });

  it('override de teste não altera defaults globais', () => {
    expect(isContractFeatureEnabled('contracts_domain_v2_enabled', {
      overrides: { contracts_domain_v2_enabled: true },
    })).toBe(true);
    expect(isContractFeatureEnabled('contracts_domain_v2_enabled')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Events + repository contracts
// ---------------------------------------------------------------------------

describe('Phase 10.2 — Events e repository contracts', () => {
  it('factory cria evento tipado sem publicar', () => {
    const event = createContractDomainEvent({
      tenantId: 'tenant-1',
      aggregateId: 'ctr-1',
      aggregateType: 'contract',
      eventType: 'contract.signed',
      payload: { contractId: 'ctr-1' },
    });
    expect(event.eventId).toBeTruthy();
    expect(event.eventVersion).toBe(1);
    expect(event.eventType).toBe('contract.signed');
    expect(() => createContractDomainEvent({
      tenantId: '',
      aggregateId: 'x',
      aggregateType: 'contract',
      eventType: 'contract.created',
      payload: {},
    })).toThrow(/TENANT_REQUIRED/);
  });

  it('ContractRepositoryNotImplementedError exige método', () => {
    const err = new ContractRepositoryNotImplementedError('findById');
    expect(err.code).toBe('CONTRACT_REPOSITORY_NOT_IMPLEMENTED');
    expect(err.message).toContain('findById');
  });

  it('assinatura de repositório exige tenantId nos métodos públicos', () => {
    const repoSource = fs.readFileSync(
      path.join(DOMAIN_ROOT, 'contract.repository.ts'),
      'utf8',
    );
    expect(repoSource).toMatch(/findById\(\s*\n\s*tenantId: TenantId/);
    expect(repoSource).toMatch(/list\(\s*\n\s*tenantId: TenantId/);
    expect(repoSource).toMatch(/create\(\s*\n\s*tenantId: TenantId/);
    expect(repoSource).toMatch(/transitionStatus\(\s*\n\s*tenantId: TenantId/);
  });
});

