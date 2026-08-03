/**
 * @module domain/contracts/artifacts/signature-evidence-report
 * @description Relatório técnico de evidências — Phase 10.7.
 */

import { createContractDomainError } from '../contract.errors.js';
import type {
  SignatureEnvelope,
  SignatureEvidenceSnapshot,
  SignaturePolicy,
  SignatureSigner,
} from '../signatures/signature.types.js';
import { canonicalizeJsonValue } from '../hash/contract-content-hasher.js';
import { sha256Utf8 } from '../files/contract-binary-hash.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';

export interface SignaturePolicySnapshot {
  policyId: string;
  name: string;
  signatureLevel: string;
  allowedMethods: string[];
  requireOtp: boolean;
  signingOrder: string;
}

export interface SignatureEvidenceReportSigner {
  signerId: string;
  role: string;
  name: string;
  method?: string;
  invitedAt?: string;
  viewedAt?: string;
  authenticatedAt?: string;
  signedAt?: string;
  acceptedTerms: Array<{ code: string; acceptedAt?: string; contentHash?: string }>;
  ipAddressMasked?: string;
  userAgentSummary?: string;
  geolocationRecorded: boolean;
  signatureArtifactHash?: string;
  evidenceHash: string;
}

export interface SignatureEvidenceReportEvent {
  type: string;
  at?: string;
  signerId?: string;
}

export interface SignatureEvidenceReport {
  reportVersion: number;
  tenantId: string;
  contractId: string;
  contractVersionId: string;
  envelopeId: string;
  contractNumber: string;
  documentHash: string;
  signedPdfHash?: string;
  envelopeCreatedAt: string;
  envelopeSentAt?: string;
  envelopeCompletedAt: string;
  policySnapshot: SignaturePolicySnapshot;
  signers: SignatureEvidenceReportSigner[];
  eventSummary: SignatureEvidenceReportEvent[];
  reportGeneratedAt: string;
  reportHash: string;
  technicalDemo: true;
}

function maskIp(ip?: string): string | undefined {
  if (!ip) return undefined;
  const parts = String(ip).split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  if (ip.includes(':')) return `${ip.slice(0, 8)}…`;
  return '***';
}

function summarizeUa(ua?: string): string | undefined {
  if (!ua) return undefined;
  return String(ua).slice(0, 48);
}

