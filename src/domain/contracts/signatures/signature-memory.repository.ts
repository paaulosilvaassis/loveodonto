/**
 * @module domain/contracts/signatures/signature-memory.repository
 * @description Repositories in-memory de assinatura — Phase 10.6.
 */

import type {
  SignatureEnvelopeId,
  SignaturePolicyId,
  SignatureSignerId,
  TenantId,
} from '../contract.ids.js';
import type {
  SignatureEnvelope,
  SignatureEvidenceSnapshot,
  SignaturePolicy,
  SignatureSigner,
} from './signature.types.js';
import { isTerminalEnvelopeStatus } from './signature.types.js';

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export interface SignaturePolicyRepository {
  findById(tenantId: TenantId, policyId: SignaturePolicyId): Promise<SignaturePolicy | null>;
  list(tenantId: TenantId): Promise<SignaturePolicy[]>;
  create(tenantId: TenantId, policy: SignaturePolicy): Promise<SignaturePolicy>;
  update(tenantId: TenantId, policy: SignaturePolicy): Promise<SignaturePolicy>;
}

export interface SignatureEnvelopeRepository {
  findById(tenantId: TenantId, envelopeId: SignatureEnvelopeId): Promise<SignatureEnvelope | null>;
  list(tenantId: TenantId, query?: { contractId?: string; status?: string }): Promise<SignatureEnvelope[]>;
  create(tenantId: TenantId, envelope: SignatureEnvelope): Promise<SignatureEnvelope>;
  update(tenantId: TenantId, envelope: SignatureEnvelope, expectedRowVersion?: number): Promise<SignatureEnvelope>;
  findActiveByContract(tenantId: TenantId, contractId: string): Promise<SignatureEnvelope | null>;
}

export interface SignatureSignerRepository {
  findById(tenantId: TenantId, signerId: SignatureSignerId): Promise<SignatureSigner | null>;
  listByEnvelope(tenantId: TenantId, envelopeId: SignatureEnvelopeId): Promise<SignatureSigner[]>;
  create(tenantId: TenantId, signer: SignatureSigner): Promise<SignatureSigner>;
  update(tenantId: TenantId, signer: SignatureSigner): Promise<SignatureSigner>;
}

export interface SignatureEvidenceRepository {
  save(tenantId: TenantId, evidence: SignatureEvidenceSnapshot & { id: string }): Promise<void>;
  findBySigner(tenantId: TenantId, signerId: SignatureSignerId): Promise<SignatureEvidenceSnapshot | null>;
  listByEnvelope(tenantId: TenantId, envelopeId: SignatureEnvelopeId): Promise<SignatureEvidenceSnapshot[]>;
}

export class SignaturePolicyMemoryRepository implements SignaturePolicyRepository {
  private store = new Map<string, SignaturePolicy>();

  private key(tenantId: string, id: string) {
    return `${tenantId}::${id}`;
  }

  async findById(tenantId: TenantId, policyId: SignaturePolicyId) {
    const found = this.store.get(this.key(tenantId, policyId));
    return found ? clone(found) : null;
  }

  async list(tenantId: TenantId) {
    return [...this.store.values()].filter((p) => p.tenantId === tenantId).map(clone);
  }

  async create(tenantId: TenantId, policy: SignaturePolicy) {
    if (policy.tenantId !== tenantId) throw Object.assign(new Error('TENANT_MISMATCH'), { code: 'TENANT_MISMATCH' });
    this.store.set(this.key(tenantId, policy.id), clone(policy));
    return clone(policy);
  }

  async update(tenantId: TenantId, policy: SignaturePolicy) {
    const existing = this.store.get(this.key(tenantId, policy.id));
    if (!existing) throw Object.assign(new Error('NOT_FOUND'), { code: 'CONTRACT_NOT_FOUND' });
    const next = { ...clone(policy), rowVersion: (existing.rowVersion || 1) + 1 };
    this.store.set(this.key(tenantId, policy.id), next);
    return clone(next);
  }
}

export class SignatureEnvelopeMemoryRepository implements SignatureEnvelopeRepository {
  private store = new Map<string, SignatureEnvelope>();

  private key(tenantId: string, id: string) {
    return `${tenantId}::${id}`;
  }

