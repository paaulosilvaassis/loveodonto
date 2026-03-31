import { useMemo } from 'react';
import { getPlatformDashboardSnapshot } from '../services/platformConsoleService.js';
import { PageHeader, Panel, StatusBadge } from '../components/ConsoleUi.jsx';

export default function ConsoleLogsErrorsPage() {
  const snapshot = useMemo(() => getPlatformDashboardSnapshot(), []);
  return (
    <div className="pc-stack">
      <PageHeader title="Logs e Erros" description="Monitoramento de saúde, incidentes e componentes críticos da plataforma." />
      <Panel>
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
              {snapshot.healthChecks.map((item) => (
                <tr key={item.id}>
                  <td>{item.component}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td>{item.latencyMs} ms</td>
                  <td>{String(item.checkedAt).replace('T', ' ').slice(0, 19)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
