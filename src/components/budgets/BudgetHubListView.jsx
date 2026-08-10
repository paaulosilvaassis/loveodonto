import { FileSignature } from 'lucide-react';
import { formatCtrCurrency } from '../../contracts/ui/ContractUi.jsx';
import { BudgetHubStatusBadge } from './BudgetHubStatusBadge.jsx';
import { resolveRowPatientId, resolveRowPatientName } from '../../services/clinicalBudgetHubService.js';
import { labelOperationalUxStatus } from '../../contracts/operationalContractUi.js';
import { BUDGET_STATUS } from '../../services/clinicalBudgetConstants.js';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR');
}

export function BudgetHubListView({
  rows,
  canCreate,
  canViewFinance,
  onOpen,
  onPrint,
  onHistory,
  onContract,
  onGenerateContract,
  onFinance,
  onCreateNew,
}) {
  return (
    <div className="bhub-list">
      {rows.map((row) => {
        const currentPatientId = resolveRowPatientId(row);
        const patientLabel = resolveRowPatientName(row);
        const patientActionsDisabled = !currentPatientId;
        const contractAction = row.contractAction || {};
        const showGenerate = contractAction.action === 'generate'
          && row.status === BUDGET_STATUS.APROVADO
          && !row.contractId;
        const showContinue = ['continue', 'resolve'].includes(contractAction.action) && row.contractId;
        const showView = (contractAction.action === 'view' || row.contractId) && !showGenerate && !showContinue;

        return (
        <article key={`${row.id}-${row.archivedAt || 'current'}`} className="bhub-list-row">
          <div className="bhub-list-main">
            <strong className={patientActionsDisabled ? 'bhub-card-name--unknown' : undefined}>
              {patientLabel}
            </strong>
            <span>{row.planName || '—'}</span>
            <span className="bhub-list-muted">{row.budgetNumber}</span>
            {contractAction.uxStatus ? (
              <span className="bhub-list-muted" data-testid="budget-contract-status">
                {labelOperationalUxStatus(contractAction.uxStatus)}
              </span>
            ) : null}
          </div>
          <div className="bhub-list-value">{formatCtrCurrency(row.totalValue)}</div>
          <BudgetHubStatusBadge status={row.status} hasFinance={row.hasFinance} />
          <div className="bhub-list-meta">
            <span>{formatDate(row.displayDate)}</span>
            <span>{row.professionalName}</span>
          </div>
          <div className="bhub-list-flags">
            <span>{row.hasContract ? '✔ Contrato' : '✖ Contrato'}</span>
            <span>{row.hasFinance ? '✔ Financeiro' : '✖ Financeiro'}</span>
          </div>
          <div className="bhub-list-actions">
            {showGenerate ? (
              <button
                type="button"
                className="bhub-btn bhub-btn--sm bhub-btn--accent"
                data-testid="budget-generate-contract"
                onClick={() => onGenerateContract?.(row)}
              >
                <FileSignature size={12} /> Gerar contrato
              </button>
            ) : null}
            {showContinue ? (
              <button
                type="button"
                className="bhub-btn bhub-btn--sm bhub-btn--accent"
                data-testid="budget-continue-contract"
                onClick={() => onGenerateContract?.(row)}
              >
                {contractAction.label || 'Continuar'}
              </button>
            ) : null}
            {showView ? (
              <button
                type="button"
                className="bhub-btn bhub-btn--sm"
                data-testid="budget-view-contract"
                onClick={() => onContract(row)}
              >
                Ver contrato
              </button>
            ) : null}
            <button type="button" className="bhub-btn bhub-btn--sm" onClick={() => onOpen(row)}>Abrir</button>
            <button type="button" className="bhub-btn bhub-btn--sm" onClick={() => onPrint(row)}>PDF</button>
            {canViewFinance && (row.financingId || row.hasFinance) ? (
              <button
                type="button"
                className="bhub-btn bhub-btn--sm"
                onClick={() => onFinance(row)}
                disabled={patientActionsDisabled}
                title={patientActionsDisabled ? 'Paciente não identificado' : undefined}
              >
                Financeiro
              </button>
            ) : null}
            <button type="button" className="bhub-btn bhub-btn--sm" onClick={() => onHistory(row)}>Histórico</button>
            {canCreate && row.isLocked ? (
              <button
                type="button"
                className="bhub-btn bhub-btn--sm"
                onClick={() => onCreateNew(row)}
                disabled={patientActionsDisabled}
                title={patientActionsDisabled ? 'Paciente não identificado' : undefined}
              >
                Novo
              </button>
            ) : null}
          </div>
        </article>
        );
      })}
    </div>
  );
}
