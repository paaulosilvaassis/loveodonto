import { useEffect, useMemo, useState } from 'react';
import { SectionCard } from '../../../components/SectionCard.jsx';
import {
  createMarketingAutomation,
  deleteMarketingAutomation,
  listMarketingAttendants,
  listMarketingAutomations,
  listMarketingAutomationRuns,
  listMarketingDepartments,
  previewMarketingTemplate,
  runMarketingAutomationNow,
  updateMarketingAutomation,
} from '../../../services/marketingChatService.js';
import { useAuth } from '../../../auth/useAuth.js';

const STATUS_OPTIONS = [
  { id: 'todos', label: 'Todos' },
  { id: 'active', label: 'Ativa' },
  { id: 'inactive', label: 'Inativa' },
];

const CHANNEL_OPTIONS = ['WhatsApp', 'Instagram', 'Facebook', 'Webchat'];
const TRIGGER_OPTIONS = ['manual', 'new_lead', 'no_reply', 'conversation_resolved', 'conversation_created', 'tag_added', 'scheduled_time', 'appointment_reminder'];
const STEP_ACTION_OPTIONS = ['send_message', 'wait', 'add_tag', 'remove_tag', 'assign_department', 'assign_attendant', 'resolve_conversation', 'reopen_conversation', 'webhook_outbound'];
const CONDITION_FIELDS = ['conversation_status', 'channel', 'tag_exists', 'department_id', 'attendant_id', 'contact_last_interaction_at', 'no_reply_minutes', 'contact_has_tag', 'conversation_created_at', 'scheduled_time_window'];
const CONDITION_OPERATORS = ['equals', 'not_equals', 'in', 'not_in', 'greater_than', 'less_than', 'contains', 'exists'];

const EMPTY_FORM = {
  name: '',
  description: '',
  status: 'active',
  trigger: 'manual',
  channel: 'WhatsApp',
  conditionEntry: '',
  delayMinutes: 0,
  actionMessage: '',
  departmentId: '',
  assigneeId: '',
};

function formatDateTime(value) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 16);
}

