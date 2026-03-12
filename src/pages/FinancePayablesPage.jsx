import { useMemo, useState, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  listPayables,
  listExpenseCategories,
  listExpenseSuppliers,
  createPayable,
  updatePayable,
  deletePayable,
  payPayable,
  createExpenseSupplier,
  getPayablesKPIs,
  getCategoryName,
  getSupplierName,
  PAYABLE_STATUS,
  PAYMENT_METHODS,
  RECURRENCE_FREQUENCY,
} from '../services/payablesService.js';
import { Plus, Edit2, Trash2, DollarSign } from 'lucide-react';

const STATUS_LABELS = {
  [PAYABLE_STATUS.PENDING]: 'Pendente',
  [PAYABLE_STATUS.SCHEDULED]: 'Agendada',
  [PAYABLE_STATUS.PAID]: 'Paga',
  [PAYABLE_STATUS.OVERDUE]: 'Atrasada',
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
  const [filters, setFilters] = useState({
    startDate: firstDayOfMonth(),
    endDate: lastDayOfMonth(),
    status: '',
    categoryId: '',
    supplierId: '',
  });
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);

  const categories = useMemo(() => listExpenseCategories(), [refreshKey]);
  const suppliers = useMemo(() => listExpenseSuppliers(), [refreshKey]);
  const payables = useMemo(() => listPayables(filters), [filters, refreshKey]);
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
        isRecurring: form.isRecurring?.checked || false,
        recurrenceFrequency: form.recurrenceFrequency?.value || 'mensal',
      });
      showToast('Despesa criada.');
      setModal(null);
      setRefresh((k) => k + 1);
    } catch (err) {
      showToast(err.message || 'Erro ao criar.', 'error');
    }
  };

  const handleUpdate = (id) => (e) => {
    e.preventDefault();
    const form = e.target;
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
        isRecurring: form.isRecurring?.checked || false,
        recurrenceFrequency: form.recurrenceFrequency?.value || 'mensal',
      });
      showToast('Despesa atualizada.');
      setModal(null);
      setRefresh((k) => k + 1);
    } catch (err) {
      showToast(err.message || 'Erro ao atualizar.', 'error');
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
    const name = prompt('Nome do fornecedor:');
    if (!name?.trim()) return;
    try {
      createExpenseSupplier(user, { name: name.trim() });
      showToast('Fornecedor adicionado.');
      setRefresh((k) => k + 1);
    } catch (err) {
      showToast(err.message || 'Erro ao adicionar.', 'error');
    }
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
          onClick={() => setModal({ type: 'create' })}
        >
          <Plus size={20} />
          Nova despesa
        </button>
      </div>

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
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button type="button" className="button link small" onClick={handleAddSupplier}>
            + Adicionar
          </button>
        </label>
      </div>

      <div className="finance-payables-table-wrap">
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
      </div>

      {modal?.type === 'create' && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal-content finance-payables-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Nova despesa</h3>
            <form onSubmit={handleCreate} className="finance-payables-form">
              <label>Descrição *</label>
              <input type="text" name="description" required placeholder="Ex: Aluguel mensal" />

              <label>Categoria *</label>
              <select name="categoryId" required>
                <option value="">Selecione</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <label>Fornecedor</label>
              <div className="finance-payables-form-row">
                <select name="supplierId">
                  <option value="">Selecione (opcional)</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
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

              <label>Observação</label>
              <textarea name="note" rows={2} placeholder="Opcional" />

              <label className="finance-payables-check">
                <input type="checkbox" name="isRecurring" />
                Conta recorrente
              </label>
              <div className="finance-payables-recurrence">
                <label>Frequência</label>
                <select name="recurrenceFrequency">
                  {RECURRENCE_FREQUENCY.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div className="finance-payables-modal-footer">
                <button type="button" className="button secondary" onClick={() => setModal(null)}>
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

      {modal?.type === 'edit' && modal.payable && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal-content finance-payables-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Editar despesa</h3>
            <form onSubmit={handleUpdate(modal.payable.id)} className="finance-payables-form">
              <label>Descrição *</label>
              <input type="text" name="description" defaultValue={modal.payable.description} required />

              <label>Categoria *</label>
              <select name="categoryId" required defaultValue={modal.payable.categoryId || ''}>
                <option value="">Selecione</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <label>Fornecedor</label>
              <select name="supplierId" defaultValue={modal.payable.supplierId || ''}>
                <option value="">Selecione</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
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

              <label>Observação</label>
              <textarea name="note" rows={2} defaultValue={modal.payable.note || ''} placeholder="Opcional" />

              <label className="finance-payables-check">
                <input type="checkbox" name="isRecurring" defaultChecked={!!modal.payable.isRecurring} />
                Conta recorrente
              </label>
              <div className="finance-payables-recurrence">
                <label>Frequência</label>
                <select name="recurrenceFrequency" defaultValue={modal.payable.recurrenceFrequency || 'mensal'}>
                  {RECURRENCE_FREQUENCY.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div className="finance-payables-modal-footer">
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
            <h3>Registrar pagamento</h3>
            <p className="finance-payables-modal-desc">{modal.payable.description} — {formatCurrency(modal.payable.amount)}</p>
            <form onSubmit={handlePay(modal.payable.id)} className="finance-payables-form">
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
              <textarea name="note" rows={2} placeholder="Opcional" />

              <div className="finance-payables-modal-footer">
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
