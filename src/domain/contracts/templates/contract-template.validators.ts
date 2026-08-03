/**
 * @module domain/contracts/templates/contract-template.validators
 */

import { isContractDocumentType } from '../contract.constants.js';
import {
  createContractDomainError,
  type ContractDomainError,
  type ContractDomainWarning,
} from '../contract.errors.js';
import type { ValidationResult } from '../contract.validators.js';
import type { ContractTemplate, ContractTemplateVersion } from './contract-template.types.js';

function result(errors: ContractDomainError[], warnings: ContractDomainWarning[] = []): ValidationResult {
  return { valid: errors.length === 0, errors, warnings };
}

export function validateContractTemplate(template: Partial<ContractTemplate>): ValidationResult {
  const errors: ContractDomainError[] = [];
  if (!String(template.tenantId || '').trim()) {
    errors.push(createContractDomainError('TENANT_REQUIRED', 'tenantId é obrigatório.', 'tenantId'));
  }
  if (!String(template.name || '').trim()) {
    errors.push(createContractDomainError('INVALID_INPUT', 'Nome do modelo é obrigatório.', 'name'));
  }
  if (!isContractDocumentType(template.documentType)) {
    errors.push(createContractDomainError(
      'INVALID_DOCUMENT_TYPE',
      'Tipo de documento do modelo inválido.',
      'documentType',
    ));
  }
  return result(errors);
}

export function validateContractTemplateVersion(
  version: Partial<ContractTemplateVersion>,
): ValidationResult {
  const errors: ContractDomainError[] = [];
  if (!String(version.tenantId || '').trim()) {
    errors.push(createContractDomainError('TENANT_REQUIRED', 'tenantId é obrigatório.', 'tenantId'));
  }
  if (!String(version.templateId || '').trim()) {
    errors.push(createContractDomainError('TEMPLATE_REQUIRED', 'templateId é obrigatório.', 'templateId'));
  }
  if (!Number.isInteger(version.versionNumber) || Number(version.versionNumber) < 1) {
    errors.push(createContractDomainError(
      'VERSION_NUMBER_INVALID',
      'versionNumber deve ser inteiro >= 1.',
      'versionNumber',
    ));
  }
  if (!String(version.contentHtml || '').trim()) {
    errors.push(createContractDomainError('INVALID_INPUT', 'contentHtml é obrigatório.', 'contentHtml'));
  }
  if (version.status === 'PUBLISHED' && version.publishedAt == null) {
    errors.push(createContractDomainError(
      'TEMPLATE_NOT_PUBLISHED',
      'Versão PUBLISHED exige publishedAt.',
      'publishedAt',
    ));
  }
  return result(errors);
}
