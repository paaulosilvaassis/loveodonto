import { useEffect, useState } from 'react';
import { listConnectivityRows } from '../services/platformConsoleService.js';
import { PageHeader, Panel, StatusBadge, EmptyState } from '../components/ConsoleUi.jsx';

export default function ConsoleConnectivityPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await listConnectivityRows();
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Erro ao carregar conectividades.');
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
      <PageHeader
        title="Conectividades"
        description="Estado das integrações por clínica: WhatsApp, APIs, webhooks e provedores externos."
      />
      <Panel>
        {error ? <p className="pc-error">{error}</p> : null}
        {loading ? <p className="pc-loading-inline">Carregando…</p> : null}
        {!loading && !error && rows.length === 0 ? (
          <EmptyState title="Nenhuma integração listada" description="Não há linhas em tenant_integrations." />
        ) : null}
        {!loading && rows.length > 0 ? (
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
                    <td>{item.lastSyncAt ? String(item.lastSyncAt).replace('T', ' ').slice(0, 19) : '—'}</td>
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
