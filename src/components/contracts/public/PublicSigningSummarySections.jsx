/**
 * Seções de resumo para assinatura pública (C1) — mobile-first, tipografia grande.
 */

import React from 'react';
import { resetConsentAcceptanceMap } from '../../../contracts/publicSigningSummary.js';

function MoneyRow({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="ctr-public-summary-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function PublicSigningStepIndicator({ current = 1, total = 4 }) {
  const labels = ['Resumo', 'Documento', 'Privacidade', 'Assinar'];
  return (
    <ol className="ctr-public-steps" aria-label="Etapas da assinatura">
      {labels.slice(0, total).map((label, index) => {
        const n = index + 1;
        const state = n < current ? 'done' : n === current ? 'current' : 'todo';
        return (
          <li key={label} className={`ctr-public-steps-item is-${state}`}>
            <span className="ctr-public-steps-num" aria-hidden>{n}</span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function PublicSigningTreatmentSection({ treatment }) {
  if (!treatment) return null;
  return (
    <section className="ctr-public-summary-card" data-testid="public-sign-treatment">
      <h2>Resumo do seu tratamento</h2>
      {treatment.name ? <p className="ctr-public-summary-lead">{treatment.name}</p> : null}
      {treatment.procedures?.length ? (
        <div>
          <h3>Procedimentos</h3>
          <ul>
            {treatment.procedures.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {treatment.teethRegions?.length ? (
        <p><strong>Dentes/regiões:</strong> {treatment.teethRegions.join(', ')}</p>
      ) : null}
      {treatment.quantity != null ? (
        <p><strong>Quantidade:</strong> {treatment.quantity}</p>
      ) : null}
      {treatment.notes ? (
        <p><strong>Observações:</strong> {treatment.notes}</p>
      ) : null}
      {treatment.professionalName ? (
        <p><strong>Profissional responsável:</strong> {treatment.professionalName}</p>
      ) : null}
    </section>
  );
}

export function PublicSigningFinancialSection({ financial }) {
  if (!financial) return null;
  return (
    <section className="ctr-public-summary-card" data-testid="public-sign-financial">
      <h2>Condições financeiras</h2>
      <MoneyRow label="Valor total" value={financial.total} />
      <MoneyRow label="Entrada" value={financial.downPayment} />
      <MoneyRow label="Saldo" value={financial.balance} />
      {financial.installmentCount != null ? (
        <MoneyRow label="Parcelas" value={`${financial.installmentCount}x`} />
      ) : null}
      <MoneyRow label="Valor das parcelas" value={financial.installmentValue} />
      {financial.paymentMethod ? (
        <MoneyRow label="Forma de pagamento" value={financial.paymentMethod} />
      ) : null}
      {financial.firstDueDate ? (
        <MoneyRow label="Vencimento inicial" value={financial.firstDueDate} />
      ) : null}
      <p className="ctr-public-summary-note">
        Os valores acima são do contrato e não são recalculados nesta tela.
      </p>
    </section>
  );
}

export function PublicSigningPrivacySection({
  privacy,
  acceptance,
  onChange,
}) {
  const map = acceptance || resetConsentAcceptanceMap(privacy);
  return (
    <section className="ctr-public-summary-card" data-testid="public-sign-privacy">
      <h2>Privacidade e consentimentos</h2>
      <p className="ctr-public-lgpd">{privacy?.lgpdNotice}</p>

      {(privacy?.requiredConsents || []).length ? (
        <div className="ctr-public-consent-group">
          <h3>Consentimentos obrigatórios</h3>
          {(privacy.requiredConsents || []).map((c) => (
            <label key={c.id} className="ctr-public-consent">
              <input
                type="checkbox"
                checked={Boolean(map[c.id])}
                onChange={(e) => onChange?.(c.id, e.target.checked)}
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      ) : null}

      {(privacy?.optionalConsents || []).length ? (
        <div className="ctr-public-consent-group">
          <h3>Consentimentos opcionais</h3>
          {(privacy.optionalConsents || []).map((c) => (
            <label key={c.id} className="ctr-public-consent">
              <input
                type="checkbox"
                checked={Boolean(map[c.id])}
                onChange={(e) => onChange?.(c.id, e.target.checked)}
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function PublicSigningDocumentCta({ onOpenDocument, busy = false }) {
  return (
    <button
      type="button"
      className="button secondary ctr-public-doc-cta"
      data-testid="public-sign-view-document"
      onClick={onOpenDocument}
      disabled={busy}
    >
      Visualizar documento completo
    </button>
  );
}
