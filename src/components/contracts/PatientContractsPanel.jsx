import { useMemo } from 'react';
import { listPatientContracts } from '../../services/contractModuleService.js';
import { listPatientBudgetHistory } from '../../services/clinicalBudgetLockService.js';
import { ContractTable, ContractStatusBadge, formatCtrCurrency } from '../../contracts/ui/ContractUi.jsx';
import { BudgetStatusBadge } from '../clinical/budget/BudgetStatusBadge.jsx';
import { formatFriendlyContractNumber } from '../../utils/friendlyNumbers.js';

export default function PatientContractsPanel({ patientId }) {
  const contracts = useMemo(() => {
    if (!patientId) return [];
    return listPatientContracts(patientId);
  }, [patientId]);

  const budgetHistory = useMemo(() => {
    if (!patientId) return [];
    return listPatientBudgetHistory(patientId);
  }, [patientId]);

  const contractRows = contracts.map((c, index) => ({
    id: c.id,
    number: formatFriendlyContractNumber(c.contractNumber, index + 1),
    title: c.title || 'Contrato',
    status: c.status,
    value: formatCtrCurrency(c.totalValueSnapshot),
    date: c.signedAt
      ? new Date(c.signedAt).toLocaleDateString('pt-BR')
      : c.generatedAt
        ? new Date(c.generatedAt).toLocaleDateString('pt-BR')
        : '—',
  }));

  const budgetRows = budgetHistory.map((b) => ({
    id: b.id,
    number: b.budgetNumber,
    status: b.status,
    contract: b.contractStatus,
    value: formatCtrCurrency(b.totalValue),
    date: new Date(b.archivedAt || b.createdAt || 0).toLocaleDateString('pt-BR'),
  }));

  return (
    <div className="tab-content patient-financial-history">
      <h3>Histórico de Orçamentos</h3>
      <p className="text-sm text-[var(--color-text-muted)] mb-3">
        Orçamentos vinculados a atendimentos deste paciente, incluindo versões arquivadas.
      </p>
      <ContractTable
        columns={[
          { key: 'number', label: 'Orçamento' },
          { key: 'status', label: 'Status', render: (r) => <BudgetStatusBadge status={r.status} /> },
          {
            key: 'contract',
            label: 'Contrato',
            render: (r) => (r.contract ? <ContractStatusBadge status={r.contract} /> : '—'),
          },
          { key: 'value', label: 'Valor' },
          { key: 'date', label: 'Data' },
        ]}
        rows={budgetRows}
        emptyMessage="Nenhum orçamento registrado para este paciente."
      />

      <h3 className="mt-6">Contratos &amp; Consentimentos</h3>
      <p className="text-sm text-[var(--color-text-muted)] mb-3">
        Documentos gerados a partir de orçamentos aprovados, com histórico de assinatura.
      </p>
      <ContractTable
        columns={[
          { key: 'number', label: 'Número' },
          { key: 'title', label: 'Documento' },
          { key: 'status', label: 'Status', render: (r) => <ContractStatusBadge status={r.status} /> },
          { key: 'value', label: 'Valor' },
          { key: 'date', label: 'Data' },
        ]}
        rows={contractRows}
        emptyMessage="Nenhum contrato vinculado a este paciente."
      />
    </div>
  );
}
