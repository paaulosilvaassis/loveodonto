import { useMemo, useState, useCallback, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  listPayables,
  listExpenseCategories,
  createPayable,
  updatePayable,
  deletePayable,
  payPayable,
  getPayablesKPIs,
  getPayablesCountsByTab,
  createAvulsoPayment,
  listStandaloneCashTransactions,
  getCategoryName,
  getSupplierName,
  PAYABLE_STATUS,
  PAYMENT_METHODS,
  RECURRENCE_FREQUENCY,
  PAYABLES_TABS,
  EXPENSE_TYPE,
} from '../services/payablesService.js';
import { listSuppliers } from '../services/suppliersService.js';
import SupplierFormModal from '../components/SupplierFormModal.jsx';
import { Plus, Edit2, Trash2, DollarSign } from 'lucide-react';

const STATUS_LABELS = {
  [PAYABLE_STATUS.PENDING]: 'Pendente',
  [PAYABLE_STATUS.SCHEDULED]: 'Agendada',
  [PAYABLE_STATUS.PAID]: 'Paga',
  [PAYABLE_STATUS.OVERDUE]: 'Atrasada',
};

const TAB_NAV_CONFIG = [
  { key: PAYABLES_TABS.CONTAS_A_PAGAR, label: 'Contas a pagar' },
  { key: PAYABLES_TABS.CONTAS_PAGADAS, label: 'Contas pagas' },
  { key: PAYABLES_TABS.DESPESAS_FIXAS, label: 'Despesas fixas' },
  { key: PAYABLES_TABS.DESPESAS_VARIAVEIS, label: 'Despesas variáveis' },
  { key: PAYABLES_TABS.TITULOS_AVULSOS, label: 'Títulos avulsos' },
  { key: PAYABLES_TABS.PAGAMENTOS_AVULSOS, label: 'Pagamentos avulsos' },
];

const TAB_BUTTON_LABELS = {
  [PAYABLES_TABS.CONTAS_A_PAGAR]: 'Nova despesa',
  [PAYABLES_TABS.CONTAS_PAGADAS]: 'Nova despesa',
  [PAYABLES_TABS.DESPESAS_FIXAS]: 'Nova despesa fixa',
  [PAYABLES_TABS.DESPESAS_VARIAVEIS]: 'Nova despesa variável',
  [PAYABLES_TABS.TITULOS_AVULSOS]: 'Novo título avulso',
  [PAYABLES_TABS.PAGAMENTOS_AVULSOS]: 'Novo pagamento avulso',
};

const formatCurrency = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const firstDayOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const lastDayOfMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return d.toISOString().slice(0, 10);
};

