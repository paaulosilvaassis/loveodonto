import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CrmLayout } from '../../crm/ui/CrmLayout.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import {
  listCrmBudgets,
  getCrmBudgetKPIs,
  createCrmBudget,
  updateCrmBudgetStatus,
  updateCrmBudget,
  BUDGET_STATUS,
  BUDGET_STATUS_LABELS,
} from '../../services/crmBudgetService.js';
import { listLeads } from '../../services/crmService.js';
import { loadDb } from '../../db/index.js';
import { SectionCard } from '../../components/SectionCard.jsx';
import { Plus, Eye, Pencil, RefreshCw, Search, X, FileText, Clock, CheckCircle, XCircle, Percent } from 'lucide-react';

const DEFAULT_MONTH_START = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};
const DEFAULT_MONTH_END = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return d.toISOString().slice(0, 10);
};

function Modal({ open, onClose, title, children, contentClass = '', scrollable }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className={`modal-content ${contentClass}`.trim()}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header flex-shrink-0">
          <h2 id="modal-title" className="text-xl font-semibold">{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">&times;</button>
        </div>
        <div className={scrollable ? 'modal-body flex-1 min-h-0 overflow-y-auto' : 'modal-body'}>{children}</div>
      </div>
    </div>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Converte itens da UI (array { description, value }) para itemsJson do serviço */
function itemsToJson(items) {
  return (items || [])
    .filter((i) => (i.description || '').trim() !== '' || Number(i.value) > 0)
    .map((i) => ({
      description: (i.description || '').trim() || 'Item',
      value: Number(i.value) || 0,
    }));
}

function itemsTotal(items) {
  return (items || []).reduce((sum, i) => sum + (Number(i.value) || 0), 0);
}

/** KPI card no padrão do CRM (Relatórios) — mesma estrutura e classes */
function KpiCard({ icon: Icon, value, label, variant }) {
  return (
    <div className={`crm-report-kpi-card crm-report-kpi-${variant || 'default'}`}>
      <div className="crm-report-kpi-header">
        {Icon && <Icon size={20} className="crm-report-kpi-icon" aria-hidden />}
      </div>
      <div className="crm-report-kpi-value">{value}</div>
      <div className="crm-report-kpi-label">{label}</div>
    </div>
  );
}

export default function CrmOrcamentosPage() {
  const { user } = useAuth();
  const [rangeStart, setRangeStart] = useState(DEFAULT_MONTH_START);
  const [rangeEnd, setRangeEnd] = useState(DEFAULT_MONTH_END);
  const [statusFilter, setStatusFilter] = useState('');
  const [queryFilter, setQueryFilter] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [modalCreate, setModalCreate] = useState(false);
  const [modalView, setModalView] = useState(null);
  const [modalEdit, setModalEdit] = useState(null);
  const [modalStatus, setModalStatus] = useState(null);
  const [deniedReason, setDeniedReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  /** Itens do modal Novo orçamento (repeatable UI) */
  const [createItems, setCreateItems] = useState([{ description: '', value: '' }]);
  /** Itens do modal Editar (repeatable UI) */
  const [editItems, setEditItems] = useState([]);

  const range = useMemo(
    () => ({
      start: rangeStart ? new Date(rangeStart).toISOString() : null,
      end: rangeEnd ? new Date(rangeEnd + 'T23:59:59.999Z').toISOString() : null,
    }),
    [rangeStart, rangeEnd]
  );

  const kpis = useMemo(
    () => getCrmBudgetKPIs({ range }),
    [range, refreshKey]
  );

  const budgets = useMemo(
    () =>
      listCrmBudgets({
        range,
        status: statusFilter || undefined,
        query: queryFilter.trim() || undefined,
        assignedToUserId: assignedFilter || undefined,
      }),
    [range, statusFilter, queryFilter, assignedFilter, refreshKey]
  );

  const db = useMemo(() => loadDb(), [refreshKey]);
  const users = db?.users || [];

  const leadById = useMemo(() => {
    const leads = listLeads();
    const map = {};
    leads.forEach((l) => { map[l.id] = l; });
    return map;
  }, [refreshKey]);

  const openCreate = useCallback(() => {
    setError('');
    setCreateItems([{ description: '', value: '' }]);
    setModalCreate(true);
  }, []);

  const addCreateItem = useCallback(() => {
    setCreateItems((prev) => [...prev, { description: '', value: '' }]);
  }, []);

  const removeCreateItem = useCallback((index) => {
    setCreateItems((prev) => (prev.length <= 1 ? [{ description: '', value: '' }] : prev.filter((_, i) => i !== index)));
  }, []);

  const updateCreateItem = useCallback((index, field, value) => {
    setCreateItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }, []);

  const openView = useCallback((budget) => {
    setModalView(budget);
    setModalEdit(null);
    setModalStatus(null);
  }, []);

  const openEdit = useCallback((budget) => {
    setModalEdit(budget);
    setModalView(null);
    setModalStatus(null);
    setError('');
    const raw = budget?.itemsJson || [];
    setEditItems(
      Array.isArray(raw) && raw.length > 0
        ? raw.map((i) => ({ description: i.description || '', value: i.value ?? '' }))
        : [{ description: '', value: '' }]
    );
  }, []);

  const addEditItem = useCallback(() => {
    setEditItems((prev) => [...prev, { description: '', value: '' }]);
  }, []);

  const removeEditItem = useCallback((index) => {
    setEditItems((prev) => (prev.length <= 1 ? [{ description: '', value: '' }] : prev.filter((_, i) => i !== index)));
  }, []);

  const updateEditItem = useCallback((index, field, value) => {
    setEditItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }, []);

  const openChangeStatus = useCallback((budget) => {
    setModalStatus(budget);
    setDeniedReason('');
    setError('');
    setModalView(null);
    setModalEdit(null);
  }, []);

  const handleCreateSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const form = e.target;
      const leadId = form.leadId?.value?.trim();
      const title = form.title?.value?.trim();
      setError('');
      if (!leadId) { setError('Selecione o lead.'); return; }
      if (!title) { setError('Título é obrigatório.'); return; }
      const itemsJson = itemsToJson(createItems);
      if (itemsJson.length === 0) { setError('Adicione ao menos um item com descrição ou valor.'); return; }
      setSubmitting(true);
      try {
        createCrmBudget(user, { leadId, title, itemsJson });
        setModalCreate(false);
        setRefreshKey((k) => k + 1);
      } catch (err) {
        setError(err?.message || 'Erro ao criar orçamento.');
      } finally {
        setSubmitting(false);
      }
    },
    [user, createItems]
  );

  const handleStatusSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const form = e.target;
      const status = form.status?.value;
      setError('');
      if (!status) return;
      const reason = form.deniedReason?.value?.trim();
      if (status === BUDGET_STATUS.NEGADO && !(reason || deniedReason)) {
        setError('Informe o motivo da negativa.');
        return;
      }
      setSubmitting(true);
      try {
        updateCrmBudgetStatus(user, {
          budgetId: modalStatus.id,
          status,
          deniedReason: status === BUDGET_STATUS.NEGADO ? (reason || deniedReason).trim() : undefined,
        });
        setModalStatus(null);
        setDeniedReason('');
        setRefreshKey((k) => k + 1);
      } catch (err) {
        setError(err?.message || 'Erro ao alterar status.');
      } finally {
        setSubmitting(false);
      }
    },
    [user, modalStatus, deniedReason]
  );

  const handleEditSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const form = e.target;
      const title = form.title?.value?.trim();
      setError('');
      if (!title) { setError('Título é obrigatório.'); return; }
      const itemsJson = itemsToJson(editItems);
      if (itemsJson.length === 0) { setError('Adicione ao menos um item com descrição ou valor.'); return; }
      setSubmitting(true);
      try {
        updateCrmBudget(user, modalEdit.id, { title, itemsJson });
        setModalEdit(null);
        setRefreshKey((k) => k + 1);
      } catch (err) {
        setError(err?.message || 'Erro ao salvar.');
      } finally {
        setSubmitting(false);
      }
    },
    [user, modalEdit, editItems]
  );

  const statusBadgeClass = (status) => {
    if (status === BUDGET_STATUS.APROVADO) return 'crm-budget-badge aprovado';
    if (status === BUDGET_STATUS.NEGADO) return 'crm-budget-badge negado';
    return 'crm-budget-badge em-analise';
  };

  return (
    <CrmLayout
      title="Orçamentos & Conversão"
      description="Crie orçamentos vinculados aos leads. Aprovado vira paciente; negado exige motivo; em análise gera follow-up."
      actions={
        <button type="button" className="button primary flex items-center gap-2" onClick={openCreate}>
          <Plus size={18} /> Novo orçamento
        </button>
      }
    >
      <div className="crm-report-filters">
        <div className="crm-report-filter-group">
          <label>Início</label>
          <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
        </div>
        <div className="crm-report-filter-group">
          <label>Fim</label>
          <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
        </div>
        <div className="crm-report-filter-group">
          <label>Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Todos os status</option>
            {Object.entries(BUDGET_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="crm-report-filter-group">
          <label>Responsável</label>
          <select value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)}>
            <option value="">Todos</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name || u.id}</option>
            ))}
          </select>
        </div>
        <div className="crm-report-filter-group" style={{ minWidth: '200px', flex: 1 }}>
          <label>Busca</label>
          <input
            type="text"
            placeholder="Nome ou telefone..."
            value={queryFilter}
            onChange={(e) => setQueryFilter(e.target.value)}
          />
        </div>
      </div>

      <section className="crm-report-section">
        <h3 className="crm-report-section-title">KPIs</h3>
        <div className="crm-report-kpis">
          <KpiCard icon={FileText} value={kpis.total} label="Orçamentos no período" />
          <KpiCard icon={Clock} value={kpis.emAnalise} label="Em análise" />
          <KpiCard icon={CheckCircle} value={kpis.aprovados} label="Aprovados" variant="success" />
          <KpiCard icon={XCircle} value={kpis.negados} label="Negados" variant="danger" />
          <KpiCard icon={Percent} value={`${kpis.taxaAprovacao}%`} label="Taxa de aprovação" variant="success" />
        </div>
      </section>

      <section className="crm-report-section">
        <h3 className="crm-report-section-title">Orçamentos</h3>
        <SectionCard>
          <div className="crm-leads-table-wrap">
            <table className="crm-leads-table crm-orcamentos-table min-w-[900px] w-full">
              <thead>
                <tr>
                  <th>Lead / Paciente</th>
                  <th>Título</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Data</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {budgets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="crm-leads-empty">
                      Sem orçamentos no período. Clique em &quot;Novo orçamento&quot; para criar.
                    </td>
                  </tr>
                ) : (
                  budgets.map((b) => {
                    const lead = leadById[b.leadId];
                    const name = lead?.name || '—';
                    return (
                      <tr key={b.id}>
                        <td>
                          <Link to={`/crm/leads/${b.leadId}`} className="crm-leads-link">
                            {name}
                          </Link>
                        </td>
                        <td>{b.title || '—'}</td>
                        <td className="tabular-nums">{formatCurrency(b.totalValue)}</td>
                        <td>
                          <span className={statusBadgeClass(b.status)}>
                            {BUDGET_STATUS_LABELS[b.status] || b.status}
                          </span>
                        </td>
                        <td>{formatDate(b.createdAt)}</td>
                        <td>
                          <div className="crm-orcamentos-actions flex gap-1">
                            <button type="button" className="button small secondary" onClick={() => openView(b)} title="Ver">
                              <Eye size={14} />
                            </button>
                            <button type="button" className="button small secondary" onClick={() => openEdit(b)} title="Editar">
                              <Pencil size={14} />
                            </button>
                            <button type="button" className="button small primary" onClick={() => openChangeStatus(b)} title="Alterar status">
                              <RefreshCw size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </section>

      <Modal open={modalCreate} onClose={() => setModalCreate(false)} title="Novo orçamento" contentClass="crm-modal-orcamento max-w-2xl w-full max-h-[85vh] flex flex-col" scrollable>
        <form onSubmit={handleCreateSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {error && <p className="form-error">{error}</p>}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Lead</span>
              <select name="leadId" className="crm-modal-input w-full" required>
                <option value="">Selecione...</option>
                {listLeads().map((l) => (
                  <option key={l.id} value={l.id}>{l.name || l.phone || l.id}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Título</span>
              <input name="title" type="text" className="crm-modal-input w-full" placeholder="Ex: Implante unitário" required />
            </label>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Lista de itens</span>
              {createItems.map((item, index) => (
                <div key={index} className="flex gap-2 items-center flex-wrap">
                  <input
                    type="text"
                    className="crm-modal-input flex-1 min-w-[140px]"
                    placeholder="Ex: Implante unitário"
                    value={item.description}
                    onChange={(e) => updateCreateItem(index, 'description', e.target.value)}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="crm-modal-input w-28 tabular-nums"
                    placeholder="R$ 0,00"
                    value={item.value === '' ? '' : item.value}
                    onChange={(e) => updateCreateItem(index, 'value', e.target.value)}
                  />
                  <button
                    type="button"
                    className="p-2 rounded border border-[var(--color-border-muted)] hover:bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]"
                    onClick={() => removeCreateItem(index)}
                    title="Remover item"
                    aria-label="Remover item"
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
              <button type="button" className="button secondary text-sm self-start" onClick={addCreateItem}>
                + Adicionar item
              </button>
              <p className="text-sm font-semibold pt-1 border-t border-[var(--color-border-muted)] mt-1">
                Total: {formatCurrency(itemsTotal(createItems))}
              </p>
            </div>
          </div>
          <div className="flex-shrink-0 pt-4 px-4 pb-4 border-t border-[var(--color-border-muted)] flex gap-3 justify-end bg-[var(--color-bg-card)]">
            <button type="button" className="button secondary" onClick={() => setModalCreate(false)}>Cancelar</button>
            <button type="submit" className="button primary" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Criar orçamento'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!modalView} onClose={() => setModalView(null)} title="Detalhe do orçamento" contentClass="crm-modal-orcamento max-w-2xl w-full max-h-[85vh] flex flex-col" scrollable>
        {modalView && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-3 crm-orcamentos-detail">
              <p><strong>Lead:</strong> <Link to={`/crm/leads/${modalView.leadId}`} className="crm-orcamentos-lead-link">{leadById[modalView.leadId]?.name || modalView.leadId}</Link></p>
              <p><strong>Título:</strong> {modalView.title}</p>
              <p><strong>Valor total:</strong> {formatCurrency(modalView.totalValue)}</p>
              <p><strong>Status:</strong> <span className={statusBadgeClass(modalView.status)}>{BUDGET_STATUS_LABELS[modalView.status]}</span></p>
              <p><strong>Data:</strong> {formatDate(modalView.createdAt)}</p>
              {Array.isArray(modalView.itemsJson) && modalView.itemsJson.length > 0 && (
                <div>
                  <strong>Itens:</strong>
                  <ul className="mt-1">
                    {modalView.itemsJson.map((item, i) => (
                      <li key={i}>{item.description || '—'}: {formatCurrency(item.value)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex-shrink-0 pt-4 px-4 pb-4 border-t border-[var(--color-border-muted)] bg-[var(--color-bg-card)]">
              <button type="button" className="button primary" onClick={() => setModalView(null)}>Fechar</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!modalEdit} onClose={() => setModalEdit(null)} title="Editar orçamento" contentClass="crm-modal-orcamento max-w-2xl w-full max-h-[85vh] flex flex-col" scrollable>
        {modalEdit && (
          <form onSubmit={handleEditSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {error && <p className="form-error">{error}</p>}
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Título</span>
                <input name="title" type="text" className="crm-modal-input w-full" defaultValue={modalEdit.title} required />
              </label>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Lista de itens</span>
                {editItems.map((item, index) => (
                  <div key={index} className="flex gap-2 items-center flex-wrap">
                    <input
                      type="text"
                      className="crm-modal-input flex-1 min-w-[140px]"
                      placeholder="Ex: Implante unitário"
                      value={item.description}
                      onChange={(e) => updateEditItem(index, 'description', e.target.value)}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="crm-modal-input w-28 tabular-nums"
                      placeholder="R$ 0,00"
                      value={item.value === '' ? '' : item.value}
                      onChange={(e) => updateEditItem(index, 'value', e.target.value)}
                    />
                    <button
                      type="button"
                      className="p-2 rounded border border-[var(--color-border-muted)] hover:bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]"
                      onClick={() => removeEditItem(index)}
                      title="Remover item"
                      aria-label="Remover item"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
                <button type="button" className="button secondary text-sm self-start" onClick={addEditItem}>
                  + Adicionar item
                </button>
                <p className="text-sm font-semibold pt-1 border-t border-[var(--color-border-muted)] mt-1">
                  Total: {formatCurrency(itemsTotal(editItems))}
                </p>
              </div>
            </div>
            <div className="flex-shrink-0 pt-4 px-4 pb-4 border-t border-[var(--color-border-muted)] flex gap-3 justify-end bg-[var(--color-bg-card)]">
              <button type="button" className="button secondary" onClick={() => setModalEdit(null)}>Cancelar</button>
              <button type="submit" className="button primary" disabled={submitting}>Salvar</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!modalStatus} onClose={() => setModalStatus(null)} title="Alterar status" contentClass="crm-modal-orcamento max-w-2xl w-full max-h-[85vh] flex flex-col" scrollable>
        {modalStatus && (
          <form onSubmit={handleStatusSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {error && <p className="form-error">{error}</p>}
              <p className="text-sm"><strong>Orçamento:</strong> {modalStatus.title}</p>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Novo status</span>
                <select name="status" className="crm-modal-input" required>
                  <option value={BUDGET_STATUS.EM_ANALISE}>{BUDGET_STATUS_LABELS[BUDGET_STATUS.EM_ANALISE]}</option>
                  <option value={BUDGET_STATUS.APROVADO}>{BUDGET_STATUS_LABELS[BUDGET_STATUS.APROVADO]}</option>
                  <option value={BUDGET_STATUS.NEGADO}>{BUDGET_STATUS_LABELS[BUDGET_STATUS.NEGADO]}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Motivo da negativa (obrigatório se Negado)</span>
                <textarea
                  name="deniedReason"
                  value={deniedReason}
                  onChange={(e) => setDeniedReason(e.target.value)}
                  placeholder="Informe o motivo..."
                  className="crm-modal-input min-h-[80px]"
                  rows={3}
                />
              </label>
              <p className="form-hint text-sm text-[var(--color-text-muted)]">Aprovado: cria/vincula paciente. Negado: informe o motivo. Em análise: cria tarefa de follow-up.</p>
            </div>
            <div className="flex-shrink-0 pt-4 px-4 pb-4 border-t border-[var(--color-border-muted)] flex gap-3 bg-[var(--color-bg-card)]">
              <button type="button" className="button secondary" onClick={() => setModalStatus(null)}>Cancelar</button>
              <button type="submit" className="button primary" disabled={submitting}>
                {submitting ? 'Salvando...' : 'Alterar status'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </CrmLayout>
  );
}
