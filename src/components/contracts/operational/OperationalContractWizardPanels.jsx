/**
 * Painéis auxiliares do wizard operacional (Phase 10.21M).
 */

import {
  labelDocumentType,
} from '../../../contracts/operationalUxMessages.js';

export function PackageChecklist({ documentPackage }) {
  if (!documentPackage) return null;
  return (
    <div className="ocw-package" data-testid="document-package">
      <h3>Pacote documental</h3>
      <ul>
        {documentPackage.items.map((item) => (
          <li key={item.id} className={item.ready ? 'is-ready' : item.required ? 'is-missing' : 'is-optional'}>
            <span aria-hidden>{item.ready ? '✓' : item.required ? '!' : '○'}</span>
            <div>
              <strong>{item.label}</strong>
              <small>
                {labelDocumentType(item.documentType)}
                {item.required ? ' · Obrigatório' : ' · Opcional'}
                {item.detail ? ` · ${item.detail}` : ''}
              </small>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function InfoRow({ label, value }) {
  if (value == null || value === '' || value === '—') return null;
  return (
    <div className="ocw-info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function FinancialSummary({ financial, testId = 'ocw-financial-summary' }) {
  if (!financial) return null;
  const parcelLabel = financial.installmentCount != null && financial.installmentValueLabel
    ? `${financial.installmentCount} × ${financial.installmentValueLabel}`
    : null;
  return (
    <div className="ocw-financial-summary" data-testid={testId}>
      <InfoRow label="Valor total" value={financial.totalLabel} />
      <InfoRow label="Entrada" value={financial.downPaymentLabel} />
      <InfoRow label="Saldo" value={financial.balanceLabel} />
      {financial.installmentCount != null ? (
        <InfoRow label="Número de parcelas" value={String(financial.installmentCount)} />
      ) : null}
      <InfoRow label="Valor de cada parcela" value={financial.installmentValueLabel} />
      {parcelLabel ? <InfoRow label="Parcelas" value={parcelLabel} /> : null}
      <InfoRow label="Forma de pagamento" value={financial.paymentMethod || financial.installmentLabel} />
    </div>
  );
}

export function FinalizePrerequisitesPanel({ prerequisites, onAction }) {
  if (!prerequisites || prerequisites.ok || !prerequisites.items?.length) return null;
  return (
    <div className="ocw-prereq" data-testid="ocw-finalize-prerequisites" role="status">
      <h4>Antes de finalizar, complete:</h4>
      <ul>
        {prerequisites.items.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{item.label}</strong>
              {item.hint ? <small>{item.hint}</small> : null}
            </div>
            <button
              type="button"
              className="button secondary ocw-prereq-cta"
              data-testid={`ocw-prereq-cta-${item.action}`}
              onClick={() => onAction?.(item)}
            >
              {item.ctaLabel}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
