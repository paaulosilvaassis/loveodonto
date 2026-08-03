/**
 * @module domain/contracts/templates/contract-template.application-service
 * @description Application service isolado de templates — Phase 10.4.
 */

import {
  createContractDomainError,
  type ContractDomainError,
} from '../contract.errors.js';
import {
  isContractFeatureEnabled,
  type ContractFeatureFlagContext,
} from '../contract-feature-flags.js';
import type {
  ContractTemplateId,
  ContractTemplateVersionId,
  TenantId,
} from '../contract.ids.js';
import {
  contentSchemaToHtml,
  createEmptyContentSchema,
  extractPlainTextFromSchema,
} from './contract-template-content.schema.js';
import {
  defaultContractClauseLibrary,
  type ContractClauseLibrary,
} from './contract-clause.library.js';
import {
  parseContractTemplateVariables,
  renderContractTemplate,
} from './contract-template-parser.js';
import {
  buildPreviewVariableValues,
  getContractTemplateVariableDefinition,
} from './contract-template-variables.catalog.js';
import {
  canTransitionTemplateStatus,
  isTemplateArchived,
  isTemplateEditableStatus,
  isTemplatePublishedImmutable,
} from './contract-template-status.machine.js';
import { validateTemplateForPublication } from './contract-template-validation.js';
import type { ContractTemplateApplicationRepository } from './contract-template.application-repository.js';
import {
  createDefaultTemplateRequirements,
  type ContractTemplateActor,
  type ContractTemplate,
  type ContractTemplateDetails,
  type ContractTemplateListQuery,
  type ContractTemplateListResult,
  type ContractTemplateValidationResult,
  type ContractTemplateVersion,
  type CreateContractTemplateInput,
  type CreateContractTemplateVersionInput,
  type PublishedContractTemplateResult,
  type UpdateContractTemplateInput,
  type UpdateContractTemplateVersionInput,
} from './contract-template.types.js';

export const CONTRACT_TEMPLATE_PERMISSIONS = [
  'contract_templates:view',
  'contract_templates:create',
  'contract_templates:update_draft',
  'contract_templates:review',
  'contract_templates:publish',
  'contract_templates:archive',
  'contract_templates:duplicate',
  'contract_templates:view_history',
  'contract_templates:manage_clauses',
] as const;

export type ContractTemplatePermission = (typeof CONTRACT_TEMPLATE_PERMISSIONS)[number];

export class ContractTemplateApplicationError extends Error {
  readonly domainError: ContractDomainError;

  constructor(domainError: ContractDomainError) {
    super(domainError.message);
    this.name = 'ContractTemplateApplicationError';
    this.domainError = domainError;
  }
}

function fail(code: ContractDomainError['code'], message: string, field?: string): never {
  throw new ContractTemplateApplicationError(
    createContractDomainError(code, message, field),
  );
}

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function translateRepoError(error: unknown): never {
  const code = String((error as { code?: string })?.code || '');
  const message = String((error as Error)?.message || 'Erro de persistência.');
  if (code === 'CONTRACTS_V2_STORAGE_UNAVAILABLE' || message.includes('não está disponível')) {
    fail(
      'CONTRACTS_V2_STORAGE_UNAVAILABLE',
      'O módulo de modelos v2 ainda não está disponível neste ambiente.',
    );
  }
  if (code === 'OPTIMISTIC_CONCURRENCY_CONFLICT') {
    fail('OPTIMISTIC_CONCURRENCY_CONFLICT', 'Conflito de versão (rowVersion). Outra alteração ocorreu.');
  }
  if (code === 'TENANT_MISMATCH') {
    fail('TENANT_MISMATCH', 'tenantId não corresponde ao recurso.');
  }
  if (code === 'VERSION_ALREADY_LOCKED') {
    fail('VERSION_ALREADY_LOCKED', 'Versão publicada é imutável.');
  }
  if (code === 'CONTRACT_NOT_FOUND') {
    fail('CONTRACT_NOT_FOUND', 'Modelo ou versão não encontrado.');
  }
  fail('INVALID_INPUT', message);
}

