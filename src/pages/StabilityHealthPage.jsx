import { useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import { useAuth } from '../auth/useAuth.js';
import { runStabilityHealthCheck } from '../services/stabilityHealthService.js';
import { runDataIntegrityCheck } from '../services/dataIntegrityService.js';

function SeverityBadge({ severity }) {
  const map = { critical: 'off', warning: 'pending', info: 'on' };
  const label = { critical: 'crítico', warning: 'aviso', info: 'info' };
  return (
    <span className={`access-badge ${map[severity] || 'pending'}`}>
      {label[severity] || severity}
    </span>
  );
}

function DataIntegrityPanel() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = () => {
    setLoading(true);
    try {
      setReport(runDataIntegrityCheck());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { run(); }, []);

  if (!report) return <p className="muted">Carregando integridade…</p>;

  const gateLabel = report.gate ? '✅ GATE OK — sem críticos' : '❌ GATE FALHOU — corrigir antes de continuar';
  const gateClass = report.gate ? 'on' : 'off';

  return (
    <div className="stack">
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>Bloco 0 — Integridade dos vínculos</h3>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            {report.budgetCount} orçamentos · {report.contractCount} contratos ·
            {report.receivableCount} parcelas · {report.financingCount} financiamentos
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={run} disabled={loading} style={{ flexShrink: 0 }}>
          {loading ? 'Verificando…' : 'Revalidar'}
        </Button>
      </div>

      <div className="flex" style={{ gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span className={`access-badge ${gateClass}`} style={{ fontSize: '0.875rem', padding: '0.25rem 0.75rem' }}>
          {gateLabel}
        </span>
        {report.critical > 0 && (
          <span className="access-badge off">{report.critical} crítico{report.critical !== 1 ? 's' : ''}</span>
        )}
        {report.warnings > 0 && (
          <span className="access-badge pending">{report.warnings} aviso{report.warnings !== 1 ? 's' : ''}</span>
        )}
        {report.ok && (
          <span className="muted" style={{ fontSize: '0.85rem' }}>Nenhuma falha detectada.</span>
        )}
      </div>

      {report.issues.length > 0 && (
        <div className="table-wrapper">
          <table className="access-list-table">
            <thead>
              <tr>
                <th>Severidade</th>
                <th>Código</th>
                <th>Entidade</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {report.issues.map((item, idx) => (
                <tr key={idx}>
                  <td><SeverityBadge severity={item.severity} /></td>
                  <td><code style={{ fontSize: '0.8rem' }}>{item.code}</code></td>
                  <td><code style={{ fontSize: '0.8rem' }}>{item.entity}</code></td>
                  <td>{item.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted" style={{ fontSize: '0.8rem' }}>
        Atualizado em {new Date(report.generatedAt).toLocaleString('pt-BR')}
      </p>
    </div>
  );
}

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
      {/* ── Infra / SaaS ── */}
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Diagnóstico de Estabilidade</h2>
          <p className="muted">Infra SaaS, auth e tenant.</p>
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
              {snapshot.overallOk ? 'Infra saudável' : 'Infra com falhas'}
            </span>
            <span className="muted" style={{ marginLeft: '0.75rem' }}>
              {new Date(snapshot.generatedAt).toLocaleString('pt-BR')}
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

      {/* ── Integridade de vínculos (Bloco 0) ── */}
      <div className="card">
        <DataIntegrityPanel />
      </div>
    </div>
  );
}
