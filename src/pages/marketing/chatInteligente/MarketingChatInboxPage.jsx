import { useEffect, useMemo, useState } from 'react';
import { SectionCard } from '../../../components/SectionCard.jsx';
import {
  bulkUpdateMarketingConversations,
  createMarketingTag,
  getMarketingConversationDetails,
  listMarketingAttendants,
  listMarketingInboxConversations,
  listMarketingDepartments,
  listMarketingTags,
  sendMarketingConversationMessage,
  updateMarketingTag,
} from '../../../services/marketingChatService.js';
import { useAuth } from '../../../auth/AuthContext.jsx';

const STATUS_OPTIONS = [
  { id: 'todas', label: 'Todas' },
  { id: 'aberta', label: 'Abertas' },
  { id: 'aguardando_humano', label: 'Aguardando humano' },
  { id: 'resolvida', label: 'Resolvidas' },
];

function formatHour(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function MarketingChatInboxPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('todas');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState({ data: [], total: 0, totalPages: 1 });
  const [selectedId, setSelectedId] = useState('');
  const [selectedRows, setSelectedRows] = useState({});
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [details, setDetails] = useState(null);
  const [detailsError, setDetailsError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [composerText, setComposerText] = useState('');
  const [savingMessage, setSavingMessage] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [bulkDepartment, setBulkDepartment] = useState('');
  const [bulkTag, setBulkTag] = useState('');
  const [tags, setTags] = useState([]);
  const [attendants, setAttendants] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagEdit, setTagEdit] = useState(null);
  const [tagForm, setTagForm] = useState({ name: '', color: '#6366F1' });
  const [tagSaving, setTagSaving] = useState(false);
  const [tagError, setTagError] = useState('');

  const loadInbox = () => {
    setLoading(true);
    setError('');
    listMarketingInboxConversations({ user, status, search, page, pageSize: 8 })
      .then((data) => {
        setResult(data);
        const firstId = data.data[0]?.id || '';
        setSelectedId((prev) => (prev && data.data.some((item) => item.id === prev) ? prev : firstId));
      })
      .catch((err) => {
        setError(err.message || 'Erro ao carregar conversas.');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadInbox();
  }, [status, search, page, reloadKey, user]);

  useEffect(() => {
    if (!selectedId) {
      setDetails(null);
      return;
    }
    setDetailsLoading(true);
    setDetailsError('');
    getMarketingConversationDetails(user, selectedId)
      .then((data) => {
        setDetails(data);
      })
      .catch((err) => {
        setDetailsError(err.message || 'Erro ao abrir conversa.');
      })
      .finally(() => {
        setDetailsLoading(false);
      });
  }, [selectedId, reloadKey, user]);

  useEffect(() => {
    Promise.all([listMarketingTags(user), listMarketingAttendants(user), listMarketingDepartments(user)])
      .then(([tagsData, attendantsData, departmentsData]) => {
        setTags(tagsData);
        setAttendants(attendantsData);
        setDepartments(departmentsData);
        if (!bulkTag && tagsData[0]?.name) setBulkTag(tagsData[0].name);
        if (!bulkAssignee && attendantsData[0]?.id) setBulkAssignee(attendantsData[0].id);
        if (!bulkDepartment && departmentsData[0]?.id) setBulkDepartment(departmentsData[0].id);
      })
      .catch(() => {
        setTags([]);
        setAttendants([]);
        setDepartments([]);
      });
  }, [reloadKey, user]);

  const selectedCount = useMemo(
    () => Object.values(selectedRows).filter(Boolean).length,
    [selectedRows]
  );

  const toggleSelectRow = (conversationId) => {
    setSelectedRows((prev) => ({ ...prev, [conversationId]: !prev[conversationId] }));
  };

  const selectedIds = useMemo(
    () => Object.entries(selectedRows).filter(([, checked]) => checked).map(([id]) => id),
    [selectedRows]
  );

  const handleBulkAction = async (action, payload = {}) => {
    try {
      setBulkBusy(true);
      setBulkError('');
      await bulkUpdateMarketingConversations(user, { conversationIds: selectedIds, action, payload });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setBulkError(err.message || 'Erro na acao em lote.');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedId || !composerText.trim()) return;
    try {
      setSavingMessage(true);
      await sendMarketingConversationMessage(user, { conversationId: selectedId, text: composerText });
      setComposerText('');
      setReloadKey((k) => k + 1);
    } finally {
      setSavingMessage(false);
    }
  };

  const openNewTagModal = () => {
    setTagEdit(null);
    setTagError('');
    setTagForm({ name: '', color: '#6366F1' });
    setTagModalOpen(true);
  };

  const openEditTagModal = (tagName) => {
    const tag = tags.find((item) => item.name === tagName);
    if (!tag) return;
    setTagEdit(tag);
    setTagError('');
    setTagForm({ name: tag.name, color: tag.color || '#6366F1' });
    setTagModalOpen(true);
  };

  const handleSaveTag = async () => {
    try {
      setTagSaving(true);
      setTagError('');
      if (tagEdit) {
        await updateMarketingTag(user, tagEdit.id, tagForm);
      } else {
        await createMarketingTag(user, tagForm);
      }
      setTagModalOpen(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setTagError(err.message || 'Erro ao salvar tag.');
    } finally {
      setTagSaving(false);
    }
  };

  return (
    <div className="stack">
      <SectionCard
        title="Caixa de Entrada"
        description="Converse com leads e pacientes em um fluxo unico de atendimento."
      >
        <div className="marketing-chat-table-filters">
          <label className="marketing-chat-inline-filters__item">
            <span>Status</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="marketing-chat-inline-filters__item marketing-chat-inline-filters__item--search">
            <span>Busca</span>
            <input
              type="text"
              value={search}
              placeholder="Nome, canal, departamento..."
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          {selectedCount > 0 ? (
            <div className="marketing-chat-bulk-actions">
              <span className="marketing-chat-pill">{selectedCount} selecionadas</span>
              <button type="button" className="button secondary" disabled={bulkBusy} onClick={() => handleBulkAction('resolve')}>
                Resolver
              </button>
              <label className="marketing-chat-inline-filters__item">
                <span>Atendente</span>
                <select value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)}>
                  {attendants.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="button secondary" disabled={bulkBusy || !bulkAssignee} onClick={() => handleBulkAction('assign', { assignee: bulkAssignee })}>
                Alterar atendente
              </button>
              <label className="marketing-chat-inline-filters__item">
                <span>Departamento</span>
                <select value={bulkDepartment} onChange={(e) => setBulkDepartment(e.target.value)}>
                  {departments.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="button secondary" disabled={bulkBusy || !bulkDepartment} onClick={() => handleBulkAction('setDepartment', { department: bulkDepartment })}>
                Alterar departamento
              </button>
              <label className="marketing-chat-inline-filters__item">
                <span>Tag</span>
                <select value={bulkTag} onChange={(e) => setBulkTag(e.target.value)}>
                  {tags.map((item) => (
                    <option key={item.id} value={item.name}>{item.name}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="button secondary" disabled={bulkBusy || !bulkTag} onClick={() => handleBulkAction('applyTag', { tag: bulkTag })}>
                Aplicar tag
              </button>
            </div>
          ) : null}
        </div>
        {bulkError ? <p className="alert error">{bulkError}</p> : null}

        {loading ? <p className="muted">Carregando conversas...</p> : null}
        {!loading && error ? (
          <div className="marketing-chat-empty-state">
            <strong>Falha ao carregar conversas.</strong>
            <p className="muted">{error}</p>
            <button type="button" className="button secondary" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </button>
          </div>
        ) : null}

        {!loading && !error && result.data.length === 0 ? (
          <div className="marketing-chat-empty-state">
            <strong>Nenhuma conversa encontrada.</strong>
            <p className="muted">Ajuste os filtros para localizar conversas neste recorte.</p>
          </div>
        ) : null}

        {!loading && !error && result.data.length > 0 ? (
          <>
            <div className="marketing-chat-inbox-layout">
              <aside className="marketing-chat-inbox-list">
                {result.data.map((item) => {
                  const active = item.id === selectedId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`marketing-chat-inbox-item${active ? ' marketing-chat-inbox-item--active' : ''}`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <div className="marketing-chat-inbox-item__line">
                        <label className="marketing-chat-inline-check">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedRows[item.id])}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelectRow(item.id);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </label>
                        <strong>{item.contactName}</strong>
                        {item.unreadCount > 0 ? (
                          <span className="marketing-chat-pill">{item.unreadCount}</span>
                        ) : null}
                      </div>
                      <div className="marketing-chat-inbox-item__line muted">
                        <span>{item.channel}</span>
                        <span>{formatHour(item.lastMessageAt)}</span>
                      </div>
                      <p className="marketing-chat-inbox-item__preview muted">{item.preview}</p>
                    </button>
                  );
                })}
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
                {!detailsLoading && details ? (
                  <>
                    <header className="marketing-chat-thread__header">
                      <div>
                        <h3>{details.contactName}</h3>
                        <p className="muted">{details.channel} • {details.department} • {details.assignee}</p>
                      </div>
                      <div className="marketing-chat-thread__header-badges">
                        <span className="marketing-chat-pill">{details.status.replace('_', ' ')}</span>
                        <span className="marketing-chat-pill">{details.iaMode}</span>
                      </div>
                    </header>

                    <div className="marketing-chat-thread__messages">
                      {(details.messages || []).map((msg) => (
                        <article
                          key={msg.id}
                          className={`marketing-chat-message marketing-chat-message--${msg.direction}`}
                        >
                          <strong>{msg.author}</strong>
                          <p>{msg.text}</p>
                          <span className="muted">{formatHour(msg.at)}</span>
                        </article>
                      ))}
                    </div>

                    <div className="marketing-chat-thread__composer">
                      <textarea rows={2} placeholder="Digite uma resposta..." value={composerText} onChange={(e) => setComposerText(e.target.value)} />
                      <div className="marketing-chat-thread__composer-actions">
                        <button type="button" className="button secondary">Anexar</button>
                        <button type="button" className="button secondary">Agendar</button>
                        <button type="button" className="button primary" onClick={handleSendMessage} disabled={savingMessage || !composerText.trim()}>
                          {savingMessage ? 'Enviando...' : 'Enviar'}
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}
              </section>

              <aside className="marketing-chat-context">
                <h4>Contexto da conversa</h4>
                {details ? (
                  <>
                    <div className="marketing-chat-context__block">
                      <div className="marketing-chat-context__actions-line">
                        <strong>Tags</strong>
                        <button type="button" className="button secondary" onClick={openNewTagModal}>Nova tag</button>
                      </div>
                      <div className="marketing-chat-tags">
                        {(details.tags || []).map((tag) => (
                          <button key={tag} type="button" className="marketing-chat-tag marketing-chat-tag--button" onClick={() => openEditTagModal(tag)}>
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="marketing-chat-context__block">
                      <strong>Anotacoes</strong>
                      <ul className="marketing-chat-list">
                        {(details.notes || []).map((note) => (
                          <li key={note} className="marketing-chat-list__item">
                            <span>{note}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="marketing-chat-context__block">
                      <strong>Acoes rapidas</strong>
                      <div className="marketing-chat-context__actions">
                        <button type="button" className="button secondary">Atribuir atendente</button>
                        <button type="button" className="button secondary">Vincular departamento</button>
                        <button type="button" className="button secondary">Resolver conversa</button>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="muted">Selecione uma conversa para abrir o contexto.</p>
                )}
              </aside>
            </div>
            <div className="marketing-chat-pagination">
              <button type="button" className="button secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Anterior
              </button>
              <span>Pagina {page} de {result.totalPages}</span>
              <button type="button" className="button secondary" disabled={page >= result.totalPages} onClick={() => setPage((p) => Math.min(result.totalPages, p + 1))}>
                Proxima
              </button>
            </div>
          </>
        ) : null}
      </SectionCard>

      {tagModalOpen ? (
        <div className="marketing-chat-modal-backdrop" role="presentation">
          <div className="marketing-chat-modal">
            <header className="marketing-chat-modal__header">
              <h3>{tagEdit ? 'Editar tag' : 'Nova tag'}</h3>
              <button type="button" className="button secondary" onClick={() => setTagModalOpen(false)}>Fechar</button>
            </header>
            <div className="marketing-chat-modal__body">
              <label className="field">
                <span className="field-label">Nome</span>
                <input value={tagForm.name} onChange={(e) => setTagForm((p) => ({ ...p, name: e.target.value }))} />
              </label>
              <label className="field">
                <span className="field-label">Cor</span>
                <input value={tagForm.color} onChange={(e) => setTagForm((p) => ({ ...p, color: e.target.value }))} />
              </label>
              {tagError ? <p className="alert error">{tagError}</p> : null}
            </div>
            <footer className="marketing-chat-modal__footer">
              <button type="button" className="button secondary" onClick={() => setTagModalOpen(false)}>Cancelar</button>
              <button type="button" className="button primary" disabled={tagSaving} onClick={handleSaveTag}>
                {tagSaving ? 'Salvando...' : 'Salvar tag'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
