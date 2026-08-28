/**
 * Persistência VOID/SUPERSEDE/REISSUE dentro do withDb canônico.
 * Não copia evidência jurídica para a nova identidade.
 */
import { createId } from '../../services/helpers.js';
import { INITIAL_GENERATED_CONTRACT_VERSION } from '../generatedContractVersion.js';
import { LIFECYCLE_ACTIONS } from './constants.js';
import { normalizeContractLifecycleStatus } from './normalize.js';

export function applyVoidedContract(current, {
  actedAt,
  actorUserId,
  actorRole,
  actorName,
  reasonText,
  reasonCode,
}) {
  return {
    ...current,
    status: 'voided',
    voidedAt: actedAt,
    voidedBy: actorUserId,
    voidedByName: actorName || null,
    voidedByRole: actorRole || null,
    voidReason: reasonText,
    voidReasonCode: reasonCode || null,
    previousLifecycleState: normalizeContractLifecycleStatus(current.status),
  };
}

export function applySupersededContract(current, {
  actedAt,
  actorUserId,
  newContractId,
}) {
  return {
    ...current,
    status: 'superseded',
    supersededAt: actedAt,
    supersededBy: actorUserId,
    supersededByContractId: newContractId,
    replacedById: newContractId,
  };
}

export function nextContractNumber(db) {
  if (!db.contractSeqByClinic || typeof db.contractSeqByClinic !== 'object') {
    db.contractSeqByClinic = {};
  }
  const clinicId = db.clinicProfile?.id || 'clinic-1';
  const n = Number(db.contractSeqByClinic[clinicId] || 0) + 1;
  db.contractSeqByClinic[clinicId] = n;
  const year = new Date().getFullYear();
  return `CTR-${year}-${String(n).padStart(5, '0')}`;
}

export function buildSuccessorDraft(source, {
  newId,
  contractNumber,
  version,
  actedAt,
  actorUserId,
}) {
  const html = source.finalContent || source.renderedHtml || source.editedHtml || '';
  return {
    id: newId,
    clinicId: source.clinicId,
    tenant_id: source.tenant_id || source.tenantId || null,
    patientId: source.patientId,
    quoteId: source.quoteId,
    quoteSource: source.quoteSource,
    budgetId: source.budgetId || null,
    templateId: source.templateId || null,
    templateVersion: source.templateVersion || null,
    version,
    contractNumber,
    finalContent: html,
    renderedHtml: source.renderedHtml || html,
    pdfUrl: null,
    signedPdfUrl: null,
    signedAt: null,
    documentHash: null,
    status: 'draft',
    generatedBy: actorUserId,
    generatedAt: actedAt,
    previousContractId: source.id,
    parentContractId: source.id,
    rootContractId: source.rootContractId || source.previousContractId || source.id,
    metadata: {
      reissuedFromContractId: source.id,
      reissueAction: LIFECYCLE_ACTIONS.REISSUE,
    },
  };
}

export function allocateSuccessorIdentity(source) {
  const oldVersion = Number(source.version);
  const version = Number.isInteger(oldVersion) && oldVersion >= 1
    ? oldVersion + 1
    : INITIAL_GENERATED_CONTRACT_VERSION + 1;
  return {
    newId: createId('gctr'),
    version,
  };
}

export function successorExists(db, source) {
  const successorId = source.replacedById || source.supersededByContractId || null;
  if (!successorId) return null;
  return (db.generatedContracts || []).find((row) => row.id === successorId) || null;
}
