import { useEffect, useState } from 'react';
import { listAuditLogs } from '../services/platformConsoleService.js';
import { PageHeader, Panel, EmptyState } from '../components/ConsoleUi.jsx';

export default function ConsoleAuditPage() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await listAuditLogs({ query });
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Erro ao carregar auditoria.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div className="pc-stack">
      <PageHeader title="Auditoria" description="Rastreabilidade de ações administrativas e operações sensíveis." />
      <Panel>
        <div className="pc-filters">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar por ator, ação, alvo..." />
        </div>
        {error ? <p className="pc-error">{error}</p> : null}
        {loading ? <p className="pc-loading-inline">Carregando…</p> : null}
        {!loading && !error && rows.length === 0 ? (
          <EmptyState title="Nenhum evento de auditoria" description="Não há registros em audit_logs com o filtro atual." />
        ) : null}
        {!loading && rows.length > 0 ? (
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
                    <td>{item.createdAt ? String(item.createdAt).replace('T', ' ').slice(0, 19) : '—'}</td>
                    <td>{item.actor}</td>
                    <td>{item.actorRole}</td>
                    <td>{item.action}</td>
                    <td>{item.target}</td>
                    <td>{item.metadata}</td>
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
