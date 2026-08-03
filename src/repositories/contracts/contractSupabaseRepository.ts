/**
 * @module repositories/contracts/contractSupabaseRepository
 * @description Implementação Postgres/Supabase Contracts V2 — SEM wiring em services/UI.
 *
 * Regras:
 * - toda operação exige tenantId UUID
 * - findById sempre filtra tenant_id + id
 * - sem dual-write / IndexedDB
 * - sem publish de eventos
 * - logs sem snapshots/PII
 */

import type { ContractRepository } from '../../domain/contracts/contract.repository.js';
import type {
  Contract,
  ContractDraftPatch,
  ContractListQuery,
  ContractListResult,
  ContractStatusTransitionInput,
  ContractVersion,
} from '../../domain/contracts/contract.types.js';
import {
  ContractPersistenceConflictError,
  ContractPersistenceNotFoundError,
  ContractPersistenceTenantMismatchError,
  ContractPersistenceUnavailableError,
  ContractPersistenceVersionLockedError,
  mapPersistenceDriverError,
} from './contractPersistenceErrors.js';
import {
  assertValidTenantId,
  mapContractRowToDomain,
  mapContractVersionRowToDomain,
  mapDomainContractToRow,
  mapDomainContractVersionToRow,
} from './contractPersistenceMappers.js';
import { CONTRACT_V2_TABLES } from './contractPersistenceTables.js';
import type {
  AppContractRow,
  AppContractVersionRow,
  ContractSupabaseClient,
} from './contractPersistenceTypes.js';

export interface ContractSupabaseRepositoryDeps {
  client?: ContractSupabaseClient | null;
}

function throwIfError(error: { message?: string; code?: string } | null): void {
  if (error) mapPersistenceDriverError(error);
}

export class ContractSupabaseRepository implements ContractRepository {
  private readonly injected: ContractSupabaseClient | null | undefined;

  constructor(deps: ContractSupabaseRepositoryDeps = {}) {
    this.injected = deps.client;
  }

  private getClient(): ContractSupabaseClient {
    if (!this.injected) throw new ContractPersistenceUnavailableError();
    return this.injected;
  }

  async findById(tenantId: string, contractId: string): Promise<Contract | null> {
    const tid = assertValidTenantId(tenantId);
    const client = this.getClient();
    const { data, error } = await client
      .from(CONTRACT_V2_TABLES.CONTRACTS)
      .select('*')
      .eq('tenant_id', tid)
      .eq('id', contractId)
      .maybeSingle();
    throwIfError(error);
    if (!data) return null;
    if (data.tenant_id !== tid) {
      throw new ContractPersistenceTenantMismatchError(tid, data.tenant_id);
    }
    return mapContractRowToDomain(data as AppContractRow);
  }

  async list(tenantId: string, query: ContractListQuery = {}): Promise<ContractListResult> {
    const tid = assertValidTenantId(tenantId);
    const client = this.getClient();
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const offset = Math.max(Number(query.offset) || 0, 0);

    let builder = client
      .from(CONTRACT_V2_TABLES.CONTRACTS)
      .select('*', { count: 'exact' })
      .eq('tenant_id', tid)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (query.patientId) builder = builder.eq('patient_id', query.patientId);
    if (query.budgetId) builder = builder.eq('budget_id', query.budgetId);
    if (query.origin) builder = builder.eq('origin', query.origin);
    if (query.documentType) builder = builder.eq('document_type', query.documentType);
    if (query.status) {
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      builder = builder.in('status', statuses);
    }
    if (query.createdFrom) builder = builder.gte('created_at', query.createdFrom);
    if (query.createdTo) builder = builder.lte('created_at', query.createdTo);

    const { data, error, count } = await builder;
    throwIfError(error);
    const items = (data || []).map((row: AppContractRow) => mapContractRowToDomain(row));
    return { items, total: Number(count ?? items.length), limit, offset };
  }

  async create(tenantId: string, contract: Contract): Promise<Contract> {
    const tid = assertValidTenantId(tenantId);
    if (contract.tenantId && contract.tenantId !== tid) {
      throw new ContractPersistenceTenantMismatchError(tid, contract.tenantId);
    }
    const row = mapDomainContractToRow({ ...contract, tenantId: tid });
    const client = this.getClient();
    const { data, error } = await client
      .from(CONTRACT_V2_TABLES.CONTRACTS)
      .insert(row)
      .select('*')
      .single();
    throwIfError(error);
    return mapContractRowToDomain(data as AppContractRow);
  }

  async updateDraft(
    tenantId: string,
    contractId: string,
    patch: ContractDraftPatch,
    expectedVersion?: number,
  ): Promise<Contract> {
    const tid = assertValidTenantId(tenantId);
    const current = await this.findById(tid, contractId);
    if (!current) throw new ContractPersistenceNotFoundError('contract', contractId);
    if (current.status !== 'DRAFT' && current.status !== 'READY_FOR_REVIEW') {
      throw new ContractPersistenceErrorDraftLocked(current.status);
    }
    if (expectedVersion != null && current.rowVersion != null
      && expectedVersion !== current.rowVersion) {
      throw new ContractPersistenceConflictError();
    }

    const updatePayload: Record<string, unknown> = {
      row_version: (current.rowVersion || 1) + 1,
      updated_at: new Date().toISOString(),
    };
    if (patch.title !== undefined) updatePayload.title = patch.title;
    if (patch.documentType !== undefined) updatePayload.document_type = patch.documentType;
    if (patch.guardianPatientId !== undefined) {
      updatePayload.guardian_patient_id = patch.guardianPatientId;
    }
    if (patch.budgetId !== undefined) updatePayload.budget_id = patch.budgetId;
    if (patch.treatmentPlanId !== undefined) {
      updatePayload.treatment_plan_id = patch.treatmentPlanId;
    }
    if (patch.appointmentId !== undefined) updatePayload.appointment_id = patch.appointmentId;
    if (patch.effectiveDate !== undefined) updatePayload.effective_date = patch.effectiveDate;
    if (patch.expirationDate !== undefined) updatePayload.expiration_date = patch.expirationDate;
    if (patch.metadata !== undefined) updatePayload.metadata = patch.metadata;

    let builder = this.getClient()
      .from(CONTRACT_V2_TABLES.CONTRACTS)
      .update(updatePayload)
      .eq('tenant_id', tid)
      .eq('id', contractId);

    if (expectedVersion != null) {
      builder = builder.eq('row_version', expectedVersion);
    }

    const { data, error } = await builder.select('*').maybeSingle();
    throwIfError(error);
    if (!data) throw new ContractPersistenceConflictError();
    return mapContractRowToDomain(data as AppContractRow);
  }

