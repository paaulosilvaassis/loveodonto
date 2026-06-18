import { useMemo } from 'react';
import { useAuth } from '../../auth/useAuth.js';
import { getContractDashboard } from '../../services/contractDashboardService.js';
import { ContractKpiGrid, ContractTable, formatCtrCurrency, ContractStatusBadge } from '../../contracts/ui/ContractUi.jsx';
import { formatFriendlyContractNumber } from '../../utils/friendlyNumbers.js';

export default function ContractsDashboardPage() {
  const { user } = useAuth();
  const data = useMemo(() => getContractDashboard(user), [user]);

  const kpiItems = [
    { key: 'gerados', label: 'Contratos gerados', value: data.kpis.gerados, variant: 'primary' },
    { key: 'pendentes', label: 'Pendentes de assinatura', value: data.kpis.pendentes, variant: 'warning' },
    { key: 'assinados', label: 'Assinados', value: data.kpis.assinados, variant: 'success' },
    { key: 'vencidos', label: 'Vencidos', value: data.kpis.vencidos, variant: 'danger' },
    { key: 'recusados', label: 'Recusados', value: data.kpis.recusados, variant: 'danger' },
    { key: 'valor', label: 'Valor protegido', value: formatCtrCurrency(data.kpis.valorProtegido), variant: 'revenue' },
  ];

  const recentRows = data.recentContracts.map((c, index) => ({
    id: c.id,
    number: formatFriendlyContractNumber(c.contractNumber, index + 1),
    patient: c.patientSnapshotJson?.full_name || c.patientId,
    status: c.status,
    value: formatCtrCurrency(c.totalValueSnapshot),
  }));

  return (
    <div className="ctr-page">
      <ContractKpiGrid items={kpiItems} />
      {data.alerts.length > 0 && (
        <section className="ctr-alerts">
          {data.alerts.map((a, i) => (
            <div key={i} className={`ctr-alert ctr-alert--${a.type}`}>{a.message}</div>
          ))}
        </section>
      )}
      <section className="ctr-section">
        <h2 className="ctr-section-title">Contratos recentes</h2>
        <ContractTable
          columns={[
            { key: 'number', label: 'Número' },
            { key: 'patient', label: 'Paciente' },
            { key: 'status', label: 'Status', render: (r) => <ContractStatusBadge status={r.status} /> },
            { key: 'value', label: 'Valor' },
          ]}
          rows={recentRows}
          emptyMessage="Nenhum contrato gerado ainda. Aprove um orçamento e use Gerar contrato."
        />
      </section>
      <div className="ctr-section-grid">
        <section className="ctr-section">
          <h2 className="ctr-section-title">Por profissional</h2>
          <ContractTable
            columns={[
              { key: 'name', label: 'Profissional' },
              { key: 'count', label: 'Contratos' },
            ]}
            rows={data.byProfessional.map((r, i) => ({ id: i, ...r }))}
            emptyMessage="Sem dados."
          />
        </section>
        <section className="ctr-section">
          <h2 className="ctr-section-title">Por tratamento</h2>
          <ContractTable
            columns={[
              { key: 'name', label: 'Tratamento' },
              { key: 'count', label: 'Contratos' },
            ]}
            rows={data.byTreatment.map((r, i) => ({ id: i, ...r }))}
            emptyMessage="Sem dados."
          />
        </section>
      </div>
    </div>
  );
}
