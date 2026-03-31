import { useEffect, useMemo, useState } from 'react';
import { SectionCard } from '../../../components/SectionCard.jsx';
import {
  cancelMarketingScheduledJob,
  listMarketingAutomationObservability,
  listMarketingAutomations,
  listMarketingInboxConversations,
  reprocessMarketingScheduledJob,
} from '../../../services/marketingChatService.js';
import { useAuth } from '../../../auth/AuthContext.jsx';

const STATUS_OPTIONS = ['todos', 'queued', 'running', 'retrying', 'failed', 'completed', 'cancelled'];
const PERIOD_OPTIONS = [
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
];

function formatDateTime(value) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 19);
}

export default function MarketingChatAutomationObservabilityPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [period, setPeriod] = useState('30d');
  const [status, setStatus] = useState('todos');
  const [automationId, setAutomationId] = useState('todos');
  const [channel, setChannel] = useState('todos');
  const [search, setSearch] = useState('');
  const [conversationId, setConversationId] = useState('');
  const [contactId, setContactId] = useState('');
  const [automations, setAutomations] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [obs, setObs] = useState({ summary: {}, jobs: [], runs: { data: [] }, timeline: [] });
  const [selectedRunId, setSelectedRunId] = useState('');
  const [busyJobId, setBusyJobId] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      setReloadKey((k) => k + 1);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      listMarketingAutomations({ user, status: 'todos', channel: 'todos', search: '', page: 1, pageSize: 200 }),
      listMarketingInboxConversations({ user, page: 1, pageSize: 200 }),
      listMarketingAutomationObservability({
        user,
        status,
        automationId,
        channel,
        period,
        search,
        conversationId,
        contactId,
        page: 1,
        pageSize: 50,
      }),
    ])
      .then(([automationsResult, conversationsResult, obsResult]) => {
        if (!active) return;
        setAutomations(automationsResult.data || []);
        setConversations(conversationsResult.data || []);
        setObs(obsResult);
        if (!selectedRunId && obsResult.runs?.data?.[0]?.id) {
          setSelectedRunId(obsResult.runs.data[0].id);
        }
      })
      .catch((err) => {
        if (active) setError(err.message || 'Erro ao carregar observabilidade.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, status, automationId, channel, period, search, conversationId, contactId, reloadKey, selectedRunId]);

  const selectedTimeline = useMemo(
    () => (obs.timeline || []).find((item) => item.runId === selectedRunId),
    [obs.timeline, selectedRunId]
  );

  const handleCancelJob = async (jobId) => {
    try {
      setBusyJobId(jobId);
      setError('');
      await cancelMarketingScheduledJob(user, jobId);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || 'Erro ao cancelar job.');
    } finally {
      setBusyJobId('');
    }
  };

  const handleReprocess = async (jobId, stepOrder = null) => {
    try {
      setBusyJobId(jobId);
      setError('');
      await reprocessMarketingScheduledJob(user, { jobId, stepOrder });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || 'Erro ao reprocessar job.');
    } finally {
      setBusyJobId('');
    }
  };

  return (
    <div className="stack">
      <SectionCard title="Observabilidade do Runtime" description="Monitoramento operacional de jobs, runs, steps e falhas do motor de automacoes.">
        <div className="marketing-chat-table-filters">
          <label className="marketing-chat-inline-filters__item">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="marketing-chat-inline-filters__item">
            <span>Automacao</span>
            <select value={automationId} onChange={(e) => setAutomationId(e.target.value)}>
              <option value="todos">Todas</option>
              {automations.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="marketing-chat-inline-filters__item">
            <span>Canal</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Instagram">Instagram</option>
              <option value="Facebook">Facebook</option>
              <option value="Webchat">Webchat</option>
            </select>
          </label>
          <label className="marketing-chat-inline-filters__item">
            <span>Periodo</span>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIOD_OPTIONS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="marketing-chat-inline-filters__item">
            <span>Conversa</span>
            <select value={conversationId} onChange={(e) => setConversationId(e.target.value)}>
              <option value="">Todas</option>
              {conversations.map((item) => (
                <option key={item.id} value={item.id}>{item.contactName} - {item.channel}</option>
              ))}
            </select>
          </label>
          <label className="marketing-chat-inline-filters__item">
            <span>Contato</span>
            <select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">Todos</option>
              {conversations.map((item) => (
                <option key={`${item.id}-contact`} value={item.contactId}>{item.contactName}</option>
              ))}
            </select>
          </label>
          <label className="marketing-chat-inline-filters__item marketing-chat-inline-filters__item--search">
            <span>Busca</span>
            <input value={search} placeholder="Trigger, erro, payload..." onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button type="button" className="button secondary" onClick={() => setReloadKey((k) => k + 1)}>Atualizar</button>
        </div>

        {loading ? <p className="muted">Carregando observabilidade...</p> : null}
        {!loading && error ? (
          <div className="marketing-chat-empty-state">
            <strong>Falha ao carregar observabilidade.</strong>
            <p className="muted">{error}</p>
            <button type="button" className="button secondary" onClick={() => setReloadKey((k) => k + 1)}>Tentar novamente</button>
          </div>
        ) : null}

        {!loading && !error ? (
          <div className="marketing-chat-now-grid">
            <div className="marketing-chat-now-card"><span>Fila</span><strong>{obs.summary?.queued || 0}</strong></div>
            <div className="marketing-chat-now-card"><span>Em execução</span><strong>{obs.summary?.running || 0}</strong></div>
            <div className="marketing-chat-now-card"><span>Retrying</span><strong>{obs.summary?.retrying || 0}</strong></div>
            <div className="marketing-chat-now-card"><span>Falhos</span><strong>{obs.summary?.failed || 0}</strong></div>
            <div className="marketing-chat-now-card"><span>Concluídos</span><strong>{obs.summary?.completed || 0}</strong></div>
            <div className="marketing-chat-now-card"><span>Cancelados</span><strong>{obs.summary?.cancelled || 0}</strong></div>
          </div>
        ) : null}
      </SectionCard>

      <div className="marketing-chat-dashboard-split">
        <SectionCard title="Jobs" description="Fila e estado atual de processamento.">
          <div className="marketing-chat-table-wrap">
            <table className="marketing-chat-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Trigger</th>
                  <th>Tentativas</th>
                  <th>RunAt</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {(obs.jobs || []).slice(0, 60).map((job) => (
                  <tr key={job.id}>
                    <td>{job.id}</td>
                    <td><span className="marketing-chat-pill">{job.status}</span></td>
                    <td>{job.triggerType}</td>
                    <td>{job.attemptCount || 0}/{job.maxAttempts || 3}</td>
                    <td>{formatDateTime(job.runAt)}</td>
                    <td>
                      <div className="marketing-chat-table-actions">
                        <button type="button" className="button secondary" disabled={busyJobId === job.id || !['queued', 'retrying'].includes(job.status)} onClick={() => handleCancelJob(job.id)}>
                          Cancelar
                        </button>
                        <button type="button" className="button secondary" disabled={busyJobId === job.id || !['failed', 'cancelled'].includes(job.status)} onClick={() => handleReprocess(job.id, null)}>
                          Reprocessar job
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Runs recentes" description="Timeline de execução e drill-down dos steps.">
          <div className="marketing-chat-table-wrap">
            <table className="marketing-chat-table">
              <thead>
                <tr>
                  <th>Inicio</th>
                  <th>Status</th>
                  <th>Automação</th>
                  <th>Duração</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {(obs.runs?.data || []).map((run) => (
                  <tr key={run.id}>
                    <td>{formatDateTime(run.startedAt)}</td>
                    <td><span className="marketing-chat-pill">{run.status}</span></td>
                    <td>{run.automationName}</td>
                    <td>{run.durationMs || 0} ms</td>
                    <td>
                      <button type="button" className="button secondary" onClick={() => setSelectedRunId(run.id)}>Abrir timeline</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Drill-down da execução" description="Payload do evento, erros, steps e reprocessamento seguro.">
        {!selectedTimeline ? (
          <p className="muted">Selecione uma execução para ver detalhes.</p>
        ) : (
          <div className="stack">
            <div className="marketing-chat-now-grid">
              <div className="marketing-chat-now-card"><span>Run</span><strong>{selectedTimeline.runId}</strong></div>
              <div className="marketing-chat-now-card"><span>Status</span><strong>{selectedTimeline.status}</strong></div>
              <div className="marketing-chat-now-card"><span>Duração</span><strong>{selectedTimeline.durationMs || 0} ms</strong></div>
              <div className="marketing-chat-now-card"><span>Tentativas job</span><strong>{selectedTimeline.jobAttempts || 0}</strong></div>
            </div>

            <div className="marketing-chat-table-wrap">
              <table className="marketing-chat-table">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Tipo</th>
                    <th>Status</th>
                    <th>Início</th>
                    <th>Fim</th>
                    <th>Duração</th>
                    <th>Erro</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedTimeline.steps || []).map((step) => (
                    <tr key={step.id}>
                      <td>#{step.order}</td>
                      <td>{step.type}</td>
                      <td><span className="marketing-chat-pill">{step.status}</span></td>
                      <td>{formatDateTime(step.startedAt)}</td>
                      <td>{formatDateTime(step.finishedAt)}</td>
                      <td>{step.durationMs || 0} ms</td>
                      <td>{step.error || '-'}</td>
                      <td>
                        <button
                          type="button"
                          className="button secondary"
                          disabled={busyJobId === selectedTimeline.sourceJob?.id || !['failed', 'cancelled'].includes(selectedTimeline.sourceJob?.status || '')}
                          onClick={() => handleReprocess(selectedTimeline.sourceJob?.id, step.order)}
                        >
                          Reprocessar step
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="marketing-chat-grid-2">
              <label className="field">
                <span className="field-label">Payload do evento</span>
                <textarea rows={8} readOnly value={JSON.stringify(selectedTimeline.payload || {}, null, 2)} />
              </label>
              <label className="field">
                <span className="field-label">Erro da execução</span>
                <textarea rows={8} readOnly value={selectedTimeline.error || 'Sem erro.'} />
              </label>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
