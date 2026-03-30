import { useMemo, useState, useRef, useId } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  Eye,
  ExternalLink,
  Receipt,
  Landmark,
  TrendingUp,
  Banknote,
  CreditCard,
  CircleDollarSign,
  Hash,
  Users,
  Download,
  RefreshCw,
  ListOrdered,
  BarChart3,
} from 'lucide-react';
import { loadDb } from '../db/index.js';
import { getFaturamentoReport } from '../services/faturamentoService.js';
import { getProfessionalOptions } from '../services/collaboratorService.js';
import { formatCurrencyBRL } from '../utils/currency.js';
import { getFinancingById, getFinancingTimeline, listFinancings } from '../services/financingsService.js';
import { listFinancingInstallments } from '../services/financingInstallmentsService.js';
import { listBoletoCharges } from '../services/boletoChargesService.js';
import { getReceivableById, getReceivablePayments } from '../services/receivablesService.js';
import FinancingDetailsModal from '../components/finance/FinancingDetailsModal.jsx';

/** Cores alinhadas ao design system Love Odonto */
const CHART_PALETTE = {
  primary: '#6A00FF',
  accent: '#2563EB',
  secondary: '#EC4899',
  success: '#10B981',
  warning: '#F59E0B',
  muted: '#9CA3AF',
};

const PIE_COLORS = [CHART_PALETTE.primary, CHART_PALETTE.success];

const fmtDay = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
};

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

const statusLabel = {
  ativo: 'Ativo',
  cancelado: 'Cancelado',
  renegociado: 'Renegociado',
};

const STATUS_BADGE_CLASS = {
  ativo: 'fat-badge fat-badge--success',
  cancelado: 'fat-badge fat-badge--neutral',
  renegociado: 'fat-badge fat-badge--warning',
};

const TIPO_BADGE_CLASS = {
  Financiamento: 'fat-badge fat-badge--tipo-fin',
  'À vista': 'fat-badge fat-badge--tipo-vista',
};

const CurrencyTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="fat-chart-tooltip">
      {label != null && <div className="fat-chart-tooltip__label">{label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey} className="fat-chart-tooltip__row">
          <span>{p.name}</span>
          <strong>{formatCurrencyBRL(Number(p.value || 0))}</strong>
        </div>
      ))}
    </div>
  );
};

