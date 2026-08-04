/**
 * Phase 10.4 — Contract Templates and Editor Foundation
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  parseContractTemplateVariables,
  validateContractTemplateVariables,
  renderContractTemplate,
  getUnresolvedContractVariables,
} from '../domain/contracts/templates/contract-template-parser.ts';
import { sanitizeContractTemplateHtml } from '../domain/contracts/templates/contract-template-sanitize.ts';
import {
  createEmptyContentSchema,
  validateContractContentSchema,
  contentSchemaToHtml,
  CONTRACT_CONTENT_SCHEMA_VERSION,
} from '../domain/contracts/templates/contract-template-content.schema.ts';
import {
  canTransitionTemplateStatus,
  ALLOWED_TEMPLATE_TRANSITIONS,
  isTemplatePublishedImmutable,
} from '../domain/contracts/templates/contract-template-status.machine.ts';
import {
  CONTRACT_TEMPLATE_VARIABLE_CATALOG,
  buildPreviewVariableValues,
  isKnownContractTemplateVariableKey,
} from '../domain/contracts/templates/contract-template-variables.catalog.ts';
import { ContractTemplateMemoryRepository } from '../domain/contracts/templates/contract-template-memory.repository.ts';
import {
  createContractTemplateApplicationService,
  ContractTemplateApplicationError,
} from '../domain/contracts/templates/contract-template.application-service.ts';
import { validateTemplateForPublication } from '../domain/contracts/templates/contract-template-validation.ts';
import { isContractFeatureEnabled } from '../domain/contracts/contract-feature-flags.ts';
import {
  isContractTemplatesV2UiEnabled,
  setContractTemplatesV2ServiceForTests,
  resetContractTemplatesV2ServiceForTests,
} from '../services/contractTemplatesV2Service.js';
import {
  createContractTemplatesV2Handlers,
  isContractTemplatesV2ApiEnabled,
} from '../../server/lib/contractTemplatesV2Api.js';
import { contractsShellNavItems } from '../contracts/contractsShellConfig.js';
import {
  insertBlock,
  moveBlock,
  removeBlock,
} from '../components/contracts/v2/templateEditorUtils.js';

const ALL_PERMS = [
  'contract_templates:view',
  'contract_templates:create',
  'contract_templates:update_draft',
  'contract_templates:review',
  'contract_templates:publish',
  'contract_templates:archive',
  'contract_templates:duplicate',
  'contract_templates:view_history',
  'contract_templates:manage_clauses',
];

function actor(overrides = {}) {
  return {
    userId: 'user-1',
    permissions: ALL_PERMS,
    ...overrides,
  };
}

function createService(repo, opts = {}) {
  return createContractTemplateApplicationService({
    repository: repo,
    skipFeatureFlagCheck: true,
    ...opts,
  });
}

describe('Phase 10.4 — feature flags', () => {
  it('flags permanecem desligadas por padrão', () => {
    expect(isContractFeatureEnabled('contract_templates_v2_enabled')).toBe(false);
    expect(isContractFeatureEnabled('contracts_domain_v2_enabled')).toBe(false);
    expect(isContractTemplatesV2UiEnabled()).toBe(false);
    expect(isContractTemplatesV2ApiEnabled({})).toBe(false);
  });

  it('nav Modelos v2 exige domain + templates', () => {
    const item = contractsShellNavItems.find((i) => i.id === 'modelos-v2');
    expect(item?.featureFlagsAll).toEqual([
      'contracts_domain_v2_enabled',
      'contract_templates_v2_enabled',
    ]);
    expect(item?.route).toBe('/gestao/contratos/modelos-v2');
  });
});

describe('Phase 10.4 — parser', () => {
  it('variável simples e múltiplas', () => {
    const r = parseContractTemplateVariables('Olá {{patient.name}} — {{budget.finalTotal}}');
    expect(r.usedKeys).toEqual(['patient.name', 'budget.finalTotal']);
    expect(r.invalidSyntax).toHaveLength(0);
  });

  it('variável desconhecida', () => {
    const r = validateContractTemplateVariables('{{unknown.field}}');
    expect(r.valid).toBe(false);
    expect(r.unknown).toContain('unknown.field');
  });

  it('variável vazia e sintaxe inválida', () => {
    const empty = parseContractTemplateVariables('{{}}');
    expect(empty.invalidSyntax.length).toBeGreaterThan(0);
    const expr = parseContractTemplateVariables('{{patient.name + 1}}');
    expect(expr.invalidSyntax.length).toBeGreaterThan(0);
  });

  it('escape de HTML e variável html permitida', () => {
    const escaped = renderContractTemplate('X {{patient.name}}', {
      'patient.name': '<script>alert(1)</script>',
    }, { mode: 'preview' });
    expect(escaped.html).not.toContain('<script>');
    expect(escaped.html).toContain('&lt;script&gt;');

    const htmlVar = renderContractTemplate('{{financial.conditionsText}}', {
      'financial.conditionsText': '<p>ok</p><script>x</script>',
    }, { mode: 'preview' });
    expect(htmlVar.html).toContain('<p>ok</p>');
    expect(htmlVar.html).not.toContain('<script>');
  });

  it('bloqueia constructor, prototype e expressões', () => {
    expect(parseContractTemplateVariables('{{constructor}}').invalidSyntax.length).toBeGreaterThan(0);
    expect(parseContractTemplateVariables('{{__proto__.x}}').invalidSyntax.length).toBeGreaterThan(0);
    expect(parseContractTemplateVariables('{{a.b()}}').invalidSyntax.length).toBeGreaterThan(0);
  });

  it('preserva não resolvida em modo editor', () => {
    const r = renderContractTemplate('{{patient.name}}', {}, { mode: 'editor' });
    expect(r.html).toContain('{{patient.name}}');
    expect(getUnresolvedContractVariables('{{patient.name}}', {})).toContain('patient.name');
  });
});

describe('Phase 10.4 — sanitização', () => {
  it('preserva tags permitidas e tabela', () => {
    const r = sanitizeContractTemplateHtml('<p>a</p><table><tr><td>1</td></tr></table>');
    expect(r.html).toContain('<p>');
    expect(r.html).toContain('<table>');
  });

  it('remove script, iframe, on*, javascript:', () => {
    const r = sanitizeContractTemplateHtml(
      '<p onclick="x">a</p><script>bad</script><iframe src="x"></iframe><a href="javascript:alert(1)">x</a>',
    );
    expect(r.html).not.toContain('<script');
    expect(r.html).not.toContain('<iframe');
    expect(r.html).not.toContain('onclick');
    expect(r.blocked).toBe(true);
  });

  it('preserva data-variable e conteúdo vazio', () => {
    expect(sanitizeContractTemplateHtml('').html).toBe('');
    const r = sanitizeContractTemplateHtml('<span data-variable="patient.name">x</span>');
    expect(r.html).toContain('data-variable="patient.name"');
  });
});

describe('Phase 10.4 — content schema', () => {
  it('schema válido e conversão determinística', () => {
    const schema = createEmptyContentSchema();
    expect(validateContractContentSchema(schema).valid).toBe(true);
    const html1 = contentSchemaToHtml(schema);
    const html2 = contentSchemaToHtml(schema);
    expect(html1).toBe(html2);
    expect(schema.schemaVersion).toBe(CONTRACT_CONTENT_SCHEMA_VERSION);
  });

  it('bloco desconhecido, id e ordem duplicados', () => {
    const bad = {
      schemaVersion: 1,
      blocks: [
        { id: 'a', type: 'UNKNOWN', order: 0 },
        { id: 'a', type: 'PARAGRAPH', order: 0, text: 'x' },
      ],
    };
    const r = validateContractContentSchema(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.message.includes('desconhecido') || e.message.includes('duplicado'))).toBe(true);
  });

  it('editor utils movem/inserem/removem blocos', () => {
    let blocks = createEmptyContentSchema().blocks;
    blocks = insertBlock(blocks, 'PARAGRAPH');
    const lastId = blocks[blocks.length - 1].id;
    blocks = moveBlock(blocks, lastId, 'up');
    blocks = removeBlock(blocks, lastId);
    expect(blocks.find((b) => b.id === lastId)).toBeUndefined();
  });
});

describe('Phase 10.4 — template state machine', () => {
  it('transições permitidas e proibidas', () => {
    for (const [from, tos] of Object.entries(ALLOWED_TEMPLATE_TRANSITIONS)) {
      for (const to of tos) {
        expect(canTransitionTemplateStatus(from, to).allowed).toBe(true);
      }
    }
    expect(canTransitionTemplateStatus('DRAFT', 'PUBLISHED').allowed).toBe(false);
    expect(canTransitionTemplateStatus('ARCHIVED', 'DRAFT').allowed).toBe(false);
    expect(canTransitionTemplateStatus('PUBLISHED', 'DRAFT').allowed).toBe(false);
  });

  it('publicado é imutável', () => {
    expect(isTemplatePublishedImmutable('PUBLISHED')).toBe(true);
    expect(isTemplatePublishedImmutable('SUPERSEDED')).toBe(true);
    expect(isTemplatePublishedImmutable('DRAFT')).toBe(false);
  });
});

describe('Phase 10.4 — catalog', () => {
  it('contém variáveis mínimas e preview fictício', () => {
    expect(CONTRACT_TEMPLATE_VARIABLE_CATALOG.length).toBeGreaterThan(40);
    expect(isKnownContractTemplateVariableKey('patient.name')).toBe(true);
    const preview = buildPreviewVariableValues();
    expect(preview['patient.name']).toBe('João da Silva');
    expect(preview['patient.cpf']).toContain('***');
    expect(preview['budget.number']).toBe('ORC-DEMO-001');
  });
});

describe('Phase 10.4 — application service', () => {
  let repo;
  let service;

  beforeEach(() => {
    repo = new ContractTemplateMemoryRepository();
    service = createService(repo);
  });

  it('criação, update draft, versão, review, publish, duplicate, archive', async () => {
    const created = await service.createTemplate('tenant-a', {
      name: 'Contrato Demo',
      documentType: 'SERVICE_CONTRACT',
      category: 'ortodontia',
    }, actor());
    expect(created.templateStatus).toBe('DRAFT');
    expect(created.currentVersionId).toBeTruthy();

    const updated = await service.updateTemplateDraft('tenant-a', created.id, {
      name: 'Contrato Demo v2',
      expectedRowVersion: created.rowVersion,
    }, actor());
    expect(updated.name).toBe('Contrato Demo v2');

    const details = await service.getTemplate('tenant-a', created.id, actor());
    const versionId = details.currentVersion.id;

    await service.updateVersionDraft('tenant-a', created.id, versionId, {
      changeSummary: 'Ajustes iniciais',
      expectedRowVersion: details.currentVersion.rowVersion,
    }, actor());

    await service.submitVersionForReview('tenant-a', created.id, versionId, actor());

    const published = await service.publishVersion(
      'tenant-a',
      created.id,
      versionId,
      { changeSummary: 'Publicação inicial do modelo' },
      actor(),
    );
    expect(published.version.status).toBe('PUBLISHED');
    expect(published.version.lockedAt).toBeTruthy();
    expect(published.event.type).toBe('contract_template.version_published');

    await expect(
      service.updateVersionDraft('tenant-a', created.id, versionId, {
        contentHtml: '<p>hack</p>',
      }, actor()),
    ).rejects.toBeInstanceOf(ContractTemplateApplicationError);

    const v2 = await service.createVersion('tenant-a', created.id, {
      changeSummary: 'nova versão',
    }, actor());
    expect(v2.versionNumber).toBe(2);
    expect(v2.status).toBe('DRAFT');

    await service.submitVersionForReview('tenant-a', created.id, v2.id, actor());
    const published2 = await service.publishVersion(
      'tenant-a',
      created.id,
      v2.id,
      { changeSummary: 'Segunda publicação' },
      actor(),
    );
    expect(published2.supersededVersionId).toBe(versionId);

    const copy = await service.duplicateTemplate('tenant-a', created.id, actor());
    expect(copy.name).toMatch(/^Cópia de /);
    expect(copy.templateStatus).toBe('DRAFT');
    expect(copy.id).not.toBe(created.id);

    const archived = await service.archiveTemplate('tenant-a', copy.id, actor());
    expect(archived.templateStatus).toBe('ARCHIVED');
  });

  it('tenant mismatch / não encontrado / storage / permissão / flag', async () => {
    const created = await service.createTemplate('tenant-a', {
      name: 'X',
      documentType: 'SERVICE_CONTRACT',
    }, actor());

    expect(await service.getTemplate('tenant-b', created.id, actor())).toBeNull();

    repo.setStorageAvailable(false);
    await expect(
      service.listTemplates('tenant-a', {}, actor()),
    ).rejects.toMatchObject({ domainError: { code: 'CONTRACTS_V2_STORAGE_UNAVAILABLE' } });
    repo.setStorageAvailable(true);

    await expect(
      service.createTemplate('tenant-a', { name: 'Y', documentType: 'SERVICE_CONTRACT' }, actor({ permissions: [] })),
    ).rejects.toMatchObject({ domainError: { code: 'PERMISSION_DENIED' } });

    const flagged = createContractTemplateApplicationService({
      repository: repo,
      featureFlagContext: {},
      skipFeatureFlagCheck: false,
    });
    await expect(
      flagged.listTemplates('tenant-a', {}, actor()),
    ).rejects.toMatchObject({ domainError: { code: 'FEATURE_FLAG_DISABLED' } });
  });

  it('conflito de rowVersion', async () => {
    const created = await service.createTemplate('tenant-a', {
      name: 'X',
      documentType: 'SERVICE_CONTRACT',
    }, actor());
    await expect(
      service.updateTemplateDraft('tenant-a', created.id, {
        name: 'Z',
        expectedRowVersion: 999,
      }, actor()),
    ).rejects.toMatchObject({ domainError: { code: 'OPTIMISTIC_CONCURRENCY_CONFLICT' } });
  });

  it('preview usa dados fictícios', async () => {
    const created = await service.createTemplate('tenant-a', {
      name: 'X',
      documentType: 'SERVICE_CONTRACT',
    }, actor());
    const details = await service.getTemplate('tenant-a', created.id, actor());
    const preview = await service.previewVersion(
      'tenant-a',
      created.id,
      details.currentVersion.id,
      actor(),
    );
    expect(preview.html).toContain('João da Silva');
    expect(preview.html).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  });
});

describe('Phase 10.4 — API handlers', () => {
  it('bloqueia com flag desligada', async () => {
    const handlers = createContractTemplatesV2Handlers({
      isEnabled: () => false,
      getService: () => ({}),
    });
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };
    await handlers.list({ tenantContext: { tenantId: 't1' }, appAuthUser: { id: 'u1' } }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('FEATURE_FLAG_DISABLED');
  });

  it('storage unavailable quando sem getService e flag on', async () => {
    const handlers = createContractTemplatesV2Handlers({
      isEnabled: () => true,
    });
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };
    await handlers.list({
      tenantContext: { tenantId: 't1', permissions: ['contract_templates:view'] },
      appAuthUser: { id: 'u1' },
    }, res);
    expect(res.statusCode).toBe(501);
    expect(res.body.code).toBe('CONTRACTS_V2_STORAGE_UNAVAILABLE');
  });
});

describe('Phase 10.4 — UI gate', () => {
  afterEach(() => {
    resetContractTemplatesV2ServiceForTests();
  });

  it('rota UI permanece desligada sem override', () => {
    expect(isContractTemplatesV2UiEnabled()).toBe(false);
  });

  it('permite injeção de service em testes', async () => {
    const repo = new ContractTemplateMemoryRepository();
    const service = createService(repo);
    setContractTemplatesV2ServiceForTests(service);
    const created = await service.createTemplate('t1', {
      name: 'UI',
      documentType: 'SERVICE_CONTRACT',
    }, actor());
    expect(created.name).toBe('UI');
  });
});

describe('Phase 10.4 — validação publicação', () => {
  it('bloqueia conteúdo vazio e changeSummary ausente', () => {
    const r = validateTemplateForPublication({
      template: {
        id: 't',
        tenantId: 'ten',
        name: 'Ok',
        documentType: 'SERVICE_CONTRACT',
        templateStatus: 'IN_REVIEW',
        isDefault: false,
        requirements: {
          requiresBudget: true,
          requiresFinancialPlan: false,
          requiresOdontogram: false,
          requiresGuardian: false,
          requiresWitnesses: false,
          requiresProfessionalSignature: true,
          requiresClinicSignature: true,
          requiresPatientSignature: true,
          requiresResponsibleSignature: false,
          requiresInternalApproval: false,
        },
        createdBy: 'u',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      version: {
        id: 'v',
        tenantId: 'ten',
        templateId: 't',
        versionNumber: 1,
        contentHtml: '',
        contentSchema: { schemaVersion: 1, blocks: [] },
        variablesSchema: [],
        status: 'IN_REVIEW',
        createdBy: 'u',
        createdAt: '2026-01-01',
      },
      changeSummary: '',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(['TEMPLATE_CONTENT_EMPTY', 'TEMPLATE_CHANGE_SUMMARY_REQUIRED']),
    );
  });
});
