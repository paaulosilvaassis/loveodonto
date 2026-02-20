import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Section } from '../../components/Section.jsx';
import { getMasterDashboardMetrics } from '../../services/metricsService.js';

export default function MasterDashboardPage() {
  const navigate = useNavigate();
  const metrics = useMemo(() => getMasterDashboardMetrics(), []);

  return (
    <div className="stack">
      <Section title="Dashboard" description="Visão geral da plataforma.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="card" style={{ padding: '1rem' }}><div className="muted">Clínicas</div><div style={{ fontSize: '1.5rem' }}>{metrics.tenants?.total ?? 0}</div></div>
          <div className="card" style={{ padding: '1rem' }}><div className="muted">MRR</div><div style={{ fontSize: '1.5rem' }}>R$ {((metrics.mrr ?? 0) / 100).toFixed(2)}</div></div>
          <div className="card" style={{ padding: '1rem' }}><div className="muted">Usuários</div><div style={{ fontSize: '1.5rem' }}>{metrics.totalMembers ?? 0}</div></div>
          <div className="card" style={{ padding: '1rem' }}><div className="muted">Faturas em atraso</div><div style={{ fontSize: '1.5rem' }}>{metrics.overdueInvoices ?? 0}</div></div>
        </div>
        <button type="button" className="button primary" onClick={() => navigate('/master/tenants')}>Ver clínicas</button>
      </Section>
    </div>
  );
}
