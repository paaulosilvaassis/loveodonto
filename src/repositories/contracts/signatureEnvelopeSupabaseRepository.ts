/**
 * @module repositories/contracts/signatureEnvelopeSupabaseRepository
 */

import type { SignatureEnvelopeRepository } from '../../domain/contracts/signatures/signature.repository.js';
import type {
  SignatureEnvelope,
  SignatureSigner,
} from '../../domain/contracts/signatures/signature.types.js';
import {
  ContractPersistenceNotFoundError,
  ContractPersistenceTenantMismatchError,
  ContractPersistenceUnavailableError,
  mapPersistenceDriverError,
} from './contractPersistenceErrors.js';
import {
  assertValidTenantId,
  mapDomainEnvelopeToRow,
  mapEnvelopeRowToDomain,
} from './contractPersistenceMappers.js';
import { CONTRACT_V2_TABLES } from './contractPersistenceTables.js';
import type {
  AppSignatureEnvelopeRow,
  ContractSupabaseClient,
} from './contractPersistenceTypes.js';

function mapSignerRow(row: Record<string, unknown>): SignatureSigner {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    envelopeId: String(row.envelope_id),
    partyId: row.party_id ? String(row.party_id) : undefined,
    signerOrder: Number(row.signer_order),
    signerRole: String(row.signer_role),
    name: String(row.name),
    email: row.email ? String(row.email) : undefined,
    phone: row.phone ? String(row.phone) : undefined,
    documentNumberHash: row.document_number_hash
      ? String(row.document_number_hash)
      : undefined,
    authenticationMethod: row.authentication_method
      ? String(row.authentication_method) as SignatureSigner['authenticationMethod']
      : undefined,
    status: String(row.status) as SignatureSigner['status'],
    required: true,
    invitedAt: row.invited_at ? String(row.invited_at) : undefined,
    viewedAt: row.viewed_at ? String(row.viewed_at) : undefined,
    authenticatedAt: row.authenticated_at ? String(row.authenticated_at) : undefined,
    signedAt: row.signed_at ? String(row.signed_at) : undefined,
    declinedAt: row.declined_at ? String(row.declined_at) : undefined,
    declineReason: row.decline_reason ? String(row.decline_reason) : undefined,
    ipAddress: row.ip_address ? String(row.ip_address) : undefined,
    userAgent: row.user_agent ? String(row.user_agent) : undefined,
    signatureImageFileId: row.signature_image_file_id
      ? String(row.signature_image_file_id)
      : undefined,
    providerSignerId: row.provider_signer_id ? String(row.provider_signer_id) : undefined,
    evidenceSnapshot: row.evidence_snapshot as SignatureSigner['evidenceSnapshot'],
  };
}

export class SignatureEnvelopeSupabaseRepository implements SignatureEnvelopeRepository {
  constructor(private readonly deps: { client?: ContractSupabaseClient | null } = {}) {}

  private client(): ContractSupabaseClient {
    if (!this.deps.client) throw new ContractPersistenceUnavailableError();
    return this.deps.client;
  }

  async findById(tenantId: string, envelopeId: string): Promise<SignatureEnvelope | null> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.ENVELOPES)
      .select('*')
      .eq('tenant_id', tid)
      .eq('id', envelopeId)
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    return data ? mapEnvelopeRowToDomain(data as AppSignatureEnvelopeRow) : null;
  }

  async findByContract(tenantId: string, contractId: string): Promise<SignatureEnvelope[]> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.ENVELOPES)
      .select('*')
      .eq('tenant_id', tid)
      .eq('contract_id', contractId);
    if (error) mapPersistenceDriverError(error);
    return (data || []).map((row: AppSignatureEnvelopeRow) => mapEnvelopeRowToDomain(row));
  }

  async create(tenantId: string, envelope: SignatureEnvelope): Promise<SignatureEnvelope> {
    const tid = assertValidTenantId(tenantId);
    if (envelope.tenantId && envelope.tenantId !== tid) {
      throw new ContractPersistenceTenantMismatchError(tid, envelope.tenantId);
    }
    const row = mapDomainEnvelopeToRow({ ...envelope, tenantId: tid });
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.ENVELOPES)
      .insert(row)
      .select('*')
      .single();
    if (error) mapPersistenceDriverError(error);
    return mapEnvelopeRowToDomain(data as AppSignatureEnvelopeRow);
  }

  async update(
    tenantId: string,
    envelopeId: string,
    envelope: SignatureEnvelope,
  ): Promise<SignatureEnvelope> {
    const tid = assertValidTenantId(tenantId);
    const row = mapDomainEnvelopeToRow({ ...envelope, tenantId: tid, id: envelopeId });
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.ENVELOPES)
      .update(row)
      .eq('tenant_id', tid)
      .eq('id', envelopeId)
      .select('*')
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    if (!data) throw new ContractPersistenceNotFoundError('envelope', envelopeId);
    return mapEnvelopeRowToDomain(data as AppSignatureEnvelopeRow);
  }

  async listSigners(tenantId: string, envelopeId: string): Promise<SignatureSigner[]> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.SIGNERS)
      .select('*')
      .eq('tenant_id', tid)
      .eq('envelope_id', envelopeId)
      .order('signer_order', { ascending: true });
    if (error) mapPersistenceDriverError(error);
    return (data || []).map((row: Record<string, unknown>) => mapSignerRow(row));
  }

  async upsertSigner(tenantId: string, signer: SignatureSigner): Promise<SignatureSigner> {
    const tid = assertValidTenantId(tenantId);
    const row = {
      id: signer.id,
      tenant_id: tid,
      envelope_id: signer.envelopeId,
      party_id: signer.partyId ?? null,
      signer_order: signer.signerOrder,
      signer_role: signer.signerRole,
      name: signer.name,
      email: signer.email ?? null,
      phone: signer.phone ?? null,
      document_number_hash: signer.documentNumberHash ?? null,
      authentication_method: signer.authenticationMethod ?? null,
      status: signer.status,
      invited_at: signer.invitedAt ?? null,
      viewed_at: signer.viewedAt ?? null,
      authenticated_at: signer.authenticatedAt ?? null,
      signed_at: signer.signedAt ?? null,
      declined_at: signer.declinedAt ?? null,
      decline_reason: signer.declineReason ?? null,
      ip_address: signer.ipAddress ?? null,
      user_agent: signer.userAgent ?? null,
      signature_image_file_id: signer.signatureImageFileId ?? null,
      provider_signer_id: signer.providerSignerId ?? null,
      evidence_snapshot: signer.evidenceSnapshot ?? null,
    };
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.SIGNERS)
      .upsert(row)
      .select('*')
      .single();
    if (error) mapPersistenceDriverError(error);
    return mapSignerRow(data as Record<string, unknown>);
  }

  async findSignerById(tenantId: string, signerId: string): Promise<SignatureSigner | null> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.client()
      .from(CONTRACT_V2_TABLES.SIGNERS)
      .select('*')
      .eq('tenant_id', tid)
      .eq('id', signerId)
      .maybeSingle();
    if (error) mapPersistenceDriverError(error);
    return data ? mapSignerRow(data as Record<string, unknown>) : null;
  }
}
