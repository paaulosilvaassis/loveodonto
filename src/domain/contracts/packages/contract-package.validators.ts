/**
 * @module domain/contracts/packages/contract-package.validators
 */

import { createContractDomainError, type ContractDomainError } from '../contract.errors.js';
import type { ValidationResult } from '../contract.validators.js';
import type { ContractPackage } from './contract-package.types.js';

export function validateContractPackage(pkg: Partial<ContractPackage>): ValidationResult {
  const errors: ContractDomainError[] = [];
  if (!String(pkg.tenantId || '').trim()) {
    errors.push(createContractDomainError('TENANT_REQUIRED', 'tenantId é obrigatório.', 'tenantId'));
  }
  if (!String(pkg.patientId || '').trim()) {
    errors.push(createContractDomainError('PATIENT_REQUIRED', 'patientId é obrigatório.', 'patientId'));
  }
  if (!String(pkg.packageNumber || '').trim()) {
    errors.push(createContractDomainError('INVALID_INPUT', 'packageNumber é obrigatório.', 'packageNumber'));
  }
  const required = (pkg.requirements || []).filter((r) => r.required);
  const completedTypes = new Set(
    (pkg.items || [])
      .filter((i) => i.status === 'SIGNED' || i.status === 'COMPLETED' || i.completedAt)
      .map((i) => i.documentType),
  );
  const missing = required.filter((r) => !completedTypes.has(r.documentType));
  if (pkg.status === 'COMPLETED' && missing.length > 0) {
    errors.push(createContractDomainError(
      'PACKAGE_INCOMPLETE',
      'Pacote marcado como COMPLETED com documentos obrigatórios pendentes.',
      'items',
      { missing: missing.map((m) => m.documentType) },
    ));
  }
  return { valid: errors.length === 0, errors, warnings: [] };
}
