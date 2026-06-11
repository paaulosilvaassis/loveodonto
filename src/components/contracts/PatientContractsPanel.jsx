import { useMemo } from 'react';
import { listPatientContracts } from '../../services/contractModuleService.js';
import { ContractTable, ContractStatusBadge, formatCtrCurrency } from '../../contracts/ui/ContractUi.jsx';

export default function PatientContractsPanel({ patientId }) {
  const contracts = useMemo(() => {
    if (!patientId) return [];
    return listPatientContracts(patientId);
  }, [patientId]);

  const rows = contracts.map((c) => ({
    id: c.id,
    number: c.contractNumber || c.id,
    title: c.title || 'Contrato',
    status: c.status,
    value: formatCtrCurrency(c.totalValueSnapshot),
    date: c.signedAt
      ? new Date(c.signedAt).toLocaleDateString('pt-BR')
      : c.generatedAt
        ? new Date(c.generatedAt).toLocaleDateString('pt-BR')
        : '—',
  }));

  return (
    <div className="tab-content">
      <h3>Contratos &amp; Consentimentos</h3>
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
        rows={rows}
        emptyMessage="Nenhum contrato vinculado a este paciente."
      />
    </div>
  );
}
