/**
 * @module domain/contracts/contract.service
 * @description Contratos de serviços futuros — sem implementação operacional (Phase 10.2).
 */

import type {
  ContractId,
  ContractVersionId,
  TenantId,
} from './contract.ids.js';
import type { ContractDomainEvent } from './contract.events.js';
import type {
  Contract,
  ContractVersion,
  ContractDraftPatch,
} from './contract.types.js';
import type { ContractTransitionContext, ContractTransitionResult } from './contract-status.machine.js';
import type { ValidationResult } from './contract.validators.js';
import type { ContractFile } from './files/contract-file.types.js';
import type { ContractPackage } from './packages/contract-package.types.js';
import type { SignatureProvider } from './signatures/signature-provider.interface.js';
import type { SignatureEnvelope } from './signatures/signature.types.js';
import type { ContractAuditEvent } from './audit/contract-audit.types.js';

export interface ContractDomainService {
  getContract(tenantId: TenantId, contractId: ContractId): Promise<Contract | null>;
  createDraft(tenantId: TenantId, input: Omit<Contract, 'status'> & { status?: 'DRAFT' }): Promise<Contract>;
  updateDraft(
    tenantId: TenantId,
    contractId: ContractId,
    patch: ContractDraftPatch,
  ): Promise<Contract>;
  transition(
    tenantId: TenantId,
    contractId: ContractId,
    toStatus: Contract['status'],
    context: ContractTransitionContext,
  ): Promise<{ contract: Contract; transition: ContractTransitionResult }>;
  validate(tenantId: TenantId, contractId: ContractId): Promise<ValidationResult>;
}

export interface ContractGenerationService {
  generateFromBudget(
    tenantId: TenantId,
    input: {
      patientId: string;
      budgetId: string;
      templateId: string;
      origin: Contract['origin'];
      createdBy: string;
    },
  ): Promise<{ contract: Contract; version: ContractVersion }>;
}

export interface ContractVersionService {
  createVersion(
    tenantId: TenantId,
    contractId: ContractId,
    version: Omit<ContractVersion, 'id' | 'tenantId' | 'contractId'>,
  ): Promise<ContractVersion>;
  lockVersion(
    tenantId: TenantId,
    versionId: ContractVersionId,
    lockedAt: string,
  ): Promise<ContractVersion>;
}

export interface ContractPackageService {
  createPackage(
    tenantId: TenantId,
    pkg: ContractPackage,
  ): Promise<ContractPackage>;
  getPackageStatus(
    tenantId: TenantId,
    packageId: string,
  ): Promise<ContractPackage | null>;
}

export interface ContractPdfRenderInput {
  tenantId: TenantId;
  contractId: ContractId;
  versionId: ContractVersionId;
  renderedHtmlSnapshot: string;
}

export interface ContractPdfRenderResult {
  sha256?: string;
  storageHint?: string;
  pageCount?: number;
}

export interface ContractPdfRenderer {
  render(input: ContractPdfRenderInput): Promise<ContractPdfRenderResult>;
}

export interface ContractFileStorage {
  store(
    tenantId: TenantId,
    input: {
      contractId: ContractId;
      versionId?: ContractVersionId;
      fileName: string;
      mimeType: string;
      content: Uint8Array;
      fileType: ContractFile['fileType'];
      uploadedBy: string;
    },
  ): Promise<ContractFile>;

  createSignedDownloadUrl(
    tenantId: TenantId,
    fileId: string,
    expiresInSeconds: number,
  ): Promise<{ url: string; expiresAt: string }>;
}

export interface ContractAuditService {
  append(
    tenantId: TenantId,
    event: Omit<ContractAuditEvent, 'id'> & { id?: string },
  ): Promise<ContractAuditEvent>;
  listTimeline(
    tenantId: TenantId,
    contractId: ContractId,
  ): Promise<ContractAuditEvent[]>;
}

/** Reexport tipado do provider — sem implementação. */
export type { SignatureProvider };

export interface ContractSignatureOrchestrator {
  createEnvelope(
    tenantId: TenantId,
    contractId: ContractId,
    versionId: ContractVersionId,
  ): Promise<SignatureEnvelope>;
  sendEnvelope(
    tenantId: TenantId,
    envelopeId: string,
  ): Promise<void>;
}

/** Factory tipada de eventos — sem publish. */
export interface ContractDomainEventFactory {
  create<TPayload>(
    input: Omit<ContractDomainEvent<TPayload>, 'eventId' | 'eventVersion' | 'occurredAt'> & {
      eventId?: string;
      eventVersion?: number;
      occurredAt?: string;
    },
  ): ContractDomainEvent<TPayload>;
}
