import { CheckCircle2, Clock, MessageSquare, History } from 'lucide-react';
import { formatCurrencyBRL } from '../../../utils/currency.js';
import { BudgetStatusBadge } from './BudgetStatusBadge.jsx';
import { BudgetHistoryPanel } from './BudgetHistoryPanel.jsx';
import { BudgetDocumentsPanel } from './BudgetDocumentsPanel.jsx';
import {
  getPaymentCardPreview,
  formatPresentedAt,
  chosenStatusLabel,
} from './budgetCommercialUtils.js';
import { getPresentedPaymentOptions } from './budgetPaymentPdfUtils.js';
import { getPaymentOptionTitle } from './budgetEventLabels.js';

export function BudgetNegotiationSidebar({
  budget,
  financials,
  events,
  originalValue,
  onNotesChange,
  onGeneratePdf,
  onViewDocument,
  onDownloadDocument,
  readOnly,
}) {
  const presented = getPresentedPaymentOptions(budget);
  const chosen = financials?.accepted;

  return (
    <aside className="clinical-budget-col clinical-budget-col--negotiation">
      <header className="clinical-budget-col-head">
        <MessageSquare size={16} />
        <h3>Negociação</h3>
      </header>

      <section className="clinical-budget-negotiation-block">
        <h4>Condições apresentadas</h4>
        {presented.length === 0 ? (
          <p className="clinical-budget-negotiation-empty">
            Nenhuma condição apresentada ao paciente ainda.
          </p>
        ) : (
          <ul className="clinical-budget-negotiation-list">
            {presented.map((opt) => {
              const preview = getPaymentCardPreview(opt, originalValue);
              const when = formatPresentedAt(opt.presentedAt);
              return (
                <li key={opt.id} className="clinical-budget-negotiation-item">
                  <strong>{preview.headline}</strong>
                  <span className="clinical-budget-negotiation-value">{preview.highlight}</span>
                  <div className="clinical-budget-negotiation-fin-lines">
                    {preview.lines.map((line) => (
                      <span
                        key={line.label}
                        className={line.emphasis ? `is-${line.emphasis}` : ''}
                      >
                        {line.label}: <strong>{line.value}</strong>
                      </span>
                    ))}
                  </div>
                  {when ? (
                    <span className="clinical-budget-negotiation-meta">
                      <Clock size={11} />
                      Apresentado em {when}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="clinical-budget-negotiation-block">
        <h4>Condição escolhida pelo paciente</h4>
        {!chosen ? (
          <p className="clinical-budget-negotiation-empty">
            Aguardando escolha do paciente.
          </p>
        ) : (
          <div className="clinical-budget-negotiation-chosen">
            <span className="clinical-budget-negotiation-chosen-icon">
              <CheckCircle2 size={18} />
            </span>
            <div>
              <strong>{getPaymentOptionTitle(chosen)}</strong>
              <span>{getPaymentCardPreview(chosen, originalValue).highlight}</span>
              {chosen.type === 'financiamento' ? (
                <div className="clinical-budget-negotiation-fin-lines">
                  {getPaymentCardPreview(chosen, originalValue).lines.map((line) => (
                    <span key={line.label} className={line.emphasis ? `is-${line.emphasis}` : ''}>
                      {line.label}: <strong>{line.value}</strong>
                    </span>
                  ))}
                </div>
              ) : null}
              <span className="clinical-budget-negotiation-status">
                {chosenStatusLabel(budget)}
              </span>
            </div>
          </div>
        )}
      </section>

      <section className="clinical-budget-negotiation-block clinical-budget-negotiation-block--inline">
        <div>
          <span>Status do orçamento</span>
          <BudgetStatusBadge status={budget?.status} />
        </div>
        <div>
          <span>Valor fechado</span>
          <strong>{formatCurrencyBRL(financials?.finalValue || 0)}</strong>
        </div>
        {budget?.financingId ? (
          <div>
            <span>Financiamento</span>
            <strong>Vinculado</strong>
          </div>
        ) : null}
      </section>

      <section className="clinical-budget-negotiation-block">
        <h4><History size={14} /> Histórico comercial</h4>
        <BudgetHistoryPanel events={events} compact />
      </section>

      <label className="clinical-budget-col-field clinical-budget-col-field--notes">
        <span>Observações comerciais</span>
        <textarea
          rows={3}
          value={budget?.commercialNotes || ''}
          onChange={(e) => onNotesChange(e.target.value)}
          disabled={readOnly}
          placeholder="Registre objeções, preferências e acordos verbais…"
        />
      </label>

      <section className="clinical-budget-negotiation-docs">
        <BudgetDocumentsPanel
          documents={budget?.documents || []}
          onGenerate={onGeneratePdf}
          onView={onViewDocument}
          onDownload={onDownloadDocument}
          compact
        />
      </section>
    </aside>
  );
}
