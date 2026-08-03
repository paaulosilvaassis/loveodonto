/**
 * @module domain/contracts/templates/contract-template.repository
 */

import type {
  ContractTemplateId,
  ContractTemplateVersionId,
  TenantId,
} from '../contract.ids.js';
import type { ContractTemplate, ContractTemplateVersion } from './contract-template.types.js';

export interface ContractTemplateRepository {
  findById(
    tenantId: TenantId,
    templateId: ContractTemplateId,
  ): Promise<ContractTemplate | null>;

  list(
    tenantId: TenantId,
    query?: { documentType?: string; includeArchived?: boolean },
  ): Promise<ContractTemplate[]>;

  create(
    tenantId: TenantId,
    template: ContractTemplate,
  ): Promise<ContractTemplate>;

  saveVersion(
    tenantId: TenantId,
    version: ContractTemplateVersion,
  ): Promise<ContractTemplateVersion>;

  findVersionById(
    tenantId: TenantId,
    versionId: ContractTemplateVersionId,
  ): Promise<ContractTemplateVersion | null>;

  publishVersion(
    tenantId: TenantId,
    versionId: ContractTemplateVersionId,
    publishedBy: string,
  ): Promise<ContractTemplateVersion>;

  archive(
    tenantId: TenantId,
    templateId: ContractTemplateId,
  ): Promise<ContractTemplate>;
}
