/**
 * Visão clínica enxuta do pacote documental (piloto 10.18 — dentista/CRC).
 * Sem jargão administrativo excessivo.
 */

import { buildDocumentPackageForBudget } from '../../../services/operationalContractWizardService.js';
import { labelDocumentType } from '../../../contracts/operationalUxMessages.js';
import {
  labelOperationalUxStatus,
  resolveOperationalUxStatus,
} from '../../../contracts/operationalContractUi.js';

export default function ClinicalDocumentPackagePanel({
  appointmentId,
  budgetId,
  patientId,
  contractStatus = null,
  compact = false,
  onOpenContracts = null,
}) {
  if (!appointmentId || !budgetId) {
    return (
      <div className="ocw-clinical-package" data-testid="clinical-document-package">
        <p className="ocw-hint">Nenhum tratamento/orçamento vinculado para listar documentos.</p>
      </div>
    );
  }

  const pkg = buildDocumentPackageForBudget({ appointmentId, budgetId, patientId });
  const ux = resolveOperationalUxStatus({
    status: contractStatus || pkg.contractStatus,
    hasPendency: pkg.hasPendency && Boolean(pkg.contractId),
  });

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
        {pkg.items.filter((i) => i.required || i.ready || i.id === 'image_optional').slice(0, 6).map((item) => (
          <li key={item.id} className={item.ready ? 'is-ready' : item.required ? 'is-missing' : 'is-optional'}>
            <span aria-hidden>{item.ready ? '✓' : item.required ? '!' : '○'}</span>
            <div>
              <strong>{item.label}</strong>
              <small>
                {labelDocumentType(item.documentType)}
                {item.required ? ' · Obrigatório' : ' · Opcional'}
              </small>
            </div>
          </li>
        ))}
      </ul>
      {onOpenContracts ? (
        <button type="button" className="button secondary small" onClick={onOpenContracts}>
          Abrir contratos do atendimento
        </button>
      ) : null}
    </section>
  );
}
