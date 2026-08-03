import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Pause,
  Play,
  Trash2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { useAuth } from '../auth/useAuth.js';
import { loadDb } from '../db/index.js';
import { formatCurrencyBRL } from '../utils/currency.js';
import {
  COMMISSION_ROLE,
  COMMISSION_RULE_TYPE,
  COMMISSION_APPLY_ON,
  listCommissionRules,
  createCommissionRule,
  updateCommissionRule,
  setCommissionRuleActive,
  reorderCommissionRulePriorities,
  deleteCommissionRule,
} from '../services/commissionRulesService.js';
import {
  COMMISSION_STATUS,
  COMMISSION_BASIS,
  calculateCommissionForPeriod,
  listCommissions,
  getCommissionsDashboard,
  setCommissionStatus,
} from '../services/commissionCalculationService.js';
import { LEAD_SOURCE, LEAD_SOURCE_LABELS } from '../services/crmService.js';

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'rules', label: 'Regras de Comissão' },
  { key: 'calculated', label: 'Comissões Calculadas' },
  { key: 'reports', label: 'Relatórios' },
];

const RULE_LABELS = {
  [COMMISSION_RULE_TYPE.PRODUCTION]: '% sobre produção',
  [COMMISSION_RULE_TYPE.RECEIVED]: '% sobre recebimento',
  [COMMISSION_RULE_TYPE.FIXED]: 'Valor fixo',
  [COMMISSION_RULE_TYPE.PROFIT]: '% sobre lucro',
  [COMMISSION_RULE_TYPE.PATIENT_CHECKIN]: 'Valor por comparecimento (captação)',
  [COMMISSION_RULE_TYPE.PATIENT_CLOSING]: 'Fechamento (fixo ou % sobre valor fechado)',
};

const STATUS_LABELS = {
  [COMMISSION_STATUS.PENDING]: 'Pendente',
  [COMMISSION_STATUS.AVAILABLE]: 'Disponível',
  [COMMISSION_STATUS.PAID]: 'Pago',
  [COMMISSION_STATUS.REVERSED]: 'Estornada',
};

const ROLE_LABELS = {
  [COMMISSION_ROLE.DENTISTA]: 'Dentista',
  [COMMISSION_ROLE.AVALIADOR]: 'Avaliador',
  [COMMISSION_ROLE.COMERCIAL]: 'Comercial',
  [COMMISSION_ROLE.GESTOR]: 'Gestor',
  [COMMISSION_ROLE.RECEPCAO]: 'Recepção',
};

const TYPE_COLORS = ['#6A00FF', '#10B981', '#EC4899', '#F59E0B', '#0EA5E9', '#8B5CF6'];

const today = () => new Date().toISOString().slice(0, 10);
const firstDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const initialRuleForm = {
  type: COMMISSION_RULE_TYPE.PRODUCTION,
  percentage: '',
  fixed_amount: '',
  apply_on: COMMISSION_APPLY_ON.TOTAL_VALUE,
  professional_id: '',
  role: COMMISSION_ROLE.DENTISTA,
  specialty: '',
  procedure_id: '',
  lead_source: '',
  active: true,
  priority: 100,
};

const MODEL_TYPE_SHORT = {
  [COMMISSION_RULE_TYPE.PRODUCTION]: 'Produção',
  [COMMISSION_RULE_TYPE.RECEIVED]: 'Recebimento',
  [COMMISSION_RULE_TYPE.FIXED]: 'Fixo',
  [COMMISSION_RULE_TYPE.PROFIT]: 'Lucro',
  [COMMISSION_RULE_TYPE.PATIENT_CHECKIN]: 'Comparecimento',
  [COMMISSION_RULE_TYPE.PATIENT_CLOSING]: 'Fechamento',
};

