/**
 * @module domain/contracts/templates/contract-template-memory.repository
 * @description Repository in-memory para testes e ambientes sem migrations — Phase 10.4.
 */

import type {
  ContractTemplateId,
  ContractTemplateVersionId,
  TenantId,
} from '../contract.ids.js';
import type {
  ContractTemplate,
  ContractTemplateListQuery,
  ContractTemplateVersion,
} from './contract-template.types.js';
import type { ContractTemplateApplicationRepository } from './contract-template.application-repository.js';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class ContractTemplateMemoryRepository implements ContractTemplateApplicationRepository {
  private templates = new Map<string, ContractTemplate>();
  private versions = new Map<string, ContractTemplateVersion>();
  private available = true;

  setStorageAvailable(available: boolean): void {
    this.available = available;
  }

  private key(tenantId: string, id: string): string {
    return `${tenantId}::${id}`;
  }

  private assertAvailable(): void {
    if (!this.available) {
      const err = new Error('O módulo de modelos v2 ainda não está disponível neste ambiente.');
      (err as Error & { code: string }).code = 'CONTRACTS_V2_STORAGE_UNAVAILABLE';
      throw err;
    }
  }

  async findById(
    tenantId: TenantId,
    templateId: ContractTemplateId,
  ): Promise<ContractTemplate | null> {
    this.assertAvailable();
    const found = this.templates.get(this.key(tenantId, templateId));
    return found ? clone(found) : null;
  }

  async list(
    tenantId: TenantId,
    query: ContractTemplateListQuery = {},
  ): Promise<ContractTemplate[]> {
    this.assertAvailable();
    let items = [...this.templates.values()].filter((t) => t.tenantId === tenantId);
    if (!query.includeArchived) {
      items = items.filter((t) => t.templateStatus !== 'ARCHIVED');
    }
    if (query.documentType) {
      items = items.filter((t) => t.documentType === query.documentType);
    }
    if (query.category) {
      items = items.filter((t) => t.category === query.category);
    }
    if (query.status) {
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      items = items.filter((t) => statuses.includes(t.templateStatus));
    }
    if (query.isDefault != null) {
      items = items.filter((t) => t.isDefault === query.isDefault);
    }
    if (query.procedureCode) {
      items = items.filter((t) => (t.procedureCodes || []).includes(query.procedureCode!));
    }
    if (query.specialtyCode) {
      items = items.filter((t) => (t.specialtyCodes || []).includes(query.specialtyCode!));
    }
    if (query.search) {
      const q = query.search.toLowerCase();
      items = items.filter((t) => t.name.toLowerCase().includes(q)
        || String(t.description || '').toLowerCase().includes(q));
    }
    return items.map(clone);
  }

  async create(tenantId: TenantId, template: ContractTemplate): Promise<ContractTemplate> {
    this.assertAvailable();
    if (template.tenantId !== tenantId) {
      const err = new Error('TENANT_MISMATCH');
      (err as Error & { code: string }).code = 'TENANT_MISMATCH';
      throw err;
    }
    const stored = { ...clone(template), rowVersion: template.rowVersion ?? 1 };
    this.templates.set(this.key(tenantId, template.id), stored);
    return clone(stored);
  }

  async update(
    tenantId: TenantId,
    template: ContractTemplate,
    expectedRowVersion?: number,
  ): Promise<ContractTemplate> {
    this.assertAvailable();
    const existing = this.templates.get(this.key(tenantId, template.id));
    if (!existing) {
      const err = new Error('TEMPLATE_NOT_FOUND');
      (err as Error & { code: string }).code = 'CONTRACT_NOT_FOUND';
      throw err;
    }
    if (
      expectedRowVersion != null
      && existing.rowVersion != null
      && expectedRowVersion !== existing.rowVersion
    ) {
      const err = new Error('OPTIMISTIC_CONCURRENCY_CONFLICT');
      (err as Error & { code: string }).code = 'OPTIMISTIC_CONCURRENCY_CONFLICT';
      throw err;
    }
    const stored = {
      ...clone(template),
      tenantId,
      rowVersion: (existing.rowVersion || 1) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.templates.set(this.key(tenantId, template.id), stored);
    return clone(stored);
  }

  async saveVersion(
    tenantId: TenantId,
    version: ContractTemplateVersion,
  ): Promise<ContractTemplateVersion> {
    this.assertAvailable();
    if (version.tenantId !== tenantId) {
      const err = new Error('TENANT_MISMATCH');
      (err as Error & { code: string }).code = 'TENANT_MISMATCH';
      throw err;
    }
    const key = this.key(tenantId, version.id);
    const existing = this.versions.get(key);
    if (existing && isPublishedLocked(existing)) {
      const err = new Error('VERSION_ALREADY_LOCKED');
      (err as Error & { code: string }).code = 'VERSION_ALREADY_LOCKED';
      throw err;
    }
    if (
      existing
      && version.rowVersion != null
      && existing.rowVersion != null
      && version.rowVersion !== existing.rowVersion
    ) {
      // allow create without conflict; for update via same id check expected via rowVersion match on write
    }
    const stored = {
      ...clone(version),
      rowVersion: existing ? (existing.rowVersion || 1) + 1 : (version.rowVersion ?? 1),
      updatedAt: new Date().toISOString(),
    };
    this.versions.set(key, stored);
    return clone(stored);
  }

  async updateVersion(
    tenantId: TenantId,
    version: ContractTemplateVersion,
    expectedRowVersion?: number,
  ): Promise<ContractTemplateVersion> {
    this.assertAvailable();
    const key = this.key(tenantId, version.id);
    const existing = this.versions.get(key);
    if (!existing || existing.tenantId !== tenantId) {
      const err = new Error('VERSION_NOT_FOUND');
      (err as Error & { code: string }).code = 'CONTRACT_NOT_FOUND';
      throw err;
    }
    if (isPublishedLocked(existing)) {
      const err = new Error('VERSION_ALREADY_LOCKED');
      (err as Error & { code: string }).code = 'VERSION_ALREADY_LOCKED';
      throw err;
    }
    if (
      expectedRowVersion != null
      && existing.rowVersion != null
      && expectedRowVersion !== existing.rowVersion
    ) {
      const err = new Error('OPTIMISTIC_CONCURRENCY_CONFLICT');
      (err as Error & { code: string }).code = 'OPTIMISTIC_CONCURRENCY_CONFLICT';
      throw err;
    }
    const stored = {
      ...clone(version),
      tenantId,
      rowVersion: (existing.rowVersion || 1) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.versions.set(key, stored);
    return clone(stored);
  }

  async findVersionById(
    tenantId: TenantId,
    versionId: ContractTemplateVersionId,
  ): Promise<ContractTemplateVersion | null> {
    this.assertAvailable();
    const found = this.versions.get(this.key(tenantId, versionId));
    return found && found.tenantId === tenantId ? clone(found) : null;
  }

  async listVersions(
    tenantId: TenantId,
    templateId: ContractTemplateId,
  ): Promise<ContractTemplateVersion[]> {
    this.assertAvailable();
    return [...this.versions.values()]
      .filter((v) => v.tenantId === tenantId && v.templateId === templateId)
      .sort((a, b) => a.versionNumber - b.versionNumber)
      .map(clone);
  }

  async publishVersionTransaction(input: {
    tenantId: TenantId;
    templateId: ContractTemplateId;
    versionId: ContractTemplateVersionId;
    publishedBy: string;
    changeSummary: string;
    previousCurrentVersionId?: ContractTemplateVersionId;
  }): Promise<{
    template: ContractTemplate;
    version: ContractTemplateVersion;
    supersededVersionId?: ContractTemplateVersionId;
  }> {
    this.assertAvailable();
    const { tenantId, templateId, versionId, publishedBy, changeSummary } = input;
    const template = this.templates.get(this.key(tenantId, templateId));
    const version = this.versions.get(this.key(tenantId, versionId));
    if (!template || !version) {
      const err = new Error('NOT_FOUND');
      (err as Error & { code: string }).code = 'CONTRACT_NOT_FOUND';
      throw err;
    }
    if (version.templateId !== templateId) {
      const err = new Error('VERSION_REQUIRED');
      (err as Error & { code: string }).code = 'VERSION_REQUIRED';
      throw err;
    }

    // Simula transação: clona estado; em falha restauraria — aqui aplica atomicamente em memória.
    const now = new Date().toISOString();
    let supersededVersionId: ContractTemplateVersionId | undefined;

    // Qualquer outra versão PUBLISHED do mesmo template torna-se SUPERSEDED.
    for (const [mapKey, prev] of this.versions.entries()) {
      if (
        prev.tenantId === tenantId
        && prev.templateId === templateId
        && prev.id !== versionId
        && prev.status === 'PUBLISHED'
      ) {
        const superseded = {
          ...prev,
          status: 'SUPERSEDED' as const,
          rowVersion: (prev.rowVersion || 1) + 1,
          updatedAt: now,
        };
        this.versions.set(mapKey, superseded);
        supersededVersionId = prev.id;
      }
    }

    const published: ContractTemplateVersion = {
      ...version,
      status: 'PUBLISHED',
      changeSummary,
      publishedBy,
      publishedAt: now,
      lockedAt: now,
      rowVersion: (version.rowVersion || 1) + 1,
      updatedAt: now,
    };
    this.versions.set(this.key(tenantId, versionId), published);

    const updatedTemplate: ContractTemplate = {
      ...template,
      templateStatus: 'PUBLISHED',
      currentVersionId: versionId,
      updatedBy: publishedBy,
      updatedAt: now,
      rowVersion: (template.rowVersion || 1) + 1,
    };
    this.templates.set(this.key(tenantId, templateId), updatedTemplate);

    return {
      template: clone(updatedTemplate),
      version: clone(published),
      supersededVersionId,
    };
  }

  async publishVersion(
    tenantId: TenantId,
    versionId: ContractTemplateVersionId,
    publishedBy: string,
  ): Promise<ContractTemplateVersion> {
    this.assertAvailable();
    const version = this.versions.get(this.key(tenantId, versionId));
    if (!version) {
      const err = new Error('NOT_FOUND');
      (err as Error & { code: string }).code = 'CONTRACT_NOT_FOUND';
      throw err;
    }
    const result = await this.publishVersionTransaction({
      tenantId,
      templateId: version.templateId,
      versionId,
      publishedBy,
      changeSummary: version.changeSummary || 'publish',
      previousCurrentVersionId: undefined,
    });
    return result.version;
  }

  async archive(tenantId: TenantId, templateId: ContractTemplateId): Promise<ContractTemplate> {
    this.assertAvailable();
    const existing = this.templates.get(this.key(tenantId, templateId));
    if (!existing) {
      const err = new Error('NOT_FOUND');
      (err as Error & { code: string }).code = 'CONTRACT_NOT_FOUND';
      throw err;
    }
    const now = new Date().toISOString();
    const archived: ContractTemplate = {
      ...existing,
      templateStatus: 'ARCHIVED',
      archivedAt: now,
      updatedAt: now,
      rowVersion: (existing.rowVersion || 1) + 1,
    };
    this.templates.set(this.key(tenantId, templateId), archived);
    return clone(archived);
  }
}

function isPublishedLocked(version: ContractTemplateVersion): boolean {
  return (version.status === 'PUBLISHED' || version.status === 'SUPERSEDED')
    && Boolean(version.lockedAt || version.publishedAt);
}