  async saveVersion(tenantId: string, version: ContractVersion): Promise<ContractVersion> {
    const tid = assertValidTenantId(tenantId);
    if (version.tenantId && version.tenantId !== tid) {
      throw new ContractPersistenceTenantMismatchError(tid, version.tenantId);
    }
    if (version.lockedAt) {
      // insert de versão já locked é permitido; update posterior é bloqueado no DB
    }
    const existing = await this.findVersionById(tid, version.id);
    if (existing?.lockedAt) {
      throw new ContractPersistenceVersionLockedError(version.id);
    }

    const row = mapDomainContractVersionToRow({ ...version, tenantId: tid });
    const client = this.getClient();
    const { data, error } = existing
      ? await client
        .from(CONTRACT_V2_TABLES.VERSIONS)
        .update(row)
        .eq('tenant_id', tid)
        .eq('id', version.id)
        .is('locked_at', null)
        .select('*')
        .maybeSingle()
      : await client
        .from(CONTRACT_V2_TABLES.VERSIONS)
        .insert(row)
        .select('*')
        .single();

    throwIfError(error);
    if (!data) {
      throw new ContractPersistenceVersionLockedError(version.id);
    }
    return mapContractVersionRowToDomain(data as AppContractVersionRow);
  }

  async findVersionById(tenantId: string, versionId: string): Promise<ContractVersion | null> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.VERSIONS)
      .select('*')
      .eq('tenant_id', tid)
      .eq('id', versionId)
      .maybeSingle();
    throwIfError(error);
    if (!data) return null;
    return mapContractVersionRowToDomain(data as AppContractVersionRow);
  }

  async listVersions(tenantId: string, contractId: string): Promise<ContractVersion[]> {
    const tid = assertValidTenantId(tenantId);
    const { data, error } = await this.getClient()
      .from(CONTRACT_V2_TABLES.VERSIONS)
      .select('*')
      .eq('tenant_id', tid)
      .eq('contract_id', contractId)
      .order('version_number', { ascending: true });
    throwIfError(error);
    return (data || []).map((row: AppContractVersionRow) => mapContractVersionRowToDomain(row));
  }

  async transitionStatus(
    tenantId: string,
    input: ContractStatusTransitionInput,
  ): Promise<Contract> {
    const tid = assertValidTenantId(tenantId);
    const current = await this.findById(tid, input.contractId);
    if (!current) throw new ContractPersistenceNotFoundError('contract', input.contractId);
    if (current.status !== input.fromStatus) {
      throw new ContractPersistenceConflictError(
        `Status atual (${current.status}) diverge do esperado (${input.fromStatus}).`,
      );
    }
    if (input.expectedRowVersion != null && current.rowVersion != null
      && input.expectedRowVersion !== current.rowVersion) {
      throw new ContractPersistenceConflictError();
    }

    const payload: Record<string, unknown> = {
      status: input.toStatus,
      row_version: (current.rowVersion || 1) + 1,
      updated_at: new Date().toISOString(),
    };
    if (input.toStatus === 'CANCELLED' || input.toStatus === 'VOIDED') {
      payload.cancellation_reason = input.cancellationReason || null;
      payload.cancelled_at = new Date().toISOString();
      payload.cancelled_by = input.actorId || null;
    }
    if (input.toStatus === 'SIGNED') {
      payload.completed_at = new Date().toISOString();
    }
    if (input.toStatus === 'SUPERSEDED') {
      payload.superseded_by_contract_id = input.supersededByContractId || null;
    }

    let builder = this.getClient()
      .from(CONTRACT_V2_TABLES.CONTRACTS)
      .update(payload)
      .eq('tenant_id', tid)
      .eq('id', input.contractId)
      .eq('status', input.fromStatus);

    if (input.expectedRowVersion != null) {
      builder = builder.eq('row_version', input.expectedRowVersion);
    }

    const { data, error } = await builder.select('*').maybeSingle();
    throwIfError(error);
    if (!data) throw new ContractPersistenceConflictError();
    return mapContractRowToDomain(data as AppContractRow);
  }
}

class ContractPersistenceErrorDraftLocked extends Error {
  readonly code = 'CONTENT_LOCKED';

  constructor(status: string) {
    super(`Contrato em status ${status} não permite updateDraft.`);
    this.name = 'ContractPersistenceErrorDraftLocked';
  }
}

/** Factory tipada — não conecta ao client global automaticamente. */
export function createContractSupabaseRepository(
  deps: ContractSupabaseRepositoryDeps = {},
): ContractRepository {
  return new ContractSupabaseRepository(deps);
}
