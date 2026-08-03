import { useEffect, useState } from 'react';
import { listSupportTickets } from '../services/platformConsoleService.js';
import { PageHeader, Panel, StatusBadge, EmptyState } from '../components/ConsoleUi.jsx';

export default function ConsoleSupportPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await listSupportTickets({ query, status });
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Erro ao carregar tickets.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, status]);

  return (
    <div className="pc-stack">
      <PageHeader title="Suporte" description="Inbox operacional de tickets e relacionamento com clínicas." />
      <Panel>
        <div className="pc-filters">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por clínica, assunto ou mensagem..." />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todos status</option>
            <option value="open">Abertos</option>
            <option value="pending">Pendentes</option>
            <option value="resolved">Resolvidos</option>
          </select>
        </div>
        {error ? <p className="pc-error">{error}</p> : null}
        {loading ? <p className="pc-loading-inline">Carregando…</p> : null}
        {!loading && !error && rows.length === 0 ? (
          <EmptyState
            title={status === 'open' ? 'Nenhum ticket em aberto' : 'Nenhum ticket encontrado'}
            description="Não há registros em support_tickets com os filtros atuais."
          />
        ) : null}
        {!loading && rows.length > 0 ? (
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  <th>Clínica</th>
                  <th>Assunto</th>
                  <th>Prioridade</th>
                  <th>Status</th>
                  <th>Última mensagem</th>
                  <th>Atualizado em</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td>{item.clinicName}</td>
                    <td>{item.subject}</td>
                    <td>{item.priority}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td>{item.lastMessage}</td>
                    <td>{item.updatedAt ? String(item.updatedAt).replace('T', ' ').slice(0, 19) : '—'}</td>
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
