import { listDocumentRecords } from './documentService.js';
import { DOCUMENT_CATEGORIES } from '../utils/documentTemplates.js';

/** Mapeia templates da aba Documentos → Consentimentos para ids do registro TCLE. */
export const DOCUMENT_TEMPLATE_TO_TCLE_ID = {
  consent_implante: 'tcle_implante',
  consent_enxerto_osseo: 'tcle_implante',
  consent_enxerto_conjuntivo: 'tcle_implante',
  consent_exodontia: 'tcle_cirurgia',
  consent_ortodontia: 'tcle_ortodontia',
  consent_endodontia: 'tcle_endodontia',
  consent_toxina_botulinica: 'tcle_estetica',
};

export function mapDocumentTemplateToTcleId(templateKey) {
  return DOCUMENT_TEMPLATE_TO_TCLE_ID[templateKey] || null;
}

/**
 * TCLEs já registrados para o paciente na aba Documentos → Consentimentos.
 */
export function resolveAttachedTcleIdsFromClinicalDocuments({
  patientId,
  appointmentId = null,
} = {}) {
  if (!patientId) return [];

  const records = listDocumentRecords({
    patientId,
    category: DOCUMENT_CATEGORIES.CONSENTIMENTOS,
  });

  const scoped = appointmentId
    ? records.filter((row) => !row.appointmentId || row.appointmentId === appointmentId)
    : records;

  const ids = new Set();
  for (const row of scoped) {
    const fromTemplate = mapDocumentTemplateToTcleId(row.templateKey);
    if (fromTemplate) ids.add(fromTemplate);
    if (row.metadata?.tcleId) ids.add(row.metadata.tcleId);
  }
  return [...ids];
}

export function getTcleDocumentHint(tcleId) {
  const hints = {
    tcle_implante: 'Aba Documentos → Consentimentos → modelo "Implante" → Salvar documento.',
    tcle_ortodontia: 'Aba Documentos → Consentimentos → modelo "Ortodontia" → Salvar documento.',
    tcle_estetica: 'Aba Documentos → Consentimentos → modelo estético correspondente → Salvar documento.',
    tcle_clareamento: 'Aba Documentos → Consentimentos → termo de clareamento → Salvar documento.',
    tcle_cirurgia: 'Aba Documentos → Consentimentos → "Exodontia" ou cirurgia → Salvar documento.',
    tcle_endodontia: 'Aba Documentos → Consentimentos → "Endodontia" → Salvar documento.',
  };
  return hints[tcleId] || 'Aba Documentos → Consentimentos → salve o termo correspondente ao tratamento.';
}

/**
 * Mescla TCLEs já gravados no contrato com documentos clínicos atuais (fonte para assinatura).
 */
export function mergeContractAttachedTcleIds(contract, { patientId, appointmentId } = {}) {
  const refreshed = resolveAttachedTcleIdsFromClinicalDocuments({ patientId, appointmentId });
  return [...new Set([
    ...(contract?.metadata?.attachedTcleIds || []),
    ...refreshed,
  ])];
}