export default function FinancePayablesPage() {
  const { user } = useAuth();
  const [refreshKey, setRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState(PAYABLES_TABS.CONTAS_A_PAGAR);
  const [filters, setFilters] = useState({
    startDate: firstDayOfMonth(),
    endDate: lastDayOfMonth(),
    status: '',
    categoryId: '',
    supplierId: '',
  });
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [expenseType, setExpenseType] = useState(EXPENSE_TYPE.VARIABLE);
  const [isRecurring, setIsRecurring] = useState(false);

  useEffect(() => {
    if (modal?.type === 'create') {
      if (activeTab === PAYABLES_TABS.DESPESAS_FIXAS) {
        setExpenseType(EXPENSE_TYPE.FIXED);
        setIsRecurring(true);
      } else if (activeTab === PAYABLES_TABS.DESPESAS_VARIAVEIS) {
        setExpenseType(EXPENSE_TYPE.VARIABLE);
        setIsRecurring(false);
      } else if (activeTab === PAYABLES_TABS.TITULOS_AVULSOS) {
        setExpenseType(EXPENSE_TYPE.ONE_TIME_TITLE);
        setIsRecurring(false);
      } else {
        setExpenseType(EXPENSE_TYPE.VARIABLE);
        setIsRecurring(false);
      }
    } else if (modal?.type === 'edit' && modal.payable) {
      const p = modal.payable;
      const resolved = p.expenseType || (p.isRecurring ? EXPENSE_TYPE.FIXED : EXPENSE_TYPE.VARIABLE);
      setExpenseType(resolved);
      setIsRecurring(resolved !== EXPENSE_TYPE.ONE_TIME_TITLE && !!p.isRecurring);
    }
  }, [modal?.type, modal?.payable, activeTab]);

  const categories = useMemo(() => listExpenseCategories(), [refreshKey]);
  const suppliers = useMemo(
    () => listSuppliers().filter((s) => (s.status || 'ativo') === 'ativo'),
    [refreshKey]
  );
  const filtersWithTab = useMemo(
    () => ({ ...filters, tabFilter: activeTab === PAYABLES_TABS.PAGAMENTOS_AVULSOS ? null : activeTab }),
    [filters, activeTab]
  );
  const payables = useMemo(
    () => (activeTab === PAYABLES_TABS.PAGAMENTOS_AVULSOS ? [] : listPayables(filtersWithTab)),
    [filtersWithTab, activeTab, refreshKey]
  );
  const standalonePayments = useMemo(
    () => (activeTab === PAYABLES_TABS.PAGAMENTOS_AVULSOS ? listStandaloneCashTransactions(filters) : []),
    [activeTab, filters, refreshKey]
  );
  const tabCounts = useMemo(
    () => getPayablesCountsByTab({ startDate: filters.startDate, endDate: filters.endDate, categoryId: filters.categoryId, supplierId: filters.supplierId }),
    [filters.startDate, filters.endDate, filters.categoryId, filters.supplierId, refreshKey]
  );
  const kpis = useMemo(() => {
    const d = new Date();
    return getPayablesKPIs(d.getMonth() + 1, d.getFullYear());
  }, [refreshKey]);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const handleCreate = (e) => {
    e.preventDefault();
    const form = e.target;
    const finalExpenseType = expenseType;
    const finalIsRecurring = finalExpenseType !== EXPENSE_TYPE.ONE_TIME_TITLE && isRecurring;
    try {
      createPayable(user, {
        description: form.description?.value?.trim(),
        categoryId: form.categoryId?.value || null,
        supplierId: form.supplierId?.value || null,
        amount: Number(form.amount?.value || 0),
        dueDate: form.dueDate?.value,
        paymentMethod: form.paymentMethod?.value,
        originAccount: form.originAccount?.value?.trim() || '',
        note: form.note?.value?.trim() || '',
        isRecurring: finalIsRecurring,
        recurrenceFrequency: form.recurrenceFrequency?.value || 'mensal',
        expenseType: finalExpenseType,
      });
      showToast('Despesa criada.');
      setModal(null);
      setRefresh((k) => k + 1);
    } catch (err) {
      showToast(err.message || 'Erro ao criar.', 'error');
    }
  };

  const handleCreateAvulso = (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      createAvulsoPayment(user, {
        description: form.description?.value?.trim(),
        amount: Number(form.amount?.value || 0),
        date: form.date?.value || todayIso(),
      });
      showToast('Pagamento avulso registrado.');
      setModal(null);
      setRefresh((k) => k + 1);
    } catch (err) {
      showToast(err.message || 'Erro ao registrar.', 'error');
    }
  };

  const handleUpdate = (id) => (e) => {
    e.preventDefault();
    const form = e.target;
    const finalExpenseType = expenseType;
    const finalIsRecurring = finalExpenseType !== EXPENSE_TYPE.ONE_TIME_TITLE && isRecurring;
    try {
      updatePayable(user, id, {
        description: form.description?.value?.trim(),
        categoryId: form.categoryId?.value || null,
        supplierId: form.supplierId?.value || null,
        amount: Number(form.amount?.value || 0),
        dueDate: form.dueDate?.value,
        paymentMethod: form.paymentMethod?.value,
        originAccount: form.originAccount?.value?.trim() || '',
        note: form.note?.value?.trim() || '',
        isRecurring: finalIsRecurring,
        recurrenceFrequency: form.recurrenceFrequency?.value || 'mensal',
        expenseType: finalExpenseType,
      });
      showToast('Despesa atualizada.');
      setModal(null);
      setRefresh((k) => k + 1);
    } catch (err) {
      showToast(err.message || 'Erro ao atualizar.', 'error');
    }
  };

  const handleExpenseTypeChange = (type) => {
    setExpenseType(type);
    if (type === EXPENSE_TYPE.ONE_TIME_TITLE) {
      setIsRecurring(false);
    } else if (type === EXPENSE_TYPE.FIXED) {
      setIsRecurring(true);
    } else {
      setIsRecurring(false);
    }
  };

  const handleRecurringChange = (checked) => {
    setIsRecurring(checked);
    if (checked && expenseType === EXPENSE_TYPE.ONE_TIME_TITLE) {
      setExpenseType(EXPENSE_TYPE.FIXED);
    }
  };

  const handlePay = (id) => (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      payPayable(user, id, {
        paidDate: form.paidDate?.value || todayIso(),
        paymentMethod: form.paymentMethod?.value,
        originAccount: form.originAccount?.value?.trim() || '',
        amountPaid: Number(form.amountPaid?.value || 0),
        note: form.note?.value?.trim() || '',
      });
      showToast('Pagamento registrado.');
      setModal(null);
      setRefresh((k) => k + 1);
    } catch (err) {
      showToast(err.message || 'Erro ao registrar pagamento.', 'error');
    }
  };

  const handleDelete = (p) => {
    if (p.paidDate) {
      showToast('Não é possível excluir conta já paga.', 'error');
      return;
    }
    if (!confirm('Excluir esta despesa?')) return;
    try {
      deletePayable(user, p.id);
      showToast('Despesa excluída.');
      setRefresh((k) => k + 1);
    } catch (err) {
      showToast(err.message || 'Erro ao excluir.', 'error');
    }
  };

  const handleAddSupplier = () => {
    setSupplierModalOpen(true);
  };

  const handleSupplierCreated = (supplier) => {
    setRefresh((k) => k + 1);
    setSelectedSupplierId(supplier?.id || '');
    setSupplierModalOpen(false);
    showToast('Fornecedor cadastrado com sucesso.');
  };

  return (
    <div className="finance-payables-page">
      {toast && (
        <div
          className={`toast finance-toast ${toast.type}`}
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 10001,
            padding: '12px 20px',
            borderRadius: 12,
            background: toast.type === 'success' ? '#10b981' : '#ef4444',
            color: '#fff',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          }}
        >
          {toast.message}
        </div>
      )}

      <div className="finance-payables-header">
        <h1>Contas a Pagar</h1>
        <button
          type="button"
          className="button primary finance-payables-new-btn"
          onClick={() => {
            if (activeTab === PAYABLES_TABS.PAGAMENTOS_AVULSOS) {
              setModal({ type: 'create_avulso' });
            } else {
              setModal({ type: 'create' });
              setSelectedSupplierId('');
            }
          }}
        >
          <Plus size={20} />
          {TAB_BUTTON_LABELS[activeTab] || 'Nova despesa'}
        </button>
      </div>

      <nav className="finance-payables-nav" role="tablist" aria-label="Navegação financeira">
        <div className="finance-payables-nav-inner">
          {TAB_NAV_CONFIG.map((tab) => {
            const n = tabCounts[tab.key] ?? 0;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`finance-payables-nav-tab ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <span className="finance-payables-nav-tab-label">{tab.label}</span>
                <span className="finance-payables-nav-tab-count">({n})</span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="finance-payables-kpis">
        <div className="finance-payables-kpi-card">
          <span className="finance-payables-kpi-label">Total a pagar no mês</span>
          <strong>{formatCurrency(kpis.totalToPay)}</strong>
        </div>
        <div className="finance-payables-kpi-card finance-payables-kpi-card--paid">
          <span className="finance-payables-kpi-label">Total pago no mês</span>
          <strong>{formatCurrency(kpis.totalPaid)}</strong>
        </div>
        <div className="finance-payables-kpi-card finance-payables-kpi-card--overdue">
          <span className="finance-payables-kpi-label">Total atrasado</span>
          <strong>{formatCurrency(kpis.totalOverdue)}</strong>
        </div>
        <div className="finance-payables-kpi-card finance-payables-kpi-card--total">
          <span className="finance-payables-kpi-label">Total geral (pendente + atrasado)</span>
          <strong>{formatCurrency(kpis.total)}</strong>
        </div>
      </div>

      <div className="finance-payables-filters">
        <label>
          Período início
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
          />
        </label>
        <label>
          Período fim
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
          />
        </label>
        {activeTab !== PAYABLES_TABS.PAGAMENTOS_AVULSOS && (
          <>
            <label>
              Status
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <option value="">Todos</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Categoria
              <select
                value={filters.categoryId}
                onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}
              >
                <option value="">Todas</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label>
              Fornecedor
              <select
                value={filters.supplierId}
                onChange={(e) => setFilters({ ...filters, supplierId: e.target.value })}
              >
                <option value="">Todos</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.trade_name || s.name || '—'}</option>
                ))}
              </select>
              <button type="button" className="button link small" onClick={handleAddSupplier}>
                + Novo
              </button>
            </label>
          </>
        )}
      </div>

      <div className="finance-payables-table-wrap">
        {activeTab === PAYABLES_TABS.PAGAMENTOS_AVULSOS ? (
          <table className="finance-payables-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {standalonePayments.length === 0 ? (
                <tr>
                  <td colSpan={3}>Nenhum pagamento avulso encontrado.</td>
                </tr>
              ) : (
                standalonePayments.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDate(t.date)}</td>
                    <td>{t.description || '—'}</td>
                    <td>{formatCurrency(t.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="finance-payables-table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Categoria</th>
                <th>Fornecedor</th>
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {payables.length === 0 ? (
                <tr>
                  <td colSpan={7}>Nenhuma despesa encontrada.</td>
                </tr>
              ) : (
                payables.map((p) => (
                <tr key={p.id} data-status={p.status}>
                  <td>{p.description}</td>
                  <td>{getCategoryName(p.categoryId)}</td>
                  <td>{getSupplierName(p.supplierId)}</td>
                  <td>{formatDate(p.dueDate)}</td>
                  <td>{formatCurrency(p.amount)}</td>
                  <td>
                    <span className={`finance-payables-status finance-payables-status--${p.status}`}>
                      {STATUS_LABELS[p.status] || p.status}
                    </span>
                  </td>
                  <td className="finance-payables-actions">
                    {p.status !== PAYABLE_STATUS.PAID && (
                      <button
                        type="button"
                        className="button icon"
                        onClick={() => setModal({ type: 'pay', payable: p })}
                        title="Pagar"
                      >
                        <DollarSign size={18} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="button icon"
                      onClick={() => setModal({ type: 'edit', payable: p })}
                      title="Editar"
                      disabled={!!p.paidDate}
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      type="button"
                      className="button icon danger"
                      onClick={() => handleDelete(p)}
                      title="Excluir"
                      disabled={!!p.paidDate}
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        )}
      </div>

      {modal?.type === 'create_avulso' && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal-content finance-payables-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header finance-payables-modal-header">
              <h3>Novo pagamento avulso</h3>
            </div>
            <form onSubmit={handleCreateAvulso} className="finance-payables-form modal-form">
              <div className="modal-body finance-payables-modal-body">
                <label>Descrição *</label>
                <input type="text" name="description" required placeholder="Ex: Despesa pontual" />

                <label>Valor *</label>
                <input type="number" name="amount" step="0.01" min="0.01" required placeholder="0,00" />

                <label>Data *</label>
                <input type="date" name="date" required defaultValue={todayIso()} />
              </div>
              <div className="modal-footer finance-payables-modal-footer">
                <button type="button" className="button secondary" onClick={() => setModal(null)}>
                  Cancelar
                </button>
                <button type="submit" className="button primary">
                  Registrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal?.type === 'create' && (
        <div className="modal-backdrop" onClick={() => { setModal(null); setSelectedSupplierId(''); }}>
          <div className="modal-content finance-payables-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header finance-payables-modal-header">
              <h3>{activeTab === PAYABLES_TABS.TITULOS_AVULSOS ? 'Novo título avulso' : activeTab === PAYABLES_TABS.DESPESAS_FIXAS ? 'Nova despesa fixa' : activeTab === PAYABLES_TABS.DESPESAS_VARIAVEIS ? 'Nova despesa variável' : 'Nova despesa'}</h3>
            </div>
            <form onSubmit={handleCreate} className="finance-payables-form modal-form">
              <div className="modal-body finance-payables-modal-body">
                <div className="finance-payables-form-block">
                  <label>Descrição *</label>
                  <input type="text" name="description" required placeholder="Ex: Aluguel mensal" />

                  <label>Categoria *</label>
                  <select name="categoryId" required>
                    <option value="">Selecione</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {categories.length === 0 && (
                    <small className="finance-payables-category-empty">Não há categorias cadastradas.</small>
                  )}

                  <label>Fornecedor</label>
                  <div className="finance-payables-form-row">
                    <select
                      name="supplierId"
                      value={selectedSupplierId}
                      onChange={(e) => setSelectedSupplierId(e.target.value)}
                    >
                      <option value="">Selecione (opcional)</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.trade_name || s.name || '—'}</option>
                      ))}
                    </select>
                    <button type="button" className="button secondary small" onClick={handleAddSupplier}>
                      + Novo
                    </button>
                  </div>

                  <label>Valor *</label>
                  <input type="number" name="amount" step="0.01" min="0.01" required placeholder="0,00" />

                  <label>Data de vencimento *</label>
                  <input type="date" name="dueDate" required defaultValue={todayIso()} />

                  <label>Forma de pagamento *</label>
                  <select name="paymentMethod" required>
                    {PAYMENT_METHODS.map((pm) => (
                      <option key={pm.value} value={pm.value}>{pm.label}</option>
                    ))}
                  </select>

                  <label>Conta de origem</label>
                  <input type="text" name="originAccount" placeholder="Opcional" />
                </div>

                <div className="finance-payables-form-block finance-payables-form-block--final">
                  <label>Observação</label>
                  <textarea name="note" rows={4} placeholder="Opcional" className="finance-payables-note" />
                </div>

                <div className="finance-payables-form-block finance-payables-form-block--classification">
                  <h4 className="finance-payables-classification-title">Classificação da despesa</h4>

                  <div className="finance-payables-type-group">
                    <label className="finance-payables-type-label">Tipo da despesa</label>
                    <div className="finance-payables-type-options">
                      <button
                        type="button"
                        className={`finance-payables-type-card ${expenseType === EXPENSE_TYPE.FIXED ? 'active' : ''}`}
                        onClick={() => handleExpenseTypeChange(EXPENSE_TYPE.FIXED)}
                      >
                        <span className="finance-payables-type-radio" />
                        Despesa fixa
                      </button>
                      <button
                        type="button"
                        className={`finance-payables-type-card ${expenseType === EXPENSE_TYPE.VARIABLE ? 'active' : ''}`}
                        onClick={() => handleExpenseTypeChange(EXPENSE_TYPE.VARIABLE)}
                      >
                        <span className="finance-payables-type-radio" />
                        Despesa variável
                      </button>
                      <button
                        type="button"
                        className={`finance-payables-type-card ${expenseType === EXPENSE_TYPE.ONE_TIME_TITLE ? 'active' : ''}`}
                        onClick={() => handleExpenseTypeChange(EXPENSE_TYPE.ONE_TIME_TITLE)}
                      >
                        <span className="finance-payables-type-radio" />
                        Título avulso
                      </button>
                    </div>
                  </div>

                  <label className="finance-payables-check">
                    <input
                      type="checkbox"
                      checked={isRecurring}
                      onChange={(e) => handleRecurringChange(e.target.checked)}
                      disabled={expenseType === EXPENSE_TYPE.ONE_TIME_TITLE}
                    />
                    <span>Conta recorrente</span>
                  </label>

                  {isRecurring && expenseType !== EXPENSE_TYPE.ONE_TIME_TITLE && (
                    <div className="finance-payables-recurrence">
                      <label>Frequência</label>
                      <select name="recurrenceFrequency" defaultValue="mensal">
                        {RECURRENCE_FREQUENCY.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer finance-payables-modal-footer">
                <button type="button" className="button secondary" onClick={() => { setModal(null); setSelectedSupplierId(''); }}>
                  Cancelar
                </button>
                <button type="submit" className="button primary">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {supplierModalOpen && (
        <SupplierFormModal
          open={supplierModalOpen}
          onClose={() => setSupplierModalOpen(false)}
          onSuccess={handleSupplierCreated}
          user={user}
          nested={modal?.type === 'create'}
        />
      )}

      {modal?.type === 'edit' && modal.payable && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal-content finance-payables-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header finance-payables-modal-header">
              <h3>Editar despesa</h3>
            </div>
            <form onSubmit={handleUpdate(modal.payable.id)} className="finance-payables-form modal-form">
              <div className="modal-body finance-payables-modal-body">
                <div className="finance-payables-form-block">
                  <label>Descrição *</label>
                  <input type="text" name="description" defaultValue={modal.payable.description} required />

                  <label>Categoria *</label>
                  <select name="categoryId" required defaultValue={modal.payable.categoryId || ''}>
                    <option value="">Selecione</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {categories.length === 0 && (
                    <small className="finance-payables-category-empty">Não há categorias cadastradas.</small>
                  )}

                  <label>Fornecedor</label>
                  <select name="supplierId" defaultValue={modal.payable.supplierId || ''}>
                    <option value="">Selecione</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.trade_name || s.name || '—'}</option>
                    ))}
                  </select>

                  <label>Valor *</label>
                  <input type="number" name="amount" step="0.01" min="0.01" required defaultValue={modal.payable.amount} />

                  <label>Data de vencimento *</label>
                  <input type="date" name="dueDate" required defaultValue={modal.payable.dueDate} />

                  <label>Forma de pagamento *</label>
                  <select name="paymentMethod" required defaultValue={modal.payable.paymentMethod || 'outros'}>
                    {PAYMENT_METHODS.map((pm) => (
                      <option key={pm.value} value={pm.value}>{pm.label}</option>
                    ))}
                  </select>

                  <label>Conta de origem</label>
                  <input type="text" name="originAccount" defaultValue={modal.payable.originAccount || ''} placeholder="Opcional" />
                </div>

                <div className="finance-payables-form-block finance-payables-form-block--final">
                  <label>Observação</label>
                  <textarea name="note" rows={4} defaultValue={modal.payable.note || ''} placeholder="Opcional" className="finance-payables-note" />
                </div>

                <div className="finance-payables-form-block finance-payables-form-block--classification">
                  <h4 className="finance-payables-classification-title">Classificação da despesa</h4>

                  <div className="finance-payables-type-group">
                    <label className="finance-payables-type-label">Tipo da despesa</label>
                    <div className="finance-payables-type-options">
                      <button
                        type="button"
                        className={`finance-payables-type-card ${expenseType === EXPENSE_TYPE.FIXED ? 'active' : ''}`}
                        onClick={() => handleExpenseTypeChange(EXPENSE_TYPE.FIXED)}
                      >
                        <span className="finance-payables-type-radio" />
                        Despesa fixa
                      </button>
                      <button
                        type="button"
                        className={`finance-payables-type-card ${expenseType === EXPENSE_TYPE.VARIABLE ? 'active' : ''}`}
                        onClick={() => handleExpenseTypeChange(EXPENSE_TYPE.VARIABLE)}
                      >
                        <span className="finance-payables-type-radio" />
                        Despesa variável
                      </button>
                      <button
                        type="button"
                        className={`finance-payables-type-card ${expenseType === EXPENSE_TYPE.ONE_TIME_TITLE ? 'active' : ''}`}
                        onClick={() => handleExpenseTypeChange(EXPENSE_TYPE.ONE_TIME_TITLE)}
                      >
                        <span className="finance-payables-type-radio" />
                        Título avulso
                      </button>
                    </div>
                  </div>

                  <label className="finance-payables-check">
                    <input
                      type="checkbox"
                      checked={isRecurring}
                      onChange={(e) => handleRecurringChange(e.target.checked)}
                      disabled={expenseType === EXPENSE_TYPE.ONE_TIME_TITLE}
                    />
                    <span>Conta recorrente</span>
                  </label>

                  {isRecurring && expenseType !== EXPENSE_TYPE.ONE_TIME_TITLE && (
                    <div className="finance-payables-recurrence">
                      <label>Frequência</label>
                      <select name="recurrenceFrequency" defaultValue={modal.payable.recurrenceFrequency || 'mensal'}>
                        {RECURRENCE_FREQUENCY.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer finance-payables-modal-footer">
                <button type="button" className="button secondary" onClick={() => setModal(null)}>
                  Cancelar
                </button>
                <button type="submit" className="button primary">
                  Salvar alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal?.type === 'pay' && modal.payable && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal-content finance-payables-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header finance-payables-modal-header">
              <h3>Registrar pagamento</h3>
              <p className="finance-payables-modal-desc">{modal.payable.description} — {formatCurrency(modal.payable.amount)}</p>
            </div>
            <form onSubmit={handlePay(modal.payable.id)} className="finance-payables-form modal-form">
              <div className="modal-body finance-payables-modal-body">
              <label>Data de pagamento *</label>
              <input type="date" name="paidDate" required defaultValue={todayIso()} />

              <label>Forma de pagamento *</label>
              <select name="paymentMethod" required defaultValue={modal.payable.paymentMethod || 'pix'}>
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm.value} value={pm.value}>{pm.label}</option>
                ))}
              </select>

              <label>Conta utilizada</label>
              <input type="text" name="originAccount" defaultValue={modal.payable.originAccount || ''} placeholder="Opcional" />

              <label>Valor pago *</label>
              <input type="number" name="amountPaid" step="0.01" min="0.01" required defaultValue={modal.payable.amount} placeholder="0,00" />

              <label>Observação</label>
              <textarea name="note" rows={3} placeholder="Opcional" className="finance-payables-note" />
              </div>

              <div className="modal-footer finance-payables-modal-footer">
                <button type="button" className="button secondary" onClick={() => setModal(null)}>
                  Cancelar
                </button>
                <button type="submit" className="button primary">
                  Confirmar pagamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
