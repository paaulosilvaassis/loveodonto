import { useEffect, useMemo, useState } from 'react';
import { SectionCard } from '../../../components/SectionCard.jsx';
import {
  bulkUpdateMarketingConversations,
  createMarketingAttendant,
  createMarketingDepartment,
  createMarketingTag,
  deleteMarketingAttendant,
  deleteMarketingDepartment,
  deleteMarketingTag,
  listMarketingAttendants,
  listMarketingChannels,
  listMarketingDepartments,
  listMarketingInboxConversations,
  listMarketingTags,
  updateMarketingAttendant,
  updateMarketingDepartment,
  updateMarketingTag,
} from '../../../services/marketingChatService.js';
import { useAuth } from '../../../auth/useAuth.js';

const SECTION_TAGS = 'tags';
const SECTION_DEPARTMENTS = 'departments';
const SECTION_ATTENDANTS = 'attendants';

const EMPTY_DEPARTMENT = { name: '', description: '', active: true };
const EMPTY_ATTENDANT = { name: '', email: '', role: 'atendimento', active: true, departmentIds: [], channelIds: [] };
const EMPTY_TAG = { name: '', color: '#6366F1' };

export default function MarketingChatOperationsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [tags, setTags] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [attendants, setAttendants] = useState([]);
  const [channels, setChannels] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [tagFilter, setTagFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [departmentStatusFilter, setDepartmentStatusFilter] = useState('todos');
  const [attendantFilter, setAttendantFilter] = useState('');
  const [attendantStatusFilter, setAttendantStatusFilter] = useState('todos');
  const [convFilter, setConvFilter] = useState('');
  const [selectedConversation, setSelectedConversation] = useState('');
  const [linkDepartmentId, setLinkDepartmentId] = useState('');
  const [linkAttendantId, setLinkAttendantId] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState('');

  const [modalSection, setModalSection] = useState('');
  const [editingId, setEditingId] = useState('');
  const [tagForm, setTagForm] = useState(EMPTY_TAG);
  const [departmentForm, setDepartmentForm] = useState(EMPTY_DEPARTMENT);
  const [attendantForm, setAttendantForm] = useState(EMPTY_ATTENDANT);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      listMarketingTags(user),
      listMarketingDepartments(user),
      listMarketingAttendants(user),
      listMarketingChannels({ user }),
      listMarketingInboxConversations({ user, page: 1, pageSize: 30 }),
    ])
      .then(([tagsData, departmentsData, attendantsData, channelsData, conversationsData]) => {
        if (!active) return;
        setTags(tagsData);
        setDepartments(departmentsData);
        setAttendants(attendantsData);
        setChannels(channelsData);
        setConversations(conversationsData.data || []);
        if (!selectedConversation && conversationsData.data?.[0]?.id) {
          setSelectedConversation(conversationsData.data[0].id);
        }
      })
      .catch((err) => {
        if (active) setError(err.message || 'Erro ao carregar gestao de atendimento.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey, user]);

  const openTagModal = (tag) => {
    setModalSection(SECTION_TAGS);
    setEditingId(tag?.id || '');
    setTagForm(tag ? { name: tag.name, color: tag.color || '#6366F1' } : EMPTY_TAG);
    setSaveError('');
  };

  const openDepartmentModal = (department) => {
    setModalSection(SECTION_DEPARTMENTS);
    setEditingId(department?.id || '');
    setDepartmentForm(department ? {
      name: department.name || '',
      description: department.description || '',
      active: department.active !== false,
    } : EMPTY_DEPARTMENT);
    setSaveError('');
  };

  const openAttendantModal = (attendant) => {
    setModalSection(SECTION_ATTENDANTS);
    setEditingId(attendant?.id || '');
    setAttendantForm(attendant ? {
      name: attendant.name || '',
      email: attendant.email || '',
      role: attendant.role || 'atendimento',
      active: attendant.active !== false,
      departmentIds: Array.isArray(attendant.departmentIds) ? attendant.departmentIds : [],
      channelIds: Array.isArray(attendant.channelIds) ? attendant.channelIds : [],
    } : EMPTY_ATTENDANT);
    setSaveError('');
  };

  const closeModal = () => {
    setModalSection('');
    setEditingId('');
    setSaveError('');
    setSaving(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveError('');
      if (modalSection === SECTION_TAGS) {
        if (editingId) await updateMarketingTag(user, editingId, tagForm);
        else await createMarketingTag(user, tagForm);
      }
      if (modalSection === SECTION_DEPARTMENTS) {
        if (editingId) await updateMarketingDepartment(user, editingId, departmentForm);
        else await createMarketingDepartment(user, departmentForm);
      }
      if (modalSection === SECTION_ATTENDANTS) {
        if (editingId) await updateMarketingAttendant(user, editingId, attendantForm);
        else await createMarketingAttendant(user, attendantForm);
      }
      closeModal();
      setReloadKey((k) => k + 1);
    } catch (err) {
      setSaveError(err.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (section, item) => {
    const ok = window.confirm(`Excluir "${item.name}"?`);
    if (!ok) return;
    try {
      setError('');
      if (section === SECTION_TAGS) await deleteMarketingTag(user, item.id);
      if (section === SECTION_DEPARTMENTS) await deleteMarketingDepartment(user, item.id);
      if (section === SECTION_ATTENDANTS) await deleteMarketingAttendant(user, item.id);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || 'Erro ao excluir item.');
    }
  };

  const filteredConversations = useMemo(() => {
    const normalized = String(convFilter || '').toLowerCase();
    return conversations.filter((item) => {
      if (!normalized) return true;
      return `${item.contactName} ${item.channel} ${item.department} ${item.assignee}`.toLowerCase().includes(normalized);
    });
  }, [conversations, convFilter]);

  const selectedConversationData = useMemo(
    () => conversations.find((item) => item.id === selectedConversation),
    [conversations, selectedConversation]
  );

  const filteredTags = useMemo(() => {
    const normalized = String(tagFilter || '').toLowerCase();
    return tags.filter((item) => (normalized ? String(item.name || '').toLowerCase().includes(normalized) : true));
  }, [tags, tagFilter]);

  const filteredDepartments = useMemo(() => {
    const normalized = String(departmentFilter || '').toLowerCase();
    return departments.filter((item) => {
      const textOk = normalized
        ? `${item.name || ''} ${item.description || ''}`.toLowerCase().includes(normalized)
        : true;
      const statusOk = departmentStatusFilter === 'todos'
        ? true
        : departmentStatusFilter === 'active'
          ? item.active
          : !item.active;
      return textOk && statusOk;
    });
  }, [departments, departmentFilter, departmentStatusFilter]);

  const filteredAttendants = useMemo(() => {
    const normalized = String(attendantFilter || '').toLowerCase();
    return attendants.filter((item) => {
      const textOk = normalized
        ? `${item.name || ''} ${item.email || ''} ${item.role || ''}`.toLowerCase().includes(normalized)
        : true;
      const statusOk = attendantStatusFilter === 'todos'
        ? true
        : attendantStatusFilter === 'active'
          ? item.active
          : !item.active;
      return textOk && statusOk;
    });
  }, [attendants, attendantFilter, attendantStatusFilter]);

  const handleLinkConversation = async () => {
    if (!selectedConversation) return;
    try {
      setLinkBusy(true);
      setLinkError('');
      if (linkDepartmentId) {
        await bulkUpdateMarketingConversations(user, {
          conversationIds: [selectedConversation],
          action: 'setDepartment',
          payload: { department: linkDepartmentId },
        });
      }
      if (linkAttendantId) {
        await bulkUpdateMarketingConversations(user, {
          conversationIds: [selectedConversation],
          action: 'assign',
          payload: { assignee: linkAttendantId },
        });
      }
      setReloadKey((k) => k + 1);
    } catch (err) {
      setLinkError(err.message || 'Erro ao vincular conversa.');
    } finally {
      setLinkBusy(false);
    }
  };

  return (
    <div className="stack">
      <SectionCard
        title="Gestao de Atendimento"
        description="Administre tags, departamentos, atendentes e vinculos operacionais de conversas."
      >
        {loading ? <p className="muted">Carregando estrutura de atendimento...</p> : null}
        {!loading && error ? (
          <div className="marketing-chat-empty-state">
            <strong>Falha ao carregar dados de atendimento.</strong>
            <p className="muted">{error}</p>
            <button type="button" className="button secondary" onClick={() => setReloadKey((k) => k + 1)}>Tentar novamente</button>
          </div>
        ) : null}

        {!loading && !error ? (
          <div className="marketing-chat-ops-grid">
            <article className="marketing-chat-ops-card">
              <header className="marketing-chat-ops-card__header">
                <h3>Tags</h3>
                <button type="button" className="button secondary" onClick={() => openTagModal(null)}>Nova tag</button>
              </header>
              <label className="marketing-chat-inline-filters__item marketing-chat-inline-filters__item--search">
                <span>Filtro</span>
                <input value={tagFilter} placeholder="Buscar tag..." onChange={(e) => setTagFilter(e.target.value)} />
              </label>
              {filteredTags.length === 0 ? <p className="muted">Nenhuma tag cadastrada.</p> : (
                <ul className="marketing-chat-list">
                  {filteredTags.map((item) => (
                    <li key={item.id} className="marketing-chat-list__item">
                      <span className="marketing-chat-tag" style={{ backgroundColor: item.color }}>{item.name}</span>
                      <div className="marketing-chat-table-actions">
                        <button type="button" className="button secondary" onClick={() => openTagModal(item)}>Editar</button>
                        <button type="button" className="button secondary" onClick={() => handleDelete(SECTION_TAGS, item)}>Excluir</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="marketing-chat-ops-card">
              <header className="marketing-chat-ops-card__header">
                <h3>Departamentos</h3>
                <button type="button" className="button secondary" onClick={() => openDepartmentModal(null)}>Novo depto.</button>
              </header>
              <div className="marketing-chat-table-filters">
                <label className="marketing-chat-inline-filters__item marketing-chat-inline-filters__item--search">
                  <span>Busca</span>
                  <input value={departmentFilter} placeholder="Nome ou descricao..." onChange={(e) => setDepartmentFilter(e.target.value)} />
                </label>
                <label className="marketing-chat-inline-filters__item">
                  <span>Status</span>
                  <select value={departmentStatusFilter} onChange={(e) => setDepartmentStatusFilter(e.target.value)}>
                    <option value="todos">Todos</option>
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </label>
              </div>
              {filteredDepartments.length === 0 ? <p className="muted">Nenhum departamento encontrado.</p> : (
                <ul className="marketing-chat-list">
                  {filteredDepartments.map((item) => (
                    <li key={item.id} className="marketing-chat-list__item">
                      <div>
                        <strong>{item.name}</strong>
                        <p className="muted">{item.description || 'Sem descricao'} • {item.active ? 'ativo' : 'inativo'}</p>
                      </div>
                      <div className="marketing-chat-table-actions">
                        <button type="button" className="button secondary" onClick={() => openDepartmentModal(item)}>Editar</button>
                        <button type="button" className="button secondary" onClick={() => handleDelete(SECTION_DEPARTMENTS, item)}>Excluir</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="marketing-chat-ops-card">
              <header className="marketing-chat-ops-card__header">
                <h3>Atendentes</h3>
                <button type="button" className="button secondary" onClick={() => openAttendantModal(null)}>Novo atendente</button>
              </header>
              <div className="marketing-chat-table-filters">
                <label className="marketing-chat-inline-filters__item marketing-chat-inline-filters__item--search">
                  <span>Busca</span>
                  <input value={attendantFilter} placeholder="Nome, email ou perfil..." onChange={(e) => setAttendantFilter(e.target.value)} />
                </label>
                <label className="marketing-chat-inline-filters__item">
                  <span>Status</span>
                  <select value={attendantStatusFilter} onChange={(e) => setAttendantStatusFilter(e.target.value)}>
                    <option value="todos">Todos</option>
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </label>
              </div>
              {filteredAttendants.length === 0 ? <p className="muted">Nenhum atendente encontrado.</p> : (
                <ul className="marketing-chat-list">
                  {filteredAttendants.map((item) => (
                    <li key={item.id} className="marketing-chat-list__item">
                      <div>
                        <strong>{item.name}</strong>
                        <p className="muted">{item.email || '-'} • {item.role} • {item.active ? 'ativo' : 'inativo'}</p>
                      </div>
                      <div className="marketing-chat-table-actions">
                        <button type="button" className="button secondary" onClick={() => openAttendantModal(item)}>Editar</button>
                        <button type="button" className="button secondary" onClick={() => handleDelete(SECTION_ATTENDANTS, item)}>Excluir</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Vinculos de conversa" description="Relacione conversa, departamento e atendente em fluxo operacional.">
        <div className="marketing-chat-table-filters">
          <label className="marketing-chat-inline-filters__item marketing-chat-inline-filters__item--search">
            <span>Busca conversa</span>
            <input value={convFilter} placeholder="Paciente, canal, departamento..." onChange={(e) => setConvFilter(e.target.value)} />
          </label>
          <label className="marketing-chat-inline-filters__item">
            <span>Conversa</span>
            <select value={selectedConversation} onChange={(e) => setSelectedConversation(e.target.value)}>
              {filteredConversations.map((item) => (
                <option key={item.id} value={item.id}>{item.contactName} - {item.channel}</option>
              ))}
            </select>
          </label>
          <label className="marketing-chat-inline-filters__item">
            <span>Departamento</span>
            <select value={linkDepartmentId} onChange={(e) => setLinkDepartmentId(e.target.value)}>
              <option value="">Sem alteracao</option>
              {departments.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="marketing-chat-inline-filters__item">
            <span>Atendente</span>
            <select value={linkAttendantId} onChange={(e) => setLinkAttendantId(e.target.value)}>
              <option value="">Sem alteracao</option>
              {attendants.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <button type="button" className="button primary" onClick={handleLinkConversation} disabled={linkBusy || !selectedConversation}>
            {linkBusy ? 'Vinculando...' : 'Aplicar vinculo'}
          </button>
        </div>
        {linkError ? <p className="alert error">{linkError}</p> : null}
        {selectedConversationData ? (
          <p className="muted">
            Conversa atual: <strong>{selectedConversationData.contactName}</strong> • Depto: {selectedConversationData.department} • Atendente: {selectedConversationData.assignee}
          </p>
        ) : (
          <p className="muted">Nenhuma conversa disponivel para vinculo.</p>
        )}
      </SectionCard>

      {modalSection ? (
        <div className="marketing-chat-modal-backdrop" role="presentation">
          <div className="marketing-chat-modal">
            <header className="marketing-chat-modal__header">
              <h3>
                {modalSection === SECTION_TAGS ? (editingId ? 'Editar tag' : 'Nova tag') : null}
                {modalSection === SECTION_DEPARTMENTS ? (editingId ? 'Editar departamento' : 'Novo departamento') : null}
                {modalSection === SECTION_ATTENDANTS ? (editingId ? 'Editar atendente' : 'Novo atendente') : null}
              </h3>
              <button type="button" className="button secondary" onClick={closeModal}>Fechar</button>
            </header>
            <div className="marketing-chat-modal__body">
              {modalSection === SECTION_TAGS ? (
                <>
                  <label className="field">
                    <span className="field-label">Nome</span>
                    <input value={tagForm.name} onChange={(e) => setTagForm((prev) => ({ ...prev, name: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span className="field-label">Cor</span>
                    <input value={tagForm.color} onChange={(e) => setTagForm((prev) => ({ ...prev, color: e.target.value }))} />
                  </label>
                </>
              ) : null}

              {modalSection === SECTION_DEPARTMENTS ? (
                <>
                  <label className="field">
                    <span className="field-label">Nome</span>
                    <input value={departmentForm.name} onChange={(e) => setDepartmentForm((prev) => ({ ...prev, name: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span className="field-label">Descricao</span>
                    <textarea rows={2} value={departmentForm.description} onChange={(e) => setDepartmentForm((prev) => ({ ...prev, description: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span className="field-label">Status</span>
                    <select value={departmentForm.active ? 'active' : 'inactive'} onChange={(e) => setDepartmentForm((prev) => ({ ...prev, active: e.target.value === 'active' }))}>
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                    </select>
                  </label>
                </>
              ) : null}

              {modalSection === SECTION_ATTENDANTS ? (
                <>
                  <label className="field">
                    <span className="field-label">Nome</span>
                    <input value={attendantForm.name} onChange={(e) => setAttendantForm((prev) => ({ ...prev, name: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span className="field-label">Email</span>
                    <input value={attendantForm.email} onChange={(e) => setAttendantForm((prev) => ({ ...prev, email: e.target.value }))} />
                  </label>
                  <label className="field">
                    <span className="field-label">Perfil</span>
                    <select value={attendantForm.role} onChange={(e) => setAttendantForm((prev) => ({ ...prev, role: e.target.value }))}>
                      <option value="atendimento">Atendimento</option>
                      <option value="comercial">Comercial</option>
                      <option value="financeiro">Financeiro</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Departamentos</span>
                    <select
                      multiple
                      value={attendantForm.departmentIds}
                      onChange={(e) => {
                        const values = Array.from(e.target.selectedOptions).map((item) => item.value);
                        setAttendantForm((prev) => ({ ...prev, departmentIds: values }));
                      }}
                    >
                      {departments.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Canais</span>
                    <select
                      multiple
                      value={attendantForm.channelIds}
                      onChange={(e) => {
                        const values = Array.from(e.target.selectedOptions).map((item) => item.value);
                        setAttendantForm((prev) => ({ ...prev, channelIds: values }));
                      }}
                    >
                      {channels.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
              {saveError ? <p className="alert error">{saveError}</p> : null}
            </div>
            <footer className="marketing-chat-modal__footer">
              <button type="button" className="button secondary" onClick={closeModal}>Cancelar</button>
              <button type="button" className="button primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
