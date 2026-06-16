import { Calendar, Download, Eye, FileText, RefreshCw, CheckCircle2 } from 'lucide-react';

import { formatCurrencyBRL } from '../../../utils/currency.js';

import { BudgetStatusBadge } from './BudgetStatusBadge.jsx';

import { ClinicalBtn } from '../ClinicalStageShell.jsx';

import { getPaymentOptionTitle } from './budgetEventLabels.js';

import { getPaymentCardPreview, formatPresentedAt } from './budgetCommercialUtils.js';

import { BudgetNextSteps } from './BudgetNextSteps.jsx';

import { BudgetHistoryPanel } from './BudgetHistoryPanel.jsx';



export function BudgetSummaryPanel({

  patientName,

  planName,

  professionalName,

  procedureCount,

  originalValue,

  discount,

  finalValue,

  validityDate,

  status,

  chosenOption,

  documents = [],

  events = [],

  nextSteps = [],

  onViewProcedures,

  onEditValidity,

  onGeneratePdf,

  onDownloadDocument,
  onOpenFullHistory,
  readOnly = false,
}) {

  const latestDoc = documents.length ? documents[documents.length - 1] : null;

  const chosenPreview = chosenOption

    ? getPaymentCardPreview(chosenOption, originalValue)

    : null;



  return (

    <aside className="budget-tab-summary budget-tab-summary--premium">

      <header className="budget-tab-summary-head">

        <h3>Resumo do orçamento</h3>

        <BudgetStatusBadge status={status} />

      </header>



      <dl className="budget-tab-summary-dl">

        <div><dt>Paciente</dt><dd>{patientName}</dd></div>

        <div><dt>Tratamento</dt><dd>{planName || '—'}</dd></div>

        <div><dt>Procedimentos</dt><dd>{procedureCount}</dd></div>

      </dl>



      <div className="budget-tab-summary-values">

        <div><span>Valor original</span><strong>{formatCurrencyBRL(originalValue)}</strong></div>

        {discount > 0 ? (

          <div className="is-discount">

            <span>Desconto</span><strong>- {formatCurrencyBRL(discount)}</strong>

          </div>

        ) : null}

        <div className="is-total">

          <span>Valor final</span><strong>{formatCurrencyBRL(finalValue)}</strong>

        </div>

        <div>

          <span>Validade</span>

          <strong>

            {validityDate

              ? new Date(`${validityDate}T12:00:00`).toLocaleDateString('pt-BR')

              : '—'}

          </strong>

        </div>

      </div>



      <div className="budget-tab-summary-actions">

        <ClinicalBtn variant="secondary" icon={Eye} onClick={onViewProcedures}>

          Ver procedimentos

        </ClinicalBtn>

        {!readOnly ? (

          <ClinicalBtn variant="ghost" icon={Calendar} onClick={onEditValidity}>

            Editar validade

          </ClinicalBtn>

        ) : null}

      </div>



      <section className="budget-tab-summary-section budget-tab-chosen-block">

        <h4>

          <CheckCircle2 size={15} />

          Condição escolhida pelo paciente

        </h4>

        {!chosenOption ? (

          <p className="budget-tab-muted">Nenhuma condição escolhida ainda.</p>

        ) : (

          <div className="budget-tab-chosen-card">

            <strong>{getPaymentOptionTitle(chosenOption)}</strong>

            <span className="budget-tab-chosen-highlight">{chosenPreview?.highlight}</span>

            {chosenPreview?.lines?.map((line) => (

              <span key={line.label} className="budget-tab-chosen-line">

                {line.label}: {line.value}

              </span>

            ))}

            {chosenOption.presentedAt ? (

              <em>Escolhida em {formatPresentedAt(chosenOption.presentedAt)}</em>

            ) : null}

          </div>

        )}

      </section>



      <BudgetNextSteps steps={nextSteps} />



      <section className="budget-tab-summary-section">

        <h4>Histórico rápido</h4>

        <BudgetHistoryPanel events={events} compact />
        {onOpenFullHistory ? (
          <button type="button" className="budget-tab-link-btn" onClick={onOpenFullHistory}>
            Ver histórico completo
          </button>
        ) : null}
      </section>



      <section className="budget-tab-summary-section">

        <h4><FileText size={14} /> Documentos</h4>

        {!latestDoc ? (

          <ClinicalBtn variant="secondary" icon={FileText} onClick={onGeneratePdf}>

            Gerar PDF

          </ClinicalBtn>

        ) : (

          <div className="budget-tab-doc-row">

            <div>

              <strong>PDF gerado</strong>

              <span className="budget-tab-muted">

                {latestDoc.createdAt

                  ? new Date(latestDoc.createdAt).toLocaleString('pt-BR')

                  : '—'}

              </span>

            </div>

            <div className="budget-tab-doc-btns">

              <ClinicalBtn variant="ghost" icon={Download} onClick={() => onDownloadDocument(latestDoc)}>

                Baixar

              </ClinicalBtn>

              <ClinicalBtn variant="ghost" icon={RefreshCw} onClick={onGeneratePdf}>

                Novo PDF

              </ClinicalBtn>

            </div>

          </div>

        )}

      </section>

    </aside>

  );

}

