import { useMemo } from 'react';
import { listConnectivityRows } from '../services/platformConsoleService.js';
import { PageHeader, Panel, StatusBadge } from '../components/ConsoleUi.jsx';

export default function ConsoleConnectivityPage() {
  const rows = useMemo(() => listConnectivityRows(), []);
  return (
    <div className="pc-stack">
      <PageHeader
        title="Conectividades"
        description="Estado das integrações por clínica: WhatsApp, APIs, webhooks e provedores externos."
      />
      <Panel>
        <div className="pc-table-wrap">
          <table className="pc-table">
            <thead>
              <tr>
                <th>Clínica</th>
                <th>Integração</th>
                <th>Status</th>
                <th>Último sync</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>{item.clinicName}</td>
                  <td>{item.integrationName}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td>{String(item.lastSyncAt).replace('T', ' ').slice(0, 19)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