function formatCommissionModelLine(rule) {
  if (rule.type === COMMISSION_RULE_TYPE.PATIENT_CHECKIN) {
    return `${formatCurrencyBRL(Number(rule.fixed_amount || 0))} por paciente que compareceu`;
  }
  if (rule.type === COMMISSION_RULE_TYPE.PATIENT_CLOSING) {
    const fa = Number(rule.fixed_amount || 0);
    const pct = Number(rule.percentage || 0);
    if (fa > 0 && pct <= 0) return `${formatCurrencyBRL(fa)} por fechamento`;
    if (pct > 0) return `${pct}% sobre o valor fechado (orçamento / venda / financiamento)`;
    return 'Configure % ou valor fixo de fechamento';
  }
  if (rule.type === COMMISSION_RULE_TYPE.FIXED) {
    return `${formatCurrencyBRL(Number(rule.fixed_amount || 0))} por procedimento`;
  }
  if (rule.type === COMMISSION_RULE_TYPE.PROFIT) {
    return `${Number(rule.percentage || 0)}% sobre lucro`;
  }
  if (rule.type === COMMISSION_RULE_TYPE.RECEIVED) {
    return `${Number(rule.percentage || 0)}% sobre recebimento`;
  }
  return `${Number(rule.percentage || 0)}% sobre produção`;
}

function commissionRowBasisLabel(c) {
  const b = c.metadata?.commission_basis;
  if (b === COMMISSION_BASIS.PATIENT_CHECKIN) return 'Comparecimento';
  if (b === COMMISSION_BASIS.PATIENT_CLOSING || b === 'patient_conversion') return 'Fechamento';
  if (b === COMMISSION_BASIS.RECEIVED || b === 'received') return 'Recebimento';
  return 'Produção';
}

