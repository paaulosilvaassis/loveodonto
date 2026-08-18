/**
 * Aba Contratos e consentimentos do prontuário real.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { listPatientLegalPackages } from '../../contracts/legalPackageViewModel.js';
import { openLegalPackage } from '../../contracts/legalPackageNavigation.js';

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return '—';
  }
}

export default function PatientLegalPackagesTab({
  patientId,
  user = null,
  onViewDocument = null,
  onDownloadPdf = null,
  onOpenEvidence = null,
}) {
  const navigate = useNavigate();
  const packages = listPatientLegalPackages({ patientId, user });

  if (!packages.length) {
    return (
      <div className="patient-legal-packages" data-testid="patient-legal-packages-empty">
        <p>Nenhum contrato ou consentimento registrado para este paciente.</p>
      </div>
    );
  }

  return (
    <div className="patient-legal-packages" data-testid="patient-legal-packages">
      {packages.map((pkg) => (
        <article
          key={pkg.packageId}
          className="patient-legal-packages__card"
          data-testid="patient-legal-package-card"
        >
          <header>
            <div>
              <h3>{pkg.treatmentName}</h3>
              <p>
                Orçamento {pkg.budgetNumber || pkg.budgetId || '—'}
                {' · '}
                {formatWhen(pkg.updatedAt)}
              </p>
            </div>
            <span>{pkg.packageStatusLabel}</span>
          </header>
          <ul>
            {pkg.documents.map((doc) => (
              <li
                key={doc.id}
                data-testid={`prontuario-doc-${doc.documentType}`}
                data-locked={doc.locked ? 'true' : 'false'}
              >
                <div>
                  <strong>{doc.title}</strong>
                  <small>
                    {doc.documentType}
                    {' · '}
                    v{doc.version}
                    {' · '}
                    {doc.statusLabel}
                    {doc.signed ? ' · Assinado' : ''}
                    {doc.locked ? ' · Locked' : ''}
                    {' · '}
                    {formatWhen(doc.date)}
                  </small>
                </div>
                <div className="patient-legal-packages__doc-actions">
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() => onViewDocument?.(doc, pkg)}
                  >
                    Visualizar
                  </button>
                  {pkg.permissions.canDownloadPdf ? (
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => onDownloadPdf?.(doc, pkg)}
                    >
                      Abrir PDF
                    </button>
                  ) : null}
                  {pkg.permissions.canViewEvidence && (doc.signed || pkg.signed) ? (
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => onOpenEvidence?.(pkg)}
                    >
                      Ver evidências
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="button primary small"
            data-testid="prontuario-open-package"
            onClick={() => openLegalPackage(navigate, {
              appointmentId: pkg.appointmentId,
              budgetId: pkg.budgetId,
              patientId: pkg.patientId,
              contractId: pkg.contractId,
            })}
          >
            Abrir pacote
          </button>
        </article>
      ))}
    </div>
  );
}
