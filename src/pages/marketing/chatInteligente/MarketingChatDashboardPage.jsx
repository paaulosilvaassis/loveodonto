import { useEffect, useState } from 'react';
import { SectionCard } from '../../../components/SectionCard.jsx';
import { getMarketingDashboardSnapshot } from '../../../services/marketingChatService.js';
import { useAuth } from '../../../auth/AuthContext.jsx';

const PERIOD_OPTIONS = [
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: 'Ultimos 7 dias' },
  { id: '30d', label: 'Ultimos 30 dias' },
];

export default function MarketingChatDashboardPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('7d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getMarketingDashboardSnapshot(user)
      .then((data) => {
        if (active) setSnapshot(data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Erro ao carregar dashboard de marketing.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [period, reloadKey, user]);

  return (
    <div className="stack">
      <SectionCard
        title="Dashboard"
        description="Resumo operacional para agir rapido no atendimento e nas oportunidades."
        actions={(
          <div className="marketing-chat-inline-filters">
            <label className="marketing-chat-inline-filters__item">
              <span>Periodo</span>
              <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      >
        {loading ? <p className="muted">Carregando indicadores...</p> : null}
        {!loading && error ? (
          <div className="marketing-chat-empty-state">
            <strong>Falha ao carregar dashboard.</strong>
            <p className="muted">{error}</p>
            <button type="button" className="button secondary" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </button>
          </div>
        ) : null}
        {!loading && snapshot ? (
          <div className="marketing-chat-kpi-grid">
            {snapshot.kpis.map((item) => (
              <article key={item.id} className="marketing-chat-kpi-card">
                <span className="marketing-chat-kpi-card__label">{item.label}</span>
                <strong className="marketing-chat-kpi-card__value">{item.value}</strong>
                <span className="marketing-chat-kpi-card__delta">{item.delta}</span>
              </article>
            ))}
          </div>
        ) : null}
      </SectionCard>

      <div className="marketing-chat-dashboard-split">
        <SectionCard title="Acontecendo agora" description="Atalhos para priorizacao operacional.">
          {loading ? (
            <p className="muted">Carregando blocos operacionais...</p>
          ) : (
            <div className="marketing-chat-now-grid">
              {(snapshot?.nowCards || []).map((item) => (
                <div key={item.id} className="marketing-chat-now-card">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Conversas aguardando resposta" description="Fila curta para acao imediata.">
          {loading ? (
            <p className="muted">Carregando fila...</p>
          ) : (
            <ul className="marketing-chat-list">
              {(snapshot?.waitingConversations || []).map((item) => (
                <li key={item.id} className="marketing-chat-list__item">
                  <div>
                    <strong>{item.contactName}</strong>
                    <p className="muted">{item.channel}</p>
                  </div>
                  <span className="marketing-chat-pill">{item.waitingSince}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
