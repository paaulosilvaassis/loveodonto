import { useMemo } from 'react';
import { getConvenioDashboard } from '../../services/convenioDashboardService.js';
import { useConvenioTenant } from '../../convenios/hooks/useConvenioTenant.js';
import { ConvenioKpiGrid, ConvenioTable, formatConvCurrency } from '../../convenios/ui/ConvenioUi.jsx';

export default function ConveniosDashboardPage() {
  const tenantId = useConvenioTenant();
  const dashboard = useMemo(() => getConvenioDashboard(tenantId), [tenantId]);

  const kpiItems = [
    { key: 'ativos', label: 'Convênios ativos', value: dashboard.kpis.conveniosAtivos, variant: 'primary' },
    { key: 'pacientes', label: 'Pacientes conveniados', value: dashboard.kpis.pacientesConveniados, variant: 'info' },
    { key: 'emitidas', label: 'Guias emitidas', value: dashboard.kpis.guiasEmitidas, variant: 'success' },
    { key: 'pendentes', label: 'Guias pendentes', value: dashboard.kpis.guiasPendentes, variant: 'warning' },
    { key: 'faturadas', label: 'Guias faturadas', value: dashboard.kpis.guiasFaturadas, variant: 'success' },
    { key: 'glosas', label: 'Glosas abertas', value: dashboard.kpis.glosasAbertas, variant: 'danger' },
    { key: 'prevista', label: 'Receita prevista', value: formatConvCurrency(dashboard.kpis.receitaPrevista), variant: 'revenue' },
    { key: 'recebida', label: 'Receita recebida', value: formatConvCurrency(dashboard.kpis.receitaRecebida), variant: 'revenue' },
    { key: 'ticket', label: 'Ticket médio', value: formatConvCurrency(dashboard.kpis.ticketMedio), variant: 'info' },
  ];

  const rankingRows = dashboard.ranking.map((r) => ({
    id: r.providerId,
    name: r.name,
    patients: r.patients,
    revenue: formatConvCurrency(r.revenue),
  }));

  return (
    <div className="conv-page">
      <ConvenioKpiGrid items={kpiItems} />
      <section className="conv-section">
        <h2 className="conv-section-title">Ranking por convênio</h2>
        <ConvenioTable
          columns={[
            { key: 'name', label: 'Convênio' },
            { key: 'patients', label: 'Pacientes' },
            { key: 'revenue', label: 'Receita' },
          ]}
          rows={rankingRows}
          emptyMessage="Cadastre operadoras para ver o ranking."
        />
      </section>
    </div>
  );
}
