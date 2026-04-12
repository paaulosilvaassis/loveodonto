import { useMemo, useState } from 'react';
import { Plus, Eye, FileText, DollarSign, RefreshCcw, XCircle, BadgeCheck, AlertTriangle, BellRing } from 'lucide-react';
import { useAuth } from '../auth/useAuth.js';
import { loadDb } from '../db/index.js';
import {
  listFinancings,
  getFinancingsKPIs,
  approveFinancing,
  rejectFinancing,
  getFinancingTimeline,
  cancelFinancing,
} from '../services/financingsService.js';
import { listFinancingInstallments } from '../services/financingInstallmentsService.js';
import { listBoletoCharges } from '../services/boletoChargesService.js';
import {
  executeChargeGenerationFlow,
  executeDelinquencyFlow,
  executeFinancingCreationFlow,
  executeReceivementFlow,
  executeReminderFlow,
  executeRenegotiationFlow,
} from '../services/financingOperationalFlowsService.js';
import { formatCurrencyBRL } from '../utils/currency.js';
import FinancingFormModal from '../components/finance/FinancingFormModal.jsx';
import FinancingDetailsModal from '../components/finance/FinancingDetailsModal.jsx';
import GenerateBoletoModal from '../components/finance/GenerateBoletoModal.jsx';
import RegisterFinancingPaymentModal from '../components/finance/RegisterFinancingPaymentModal.jsx';
import RenegotiateFinancingModal from '../components/finance/RenegotiateFinancingModal.jsx';
import { FINANCING_STATUS } from '../services/auditEventCatalog.js';

const TABS = [
  { key: 'all', label: 'Propostas' },
  { key: 'pending_analysis', label: 'Em análise' },
  { key: 'approved', label: 'Aprovados' },
  { key: 'active', label: 'Ativos' },
  { key: 'overdue', label: 'Em atraso' },
  { key: 'paid_off', label: 'Quitados' },
  { key: 'renegotiated', label: 'Renegociados' },
  { key: 'canceled', label: 'Cancelados' },
];

const financingStatusLabel = {
  draft: 'Rascunho',
  pending_analysis: 'Em análise',
  approved: 'Aprovado',
  active: 'Ativo',
  partially_paid: 'Parcial',
  paid_off: 'Quitado',
  overdue: 'Em atraso',
  renegotiated: 'Renegociado',
  canceled: 'Cancelado',
  defaulted: 'Inadimplente',
};

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
};

