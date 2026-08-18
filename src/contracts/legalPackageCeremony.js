/**
 * Documentos da cerimônia pública a partir do ViewModel operacional.
 * Reutiliza PublicPackageManifestDocuments. Não cria criptografia nova.
 * Se houver manifesto V2/staging, ele permanece a prova OPTION_C.
 */

import { buildContractPackageViewModel } from './legalPackageViewModel.js';

export function buildLegalPackageCeremonyDocuments(viewModel) {
  if (!viewModel?.documents?.length) return [];
  return viewModel.documents
    .filter((doc) => doc.required || doc.ready)
    .filter((doc) => doc.operationalType !== 'ANNEX')
    .map((doc) => ({
      id: doc.id,
      documentKey: doc.documentKey || doc.operationalType,
      title: doc.title,
      required: doc.required,
      snapshotHtml: doc.snapshotHtml || '<p>(conteúdo indisponível)</p>',
      documentType: doc.documentType,
      documentVersion: doc.version,
      operationalType: doc.operationalType,
    }));
}

export function buildLegalPackageCeremonyFromContract(contract) {
  if (!contract) return [];
  const vm = buildContractPackageViewModel({
    appointmentId: contract.quoteSource === 'clinical_budget' ? contract.quoteId : null,
    budgetId: contract.budgetId || null,
    patientId: contract.patientId || null,
  });
  return buildLegalPackageCeremonyDocuments(vm);
}

export function ceremonyIncludesLgpd(documents = []) {
  return documents.some((d) => (
    d.documentType === 'LGPD_TERM'
    || d.operationalType === 'LGPD'
    || d.documentKey === 'lgpd'
    || d.id === 'lgpd'
  ));
}
