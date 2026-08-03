/**
 * @module domain/contracts/templates/contract-template.application-repository
 * @description Porta estendida do application service — Phase 10.4.
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
import type { ContractTemplateRepository } from './contract-template.repository.js';

export interface ContractTemplateApplicationRepository extends ContractTemplateRepository {
  update(
    tenantId: TenantId,
    template: ContractTemplate,
    expectedRowVersion?: number,
  ): Promise<ContractTemplate>;

  updateVersion(
    tenantId: TenantId,
    version: ContractTemplateVersion,
    expectedRowVersion?: number,
  ): Promise<ContractTemplateVersion>;

  listVersions(
    tenantId: TenantId,
    templateId: ContractTemplateId,
  ): Promise<ContractTemplateVersion[]>;

  list(
    tenantId: TenantId,
    query?: ContractTemplateListQuery,
  ): Promise<ContractTemplate[]>;

  publishVersionTransaction(input: {
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
  }>;
}
