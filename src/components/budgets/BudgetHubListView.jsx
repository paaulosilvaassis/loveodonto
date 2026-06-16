import { formatCtrCurrency } from '../../contracts/ui/ContractUi.jsx';
import { BudgetHubStatusBadge } from './BudgetHubStatusBadge.jsx';
import { resolveRowPatientId, resolveRowPatientName } from '../../services/clinicalBudgetHubService.js';

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
  onFinance,
  onCreateNew,
}) {
  return (
    <div className="bhub-list">
      {rows.map((row) => {
        const currentPatientId = resolveRowPatientId(row);
        const patientLabel = resolveRowPatientName(row);
        const patientActionsDisabled = !currentPatientId;

        return (
        <article key={`${row.id}-${row.archivedAt || 'current'}`} className="bhub-list-row">
          <div className="bhub-list-main">
            <strong className={patientActionsDisabled ? 'bhub-card-name--unknown' : undefined}>
              {patientLabel}
            </strong>
            <span>{row.planName || '—'}</span>
            <span className="bhub-list-muted">{row.budgetNumber}</span>
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
            <button type="button" className="bhub-btn bhub-btn--sm" onClick={() => onOpen(row)}>Abrir</button>
            <button type="button" className="bhub-btn bhub-btn--sm" onClick={() => onPrint(row)}>PDF</button>
            {row.contractId ? (
              <button type="button" className="bhub-btn bhub-btn--sm" onClick={() => onContract(row)}>Contrato</button>
            ) : null}
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
