/**
 * @module repositories/contracts/signatureChallengePostgres.repository
 * @description Challenges OTP Postgres — Phase 10.10. code_hash only.
 */

import { createContractDomainError } from '../../domain/contracts/contract.errors.js';
import type {
  CreateSignatureChallengeInput,
  SignatureAuthenticationChallengeRepository,
  SignatureChallengeRecord,
} from '../../domain/contracts/signatures/signature-challenge.repository.js';
import type { SignatureEnvelopeId, SignatureSignerId, TenantId } from '../../domain/contracts/contract.ids.js';
import {
  ContractPersistenceConflictError,
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

function mapRow(row: Record<string, unknown>): SignatureChallengeRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id) as TenantId,
    envelopeId: String(row.envelope_id) as SignatureChallengeRecord['envelopeId'],
    signerId: String(row.signer_id) as SignatureSignerId,
    sessionId: String(row.session_id),
    challengeType: String(row.challenge_type),
    destinationHash: row.destination_hash ? String(row.destination_hash) : undefined,
    codeHash: String(row.code_hash),
    status: String(row.status) as SignatureChallengeRecord['status'],
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    issuedAt: String(row.issued_at),
    expiresAt: String(row.expires_at),
    verifiedAt: row.verified_at ? String(row.verified_at) : undefined,
    consumedAt: row.consumed_at ? String(row.consumed_at) : undefined,
    invalidatedAt: row.invalidated_at ? String(row.invalidated_at) : undefined,
    createdAt: String(row.created_at),
    rowVersion: Number(row.row_version),
  };
}

function toInsertRow(input: CreateSignatureChallengeInput) {
  return {
    id: input.id || undefined,
    tenant_id: input.tenantId,
    envelope_id: input.envelopeId,
    signer_id: input.signerId,
    session_id: input.sessionId,
    challenge_type: input.challengeType,
    destination_hash: input.destinationHash || null,
    code_hash: input.codeHash,
    status: 'PENDING',
    attempt_count: 0,
    max_attempts: input.maxAttempts,
    issued_at: input.issuedAt,
    expires_at: input.expiresAt,
    row_version: 1,
  };
}

export class PostgresSignatureAuthenticationChallengeRepository
implements SignatureAuthenticationChallengeRepository {
  constructor(
    private readonly client?: ContractSupabaseClient | DatabaseTransactionClient | null,
  ) {}

  private getClient(): ContractSupabaseClient {
    if (!this.client) throw new ContractPersistenceUnavailableError();
    return this.client;
  }

  async create(input: CreateSignatureChallengeInput): Promise<SignatureChallengeRecord> {
    if (!/^[a-f0-9]{64}$/.test(input.codeHash)) {
      fail('SIGNATURE_CHALLENGE_PERSISTENCE_FAILED', 'code_hash inválido.');
    }
    const { data, error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.SIGNATURE_CHALLENGES)
      .insert(toInsertRow(input))
      .select('*')
      .single();
    if (error) mapPersistenceDriverError(error);
    return mapRow(data);
  }

  async findById(tenantId: TenantId, challengeId: string): Promise<SignatureChallengeRecord | null> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.SIGNATURE_CHALLENGES)
      .select('*')
      .eq('tenant_id', tid)
      .eq('id', challengeId)
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    return data ? mapRow(data) : null;
  }

  async invalidateActiveForSigner(
    tenantId: TenantId,
    envelopeId: SignatureEnvelopeId,
    signerId: SignatureSignerId,
    invalidatedAt: string,
  ): Promise<number> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.SIGNATURE_CHALLENGES)
      .update({ status: 'INVALIDATED', invalidated_at: invalidatedAt })
      .eq('tenant_id', tid)
      .eq('envelope_id', envelopeId)
      .eq('signer_id', signerId)
      .eq('status', 'PENDING')
      .select('id');
    if (error) mapPersistenceDriverError(error);
    return Array.isArray(data) ? data.length : 0;
  }

  private async updateWithVersion(
    tenantId: TenantId,
    challengeId: string,
    patch: Record<string, unknown>,
    expectedRowVersion: number,
  ): Promise<SignatureChallengeRecord> {
    const tid = assertValidTenantId(tenantId);
    const existing = await this.getClient()
      .from(CONTRACT_V2_TABLES.SIGNATURE_CHALLENGES)
      .select('*')
      .eq('tenant_id', tid)
      .eq('id', challengeId)
      .maybeSingle();
    if (existing.error) mapPersistenceDriverError(existing.error);
    if (!existing.data) fail('SIGNATURE_CHALLENGE_PERSISTENCE_FAILED', 'Challenge não encontrado.');
    const row = mapRow(existing.data);
    if (row.rowVersion !== expectedRowVersion) {
      throw new ContractPersistenceConflictError();
    }
    const { data, error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.SIGNATURE_CHALLENGES)
      .update({ ...patch, row_version: row.rowVersion + 1 })
      .eq('tenant_id', tid)
      .eq('id', challengeId)
      .eq('row_version', expectedRowVersion)
      .select('*')
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    if (!data) throw new ContractPersistenceConflictError();
    return mapRow(data);
  }

  async recordFailedAttempt(
    tenantId: TenantId,
    challengeId: string,
    expectedRowVersion: number,
  ): Promise<SignatureChallengeRecord> {
    const tid = assertValidTenantId(tenantId);
    const existing = await this.getClient()
      .from(CONTRACT_V2_TABLES.SIGNATURE_CHALLENGES)
      .select('*')
      .eq('tenant_id', tid)
      .eq('id', challengeId)
      .maybeSingle();
    if (existing.error) mapPersistenceDriverError(existing.error);
    if (!existing.data) fail('SIGNATURE_CHALLENGE_PERSISTENCE_FAILED', 'Challenge não encontrado.');
    const row = mapRow(existing.data);
    const attemptCount = row.attemptCount + 1;
    const locked = attemptCount >= row.maxAttempts;
    return this.updateWithVersion(
      tenantId,
      challengeId,
      {
        attempt_count: attemptCount,
        status: locked ? 'LOCKED' : row.status,
      },
      expectedRowVersion,
    );
  }

  async markVerified(
    tenantId: TenantId,
    challengeId: string,
    verifiedAt: string,
    expectedRowVersion: number,
  ): Promise<SignatureChallengeRecord> {
    const existing = await this.findById(tenantId, challengeId);
    if (!existing) fail('SIGNATURE_CHALLENGE_PERSISTENCE_FAILED', 'Challenge não encontrado.');
    return this.updateWithVersion(
      tenantId,
      challengeId,
      {
        status: 'VERIFIED',
        verified_at: verifiedAt,
        consumed_at: verifiedAt,
        attempt_count: existing.attemptCount + 1,
      },
      expectedRowVersion,
    );
  }

  async markConsumed(
    tenantId: TenantId,
    challengeId: string,
    consumedAt: string,
    expectedRowVersion: number,
  ): Promise<SignatureChallengeRecord> {
    return this.updateWithVersion(
      tenantId,
      challengeId,
      { status: 'CONSUMED', consumed_at: consumedAt },
      expectedRowVersion,
    );
  }

  async markExpired(
    tenantId: TenantId,
    challengeId: string,
    at: string,
    expectedRowVersion: number,
  ): Promise<SignatureChallengeRecord> {
    return this.updateWithVersion(
      tenantId,
      challengeId,
      { status: 'EXPIRED', invalidated_at: at },
      expectedRowVersion,
    );
  }
}