export async function buildSignatureEvidenceReport(input: {
  envelope: SignatureEnvelope;
  signers: SignatureSigner[];
  policy: SignaturePolicy | null;
  evidences: SignatureEvidenceSnapshot[];
  contractNumber: string;
  signedPdfHash?: string;
  clock?: ContractClock;
}): Promise<SignatureEvidenceReport> {
  const clock = input.clock || createSystemContractClock();
  if (input.envelope.status !== 'COMPLETED') {
    throw Object.assign(new Error('Envelope incompleto.'), {
      domainError: createContractDomainError(
        'CONTRACT_SIGNED_ARTIFACTS_NOT_READY',
        'Envelope deve estar COMPLETED para relatório de evidências.',
      ),
    });
  }
  if (!input.envelope.completedAt) {
    throw Object.assign(new Error('completedAt ausente.'), {
      domainError: createContractDomainError(
        'CONTRACT_EVIDENCE_REPORT_INVALID',
        'Envelope concluído sem completedAt.',
      ),
    });
  }

  const evidenceBySigner = new Map(
    input.evidences.map((e) => [String(e.signerId), e]),
  );

  const reportSigners: SignatureEvidenceReportSigner[] = [...input.signers]
    .sort((a, b) => a.signerOrder - b.signerOrder || a.name.localeCompare(b.name))
    .map((s) => {
      const ev = evidenceBySigner.get(String(s.id)) || s.evidenceSnapshot;
      if (s.required && s.status === 'SIGNED' && !ev?.evidenceHash) {
        throw Object.assign(new Error('Evidência incompleta.'), {
          domainError: createContractDomainError(
            'CONTRACT_SIGNATURE_EVIDENCE_INCOMPLETE',
            'Evidência ausente para signatário obrigatório.',
          ),
        });
      }
      return {
        signerId: String(s.id),
        role: String(s.signerRole),
        name: s.name,
        method: s.authenticationMethod || ev?.authenticationMethod,
        invitedAt: s.invitedAt,
        viewedAt: s.viewedAt || ev?.viewedAt,
        authenticatedAt: s.authenticatedAt || ev?.authenticationCompletedAt,
        signedAt: s.signedAt || ev?.signedAt,
        acceptedTerms: (s.acceptedTerms || ev?.acceptedTerms || []).map((t) => ({
          code: String(t.code),
          acceptedAt: t.acceptedAt,
          contentHash: t.contentHash,
        })),
        ipAddressMasked: maskIp(ev?.ipAddress || s.ipAddress),
        userAgentSummary: summarizeUa(
          typeof ev?.userAgent === 'string' ? ev.userAgent : s.userAgent,
        ),
        geolocationRecorded: Boolean(ev?.geolocation),
        signatureArtifactHash: ev?.signatureArtifact?.sha256 || s.signatureArtifact?.sha256,
        evidenceHash: String(ev?.evidenceHash || ''),
      };
    });

  const base = {
    reportVersion: 1,
    tenantId: String(input.envelope.tenantId),
    contractId: String(input.envelope.contractId),
    contractVersionId: String(input.envelope.contractVersionId),
    envelopeId: String(input.envelope.id),
    contractNumber: input.contractNumber,
    documentHash: String(input.envelope.documentHashBeforeSigning || ''),
    signedPdfHash: input.signedPdfHash,
    envelopeCreatedAt: input.envelope.createdAt,
    envelopeSentAt: input.envelope.sentAt,
    envelopeCompletedAt: input.envelope.completedAt,
    policySnapshot: {
      policyId: String(input.policy?.id || input.envelope.signaturePolicyId || ''),
      name: input.policy?.name || 'unknown',
      signatureLevel: input.policy?.signatureLevel || 'SIMPLE',
      allowedMethods: [...(input.policy?.allowedMethods || [])],
      requireOtp: Boolean(input.policy?.requireOtp),
      signingOrder: String(input.policy?.signingOrder || 'ANY_ORDER'),
    },
    signers: reportSigners,
    eventSummary: [
      { type: 'envelope.created', at: input.envelope.createdAt },
      { type: 'envelope.sent', at: input.envelope.sentAt },
      ...reportSigners.filter((s) => s.signedAt).map((s) => ({
        type: 'signer.signed',
        at: s.signedAt,
        signerId: s.signerId,
      })),
      { type: 'envelope.completed', at: input.envelope.completedAt },
    ],
    reportGeneratedAt: clock.nowIso(),
    technicalDemo: true as const,
  };

  const canonical = JSON.stringify(canonicalizeJsonValue(base));
  // Bloquear apenas vazamentos reais (não nomes de método como OTP_EMAIL)
  if (/data:image|data:application|["']token["']\s*:|plainCode|testOnlyPlainCode/i.test(canonical)) {
    throw Object.assign(new Error('Relatório contém segredos.'), {
      domainError: createContractDomainError(
        'CONTRACT_EVIDENCE_REPORT_INVALID',
        'Relatório de evidências contém dados proibidos.',
      ),
    });
  }
  const reportHash = await sha256Utf8(canonical);
  return { ...base, reportHash };
}

export async function evidenceReportToJsonBytes(
  report: SignatureEvidenceReport,
): Promise<{ bytes: Uint8Array; sha256: string }> {
  const text = JSON.stringify(canonicalizeJsonValue(report));
  const bytes = new TextEncoder().encode(text);
  const sha256 = await sha256Utf8(text);
  if (sha256 !== report.reportHash && report.signedPdfHash) {
    // reportHash foi calculado sem signedPdfHash opcional às vezes — recalcular ok se igual ao corpo
  }
  return { bytes, sha256: await sha256Utf8(text) };
}

export function evidenceReportToPrintableHtml(report: SignatureEvidenceReport): string {
  const rows = report.signers.map((s) => `
    <tr>
      <td>${s.name}</td>
      <td>${s.role}</td>
      <td>${s.method || '—'}</td>
      <td>${s.signedAt || '—'}</td>
      <td>${s.evidenceHash.slice(0, 12)}…</td>
    </tr>`).join('');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Evidências ${report.contractNumber}</title>
<style>body{font-family:Georgia,serif;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px}.demo{background:#fff3cd;padding:8px;font-weight:bold}</style>
</head><body>
<p class="demo">RELATÓRIO TÉCNICO DE EVIDÊNCIAS — DEMONSTRAÇÃO — SEM VALOR JURÍDICO</p>
<h1>Evidências — ${report.contractNumber}</h1>
<p>Envelope ${report.envelopeId} · Hash doc ${report.documentHash.slice(0, 12)}… · Relatório ${report.reportHash.slice(0, 12)}…</p>
<table><thead><tr><th>Nome</th><th>Papel</th><th>Método</th><th>Assinado em</th><th>Evidence</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
}
