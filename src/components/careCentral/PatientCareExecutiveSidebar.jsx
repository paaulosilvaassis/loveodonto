import { ClinicalBtn } from '../clinical/ClinicalStageShell.jsx';
import {
  formatExecutiveCurrency,
  formatExecutiveDate,
} from '../../services/patientCareExecutiveSummaryService.js';
import { FileText, FileSignature, DollarSign } from 'lucide-react';

export function PatientCareExecutiveSidebar({
  summary,
  onOpenBudget,
  onOpenContract,
  onOpenFinance,
}) {
  if (!summary) return null;

  return (
    <aside className="pci-executive-sidebar">
      <section className="pci-executive-block">
        <h3>Resumo executivo</h3>
        <dl className="pci-executive-dl">
          <div><dt>Paciente</dt><dd>{summary.patientName}</dd></div>
          <div><dt>Primeira consulta</dt><dd>{formatExecutiveDate(summary.firstConsultationDate)}</dd></div>
          <div><dt>Último atendimento</dt><dd>{formatExecutiveDate(summary.lastAppointmentDate)}</dd></div>
          <div><dt>Dentista responsável</dt><dd>{summary.responsibleDentist}</dd></div>
          <div><dt>Tratamento</dt><dd>{summary.treatmentName}</dd></div>
          <div><dt>Situação</dt><dd>{summary.situation}</dd></div>
        </dl>
      </section>

      {summary.activeBudget ? (
        <section className="pci-executive-block pci-executive-block--budget">
          <h4>Orçamento ativo</h4>
          <p className="pci-executive-highlight">{summary.activeBudget.label}</p>
          <dl className="pci-executive-dl compact">
            <div><dt>Valor</dt><dd>{formatExecutiveCurrency(summary.activeBudget.value)}</dd></div>
            <div><dt>Status</dt><dd>{summary.activeBudget.status}</dd></div>
          </dl>
          <ClinicalBtn variant="ghost" icon={FileText} onClick={onOpenBudget}>
            Abrir orçamento
          </ClinicalBtn>
        </section>
      ) : null}

      {summary.activeContract ? (
        <section className="pci-executive-block pci-executive-block--contract">
          <h4>Contrato</h4>
          <p className="pci-executive-highlight">{summary.activeContract.label}</p>
          <dl className="pci-executive-dl compact">
            <div><dt>Status</dt><dd>{summary.activeContract.status}</dd></div>
          </dl>
          <ClinicalBtn variant="ghost" icon={FileSignature} onClick={onOpenContract}>
            Abrir contrato
          </ClinicalBtn>
        </section>
      ) : null}

      <section className="pci-executive-block pci-executive-block--finance">
        <h4>Financeiro</h4>
        <dl className="pci-executive-dl compact">
          <div><dt>Total contratado</dt><dd>{formatExecutiveCurrency(summary.financial.totalContracted)}</dd></div>
          <div><dt>Pago</dt><dd>{formatExecutiveCurrency(summary.financial.totalPaid)}</dd></div>
          <div><dt>Em aberto</dt><dd>{formatExecutiveCurrency(summary.financial.totalOpen)}</dd></div>
          <div><dt>Parcelas vencidas</dt><dd>{summary.financial.overdueCount}</dd></div>
        </dl>
        <span className={`pci-finance-badge${summary.financial.isDelinquent ? ' is-delinquent' : ' is-compliant'}`}>
          {summary.financial.statusLabel}
        </span>
        <ClinicalBtn variant="ghost" icon={DollarSign} onClick={onOpenFinance}>
          Abrir financeiro
        </ClinicalBtn>
      </section>
    </aside>
  );
}