function commissionOriginLabel(c) {
  if (c.source_type === 'appointment') return 'Agenda';
  if (c.source_type === 'crm_budget') return 'Orçamento CRM';
  if (c.source_type === 'financing') return 'Financiamento';
  if (c.source_type === 'receivable') return 'Conta a receber';
  return c.source_type || '—';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikeUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

function formatSpecialtyLabel(specialty) {
  const s = specialty != null ? String(specialty).trim() : '';
  if (!s) return 'Todos';
  if (looksLikeUuid(s)) return 'Não definido';
  return s;
}

function formatProcedureLabel(procedureId, procMap) {
  if (!procedureId) return 'Todos';
  const name = procMap.get(procedureId);
  const label = name != null ? String(name).trim() : '';
  if (label) return label;
  return 'Não definido';
}

function formatRuleCardSubtitle(rule, collaboratorLabel) {
  const roleLabel = ROLE_LABELS[rule.role] || rule.role || 'Cargo';
  if (rule.professional_id) {
    return `${roleLabel} • ${collaboratorLabel || 'Não definido'}`;
  }
  const kind = MODEL_TYPE_SHORT[rule.type] || 'Regra';
  return `Todos os profissionais • ${kind}`;
}

function formatScopeBody(rule, collaboratorLabel) {
  if (rule.professional_id) return collaboratorLabel || 'Não definido';
  return 'Todos os profissionais';
}

const exportCommissionsCsv = (items, filenamePrefix = 'comissoes') => {
  const sep = ';';
  const headers = [
    'Profissional',
    'Cargo',
    'Tipo',
    'Paciente',
    'Origem',
    'Origem técnica',
    'Base',
    'Comissão',
    'Regra',
    'Status',
    'Data referência',
    'Data pagamento',
  ];
  const esc = (v) => {
    const s = String(v ?? '');
    if (s.includes(sep) || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const rows = items.map((c) => [
    c._professional_name || c.professional_id || '—',
    ROLE_LABELS[c.role] || c.role || '—',
    commissionRowBasisLabel(c),
    c._patient_name || c.metadata?.patient_id || '—',
    commissionOriginLabel(c),
    `${c.source_type || ''} · ${c.source_id || ''}`,
    c.amount_base,
    c.commission_amount,
    c.metadata?.rule_name || c.rule_id || '—',
    STATUS_LABELS[c.status] || c.status,
    c.reference_date || '',
    c.payment_date || '',
  ].map(esc).join(sep));
  const blob = new Blob(['\ufeff' + [headers.join(sep), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

export default function FinanceComissoesPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({
    startDate: firstDay(),
    endDate: today(),
    professional_id: '',
    status: '',
    commission_basis: 'all',
  });
  const [ruleForm, setRuleForm] = useState(initialRuleForm);
  const [editingRuleId, setEditingRuleId] = useState(null);

  const db = useMemo(() => loadDb(), [refreshKey]);
  const collaborators = Array.isArray(db.collaborators) ? db.collaborators : [];
  const activeCollaborators = useMemo(
    () => collaborators.filter((c) => String(c?.status || '').toLowerCase() === 'ativo'),
    [collaborators]
  );
  const selectableCollaborators = activeCollaborators.length > 0 ? activeCollaborators : collaborators;
  const procedures = Array.isArray(db.priceTableProcedures) ? db.priceTableProcedures : [];
  const professionalMap = useMemo(() => {
    const m = new Map();
    collaborators.forEach((c) => m.set(c.id, c.apelido || c.nomeCompleto || c.id));
    return m;
  }, [collaborators]);

  const procedureMap = useMemo(() => {
    const m = new Map();
    procedures.forEach((p) => {
      if (p?.id) {
        const label = p.title || p.name || p.label || '';
        m.set(p.id, label || '');
      }
    });
    return m;
  }, [procedures]);

  const patientMap = useMemo(() => {
    const m = new Map();
    (Array.isArray(db.patients) ? db.patients : []).forEach((p) => {
      if (p?.id) m.set(p.id, p.full_name || p.id);
    });
    return m;
  }, [db.patients, refreshKey]);

  const rules = useMemo(() => listCommissionRules({}), [refreshKey]);
  const commissions = useMemo(() => {
    const rows = listCommissions(filters);
    return rows.map((c) => ({
      ...c,
      _professional_name: professionalMap.get(c.professional_id) || c.professional_id || 'Sem profissional',
      _patient_name: c.metadata?.patient_id
        ? (patientMap.get(c.metadata.patient_id) || 'Paciente')
        : '—',
    }));
  }, [filters, professionalMap, patientMap, refreshKey]);
  const dashboard = useMemo(() => getCommissionsDashboard(filters), [filters, refreshKey]);

  const specialtyOptions = useMemo(() => {
    const set = new Set();
    collaborators.forEach((c) => {
      if (Array.isArray(c.especialidades)) c.especialidades.forEach((e) => e && set.add(String(e)));
      if (c.cargo) set.add(String(c.cargo));
    });
    procedures.forEach((p) => p.specialty && set.add(String(p.specialty)));
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [collaborators, procedures]);

  const pushToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const refresh = () => setRefreshKey((k) => k + 1);

  const runCalculation = () => {
    setBusy(true);
    try {
      const result = calculateCommissionForPeriod(
        {
          startDate: filters.startDate,
          endDate: filters.endDate,
          commission_basis: filters.commission_basis,
        },
        { persist: true, actor: user }
      );
      pushToast(
        `Cálculo concluído. ${result.calculated_count} comissão(ões), ${result.created_count} nova(s), ${result.updated_count} atualizada(s).`
      );
      refresh();
    } catch (e) {
      pushToast(e?.message || 'Erro ao calcular comissões.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveRule = () => {
    setBusy(true);
    try {
      const selectedCollaboratorName = ruleForm.professional_id
        ? (professionalMap.get(ruleForm.professional_id) || 'Colaborador')
        : 'Todos';
      const nameParts = [
        RULE_LABELS[ruleForm.type] || ruleForm.type,
        ROLE_LABELS[ruleForm.role] || ruleForm.role,
        selectedCollaboratorName,
      ];
      const payload = {
        ...ruleForm,
        name: nameParts.filter(Boolean).join(' • '),
        percentage: Number(ruleForm.percentage || 0),
        fixed_amount: Number(ruleForm.fixed_amount || 0),
        priority: Number(ruleForm.priority || 100),
        lead_source: ruleForm.lead_source || null,
      };
      if (editingRuleId) {
        updateCommissionRule(user, editingRuleId, payload);
        pushToast('Regra atualizada.');
      } else {
        createCommissionRule(user, payload);
        pushToast('Regra criada.');
      }
      setEditingRuleId(null);
      setRuleForm(initialRuleForm);
      refresh();
    } catch (e) {
      pushToast(e?.message || 'Erro ao salvar regra.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const editRule = (rule) => {
    setEditingRuleId(rule.id);
    const normalizedType =
      rule.type === 'patient_conversion' ? COMMISSION_RULE_TYPE.PATIENT_CLOSING : rule.type;
    setRuleForm({
      type: normalizedType || COMMISSION_RULE_TYPE.PRODUCTION,
      percentage: rule.percentage ?? '',
      fixed_amount: rule.fixed_amount ?? '',
      apply_on: rule.apply_on || COMMISSION_APPLY_ON.TOTAL_VALUE,
      professional_id: rule.professional_id || '',
      role: rule.role || COMMISSION_ROLE.DENTISTA,
      specialty: rule.specialty || '',
      procedure_id: rule.procedure_id || '',
      lead_source: rule.lead_source || '',
      active: rule.active !== false,
      priority: Number(rule.priority || 100),
    });
    setActiveTab('rules');
  };

  const toggleRule = (rule) => {
    try {
      setCommissionRuleActive(user, rule.id, !(rule.active !== false));
      pushToast(rule.active !== false ? 'Regra desativada.' : 'Regra ativada.');
      refresh();
    } catch (e) {
      pushToast(e?.message || 'Erro ao alterar regra.', 'error');
    }
  };

  const changePriority = (ruleId, direction) => {
    const ordered = [...rules].sort((a, b) => Number(a.priority || 100) - Number(b.priority || 100)).map((r) => r.id);
    const idx = ordered.findIndex((id) => id === ruleId);
    if (idx < 0) return;
    const nextIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (nextIdx < 0 || nextIdx >= ordered.length) return;
    const tmp = ordered[idx];
    ordered[idx] = ordered[nextIdx];
    ordered[nextIdx] = tmp;
    try {
      reorderCommissionRulePriorities(user, ordered);
      refresh();
    } catch (e) {
      pushToast(e?.message || 'Erro ao reordenar prioridade.', 'error');
    }
  };

  const updateStatus = (commissionId, status) => {
    try {
      setCommissionStatus(user, commissionId, status, status === COMMISSION_STATUS.PAID ? today() : null);
      pushToast('Status atualizado.');
      refresh();
    } catch (e) {
      pushToast(e?.message || 'Erro ao atualizar status.', 'error');
    }
  };

  const handleDeleteRule = (rule) => {
    if (!window.confirm(`Excluir a regra "${rule.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      deleteCommissionRule(user, rule.id);
      pushToast('Regra excluída.');
      if (editingRuleId === rule.id) {
        setEditingRuleId(null);
        setRuleForm(initialRuleForm);
      }
      refresh();
    } catch (e) {
      pushToast(e?.message || 'Erro ao excluir regra.', 'error');
    }
  };

  return (
    <div className="finance-financing-page finance-comissoes-page">
      {toast && <div className={`toast finance-toast ${toast.type || 'success'}`}>{toast.message}</div>}

      <div className="finance-financing-header">
        <div>
          <h1>Comissões</h1>
          <p className="muted">Produção, recebimento, comparecimento na agenda e fechamento de vendas — rastreável e auditável.</p>
        </div>
        <div className="finance-financing-actions-inline">
          <button type="button" className="button secondary" onClick={() => exportCommissionsCsv(commissions)}>
            Exportar CSV
          </button>
          <button type="button" className="button primary" onClick={runCalculation} disabled={busy}>
            {busy ? 'Calculando…' : 'Calcular comissões'}
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

      <div className="finance-receivables-filters">
        <label>
          Período início
          <input type="date" value={filters.startDate} onChange={(e) => setFilters((p) => ({ ...p, startDate: e.target.value }))} />
        </label>
        <label>
          Período fim
          <input type="date" value={filters.endDate} onChange={(e) => setFilters((p) => ({ ...p, endDate: e.target.value }))} />
        </label>
        <label>
          Profissional
          <select value={filters.professional_id} onChange={(e) => setFilters((p) => ({ ...p, professional_id: e.target.value }))}>
            <option value="">Todos</option>
            {selectableCollaborators.map((c) => <option key={c.id} value={c.id}>{c.apelido || c.nomeCompleto || c.id}</option>)}
          </select>
        </label>
        <label>
          Status
          <select value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
            <option value="">Todos</option>
            {Object.values(COMMISSION_STATUS).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label>
          Base de cálculo
          <select value={filters.commission_basis} onChange={(e) => setFilters((p) => ({ ...p, commission_basis: e.target.value }))}>
            <option value="all">Todas as bases</option>
            <option value="production">Produção</option>
            <option value="received">Recebimento</option>
            <option value={COMMISSION_BASIS.PATIENT_CHECKIN}>Comparecimento (agenda)</option>
            <option value={COMMISSION_BASIS.PATIENT_CLOSING}>Fechamento (venda)</option>
          </select>
        </label>
      </div>

      {activeTab === 'dashboard' && (
        <>
          <div className="finance-receivables-kpis finance-financing-kpis">
            <div className="finance-receivables-kpi-card">
              <span className="finance-receivables-kpi-label">Total comissões</span>
              <strong>{formatCurrencyBRL(dashboard.total)}</strong>
            </div>
            <div className="finance-receivables-kpi-card">
              <span className="finance-receivables-kpi-label">Pendentes / disponíveis</span>
              <strong>{formatCurrencyBRL(dashboard.pending)}</strong>
            </div>
            <div className="finance-receivables-kpi-card finance-receivables-kpi-card--received">
              <span className="finance-receivables-kpi-label">Pagas</span>
              <strong>{formatCurrencyBRL(dashboard.paid)}</strong>
            </div>
            <div className="finance-receivables-kpi-card">
              <span className="finance-receivables-kpi-label">Lançamentos</span>
              <strong>{dashboard.count}</strong>
            </div>
            <div className="finance-receivables-kpi-card">
              <span className="finance-receivables-kpi-label">Comparecimento (R$)</span>
              <strong>{formatCurrencyBRL(dashboard.totalCheckin || 0)}</strong>
            </div>
            <div className="finance-receivables-kpi-card">
              <span className="finance-receivables-kpi-label">Fechamento (R$)</span>
              <strong>{formatCurrencyBRL(dashboard.totalConversion || 0)}</strong>
            </div>
            <div className="finance-receivables-kpi-card">
              <span className="finance-receivables-kpi-label">Taxa conversão (pacientes ún.)</span>
              <strong>
                {dashboard.conversionRatePercent != null
                  ? `${dashboard.conversionRatePercent}%`
                  : '—'}
              </strong>
              <span className="muted finance-receivables-kpi-sublabel" style={{ fontSize: '0.75rem', display: 'block' }}>
                {dashboard.uniqueCheckins ?? 0} compareceram · {dashboard.uniqueConversions ?? 0} fecharam
              </span>
            </div>
          </div>

          <div className="finance-comissoes-charts-grid">
            <div className="card">
              <h3>Comissão por tipo</h3>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={dashboard.byType} dataKey="value" nameKey="type" outerRadius={88} label>
                      {dashboard.byType.map((_, i) => <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrencyBRL(Number(v || 0))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card">
              <h3>Ranking por profissional</h3>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={dashboard.rankingByProfessional} layout="vertical" margin={{ left: 8, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" width={130} dataKey="professional" />
                    <Tooltip formatter={(v) => formatCurrencyBRL(Number(v || 0))} />
                    <Bar dataKey="value" fill="#6A00FF" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card">
              <h3>Ranking — comparecimento</h3>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={dashboard.rankingByCheckin || []} layout="vertical" margin={{ left: 8, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" width={130} dataKey="professional" />
                    <Tooltip formatter={(v) => formatCurrencyBRL(Number(v || 0))} />
                    <Bar dataKey="value" fill="#0EA5E9" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card">
              <h3>Ranking — fechamento</h3>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={dashboard.rankingByClosing || []} layout="vertical" margin={{ left: 8, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" width={130} dataKey="professional" />
                    <Tooltip formatter={(v) => formatCurrencyBRL(Number(v || 0))} />
                    <Bar dataKey="value" fill="#10B981" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'rules' && (
        <div className="finance-comissoes-rules-grid">
          <div className="card">
            <h3>{editingRuleId ? 'Editar regra' : 'Nova regra'}</h3>
            <div className="finance-comissoes-rule-form">
              <label>Colaborador / Profissional
                <select value={ruleForm.professional_id} onChange={(e) => setRuleForm((p) => ({ ...p, professional_id: e.target.value }))}>
                  <option value="">Todos</option>
                  {selectableCollaborators.map((c) => <option key={c.id} value={c.id}>{c.apelido || c.nomeCompleto || c.id}</option>)}
                </select>
              </label>
              <label>Tipo
                <select value={ruleForm.type} onChange={(e) => setRuleForm((p) => ({ ...p, type: e.target.value }))}>
                  {Object.values(COMMISSION_RULE_TYPE).map((t) => <option key={t} value={t}>{RULE_LABELS[t]}</option>)}
                </select>
              </label>
              <label>%<input type="number" min="0" step="0.01" value={ruleForm.percentage} onChange={(e) => setRuleForm((p) => ({ ...p, percentage: e.target.value }))} /></label>
              <label>Valor fixo<input type="number" min="0" step="0.01" value={ruleForm.fixed_amount} onChange={(e) => setRuleForm((p) => ({ ...p, fixed_amount: e.target.value }))} /></label>
              <label>Aplicar sobre
                <select value={ruleForm.apply_on} onChange={(e) => setRuleForm((p) => ({ ...p, apply_on: e.target.value }))}>
                  <option value={COMMISSION_APPLY_ON.TOTAL_VALUE}>Valor total</option>
                  <option value={COMMISSION_APPLY_ON.NET_VALUE}>Valor líquido</option>
                </select>
              </label>
              <label>Perfil (role)
                <select value={ruleForm.role} onChange={(e) => setRuleForm((p) => ({ ...p, role: e.target.value }))}>
                  {Object.values(COMMISSION_ROLE).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </label>
              <label>Origem do lead (opcional)
                <select value={ruleForm.lead_source} onChange={(e) => setRuleForm((p) => ({ ...p, lead_source: e.target.value }))}>
                  <option value="">Todas as origens</option>
                  {Object.values(LEAD_SOURCE).map((s) => (
                    <option key={s} value={s}>{LEAD_SOURCE_LABELS[s] || s}</option>
                  ))}
                </select>
              </label>
              <label>Especialidade
                <select value={ruleForm.specialty} onChange={(e) => setRuleForm((p) => ({ ...p, specialty: e.target.value }))}>
                  <option value="">Todas</option>
                  {specialtyOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label>Procedimento
                <select value={ruleForm.procedure_id} onChange={(e) => setRuleForm((p) => ({ ...p, procedure_id: e.target.value }))}>
                  <option value="">Todos</option>
                  {procedures.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </label>
              <label>Prioridade<input type="number" min="1" value={ruleForm.priority} onChange={(e) => setRuleForm((p) => ({ ...p, priority: e.target.value }))} /></label>
              <label className="inline">
                <input type="checkbox" checked={ruleForm.active} onChange={(e) => setRuleForm((p) => ({ ...p, active: e.target.checked }))} />
                Regra ativa
              </label>
            </div>
            <div className="finance-financing-actions-inline">
              <button type="button" className="button primary" onClick={handleSaveRule} disabled={busy}>
                {editingRuleId ? 'Salvar alteração' : 'Criar regra'}
              </button>
              {editingRuleId && (
                <button type="button" className="button secondary" onClick={() => { setEditingRuleId(null); setRuleForm(initialRuleForm); }}>
                  Cancelar edição
                </button>
              )}
            </div>
          </div>

          <div className="card">
            <h3>Regras cadastradas</h3>
            <div className="commission-rules-cards-grid">
              {rules.length === 0 ? (
                <div className="commission-rule-empty muted">Nenhuma regra cadastrada.</div>
              ) : rules.map((r) => {
                const rawCollaborator = r.professional_id ? professionalMap.get(r.professional_id) : '';
                const collaboratorLabel =
                  rawCollaborator && !looksLikeUuid(String(rawCollaborator).trim())
                    ? String(rawCollaborator).trim()
                    : '';
                const scopeBody = formatScopeBody(r, collaboratorLabel);
                const applyOnLabel =
                  r.type === COMMISSION_RULE_TYPE.PATIENT_CHECKIN
                    ? '—'
                    : r.type === COMMISSION_RULE_TYPE.PATIENT_CLOSING && Number(r.percentage || 0) <= 0
                      ? 'Valor fixo por fechamento'
                      : r.apply_on === COMMISSION_APPLY_ON.NET_VALUE
                        ? 'Valor líquido'
                        : 'Valor total';
                const cardSubtitle = formatRuleCardSubtitle(r, collaboratorLabel);
                const specialtyLabel = formatSpecialtyLabel(r.specialty);
                const procedureLabel = formatProcedureLabel(r.procedure_id, procedureMap);
                const modelTitle = formatCommissionModelLine(r);
                return (
                  <article className="commission-rule-card" key={r.id}>
                    <header className="commission-rule-card__header">
                      <div className="commission-rule-card__heading">
                        <h4 className="commission-rule-card__title">{modelTitle}</h4>
                        <p className="commission-rule-card__subtitle">{cardSubtitle}</p>
                      </div>
                      <span className={`commission-rule-card__status finance-receivables-status ${r.active !== false ? 'finance-receivables-status--paid' : 'finance-receivables-status--canceled'}`}>
                        {r.active !== false ? 'Ativa' : 'Inativa'}
                      </span>
                    </header>
                    <div className="commission-rule-card__body">
                      <div className="commission-rule-row">
                        <span className="commission-rule-label">Modelo</span>
                        <span className="commission-rule-value commission-rule-value--strong">{formatCommissionModelLine(r)}</span>
                      </div>
                      <div className="commission-rule-row">
                        <span className="commission-rule-label">Escopo</span>
                        <span className="commission-rule-value">{scopeBody}</span>
                      </div>
                      <div className="commission-rule-row">
                        <span className="commission-rule-label">Aplicação</span>
                        <span className="commission-rule-value">{applyOnLabel}</span>
                      </div>
                      <div className="commission-rule-row">
                        <span className="commission-rule-label">Especialidade</span>
                        <span className="commission-rule-value">{specialtyLabel}</span>
                      </div>
                      <div className="commission-rule-row">
                        <span className="commission-rule-label">Procedimento</span>
                        <span className="commission-rule-value">{procedureLabel}</span>
                      </div>
                      <div className="commission-rule-row">
                        <span className="commission-rule-label">Origem do lead</span>
                        <span className="commission-rule-value">
                          {r.lead_source ? (LEAD_SOURCE_LABELS[r.lead_source] || r.lead_source) : 'Todas'}
                        </span>
                      </div>
                      <div className="commission-rule-row">
                        <span className="commission-rule-label">Prioridade</span>
                        <span className="commission-rule-value commission-rule-value--strong">#{r.priority ?? '—'}</span>
                      </div>
                    </div>
                    <footer className="commission-rule-card__footer">
                      <div className="commission-rule-badges">
                        <span className="commission-mini-badge">{MODEL_TYPE_SHORT[r.type] || r.type}</span>
                        <span className="commission-mini-badge">{r.professional_id ? 'Por profissional' : 'Geral'}</span>
                        {r.specialty ? <span className="commission-mini-badge">Especialidade filtrada</span> : null}
                        {r.procedure_id ? <span className="commission-mini-badge">Procedimento filtrado</span> : null}
                        {r.lead_source ? <span className="commission-mini-badge">Origem: {LEAD_SOURCE_LABELS[r.lead_source] || r.lead_source}</span> : null}
                      </div>
                      <div className="commission-rule-actions" role="group" aria-label="Ações da regra">
                        <button type="button" className="button icon commission-rule-action-btn" title="Subir prioridade" onClick={() => changePriority(r.id, 'up')}>
                          <ChevronUp size={18} strokeWidth={2} />
                        </button>
                        <button type="button" className="button icon commission-rule-action-btn" title="Descer prioridade" onClick={() => changePriority(r.id, 'down')}>
                          <ChevronDown size={18} strokeWidth={2} />
                        </button>
                        <button type="button" className="button icon commission-rule-action-btn" title="Editar regra" onClick={() => editRule(r)}>
                          <Pencil size={17} strokeWidth={2} />
                        </button>
                        <button type="button" className="button icon commission-rule-action-btn" title={r.active !== false ? 'Desativar regra' : 'Ativar regra'} onClick={() => toggleRule(r)}>
                          {r.active !== false ? <Pause size={17} strokeWidth={2} /> : <Play size={17} strokeWidth={2} />}
                        </button>
                        <button type="button" className="button icon danger commission-rule-action-btn" title="Excluir regra" onClick={() => handleDeleteRule(r)}>
                          <Trash2 size={17} strokeWidth={2} />
                        </button>
                      </div>
                    </footer>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'calculated' && (
        <div className="card">
          <h3>Comissões calculadas</h3>
          <div className="finance-receivables-table-wrap">
            <table className="finance-receivables-table">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Profissional</th>
                  <th>Tipo</th>
                  <th>Base</th>
                  <th>Comissão</th>
                  <th>Origem</th>
                  <th>Data</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {commissions.length === 0 ? (
                  <tr><td colSpan={9} className="muted">Nenhuma comissão no período.</td></tr>
                ) : commissions.map((c) => (
                  <tr key={c.id}>
                    <td>{c._patient_name}</td>
                    <td>{c._professional_name}</td>
                    <td>{commissionRowBasisLabel(c)}</td>
                    <td>{formatCurrencyBRL(c.amount_base)}</td>
                    <td><strong>{formatCurrencyBRL(c.commission_amount)}</strong></td>
                    <td>
                      <span title={`${c.source_type} · ${c.source_id}`}>
                        {commissionOriginLabel(c)}
                      </span>
                    </td>
                    <td>{c.reference_date}</td>
                    <td>
                      <span className={`finance-receivables-status ${
                        c.status === COMMISSION_STATUS.PAID
                          ? 'finance-receivables-status--paid'
                          : c.status === COMMISSION_STATUS.AVAILABLE
                            ? 'finance-receivables-status--partially_paid'
                            : c.status === COMMISSION_STATUS.REVERSED
                              ? 'finance-receivables-status--canceled'
                              : 'finance-receivables-status--pending'
                      }`}
                      >
                        {STATUS_LABELS[c.status] || c.status}
                      </span>
                    </td>
                    <td className="finance-receivables-actions">
                      {c.status !== COMMISSION_STATUS.REVERSED && c.status !== COMMISSION_STATUS.AVAILABLE && (
                        <button type="button" className="button icon" onClick={() => updateStatus(c.id, COMMISSION_STATUS.AVAILABLE)} title="Marcar disponível">✓</button>
                      )}
                      {c.status !== COMMISSION_STATUS.REVERSED && c.status !== COMMISSION_STATUS.PAID && (
                        <button type="button" className="button icon" onClick={() => updateStatus(c.id, COMMISSION_STATUS.PAID)} title="Marcar pago">$</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="finance-comissoes-reports-grid">
          <div className="card">
            <h3>Comissão por profissional</h3>
            <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
              {dashboard.rankingByProfessional.map((r) => (
                <li key={r.professional} className="flex" style={{ justifyContent: 'space-between' }}>
                  <span>{r.professional}</span>
                  <strong>{formatCurrencyBRL(r.value)}</strong>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3>Comissão por especialidade</h3>
            <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
              {dashboard.bySpecialty.map((r) => (
                <li key={r.specialty} className="flex" style={{ justifyContent: 'space-between' }}>
                  <span>{r.specialty}</span>
                  <strong>{formatCurrencyBRL(r.value)}</strong>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3>Exportação</h3>
            <p className="muted">Exporte o resultado filtrado para análise externa (Excel/CSV).</p>
            <button type="button" className="button primary" onClick={() => exportCommissionsCsv(commissions, 'relatorio-comissoes')}>
              Exportar comissões do período
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
