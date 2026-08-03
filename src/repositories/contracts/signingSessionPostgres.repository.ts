/**
 * @module repositories/contracts/signingSessionPostgres.repository
 * @description Sessões de assinatura Postgres — Phase 10.10. Hash-only; nunca logar token.
 */

import { createContractDomainError } from '../../domain/contracts/contract.errors.js';
import type {
  CreateSigningSessionInput,
  SigningSessionRecord,
  SigningSessionRepository,
} from '../../domain/contracts/signatures/signing-session.repository.js';
import type { SignatureEnvelopeId, TenantId } from '../../domain/contracts/contract.ids.js';
import {
  ContractPersistenceConflictError,
  ContractPersistenceTenantMismatchError,
  ContractPersistenceUnavailableError,
  mapPersistenceDriverError,
} from './contractPersistenceErrors.js';
import { assertValidTenantId } from './contractPersistenceMappers.js';
import { CONTRACT_V2_TABLES } from './contractPersistenceTables.js';
import type { ContractSupabaseClient } from './contractPersistenceTypes.js';
import type { DatabaseTransactionClient } from './contractsV2Transaction.js';

function fail(code: Parameters<typeof createContractDomainError>[0], message: string): never {
  throw Object.assign(new Error(message), {
    domainError: createContractDomainError(code, message),
    code,
  });
}

function mapRow(row: Record<string, unknown>): SigningSessionRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id) as TenantId,
    envelopeId: String(row.envelope_id) as SigningSessionRecord['envelopeId'],
    signerId: String(row.signer_id) as SigningSessionRecord['signerId'],
    tokenId: String(row.token_id),
    tokenHash: String(row.token_hash),
    status: String(row.status) as SigningSessionRecord['status'],
    issuedAt: String(row.issued_at),
    expiresAt: String(row.expires_at),
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : undefined,
    revokedAt: row.revoked_at ? String(row.revoked_at) : undefined,
    consumedAt: row.consumed_at ? String(row.consumed_at) : undefined,
    ipHash: row.ip_hash ? String(row.ip_hash) : undefined,
    userAgentHash: row.user_agent_hash ? String(row.user_agent_hash) : undefined,
    createdAt: String(row.created_at),
    rowVersion: Number(row.row_version),
  };
}

function toInsertRow(input: CreateSigningSessionInput) {
  return {
    id: input.id || undefined,
    tenant_id: input.tenantId,
    envelope_id: input.envelopeId,
    signer_id: input.signerId,
    token_id: input.tokenId,
    token_hash: input.tokenHash,
    status: 'ACTIVE',
    issued_at: input.issuedAt,
    expires_at: input.expiresAt,
    ip_hash: input.ipHash || null,
    user_agent_hash: input.userAgentHash || null,
    row_version: 1,
  };
}

export class PostgresSigningSessionRepository implements SigningSessionRepository {
  constructor(
    private readonly client?: ContractSupabaseClient | DatabaseTransactionClient | null,
  ) {}

  private getClient(): ContractSupabaseClient {
    if (!this.client) throw new ContractPersistenceUnavailableError();
    return this.client;
  }

  async create(input: CreateSigningSessionInput): Promise<SigningSessionRecord> {
    if (!/^[a-f0-9]{64}$/.test(input.tokenHash)) {
      fail('SIGNATURE_SESSION_HASH_INVALID', 'token_hash inválido.');
    }
    const { data, error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.SIGNATURE_SESSIONS)
      .insert(toInsertRow(input))
      .select('*')
      .single();
    if (error) {
      const msg = String(error.message || '');
      if (msg.includes('unique') || msg.includes('duplicate')) {
        fail('SIGNATURE_SESSION_PERSISTENCE_FAILED', 'Sessão duplicada.');
      }
      mapPersistenceDriverError(error);
    }
    return mapRow(data);
  }

  async findByTokenHash(
    tenantId: TenantId | null,
    tokenHash: string,
  ): Promise<SigningSessionRecord | null> {
    let builder = this.getClient()
      .from(CONTRACT_V2_TABLES.SIGNATURE_SESSIONS)
      .select('*')
      .eq('token_hash', tokenHash)
      .limit(1);
    if (tenantId) {
      builder = builder.eq('tenant_id', assertValidTenantId(tenantId));
    }
    const { data, error } = await builder.maybeSingle();
    if (error) mapPersistenceDriverError(error);
    if (!data) return null;
    const row = mapRow(data);
    if (tenantId && row.tenantId !== tenantId) {
      throw new ContractPersistenceTenantMismatchError(String(tenantId), row.tenantId);
    }
    return row;
  }

