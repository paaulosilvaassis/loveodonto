import { useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import { useAuth } from '../auth/useAuth.js';
import { runStabilityHealthCheck } from '../services/stabilityHealthService.js';

export default function StabilityHealthPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await runStabilityHealthCheck({ user, tenantId: user?.tenantId });
      setSnapshot(result);
    } catch (err) {
      setError(err?.message || 'Falha ao rodar health check.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.tenantId]);

  return (
    <div className="stack">
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Diagnóstico de Estabilidade</h2>
          <p className="muted">Validação rápida de auth, tenant, backend e configuração.</p>
        </div>
        <Button type="button" variant="secondary" onClick={load} disabled={loading}>
          {loading ? 'Validando…' : 'Revalidar'}
        </Button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {snapshot ? (
        <div className="card">
          <div style={{ marginBottom: '0.75rem' }}>
            <span className={`access-badge ${snapshot.overallOk ? 'on' : 'off'}`}>
              {snapshot.overallOk ? 'Saudável' : 'Com falhas'}
            </span>
            <span className="muted" style={{ marginLeft: '0.75rem' }}>
              Atualizado em {new Date(snapshot.generatedAt).toLocaleString('pt-BR')}
            </span>
          </div>
          <div className="table-wrapper">
            <table className="access-list-table">
              <thead>
                <tr>
                  <th>Check</th>
                  <th>Status</th>
                  <th>Detalhes</th>
                  <th>Ação sugerida</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.results.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>
                      <span className={`access-badge ${item.ok ? 'on' : 'off'}`}>{item.ok ? 'OK' : 'Falhou'}</span>
                    </td>
                    <td>{item.details}</td>
                    <td className="muted">{item.remediation || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

