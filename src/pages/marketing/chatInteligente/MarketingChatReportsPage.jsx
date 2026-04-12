import { useEffect, useState } from 'react';
import { SectionCard } from '../../../components/SectionCard.jsx';
import { getMarketingReportsSnapshot } from '../../../services/marketingChatService.js';
import { useAuth } from '../../../auth/useAuth.js';

export default function MarketingChatReportsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getMarketingReportsSnapshot(user)
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Erro ao carregar relatorios.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey, user]);

  return (
    <div className="stack">
      <SectionCard
        title="Relatorios e Metricas"
        description="Desempenho de atendimento, campanhas e conversao do modulo."
        actions={<button type="button" className="button secondary">Exportar CSV</button>}
      >
        {loading ? <p className="muted">Carregando metricas...</p> : null}
        {!loading && error ? (
          <div className="marketing-chat-empty-state">
            <strong>Falha ao carregar relatorios.</strong>
            <p className="muted">{error}</p>
            <button type="button" className="button secondary" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </button>
          </div>
        ) : null}
        {!loading && !error && report ? (
          <>
            <div className="marketing-chat-kpi-grid marketing-chat-kpi-grid--compact">
              <article className="marketing-chat-kpi-card">
                <span className="marketing-chat-kpi-card__label">Taxa de conversao</span>
                <strong className="marketing-chat-kpi-card__value">{report.conversionRate}</strong>
              </article>
              <article className="marketing-chat-kpi-card">
                <span className="marketing-chat-kpi-card__label">Primeira resposta media</span>
                <strong className="marketing-chat-kpi-card__value">{report.avgFirstResponse}</strong>
              </article>
              <article className="marketing-chat-kpi-card">
                <span className="marketing-chat-kpi-card__label">Taxa de entrega (campanhas)</span>
                <strong className="marketing-chat-kpi-card__value">{report.campaignDeliveryRate}</strong>
              </article>
              <article className="marketing-chat-kpi-card">
                <span className="marketing-chat-kpi-card__label">Execucoes de automacao</span>
                <strong className="marketing-chat-kpi-card__value">{report.runtime?.totalRuns || 0}</strong>
              </article>
              <article className="marketing-chat-kpi-card">
                <span className="marketing-chat-kpi-card__label">Taxa de sucesso (automações)</span>
                <strong className="marketing-chat-kpi-card__value">{report.runtime?.successRate || 0}%</strong>
              </article>
              <article className="marketing-chat-kpi-card">
                <span className="marketing-chat-kpi-card__label">Tempo médio de execução</span>
                <strong className="marketing-chat-kpi-card__value">{report.runtime?.avgDurationMs || 0} ms</strong>
              </article>
            </div>

            <div className="marketing-chat-table-wrap">
              <table className="marketing-chat-table">
                <thead>
                  <tr>
                    <th>Canal</th>
                    <th>Volume no periodo</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topChannels.map((item) => (
                    <tr key={item.channel}>
                      <td>{item.channel}</td>
                      <td>{item.volume}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="marketing-chat-dashboard-split">
              <SectionCard title="Automacoes mais acionadas" description="Top automacoes por volume de runs.">
                {(report.runtime?.topAutomations || []).length === 0 ? (
                  <p className="muted">Sem execucoes ainda.</p>
                ) : (
                  <ul className="marketing-chat-list">
                    {report.runtime.topAutomations.map((item) => (
                      <li key={item.automationId} className="marketing-chat-list__item">
                        <span>{item.automationName}</span>
                        <span className="marketing-chat-pill">{item.volume}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              <SectionCard title="Passos com mais falhas" description="Mapeia pontos de erro para tuning do fluxo.">
                {(report.runtime?.topFailedSteps || []).length === 0 ? (
                  <p className="muted">Sem falhas registradas.</p>
                ) : (
                  <ul className="marketing-chat-list">
                    {report.runtime.topFailedSteps.map((item) => (
                      <li key={item.stepKey} className="marketing-chat-list__item">
                        <span>{item.stepKey}</span>
                        <span className="marketing-chat-pill">{item.failures}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>

            <SectionCard title="Canais com maior volume (runtime)" description="Canais mais utilizados nas execucoes das automacoes.">
              {(report.runtime?.channelsVolume || []).length === 0 ? (
                <p className="muted">Sem volume de runtime registrado.</p>
              ) : (
                <div className="marketing-chat-table-wrap">
                  <table className="marketing-chat-table">
                    <thead>
                      <tr>
                        <th>Canal</th>
                        <th>Volume</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.runtime.channelsVolume.map((item) => (
                        <tr key={item.channel}>
                          <td>{item.channel}</td>
                          <td>{item.volume}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </>
        ) : null}
      </SectionCard>
    </div>
  );
}