function actorHas(actor: ContractTemplateActor, permission: ContractTemplatePermission): boolean {
  const perms = actor.permissions || [];
  if (perms.includes(permission)) return true;
  // Compat técnica em testes: admin_contratos legado NÃO concede publish automaticamente.
  if (permission === 'contract_templates:view' && perms.includes('admin_contratos:view')) {
    return true;
  }
  return false;
}

function requirePermission(actor: ContractTemplateActor, permission: ContractTemplatePermission): void {
  if (!actorHas(actor, permission)) {
    fail('PERMISSION_DENIED', `Permissão necessária: ${permission}.`, 'permissions');
  }
}

function requireTenant(tenantId: TenantId | string | undefined): TenantId {
  const tid = String(tenantId || '').trim();
  if (!tid) fail('TENANT_REQUIRED', 'tenantId é obrigatório.', 'tenantId');
  return tid as TenantId;
}

function buildVariablesSchema(contentHtml: string) {
  const parsed = parseContractTemplateVariables(contentHtml);
  return parsed.usedKeys.map((key) => {
    const def = getContractTemplateVariableDefinition(key);
    return {
      key,
      label: def?.label || key,
      required: Boolean(def?.requiredByDefault),
      valueType: (def?.dataType === 'currency' || def?.dataType === 'list'
        ? 'string'
        : def?.dataType || 'string') as 'string' | 'number' | 'date' | 'boolean' | 'html' | 'table' | 'image',
    };
  });
}

export interface ContractTemplateApplicationServiceDeps {
  repository: ContractTemplateApplicationRepository;
  clauseLibrary?: ContractClauseLibrary;
  featureFlagContext?: ContractFeatureFlagContext;
  /** Em testes: força flags on. */
  skipFeatureFlagCheck?: boolean;
}

export interface ContractTemplateApplicationService {
  listTemplates(
    tenantId: TenantId,
    query: ContractTemplateListQuery,
    actor: ContractTemplateActor,
  ): Promise<ContractTemplateListResult>;

  getTemplate(
    tenantId: TenantId,
    templateId: ContractTemplateId,
    actor: ContractTemplateActor,
  ): Promise<ContractTemplateDetails | null>;

  createTemplate(
    tenantId: TenantId,
    input: CreateContractTemplateInput,
    actor: ContractTemplateActor,
  ): Promise<ContractTemplate>;

  updateTemplateDraft(
    tenantId: TenantId,
    templateId: ContractTemplateId,
    input: UpdateContractTemplateInput,
    actor: ContractTemplateActor,
  ): Promise<ContractTemplate>;

  createVersion(
    tenantId: TenantId,
    templateId: ContractTemplateId,
    input: CreateContractTemplateVersionInput,
    actor: ContractTemplateActor,
  ): Promise<ContractTemplateVersion>;

  updateVersionDraft(
    tenantId: TenantId,
    templateId: ContractTemplateId,
    versionId: ContractTemplateVersionId,
    input: UpdateContractTemplateVersionInput,
    actor: ContractTemplateActor,
  ): Promise<ContractTemplateVersion>;

  submitVersionForReview(
    tenantId: TenantId,
    templateId: ContractTemplateId,
    versionId: ContractTemplateVersionId,
    actor: ContractTemplateActor,
  ): Promise<ContractTemplateVersion>;

  publishVersion(
    tenantId: TenantId,
    templateId: ContractTemplateId,
    versionId: ContractTemplateVersionId,
    input: { changeSummary: string },
    actor: ContractTemplateActor,
  ): Promise<PublishedContractTemplateResult>;

  archiveTemplate(
    tenantId: TenantId,
    templateId: ContractTemplateId,
    actor: ContractTemplateActor,
  ): Promise<ContractTemplate>;

  duplicateTemplate(
    tenantId: TenantId,
    templateId: ContractTemplateId,
    actor: ContractTemplateActor,
  ): Promise<ContractTemplate>;

