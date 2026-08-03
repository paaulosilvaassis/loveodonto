/**
 * @module repositories/contracts/contractTemplateSupabaseRepository
 */

import type { ContractTemplateRepository } from '../../domain/contracts/templates/contract-template.repository.js';
import type {
  ContractTemplate,
  ContractTemplateVersion,
} from '../../domain/contracts/templates/contract-template.types.js';
import {
  ContractPersistenceNotFoundError,
  ContractPersistenceTenantMismatchError,
  ContractPersistenceUnavailableError,
  mapPersistenceDriverError,
} from './contractPersistenceErrors.js';
import {
  assertValidTenantId,
  mapDomainTemplateToRow,
  mapTemplateRowToDomain,
} from './contractPersistenceMappers.js';
import { CONTRACT_V2_TABLES } from './contractPersistenceTables.js';
import type {
  AppContractTemplateRow,
  ContractSupabaseClient,
} from './contractPersistenceTypes.js';

export class ContractTemplateSupabaseRepository implements ContractTemplateRepository {
  constructor(private readonly deps: { client?: ContractSupabaseClient | null } = {}) {}

  private client(): ContractSupabaseClient {
    if (!this.deps.client) throw new ContractPersistenceUnavailableError();
    return this.deps.client;
  }

  async findById(tenantId: string, templateId: string): Promise<ContractTemplate | null> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.TEMPLATES)
      .select('*')
      .eq('tenant_id', tid)
      .eq('id', templateId)
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    return data ? mapTemplateRowToDomain(data as AppContractTemplateRow) : null;
  }

  async list(
    tenantId: string,
    query: { documentType?: string; includeArchived?: boolean } = {},
  ): Promise<ContractTemplate[]> {
    const tid = assertValidTenantId(tenantId);
    let builder = this.client()
      .from(CONTRACT_V2_TABLES.TEMPLATES)
      .select('*')
      .eq('tenant_id', tid);
    if (query.documentType) builder = builder.eq('document_type', query.documentType);
    if (!query.includeArchived) builder = builder.is('archived_at', null);
    const { data, error } = await builder;
    if (error) mapPersistenceDriverError(error);
    return (data || []).map((row: AppContractTemplateRow) => mapTemplateRowToDomain(row));
  }

  async create(tenantId: string, template: ContractTemplate): Promise<ContractTemplate> {
    const tid = assertValidTenantId(tenantId);
    if (template.tenantId && template.tenantId !== tid) {
      throw new ContractPersistenceTenantMismatchError(tid, template.tenantId);
    }
    const row = mapDomainTemplateToRow({ ...template, tenantId: tid });
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.TEMPLATES)
      .insert(row)
      .select('*')
      .single();
    if (error) mapPersistenceDriverError(error);
    return mapTemplateRowToDomain(data as AppContractTemplateRow);
  }

  async saveVersion(
    tenantId: string,
    version: ContractTemplateVersion,
  ): Promise<ContractTemplateVersion> {
    const tid = assertValidTenantId(tenantId);
    const row = {
      id: version.id,
      tenant_id: tid,
      template_id: version.templateId,
      version_number: version.versionNumber,
      version_label: version.versionLabel ?? null,
      content_schema: version.contentSchema ?? {},
      content_html: version.contentHtml,
      content_text: version.contentText ?? null,
      variables_schema: version.variablesSchema ?? [],
      clauses_snapshot: version.clausesSnapshot ?? null,
      change_summary: version.changeSummary ?? null,
      status: version.status,
      published_by: version.publishedBy ?? null,
      published_at: version.publishedAt ?? null,
      created_by: version.createdBy,
      created_at: version.createdAt,
      locked_at: version.status === 'PUBLISHED' ? (version.publishedAt || version.createdAt) : null,
    };
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.TEMPLATE_VERSIONS)
      .insert(row)
      .select('*')
      .single();
    if (error) mapPersistenceDriverError(error);
    return {
      ...version,
      tenantId: tid,
      id: data.id,
    };
  }

  async findVersionById(
    tenantId: string,
    versionId: string,
  ): Promise<ContractTemplateVersion | null> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.TEMPLATE_VERSIONS)
      .select('*')
      .eq('tenant_id', tid)
      .eq('id', versionId)
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    if (!data) return null;
    return {
      id: data.id,
      tenantId: data.tenant_id,
      templateId: data.template_id,
      versionNumber: data.version_number,
      versionLabel: data.version_label ?? undefined,
      contentSchema: data.content_schema,
      contentHtml: data.content_html || '',
      contentText: data.content_text ?? undefined,
      variablesSchema: Array.isArray(data.variables_schema) ? data.variables_schema : [],
      clausesSnapshot: data.clauses_snapshot ?? undefined,
      changeSummary: data.change_summary ?? undefined,
      status: data.status,
      publishedBy: data.published_by ?? undefined,
      publishedAt: data.published_at ?? undefined,
      createdBy: data.created_by || 'system',
      createdAt: data.created_at,
    };
  }

  async publishVersion(
    tenantId: string,
    versionId: string,
    publishedBy: string,
  ): Promise<ContractTemplateVersion> {
    const tid = assertValidTenantId(tenantId);
    const publishedAt = new Date().toISOString();
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.TEMPLATE_VERSIONS)
      .update({
        status: 'PUBLISHED',
        published_by: publishedBy,
        published_at: publishedAt,
        locked_at: publishedAt,
      })
      .eq('tenant_id', tid)
      .eq('id', versionId)
      .neq('status', 'PUBLISHED')
      .select('*')
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    if (!data) throw new ContractPersistenceNotFoundError('template_version', versionId);
    const found = await this.findVersionById(tid, versionId);
    if (!found) throw new ContractPersistenceNotFoundError('template_version', versionId);
    return found;
  }

  async archive(tenantId: string, templateId: string): Promise<ContractTemplate> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.TEMPLATES)
      .update({
        status: 'ARCHIVED',
        archived_at: new Date().toISOString(),
      })
      .eq('tenant_id', tid)
      .eq('id', templateId)
      .select('*')
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    if (!data) throw new ContractPersistenceNotFoundError('template', templateId);
    return mapTemplateRowToDomain(data as AppContractTemplateRow);
  }
}
