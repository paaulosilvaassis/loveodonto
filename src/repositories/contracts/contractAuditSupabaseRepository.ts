/**
 * @module repositories/contracts/contractAuditSupabaseRepository
 * @description Append-only — sem update/delete na API do repository.
 */

import type { ContractAuditRepository } from '../../domain/contracts/audit/contract-audit.repository.js';
import type { ContractAuditEvent } from '../../domain/contracts/audit/contract-audit.types.js';
import {
  ContractPersistenceTenantMismatchError,
  ContractPersistenceUnavailableError,
  mapPersistenceDriverError,
} from './contractPersistenceErrors.js';
import {
  assertValidTenantId,
  mapAuditRowToDomain,
  mapDomainAuditToRow,
} from './contractPersistenceMappers.js';
import { CONTRACT_V2_TABLES } from './contractPersistenceTables.js';
import type {
  AppContractAuditEventRow,
  ContractSupabaseClient,
} from './contractPersistenceTypes.js';

export class ContractAuditSupabaseRepository implements ContractAuditRepository {
  constructor(private readonly deps: { client?: ContractSupabaseClient | null } = {}) {}

  private client(): ContractSupabaseClient {
    if (!this.deps.client) throw new ContractPersistenceUnavailableError();
    return this.deps.client;
  }

  async append(tenantId: string, event: ContractAuditEvent): Promise<ContractAuditEvent> {
    const tid = assertValidTenantId(tenantId);
    if (event.tenantId && event.tenantId !== tid) {
      throw new ContractPersistenceTenantMismatchError(tid, event.tenantId);
    }
    const row = mapDomainAuditToRow({ ...event, tenantId: tid });
    // Não logar metadata completa / HTML / PII
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.AUDIT_EVENTS)
      .insert(row)
      .select('*')
      .single();
    if (error) mapPersistenceDriverError(error);
    return mapAuditRowToDomain(data as AppContractAuditEventRow);
  }

  async findById(tenantId: string, eventId: string): Promise<ContractAuditEvent | null> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.AUDIT_EVENTS)
      .select('*')
      .eq('tenant_id', tid)
      .eq('id', eventId)
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    return data ? mapAuditRowToDomain(data as AppContractAuditEventRow) : null;
  }

  async listByContract(
    tenantId: string,
    contractId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<ContractAuditEvent[]> {
    const tid = assertValidTenantId(tenantId);
    const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500);
    const offset = Math.max(Number(options.offset) || 0, 0);
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.AUDIT_EVENTS)
      .select('*')
      .eq('tenant_id', tid)
      .eq('contract_id', contractId)
      .order('occurred_at', { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) mapPersistenceDriverError(error);
    return (data || []).map((row: AppContractAuditEventRow) => mapAuditRowToDomain(row));
  }
}
