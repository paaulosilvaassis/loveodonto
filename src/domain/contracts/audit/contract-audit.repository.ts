/**
 * @module domain/contracts/audit/contract-audit.repository
 * @description Append-only — sem update/delete na interface.
 */

import type { ContractAuditEventId, TenantId } from '../contract.ids.js';
import type { ContractAuditEvent } from './contract-audit.types.js';

export interface ContractAuditRepository {
  append(
    tenantId: TenantId,
    event: ContractAuditEvent,
  ): Promise<ContractAuditEvent>;

  findById(
    tenantId: TenantId,
    eventId: ContractAuditEventId,
  ): Promise<ContractAuditEvent | null>;

  listByContract(
    tenantId: TenantId,
    contractId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<ContractAuditEvent[]>;
}
