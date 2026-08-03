/**
 * @module repositories/contracts/contractIdempotencyPostgres.repository
 * @description Idempotência persistida — Phase 10.9.
 */

import type {
  ContractIdempotencyOperation,
  ContractIdempotencyRecord,
  ContractIdempotencyRepository,
  ContractIdempotencyReservationResult,
} from '../../domain/contracts/idempotency/contract-idempotency.js';
import type { TenantId } from '../../domain/contracts/contract.ids.js';
import {
  ContractPersistenceUnavailableError,
  mapPersistenceDriverError,
} from './contractPersistenceErrors.js';
import { assertValidTenantId } from './contractPersistenceMappers.js';
import { CONTRACT_V2_TABLES } from './contractPersistenceTables.js';
import type { ContractSupabaseClient } from './contractPersistenceTypes.js';

export class ContractIdempotencyPostgresRepository implements ContractIdempotencyRepository {
  constructor(private readonly client?: ContractSupabaseClient | null) {}

  private getClient(): ContractSupabaseClient {
    if (!this.client) throw new ContractPersistenceUnavailableError();
    return this.client;
  }

  private mapRow(row: Record<string, unknown>): ContractIdempotencyRecord {
    return {
      tenantId: String(row.tenant_id) as TenantId,
      operation: String(row.scope) as ContractIdempotencyOperation,
      key: String(row.idempotency_key),
      inputFingerprint: String(row.input_fingerprint || row.request_hash || ''),
      status: String(row.status || 'RESERVED') as ContractIdempotencyRecord['status'],
      resultRef: row.result_ref ?? row.resource_id ?? undefined,
      createdAt: String(row.created_at),
      completedAt: row.completed_at ? String(row.completed_at) : undefined,
      errorCode: row.error_code ? String(row.error_code) : undefined,
    };
  }

  async findResult(
    tenantId: TenantId,
    operation: ContractIdempotencyOperation,
    key: string,
  ): Promise<ContractIdempotencyRecord | null> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.IDEMPOTENCY_KEYS)
      .select('*')
      .eq('tenant_id', tid)
      .eq('scope', operation)
      .eq('idempotency_key', key)
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    return data ? this.mapRow(data) : null;
  }

  async reserve(
    tenantId: TenantId,
    operation: ContractIdempotencyOperation,
    key: string,
    inputFingerprint: string,
    createdAt: string,
  ): Promise<ContractIdempotencyReservationResult> {
    const tid = assertValidTenantId(tenantId);
    const existing = await this.findResult(tid, operation, key);
    if (existing) {
      if (existing.inputFingerprint && existing.inputFingerprint !== inputFingerprint) {
        return { kind: 'conflict', record: existing };
      }
      if (existing.status === 'COMPLETED' || existing.status === 'RESERVED') {
        return { kind: 'replay', record: existing };
      }
      if (existing.status === 'FAILED') {
        const { error } = await this.getClient()
          .from(CONTRACT_V2_TABLES.IDEMPOTENCY_KEYS)
          .update({
            status: 'RESERVED',
            input_fingerprint: inputFingerprint,
            request_hash: inputFingerprint,
            error_code: null,
            completed_at: null,
            created_at: createdAt,
          })
          .eq('tenant_id', tid)
          .eq('scope', operation)
          .eq('idempotency_key', key);
        if (error) mapPersistenceDriverError(error);
        return { kind: 'reserved' };
      }
    }

    const { error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.IDEMPOTENCY_KEYS)
      .insert({
        tenant_id: tid,
        scope: operation,
        idempotency_key: key,
        resource_type: operation,
        request_hash: inputFingerprint,
        input_fingerprint: inputFingerprint,
        status: 'RESERVED',
        created_at: createdAt,
      });
    if (error) {
      // unique race → re-read
      const again = await this.findResult(tid, operation, key);
      if (again) {
        if (again.inputFingerprint !== inputFingerprint) {
          return { kind: 'conflict', record: again };
        }
        return { kind: 'replay', record: again };
      }
      mapPersistenceDriverError(error);
    }
    return { kind: 'reserved' };
  }

  async complete(
    tenantId: TenantId,
    operation: ContractIdempotencyOperation,
    key: string,
    resultRef: unknown,
    completedAt: string,
  ): Promise<void> {
    const tid = assertValidTenantId(tenantId);
    const { error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.IDEMPOTENCY_KEYS)
      .update({
        status: 'COMPLETED',
        result_ref: typeof resultRef === 'string' ? { id: resultRef } : resultRef,
        completed_at: completedAt,
        error_code: null,
      })
      .eq('tenant_id', tid)
      .eq('scope', operation)
      .eq('idempotency_key', key);
    if (error) mapPersistenceDriverError(error);
  }

  async fail(
    tenantId: TenantId,
    operation: ContractIdempotencyOperation,
    key: string,
    errorCode: string,
    completedAt: string,
  ): Promise<void> {
    const tid = assertValidTenantId(tenantId);
    const { error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.IDEMPOTENCY_KEYS)
      .update({
        status: 'FAILED',
        error_code: errorCode,
        completed_at: completedAt,
      })
      .eq('tenant_id', tid)
      .eq('scope', operation)
      .eq('idempotency_key', key);
    if (error) mapPersistenceDriverError(error);
  }
}
