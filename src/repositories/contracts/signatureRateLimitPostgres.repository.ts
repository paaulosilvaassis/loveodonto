/**
 * @module repositories/contracts/signatureRateLimitPostgres.repository
 * @description Rate limits Postgres — Phase 10.10.
 */

import type {
  SignatureRateLimitOperation,
  SignatureRateLimitRecord,
  SignatureRateLimitRepository,
} from '../../domain/contracts/signatures/signature-rate-limit.repository.js';
import type { TenantId } from '../../domain/contracts/contract.ids.js';
import {
  ContractPersistenceConflictError,
  ContractPersistenceUnavailableError,
  mapPersistenceDriverError,
} from './contractPersistenceErrors.js';
import { assertValidTenantId } from './contractPersistenceMappers.js';
import { CONTRACT_V2_TABLES } from './contractPersistenceTables.js';
import type { ContractSupabaseClient } from './contractPersistenceTypes.js';
import type { DatabaseTransactionClient } from './contractsV2Transaction.js';

function mapRow(row: Record<string, unknown>): SignatureRateLimitRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id) as TenantId,
    scopeKey: String(row.scope_key),
    operation: String(row.operation) as SignatureRateLimitOperation,
    windowStartedAt: String(row.window_started_at),
    windowEndsAt: String(row.window_ends_at),
    counter: Number(row.counter),
    blockedUntil: row.blocked_until ? String(row.blocked_until) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    rowVersion: Number(row.row_version),
  };
}

export class PostgresSignatureRateLimitRepository implements SignatureRateLimitRepository {
  constructor(
    private readonly client?: ContractSupabaseClient | DatabaseTransactionClient | null,
  ) {}

  private getClient(): ContractSupabaseClient {
    if (!this.client) throw new ContractPersistenceUnavailableError();
    return this.client;
  }

  async findActiveWindow(
    tenantId: TenantId,
    scopeKey: string,
    operation: SignatureRateLimitOperation,
    nowIso: string,
  ): Promise<SignatureRateLimitRecord | null> {
    const tid = assertValidTenantId(tenantId);
    const now = Date.parse(nowIso);
    const { data, error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.SIGNATURE_RATE_LIMITS)
      .select('*')
      .eq('tenant_id', tid)
      .eq('scope_key', scopeKey)
      .eq('operation', operation)
      .gt('window_ends_at', nowIso)
      .order('window_started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    if (!data) return null;
    const row = mapRow(data);
    if (Date.parse(row.windowEndsAt) <= now) return null;
    return row;
  }

  async upsertIncrement(input: {
    tenantId: TenantId;
    scopeKey: string;
    operation: SignatureRateLimitOperation;
    windowStartedAt: string;
    windowEndsAt: string;
    blockedUntil?: string | null;
  }): Promise<SignatureRateLimitRecord> {
    const tid = assertValidTenantId(input.tenantId);
    const existing = await this.getClient()
      .from(CONTRACT_V2_TABLES.SIGNATURE_RATE_LIMITS)
      .select('*')
      .eq('tenant_id', tid)
      .eq('scope_key', input.scopeKey)
      .eq('operation', input.operation)
      .eq('window_started_at', input.windowStartedAt)
      .maybeSingle();
    if (existing.error) mapPersistenceDriverError(existing.error);

    if (existing.data) {
      const row = mapRow(existing.data);
      const { data, error } = await this.getClient()
        .from(CONTRACT_V2_TABLES.SIGNATURE_RATE_LIMITS)
        .update({
          counter: row.counter + 1,
          blocked_until: input.blockedUntil ?? row.blockedUntil ?? null,
          updated_at: input.windowStartedAt,
          row_version: row.rowVersion + 1,
        })
        .eq('tenant_id', tid)
        .eq('id', row.id)
        .eq('row_version', row.rowVersion)
        .select('*')
        .maybeSingle();
      if (error) mapPersistenceDriverError(error);
      if (!data) throw new ContractPersistenceConflictError();
      return mapRow(data);
    }

    const { data, error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.SIGNATURE_RATE_LIMITS)
      .insert({
        tenant_id: tid,
        scope_key: input.scopeKey,
        operation: input.operation,
        window_started_at: input.windowStartedAt,
        window_ends_at: input.windowEndsAt,
        counter: 1,
        blocked_until: input.blockedUntil ?? null,
        row_version: 1,
      })
      .select('*')
      .single();
    if (error) {
      const msg = String(error.message || '');
      if (msg.includes('unique') || msg.includes('duplicate')) {
        return this.upsertIncrement(input);
      }
      mapPersistenceDriverError(error);
    }
    return mapRow(data);
  }

  async setBlockedUntil(
    tenantId: TenantId,
    recordId: string,
    blockedUntil: string,
    expectedRowVersion: number,
  ): Promise<SignatureRateLimitRecord> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.SIGNATURE_RATE_LIMITS)
      .update({
        blocked_until: blockedUntil,
        updated_at: blockedUntil,
        row_version: expectedRowVersion + 1,
      })
      .eq('tenant_id', tid)
      .eq('id', recordId)
      .eq('row_version', expectedRowVersion)
      .select('*')
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    if (!data) {
      throw Object.assign(new Error('Rate limit não encontrado ou conflito.'), {
        code: 'SIGNATURE_RATE_LIMIT_STORAGE_UNAVAILABLE',
      });
    }
    return mapRow(data);
  }
}