  async findByTokenId(tenantId: TenantId, tokenId: string): Promise<SigningSessionRecord | null> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.SIGNATURE_SESSIONS)
      .select('*')
      .eq('tenant_id', tid)
      .eq('token_id', tokenId)
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    return data ? mapRow(data) : null;
  }

  async findByTokenIdAny(tokenId: string): Promise<SigningSessionRecord | null> {
    const { data, error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.SIGNATURE_SESSIONS)
      .select('*')
      .eq('token_id', tokenId)
      .limit(1)
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    return data ? mapRow(data) : null;
  }

  private async updateWithVersion(
    tenantId: TenantId,
    sessionId: string,
    patch: Record<string, unknown>,
    expectedRowVersion: number,
  ): Promise<SigningSessionRecord> {
    const tid = assertValidTenantId(tenantId);
    const current = await this.getClient()
      .from(CONTRACT_V2_TABLES.SIGNATURE_SESSIONS)
      .select('*')
      .eq('tenant_id', tid)
      .eq('id', sessionId)
      .maybeSingle();
    if (current.error) mapPersistenceDriverError(current.error);
    if (!current.data) fail('SIGNATURE_SESSION_INVALID', 'Sessão não encontrada.');
    const row = mapRow(current.data);
    if (row.rowVersion !== expectedRowVersion) {
      throw new ContractPersistenceConflictError();
    }
    const { data, error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.SIGNATURE_SESSIONS)
      .update({ ...patch, row_version: row.rowVersion + 1 })
      .eq('tenant_id', tid)
      .eq('id', sessionId)
      .eq('row_version', expectedRowVersion)
      .select('*')
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    if (!data) throw new ContractPersistenceConflictError();
    return mapRow(data);
  }

  async touchLastUsed(
    tenantId: TenantId,
    sessionId: string,
    lastUsedAt: string,
    expectedRowVersion: number,
  ): Promise<SigningSessionRecord> {
    return this.updateWithVersion(
      tenantId,
      sessionId,
      { last_used_at: lastUsedAt },
      expectedRowVersion,
    );
  }

  async revoke(
    tenantId: TenantId,
    sessionId: string,
    revokedAt: string,
    expectedRowVersion: number,
  ): Promise<SigningSessionRecord> {
    return this.updateWithVersion(
      tenantId,
      sessionId,
      { status: 'REVOKED', revoked_at: revokedAt },
      expectedRowVersion,
    );
  }

  async revokeForEnvelope(
    tenantId: TenantId,
    envelopeId: SignatureEnvelopeId,
    revokedAt: string,
  ): Promise<number> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.SIGNATURE_SESSIONS)
      .update({ status: 'REVOKED', revoked_at: revokedAt })
      .eq('tenant_id', tid)
      .eq('envelope_id', envelopeId)
      .eq('status', 'ACTIVE')
      .select('id');
    if (error) mapPersistenceDriverError(error);
    return Array.isArray(data) ? data.length : 0;
  }

  async consume(
    tenantId: TenantId,
    sessionId: string,
    consumedAt: string,
    expectedRowVersion: number,
  ): Promise<SigningSessionRecord> {
    const tid = assertValidTenantId(tenantId);
    const existing = await this.getClient()
      .from(CONTRACT_V2_TABLES.SIGNATURE_SESSIONS)
      .select('*')
      .eq('tenant_id', tid)
      .eq('id', sessionId)
      .maybeSingle();
    if (existing.error) mapPersistenceDriverError(existing.error);
    if (!existing.data) fail('SIGNATURE_SESSION_INVALID', 'Sessão não encontrada.');
    const row = mapRow(existing.data);
    if (row.status === 'CONSUMED') {
      fail('SIGNATURE_SESSION_ALREADY_CONSUMED', 'Sessão já consumida.');
    }
    return this.updateWithVersion(
      tenantId,
      sessionId,
      { status: 'CONSUMED', consumed_at: consumedAt },
      expectedRowVersion,
    );
  }

  async markExpired(
    tenantId: TenantId,
    sessionId: string,
    at: string,
    expectedRowVersion: number,
  ): Promise<SigningSessionRecord> {
    return this.updateWithVersion(
      tenantId,
      sessionId,
      { status: 'EXPIRED', last_used_at: at },
      expectedRowVersion,
    );
  }
}
