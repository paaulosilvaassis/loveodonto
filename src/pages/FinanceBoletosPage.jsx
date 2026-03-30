import { useMemo, useState } from 'react';
import { Eye, RefreshCcw, Ban, DollarSign, Link2, Send } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { loadDb } from '../db/index.js';
import {
  listBoletoCharges,
  generateSecondCopy,
  cancelBoletoCharge,
  updateBoletoChargeStatus,
  BOLETO_CHARGE_STATUS,
} from '../services/boletoChargesService.js';
import { registerFinancingPayment, runBoletoReminderRule } from '../services/financingsService.js';
import { listFinancingInstallments } from '../services/financingInstallmentsService.js';
import { formatCurrencyBRL } from '../utils/currency.js';
import BoletoDetailsModal from '../components/finance/BoletoDetailsModal.jsx';
import RegisterFinancingPaymentModal from '../components/finance/RegisterFinancingPaymentModal.jsx';

const BOLETO_TABS = [
  { key: 'all', label: 'Todos' },
  { key: 'generated', label: 'Gerados' },
  { key: 'sent', label: 'Enviados' },
  { key: 'overdue', label: 'Vencidos' },
  { key: 'paid', label: 'Pagos' },
  { key: 'canceled', label: 'Cancelados' },
  { key: 'second_copy', label: '2ª via' },
];

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
};

const safeCopyToClipboard = async (value) => {
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
};

