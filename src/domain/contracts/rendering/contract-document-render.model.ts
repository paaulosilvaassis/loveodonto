/**
 * @module domain/contracts/rendering/contract-document-render.model
 * @description Render model intermediário — Phase 10.7.
 * Construído somente a partir de ContractVersion (sem consultas externas).
 */

import { createContractDomainError } from '../contract.errors.js';
import type { Contract, ContractVersion } from '../contract.types.js';
import type { ContractClock } from '../shared/contract-clock.js';
import { createSystemContractClock } from '../shared/contract-clock.js';
import { canonicalizeJsonValue } from '../hash/contract-content-hasher.js';

export interface ContractDocumentHeader {
  legalName: string;
  tradeName?: string;
  cnpjMasked?: string;
  addressFull?: string;
  phone?: string;
  email?: string;
  responsibleProfessionalName?: string;
  responsibleProfessionalCro?: string;
  logoReference?: string;
}

export interface ContractDocumentSection {
  key: string;
  title: string;
  order: number;
  bodyText: string;
  kind: 'OBJECT' | 'PROCEDURES' | 'FINANCIAL' | 'CONSENTS' | 'RISKS' | 'CLAUSES' | 'ANNEX' | 'OTHER';
}

export interface ContractDocumentSignatureBlock {
  order: number;
  role: string;
  name: string;
  methodHint?: string;
  required: boolean;
}

export interface ContractDocumentFooter {
  contractIdShort: string;
  versionIdShort: string;
  documentHashShort: string;
  verificationCodeHint?: string;
}

export interface ContractDocumentRenderModel {
  tenantId: string;
  contractId: string;
  contractVersionId: string;
  contractNumber: string;
  versionNumber: number;
  documentType: string;
  title: string;
  header: ContractDocumentHeader;
  sections: ContractDocumentSection[];
  signatureBlocks: ContractDocumentSignatureBlock[];
  footer: ContractDocumentFooter;
  documentHash: string;
  renderedAt: string;
  patientDisplayName?: string;
  guardianDisplayName?: string;
  issuedAt?: string;
}

export interface CreateContractDocumentRenderModelOptions {
  clock?: ContractClock;
  contractNumber?: string;
  documentType?: string;
  title?: string;
  verificationCodeHint?: string;
  /** Se true, exige lockedAt (default true). */
  requireLocked?: boolean;
}

function shortId(id: string): string {
  const v = String(id || '');
  return v.length <= 8 ? v : `${v.slice(0, 8)}…`;
}

function shortHash(hash: string): string {
  const v = String(hash || '');
  return v.length <= 12 ? v : `${v.slice(0, 12)}…`;
}

function textFromUnknown(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(canonicalizeJsonValue(value));
  } catch {
    return String(value);
  }
}

/**
 * Cria render model apenas a partir da versão (e metadados explícitos).
 * Não consulta paciente/orçamento/IndexedDB/legado.
 */
