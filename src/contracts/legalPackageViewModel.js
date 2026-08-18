/**
 * ViewModel de apresentação do pacote jurídico (Wave A).
 * Não cria persistence layer — deriva de V1 + requirements + LGPD canônico.
 */

import { loadDb } from '../db/index.js';
import { getContractStatusForQuote, listPatientContracts } from '../services/contractModuleService.js';
import { listDocumentRecords } from '../services/documentService.js';
import { DOCUMENT_CATEGORIES } from '../utils/documentTemplates.js';
import { mapDocumentTemplateToTcleId } from '../services/clinicalTcleAttachmentService.js';
import { getTreatmentDocumentRequirements } from './treatmentDocumentRequirements.js';
import { mapOperationalDocumentTypeToContractDocumentType } from '../domain/contracts/packages/package-manifest-document-map.ts';
import { resolveLgpdPresentedContent } from '../domain/contracts/packages/package-manifest-lgpd.ts';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import {
  deriveLegalPackageStatus,
  labelLegalPackageStatus,
  labelLegalDocumentStatus,
  mapContractStatusToDocumentStatus,
  isLegalDocumentLocked,
  isLegalDocumentSigned,
  LEGAL_DOCUMENT_STATUS,
} from './legalPackageStatus.js';
import {
  deriveLegalPackageAvailableActions,
  deriveLegalDocumentAction,
  resolveLegalPackagePermissions,
} from './legalPackagePermissions.js';

