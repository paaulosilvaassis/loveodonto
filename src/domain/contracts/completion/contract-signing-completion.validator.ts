/**
 * @module domain/contracts/completion/contract-signing-completion.validator
 * @description Validação final composta para SIGNED — Phase 10.8.
 */

import {
  createContractDomainError,
  type ContractDomainError,
  type ContractDomainWarning,
} from '../contract.errors.js';
import type { Contract, ContractVersion } from '../contract.types.js';
import type { ContractFileArtifact } from '../files/contract-file.types.js';
import type { ContractIntegrityManifest } from '../artifacts/contract-integrity-manifest.js';
import { createContractFileIntegrityService } from '../files/contract-file-integrity.service.js';
import type {
  SignatureEnvelope,
  SignatureEvidenceSnapshot,
  SignatureSigner,
} from '../signatures/signature.types.js';
import type { ContractLedgerRepository } from '../ledger/contract-ledger.repository.js';
import type { TenantId } from '../contract.ids.js';

export interface ValidateContractSigningCompletionInput {
  contract: Contract | null;
  version: ContractVersion | null;
  envelope: SignatureEnvelope | null;
  signers: SignatureSigner[];
  evidences: SignatureEvidenceSnapshot[];
  signedPdf: ContractFileArtifact | null;
  evidenceReport: ContractFileArtifact | null;
  integrityManifestFile: ContractFileArtifact | null;
  manifest: ContractIntegrityManifest | null;
  expectedContractRowVersion?: number;
  tenantId: TenantId;
  contractId: string;
  contractVersionId: string;
  envelopeId: string;
}

export interface ContractSigningCompletionValidationResult {
  valid: boolean;
  errors: ContractDomainError[];
  warnings: ContractDomainWarning[];
  contractReady: boolean;
  versionReady: boolean;
  envelopeReady: boolean;
  evidenceReady: boolean;
  signedPdfReady: boolean;
  manifestReady: boolean;
  ledgerReady: boolean;
}

function err(code: ContractDomainError['code'], message: string, field?: string): ContractDomainError {
  return createContractDomainError(code, message, field);
}