export function createContractDocumentRenderModel(
  version: ContractVersion,
  options: CreateContractDocumentRenderModelOptions = {},
  contractMeta: Pick<Contract, 'contractNumber' | 'documentType' | 'title' | 'tenantId' | 'id'> | null = null,
): ContractDocumentRenderModel {
  const clock = options.clock || createSystemContractClock();
  const requireLocked = options.requireLocked !== false;

  if (!version) {
    throw Object.assign(new Error('Versão inválida.'), {
      domainError: createContractDomainError(
        'CONTRACT_RENDER_MODEL_INVALID',
        'Versão contratual ausente.',
      ),
    });
  }
  if (requireLocked && !version.lockedAt) {
    throw Object.assign(new Error('Versão não bloqueada.'), {
      domainError: createContractDomainError(
        'VERSION_NOT_LOCKED',
        'Versão deve estar bloqueada para renderização.',
        'lockedAt',
      ),
    });
  }
  if (!version.documentHash) {
    throw Object.assign(new Error('Hash ausente.'), {
      domainError: createContractDomainError(
        'CONTENT_HASH_REQUIRED',
        'Hash documental obrigatório.',
        'documentHash',
      ),
    });
  }

  const tenantId = String(version.tenantId || contractMeta?.tenantId || '');
  const contractId = String(version.contractId || contractMeta?.id || '');
  if (!tenantId || !contractId) {
    throw Object.assign(new Error('Tenant/contrato ausentes.'), {
      domainError: createContractDomainError(
        'CONTRACT_RENDER_MODEL_INVALID',
        'tenantId/contractId obrigatórios no render model.',
      ),
    });
  }

  const clinic = version.clinicSnapshot || ({} as ContractVersion['clinicSnapshot']);
  const patient = version.patientSnapshot || ({} as ContractVersion['patientSnapshot']);
  const guardian = version.guardianSnapshot;
  const budget = version.budgetSnapshot;
  const financial = version.financialSnapshot;
  const signers = [...(version.signersSnapshot || [])].sort((a, b) => {
    const ao = Number((a as { order?: number }).order || 0);
    const bo = Number((b as { order?: number }).order || 0);
    return ao - bo || String((a as { name?: string }).name || '').localeCompare(String((b as { name?: string }).name || ''));
  });

  const sections: ContractDocumentSection[] = [];
  let order = 1;
  sections.push({
    key: 'object',
    title: 'Objeto',
    order: order++,
    kind: 'OBJECT',
    bodyText: String(contractMeta?.title || options.title || 'Contrato de serviços odontológicos'),
  });
  if (budget) {
    const items = Array.isArray((budget as { items?: unknown[] }).items)
      ? (budget as { items: Array<{ procedureName?: string; quantity?: number }> }).items
      : [];
    const lines = items.map((it) => `- ${it.procedureName || 'Procedimento'} (qtd ${it.quantity ?? 1})`);
    sections.push({
      key: 'procedures',
      title: 'Procedimentos',
      order: order++,
      kind: 'PROCEDURES',
      bodyText: lines.length ? lines.join('\n') : textFromUnknown(budget),
    });
  }
  if (financial) {
    sections.push({
      key: 'financial',
      title: 'Condições financeiras',
      order: order++,
      kind: 'FINANCIAL',
      bodyText: textFromUnknown(financial),
    });
  }
  if (version.consentsSnapshot?.length) {
    sections.push({
      key: 'consents',
      title: 'Consentimentos',
      order: order++,
      kind: 'CONSENTS',
      bodyText: version.consentsSnapshot.map((c) => textFromUnknown(c)).join('\n'),
    });
  }
  if (version.termsSnapshot) {
    sections.push({
      key: 'terms',
      title: 'Cláusulas e termos',
      order: order++,
      kind: 'CLAUSES',
      bodyText: textFromUnknown(version.termsSnapshot),
    });
  }
  if (version.plainTextSnapshot) {
    sections.push({
      key: 'body',
      title: 'Conteúdo',
      order: order++,
      kind: 'OTHER',
      bodyText: String(version.plainTextSnapshot),
    });
  } else if (version.renderedHtmlSnapshot) {
    // Texto plano derivado sem HTML cru no model
    sections.push({
      key: 'body',
      title: 'Conteúdo',
      order: order++,
      kind: 'OTHER',
      bodyText: String(version.renderedHtmlSnapshot).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    });
  }

  sections.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));

  return {
    tenantId,
    contractId,
    contractVersionId: String(version.id),
    contractNumber: options.contractNumber || contractMeta?.contractNumber || 'CTR-UNKNOWN',
    versionNumber: Number(version.versionNumber) || 1,
    documentType: options.documentType || contractMeta?.documentType || 'SERVICE_CONTRACT',
    title: options.title || contractMeta?.title || 'Contrato',
    header: {
      legalName: String((clinic as { legalName?: string }).legalName || 'Clínica'),
      tradeName: (clinic as { tradeName?: string }).tradeName,
      cnpjMasked: (clinic as { cnpjMasked?: string }).cnpjMasked,
      addressFull: (clinic as { addressFull?: string }).addressFull,
      phone: (clinic as { phone?: string }).phone,
      email: (clinic as { email?: string }).email,
      responsibleProfessionalName: (clinic as { responsibleProfessionalName?: string }).responsibleProfessionalName,
      responsibleProfessionalCro: (clinic as { responsibleProfessionalCro?: string }).responsibleProfessionalCro,
      logoReference: undefined,
    },
    sections,
    signatureBlocks: signers.map((s, idx) => ({
      order: Number((s as { order?: number }).order) || idx + 1,
      role: String((s as { role?: string }).role || 'OTHER'),
      name: String((s as { name?: string }).name || 'Signatário'),
      required: Boolean((s as { required?: boolean }).required !== false),
    })),
    footer: {
      contractIdShort: shortId(contractId),
      versionIdShort: shortId(String(version.id)),
      documentHashShort: shortHash(version.documentHash),
      verificationCodeHint: options.verificationCodeHint,
    },
    documentHash: version.documentHash,
    renderedAt: clock.nowIso(),
    patientDisplayName: (patient as { fullName?: string }).fullName,
    guardianDisplayName: guardian ? (guardian as { fullName?: string }).fullName : undefined,
    issuedAt: version.lockedAt || version.createdAt,
  };
}
