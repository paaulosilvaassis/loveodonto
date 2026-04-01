import { useEffect, useState } from 'react';
import { getPlatformDashboardSnapshot } from '../services/platformConsoleService.js';
import { PageHeader, Panel, StatusBadge, EmptyState } from '../components/ConsoleUi.jsx';

function formatLatency(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return '—';
  return `${ms} ms`;
}

export default function ConsoleLogsErrorsPage() {
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const snap = await getPlatformDashboardSnapshot();
        if (!cancelled) setChecks(snap.healthChecks || []);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Erro ao carregar logs.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="pc-stack">
      <PageHeader title="Logs e Erros" description="Monitoramento de saúde, incidentes e componentes críticos da plataforma." />
      <Panel>
        {error ? <p className="pc-error">{error}</p> : null}
        {loading ? <p className="pc-loading-inline">Carregando…</p> : null}
        {!loading && !error && checks.length === 0 ? (
          <EmptyState title="Nenhum check registrado" description="A tabela system_health_checks está vazia ou você não tem permissão logs.read." />
        ) : null}
        {!loading && checks.length > 0 ? (
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  <th>Componente</th>
                  <th>Status</th>
                  <th>Latência</th>
                  <th>Checado em</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((item) => (
                  <tr key={item.id}>
                    <td>{item.component}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td>{formatLatency(item.latencyMs)}</td>
                    <td>{item.checkedAt ? String(item.checkedAt).replace('T', ' ').slice(0, 19) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