export default function MarketingChatAutomationsPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('todos');
  const [channel, setChannel] = useState('todos');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ data: [], totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [departments, setDepartments] = useState([]);
  const [attendants, setAttendants] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [steps, setSteps] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [runsResult, setRunsResult] = useState({ data: [], totalPages: 1, page: 1 });
  const [runsPage, setRunsPage] = useState(1);
  const [runsStatus, setRunsStatus] = useState('todos');
  const [runsSearch, setRunsSearch] = useState('');
  const [templatePreview, setTemplatePreview] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      listMarketingAutomations({ user, status, channel, search, page, pageSize: 8 }),
      listMarketingDepartments(user),
      listMarketingAttendants(user),
      listMarketingAutomationRuns({ user, status: runsStatus, search: runsSearch, page: runsPage, pageSize: 8 }),
    ])
      .then(([data, departmentsData, attendantsData, runsData]) => {
        if (!active) return;
        setResult(data);
        setDepartments(departmentsData);
        setAttendants(attendantsData);
        setRunsResult(runsData);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Erro ao carregar automacoes.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, status, channel, search, page, reloadKey, runsStatus, runsSearch, runsPage]);

  const departmentsMap = useMemo(
    () => Object.fromEntries(departments.map((item) => [item.id, item.name])),
    [departments]
  );
  const attendantsMap = useMemo(
    () => Object.fromEntries(attendants.map((item) => [item.id, item.name])),
    [attendants]
  );

  const openCreateModal = () => {
    setEditingId('');
    setSaveError('');
    setForm(EMPTY_FORM);
    setSteps([
      {
        order: 1,
        type: 'wait',
        message: '',
        minutes: 0,
        channel: 'WhatsApp',
        condition: '',
        fallbackMessage: '',
        conditionMode: 'all',
        conditionRules: [{ field: 'conversation_status', operator: 'equals', value: 'aberta' }],
      },
      {
        order: 2,
        type: 'send_message',
        message: '',
        minutes: 0,
        channel: 'WhatsApp',
        condition: '',
        fallbackMessage: '',
        conditionMode: 'all',
        conditionRules: [{ field: 'conversation_status', operator: 'equals', value: 'aberta' }],
      },
    ]);
    setModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingId(item.id);
    setSaveError('');
    setForm({
      name: item.name || '',
      description: item.description || '',
      status: item.status || 'active',
      trigger: item.trigger || 'manual',
      channel: item.channel || 'WhatsApp',
      conditionEntry: item.conditionEntry || '',
      delayMinutes: Number(item.delayMinutes || 0),
      actionMessage: item.actionMessage || '',
      departmentId: item.departmentId || '',
      assigneeId: item.assigneeId || '',
    });
    setSteps(
      Array.isArray(item.steps) && item.steps.length > 0
        ? item.steps.map((step, idx) => ({
          id: step.id,
          order: Number(step.order || idx + 1),
          type: step.type || 'send_message',
          message: step.config?.message || '',
          minutes: Number(step.config?.minutes || 0),
          channel: step.config?.channel || item.channel || 'WhatsApp',
          condition: step.config?.condition || '',
          fallbackMessage: step.config?.fallbackMessage || '',
          conditionMode: step.config?.conditionDsl?.mode || 'all',
          conditionRules: Array.isArray(step.config?.conditionDsl?.rules) && step.config.conditionDsl.rules.length > 0
            ? step.config.conditionDsl.rules.map((rule) => ({
              field: rule.field || 'conversation_status',
              operator: rule.operator || 'equals',
              value: rule.value ?? '',
            }))
            : [{ field: 'conversation_status', operator: 'equals', value: 'aberta' }],
        }))
        : [{
          order: 1,
          type: 'send_message',
          message: item.actionMessage || '',
          minutes: Number(item.delayMinutes || 0),
          channel: item.channel || 'WhatsApp',
          condition: '',
          fallbackMessage: '',
          conditionMode: 'all',
          conditionRules: [{ field: 'conversation_status', operator: 'equals', value: 'aberta' }],
        }]
    );
    setModalOpen(true);
  };

  const handleToggleStatus = async (item) => {
    try {
      setError('');
      await updateMarketingAutomation(user, item.id, { status: item.status === 'active' ? 'inactive' : 'active' });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || 'Erro ao atualizar status da automacao.');
    }
  };

  const handleDelete = async (item) => {
    const ok = window.confirm(`Excluir a automacao "${item.name}"?`);
    if (!ok) return;
    try {
      setError('');
      await deleteMarketingAutomation(user, item.id);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || 'Erro ao excluir automacao.');
    }
  };

  const handleRunNow = async (item) => {
    try {
      setError('');
      await runMarketingAutomationNow(user, item.id);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || 'Erro ao executar automacao.');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveError('');
      const payload = {
        ...form,
        steps: steps.map((step, idx) => ({
          id: step.id,
          order: idx + 1,
          type: step.type,
          config: step.type === 'wait'
            ? {
              minutes: Number(step.minutes || 0),
              channel: step.channel || form.channel || 'WhatsApp',
              condition: step.condition || '',
              conditionDsl: {
                mode: step.conditionMode || 'all',
                rules: (step.conditionRules || []).map((rule) => ({
                  field: rule.field || 'conversation_status',
                  operator: rule.operator || 'equals',
                  value: rule.value ?? '',
                })),
              },
              fallbackMessage: step.fallbackMessage || '',
            }
            : {
              message: String(step.message || ''),
              channel: step.channel || form.channel || 'WhatsApp',
              condition: step.condition || '',
              conditionDsl: {
                mode: step.conditionMode || 'all',
                rules: (step.conditionRules || []).map((rule) => ({
                  field: rule.field || 'conversation_status',
                  operator: rule.operator || 'equals',
                  value: rule.value ?? '',
                })),
              },
              fallbackMessage: step.fallbackMessage || '',
            },
        })),
      };
      if (editingId) {
        await updateMarketingAutomation(user, editingId, payload);
      } else {
        await createMarketingAutomation(user, payload);
      }
      setModalOpen(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setSaveError(err.message || 'Erro ao salvar automacao.');
    } finally {
      setSaving(false);
    }
  };

  const addStep = () => {
    setSteps((prev) => [...prev, {
      order: prev.length + 1,
      type: 'send_message',
      message: '',
      minutes: 0,
      channel: form.channel || 'WhatsApp',
      condition: '',
      fallbackMessage: '',
      conditionMode: 'all',
      conditionRules: [{ field: 'conversation_status', operator: 'equals', value: 'aberta' }],
    }]);
  };

  const updateStep = (index, patch) => {
    setSteps((prev) => prev.map((step, idx) => (idx === index ? { ...step, ...patch } : step)));
  };

  const removeStep = (index) => {
    setSteps((prev) => prev.filter((_, idx) => idx !== index));
  };

  const addConditionRule = (stepIndex) => {
    setSteps((prev) => prev.map((step, idx) => {
      if (idx !== stepIndex) return step;
      return {
        ...step,
        conditionRules: [...(step.conditionRules || []), { field: 'conversation_status', operator: 'equals', value: 'aberta' }],
      };
    }));
  };

  const updateConditionRule = (stepIndex, ruleIndex, patch) => {
    setSteps((prev) => prev.map((step, idx) => {
      if (idx !== stepIndex) return step;
      return {
        ...step,
        conditionRules: (step.conditionRules || []).map((rule, rIdx) => (rIdx === ruleIndex ? { ...rule, ...patch } : rule)),
      };
    }));
  };

  const removeConditionRule = (stepIndex, ruleIndex) => {
    setSteps((prev) => prev.map((step, idx) => {
      if (idx !== stepIndex) return step;
      const nextRules = (step.conditionRules || []).filter((_, rIdx) => rIdx !== ruleIndex);
      return {
        ...step,
        conditionRules: nextRules.length > 0 ? nextRules : [{ field: 'conversation_status', operator: 'equals', value: 'aberta' }],
      };
    }));
  };

  const handlePreviewTemplate = async (template) => {
    try {
      const resultPreview = await previewMarketingTemplate(user, { template });
      setTemplatePreview(resultPreview.preview || '');
    } catch (err) {
      setTemplatePreview(err.message || 'Erro ao gerar preview.');
    }
  };

  return (
    <div className="stack">
      <SectionCard
        title="Automacoes"
        description="Fluxos automatizados com gatilhos, condicoes e passos para escalar o atendimento."
      >
        <div className="marketing-chat-table-filters">
          <label className="marketing-chat-inline-filters__item">
            <span>Status</span>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="marketing-chat-inline-filters__item">
            <span>Canal</span>
            <select value={channel} onChange={(e) => { setChannel(e.target.value); setPage(1); }}>
              <option value="todos">Todos</option>
              {CHANNEL_OPTIONS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="marketing-chat-inline-filters__item marketing-chat-inline-filters__item--search">
            <span>Busca</span>
            <input value={search} placeholder="Nome, gatilho ou condicao..." onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </label>
          <button type="button" className="button primary" onClick={openCreateModal}>Nova automacao</button>
        </div>

        {loading ? <p className="muted">Carregando automacoes...</p> : null}
        {!loading && error ? (
          <div className="marketing-chat-empty-state">
            <strong>Falha ao carregar automacoes.</strong>
            <p className="muted">{error}</p>
            <button type="button" className="button secondary" onClick={() => setReloadKey((k) => k + 1)}>Tentar novamente</button>
          </div>
        ) : null}
        {!loading && !error && result.data.length === 0 ? (
          <div className="marketing-chat-empty-state">
            <strong>Nenhuma automacao encontrada.</strong>
            <p className="muted">Crie uma automacao para iniciar fluxos de marketing e atendimento.</p>
          </div>
        ) : null}

        {!loading && !error && result.data.length > 0 ? (
          <>
            <div className="marketing-chat-table-wrap">
              <table className="marketing-chat-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Canal</th>
                    <th>Gatilho</th>
                    <th>Status</th>
                    <th>Passos</th>
                    <th>Ultima execucao</th>
                    <th>Responsavel</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        <p className="muted">{item.description || 'Sem descricao'}</p>
                      </td>
                      <td>{item.channel}</td>
                      <td>{item.trigger}</td>
                      <td><span className="marketing-chat-pill">{item.status === 'active' ? 'ativa' : 'inativa'}</span></td>
                      <td>{Array.isArray(item.steps) ? item.steps.length : 0}</td>
                      <td>
                        <small className="muted">
                          {formatDateTime(item.lastRunAt)} {item.lastRunStatus ? `• ${item.lastRunStatus}` : ''}
                        </small>
                      </td>
                      <td>{attendantsMap[item.assigneeId] || departmentsMap[item.departmentId] || '-'}</td>
                      <td>
                        <div className="marketing-chat-table-actions">
                          <button type="button" className="button secondary" onClick={() => openEditModal(item)}>Editar</button>
                          <button type="button" className="button secondary" onClick={() => handleToggleStatus(item)}>
                            {item.status === 'active' ? 'Inativar' : 'Ativar'}
                          </button>
                          <button type="button" className="button secondary" onClick={() => handleRunNow(item)}>Executar agora</button>
                          <button type="button" className="button secondary" onClick={() => handleDelete(item)}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="marketing-chat-pagination">
              <button type="button" className="button secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button>
              <span>Pagina {page} de {result.totalPages}</span>
              <button type="button" className="button secondary" disabled={page >= result.totalPages} onClick={() => setPage((p) => Math.min(result.totalPages, p + 1))}>Proxima</button>
            </div>
          </>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Historico de execucao"
        description="Acompanhe runs da fila de jobs com status, tempo e erros por automacao."
      >
        <div className="marketing-chat-table-filters">
          <label className="marketing-chat-inline-filters__item">
            <span>Status</span>
            <select value={runsStatus} onChange={(e) => { setRunsStatus(e.target.value); setRunsPage(1); }}>
              <option value="todos">Todos</option>
              <option value="success">Sucesso</option>
              <option value="failed">Falha</option>
              <option value="running">Em execucao</option>
            </select>
          </label>
          <label className="marketing-chat-inline-filters__item marketing-chat-inline-filters__item--search">
            <span>Busca</span>
            <input value={runsSearch} placeholder="Automacao, trigger, canal..." onChange={(e) => { setRunsSearch(e.target.value); setRunsPage(1); }} />
          </label>
        </div>
        {runsResult.data.length === 0 ? (
          <div className="marketing-chat-empty-state">
            <strong>Sem execucoes registradas no filtro atual.</strong>
            <p className="muted">Use "Executar agora" ou aguarde gatilhos do runtime.</p>
          </div>
        ) : (
          <>
            <div className="marketing-chat-table-wrap">
              <table className="marketing-chat-table">
                <thead>
                  <tr>
                    <th>Inicio</th>
                    <th>Automacao</th>
                    <th>Trigger</th>
                    <th>Status</th>
                    <th>Duracao (ms)</th>
                    <th>Canal</th>
                    <th>Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {runsResult.data.map((run) => (
                    <tr key={run.id}>
                      <td>{formatDateTime(run.startedAt)}</td>
                      <td>{run.automationName}</td>
                      <td>{run.triggerType}</td>
                      <td><span className="marketing-chat-pill">{run.status}</span></td>
                      <td>{run.durationMs || 0}</td>
                      <td>{run.channel || '-'}</td>
                      <td>{run.error || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="marketing-chat-pagination">
              <button type="button" className="button secondary" disabled={runsPage <= 1} onClick={() => setRunsPage((p) => Math.max(1, p - 1))}>Anterior</button>
              <span>Pagina {runsPage} de {runsResult.totalPages}</span>
              <button type="button" className="button secondary" disabled={runsPage >= runsResult.totalPages} onClick={() => setRunsPage((p) => Math.min(runsResult.totalPages, p + 1))}>Proxima</button>
            </div>
          </>
        )}
      </SectionCard>

      {modalOpen ? (
        <div className="marketing-chat-modal-backdrop" role="presentation">
          <div className="marketing-chat-modal marketing-chat-modal--wide">
            <header className="marketing-chat-modal__header">
              <h3>{editingId ? 'Editar automacao' : 'Nova automacao'}</h3>
              <button type="button" className="button secondary" onClick={() => setModalOpen(false)}>Fechar</button>
            </header>
            <div className="marketing-chat-modal__body">
              <div className="marketing-chat-grid-2">
                <label className="field">
                  <span className="field-label">Nome</span>
                  <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
                </label>
                <label className="field">
                  <span className="field-label">Status</span>
                  <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
                    <option value="active">Ativa</option>
                    <option value="inactive">Inativa</option>
                  </select>
                </label>
              </div>
              <label className="field">
                <span className="field-label">Descricao</span>
                <textarea rows={2} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
              </label>
              <div className="marketing-chat-grid-3">
                <label className="field">
                  <span className="field-label">Gatilho</span>
                  <select value={form.trigger} onChange={(e) => setForm((prev) => ({ ...prev, trigger: e.target.value }))}>
                    {TRIGGER_OPTIONS.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Canal</span>
                  <select value={form.channel} onChange={(e) => setForm((prev) => ({ ...prev, channel: e.target.value }))}>
                    {CHANNEL_OPTIONS.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Delay (minutos)</span>
                  <input type="number" min={0} value={form.delayMinutes} onChange={(e) => setForm((prev) => ({ ...prev, delayMinutes: Number(e.target.value || 0) }))} />
                </label>
              </div>
              <label className="field">
                <span className="field-label">Condicao de entrada</span>
                <textarea rows={2} value={form.conditionEntry} onChange={(e) => setForm((prev) => ({ ...prev, conditionEntry: e.target.value }))} />
              </label>
              <label className="field">
                <span className="field-label">Acao de envio de mensagem</span>
                <textarea rows={2} value={form.actionMessage} onChange={(e) => setForm((prev) => ({ ...prev, actionMessage: e.target.value }))} />
              </label>
              <div className="marketing-chat-grid-2">
                <label className="field">
                  <span className="field-label">Departamento</span>
                  <select value={form.departmentId} onChange={(e) => setForm((prev) => ({ ...prev, departmentId: e.target.value }))}>
                    <option value="">Nao vinculado</option>
                    {departments.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Responsavel</span>
                  <select value={form.assigneeId} onChange={(e) => setForm((prev) => ({ ...prev, assigneeId: e.target.value }))}>
                    <option value="">Nao vinculado</option>
                    {attendants.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="marketing-chat-steps">
                <div className="marketing-chat-steps__header">
                  <strong>Passos da automacao</strong>
                  <button type="button" className="button secondary" onClick={addStep}>Adicionar passo</button>
                </div>
                {steps.map((step, index) => (
                  <div key={step.id || `${step.type}-${index}`} className="marketing-chat-step-row">
                    <span className="marketing-chat-pill">#{index + 1}</span>
                    <select value={step.type} onChange={(e) => updateStep(index, { type: e.target.value })}>
                      {STEP_ACTION_OPTIONS.map((item) => (
                        <option key={`${item}-${index}`} value={item}>{item}</option>
                      ))}
                    </select>
                    {step.type === 'wait' ? (
                      <input type="number" min={0} value={step.minutes} onChange={(e) => updateStep(index, { minutes: Number(e.target.value || 0) })} placeholder="Minutos" />
                    ) : (
                      <input value={step.message} onChange={(e) => updateStep(index, { message: e.target.value })} placeholder="Mensagem/template do passo" />
                    )}
                    <button type="button" className="button secondary" onClick={() => removeStep(index)}>Remover</button>
                    <select value={step.channel || form.channel || 'WhatsApp'} onChange={(e) => updateStep(index, { channel: e.target.value })}>
                      {CHANNEL_OPTIONS.map((item) => (
                        <option key={`${item}-${index}`} value={item}>{item}</option>
                      ))}
                    </select>
                    <input value={step.condition || ''} onChange={(e) => updateStep(index, { condition: e.target.value })} placeholder="Condicao (ex: conversation_status=aberta)" />
                    <input value={step.fallbackMessage || ''} onChange={(e) => updateStep(index, { fallbackMessage: e.target.value })} placeholder="Fallback em erro (opcional)" />
                    <select value={step.conditionMode || 'all'} onChange={(e) => updateStep(index, { conditionMode: e.target.value })}>
                      <option value="all">all</option>
                      <option value="any">any</option>
                    </select>
                    <button type="button" className="button secondary" onClick={() => addConditionRule(index)}>Adicionar regra</button>
                    {(step.conditionRules || []).map((rule, rIdx) => (
                      <div key={`rule-${index}-${rIdx}`} className="marketing-chat-condition-row">
                        <select value={rule.field} onChange={(e) => updateConditionRule(index, rIdx, { field: e.target.value })}>
                          {CONDITION_FIELDS.map((field) => (
                            <option key={`${field}-${index}-${rIdx}`} value={field}>{field}</option>
                          ))}
                        </select>
                        <select value={rule.operator} onChange={(e) => updateConditionRule(index, rIdx, { operator: e.target.value })}>
                          {CONDITION_OPERATORS.map((op) => (
                            <option key={`${op}-${index}-${rIdx}`} value={op}>{op}</option>
                          ))}
                        </select>
                        <input value={String(rule.value ?? '')} onChange={(e) => updateConditionRule(index, rIdx, { value: e.target.value })} placeholder="valor" />
                        <button type="button" className="button secondary" onClick={() => removeConditionRule(index, rIdx)}>Remover regra</button>
                      </div>
                    ))}
                    {step.type === 'send_message' ? (
                      <button type="button" className="button secondary" onClick={() => handlePreviewTemplate(step.message)}>
                        Preview template
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              {templatePreview ? (
                <label className="field">
                  <span className="field-label">Preview do template</span>
                  <textarea rows={3} readOnly value={templatePreview} />
                </label>
              ) : null}
              {saveError ? <p className="alert error">{saveError}</p> : null}
            </div>
            <footer className="marketing-chat-modal__footer">
              <button type="button" className="button secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button type="button" className="button primary" disabled={saving} onClick={handleSave}>
                {saving ? 'Salvando...' : 'Salvar automacao'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
