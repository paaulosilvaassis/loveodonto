import { useMemo } from 'react';
import { Section } from '../../components/Section.jsx';
import { getMasterDashboardMetrics } from '../../services/metricsService.js';

export default function MasterMetricsPage() {
  const metrics = useMemo(() => getMasterDashboardMetrics(), []);

  const formatCurrency = (v) => 'R$ ' + ((v || 0) / 100).toFixed(2).replace('.', ',');

  return (
    <div className="stack">
      <Section title="Métricas" description="MRR, WAU/MAU, churn e uso por módulo.">
        <div className="card" style={{ padding: '1.5rem' }}>
          <h4 style={{ marginBottom: '1rem' }}>Resumo</h4>
          <ul className="stack">
            <li><strong>MRR:</strong> {formatCurrency(metrics.mrr)}</li>
            <li><strong>Clínicas ativas:</strong> {metrics.tenants?.active ?? 0}</li>
            <li><strong>Clínicas trial:</strong> {metrics.tenants?.trial ?? 0}</li>
            <li><strong>Clínicas suspensas:</strong> {metrics.tenants?.suspended ?? 0}</li>
            <li><strong>Usuários ativos (MAU):</strong> {metrics.mau ?? 0}</li>
            <li><strong>Total membros:</strong> {metrics.totalMembers ?? 0}</li>
            <li><strong>Faturas em atraso:</strong> {metrics.overdueInvoices ?? 0}</li>
          </ul>
        </div>
      </Section>
    </div>
  );
}