export default function FinanceBoletosPage() {
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState('all');
  const [filters, setFilters] = useState({
    patient_id: '',
    financing_id: '',
    installment_id: '',
    startDate: '',
    endDate: '',
    type: '',
    status: '',
  });
  const [selectedBoleto, setSelectedBoleto] = useState(null);
  const [selectedInstallment, setSelectedInstallment] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);

  const db = useMemo(() => loadDb(), [refreshKey]);
  const patients = db.patients || [];
  const financings = db.financings || [];

  const boletos = useMemo(() => {
    const list = listBoletoCharges(filters);
    if (activeTab === 'all') return list;
    if (activeTab === 'second_copy') return list.filter((item) => item.charge_type === 'second_copy');
    return list.filter((item) => item.status === activeTab);
  }, [filters, activeTab, refreshKey]);

  const kpis = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthItems = boletos.filter((item) => (item.created_at || '').slice(0, 7) === currentMonth);
    const total = monthItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const paid = monthItems.filter((item) => item.status === BOLETO_CHARGE_STATUS.PAID);
    const overdue = monthItems.filter((item) => item.status === BOLETO_CHARGE_STATUS.OVERDUE);
    const paidAmount = paid.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const overdueAmount = overdue.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return {
      issuedCount: monthItems.length,
      totalAmount: total,
      paidCount: paid.length,
      overdueCount: overdue.length,
      paymentRate: monthItems.length > 0 ? (paid.length / monthItems.length) * 100 : 0,
      overdueAmount,
      paidAmount,
    };
  }, [boletos]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <div className="finance-financing-page">
      {toast && <div className={`toast finance-toast ${toast.type}`}>{toast.message}</div>}
      <div className="finance-financing-header">
        <h1>Boletos</h1>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            try {
              const reminders = runBoletoReminderRule(user);
              showToast(`Régua executada: ${reminders.length} evento(s) de cobrança.`);
            } catch (error) {
              showToast(error.message || 'Erro ao executar régua.', 'error');
            }
          }}
        >
          <Send size={16} />
          Executar régua
        </button>
      </div>

      <nav className="finance-receivables-nav">
        <div className="finance-receivables-nav-inner">
          {BOLETO_TABS.map((tab) => (
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
          <span className="finance-receivables-kpi-label">Boletos emitidos no mês</span>
          <strong>{kpis.issuedCount}</strong>
        </div>
        <div className="finance-receivables-kpi-card">
          <span className="finance-receivables-kpi-label">Valor total em boletos</span>
          <strong>{formatCurrencyBRL(kpis.totalAmount)}</strong>
        </div>
        <div className="finance-receivables-kpi-card finance-receivables-kpi-card--received">
          <span className="finance-receivables-kpi-label">Boletos pagos</span>
          <strong>{kpis.paidCount}</strong>
        </div>
        <div className="finance-receivables-kpi-card finance-receivables-kpi-card--overdue">
          <span className="finance-receivables-kpi-label">Boletos vencidos</span>
          <strong>{kpis.overdueCount}</strong>
        </div>
        <div className="finance-receivables-kpi-card">
          <span className="finance-receivables-kpi-label">Taxa de pagamento</span>
          <strong>{kpis.paymentRate.toFixed(1)}%</strong>
        </div>
        <div className="finance-receivables-kpi-card finance-receivables-kpi-card--overdue">
          <span className="finance-receivables-kpi-label">Valor em atraso</span>
          <strong>{formatCurrencyBRL(kpis.overdueAmount)}</strong>
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
          Financiamento
          <select value={filters.financing_id} onChange={(e) => setFilters((prev) => ({ ...prev, financing_id: e.target.value }))}>
            <option value="">Todos</option>
            {financings.map((financing) => (
              <option key={financing.id} value={financing.id}>{financing.description}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
            <option value="">Todos</option>
            {Object.values(BOLETO_CHARGE_STATUS).map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select value={filters.type} onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}>
            <option value="">Todos</option>
            <option value="boleto">Boleto</option>
            <option value="carne">Carnê</option>
            <option value="whatsapp_reminder">WhatsApp</option>
            <option value="email_reminder">E-mail</option>
            <option value="sms_reminder">SMS</option>
            <option value="second_copy">2ª via</option>
          </select>
        </label>
      </div>

      <div className="finance-receivables-table-wrap">
        <table className="finance-receivables-table">
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Parcela</th>
              <th>Financiamento</th>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>Status</th>
              <th>Emissão</th>
              <th>2ª via</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {boletos.length === 0 ? (
              <tr><td colSpan={9}>Nenhum boleto encontrado.</td></tr>
            ) : (
              boletos.map((boleto) => {
                const patientName = (patients.find((p) => p.id === boleto.patient_id)?.full_name)
                  || (patients.find((p) => p.id === boleto.patient_id)?.name)
                  || '—';
                const financing = financings.find((f) => f.id === boleto.financing_id);
                const installment = listFinancingInstallments({ financing_id: boleto.financing_id })
                  .find((ins) => ins.id === boleto.installment_id);
                return (
                  <tr key={boleto.id}>
                    <td>{patientName}</td>
                    <td>{installment ? `${installment.installment_number}/${installment.total_installments}` : '—'}</td>
                    <td>{financing?.description || '—'}</td>
                    <td>{formatCurrencyBRL(boleto.amount)}</td>
                    <td>{formatDate(boleto.due_date)}</td>
                    <td>{boleto.status}</td>
                    <td>{formatDate(boleto.issue_date)}</td>
                    <td>{boleto.charge_type === 'second_copy' ? 'Sim' : 'Não'}</td>
                    <td className="finance-receivables-actions">
                      <button type="button" className="button icon" title="Visualizar boleto" onClick={() => {
                        setSelectedBoleto(boleto);
                        setModal('details');
                      }}>
                        <Eye size={16} />
                      </button>
                      <button type="button" className="button icon" title="Copiar linha digitável" onClick={async () => {
                        const ok = await safeCopyToClipboard(boleto.linha_digitavel);
                        showToast(ok ? 'Linha digitável copiada.' : 'Não foi possível copiar.', ok ? 'success' : 'error');
                      }}>
                        <Link2 size={16} />
                      </button>
                      <button type="button" className="button icon" title="Marcar como enviado" onClick={() => {
                        try {
                          updateBoletoChargeStatus(user, boleto.id, BOLETO_CHARGE_STATUS.SENT);
                          showToast('Boleto marcado como enviado.');
                          setRefreshKey((k) => k + 1);
                        } catch (error) {
                          showToast(error.message || 'Erro ao atualizar boleto.', 'error');
                        }
                      }}>
                        <Send size={16} />
                      </button>
                      <button type="button" className="button icon" title="Gerar 2ª via" onClick={() => {
                        try {
                          generateSecondCopy(user, boleto.id);
                          showToast('2ª via gerada.');
                          setRefreshKey((k) => k + 1);
                        } catch (error) {
                          showToast(error.message || 'Erro ao gerar 2ª via.', 'error');
                        }
                      }}>
                        <RefreshCcw size={16} />
                      </button>
                      <button type="button" className="button icon" title="Registrar pagamento" onClick={() => {
                        if (!installment) {
                          showToast('Parcela não encontrada para baixa.', 'error');
                          return;
                        }
                        setSelectedInstallment(installment);
                        setModal('payment');
                      }}>
                        <DollarSign size={16} />
                      </button>
                      <button type="button" className="button icon danger" title="Cancelar cobrança" onClick={() => {
                        const reason = window.prompt('Motivo do cancelamento da cobrança:') || '';
                        try {
                          cancelBoletoCharge(user, boleto.id, reason);
                          showToast('Cobrança cancelada.');
                          setRefreshKey((k) => k + 1);
                        } catch (error) {
                          showToast(error.message || 'Erro ao cancelar cobrança.', 'error');
                        }
                      }}>
                        <Ban size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <BoletoDetailsModal
        isOpen={modal === 'details'}
        boleto={selectedBoleto}
        onClose={() => {
          setSelectedBoleto(null);
          setModal(null);
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
            registerFinancingPayment(user, payload);
            if (selectedBoleto?.id) {
              updateBoletoChargeStatus(user, selectedBoleto.id, BOLETO_CHARGE_STATUS.PAID);
            }
            showToast('Pagamento registrado com sucesso.');
            setSelectedInstallment(null);
            setModal(null);
            setRefreshKey((k) => k + 1);
          } catch (error) {
            showToast(error.message || 'Erro ao registrar pagamento.', 'error');
          }
        }}
      />
    </div>
  );
}