export default function FinanceFinanciamentoPage() {
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState('all');
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    patient_id: '',
    status: '',
    professional_id: '',
    treatment: '',
    financial_responsible_id: '',
    minValue: '',
    maxValue: '',
    installments_count: '',
  });
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [detailsData, setDetailsData] = useState({
    financing: null,
    installments: [],
    boletos: [],
    payments: [],
    timeline: [],
  });
  const [selectedInstallment, setSelectedInstallment] = useState(null);
  const [busyAction, setBusyAction] = useState('');

  const db = useMemo(() => loadDb(), [refreshKey]);
  const patients = db.patients || [];
  const receivablePayments = Array.isArray(db.receivablePayments) ? db.receivablePayments : [];

  const installmentsMap = useMemo(() => {
    const map = new Map();
    listFinancingInstallments({}).forEach((item) => {
      if (!map.has(item.financing_id)) map.set(item.financing_id, []);
      map.get(item.financing_id).push(item);
    });
    return map;
  }, [refreshKey]);

  const financings = useMemo(() => {
    let base = listFinancings({
      ...filters,
      minValue: filters.minValue ? Number(filters.minValue) : undefined,
      maxValue: filters.maxValue ? Number(filters.maxValue) : undefined,
    });
    if (filters.treatment?.trim()) {
      const term = filters.treatment.trim().toLowerCase();
      base = base.filter((item) => (item.description || '').toLowerCase().includes(term));
    }
    if (filters.status && Object.values(FINANCING_STATUS).includes(filters.status)) {
      base = base.filter((item) => item.status === filters.status);
    }
    if (activeTab === 'all') return base;
    return base.filter((item) => item.status === activeTab);
  }, [activeTab, filters, refreshKey]);

  const kpis = useMemo(() => getFinancingsKPIs(), [refreshKey]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const openDetails = (financing) => {
    const installments = listFinancingInstallments({ financing_id: financing.id });
    const receivableIds = new Set(installments.map((item) => item.receivable_id).filter(Boolean));
    setDetailsData({
      financing,
      installments,
      boletos: listBoletoCharges({ financing_id: financing.id }),
      payments: receivablePayments.filter((item) => receivableIds.has(item.receivable_id)),
      timeline: getFinancingTimeline(financing.id),
    });
    setModal('details');
  };

  const handleApprove = (financing) => {
    setBusyAction(`approve:${financing.id}`);
    try {
      approveFinancing(user, financing.id, { entry_received_now: false });
      showToast('Financiamento aprovado e ativado.');
      setRefreshKey((k) => k + 1);
    } catch (error) {
      showToast(error.message || 'Erro ao aprovar financiamento.', 'error');
    } finally {
      setBusyAction('');
    }
  };

  const handleReject = (financing) => {
    if (!window.confirm('Confirma a reprovação desta proposta?')) return;
    setBusyAction(`reject:${financing.id}`);
    try {
      const reason = window.prompt('Motivo da reprovação:') || 'Reprovado manualmente.';
      rejectFinancing(user, financing.id, reason);
      showToast('Proposta reprovada.');
      setRefreshKey((k) => k + 1);
    } catch (error) {
      showToast(error.message || 'Erro ao reprovar proposta.', 'error');
    } finally {
      setBusyAction('');
    }
  };

  const handleGenerateCharges = (financing) => {
    setBusyAction(`charges:${financing.id}`);
    try {
      const result = executeChargeGenerationFlow(user, { financing_id: financing.id });
      showToast(`${result.total_created} boleto(s) gerado(s) para parcelas abertas.`);
      setRefreshKey((k) => k + 1);
    } catch (error) {
      showToast(error.message || 'Erro ao gerar cobranças.', 'error');
    } finally {
      setBusyAction('');
    }
  };

  return (
    <div className="finance-financing-page">
      {toast && (
        <div className={`toast finance-toast ${toast.type}`}>
          {toast.message}
        </div>
      )}
      <div className="finance-financing-header">
        <h1>Financiamentos</h1>
        <div className="finance-financing-actions-inline">
          <button type="button" className="button secondary" onClick={() => {
            if (!window.confirm('Executar rotina de inadimplência agora?')) return;
            try {
              const result = executeDelinquencyFlow(user);
              showToast(`Inadimplência revisada: ${result.overdue_installments.length} parcela(s) em atraso.`);
              setRefreshKey((k) => k + 1);
            } catch (error) {
              showToast(error.message || 'Erro ao revisar inadimplência.', 'error');
            }
          }}>
            <AlertTriangle size={16} />
            Rodar inadimplência
          </button>
          <button type="button" className="button secondary" onClick={() => {
            if (!window.confirm('Executar régua de cobrança agora?')) return;
            try {
              const result = executeReminderFlow(user);
              showToast(`Régua executada: ${result.reminders_generated} evento(s), ${result.receivable_charges_generated} cobrança(s).`);
              setRefreshKey((k) => k + 1);
            } catch (error) {
              showToast(error.message || 'Erro ao executar régua.', 'error');
            }
          }}>
            <BellRing size={16} />
            Executar régua
          </button>
          <button type="button" className="button primary" onClick={() => setModal('new')}>
            <Plus size={18} />
            Novo financiamento
          </button>
        </div>
      </div>

      <nav className="finance-receivables-nav">
        <div className="finance-receivables-nav-inner">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`finance-receivables-nav-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="finance-receivables-kpis finance-financing-kpis">
        <div className="finance-receivables-kpi-card">
          <span className="finance-receivables-kpi-label">Total financiado no mês</span>
          <strong>{formatCurrencyBRL(kpis.totalFinancedMonth)}</strong>
        </div>
        <div className="finance-receivables-kpi-card">
          <span className="finance-receivables-kpi-label">Total em aberto</span>
          <strong>{formatCurrencyBRL(kpis.totalOpen)}</strong>
        </div>
        <div className="finance-receivables-kpi-card finance-receivables-kpi-card--received">
          <span className="finance-receivables-kpi-label">Total recebido</span>
          <strong>{formatCurrencyBRL(kpis.totalReceived)}</strong>
        </div>
        <div className="finance-receivables-kpi-card finance-receivables-kpi-card--overdue">
          <span className="finance-receivables-kpi-label">Total em atraso</span>
          <strong>{formatCurrencyBRL(kpis.totalOverdue)}</strong>
        </div>
        <div className="finance-receivables-kpi-card">
          <span className="finance-receivables-kpi-label">Taxa inadimplência</span>
          <strong>{kpis.defaultRate.toFixed(1)}%</strong>
        </div>
        <div className="finance-receivables-kpi-card">
          <span className="finance-receivables-kpi-label">Ticket médio</span>
          <strong>{formatCurrencyBRL(kpis.ticketMedio)}</strong>
        </div>
      </div>

      <div className="finance-receivables-filters">
        <label>
          Período início
          <input type="date" value={filters.startDate} onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))} />
        </label>
        <label>
          Período fim
          <input type="date" value={filters.endDate} onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))} />
        </label>
        <label>
          Paciente
          <select value={filters.patient_id} onChange={(e) => setFilters((prev) => ({ ...prev, patient_id: e.target.value }))}>
            <option value="">Todos</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>{patient.full_name || patient.name || '—'}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
            <option value="">Todos</option>
            {Object.values(FINANCING_STATUS).map((status) => (
              <option key={status} value={status}>{financingStatusLabel[status] || status}</option>
            ))}
          </select>
        </label>
        <label>
          Profissional
          <input type="text" value={filters.professional_id} onChange={(e) => setFilters((prev) => ({ ...prev, professional_id: e.target.value }))} placeholder="ID profissional" />
        </label>
        <label>
          Tratamento
          <input type="text" value={filters.treatment} onChange={(e) => setFilters((prev) => ({ ...prev, treatment: e.target.value }))} placeholder="Descrição do tratamento" />
        </label>
        <label>
          Responsável financeiro
          <input type="text" value={filters.financial_responsible_id} onChange={(e) => setFilters((prev) => ({ ...prev, financial_responsible_id: e.target.value }))} placeholder="ID responsável" />
        </label>
        <label>
          Valor mínimo
          <input type="number" min="0" value={filters.minValue} onChange={(e) => setFilters((prev) => ({ ...prev, minValue: e.target.value }))} />
        </label>
        <label>
          Valor máximo
          <input type="number" min="0" value={filters.maxValue} onChange={(e) => setFilters((prev) => ({ ...prev, maxValue: e.target.value }))} />
        </label>
        <label>
          Qtde parcelas
          <input type="number" min="1" value={filters.installments_count} onChange={(e) => setFilters((prev) => ({ ...prev, installments_count: e.target.value }))} />
        </label>
      </div>

      <div className="finance-receivables-table-wrap">
        <table className="finance-receivables-table">
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Tratamento</th>
              <th>Total</th>
              <th>Entrada</th>
              <th>Financiado</th>
              <th>Parcelas</th>
              <th>Próx. vencimento</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {financings.length === 0 ? (
              <tr><td colSpan={9}>Nenhum financiamento encontrado.</td></tr>
            ) : (
              financings.map((item) => {
                const patientName = (patients.find((p) => p.id === item.patient_id)?.full_name)
                  || (patients.find((p) => p.id === item.patient_id)?.name)
                  || '—';
                const linkedInstallments = installmentsMap.get(item.id) || [];
                const nextInstallment = linkedInstallments.find((ins) => Number(ins.remaining_amount || 0) > 0);
                const hasOpenInstallments = linkedInstallments.some((ins) => Number(ins.remaining_amount || 0) > 0);
                const canApprove = [FINANCING_STATUS.DRAFT, FINANCING_STATUS.PENDING_ANALYSIS].includes(item.status);
                const canReject = [FINANCING_STATUS.DRAFT, FINANCING_STATUS.PENDING_ANALYSIS].includes(item.status);
                const canGenerateCharge = [FINANCING_STATUS.APPROVED, FINANCING_STATUS.ACTIVE, FINANCING_STATUS.PARTIALLY_PAID, FINANCING_STATUS.OVERDUE].includes(item.status) && hasOpenInstallments;
                const canRegisterPayment = [FINANCING_STATUS.APPROVED, FINANCING_STATUS.ACTIVE, FINANCING_STATUS.PARTIALLY_PAID, FINANCING_STATUS.OVERDUE].includes(item.status) && hasOpenInstallments;
                const canRenegotiate = [FINANCING_STATUS.ACTIVE, FINANCING_STATUS.PARTIALLY_PAID, FINANCING_STATUS.OVERDUE, FINANCING_STATUS.DEFAULTED].includes(item.status) && hasOpenInstallments;
                const canCancel = ![FINANCING_STATUS.CANCELED, FINANCING_STATUS.RENEGOTIATED, FINANCING_STATUS.PAID_OFF].includes(item.status);
                return (
                  <tr key={item.id}>
                    <td>{patientName}</td>
                    <td>{item.description}</td>
                    <td>{formatCurrencyBRL(item.total_amount)}</td>
                    <td>{formatCurrencyBRL(item.entry_amount)}</td>
                    <td>{formatCurrencyBRL(item.net_financed_amount)}</td>
                    <td>{item.installments_count}</td>
                    <td>{formatDate(nextInstallment?.due_date)}</td>
                    <td>
                      <span className={`finance-receivables-status finance-receivables-status--${item.status}`}>
                        {financingStatusLabel[item.status] || item.status}
                      </span>
                    </td>
                    <td className="finance-receivables-actions">
                      <button type="button" className="button icon" title="Visualizar" onClick={() => openDetails(item)}>
                        <Eye size={16} />
                      </button>
                      <button type="button" className="button icon" title="Aprovar" onClick={() => handleApprove(item)} disabled={!canApprove || busyAction === `approve:${item.id}`}>
                        <BadgeCheck size={16} />
                      </button>
                      <button type="button" className="button icon" title="Reprovar" onClick={() => handleReject(item)} disabled={!canReject || busyAction === `reject:${item.id}`}>
                        <XCircle size={16} />
                      </button>
                      <button
                        type="button"
                        className="button icon"
                        title="Gerar boleto"
                        onClick={() => {
                          if (!canGenerateCharge) return;
                          const firstOpen = linkedInstallments.find((ins) => Number(ins.remaining_amount || 0) > 0);
                          if (!firstOpen) {
                            showToast('Sem parcelas abertas para gerar boleto.', 'error');
                            return;
                          }
                          setSelectedInstallment(firstOpen);
                          setDetailsData((prev) => ({ ...prev, financing: item }));
                          setModal('boleto');
                        }}
                        disabled={!canGenerateCharge}
                      >
                        <FileText size={16} />
                      </button>
                      <button
                        type="button"
                        className="button icon"
                        title="Registrar pagamento"
                        onClick={() => {
                          if (!canRegisterPayment) return;
                          const firstOpen = linkedInstallments.find((ins) => Number(ins.remaining_amount || 0) > 0);
                          if (!firstOpen) {
                            showToast('Sem parcelas abertas para baixa.', 'error');
                            return;
                          }
                          setSelectedInstallment(firstOpen);
                          setModal('payment');
                        }}
                        disabled={!canRegisterPayment}
                      >
                        <DollarSign size={16} />
                      </button>
                      <button type="button" className="button icon" title="Renegociar" onClick={() => {
                        if (!canRenegotiate) return;
                        setDetailsData((prev) => ({ ...prev, financing: item, installments: linkedInstallments }));
                        setModal('renegotiate');
                      }} disabled={!canRenegotiate}>
                        <RefreshCcw size={16} />
                      </button>
                      <button type="button" className="button icon danger" title="Cancelar" onClick={() => {
                        if (!canCancel) return;
                        if (!window.confirm('Confirma o cancelamento deste financiamento?')) return;
                        const reason = window.prompt('Motivo do cancelamento:') || '';
                        try {
                          cancelFinancing(user, item.id, reason);
                          showToast('Financiamento cancelado.');
                          setRefreshKey((k) => k + 1);
                        } catch (error) {
                          showToast(error.message || 'Erro ao cancelar financiamento.', 'error');
                        }
                      }} disabled={!canCancel}>
                        <XCircle size={16} />
                      </button>
                      <button type="button" className="button icon" title="Gerar boletos" onClick={() => handleGenerateCharges(item)} disabled={!canGenerateCharge || busyAction === `charges:${item.id}`}>
                        <FileText size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <FinancingFormModal
        isOpen={modal === 'new'}
        patients={patients}
        onClose={() => setModal(null)}
        onSubmit={({ payload, options }) => {
          try {
            const flow = executeFinancingCreationFlow(user, payload, {
              approve_immediately: Boolean(options?.approve_immediately),
              entry_received_now: Boolean(options?.entry_received_now),
            });
            if (flow.approved) {
              showToast(`Financiamento criado e aprovado (${flow.installments.length} parcela(s)).`);
            } else {
              showToast('Proposta de financiamento criada.');
            }
            setModal(null);
            setRefreshKey((k) => k + 1);
          } catch (error) {
            showToast(error.message || 'Erro ao criar financiamento.', 'error');
          }
        }}
      />

      <FinancingDetailsModal
        isOpen={modal === 'details'}
        financing={detailsData.financing}
        installments={detailsData.installments}
        boletos={detailsData.boletos}
        payments={detailsData.payments}
        timeline={detailsData.timeline}
        onClose={() => setModal(null)}
      />

      <GenerateBoletoModal
        isOpen={modal === 'boleto'}
        installment={selectedInstallment}
        onClose={() => {
          setSelectedInstallment(null);
          setModal(null);
        }}
        onSubmit={(payload) => {
          try {
            executeChargeGenerationFlow(user, {
              financing_id: selectedInstallment.financing_id,
              installment_ids: [selectedInstallment.id],
              ...payload,
            });
            showToast('Boleto gerado com sucesso.');
            setSelectedInstallment(null);
            setModal(null);
            setRefreshKey((k) => k + 1);
          } catch (error) {
            showToast(error.message || 'Erro ao gerar boleto.', 'error');
          }
        }}
      />

      <RegisterFinancingPaymentModal
        isOpen={modal === 'payment'}
        installment={selectedInstallment}
        onClose={() => {
          setSelectedInstallment(null);
          setModal(null);
        }}
        onSubmit={(payload) => {
          try {
            executeReceivementFlow(user, payload);
            showToast('Pagamento registrado.');
            setSelectedInstallment(null);
            setModal(null);
            setRefreshKey((k) => k + 1);
          } catch (error) {
            showToast(error.message || 'Erro ao registrar pagamento.', 'error');
          }
        }}
      />

      <RenegotiateFinancingModal
        isOpen={modal === 'renegotiate'}
        installments={detailsData.installments}
        onClose={() => setModal(null)}
        onSubmit={(payload) => {
          try {
            executeRenegotiationFlow(user, {
              financing_id: detailsData.financing.id,
              ...payload,
            });
            showToast('Renegociação concluída.');
            setModal(null);
            setRefreshKey((k) => k + 1);
          } catch (error) {
            showToast(error.message || 'Erro ao renegociar financiamento.', 'error');
          }
        }}
      />
    </div>
  );
}
