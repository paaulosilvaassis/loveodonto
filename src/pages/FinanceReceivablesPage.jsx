import { useMemo, useState, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { loadDb } from '../db/index.js';
import { getProfessionalOptions } from '../services/collaboratorService.js';
import { formatCurrencyBRL, parseCurrencyBRL, applyCurrencyMaskBRL } from '../utils/currency.js';
import {
  listReceivables,
  getReceivablesKPIs,
  RECEIVABLE_TABS,
  RECEIVABLE_STATUS,
  RECEIVABLE_PAYMENT_METHODS,
  RECEIVABLE_CHARGE_METHODS,
  RECEIVABLE_CHARGE_STATUS,
  createReceivable,
  registerReceivablePayment,
  cancelReceivable,
  getReceivablePayments,
  createReceivableCharge,
  listReceivableCharges,
  getReceivableChargesByReceivable,
} from '../services/receivablesService.js';
import { Plus, Eye, DollarSign, FileText, X } from 'lucide-react';

const STATUS_LABELS = {
  [RECEIVABLE_STATUS.PENDING]: 'Pendente',
  [RECEIVABLE_STATUS.DUE_TODAY]: 'Vence hoje',
  [RECEIVABLE_STATUS.UPCOMING]: 'A vencer',
  [RECEIVABLE_STATUS.OVERDUE]: 'Em atraso',
  [RECEIVABLE_STATUS.PARTIALLY_PAID]: 'Parcialmente recebido',
  [RECEIVABLE_STATUS.PAID]: 'Recebido',
  [RECEIVABLE_STATUS.CANCELED]: 'Cancelado',
  [RECEIVABLE_STATUS.RENEGOTIATED]: 'Renegociado',
};

const TAB_NAV_CONFIG = [
  { key: RECEIVABLE_TABS.A_RECEBER, label: 'A receber' },
  { key: RECEIVABLE_TABS.RECEBIDOS, label: 'Recebidos' },
  { key: RECEIVABLE_TABS.EM_ATRASO, label: 'Em atraso' },
  { key: RECEIVABLE_TABS.COBRANCAS, label: 'Cobranças' },
  { key: RECEIVABLE_TABS.PARCELAMENTOS, label: 'Parcelamentos' },
  { key: RECEIVABLE_TABS.RECEBIMENTOS_AVULSOS, label: 'Recebimentos avulsos' },
];

const formatCurrency = (value) => formatCurrencyBRL(value);

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

const usePatientsAndProfessionals = () => {
  const db = loadDb();
  const patients = db.patients || [];
  const professionals = getProfessionalOptions();
  return { patients, professionals };
};

export default function FinanceReceivablesPage() {
  const { user } = useAuth();
  const { patients, professionals } = usePatientsAndProfessionals();

  const [refreshKey, setRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState(RECEIVABLE_TABS.A_RECEBER);
  const [filters, setFilters] = useState({
    startDate: firstDayOfMonth(),
    endDate: lastDayOfMonth(),
    status: '',
    patientId: '',
    professionalId: '',
    paymentMethodExpected: '',
    originType: '',
  });
  const [chargeFilters, setChargeFilters] = useState({
    startDate: firstDayOfMonth(),
    endDate: lastDayOfMonth(),
    patientId: '',
    type: '',
    status: '',
  });
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [detailsPayments, setDetailsPayments] = useState([]);
  const [detailsInstallments, setDetailsInstallments] = useState([]);
  const [detailsCharges, setDetailsCharges] = useState([]);

  const receivables = useMemo(
    () =>
      listReceivables({
        startDate: filters.startDate,
        endDate: filters.endDate,
        status: filters.status,
        patientId: filters.patientId,
        professionalId: filters.professionalId,
        paymentMethodExpected: filters.paymentMethodExpected,
        originType: filters.originType,
        tabFilter: activeTab,
      }),
    [filters, activeTab, refreshKey]
  );

  const kpis = useMemo(() => {
    const d = new Date();
    return getReceivablesKPIs(d.getMonth() + 1, d.getFullYear());
  }, [refreshKey]);

  const chargesForTab = useMemo(() => {
    if (activeTab !== RECEIVABLE_TABS.COBRANCAS) return [];
    const baseCharges = listReceivableCharges({
      startDate: chargeFilters.startDate,
      endDate: chargeFilters.endDate,
      patientId: chargeFilters.patientId || undefined,
      type: chargeFilters.type || undefined,
      status: chargeFilters.status || undefined,
    });
    const db = loadDb();
    const allReceivables = Array.isArray(db.accountsReceivable) ? db.accountsReceivable : [];
    const receivableById = new Map(allReceivables.map((r) => [r.id, r]));
    return baseCharges.map((c) => {
      const recv = receivableById.get(c.receivable_id);
      return {
        ...c,
        _receivable: recv || null,
      };
    });
  }, [activeTab, chargeFilters.startDate, chargeFilters.endDate, chargeFilters.patientId, chargeFilters.type, chargeFilters.status, refreshKey]);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const handleOpenNew = () => {
    setModal({ type: 'create' });
  };

  const handleOpenPayment = (receivable) => {
    setModal({ type: 'register_payment', receivable });
  };

  const handleOpenDetails = (receivable) => {
    const db = loadDb();
    const allReceivables = Array.isArray(db.accountsReceivable) ? db.accountsReceivable : [];
    const installments = allReceivables.filter((r) => {
      if (receivable.origin_type && receivable.origin_id) {
        return r.origin_type === receivable.origin_type && r.origin_id === receivable.origin_id;
      }
      if (receivable.contract_id) {
        return r.contract_id === receivable.contract_id;
      }
      if (receivable.treatment_plan_id) {
        return r.treatment_plan_id === receivable.treatment_plan_id;
      }
      return r.id === receivable.id;
    }).sort((a, b) => {
      if (a.due_date && b.due_date && a.due_date !== b.due_date) {
        return a.due_date.localeCompare(b.due_date);
      }
      return Number(a.installment_number || 0) - Number(b.installment_number || 0);
    });

    const payments = getReceivablePayments(receivable.id);
    const charges = getReceivableChargesByReceivable(receivable.id);

    setDetailsInstallments(installments);
    setDetailsPayments(payments);
    setDetailsCharges(charges);
    setModal({ type: 'details', receivable });
  };

  const handleOpenCharge = (receivable) => {
    setModal({ type: 'charge', receivable });
  };

  const handleCancel = (receivable) => {
    if (!window.confirm('Cancelar este título?')) return;
    const reason = window.prompt('Informe o motivo do cancelamento:') || '';
    try {
      cancelReceivable(user, receivable.id, reason);
      showToast('Título cancelado com sucesso.');
      setRefresh((k) => k + 1);
    } catch (err) {
      showToast(err.message || 'Erro ao cancelar título.', 'error');
    }
  };

  const splitInInstallments = (totalValue, totalInstallments) => {
    const cents = Math.round(Number(totalValue || 0) * 100);
    const base = Math.floor(cents / totalInstallments);
    const remainder = cents - base * totalInstallments;
    const result = [];
    for (let i = 0; i < totalInstallments; i += 1) {
      const valueCents = base + (i < remainder ? 1 : 0);
      result.push(valueCents / 100);
    }
    return result;
  };

  const addInterval = (isoDate, index, frequency) => {
    if (!isoDate) return isoDate;
    const d = new Date(isoDate + 'T12:00:00');
    if (frequency === 'semanal') {
      d.setDate(d.getDate() + 7 * index);
    } else if (frequency === 'quinzenal') {
      d.setDate(d.getDate() + 14 * index);
    } else {
      d.setMonth(d.getMonth() + index);
    }
    return d.toISOString().slice(0, 10);
  };

  const handleSubmitCreate = (event) => {
    event.preventDefault();
    const form = event.target;
    const patientId = form.patient_id.value;
    const description = form.description.value?.trim();
    const professionalId = form.professional_id.value || null;
    const originalAmount = parseCurrencyBRL(form.original_amount.value);
    const entryAmount = parseCurrencyBRL(form.entry_amount.value || '0');
    const discountAmount = parseCurrencyBRL(form.discount_amount.value || '0');
    const interestAmount = parseCurrencyBRL(form.interest_amount.value || '0');
    const fineAmount = parseCurrencyBRL(form.fine_amount.value || '0');
    const notes = form.notes.value || '';
    const issueDate = form.issue_date.value || todayIso();
    const dueDate = form.due_date.value || todayIso();
    const paymentMethodExpected = form.payment_method_expected.value || 'dinheiro';
    const hasInstallments = form.has_installments.value === 'sim';
    const totalInstallmentsRaw = Number(form.total_installments.value || 1);
    const installmentFrequency = form.installment_frequency.value || 'mensal';
    const entryReceivedNow = form.entry_received_now.checked;
    const firstDueDate = form.first_due_date.value || dueDate;

    try {
      if (!patientId) throw new Error('Selecione o paciente.');
      if (!description) throw new Error('Descrição é obrigatória.');
      if (!originalAmount || originalAmount <= 0) throw new Error('Valor total deve ser maior que zero.');
      if (entryAmount < 0) throw new Error('Valor de entrada não pode ser negativo.');
      if (entryAmount > originalAmount) throw new Error('Valor de entrada não pode ser maior que o valor total.');

    const basePayload = {
        patient_id: patientId,
        description,
        professional_id: professionalId,
        notes,
        payment_method_expected: paymentMethodExpected,
        issue_date: issueDate,
      };

    // Caso especial: entrada quita tudo (ou quase) -> título único
    const remainingBase = Math.max(originalAmount - entryAmount, 0);
    const shouldHaveInstallments = hasInstallments && remainingBase > 0.009 && totalInstallmentsRaw > 1;

    if (!shouldHaveInstallments) {
      // Um único título (pode ter entrada já recebida ou não)
      const single = createReceivable(user, {
        ...basePayload,
        original_amount: originalAmount,
        discount_amount: discountAmount,
        interest_amount: interestAmount,
        fine_amount: fineAmount,
        due_date: dueDate,
        installment_number: 1,
        total_installments: 1,
      });

      if (entryAmount > 0 && entryReceivedNow) {
        // registra a entrada como pagamento parcial ou total deste título
        registerReceivablePayment(user, single.id, {
          payment_date: todayIso(),
          amount_received: entryAmount,
          discount_amount: 0,
          interest_amount: 0,
          fine_amount: 0,
          payment_method: paymentMethodExpected,
          notes: 'Entrada recebida no ato',
        });
      }
    } else {
      const parcelCount = totalInstallmentsRaw;
      const totalInstallmentsEffective = entryAmount > 0 ? parcelCount + 1 : parcelCount;

      // Entrada como título próprio (opcionalmente já recebido)
      if (entryAmount > 0) {
        const entryRecord = createReceivable(user, {
          ...basePayload,
          original_amount: entryAmount,
          discount_amount: 0,
          interest_amount: 0,
          fine_amount: 0,
          due_date: issueDate,
          installment_number: 1,
          total_installments: totalInstallmentsEffective,
        });

        if (entryReceivedNow) {
          registerReceivablePayment(user, entryRecord.id, {
            payment_date: todayIso(),
            amount_received: entryAmount,
            discount_amount: 0,
            interest_amount: 0,
            fine_amount: 0,
            payment_method: paymentMethodExpected,
            notes: 'Entrada recebida no ato',
          });
        }
      }

      // Saldo a ser parcelado
      const parcelBaseOriginal = Math.max(originalAmount - entryAmount, 0);
      const parcelOriginalParts = splitInInstallments(parcelBaseOriginal, parcelCount);
      const parcelDiscountParts = splitInInstallments(discountAmount, parcelCount);
      const parcelInterestParts = splitInInstallments(interestAmount, parcelCount);
      const parcelFineParts = splitInInstallments(fineAmount, parcelCount);

      for (let i = 0; i < parcelCount; i += 1) {
        const installmentNumber = entryAmount > 0 ? i + 2 : i + 1;
        const installmentDueDate = addInterval(firstDueDate, i, installmentFrequency);
        createReceivable(user, {
          ...basePayload,
          original_amount: parcelOriginalParts[i],
          discount_amount: parcelDiscountParts[i],
          interest_amount: parcelInterestParts[i],
          fine_amount: parcelFineParts[i],
          due_date: installmentDueDate,
          installment_number: installmentNumber,
          total_installments: totalInstallmentsEffective,
        });
      }
    }

      showToast('Recebível criado com sucesso.');
      setModal(null);
      setRefresh((k) => k + 1);
    } catch (err) {
      showToast(err.message || 'Erro ao criar recebível.', 'error');
    }
  };

  const handleSubmitPayment = (event) => {
    event.preventDefault();
    if (!modal?.receivable) return;
    const form = event.target;
    const paymentDate = form.payment_date.value || todayIso();
    const amountReceived = parseCurrencyBRL(form.amount_received.value || '0');
    const discountAmount = parseCurrencyBRL(form.discount_amount.value || '0');
    const interestAmount = parseCurrencyBRL(form.interest_amount.value || '0');
    const fineAmount = parseCurrencyBRL(form.fine_amount.value || '0');
    const paymentMethod = form.payment_method.value || modal.receivable.payment_method_expected || 'dinheiro';
    const notes = form.notes.value || '';

    try {
      const { receivable } = registerReceivablePayment(user, modal.receivable.id, {
        payment_date: paymentDate,
        amount_received: amountReceived,
        discount_amount: discountAmount,
        interest_amount: interestAmount,
        fine_amount: fineAmount,
        payment_method: paymentMethod,
        notes,
      });

      showToast('Recebimento registrado com sucesso.');
      setModal(null);
      setRefresh((k) => k + 1);
    } catch (err) {
      showToast(err.message || 'Erro ao registrar recebimento.', 'error');
    }
  };

  return (
    <div className="finance-receivables-page">
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

      <div className="finance-receivables-header">
        <h1>Contas a Receber</h1>
        <button
          type="button"
          className="button primary finance-receivables-new-btn"
          onClick={handleOpenNew}
        >
          <Plus size={20} />
          Novo recebimento
        </button>
      </div>

      <nav className="finance-receivables-nav" role="tablist" aria-label="Navegação contas a receber">
        <div className="finance-receivables-nav-inner">
          {TAB_NAV_CONFIG.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`finance-receivables-nav-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="finance-receivables-nav-tab-label">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className="finance-receivables-kpis">
        <div className="finance-receivables-kpi-card">
          <span className="finance-receivables-kpi-label">Total a receber no mês</span>
          <strong>{formatCurrency(kpis.totalToReceive)}</strong>
        </div>
        <div className="finance-receivables-kpi-card finance-receivables-kpi-card--received">
          <span className="finance-receivables-kpi-label">Total recebido no mês</span>
          <strong>{formatCurrency(kpis.totalReceived)}</strong>
        </div>
        <div className="finance-receivables-kpi-card finance-receivables-kpi-card--overdue">
          <span className="finance-receivables-kpi-label">Total em atraso</span>
          <strong>{formatCurrency(kpis.totalOverdue)}</strong>
        </div>
        <div className="finance-receivables-kpi-card">
          <span className="finance-receivables-kpi-label">Total a vencer</span>
          <strong>{formatCurrency(kpis.totalUpcoming)}</strong>
        </div>
        <div className="finance-receivables-kpi-card">
          <span className="finance-receivables-kpi-label">Inadimplência</span>
          <strong>{`${kpis.inadimplenciaPercent.toFixed(1)}%`}</strong>
        </div>
      </div>

      {activeTab === RECEIVABLE_TABS.COBRANCAS ? (
        <>
          <div className="finance-receivables-filters">
            <label>
              Período início
              <input
                type="date"
                value={chargeFilters.startDate}
                onChange={(e) => setChargeFilters({ ...chargeFilters, startDate: e.target.value })}
              />
            </label>
            <label>
              Período fim
              <input
                type="date"
                value={chargeFilters.endDate}
                onChange={(e) => setChargeFilters({ ...chargeFilters, endDate: e.target.value })}
              />
            </label>
            <label>
              Paciente
              <select
                value={chargeFilters.patientId}
                onChange={(e) => setChargeFilters({ ...chargeFilters, patientId: e.target.value })}
              >
                <option value="">Todos</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name || p.name || '—'}</option>
                ))}
              </select>
            </label>
            <label>
              Tipo de cobrança
              <select
                value={chargeFilters.type}
                onChange={(e) => setChargeFilters({ ...chargeFilters, type: e.target.value })}
              >
                <option value="">Todos</option>
                {RECEIVABLE_CHARGE_METHODS.filter((m) => m.value !== 'none').map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>
            <label>
              Status da cobrança
              <select
                value={chargeFilters.status}
                onChange={(e) => setChargeFilters({ ...chargeFilters, status: e.target.value })}
              >
                <option value="">Todos</option>
                {Object.entries(RECEIVABLE_CHARGE_STATUS).map(([k, v]) => (
                  <option key={k} value={v}>{v}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="finance-receivables-table-wrap">
            <table className="finance-receivables-table">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Título</th>
                  <th>Tipo de cobrança</th>
                  <th>Status</th>
                  <th>Destinatário</th>
                  <th>Criada em</th>
                  <th>Enviada em</th>
                  <th>Ref. externa</th>
                  <th>Visualizado em</th>
                  <th>Pago em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {chargesForTab.length === 0 ? (
                  <tr>
                    <td colSpan={11}>Nenhuma cobrança encontrada.</td>
                  </tr>
                ) : (
                  chargesForTab.map((c) => {
                    const recv = c._receivable;
                    const patient =
                      (patients.find((p) => p.id === recv?.patient_id)?.full_name) ||
                      (patients.find((p) => p.id === recv?.patient_id)?.name) ||
                      '—';
                    return (
                      <tr key={c.id}>
                        <td>{patient}</td>
                        <td>{recv?.description || '—'}</td>
                        <td>{RECEIVABLE_CHARGE_METHODS.find((m) => m.value === c.charge_type)?.label || c.charge_type}</td>
                        <td>{c.status}</td>
                        <td>{c.recipient || '—'}</td>
                        <td>{c.created_at ? formatDate(c.created_at.slice(0, 10)) : '—'}</td>
                        <td>{c.sent_at ? formatDate(c.sent_at.slice(0, 10)) : '—'}</td>
                        <td>{c.external_reference || '—'}</td>
                        <td>{c.viewed_at ? formatDate(c.viewed_at.slice(0, 10)) : '—'}</td>
                        <td>{c.paid_at ? formatDate(c.paid_at.slice(0, 10)) : '—'}</td>
                        <td className="finance-receivables-actions">
                          <button
                            type="button"
                            className="button icon"
                            onClick={() => recv && handleOpenDetails(recv)}
                            title="Abrir título"
                          >
                            <Eye size={18} />
                          </button>
                          <button
                            type="button"
                            className="button icon"
                            onClick={() => recv && handleOpenCharge(recv)}
                            title="Nova cobrança"
                          >
                            <FileText size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="finance-receivables-filters">
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
              Paciente
              <select
                value={filters.patientId}
                onChange={(e) => setFilters({ ...filters, patientId: e.target.value })}
              >
                <option value="">Todos</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name || p.name || '—'}</option>
                ))}
              </select>
            </label>
            <label>
              Profissional
              <select
                value={filters.professionalId}
                onChange={(e) => setFilters({ ...filters, professionalId: e.target.value })}
              >
                <option value="">Todos</option>
                    {professionals.map((pr) => (
                      <option key={pr.id} value={pr.id}>{pr.name || '—'}</option>
                    ))}
              </select>
            </label>
            <label>
              Forma prevista
              <select
                value={filters.paymentMethodExpected}
                onChange={(e) => setFilters({ ...filters, paymentMethodExpected: e.target.value })}
              >
                <option value="">Todas</option>
                {RECEIVABLE_PAYMENT_METHODS.map((pm) => (
                  <option key={pm.value} value={pm.value}>{pm.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="finance-receivables-table-wrap">
            <table className="finance-receivables-table">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Descrição</th>
                  <th>Parcela</th>
                  <th>Emissão</th>
                  <th>Vencimento</th>
                  <th>Valor original</th>
                  <th>Aberto</th>
                  <th>Recebido</th>
                  <th>Status</th>
                  <th>Forma prevista</th>
                  <th>Cobrança</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {receivables.length === 0 ? (
                  <tr>
                    <td colSpan={12}>Nenhum título encontrado.</td>
                  </tr>
                ) : (
                  receivables.map((r) => {
                    const parcela =
                      Number(r.total_installments || 1) > 1
                        ? `${r.installment_number}/${r.total_installments}`
                        : '—';
                    const patientName =
                      (patients.find((p) => p.id === r.patient_id)?.full_name) ||
                      (patients.find((p) => p.id === r.patient_id)?.name) ||
                      '—';
                    return (
                      <tr key={r.id} data-status={r.status}>
                        <td>{patientName}</td>
                        <td>{r.description}</td>
                        <td>{parcela}</td>
                        <td>{formatDate(r.issue_date)}</td>
                        <td>{formatDate(r.due_date)}</td>
                        <td>{formatCurrency(r.original_amount)}</td>
                        <td>{formatCurrency(r.remaining_amount)}</td>
                        <td>{formatCurrency(r.received_amount)}</td>
                        <td>
                          <span className={`finance-receivables-status finance-receivables-status--${r.status}`}>
                            {STATUS_LABELS[r.status] || r.status}
                          </span>
                        </td>
                        <td>{r.payment_method_expected || '—'}</td>
                        <td>{r.charge_method && r.charge_method !== 'none' ? r.charge_method : '—'}</td>
                        <td className="finance-receivables-actions">
                          <button
                            type="button"
                            className="button icon"
                            onClick={() => handleOpenDetails(r)}
                            title="Visualizar"
                          >
                            <Eye size={18} />
                          </button>
                          <button
                            type="button"
                            className="button icon"
                            onClick={() => handleOpenPayment(r)}
                            title="Registrar recebimento"
                          >
                            <DollarSign size={18} />
                          </button>
                          <button
                            type="button"
                            className="button icon"
                            onClick={() => handleOpenCharge(r)}
                            title="Gerar cobrança"
                          >
                            <FileText size={18} />
                          </button>
                          <button
                            type="button"
                            className="button icon danger"
                            onClick={() => handleCancel(r)}
                            title="Cancelar"
                          >
                            <X size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modal?.type === 'create' && (
        <div className="modal-backdrop">
          <div className="modal-content finance-receivables-modal">
            <div className="modal-header finance-receivables-modal-header">
              <h3>Novo recebimento</h3>
            </div>
            <form onSubmit={handleSubmitCreate} className="finance-receivables-form modal-form">
              <div className="modal-body finance-receivables-modal-body">
                {/* BLOCO 1 - DADOS BÁSICOS */}
                <div className="finance-receivables-form-block">
                  <label>
                    Paciente *
                    <select name="patient_id" required>
                      <option value="">Selecione</option>
                      {patients.map((p) => (
                        <option key={p.id} value={p.id}>{p.full_name || p.name || '—'}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Descrição *
                    <input name="description" type="text" required placeholder="Ex: Tratamento de implante" />
                  </label>
                  <label>
                    Profissional
                    <select name="professional_id">
                      <option value="">Selecione</option>
                    {professionals.map((pr) => (
                      <option key={pr.id} value={pr.id}>{pr.name || '—'}</option>
                    ))}
                    </select>
                  {professionals.length === 0 && (
                    <small className="finance-receivables-empty-helper">Nenhum profissional cadastrado.</small>
                  )}
                  </label>
                </div>

                {/* BLOCO 2 - VALORES */}
                <div className="finance-receivables-form-block">
                  <label>
                    Valor total *
                    <input
                      name="original_amount"
                      type="text"
                      inputMode="numeric"
                      required
                      onInput={applyCurrencyMaskBRL}
                    />
                  </label>
                  <label>
                    Valor de entrada
                    <input
                      name="entry_amount"
                      type="text"
                      inputMode="numeric"
                      defaultValue=""
                      onInput={applyCurrencyMaskBRL}
                    />
                  </label>
                  <label>
                    Desconto
                    <input
                      name="discount_amount"
                      type="text"
                      inputMode="numeric"
                      defaultValue=""
                      onInput={applyCurrencyMaskBRL}
                    />
                  </label>
                  <label>
                    Juros
                    <input
                      name="interest_amount"
                      type="text"
                      inputMode="numeric"
                      defaultValue=""
                      onInput={applyCurrencyMaskBRL}
                    />
                  </label>
                  <label>
                    Multa
                    <input
                      name="fine_amount"
                      type="text"
                      inputMode="numeric"
                      defaultValue=""
                      onInput={applyCurrencyMaskBRL}
                    />
                  </label>
                  <label>
                    Observações
                    <textarea name="notes" rows={3} placeholder="Opcional" />
                  </label>
                </div>

                {/* BLOCO 3 - PRAZOS */}
                <div className="finance-receivables-form-block">
                  <label>
                    Data de emissão
                    <input name="issue_date" type="date" defaultValue={todayIso()} />
                  </label>
                  <label>
                    Data de vencimento *
                    <input name="due_date" type="date" required defaultValue={todayIso()} />
                  </label>
                </div>

                {/* BLOCO 4 - COBRANÇA */}
                <div className="finance-receivables-form-block">
                  <label>
                    Forma de pagamento prevista
                    <select name="payment_method_expected" defaultValue="dinheiro">
                      {RECEIVABLE_PAYMENT_METHODS.map((pm) => (
                        <option key={pm.value} value={pm.value}>{pm.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* BLOCO 5 - PARCELAMENTO SIMPLES */}
                <div className="finance-receivables-form-block finance-receivables-form-block--installments">
                  <label>
                    Receber em parcelas?
                    <select name="has_installments" defaultValue="nao">
                      <option value="nao">Não</option>
                      <option value="sim">Sim</option>
                    </select>
                  </label>
                  <label>
                    Quantidade de parcelas
                    <input name="total_installments" type="number" min="1" defaultValue="1" />
                  </label>
                  <label>
                    Primeiro vencimento
                    <input name="first_due_date" type="date" defaultValue={todayIso()} />
                  </label>
                  <label>
                    Frequência
                    <select name="installment_frequency" defaultValue="mensal">
                      <option value="semanal">Semanal</option>
                      <option value="quinzenal">Quinzenal</option>
                      <option value="mensal">Mensal</option>
                    </select>
                  </label>
                  <label>
                    <span>
                      <input
                        type="checkbox"
                        name="entry_received_now"
                        style={{ marginRight: 8 }}
                      />
                      Registrar entrada como recebida agora
                    </span>
                  </label>
                </div>
              </div>
              <div className="modal-footer finance-receivables-modal-footer">
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

      {modal?.type === 'charge' && modal.receivable && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal-content finance-receivables-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header finance-receivables-modal-header">
              <h3>Gerar cobrança</h3>
            </div>
            <form
              className="finance-receivables-form modal-form"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target;
                const chargeType = form.charge_type.value;
                const recipient = form.recipient.value?.trim();
                const messageTemplate = form.message_template.value || '';
                const externalReference = form.external_reference.value || '';
                const notes = form.notes.value || '';
                try {
                  createReceivableCharge(user, {
                    receivable_id: modal.receivable.id,
                    charge_type: chargeType,
                    status: RECEIVABLE_CHARGE_STATUS.GENERATED,
                    sent_at: null,
                    recipient,
                    message_template: messageTemplate,
                    external_reference: externalReference,
                    viewed_at: null,
                    paid_at: null,
                    notes,
                  });
                  showToast('Cobrança gerada com sucesso.');
                  setModal(null);
                  setRefresh((k) => k + 1);
                } catch (err) {
                  showToast(err.message || 'Erro ao gerar cobrança.', 'error');
                }
              }}
            >
              <div className="modal-body finance-receivables-modal-body">
                <div className="finance-receivables-form-block">
                  <strong>{modal.receivable.description}</strong>
                  <span>
                    Paciente:{' '}
                    {(patients.find((p) => p.id === modal.receivable.patient_id)?.full_name)
                      || (patients.find((p) => p.id === modal.receivable.patient_id)?.name)
                      || '—'}
                  </span>
                  <span>Valor em aberto: {formatCurrency(modal.receivable.remaining_amount)}</span>
                  <span>Vencimento: {formatDate(modal.receivable.due_date)}</span>
                  <span>Forma prevista: {modal.receivable.payment_method_expected || '—'}</span>
                </div>
                <div className="finance-receivables-form-block">
                  <label>
                    Tipo de cobrança
                    <select name="charge_type" defaultValue="whatsapp_reminder">
                      {RECEIVABLE_CHARGE_METHODS.filter((m) => m.value !== 'none').map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Destinatário
                    <input name="recipient" type="text" placeholder="WhatsApp, e-mail ou outro identificador" />
                  </label>
                  <label>
                    Mensagem / Template
                    <textarea name="message_template" rows={3} placeholder="Mensagem base da cobrança" />
                  </label>
                  <label>
                    Referência externa
                    <input name="external_reference" type="text" placeholder="ID no gateway/integração (opcional)" />
                  </label>
                  <label>
                    Observações
                    <textarea name="notes" rows={2} placeholder="Observações internas (opcional)" />
                  </label>
                </div>
              </div>
              <div className="modal-footer finance-receivables-modal-footer">
                <button type="button" className="button secondary" onClick={() => setModal(null)}>
                  Cancelar
                </button>
                <button type="submit" className="button primary">
                  Gerar cobrança
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal?.type === 'register_payment' && modal.receivable && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal-content finance-receivables-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header finance-receivables-modal-header">
              <h3>Registrar recebimento</h3>
              <p className="finance-receivables-modal-desc">
                {modal.receivable.description} — {formatCurrency(modal.receivable.net_amount)}
              </p>
            </div>
            <form onSubmit={handleSubmitPayment} className="finance-receivables-form modal-form">
              <div className="modal-body finance-receivables-modal-body">
                <div className="finance-receivables-form-block">
                  <label>
                    Data do recebimento *
                    <input name="payment_date" type="date" required defaultValue={todayIso()} />
                  </label>
                  <label>
                    Valor recebido *
                    <input
                      name="amount_received"
                      type="text"
                      inputMode="numeric"
                      required
                      onInput={applyCurrencyMaskBRL}
                    />
                  </label>
                  <label>
                    Desconto
                    <input
                      name="discount_amount"
                      type="text"
                      inputMode="numeric"
                      defaultValue=""
                      onInput={applyCurrencyMaskBRL}
                    />
                  </label>
                  <label>
                    Juros
                    <input
                      name="interest_amount"
                      type="text"
                      inputMode="numeric"
                      defaultValue=""
                      onInput={applyCurrencyMaskBRL}
                    />
                  </label>
                  <label>
                    Multa
                    <input
                      name="fine_amount"
                      type="text"
                      inputMode="numeric"
                      defaultValue=""
                      onInput={applyCurrencyMaskBRL}
                    />
                  </label>
                  <label>
                    Forma recebida
                    <select name="payment_method" defaultValue={modal.receivable.payment_method_expected || 'dinheiro'}>
                      {RECEIVABLE_PAYMENT_METHODS.map((pm) => (
                        <option key={pm.value} value={pm.value}>{pm.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Observação
                    <textarea name="notes" rows={3} placeholder="Opcional" />
                  </label>
                </div>
              </div>
              <div className="modal-footer finance-receivables-modal-footer">
                <button type="button" className="button secondary" onClick={() => setModal(null)}>
                  Cancelar
                </button>
                <button type="submit" className="button primary">
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal?.type === 'details' && modal.receivable && (
        <div className="modal-backdrop" onClick={() => { setModal(null); setDetailsPayments([]); setDetailsInstallments([]); }}>
          <div className="modal-content finance-receivables-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header finance-receivables-modal-header">
              <h3>Detalhes do título</h3>
            </div>
            <div className="modal-body finance-receivables-modal-body">
              <div className="finance-receivables-form-block">
                <strong>{modal.receivable.description}</strong>
                <span>Paciente: {(patients.find((p) => p.id === modal.receivable.patient_id)?.full_name) || (patients.find((p) => p.id === modal.receivable.patient_id)?.name) || '—'}</span>
                <span>Parcela: {Number(modal.receivable.total_installments || 1) > 1 ? `${modal.receivable.installment_number}/${modal.receivable.total_installments}` : '—'}</span>
                <span>Emissão: {formatDate(modal.receivable.issue_date)}</span>
                <span>Vencimento: {formatDate(modal.receivable.due_date)}</span>
                <span>Valor original: {formatCurrency(modal.receivable.original_amount)}</span>
                <span>Valor líquido: {formatCurrency(modal.receivable.net_amount)}</span>
                <span>Recebido: {formatCurrency(modal.receivable.received_amount)}</span>
                <span>Em aberto: {formatCurrency(modal.receivable.remaining_amount)}</span>
              </div>

              <div className="finance-receivables-form-block">
                <h4>Parcelas relacionadas</h4>
                {detailsInstallments.length === 0 ? (
                  <span>Nenhuma outra parcela vinculada.</span>
                ) : (
                  <table className="finance-receivables-table">
                    <thead>
                      <tr>
                        <th>Parcela</th>
                        <th>Vencimento</th>
                        <th>Líquido</th>
                        <th>Aberto</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailsInstallments.map((i) => (
                        <tr key={i.id}>
                          <td>{Number(i.total_installments || 1) > 1 ? `${i.installment_number}/${i.total_installments}` : '—'}</td>
                          <td>{formatDate(i.due_date)}</td>
                          <td>{formatCurrency(i.net_amount)}</td>
                          <td>{formatCurrency(i.remaining_amount)}</td>
                          <td>{STATUS_LABELS[i.status] || i.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="finance-receivables-form-block">
                <h4>Pagamentos</h4>
                {detailsPayments.length === 0 ? (
                  <span>Nenhum pagamento registrado.</span>
                ) : (
                  <table className="finance-receivables-table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Valor recebido</th>
                        <th>Desconto</th>
                        <th>Juros</th>
                        <th>Multa</th>
                        <th>Forma</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailsPayments.map((p) => (
                        <tr key={p.id}>
                          <td>{formatDate(p.payment_date)}</td>
                          <td>{formatCurrency(p.amount_received)}</td>
                          <td>{formatCurrency(p.discount_amount)}</td>
                          <td>{formatCurrency(p.interest_amount)}</td>
                          <td>{formatCurrency(p.fine_amount)}</td>
                          <td>{p.payment_method || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="finance-receivables-form-block">
                <h4>Histórico de cobranças</h4>
                <span>Área reservada para histórico de cobranças (boletos, PIX, lembretes). Estrutura pronta para integração futura.</span>
              </div>
            </div>
            <div className="modal-footer finance-receivables-modal-footer">
              <button type="button" className="button secondary" onClick={() => { setModal(null); setDetailsPayments([]); setDetailsInstallments([]); }}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

