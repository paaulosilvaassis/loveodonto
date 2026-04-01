import { useEffect, useState } from 'react';
import { listBillingEvents } from '../services/platformConsoleService.js';
import { PageHeader, Panel, StatusBadge, EmptyState } from '../components/ConsoleUi.jsx';

export default function ConsoleBillingPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await listBillingEvents();
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Erro ao carregar cobranças.');
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
      <PageHeader title="Cobranças" description="Faturas, eventos financeiros e inadimplência por clínica." />
      <Panel>
        {error ? <p className="pc-error">{error}</p> : null}
        {loading ? <p className="pc-loading-inline">Carregando…</p> : null}
        {!loading && !error && rows.length === 0 ? (
          <EmptyState title="Nenhuma cobrança encontrada" description="Não há linhas em tenant_billing_events ou você não tem permissão billing.read." />
        ) : null}
        {!loading && rows.length > 0 ? (
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  <th>Clínica</th>
                  <th>Evento</th>
                  <th>Status</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Criado em</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td>{item.clinicName}</td>
                    <td>{item.type}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amountCents / 100)}</td>
                    <td>{item.dueAt ? String(item.dueAt).slice(0, 10) : '—'}</td>
                    <td>{item.createdAt ? String(item.createdAt).replace('T', ' ').slice(0, 19) : '—'}</td>
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
