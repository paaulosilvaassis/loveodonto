import { useMemo, useState } from 'react';
import { listAuditLogs } from '../services/platformConsoleService.js';
import { PageHeader, Panel } from '../components/ConsoleUi.jsx';

export default function ConsoleAuditPage() {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => listAuditLogs({ query }), [query]);
  return (
    <div className="pc-stack">
      <PageHeader title="Auditoria" description="Rastreabilidade de ações administrativas e operações sensíveis." />
      <Panel>
        <div className="pc-filters">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar por ator, ação, alvo..." />
        </div>
        <div className="pc-table-wrap">
          <table className="pc-table">
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Ator</th>
                <th>Papel</th>
                <th>Ação</th>
                <th>Alvo</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>{String(item.createdAt).replace('T', ' ').slice(0, 19)}</td>
                  <td>{item.actor}</td>
                  <td>{item.actorRole}</td>
                  <td>{item.action}</td>
                  <td>{item.targetType}:{item.targetId}</td>
                  <td>{item.metadata}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