function ReceivableQuickDetailModal({ receivable, payments, onClose }) {
  if (!receivable) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content fat-modal-receivable" onClick={(e) => e.stopPropagation()}>
        <div className="fat-modal-receivable__head">
          <h3>Título a receber</h3>
          <p className="fat-modal-receivable__desc">{receivable.description}</p>
        </div>
        <div className="fat-modal-receivable__body">
          <p><strong>Paciente</strong><span>{receivable._patientName || '—'}</span></p>
          <p><strong>Faturamento</strong><span>{formatCurrencyBRL(receivable.net_amount)}</span></p>
          <p><strong>Recebido</strong><span>{formatCurrencyBRL(receivable.received_amount)}</span></p>
          <p><strong>Em aberto</strong><span>{formatCurrencyBRL(receivable.remaining_amount)}</span></p>
          <p><strong>Vencimento</strong><span>{fmtDay(receivable.due_date)}</span></p>
          <h4>Pagamentos</h4>
          {payments.length === 0 ? (
            <p className="muted">Nenhum pagamento registrado.</p>
          ) : (
            <ul className="fat-modal-receivable__payments">
              {payments.map((p) => (
                <li key={p.id}>
                  {fmtDay(p.payment_date)} — {formatCurrencyBRL(p.amount_received)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="fat-modal-receivable__footer">
          <Link className="button secondary" to="/financeiro/contas-receber">
            <ExternalLink size={16} /> Contas a receber
          </Link>
          <button type="button" className="button secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function FatKpiCard({ icon: Icon, label, hint, value, valueClass = '' }) {
  return (
    <div className="fat-kpi-card">
      <div className="fat-kpi-card__top">
        <span className="fat-kpi-card__icon" aria-hidden>
          <Icon size={22} strokeWidth={1.75} />
        </span>
      </div>
      <span className="fat-kpi-card__label">{label}</span>
      <strong className={`fat-kpi-card__value ${valueClass}`.trim()}>{value}</strong>
      {hint ? <span className="fat-kpi-card__hint">{hint}</span> : null}
    </div>
  );
}

export default function FinanceFaturamentoPage() {
  const chartGradUid = useId().replace(/:/g, '');
  const [refreshKey, setRefreshKey] = useState(0);
  const [filters, setFilters] = useState({
    startDate: firstDayOfMonth(),
    endDate: lastDayOfMonth(),
    patientId: '',
    professionalId: '',
    type: '',
    status: '',
    minValue: '',
    maxValue: '',
  });
  const [toast, setToast] = useState(null);
  const [financingDetailsOpen, setFinancingDetailsOpen] = useState(false);
  const [detailsData, setDetailsData] = useState({
    financing: null,
    installments: [],
    boletos: [],
    payments: [],
    timeline: [],
  });
  const [receivableModal, setReceivableModal] = useState({ open: false, receivable: null, payments: [] });
  const detailsRef = useRef(null);

  const db = useMemo(() => loadDb(), [refreshKey]);
  const patients = db.patients || [];
  const professionals = useMemo(() => getProfessionalOptions(), [refreshKey]);
  const receivablePayments = Array.isArray(db.receivablePayments) ? db.receivablePayments : [];

  const report = useMemo(
    () =>
      getFaturamentoReport({
        startDate: filters.startDate,
        endDate: filters.endDate,
        patientId: filters.patientId,
        professionalId: filters.professionalId,
        type: filters.type,
        status: filters.status,
        minValue: filters.minValue,
        maxValue: filters.maxValue,
      }),
    [filters, refreshKey]
  );

  const { lines, kpis, chartData } = report;

  const mixVistaPct =
    kpis.totalFaturamento > 0 ? Math.round((kpis.vista / kpis.totalFaturamento) * 100) : 0;
  const mixFinPct =
    kpis.totalFaturamento > 0 ? Math.round((kpis.fin / kpis.totalFaturamento) * 100) : 0;

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3200);
  };

  const openFinancingDetails = (financingId) => {
    const financing = getFinancingById(financingId) || listFinancings({}).find((f) => f.id === financingId);
    if (!financing) {
      showToast('Financiamento não encontrado.', 'error');
      return;
    }
    const installments = listFinancingInstallments({ financing_id: financing.id });
    const receivableIds = new Set(installments.map((item) => item.receivable_id).filter(Boolean));
    setDetailsData({
      financing,
      installments,
      boletos: listBoletoCharges({ financing_id: financing.id }),
      payments: receivablePayments.filter((item) => receivableIds.has(item.receivable_id)),
      timeline: getFinancingTimeline(financing.id),
    });
    setFinancingDetailsOpen(true);
  };

  const openReceivableDetails = (receivableId) => {
    const receivable = getReceivableById(receivableId);
    if (!receivable) {
      showToast('Título não encontrado.', 'error');
      return;
    }
    const p = patients.find((x) => x.id === receivable.patient_id);
    const patientName = (p?.full_name || p?.name || '—').trim();
    setReceivableModal({
      open: true,
      receivable: { ...receivable, _patientName: patientName },
      payments: getReceivablePayments(receivableId),
    });
  };

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
    showToast('Dados atualizados.');
  };

  const scrollToDetails = () => {
    detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleExportCsv = () => {
    const sep = ';';
    const headers = [
      'Paciente',
      'Tipo',
      'Faturamento',
      'Recebido',
      'Em aberto',
      'Data venda',
      'Profissional',
      'Tratamento',
      'Status',
      'Contagem KPI',
    ];
    const escape = (v) => {
      const s = String(v ?? '');
      if (s.includes(sep) || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const body = lines.map((line) =>
      [
        line.patientName,
        line.tipoLabel,
        line.totalAmount,
        line.receivedAmount,
        line.openAmount,
        line.saleDateShort,
        line.professionalName,
        line.treatment,
        statusLabel[line.displayStatus] || line.displayStatus,
        line.countsInKpi ? 'Sim' : 'Não',
      ]
        .map(escape)
        .join(sep)
    );
    const bom = '\ufeff';
    const csv = bom + [headers.join(sep), ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `faturamento-${filters.startDate}-${filters.endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exportação concluída.');
  };

  return (
    <div className="finance-faturamento-page fat-dash">
      {toast && (
        <div className={`toast finance-toast ${toast.type}`} role="status">
          {toast.message}
        </div>
      )}

      <header className="fat-hero">
        <div className="fat-hero__main">
          <div className="fat-hero__eyebrow">Financeiro</div>
          <h1 className="fat-hero__title">Faturamento</h1>
          <p className="fat-hero__subtitle">
            Visão da produção financeira da clínica no período — valor contratado (vendas), separado do caixa.
          </p>
          <div className="fat-hero__meta">
            <span className="fat-hero__meta-pill">
              Período: {fmtDay(filters.startDate)} — {fmtDay(filters.endDate)}
            </span>
            <span className="fat-hero__meta-pill fat-hero__meta-pill--muted">
              {lines.length} registro(s) listado(s)
            </span>
          </div>
        </div>
        <div className="fat-hero__actions">
          <button type="button" className="button secondary fat-hero__btn" onClick={handleExportCsv}>
            <Download size={18} /> Exportar
          </button>
          <button type="button" className="button secondary fat-hero__btn" onClick={handleRefresh}>
            <RefreshCw size={18} /> Atualizar
          </button>
          <button type="button" className="button primary fat-hero__btn" onClick={scrollToDetails}>
            <ListOrdered size={18} /> Ver detalhes
          </button>
          <div className="fat-hero__links">
            <Link className="fat-hero__link" to="/financeiro/contas-receber">
              <Receipt size={16} /> Contas a receber
            </Link>
            <Link className="fat-hero__link" to="/financeiro/financiamento">
              <Landmark size={16} /> Financiamentos
            </Link>
          </div>
        </div>
      </header>

      <section className="fat-section" aria-labelledby="fat-kpis-title">
        <div className="fat-section__head">
          <h2 id="fat-kpis-title" className="fat-section__title">Indicadores do período</h2>
          <p className="fat-section__desc">
            Valores abaixo refletem apenas contratos e títulos válidos para KPI (exclui rascunho, análise pendente, cancelados e substituídos por renegociação).
          </p>
        </div>
        <div className="fat-kpi-grid">
          <FatKpiCard
            icon={TrendingUp}
            label="Faturamento no período"
            hint="Produção líquida para metas"
            value={formatCurrencyBRL(kpis.totalFaturamento)}
            valueClass="fat-kpi-card__value--hero"
          />
          <FatKpiCard
            icon={Banknote}
            label="À vista"
            value={formatCurrencyBRL(kpis.vista)}
            valueClass="fat-kpi-card__value--vista"
          />
          <FatKpiCard
            icon={CreditCard}
            label="Financiamento"
            value={formatCurrencyBRL(kpis.fin)}
            valueClass="fat-kpi-card__value--fin"
          />
          <FatKpiCard
            icon={CircleDollarSign}
            label="Ticket médio"
            value={formatCurrencyBRL(kpis.ticketMedio)}
          />
          <FatKpiCard
            icon={Hash}
            label="Quantidade de vendas"
            value={String(kpis.countSales)}
            hint="Linhas de faturamento no KPI"
          />
          <FatKpiCard
            icon={Users}
            label="Média por paciente"
            value={formatCurrencyBRL(kpis.mediaPorPaciente)}
            hint={`${kpis.uniquePatientCount} paciente(s) distinto(s)`}
          />
        </div>
      </section>

      {kpis.totalFaturamento > 0 ? (
        <div className="fat-insights" role="region" aria-label="Composição do faturamento">
          <div className="fat-insights__item">
            <span className="fat-insights__label">Mix à vista</span>
            <div className="fat-insights__bar-wrap">
              <div className="fat-insights__bar fat-insights__bar--vista" style={{ width: `${mixVistaPct}%` }} />
            </div>
            <strong className="fat-insights__pct">{mixVistaPct}%</strong>
          </div>
          <div className="fat-insights__item">
            <span className="fat-insights__label">Mix financiamento</span>
            <div className="fat-insights__bar-wrap">
              <div className="fat-insights__bar fat-insights__bar--fin" style={{ width: `${mixFinPct}%` }} />
            </div>
            <strong className="fat-insights__pct">{mixFinPct}%</strong>
          </div>
        </div>
      ) : null}

      <section className="fat-section" aria-labelledby="fat-charts-title">
        <div className="fat-section__head">
          <h2 id="fat-charts-title" className="fat-section__title">
            <BarChart3 size={22} className="fat-section__title-icon" aria-hidden />
            Análise gráfica
          </h2>
          <p className="fat-section__desc">Evolução, composição e ranking da produção no recorte filtrado.</p>
        </div>
        <div className="fat-charts-grid">
          <article className="fat-chart-panel">
            <header className="fat-chart-panel__head">
              <h3 className="fat-chart-panel__title">Produção por mês</h3>
              <p className="fat-chart-panel__subtitle">Soma do faturamento elegível ao KPI, por competência da venda</p>
            </header>
            <div className="fat-chart-panel__canvas">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData.byPeriod} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_PALETTE.muted} strokeOpacity={0.35} />
                  <XAxis dataKey="periodo" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CurrencyTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="valor"
                    name="Faturamento"
                    stroke={CHART_PALETTE.primary}
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: CHART_PALETTE.primary, strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>
          <article className="fat-chart-panel">
            <header className="fat-chart-panel__head">
              <h3 className="fat-chart-panel__title">Composição por tipo</h3>
              <p className="fat-chart-panel__subtitle">À vista versus financiamento (produção)</p>
            </header>
            <div className="fat-chart-panel__canvas fat-chart-panel__canvas--pie">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData.byTipo}
                    dataKey="value"
                    nameKey="tipo"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={88}
                    paddingAngle={2}
                    label={({ tipo, percent }) => `${tipo} ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: 'var(--color-border)' }}
                  >
                    {chartData.byTipo.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="var(--color-bg-card)" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip content={<CurrencyTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-text-muted)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </article>
          <article className="fat-chart-panel fat-chart-panel--wide">
            <header className="fat-chart-panel__head">
              <h3 className="fat-chart-panel__title">Por profissional</h3>
              <p className="fat-chart-panel__subtitle">Top 12 — faturamento KPI no período</p>
            </header>
            <div className="fat-chart-panel__canvas fat-chart-panel__canvas--tall">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.byProfessional} layout="vertical" margin={{ left: 4, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={CHART_PALETTE.muted} strokeOpacity={0.35} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="profissional" width={128} tick={{ fontSize: 11, fill: 'var(--color-text)' }} />
                  <Tooltip content={<CurrencyTooltip />} />
                  <Bar dataKey="valor" name="Faturamento" radius={[0, 8, 8, 0]} fill={`url(#fatBarGradProf-${chartGradUid})`} />
                  <defs>
                    <linearGradient id={`fatBarGradProf-${chartGradUid}`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={CHART_PALETTE.primary} stopOpacity={0.85} />
                      <stop offset="100%" stopColor={CHART_PALETTE.accent} stopOpacity={0.9} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
          <article className="fat-chart-panel fat-chart-panel--wide">
            <header className="fat-chart-panel__head">
              <h3 className="fat-chart-panel__title">Por especialidade</h3>
              <p className="fat-chart-panel__subtitle">Top 12 — derivado do cadastro do profissional</p>
            </header>
            <div className="fat-chart-panel__canvas fat-chart-panel__canvas--tall">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.bySpecialty} layout="vertical" margin={{ left: 4, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={CHART_PALETTE.muted} strokeOpacity={0.35} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="especialidade" width={128} tick={{ fontSize: 11, fill: 'var(--color-text)' }} />
                  <Tooltip content={<CurrencyTooltip />} />
                  <Bar dataKey="valor" name="Faturamento" radius={[0, 8, 8, 0]} fill={`url(#fatBarGradSpec-${chartGradUid})`} />
                  <defs>
                    <linearGradient id={`fatBarGradSpec-${chartGradUid}`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={CHART_PALETTE.secondary} stopOpacity={0.75} />
                      <stop offset="100%" stopColor={CHART_PALETTE.primary} stopOpacity={0.85} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </div>
      </section>

      <section className="fat-section">
        <div className="fat-filters-card">
          <div className="fat-filters-card__head">
            <h2 className="fat-filters-card__title">Filtros</h2>
            <p className="fat-filters-card__desc">Refine a listagem e os gráficos. A data considera o registro da venda (criação).</p>
          </div>
          <div className="fat-filters-card__grid">
            <label className="fat-filter-field">
              <span>Período de</span>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters((p) => ({ ...p, startDate: e.target.value }))}
              />
            </label>
            <label className="fat-filter-field">
              <span>até</span>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters((p) => ({ ...p, endDate: e.target.value }))}
              />
            </label>
            <label className="fat-filter-field">
              <span>Paciente</span>
              <select value={filters.patientId} onChange={(e) => setFilters((p) => ({ ...p, patientId: e.target.value }))}>
                <option value="">Todos</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name || p.name || p.id}</option>
                ))}
              </select>
            </label>
            <label className="fat-filter-field">
              <span>Profissional</span>
              <select value={filters.professionalId} onChange={(e) => setFilters((p) => ({ ...p, professionalId: e.target.value }))}>
                <option value="">Todos</option>
                {professionals.map((pr) => (
                  <option key={pr.id} value={pr.id}>{pr.name}</option>
                ))}
              </select>
            </label>
            <label className="fat-filter-field">
              <span>Tipo</span>
              <select value={filters.type} onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value }))}>
                <option value="">Todos</option>
                <option value="avista">À vista</option>
                <option value="financiamento">Financiamento</option>
              </select>
            </label>
            <label className="fat-filter-field">
              <span>Status</span>
              <select value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="cancelado">Cancelado</option>
                <option value="renegociado">Renegociado</option>
              </select>
            </label>
            <label className="fat-filter-field">
              <span>Valor mín.</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={filters.minValue}
                onChange={(e) => setFilters((p) => ({ ...p, minValue: e.target.value }))}
                placeholder="0"
              />
            </label>
            <label className="fat-filter-field">
              <span>Valor máx.</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={filters.maxValue}
                onChange={(e) => setFilters((p) => ({ ...p, maxValue: e.target.value }))}
              />
            </label>
          </div>
        </div>
      </section>

      <section ref={detailsRef} className="fat-section" id="fat-detalhes" aria-labelledby="fat-table-title">
        <div className="fat-section__head fat-section__head--row">
          <div>
            <h2 id="fat-table-title" className="fat-section__title">Detalhamento</h2>
            <p className="fat-section__desc">Cada linha representa uma venda (contrato de financiamento ou título à vista). Recebido e em aberto vêm dos lançamentos, sem alterar o valor de faturamento.</p>
          </div>
        </div>
        <div className="fat-table-card">
          <div className="finance-receivables-table-wrap fat-table-wrap">
            <table className="finance-receivables-table fat-table">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Tipo</th>
                  <th>Faturamento</th>
                  <th>Recebido</th>
                  <th>Em aberto</th>
                  <th>Data</th>
                  <th>Profissional</th>
                  <th>Tratamento</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="fat-table-empty">Nenhum registro neste período ou filtros.</td>
                  </tr>
                ) : (
                  lines.map((line) => (
                    <tr key={line.key}>
                      <td className="fat-table__patient">{line.patientName}</td>
                      <td>
                        <span className={TIPO_BADGE_CLASS[line.tipoLabel] || 'fat-badge'}>
                          {line.tipoLabel}
                        </span>
                      </td>
                      <td className="fat-table__amount">{formatCurrencyBRL(line.totalAmount)}</td>
                      <td>{formatCurrencyBRL(line.receivedAmount)}</td>
                      <td>{formatCurrencyBRL(line.openAmount)}</td>
                      <td>{fmtDay(line.saleDateShort)}</td>
                      <td>{line.professionalName}</td>
                      <td className="fat-table__treatment">{line.treatment}</td>
                      <td>
                        <span className={STATUS_BADGE_CLASS[line.displayStatus] || 'fat-badge'}>
                          {statusLabel[line.displayStatus] || line.displayStatus}
                        </span>
                        {!line.countsInKpi ? (
                          <span className="fat-table__kpi-flag">fora do KPI</span>
                        ) : null}
                      </td>
                      <td className="finance-receivables-actions fat-table__actions">
                        {line.kind === 'financiamento' ? (
                          <button
                            type="button"
                            className="button icon"
                            title="Detalhes do financiamento"
                            onClick={() => openFinancingDetails(line.financingId)}
                          >
                            <Eye size={16} />
                          </button>
                        ) : null}
                        {line.kind === 'avista' ? (
                          <button
                            type="button"
                            className="button icon"
                            title="Detalhes do título"
                            onClick={() => openReceivableDetails(line.receivableId)}
                          >
                            <Eye size={16} />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <FinancingDetailsModal
        isOpen={financingDetailsOpen}
        financing={detailsData.financing}
        installments={detailsData.installments}
        boletos={detailsData.boletos}
        payments={detailsData.payments}
        timeline={detailsData.timeline}
        onClose={() => setFinancingDetailsOpen(false)}
      />

      {receivableModal.open ? (
        <ReceivableQuickDetailModal
          receivable={receivableModal.receivable}
          payments={receivableModal.payments}
          onClose={() => setReceivableModal({ open: false, receivable: null, payments: [] })}
        />
      ) : null}
    </div>
  );
}
