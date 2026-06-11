import { useMemo } from 'react';
import { getConvenioExecutiveReport } from '../../services/convenioDashboardService.js';
import { useConvenioTenant } from '../../convenios/hooks/useConvenioTenant.js';
import { ConvenioKpiGrid, ConvenioTable, formatConvCurrency } from '../../convenios/ui/ConvenioUi.jsx';

export default function ConveniosRelatoriosPage() {
  const tenantId = useConvenioTenant();
  const report = useMemo(() => getConvenioExecutiveReport(tenantId), [tenantId]);

  return (
    <div className="conv-page">
      <h2 className="conv-section-title">Relatórios executivos</h2>
      <ConvenioKpiGrid items={[
        { key: 'avg', label: 'Tempo médio recebimento (dias)', value: report.avgReceiptDays, variant: 'info' },
        { key: 'rec', label: 'Total recebimentos', value: report.totalReceipts, variant: 'success' },
        { key: 'gl', label: '% glosa', value: `${report.kpis.percentualGlosa}%`, variant: 'warning' },
      ]} />

      <section className="conv-section conv-section--highlight">
        <h3 className="conv-section-subtitle">Rentabilidade real dos convênios</h3>
        <p className="conv-hint">Responda: vale a pena continuar atendendo esse convênio?</p>
        <ConvenioTable
          columns={[
            { key: 'name', label: 'Convênio' },
            { key: 'revenue', label: 'Receita', render: (r) => formatConvCurrency(r.revenue) },
            { key: 'costEstimate', label: 'Custos est.', render: (r) => formatConvCurrency(r.costEstimate) },
            { key: 'profit', label: 'Lucro', render: (r) => formatConvCurrency(r.profit) },
            { key: 'marginPercent', label: 'Margem', render: (r) => `${r.marginPercent}%` },
          ]}
          rows={report.profitability}
        />
      </section>

      <section className="conv-section">
        <h3 className="conv-section-subtitle">Produção por dentista</h3>
        <ConvenioTable
          columns={[
            { key: 'name', label: 'Profissional' },
            { key: 'count', label: 'Procedimentos' },
            { key: 'revenue', label: 'Receita', render: (r) => formatConvCurrency(r.revenue) },
          ]}
          rows={report.productionByProfessional}
        />
      </section>

      <section className="conv-section">
        <h3 className="conv-section-subtitle">Procedimentos mais realizados</h3>
        <ConvenioTable
          columns={[
            { key: 'name', label: 'Procedimento' },
            { key: 'count', label: 'Quantidade' },
          ]}
          rows={report.topProcedures}
        />
      </section>
    </div>
  );
}
