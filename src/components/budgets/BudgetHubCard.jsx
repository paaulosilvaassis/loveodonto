import {
  User,
  Stethoscope,
  Calendar,
  FileSignature,
  Wallet,
  Clock,
  ArrowRight,
  Printer,
  History,
  Plus,
  DollarSign,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatCtrCurrency } from '../../contracts/ui/ContractUi.jsx';
import { BudgetHubStatusBadge } from './BudgetHubStatusBadge.jsx';
import { resolveRowPatientId, resolveRowPatientName } from '../../services/clinicalBudgetHubService.js';

function getInitials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'P';
}

function BoolFlag({ ok, yesLabel, noLabel }) {
  return (
    <span className={`bhub-flag${ok ? ' is-yes' : ' is-no'}`}>
      {ok ? '✔' : '✖'} {ok ? yesLabel : noLabel}
    </span>
  );
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR');
}

export function BudgetHubCard({
  row,
  canCreate,
  canViewFinance,
  onOpen,
  onPrint,
  onHistory,
  onContract,
  onFinance,
  onCreateNew,
}) {
  const currentPatientId = resolveRowPatientId(row);
  const patientLabel = resolveRowPatientName(row);
  const patientActionsDisabled = !currentPatientId;

  return (
    <article className="bhub-card">
      <header className="bhub-card-head">
        <div className="bhub-card-patient">
          <span className="bhub-card-avatar" aria-hidden>{getInitials(patientLabel)}</span>
          <div>
            {currentPatientId ? (
              <Link to={`/pacientes/cadastro/${currentPatientId}?tab=contratos`} className="bhub-card-name">
                {patientLabel}
              </Link>
            ) : (
              <strong className="bhub-card-name bhub-card-name--unknown">{patientLabel}</strong>
            )}
            <span className="bhub-card-phone">{row.patientPhone || '—'}</span>
          </div>
        </div>
        <BudgetHubStatusBadge status={row.status} hasFinance={row.hasFinance} />
      </header>

      <div className="bhub-card-body">
        <div className="bhub-card-row">
          <Stethoscope size={14} aria-hidden />
          <span>{row.planName || 'Tratamento não informado'}</span>
        </div>
        <div className="bhub-card-value">{formatCtrCurrency(row.totalValue)}</div>
        <div className="bhub-card-meta-grid">
          <div><Calendar size={13} /> {formatDate(row.displayDate)}</div>
          <div><User size={13} /> {row.professionalName}</div>
          <div><Clock size={13} /> Validade: {formatDate(row.validityDate)}</div>
          <div><FileSignature size={13} /> {row.budgetNumber}</div>
        </div>
        {row.installmentLabel ? (
          <p className="bhub-card-installment">{row.installmentLabel}</p>
        ) : null}
        <div className="bhub-card-flags">
          <BoolFlag ok={row.hasContract} yesLabel="Contrato gerado" noLabel="Sem contrato" />
          <BoolFlag ok={row.hasFinance} yesLabel="Financeiro gerado" noLabel="Financeiro pendente" />
        </div>
        <p className="bhub-card-next">
          <ArrowRight size={14} />
          {row.nextAction}
        </p>
      </div>

      <footer className="bhub-card-actions">
        <button type="button" className="bhub-btn bhub-btn--primary" onClick={() => onOpen(row)}>
          Abrir orçamento
        </button>
        <button type="button" className="bhub-btn" onClick={() => onPrint(row)}>
          <Printer size={14} /> Imprimir PDF
        </button>
        {row.contractId ? (
          <button type="button" className="bhub-btn" onClick={() => onContract(row)}>
            <FileSignature size={14} /> Ver contrato
          </button>
        ) : null}
        {canViewFinance && (row.financingId || row.hasFinance) ? (
          <button
            type="button"
            className="bhub-btn"
            onClick={() => onFinance(row)}
            disabled={patientActionsDisabled}
            title={patientActionsDisabled ? 'Paciente não identificado' : undefined}
          >
            <DollarSign size={14} /> Ver financeiro
          </button>
        ) : null}
        <button type="button" className="bhub-btn" onClick={() => onHistory(row)}>
          <History size={14} /> Histórico
        </button>
        {canCreate && row.isLocked ? (
          <button
            type="button"
            className="bhub-btn"
            onClick={() => onCreateNew(row)}
            disabled={patientActionsDisabled}
            title={patientActionsDisabled ? 'Paciente não identificado' : undefined}
          >
            <Plus size={14} /> Novo orçamento
          </button>
        ) : null}
      </footer>
    </article>
  );
}
