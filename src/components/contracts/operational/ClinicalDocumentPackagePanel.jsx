/**
 * Visão clínica enxuta do pacote documental (piloto 10.18 — dentista/CRC).
 * Status por documento sem jargão de envelope técnico.
 */

import { buildDocumentPackageForBudget } from '../../../services/operationalContractWizardService.js';
import { listPackageDocumentStatuses } from '../../../services/tclePackageAttachmentService.js';
import { labelDocumentType } from '../../../contracts/operationalUxMessages.js';
import {
  labelOperationalUxStatus,
  resolveOperationalUxStatus,
} from '../../../contracts/operationalContractUi.js';

const STATUS_LABELS = {
  DRAFT: 'Rascunho',
  READY: 'Pronto',
  PENDING_SIGNATURE: 'Aguardando assinatura',
  SIGNED: 'Assinado',
  DECLINED: 'Recusado',
  CANCELLED: 'Cancelado',
};

export default function ClinicalDocumentPackagePanel({
  appointmentId,
  budgetId,
  patientId,
  contractStatus = null,
  compact = false,
  onOpenContracts = null,
  /** Snapshots assinados do manifesto (OPTION_C) — nunca template atual. */
  signedPackageDocuments = null,
  onOpenSignedDocument = null,
  onOpenEvidenceReport = null,
}) {
  if (!appointmentId || !budgetId) {
    return (
      <div className="ocw-clinical-package" data-testid="clinical-document-package">
        <p className="ocw-hint">Nenhum tratamento/orçamento vinculado para listar documentos.</p>
      </div>
    );
  }

  const pkg = buildDocumentPackageForBudget({ appointmentId, budgetId, patientId });
  const statuses = listPackageDocumentStatuses({ appointmentId, budgetId, patientId });
  const ux = resolveOperationalUxStatus({
    status: contractStatus || pkg.contractStatus,
    hasPendency: pkg.hasPendency && Boolean(pkg.contractId),
  });

  const rows = statuses.filter((i) => i.required || i.ready || i.id === 'image_optional').slice(0, 6);
  const signedDocs = Array.isArray(signedPackageDocuments) ? signedPackageDocuments : [];

  return (
    <section
      className={`ocw-clinical-package${compact ? ' is-compact' : ''}`}
      data-testid="clinical-document-package"
    >
      <header>
        <div>
          <h3>Documentos do tratamento</h3>
          <p>{pkg.treatmentName}</p>
        </div>
        <span className="ocw-clinical-status">{labelOperationalUxStatus(ux)}</span>
      </header>
      <ul>
        {rows.map((item) => (
          <li
            key={item.id}
            className={item.ready ? 'is-ready' : item.required ? 'is-missing' : 'is-optional'}
            data-testid={`package-doc-${item.documentType}`}
            data-status={item.status}
          >
            <span aria-hidden>{item.ready ? '✓' : item.required ? '!' : '○'}</span>
            <div>
              <strong>{item.label}</strong>
              <small>
                {labelDocumentType(item.documentType)}
                {item.required ? ' · Obrigatório' : ' · Opcional'}
                {' · '}
                {STATUS_LABELS[item.status] || item.status}
                {item.detail ? ` · ${item.detail}` : ''}
              </small>
            </div>
          </li>
        ))}
      </ul>
      {signedDocs.length > 0 ? (
        <div
          className="ocw-clinical-package__signed"
          data-testid="clinical-signed-documents"
        >
          <h4>Documentos assinados</h4>
          <ul>
            {signedDocs.map((doc) => (
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
          {onOpenEvidenceReport ? (
            <button
              type="button"
              className="button secondary small"
              data-testid="open-signed-evidence-report"
              onClick={onOpenEvidenceReport}
            >
              Comprovante
            </button>
          ) : null}
        </div>
      ) : null}
      {onOpenContracts ? (
        <button type="button" className="button secondary small" onClick={onOpenContracts}>
          Abrir contratos do atendimento
        </button>
      ) : null}
    </section>
  );
}
