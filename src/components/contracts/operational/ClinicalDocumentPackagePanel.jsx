/**
 * Visão clínica enxuta do pacote documental.
 * Wave A: delega ao Painel Pacote jurídico (mesmo ViewModel).
 */

import React from 'react';
import LegalPackagePanel from '../legal/LegalPackagePanel.jsx';

export default function ClinicalDocumentPackagePanel({
  appointmentId,
  budgetId,
  patientId,
  user = null,
  compact = false,
  onOpenContracts = null,
  onOpenCeremony = null,
  onViewDocument = null,
  onDownloadPdf = null,
  onOpenEvidence = null,
  onRefresh = null,
  onNavigateProntuario = null,
  toast = null,
  signedPackageDocuments = null,
  onOpenSignedDocument = null,
  onOpenEvidenceReport = null,
}) {
  return (
    <div data-testid="clinical-document-package">
      <LegalPackagePanel
        appointmentId={appointmentId}
        budgetId={budgetId}
        patientId={patientId}
        user={user}
        compact={compact}
        onOpenCeremony={onOpenCeremony || onOpenContracts}
        onViewDocument={onViewDocument || onOpenSignedDocument}
        onDownloadPdf={onDownloadPdf}
        onOpenEvidence={onOpenEvidence || onOpenEvidenceReport}
        onRefresh={onRefresh}
        onNavigateProntuario={onNavigateProntuario}
        toast={toast}
      />
      {Array.isArray(signedPackageDocuments) && signedPackageDocuments.length > 0 ? (
        <div className="ocw-clinical-package__signed" data-testid="clinical-signed-documents">
          <h4>Documentos assinados</h4>
          <ul>
            {signedPackageDocuments.map((doc) => (
              <li key={doc.documentKey || doc.id}>
                <strong>{doc.title || doc.documentKey}</strong>
                {onOpenSignedDocument ? (
                  <button
                    type="button"
                    className="button secondary small"
                    data-testid={`open-signed-${doc.documentKey}`}
                    onClick={() => onOpenSignedDocument(doc)}
                  >
                    Abrir
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