const SIGNATURE_LEVEL_LABELS = {
  SIMPLE: 'simples',
  ADVANCED: 'avançada',
  QUALIFIED: 'qualificada',
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function lgpdSnapshotHtml() {
  const { presentedText, version } = resolveLgpdPresentedContent();
  return `<pre data-lgpd-version="${escapeHtml(version)}">${escapeHtml(presentedText)}</pre>`;
}

function findTcleRecord({ patientId, appointmentId, tcleId }) {
  const records = listDocumentRecords({
    patientId,
    category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
  });
  return records.find((row) => {
    if (appointmentId && row.appointmentId && row.appointmentId !== appointmentId) return false;
    const mapped = mapDocumentTemplateToTcleId(row.templateKey) || row.metadata?.tcleId;
    return mapped === tcleId;
  }) || null;
}

function resolvePatientMeta(patientId) {
  const db = loadDb();
  const patient = (db.patients || []).find((p) => p.id === patientId) || null;
  const guardianName = patient?.guardian_name
    || patient?.responsible_name
    || patient?.responsavel_nome
    || patient?.profile?.guardian_full_name
    || patient?.profile?.legal_guardian_name
    || null;
  return {
    patientName: patient?.full_name || patient?.nickname || 'Paciente',
    responsibleParty: guardianName,
    patient,
  };
}

function buildDocumentRow({
  id,
  operationalType,
  tcleId = null,
  title,
  required,
  ready,
  contract = null,
  version,
  hash = null,
  date = null,
  snapshotHtml = '',
  detail = null,
  user = null,
}) {
  const mapped = mapOperationalDocumentTypeToContractDocumentType(operationalType, tcleId);
  const contractDoc = operationalType === 'CONTRACT_SERVICES';
  const status = contractDoc
    ? mapContractStatusToDocumentStatus(contract)
    : (ready
      ? (mapContractStatusToDocumentStatus(contract) === LEGAL_DOCUMENT_STATUS.SIGNED
        ? LEGAL_DOCUMENT_STATUS.SIGNED
        : LEGAL_DOCUMENT_STATUS.READY)
      : LEGAL_DOCUMENT_STATUS.NOT_STARTED);
  const locked = contractDoc
    ? isLegalDocumentLocked(contract, status)
    : Boolean(ready && isLegalDocumentLocked(contract, mapContractStatusToDocumentStatus(contract)));
  const signed = isLegalDocumentSigned(status)
    || (ready && isLegalDocumentSigned(mapContractStatusToDocumentStatus(contract)));
  const row = {
    id,
    operationalType,
    documentType: mapped.documentType,
    documentKey: tcleId ? `${mapped.documentKeyPrefix}` : mapped.documentKeyPrefix,
    title,
    version: String(version || '1'),
    required: Boolean(required),
    optional: !required,
    ready: Boolean(ready),
    pending: Boolean(required && !ready),
    locked,
    signed,
    status,
    statusLabel: labelLegalDocumentStatus(status),
    hash: hash || null,
    date: date || null,
    snapshotHtml,
    detail,
  };
  row.action = deriveLegalDocumentAction({ document: row, user });
  return row;
}

/**
 * @param {{
 *   appointmentId?: string,
 *   budgetId?: string,
 *   patientId?: string,
 *   contractId?: string,
 *   user?: object,
 * }} input
 */
export function buildContractPackageViewModel(input = {}) {
  const {
    appointmentId = null,
    budgetId = null,
    patientId: patientIdInput = null,
    user = null,
  } = input;

  const requirements = getTreatmentDocumentRequirements({
    appointmentId,
    budgetId,
    patientId: patientIdInput,
  });
  const patientId = requirements.patientId || patientIdInput || null;
  const resolvedBudgetId = requirements.budgetId || budgetId || null;
  const contract = requirements.contract
    || (appointmentId
      ? getContractStatusForQuote(appointmentId, 'clinical_budget', resolvedBudgetId, patientId)
      : null);
  const budget = requirements.budget || null;
  const { patientName, responsibleParty } = resolvePatientMeta(patientId);
  const lgpd = resolveLgpdPresentedContent();

  const documents = [];
  const contractMappedReady = Boolean(contract?.id && !['canceled', 'replaced', 'refused'].includes(String(contract.status || '').toLowerCase()));
  documents.push(buildDocumentRow({
    id: 'contract_services',
    operationalType: 'CONTRACT_SERVICES',
    title: 'Contrato de prestação de serviços',
    required: true,
    ready: contractMappedReady,
    contract,
    version: contract?.templateVersion || contract?.version || '1',
    hash: contract?.documentHash || null,
    date: contract?.updatedAt || contract?.generatedAt || contract?.createdAt || null,
    snapshotHtml: contract?.renderedHtml || contract?.editedHtml || contract?.finalContent || '',
    user,
  }));

  const requiredTcles = requirements.documents?.tcle?.requiredTcles || [];
  const attachedIds = new Set(requirements.documents?.tcle?.attachedEligibleIds || []);
  for (const tcle of requiredTcles) {
    const record = findTcleRecord({
      patientId,
      appointmentId,
      tcleId: tcle.id,
    });
    const ready = attachedIds.has(tcle.id) || Boolean(record);
    documents.push(buildDocumentRow({
      id: `tcle_${tcle.id}`,
      operationalType: 'TCLE',
      tcleId: tcle.id,
      title: tcle.title || 'TCLE',
      required: true,
      ready,
      contract,
      version: record?.metadata?.version || '1',
      hash: record?.metadata?.contentHash || null,
      date: record?.signedAt || record?.updatedAt || record?.createdAt || null,
      snapshotHtml: record?.content || '',
      detail: ready ? null : 'Pendente: anexe em Documentos → Consentimentos',
      user,
    }));
  }

  documents.push(buildDocumentRow({
    id: 'lgpd',
    operationalType: 'LGPD',
    title: 'Termo LGPD / Privacidade',
    required: true,
    ready: true,
    contract,
    version: lgpd.version,
    hash: null,
    date: contract?.createdAt || null,
    snapshotHtml: lgpdSnapshotHtml(),
    user,
  }));

  documents.push(buildDocumentRow({
    id: 'image_optional',
    operationalType: 'IMAGE_USE',
    title: 'Autorização de uso de imagem',
    required: false,
    ready: false,
    contract,
    version: '1',
    user,
  }));

  const requiredDocs = documents.filter((d) => d.required);
  const requiredReady = requiredDocs.filter((d) => d.ready);
  const requiredSigned = requiredDocs.filter((d) => d.signed);
  const requiredPending = requiredDocs.filter((d) => d.pending);
  const packageStatus = deriveLegalPackageStatus({
    hasPackage: Boolean(contract?.id),
    contract,
    requiredPending: requiredPending.length,
    requiredTotal: requiredDocs.length,
    requiredSigned: requiredSigned.length,
  });
  const timestamps = {
    createdAt: contract?.createdAt || null,
    updatedAt: contract?.updatedAt || contract?.generatedAt || null,
    signedAt: contract?.signedAt || contract?.completedAt || null,
  };
  const locked = documents.some((d) => d.locked && d.operationalType === 'CONTRACT_SERVICES');
  const actions = deriveLegalPackageAvailableActions({
    packageStatus,
    documents,
    user,
    locked,
  });

  return {
    packageId: `pkg_${resolvedBudgetId || appointmentId || contract?.id || 'none'}`,
    exists: Boolean(contract?.id),
    reused: Boolean(contract?.id),
    patientId,
    patientName,
    budgetId: resolvedBudgetId,
    budgetNumber: budget?.budgetNumber || null,
    treatmentId: appointmentId || null,
    treatmentName: budget?.planName || contract?.title || 'Tratamento',
    appointmentId,
    contractId: contract?.id || null,
    contractStatus: contract?.status || null,
    responsibleParty,
    packageStatus,
    packageStatusLabel: labelLegalPackageStatus(packageStatus),
    documents,
    required: requiredDocs,
    optional: documents.filter((d) => d.optional),
    locked,
    signed: packageStatus === 'completed',
    pending: requiredPending,
    completedCount: requiredReady.length,
    totalRequired: requiredDocs.length,
    timestamps,
    updatedAt: timestamps.updatedAt || timestamps.createdAt,
    signatureLevel: 'SIMPLE',
    signatureLevelLabel: SIGNATURE_LEVEL_LABELS.SIMPLE,
    actions,
    permissions: resolveLegalPackagePermissions(user),
    origin: 'v1_operational',
  };
}

export function listPatientLegalPackages({ patientId, user = null } = {}) {
  if (!patientId) return [];
  const db = loadDb();
  const seen = new Set();
  const packages = [];

  const clinicals = (db.clinicalAppointments || []).filter((c) => c.patientId === patientId);
  for (const ca of clinicals) {
    const budgets = [];
    if (ca.budget) budgets.push(ca.budget);
    for (const hist of ca.budgetHistory || []) budgets.push(hist);
    for (const budget of budgets) {
      const approved = [BUDGET_STATUS.APROVADO, BUDGET_STATUS.CONTRATO_GERADO].includes(budget?.status);
      if (!approved && !budget?.contractId) continue;
      const key = `${ca.appointmentId}:${budget.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      packages.push(buildContractPackageViewModel({
        appointmentId: ca.appointmentId,
        budgetId: budget.id,
        patientId,
        user,
      }));
    }
  }

  for (const contract of listPatientContracts(patientId)) {
    const key = `${contract.quoteId || ''}:${contract.budgetId || contract.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    packages.push(buildContractPackageViewModel({
      appointmentId: contract.quoteSource === 'clinical_budget' ? contract.quoteId : null,
      budgetId: contract.budgetId || null,
      patientId,
      user,
    }));
  }

  return packages.sort((a, b) => {
    const da = new Date(a.updatedAt || 0).getTime();
    const dbTs = new Date(b.updatedAt || 0).getTime();
    return dbTs - da;
  });
}