  validateVersion(
    tenantId: TenantId,
    templateId: ContractTemplateId,
    versionId: ContractTemplateVersionId,
    actor: ContractTemplateActor,
  ): Promise<ContractTemplateValidationResult>;

  previewVersion(
    tenantId: TenantId,
    templateId: ContractTemplateId,
    versionId: ContractTemplateVersionId,
    actor: ContractTemplateActor,
  ): Promise<{ html: string; unresolved: string[]; warnings: string[] }>;
}

export function createContractTemplateApplicationService(
  deps: ContractTemplateApplicationServiceDeps,
): ContractTemplateApplicationService {
  const repo = deps.repository;
  const clauses = deps.clauseLibrary || defaultContractClauseLibrary;

  function assertFlags(): void {
    if (deps.skipFeatureFlagCheck) return;
    const ctx = deps.featureFlagContext || {};
    if (!isContractFeatureEnabled('contracts_domain_v2_enabled', ctx)
      || !isContractFeatureEnabled('contract_templates_v2_enabled', ctx)) {
      fail('FEATURE_FLAG_DISABLED', 'Modelos v2 desabilitados neste ambiente.', 'featureFlag');
    }
  }

  async function loadTemplate(tenantId: TenantId, templateId: ContractTemplateId) {
    try {
      return await repo.findById(tenantId, templateId);
    } catch (error) {
      translateRepoError(error);
    }
  }

  return {
    async listTemplates(tenantId, query, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contract_templates:view');
      try {
        const items = await repo.list(tid, query || {});
        return { items, total: items.length };
      } catch (error) {
        translateRepoError(error);
      }
    },

    async getTemplate(tenantId, templateId, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contract_templates:view');
      const template = await loadTemplate(tid, templateId);
      if (!template) return null;
      try {
        const versions = await repo.listVersions(tid, templateId);
        const currentVersion = template.currentVersionId
          ? versions.find((v) => v.id === template.currentVersionId) || null
          : versions[versions.length - 1] || null;
        return { template, currentVersion, versions };
      } catch (error) {
        translateRepoError(error);
      }
    },

    async createTemplate(tenantId, input, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contract_templates:create');
      if (!String(input.name || '').trim()) {
        fail('INVALID_INPUT', 'Nome do modelo é obrigatório.', 'name');
      }
      const createdAt = nowIso();
      const templateId = newId('tpl') as ContractTemplateId;
      const versionId = newId('tplv') as ContractTemplateVersionId;
      const schema = input.initialContentSchema || createEmptyContentSchema();
      const contentHtml = contentSchemaToHtml(schema);
      const contentText = extractPlainTextFromSchema(schema);

      const template: ContractTemplate = {
        id: templateId,
        tenantId: tid,
        name: String(input.name).trim(),
        description: input.description,
        documentType: input.documentType,
        category: input.category,
        procedureCodes: input.procedureCodes || [],
        specialtyCodes: input.specialtyCodes || [],
        templateStatus: 'DRAFT',
        currentVersionId: versionId,
        isDefault: Boolean(input.isDefault),
        requirements: {
          ...createDefaultTemplateRequirements(),
          ...(input.requirements || {}),
        },
        signaturePolicyId: input.signaturePolicyId,
        createdBy: actor.userId,
        createdAt,
        updatedBy: actor.userId,
        updatedAt: createdAt,
        rowVersion: 1,
      };

      const version: ContractTemplateVersion = {
        id: versionId,
        tenantId: tid,
        templateId,
        versionNumber: 1,
        versionLabel: 'v1',
        contentSchema: schema,
        contentHtml,
        contentText,
        variablesSchema: buildVariablesSchema(contentHtml),
        clausesSnapshot: [],
        status: 'DRAFT',
        createdBy: actor.userId,
        createdAt,
        updatedAt: createdAt,
        rowVersion: 1,
      };

      try {
        if (template.isDefault) {
          const existing = await repo.list(tid, {
            documentType: template.documentType,
            category: template.category,
            isDefault: true,
            includeArchived: false,
          });
          for (const other of existing) {
            if (other.isDefault) {
              await repo.update(tid, { ...other, isDefault: false }, other.rowVersion);
            }
          }
        }
        await repo.create(tid, template);
        await repo.saveVersion(tid, version);
        return template;
      } catch (error) {
        translateRepoError(error);
      }
    },

    async updateTemplateDraft(tenantId, templateId, input, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contract_templates:update_draft');
      const template = await loadTemplate(tid, templateId);
      if (!template) fail('CONTRACT_NOT_FOUND', 'Modelo não encontrado.');
      if (isTemplateArchived(template.templateStatus)) {
        fail('TEMPLATE_ARCHIVED', 'Template arquivado não pode ser editado.');
      }
      if (!isTemplateEditableStatus(template.templateStatus)
        && template.templateStatus === 'PUBLISHED') {
        // Metadados de template publicado: permitir apenas campos não estruturais? Brief: update draft.
        // Bloqueia alteração estrutural quando arquivado; PUBLISHED pode atualizar metadados não-conteúdo.
      }

      const next: ContractTemplate = {
        ...template,
        name: input.name != null ? String(input.name).trim() : template.name,
        description: input.description !== undefined ? input.description : template.description,
        category: input.category !== undefined ? input.category : template.category,
        procedureCodes: input.procedureCodes ?? template.procedureCodes,
        specialtyCodes: input.specialtyCodes ?? template.specialtyCodes,
        isDefault: input.isDefault != null ? Boolean(input.isDefault) : template.isDefault,
        requirements: input.requirements
          ? { ...template.requirements, ...input.requirements }
          : template.requirements,
        signaturePolicyId: input.signaturePolicyId === null
          ? undefined
          : (input.signaturePolicyId ?? template.signaturePolicyId),
        updatedBy: actor.userId,
        updatedAt: nowIso(),
      };
      if (!next.name) fail('INVALID_INPUT', 'Nome vazio.', 'name');

      try {
        return await repo.update(tid, next, input.expectedRowVersion ?? template.rowVersion);
      } catch (error) {
        translateRepoError(error);
      }
    },

    async createVersion(tenantId, templateId, input, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contract_templates:update_draft');
      const template = await loadTemplate(tid, templateId);
      if (!template) fail('CONTRACT_NOT_FOUND', 'Modelo não encontrado.');
      if (isTemplateArchived(template.templateStatus)) {
        fail('TEMPLATE_ARCHIVED', 'Template arquivado.');
      }

      try {
        const versions = await repo.listVersions(tid, templateId);
        const maxNum = versions.reduce((m, v) => Math.max(m, v.versionNumber), 0);
        const base = template.currentVersionId
          ? versions.find((v) => v.id === template.currentVersionId)
          : versions[versions.length - 1];

        const schema = input.contentSchema
          || (base?.contentSchema as never)
          || createEmptyContentSchema();
        const contentHtml = input.contentHtml || contentSchemaToHtml(schema);
        const contentText = input.contentText || extractPlainTextFromSchema(schema);
        const createdAt = nowIso();
        const version: ContractTemplateVersion = {
          id: newId('tplv') as ContractTemplateVersionId,
          tenantId: tid,
          templateId,
          versionNumber: maxNum + 1,
          versionLabel: input.versionLabel || `v${maxNum + 1}`,
          contentSchema: schema,
          contentHtml,
          contentText,
          variablesSchema: buildVariablesSchema(contentHtml),
          clausesSnapshot: input.clausesSnapshot ?? base?.clausesSnapshot ?? [],
          changeSummary: input.changeSummary,
          status: 'DRAFT',
          createdBy: actor.userId,
          createdAt,
          updatedAt: createdAt,
          rowVersion: 1,
        };
        await repo.saveVersion(tid, version);
        await repo.update(tid, {
          ...template,
          currentVersionId: version.id,
          templateStatus: template.templateStatus === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
          updatedBy: actor.userId,
          updatedAt: createdAt,
        }, template.rowVersion);
        return version;
      } catch (error) {
        translateRepoError(error);
      }
    },

    async updateVersionDraft(tenantId, templateId, versionId, input, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contract_templates:update_draft');
      try {
        const version = await repo.findVersionById(tid, versionId);
        if (!version || version.templateId !== templateId) {
          fail('CONTRACT_NOT_FOUND', 'Versão não encontrada.');
        }
        if (isTemplatePublishedImmutable(version.status) && version.lockedAt) {
          fail('VERSION_ALREADY_LOCKED', 'Versão publicada é imutável.');
        }
        if (!isTemplateEditableStatus(version.status)) {
          fail('CONTENT_LOCKED', 'Versão não está em estado editável.');
        }

        const schema = input.contentSchema ?? (version.contentSchema as never);
        const contentHtml = input.contentHtml
          ?? (schema ? contentSchemaToHtml(schema) : version.contentHtml);
        const next: ContractTemplateVersion = {
          ...version,
          versionLabel: input.versionLabel ?? version.versionLabel,
          contentSchema: schema,
          contentHtml,
          contentText: input.contentText
            ?? (schema ? extractPlainTextFromSchema(schema) : version.contentText),
          variablesSchema: buildVariablesSchema(contentHtml),
          clausesSnapshot: input.clausesSnapshot ?? version.clausesSnapshot,
          changeSummary: input.changeSummary ?? version.changeSummary,
          updatedAt: nowIso(),
        };
        return await repo.updateVersion(
          tid,
          next,
          input.expectedRowVersion ?? version.rowVersion,
        );
      } catch (error) {
        if (error instanceof ContractTemplateApplicationError) throw error;
        translateRepoError(error);
      }
    },

    async submitVersionForReview(tenantId, templateId, versionId, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contract_templates:review');
      try {
        const template = await loadTemplate(tid, templateId);
        if (!template) fail('CONTRACT_NOT_FOUND', 'Modelo não encontrado.');
        const version = await repo.findVersionById(tid, versionId);
        if (!version || version.templateId !== templateId) {
          fail('CONTRACT_NOT_FOUND', 'Versão não encontrada.');
        }
        const transition = canTransitionTemplateStatus(version.status, 'IN_REVIEW');
        if (!transition.allowed) {
          fail('INVALID_STATUS_TRANSITION', transition.errors[0]?.message || 'Transição inválida.');
        }
        const next = { ...version, status: 'IN_REVIEW' as const, updatedAt: nowIso() };
        await repo.update(tid, {
          ...template,
          templateStatus: 'IN_REVIEW',
          updatedBy: actor.userId,
          updatedAt: nowIso(),
        }, template.rowVersion);
        return await repo.updateVersion(tid, next, version.rowVersion);
      } catch (error) {
        if (error instanceof ContractTemplateApplicationError) throw error;
        translateRepoError(error);
      }
    },

    async publishVersion(tenantId, templateId, versionId, input, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contract_templates:publish');
      try {
        const template = await loadTemplate(tid, templateId);
        if (!template) fail('CONTRACT_NOT_FOUND', 'Modelo não encontrado.');
        const version = await repo.findVersionById(tid, versionId);
        if (!version || version.templateId !== templateId) {
          fail('CONTRACT_NOT_FOUND', 'Versão não encontrada.');
        }

        // IN_REVIEW → PUBLISHED ou DRAFT → via IN_REVIEW implícito se já em review
        if (version.status === 'DRAFT') {
          fail(
            'INVALID_STATUS_TRANSITION',
            'Envie para revisão antes de publicar (DRAFT → IN_REVIEW → PUBLISHED).',
          );
        }
        const transition = canTransitionTemplateStatus(version.status, 'PUBLISHED');
        if (!transition.allowed) {
          fail('INVALID_STATUS_TRANSITION', transition.errors[0]?.message || 'Transição inválida.');
        }

        const validation = validateTemplateForPublication({
          template,
          version: { ...version, changeSummary: input.changeSummary },
          changeSummary: input.changeSummary,
        });
        if (!validation.valid) {
          const first = validation.errors[0];
          throw new ContractTemplateApplicationError(first);
        }

        // Snapshot de cláusulas usadas
        const html = version.contentHtml || '';
        const clauseCodes = [...html.matchAll(/SYS\.[A-Z_]+/g)].map((m) => m[0]);
        const snapshot = clauses.snapshotClauses(clauseCodes, tid);

        await repo.updateVersion(tid, {
          ...version,
          changeSummary: input.changeSummary,
          clausesSnapshot: snapshot,
        }, version.rowVersion);

        const published = await repo.publishVersionTransaction({
          tenantId: tid,
          templateId,
          versionId,
          publishedBy: actor.userId,
          changeSummary: input.changeSummary,
          previousCurrentVersionId: template.currentVersionId,
        });

        return {
          ...published,
          event: {
            type: 'contract_template.version_published' as const,
            tenantId: tid,
            templateId,
            versionId,
            publishedBy: actor.userId,
            occurredAt: published.version.publishedAt || nowIso(),
          },
        };
      } catch (error) {
        if (error instanceof ContractTemplateApplicationError) throw error;
        translateRepoError(error);
      }
    },

    async archiveTemplate(tenantId, templateId, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contract_templates:archive');
      const template = await loadTemplate(tid, templateId);
      if (!template) fail('CONTRACT_NOT_FOUND', 'Modelo não encontrado.');
      const transition = canTransitionTemplateStatus(template.templateStatus, 'ARCHIVED');
      if (!transition.allowed) {
        fail('INVALID_STATUS_TRANSITION', transition.errors[0]?.message || 'Não arquivável.');
      }
      try {
        return await repo.archive(tid, templateId);
      } catch (error) {
        translateRepoError(error);
      }
    },

    async duplicateTemplate(tenantId, templateId, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contract_templates:duplicate');
      const details = await this.getTemplate(tid, templateId, {
        ...actor,
        permissions: [...(actor.permissions || []), 'contract_templates:view'],
      });
      if (!details) fail('CONTRACT_NOT_FOUND', 'Modelo não encontrado.');

      const sourceVersion = details.currentVersion
        || details.versions[details.versions.length - 1];
      return this.createTemplate(tid, {
        name: `Cópia de ${details.template.name}`,
        description: details.template.description,
        documentType: details.template.documentType,
        category: details.template.category,
        procedureCodes: details.template.procedureCodes,
        specialtyCodes: details.template.specialtyCodes,
        isDefault: false,
        requirements: details.template.requirements,
        signaturePolicyId: details.template.signaturePolicyId,
        initialContentSchema: (sourceVersion?.contentSchema as never)
          || createEmptyContentSchema(),
      }, actor);
    },

    async validateVersion(tenantId, templateId, versionId, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contract_templates:view');
      const template = await loadTemplate(tid, templateId);
      if (!template) fail('CONTRACT_NOT_FOUND', 'Modelo não encontrado.');
      try {
        const version = await repo.findVersionById(tid, versionId);
        if (!version || version.templateId !== templateId) {
          fail('CONTRACT_NOT_FOUND', 'Versão não encontrada.');
        }
        return validateTemplateForPublication({ template, version });
      } catch (error) {
        if (error instanceof ContractTemplateApplicationError) throw error;
        translateRepoError(error);
      }
    },

    async previewVersion(tenantId, templateId, versionId, actor) {
      assertFlags();
      const tid = requireTenant(tenantId);
      requirePermission(actor, 'contract_templates:view');
      try {
        const version = await repo.findVersionById(tid, versionId);
        if (!version || version.templateId !== templateId) {
          fail('CONTRACT_NOT_FOUND', 'Versão não encontrada.');
        }
        const values = buildPreviewVariableValues();
        const rendered = renderContractTemplate(version.contentHtml, values, { mode: 'preview' });
        return {
          html: rendered.html,
          unresolved: rendered.unresolved,
          warnings: rendered.errors.map((e) => e.message),
        };
      } catch (error) {
        if (error instanceof ContractTemplateApplicationError) throw error;
        translateRepoError(error);
      }
    },
  };
}