  async findById(tenantId: TenantId, envelopeId: SignatureEnvelopeId) {
    const found = this.store.get(this.key(tenantId, envelopeId));
    return found && found.tenantId === tenantId ? clone(found) : null;
  }

  async list(tenantId: TenantId, query: { contractId?: string; status?: string } = {}) {
    let items = [...this.store.values()].filter((e) => e.tenantId === tenantId);
    if (query.contractId) items = items.filter((e) => e.contractId === query.contractId);
    if (query.status) items = items.filter((e) => e.status === query.status);
    return items.map(clone);
  }

  async create(tenantId: TenantId, envelope: SignatureEnvelope) {
    if (envelope.tenantId !== tenantId) {
      throw Object.assign(new Error('TENANT_MISMATCH'), { code: 'TENANT_MISMATCH' });
    }
    this.store.set(this.key(tenantId, envelope.id), clone({ ...envelope, rowVersion: 1 }));
    return clone(envelope);
  }

  async update(tenantId: TenantId, envelope: SignatureEnvelope, expectedRowVersion?: number) {
    const key = this.key(tenantId, envelope.id);
    const existing = this.store.get(key);
    if (!existing || existing.tenantId !== tenantId) {
      throw Object.assign(new Error('NOT_FOUND'), { code: 'SIGNATURE_ENVELOPE_NOT_FOUND' });
    }
    if (
      expectedRowVersion != null
      && existing.rowVersion != null
      && expectedRowVersion !== existing.rowVersion
    ) {
      throw Object.assign(new Error('CONFLICT'), { code: 'OPTIMISTIC_CONCURRENCY_CONFLICT' });
    }
    const next = { ...clone(envelope), rowVersion: (existing.rowVersion || 1) + 1 };
    this.store.set(key, next);
    return clone(next);
  }

  async findActiveByContract(tenantId: TenantId, contractId: string) {
    const items = await this.list(tenantId, { contractId });
    return items.find((e) => !isTerminalEnvelopeStatus(e.status)) || null;
  }
}

export class SignatureSignerMemoryRepository implements SignatureSignerRepository {
  private store = new Map<string, SignatureSigner>();

  private key(tenantId: string, id: string) {
    return `${tenantId}::${id}`;
  }

  async findById(tenantId: TenantId, signerId: SignatureSignerId) {
    const found = this.store.get(this.key(tenantId, signerId));
    return found && found.tenantId === tenantId ? clone(found) : null;
  }

  async listByEnvelope(tenantId: TenantId, envelopeId: SignatureEnvelopeId) {
    return [...this.store.values()]
      .filter((s) => s.tenantId === tenantId && s.envelopeId === envelopeId)
      .sort((a, b) => a.signerOrder - b.signerOrder)
      .map(clone);
  }

  async create(tenantId: TenantId, signer: SignatureSigner) {
    if (signer.tenantId !== tenantId) {
      throw Object.assign(new Error('TENANT_MISMATCH'), { code: 'TENANT_MISMATCH' });
    }
    this.store.set(this.key(tenantId, signer.id), clone(signer));
    return clone(signer);
  }

  async update(tenantId: TenantId, signer: SignatureSigner) {
    const key = this.key(tenantId, signer.id);
    const existing = this.store.get(key);
    if (!existing || existing.tenantId !== tenantId) {
      throw Object.assign(new Error('NOT_FOUND'), { code: 'SIGNATURE_SIGNER_NOT_FOUND' });
    }
    const next = clone(signer);
    this.store.set(key, next);
    return clone(next);
  }
}

export class SignatureEvidenceMemoryRepository implements SignatureEvidenceRepository {
  private bySigner = new Map<string, SignatureEvidenceSnapshot & { id: string }>();

  async save(tenantId: TenantId, evidence: SignatureEvidenceSnapshot & { id: string }) {
    const key = `${tenantId}::${evidence.signerId}`;
    this.bySigner.set(key, clone(evidence));
  }

  async findBySigner(tenantId: TenantId, signerId: SignatureSignerId) {
    const found = this.bySigner.get(`${tenantId}::${signerId}`);
    return found ? clone(found) : null;
  }

  async listByEnvelope(tenantId: TenantId, envelopeId: SignatureEnvelopeId) {
    return [...this.bySigner.values()]
      .filter((e) => e.envelopeId === envelopeId)
      .map(clone);
  }
}
