/**
 * @module domain/contracts/rendering/contract-pdf.renderer
 * @description Abstração de PDF + renderer determinístico de teste — Phase 10.7.
 *
 * NÃO reutiliza jsPDF/html2canvas do legado (não determinísticos / browser-only).
 * O renderer de teste NÃO produz PDF jurídico de produção.
 */

import { createContractDomainError, type ContractDomainWarning } from '../contract.errors.js';
import type { ContractBinaryArtifact } from '../files/contract-file.types.js';
import { sha256Bytes, sha256Utf8 } from '../files/contract-binary-hash.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import type { ContractDocumentRenderModel } from './contract-document-render.model.js';
import type { RenderedContractHtml } from './contract-html.renderer.js';
import type { SignatureEvidenceReport } from '../artifacts/signature-evidence-report.js';

export const CONTRACT_TEST_PDF_RENDERER_VERSION = 'deterministic-test-pdf-v1';

export interface RenderUnsignedContractPdfInput {
  model: ContractDocumentRenderModel;
  html: RenderedContractHtml;
}

export interface RenderSignedContractPdfInput {
  model: ContractDocumentRenderModel;
  html: RenderedContractHtml;
  evidenceReport: SignatureEvidenceReport;
  documentHashBeforeSigning: string;
}

export interface RenderedContractPdf {
  artifact: ContractBinaryArtifact;
  pageCount?: number;
  rendererVersion: string;
  renderedAt: string;
  sourceHtmlHash: string;
  warnings: ContractDomainWarning[];
  /** true = artefato de demonstração técnica, não PDF jurídico. */
  technicalDemo: true;
}

export interface ContractPdfRenderer {
  readonly name: string;
  renderUnsignedPdf(input: RenderUnsignedContractPdfInput): Promise<RenderedContractPdf>;
  renderSignedPdf(input: RenderSignedContractPdfInput): Promise<RenderedContractPdf>;
}

function buildDeterministicPdfBytes(payload: Record<string, unknown>): Uint8Array {
  // Formato claramente identificado como teste — NÃO é PDF de produção.
  const body = JSON.stringify(payload);
  const text = [
    '%PDF-TEST-V2',
    '% Love Odonto Contracts V2 — TECHNICAL DEMO RENDERER',
    '% NOT A PRODUCTION LEGAL PDF',
    `1 0 obj<< /Type /Catalog /Demo true /Payload (${body.length}) >>endobj`,
    'stream',
    body,
    'endstream',
    '%%EOF',
  ].join('\n');
  return new TextEncoder().encode(text);
}

export function createUnavailableContractPdfRenderer(): ContractPdfRenderer {
  const fail = async () => {
    throw Object.assign(new Error('Renderer indisponível.'), {
      domainError: createContractDomainError(
        'CONTRACT_PDF_RENDERER_UNAVAILABLE',
        'Renderer de PDF v2 indisponível.',
      ),
    });
  };
  return {
    name: 'UNAVAILABLE',
    renderUnsignedPdf: fail,
    renderSignedPdf: fail,
  };
}

/**
 * Renderer determinístico para testes/fixtures.
 * Documentado: não produz PDF de produção.
 */
export function createDeterministicTestPdfRenderer(
  clock: ContractClock = createSystemContractClock(),
): ContractPdfRenderer {
  return {
    name: CONTRACT_TEST_PDF_RENDERER_VERSION,

    async renderUnsignedPdf(input) {
      if (!input.html?.sha256 || !input.model?.documentHash) {
        throw Object.assign(new Error('Entrada inválida.'), {
          domainError: createContractDomainError(
            'CONTRACT_PDF_GENERATION_FAILED',
            'Entrada inválida para PDF não assinado.',
          ),
        });
      }
      const renderedAt = clock.nowIso();
      const bytes = buildDeterministicPdfBytes({
        kind: 'UNSIGNED_PDF_TECHNICAL_DEMO',
        rendererVersion: CONTRACT_TEST_PDF_RENDERER_VERSION,
        contractId: input.model.contractId,
        contractVersionId: input.model.contractVersionId,
        contractNumber: input.model.contractNumber,
        versionNumber: input.model.versionNumber,
        documentHash: input.model.documentHash,
        sourceHtmlHash: input.html.sha256,
        title: input.model.title,
        sections: input.model.sections.map((s) => ({ key: s.key, order: s.order, title: s.title })),
        renderedAt,
      });
      const sha256 = await sha256Bytes(bytes);
      return {
        artifact: {
          bytes,
          mimeType: 'application/pdf',
          sizeBytes: bytes.byteLength,
          sha256,
        },
        pageCount: 1,
        rendererVersion: CONTRACT_TEST_PDF_RENDERER_VERSION,
        renderedAt,
        sourceHtmlHash: input.html.sha256,
        warnings: [{
          code: 'OPTIONAL_SNAPSHOT_ABSENT',
          message: 'Renderer determinístico de teste — não é PDF jurídico de produção.',
        }],
        technicalDemo: true,
      };
    },

    async renderSignedPdf(input) {
      if (input.documentHashBeforeSigning !== input.model.documentHash) {
        throw Object.assign(new Error('Hash divergente.'), {
          domainError: createContractDomainError(
            'SIGNATURE_DOCUMENT_HASH_MISMATCH',
            'Hash documental diverge da versão.',
          ),
        });
      }
      if (!input.evidenceReport?.reportHash) {
        throw Object.assign(new Error('Evidências incompletas.'), {
          domainError: createContractDomainError(
            'CONTRACT_SIGNATURE_EVIDENCE_INCOMPLETE',
            'Relatório de evidências ausente para PDF assinado.',
          ),
        });
      }
      const renderedAt = clock.nowIso();
      const bytes = buildDeterministicPdfBytes({
        kind: 'SIGNED_PDF_TECHNICAL_DEMO',
        rendererVersion: CONTRACT_TEST_PDF_RENDERER_VERSION,
        contractId: input.model.contractId,
        contractVersionId: input.model.contractVersionId,
        documentHashBeforeSigning: input.documentHashBeforeSigning,
        evidenceReportHash: input.evidenceReport.reportHash,
        envelopeId: input.evidenceReport.envelopeId,
        signers: input.evidenceReport.signers.map((s) => ({
          signerId: s.signerId,
          role: s.role,
          signedAt: s.signedAt,
          method: s.method,
          evidenceHash: s.evidenceHash,
          artifactHash: s.signatureArtifactHash || null,
        })),
        sourceHtmlHash: input.html.sha256,
        renderedAt,
      });
      const sha256 = await sha256Bytes(bytes);
      // Hash do PDF final ≠ hash canônico do conteúdo — documentado
      const contentHashNote = await sha256Utf8(input.model.documentHash);
      void contentHashNote;
      return {
        artifact: {
          bytes,
          mimeType: 'application/pdf',
          sizeBytes: bytes.byteLength,
          sha256,
        },
        pageCount: 1,
        rendererVersion: CONTRACT_TEST_PDF_RENDERER_VERSION,
        renderedAt,
        sourceHtmlHash: input.html.sha256,
        warnings: [{
          code: 'OPTIONAL_SNAPSHOT_ABSENT',
          message: 'PDF assinado técnico de demonstração — hash do PDF ≠ hash canônico do conteúdo.',
        }],
        technicalDemo: true,
      };
    },
  };
}
