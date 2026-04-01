import { useEffect, useState } from 'react';
import { listSubscriptions } from '../services/platformConsoleService.js';
import { PageHeader, Panel, StatusBadge, EmptyState } from '../components/ConsoleUi.jsx';

export default function ConsolePlansPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await listSubscriptions();
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Erro ao carregar assinaturas.');
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
      <PageHeader title="Assinaturas" description="Gestão de planos ativos, ciclo e próximas renovações." />
      <Panel>
        {error ? <p className="pc-error">{error}</p> : null}
        {loading ? <p className="pc-loading-inline">Carregando…</p> : null}
        {!loading && !error && rows.length === 0 ? (
          <EmptyState title="Nenhuma assinatura cadastrada" description="Não há registros em tenant_subscriptions." />
        ) : null}
        {!loading && rows.length > 0 ? (
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  <th>Clínica</th>
                  <th>Plano</th>
                  <th>Status</th>
                  <th>Ciclo</th>
                  <th>Valor</th>
                  <th>Próxima cobrança</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td>{item.clinicName}</td>
                    <td>{item.plan}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td>{item.cycle}</td>
                    <td>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amountCents / 100)}</td>
                    <td>{item.nextBillingAt ? String(item.nextBillingAt).slice(0, 10) : '—'}</td>
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
