import { useEffect, useMemo, useState } from 'react';
import { SectionCard } from '../../../components/SectionCard.jsx';
import {
  getMarketingConversationDetails,
  listMarketingAttendants,
  listMarketingInboxConversations,
  sendMarketingConversationMessage,
} from '../../../services/marketingChatService.js';
import { useAuth } from '../../../auth/useAuth.js';

const STATUS_OPTIONS = [
  { id: 'todas', label: 'Todas' },
  { id: 'aberta', label: 'Abertas' },
  { id: 'aguardando_humano', label: 'Aguardando humano' },
  { id: 'resolvida', label: 'Resolvidas' },
];

const CHANNEL_OPTIONS = ['todos', 'WhatsApp', 'Instagram', 'Facebook', 'Webchat'];

function formatHour(iso) {
  if (!iso) return '--:--';
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function MarketingChatInboxRealtimePage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('todas');
  const [channel, setChannel] = useState('todos');
  const [assignee, setAssignee] = useState('todos');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState({ data: [], totalPages: 1 });
  const [selectedId, setSelectedId] = useState('');
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(1);
  const [attendants, setAttendants] = useState([]);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    listMarketingAttendants(user)
      .then((items) => setAttendants(items))
      .catch(() => setAttendants([]));
  }, [user, reloadKey]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    listMarketingInboxConversations({ user, status, channel, assignee, search, page, pageSize: 10 })
      .then((data) => {
        if (!active) return;
        setResult(data);
        const firstId = data.data[0]?.id || '';
        setSelectedId((prev) => (prev && data.data.some((item) => item.id === prev) ? prev : firstId));
      })
      .catch((err) => {
        if (active) setError(err.message || 'Erro ao carregar inbox.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, status, channel, assignee, search, page, reloadKey]);

  useEffect(() => {
    if (!selectedId) {
      setDetails(null);
      return;
    }
    let active = true;
    setDetailsLoading(true);
    setDetailsError('');
    getMarketingConversationDetails(user, selectedId)
      .then((data) => {
        if (active) setDetails(data);
      })
      .catch((err) => {
        if (active) setDetailsError(err.message || 'Erro ao abrir conversa.');
      })
      .finally(() => {
        if (active) setDetailsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, selectedId, reloadKey]);

  const assigneeOptions = useMemo(() => [{ id: 'todos', name: 'Todos' }, ...attendants], [attendants]);

  const handleSendMessage = async () => {
    if (!selectedId || !composerText.trim()) return;
    try {
      setSending(true);
      await sendMarketingConversationMessage(user, { conversationId: selectedId, text: composerText });
      setComposerText('');
      setReloadKey((k) => k + 1);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="stack">
      <SectionCard
        title="Inbox"
        description="Base do inbox omnichannel interno para centralizar atendimento de conversas no LoveOdonto."
      >
        <div className="marketing-chat-table-filters">
          <label className="marketing-chat-inline-filters__item">
            <span>Status</span>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              {STATUS_OPTIONS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="marketing-chat-inline-filters__item">
            <span>Canal</span>
            <select value={channel} onChange={(e) => { setChannel(e.target.value); setPage(1); }}>
              {CHANNEL_OPTIONS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="marketing-chat-inline-filters__item">
            <span>Atendente</span>
            <select value={assignee} onChange={(e) => { setAssignee(e.target.value); setPage(1); }}>
              {assigneeOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="marketing-chat-inline-filters__item marketing-chat-inline-filters__item--search">
            <span>Busca</span>
            <input value={search} placeholder="Nome, mensagem, canal..." onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </label>
        </div>

        {loading ? <p className="muted">Carregando inbox...</p> : null}
        {!loading && error ? (
          <div className="marketing-chat-empty-state">
            <strong>Erro ao carregar inbox.</strong>
            <p className="muted">{error}</p>
            <button type="button" className="button secondary" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </button>
          </div>
        ) : null}
        {!loading && !error && result.data.length === 0 ? (
          <div className="marketing-chat-empty-state">
            <strong>Nenhuma conversa no recorte atual.</strong>
            <p className="muted">Ajuste os filtros ou conecte seu canal para iniciar o atendimento.</p>
          </div>
        ) : null}

        {!loading && !error && result.data.length > 0 ? (
          <>
            <div className="marketing-chat-inbox-layout">
              <aside className="marketing-chat-inbox-list">
                {result.data.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`marketing-chat-inbox-item${selectedId === item.id ? ' marketing-chat-inbox-item--active' : ''}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div className="marketing-chat-inbox-item__line">
                      <strong>{item.contactName}</strong>
                      <span>{formatHour(item.lastMessageAt)}</span>
                    </div>
                    <div className="marketing-chat-inbox-item__line muted">
                      <span>{item.channel}</span>
                      <span>{item.assignee || 'Sem atendente'}</span>
                    </div>
                    <p className="marketing-chat-inbox-item__preview">{item.preview}</p>
                    <div className="marketing-chat-tags">
                      {(item.tags || []).slice(0, 2).map((tag) => (
                        <span key={`${item.id}-${tag}`} className="marketing-chat-tag">{tag}</span>
                      ))}
                      {item.unreadCount > 0 ? <span className="marketing-chat-pill">{item.unreadCount} não lidas</span> : null}
                    </div>
                  </button>
                ))}
              </aside>

              <section className="marketing-chat-thread">
                {detailsLoading ? <p className="muted">Carregando conversa...</p> : null}
                {!detailsLoading && detailsError ? (
                  <div className="marketing-chat-empty-state">
                    <strong>Erro ao abrir conversa.</strong>
                    <p className="muted">{detailsError}</p>
                    <button type="button" className="button secondary" onClick={() => setReloadKey((k) => k + 1)}>
                      Tentar novamente
                    </button>
                  </div>
                ) : null}
                {!detailsLoading && !details ? <p className="muted">Selecione uma conversa para visualizar o chat.</p> : null}
                {!detailsLoading && details ? (
                  <>
                    <header className="marketing-chat-thread__header">
                      <div>
                        <h3>{details.contactName}</h3>
                        <p className="muted">{details.channel} • {details.department} • {details.assignee}</p>
                      </div>
                      <span className="marketing-chat-pill">{details.status}</span>
                    </header>
                    <div className="marketing-chat-thread__messages">
                      {(details.messages || []).map((msg) => (
                        <article key={msg.id} className={`marketing-chat-message marketing-chat-message--${msg.direction}`}>
                          <strong>{msg.author}</strong>
                          <p>{msg.text}</p>
                          <span>{formatHour(msg.at)}</span>
                        </article>
                      ))}
                    </div>
                    <div className="marketing-chat-thread__composer">
                      <textarea rows={2} value={composerText} placeholder="Digite uma mensagem..." onChange={(e) => setComposerText(e.target.value)} />
                      <div className="marketing-chat-thread__composer-actions">
                        <button type="button" className="button secondary">Anexo</button>
                        <button type="button" className="button primary" onClick={handleSendMessage} disabled={sending || !composerText.trim()}>
                          {sending ? 'Enviando...' : 'Enviar'}
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}
              </section>

              <aside className="marketing-chat-context">
                <h4>Contexto</h4>
                {!details ? <p className="muted">Selecione uma conversa para ver contexto de contato/paciente.</p> : (
                  <>
                    <div className="marketing-chat-context__block">
                      <strong>Contato/Paciente</strong>
                      <p className="muted">{details.contactName} • {details.contactPhone || '-'}</p>
                    </div>
                    <div className="marketing-chat-context__block">
                      <strong>Tags</strong>
                      <div className="marketing-chat-tags">
                        {(details.tags || []).map((tag) => (
                          <span key={`${details.id}-${tag}`} className="marketing-chat-tag">{tag}</span>
                        ))}
                      </div>
                    </div>
                    <div className="marketing-chat-context__block">
                      <strong>Departamento / Atendente</strong>
                      <p className="muted">{details.department} • {details.assignee}</p>
                    </div>
                    <div className="marketing-chat-context__block">
                      <strong>Observações</strong>
                      <ul className="marketing-chat-list">
                        {(details.notes || []).map((note) => (
                          <li key={note} className="marketing-chat-list__item"><span>{note}</span></li>
                        ))}
                      </ul>
                    </div>
                    <div className="marketing-chat-context__block">
                      <strong>Integrações futuras</strong>
                      <p className="muted">Agenda, CRM, campanhas e automações acopladas ao contato.</p>
                    </div>
                  </>
                )}
              </aside>
            </div>
            <div className="marketing-chat-pagination">
              <button type="button" className="button secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button>
              <span>Página {page} de {result.totalPages}</span>
              <button type="button" className="button secondary" disabled={page >= result.totalPages} onClick={() => setPage((p) => Math.min(result.totalPages, p + 1))}>Próxima</button>
            </div>
          </>
        ) : null}
      </SectionCard>
    </div>
  );
}