export async function validateContractSigningCompletion(
  input: ValidateContractSigningCompletionInput,
  ledger?: ContractLedgerRepository,
): Promise<ContractSigningCompletionValidationResult> {
  const errors: ContractDomainError[] = [];
  const warnings: ContractDomainWarning[] = [];

  let contractReady = true;
  let versionReady = true;
  let envelopeReady = true;
  let evidenceReady = true;
  let signedPdfReady = true;
  let manifestReady = true;
  let ledgerReady = true;

  const { contract, version, envelope } = input;

  if (!contract || contract.tenantId !== input.tenantId || contract.id !== input.contractId) {
    contractReady = false;
    errors.push(err('CONTRACT_NOT_FOUND', 'Contrato não encontrado.', 'contractId'));
  } else {
    if (contract.status === 'SIGNED') {
      // replay path tratado no service — aqui marca conflito se artefatos mudarem depois
      warnings.push({
        code: 'OPTIONAL_SNAPSHOT_ABSENT',
        message: 'Contrato já SIGNED — service deve tratar replay.',
      });
    } else if (contract.status !== 'APPROVED'
      && contract.status !== 'PENDING_SIGNATURES'
      && contract.status !== 'PARTIALLY_SIGNED') {
      contractReady = false;
      errors.push(err(
        'CONTRACT_SIGNING_COMPLETION_NOT_READY',
        `Status ${contract.status} não permite conclusão.`,
        'status',
      ));
    }
    if (['CANCELLED', 'TERMINATED', 'SUPERSEDED', 'VOIDED', 'EXPIRED', 'DECLINED'].includes(contract.status)) {
      contractReady = false;
      errors.push(err('TERMINAL_STATUS', 'Contrato em estado terminal.', 'status'));
    }
    if (contract.currentVersionId !== input.contractVersionId) {
      contractReady = false;
      errors.push(err(
        'CONTRACT_SIGNED_ARTIFACT_VERSION_MISMATCH',
        'currentVersionId diverge.',
        'contractVersionId',
      ));
    }
    if (input.expectedContractRowVersion != null
      && contract.rowVersion != null
      && contract.rowVersion !== input.expectedContractRowVersion) {
      contractReady = false;
      errors.push(err('OPTIMISTIC_CONCURRENCY_CONFLICT', 'rowVersion diverge.', 'rowVersion'));
    }
  }

  if (!version
    || version.tenantId !== input.tenantId
    || version.id !== input.contractVersionId
    || version.contractId !== input.contractId) {
    versionReady = false;
    errors.push(err('VERSION_REQUIRED', 'Versão inválida.', 'contractVersionId'));
  } else {
    if (!version.lockedAt) {
      versionReady = false;
      errors.push(err('VERSION_NOT_LOCKED', 'Versão não bloqueada.', 'lockedAt'));
    }
    if (!version.documentHash) {
      versionReady = false;
      errors.push(err('CONTENT_HASH_REQUIRED', 'Hash documental ausente.', 'documentHash'));
    }
  }

  if (!envelope
    || envelope.tenantId !== input.tenantId
    || envelope.id !== input.envelopeId
    || envelope.contractId !== input.contractId
    || envelope.contractVersionId !== input.contractVersionId) {
    envelopeReady = false;
    errors.push(err('SIGNATURE_ENVELOPE_NOT_FOUND', 'Envelope inválido.', 'envelopeId'));
  } else {
    if (envelope.status !== 'COMPLETED') {
      envelopeReady = false;
      errors.push(err(
        'CONTRACT_SIGNING_COMPLETION_NOT_READY',
        'Envelope não COMPLETED.',
        'envelope.status',
      ));
    }
    if (!envelope.completedAt) {
      envelopeReady = false;
      errors.push(err(
        'CONTRACT_SIGNING_COMPLETION_NOT_READY',
        'completedAt ausente.',
        'envelope.completedAt',
      ));
    }
    if (version?.documentHash
      && envelope.documentHashBeforeSigning
      && version.documentHash !== envelope.documentHashBeforeSigning) {
      envelopeReady = false;
      errors.push(err('SIGNATURE_DOCUMENT_HASH_MISMATCH', 'Hash documental diverge.'));
    }
    const required = input.signers.filter((s) => s.required);
    if (required.some((s) => s.status === 'DECLINED')) {
      envelopeReady = false;
      errors.push(err('SIGNATURE_DECLINED', 'Signatário obrigatório recusou.', 'signers'));
    }
    for (const s of required) {
      if (s.status !== 'SIGNED') {
        envelopeReady = false;
        errors.push(err('SIGNATURES_INCOMPLETE', 'Signatário obrigatório pendente.', 'signers'));
        break;
      }
      const ev = input.evidences.find((e) => e.signerId === s.id) || s.evidenceSnapshot;
      if (!ev?.evidenceHash) {
        evidenceReady = false;
        errors.push(err(
          'CONTRACT_SIGNATURE_EVIDENCE_INCOMPLETE',
          'Evidência ausente.',
          'evidence',
        ));
      }
    }
  }

  const pdf = input.signedPdf;
  if (!pdf) {
    signedPdfReady = false;
    errors.push(err('CONTRACT_SIGNED_PDF_REQUIRED', 'PDF assinado obrigatório.'));
  } else if (pdf.tenantId !== input.tenantId) {
    signedPdfReady = false;
    errors.push(err('CONTRACT_SIGNED_ARTIFACT_TENANT_MISMATCH', 'PDF de outro tenant.'));
  } else if (pdf.contractId !== input.contractId
    || pdf.contractVersionId !== input.contractVersionId) {
    signedPdfReady = false;
    errors.push(err('CONTRACT_SIGNED_ARTIFACT_VERSION_MISMATCH', 'PDF versão diverge.'));
  } else if (pdf.envelopeId && pdf.envelopeId !== input.envelopeId) {
    signedPdfReady = false;
    errors.push(err('CONTRACT_SIGNED_ARTIFACT_ENVELOPE_MISMATCH', 'PDF envelope diverge.'));
  } else if (pdf.fileType !== 'SIGNED_PDF' || pdf.mimeType !== 'application/pdf') {
    signedPdfReady = false;
    errors.push(err('CONTRACT_SIGNED_PDF_INVALID', 'Tipo/MIME do PDF inválido.'));
  } else if (pdf.status !== 'VERIFIED' || !pdf.sha256 || pdf.sizeBytes <= 0) {
    signedPdfReady = false;
    errors.push(err('CONTRACT_SIGNED_PDF_INVALID', 'PDF não verificado ou hash ausente.'));
  }

  const report = input.evidenceReport;
  if (!report) {
    evidenceReady = false;
    errors.push(err('CONTRACT_EVIDENCE_REPORT_REQUIRED', 'Evidence report obrigatório.'));
  } else if (report.tenantId !== input.tenantId
    || report.contractId !== input.contractId
    || report.contractVersionId !== input.contractVersionId
    || (report.envelopeId && report.envelopeId !== input.envelopeId)) {
    evidenceReady = false;
    errors.push(err('CONTRACT_EVIDENCE_REPORT_INVALID', 'Evidence report inconsistente.'));
  } else if (report.fileType !== 'EVIDENCE_REPORT'
    || report.status !== 'VERIFIED'
    || !report.sha256) {
    evidenceReady = false;
    errors.push(err('CONTRACT_EVIDENCE_REPORT_INVALID', 'Evidence report não verificado.'));
  }

  const manifestFile = input.integrityManifestFile;
  const manifest = input.manifest;
  if (!manifestFile || !manifest) {
    manifestReady = false;
    errors.push(err('CONTRACT_INTEGRITY_MANIFEST_REQUIRED', 'Manifesto obrigatório.'));
  } else if (manifestFile.tenantId !== input.tenantId
    || manifest.tenantId !== input.tenantId
    || manifest.contractId !== input.contractId
    || manifest.contractVersionId !== input.contractVersionId) {
    manifestReady = false;
    errors.push(err('CONTRACT_INTEGRITY_MANIFEST_INVALID', 'Manifesto inconsistente.'));
  } else if (manifestFile.fileType !== 'INTEGRITY_MANIFEST'
    || manifestFile.status !== 'VERIFIED'
    || !manifest.manifestHash) {
    manifestReady = false;
    errors.push(err('CONTRACT_INTEGRITY_MANIFEST_INVALID', 'Manifesto não verificado.'));
  } else {
    if (pdf && manifest.signedPdfHash && manifest.signedPdfHash !== pdf.sha256) {
      manifestReady = false;
      errors.push(err('CONTRACT_INTEGRITY_MANIFEST_INVALID', 'signedPdfHash diverge.'));
    }
    if (report && manifest.evidenceReportHash
      && manifest.evidenceReportHash !== report.sha256) {
      manifestReady = false;
      errors.push(err('CONTRACT_INTEGRITY_MANIFEST_INVALID', 'evidenceReportHash diverge.'));
    }
    if (version?.documentHash
      && manifest.documentContentHash !== version.documentHash) {
      manifestReady = false;
      errors.push(err('CONTRACT_INTEGRITY_MANIFEST_INVALID', 'documentContentHash diverge.'));
    }
    const integrity = createContractFileIntegrityService();
    const files = [pdf, report, manifestFile].filter(Boolean) as ContractFileArtifact[];
    const verified = await integrity.verifyManifest(manifest, files);
    if (!verified.valid) {
      manifestReady = false;
      errors.push(err('CONTRACT_INTEGRITY_MANIFEST_INVALID', 'Verificação do manifesto inválida.'));
    }
  }

  if (ledger) {
    try {
      const chain = await ledger.verifyChain(input.tenantId, input.contractId as never);
      if (!chain.valid) {
        ledgerReady = false;
        errors.push(err('CONTRACT_LEDGER_CHAIN_INVALID', 'Cadeia do ledger inválida.'));
      }
    } catch {
      ledgerReady = false;
      errors.push(err('CONTRACT_LEDGER_UNAVAILABLE', 'Ledger indisponível.'));
    }
  }

  const valid = errors.length === 0
    && contractReady
    && versionReady
    && envelopeReady
    && evidenceReady
    && signedPdfReady
    && manifestReady
    && ledgerReady;

  return {
    valid,
    errors,
    warnings,
    contractReady,
    versionReady,
    envelopeReady,
    evidenceReady,
    signedPdfReady,
    manifestReady,
    ledgerReady,
  };
}
