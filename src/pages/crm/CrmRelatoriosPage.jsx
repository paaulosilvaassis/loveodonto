import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Clock,
  DollarSign,
  Filter,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import Button from '../../components/Button.jsx';
import { CrmFunnelTable } from '../../crm/ui/CrmFunnelTable.jsx';
import { CrmDashboardExportBar } from '../../crm/ui/CrmDashboardExport.jsx';
import {
  getCrmExecutiveDashboard,
  getCrmCommercialGoals,
  saveCrmCommercialGoals,
} from '../../services/crmReportsService.js';
import { LEAD_SOURCE_LABELS, LEAD_INTEREST_LABELS } from '../../services/crmService.js';
import { listUsers } from '../../services/teamService.js';
import { getProfessionalOptions } from '../../services/collaboratorService.js';
import { listPipelineStagesForTenant } from '../../services/crmPipelineStageService.js';
import { useAuth } from '../../auth/useAuth.js';
import { formatCurrencyBRL } from '../../utils/currency.js';
import { formatDurationHours } from '../../utils/formatDuration.js';

const RANGE_OPTIONS = [
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'current_month', label: 'Mês atual' },
  { value: 'custom', label: 'Personalizado' },
];
const RANGE_CUSTOM = 'custom';

const LOSS_COLORS = ['#EF4444', '#F97316', '#EAB308', '#84CC16', '#6366F1', '#94A3B8'];
const MEDALS = ['🥇', '🥈', '🥉'];

/** Variantes de cor da borda superior — todas devem ter classe CSS correspondente. */
const KPI_VARIANT = {
  PRIMARY: 'primary',
  INFO: 'info',
  TEAL: 'teal',
  SUCCESS: 'success',
  ACCENT: 'accent',
  REVENUE: 'revenue',
  ORANGE: 'orange',
  DANGER: 'danger',
};

const RESUMO_KPI_CONFIG = [
  { key: 'leads', label: 'Leads recebidos', variant: KPI_VARIANT.PRIMARY, format: 'number' },
  { key: 'avaliacoes', label: 'Avaliações agendadas', variant: KPI_VARIANT.INFO, format: 'number' },
  { key: 'comparecimentos', label: 'Comparecimentos', variant: KPI_VARIANT.TEAL, format: 'number' },
  { key: 'fechamentos', label: 'Fechamentos', variant: KPI_VARIANT.SUCCESS, format: 'number' },
  { key: 'conversao', label: 'Conversão', variant: KPI_VARIANT.ACCENT, format: 'percent' },
  { key: 'receita', label: 'Receita gerada', variant: KPI_VARIANT.REVENUE, format: 'currency' },
];

const MONEY_KPI_CONFIG = [
  { key: 'oportunidadesAbertas', label: 'Oportunidades abertas', variant: KPI_VARIANT.PRIMARY, format: 'currency' },
  { key: 'orcamentosEnviados', label: 'Orçamentos enviados', variant: KPI_VARIANT.ORANGE, format: 'currency' },
  { key: 'valorNegociacao', label: 'Valor em negociação', variant: KPI_VARIANT.ACCENT, format: 'currency' },
  { key: 'valorFechado', label: 'Valor fechado', variant: KPI_VARIANT.SUCCESS, format: 'currency' },
  { key: 'valorPerdido', label: 'Valor perdido', variant: KPI_VARIANT.DANGER, format: 'currency' },
];

function formatNumber(n) {
  return typeof n === 'number' && !Number.isNaN(n) ? new Intl.NumberFormat('pt-BR').format(n) : '—';
}

function formatPercent(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(n)}%`;
}

function getAssignableOptions() {
  const users = listUsers().filter((u) => u.active !== false);
  const pros = getProfessionalOptions();
  const seen = new Set();
  const options = [{ id: '', name: 'Todos' }];
  users.forEach((u) => {
    if (!seen.has(u.id)) { seen.add(u.id); options.push({ id: u.id, name: u.name || 'Usuário' }); }
  });
  pros.forEach((p) => {
    if (!seen.has(p.id)) { seen.add(p.id); options.push({ id: p.id, name: p.name || 'Profissional' }); }
  });
  return options;
}

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="crm-mgr-section-head">
      <h2 className="crm-dash-section-title">
        {Icon && <Icon size={18} />}
        {title}
      </h2>
      {subtitle && <p className="crm-mgr-section-sub">{subtitle}</p>}
    </div>
  );
}

function formatKpiValue(value, format) {
  if (format === 'currency') return formatCurrencyBRL(value ?? 0);
  if (format === 'percent') return formatPercent(value);
  return formatNumber(value);
}

function CrmKpiCard({ label, value, variant }) {
  return (
    <div className={`crm-mgr-kpi-card crm-mgr-kpi-card--${variant}`}>
      <span className="crm-mgr-kpi-label">{label}</span>
      <strong className="crm-mgr-kpi-value">{value}</strong>
    </div>
  );
}

function GoalProgress({ label, current, goal, percent, format = 'number' }) {
  const currentLabel = format === 'currency'
    ? formatCurrencyBRL(current)
    : format === 'percent'
      ? formatPercent(current)
      : formatNumber(current);
  const goalLabel = format === 'currency'
    ? formatCurrencyBRL(goal)
    : format === 'percent'
      ? formatPercent(goal)
      : formatNumber(goal);

  return (
    <div className="crm-mgr-goal-block">
      <div className="crm-mgr-goal-head">
        <span>{label}</span>
        <strong>{currentLabel} de {goalLabel}</strong>
      </div>
      <div className="crm-mgr-progress">
        <div className="crm-mgr-progress-fill" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <span className="crm-mgr-progress-pct">{percent}%</span>
    </div>
  );
}

export default function CrmRelatoriosPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantId = user?.tenantId || user?.tenant_id || '';

  const [range, setRange] = useState('current_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [channel, setChannel] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [interest, setInterest] = useState('');
  const [stageKey, setStageKey] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [filterError, setFilterError] = useState('');
  const [goalsEdit, setGoalsEdit] = useState(null);
  const [goalsVersion, setGoalsVersion] = useState(0);

  const [applied, setApplied] = useState({
    range: 'current_month', customStart: '', customEnd: '', channel: '', ownerId: '', interest: '', stageKey: '',
  });

  const assignableOptions = useMemo(() => getAssignableOptions(), []);
  const stageOptions = useMemo(
    () => listPipelineStagesForTenant(tenantId, { includeInactive: false }),
    [tenantId]
  );

  const applyFilters = useCallback(() => {
    if (range === RANGE_CUSTOM) {
      if (!customStart || !customEnd) {
        setFilterError('Selecione Data Inicial e Data Final.');
        return;
      }
      if (new Date(customEnd) < new Date(customStart)) {
        setFilterError('Data Final não pode ser menor que a Data Inicial.');
        return;
      }
    }
    setFilterError('');
    setApplied({ range, customStart, customEnd, channel, ownerId, interest, stageKey });
  }, [range, customStart, customEnd, channel, ownerId, interest, stageKey]);

  const opts = useMemo(
    () => ({
      tenantId,
      range: applied.range,
      customStart: applied.range === RANGE_CUSTOM ? applied.customStart : undefined,
      customEnd: applied.range === RANGE_CUSTOM ? applied.customEnd : undefined,
      channel: applied.channel || undefined,
      ownerId: applied.ownerId || undefined,
      interest: applied.interest || undefined,
      stageKey: applied.stageKey || undefined,
    }),
    [tenantId, applied, goalsVersion]
  );

  const dashboard = useMemo(() => getCrmExecutiveDashboard(opts), [opts]);
  const { resumoComercial } = dashboard;

  const handleStageClick = useCallback((key) => {
    navigate('/crm/leads', { state: { filterStageKey: key } });
  }, [navigate]);

  const handleAlertClick = useCallback((alert) => {
    navigate(alert.route, { state: alert.state });
  }, [navigate]);

  const startGoalsEdit = () => {
    const g = getCrmCommercialGoals(tenantId);
    setGoalsEdit({
      leadsGoal: g.leadsGoal,
      revenueGoal: g.revenueGoal,
      closingsGoal: g.closingsGoal,
      conversionGoal: g.conversionGoal,
    });
  };

  const saveGoals = () => {
    if (!goalsEdit) return;
    saveCrmCommercialGoals(user, goalsEdit);
    setGoalsEdit(null);
    setGoalsVersion((v) => v + 1);
  };

  const lossBarData = dashboard.lossReasons.map((r, i) => ({
    name: r.motivo,
    percent: r.percent,
    fill: LOSS_COLORS[i % LOSS_COLORS.length],
  }));

  return (
    <div className="crm-dash-page crm-mgr-page">
      <header className="crm-dash-header">
        <div className="crm-dash-header-text">
          <h1>Dashboard Gerencial Comercial</h1>
          <p>Visão rápida da saúde comercial — o que está acontecendo, onde agir e quanto dinheiro há no funil.</p>
        </div>
        <div className="crm-dash-header-actions">
          <Button type="button" variant="ghost" icon={Filter} onClick={() => setShowFilters((v) => !v)}>
            Filtros
          </Button>
          <CrmDashboardExportBar dashboard={dashboard} clinicName="Love Odonto" />
        </div>
      </header>

      {showFilters && (
        <div className="crm-dash-filters">
          <div className="crm-dash-filters-grid">
            <div className="form-field">
              <label htmlFor="dash-range">Período</label>
              <select id="dash-range" value={range} onChange={(e) => { setRange(e.target.value); setFilterError(''); }}>
                {RANGE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {range === RANGE_CUSTOM && (
              <>
                <div className="form-field">
                  <label htmlFor="dash-from">De</label>
                  <input id="dash-from" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                </div>
                <div className="form-field">
                  <label htmlFor="dash-to">Até</label>
                  <input id="dash-to" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                </div>
              </>
            )}
            <div className="form-field">
              <label htmlFor="dash-owner">Responsável</label>
              <select id="dash-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                {assignableOptions.map((o) => <option key={o.id || 'all'} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="dash-source">Origem</label>
              <select id="dash-source" value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="">Todas</option>
                {Object.entries(LEAD_SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="dash-interest">Tratamento</label>
              <select id="dash-interest" value={interest} onChange={(e) => setInterest(e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(LEAD_INTEREST_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="dash-stage">Estágio</label>
              <select id="dash-stage" value={stageKey} onChange={(e) => setStageKey(e.target.value)}>
                <option value="">Todos</option>
                {stageOptions.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>
          {filterError && <p className="crm-dash-filter-error" role="alert">{filterError}</p>}
          <div className="crm-dash-filters-actions">
            <Button type="button" variant="primary" onClick={applyFilters}>Aplicar filtros</Button>
          </div>
        </div>
      )}

      {/* SEÇÃO 1 — Resumo Comercial */}
      <section className="crm-dash-section">
        <SectionHeader icon={TrendingUp} title="Resumo Comercial" subtitle="Como estou?" />
        <div className="crm-mgr-kpi-grid crm-mgr-kpi-grid--6">
          {RESUMO_KPI_CONFIG.map((cfg) => (
            <CrmKpiCard
              key={cfg.key}
              label={cfg.label}
              value={formatKpiValue(resumoComercial[cfg.key], cfg.format)}
              variant={cfg.variant}
            />
          ))}
        </div>
      </section>

      {/* SEÇÃO 2 — Alertas e Prioridades */}
      <section className="crm-dash-section crm-dash-section--card crm-mgr-alerts-section">
        <SectionHeader icon={AlertTriangle} title="Precisam de atenção" subtitle="O que precisa ser feito hoje?" />
        {dashboard.alerts.length === 0 ? (
          <p className="crm-mgr-alerts-ok">✅ Nenhum alerta crítico no momento. Continue acompanhando o funil.</p>
        ) : (
          <ul className="crm-mgr-alerts-list">
            {dashboard.alerts.map((alert) => (
              <li key={alert.id} className="crm-mgr-alert-item">
                <div className="crm-mgr-alert-text">
                  <span className="crm-mgr-alert-icon" aria-hidden="true">⚠</span>
                  <span>
                    <strong>{alert.count}</strong>
                    {' '}
                    {alert.message.toLowerCase()}
                  </span>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={() => handleAlertClick(alert)}>
                  Ver lista
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* SEÇÃO 3 — Dinheiro no Funil */}
      <section className="crm-dash-section">
        <SectionHeader icon={DollarSign} title="Dinheiro no Funil" subtitle="Quanto dinheiro tenho?" />
        <div className="crm-mgr-kpi-grid crm-mgr-kpi-grid--5">
          {MONEY_KPI_CONFIG.map((cfg) => (
            <CrmKpiCard
              key={cfg.key}
              label={cfg.label}
              value={formatKpiValue(dashboard.financial[cfg.key], cfg.format)}
              variant={cfg.variant}
            />
          ))}
        </div>
      </section>

      {/* SEÇÃO 4 — Funil Comercial */}
      <section className="crm-dash-section crm-dash-section--card">
        <SectionHeader icon={BarChart3} title="Funil Comercial" subtitle="Onde estou perdendo?" />
        <CrmFunnelTable
          funnelSteps={dashboard.funnel.funnelSteps}
          gargalo={dashboard.funnel.gargalo}
          onStageClick={handleStageClick}
        />
      </section>

      {/* SEÇÃO 5 — Origem dos Pacientes */}
      <section className="crm-dash-section crm-dash-section--card">
        <SectionHeader title="Origem dos Pacientes" subtitle="De onde vem o melhor paciente?" />
        {dashboard.sources.length === 0 ? (
          <p className="crm-dash-empty">Sem leads por origem no período.</p>
        ) : (
          <div className="crm-dash-table-wrap">
            <table className="crm-dash-table">
              <thead>
                <tr>
                  <th>Origem</th>
                  <th>Leads</th>
                  <th>Fechamentos</th>
                  <th>Conversão</th>
                  <th>Receita</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.sources.map((s) => (
                  <tr key={s.source}>
                    <td className="crm-dash-table-name">{s.label}</td>
                    <td>{s.leads}</td>
                    <td>{s.fechamentos}</td>
                    <td>{s.conversao}%</td>
                    <td>{formatCurrencyBRL(s.receita)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* SEÇÃO 6 — Tratamentos Mais Vendidos */}
      <section className="crm-dash-section crm-dash-section--card">
        <SectionHeader title="Tratamentos Mais Vendidos" subtitle="O que vende mais?" />
        {dashboard.treatments.length === 0 ? (
          <p className="crm-dash-empty">Sem interesse registrado no período.</p>
        ) : (
          <div className="crm-dash-table-wrap">
            <table className="crm-dash-table">
              <thead>
                <tr>
                  <th>Tratamento</th>
                  <th>Interessados</th>
                  <th>Orçamentos</th>
                  <th>Fechamentos</th>
                  <th>Receita</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.treatments.map((t) => (
                  <tr key={t.key}>
                    <td className="crm-dash-table-name">{t.label}</td>
                    <td>{t.interessados}</td>
                    <td>{t.orcamentos}</td>
                    <td>{t.fechamentos}</td>
                    <td>{formatCurrencyBRL(t.receita)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* SEÇÃO 7 — Desempenho da Equipe */}
      <section className="crm-dash-section crm-dash-section--card">
        <SectionHeader icon={Users} title="Desempenho da Equipe" subtitle="Quem vende mais?" />
        {dashboard.owners.length === 0 ? (
          <p className="crm-dash-empty">Sem dados de performance no período.</p>
        ) : (
          <div className="crm-dash-table-wrap">
            <table className="crm-dash-table">
              <thead>
                <tr>
                  <th>Posição</th>
                  <th>Nome</th>
                  <th>Leads</th>
                  <th>Agendamentos</th>
                  <th>Comparecimentos</th>
                  <th>Fechamentos</th>
                  <th>Conversão</th>
                  <th>Receita</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.owners.map((row, i) => (
                  <tr key={row.ownerId}>
                    <td>
                      <span className="crm-mgr-medal">
                        {MEDALS[i] || <span className="crm-dash-rank">{i + 1}</span>}
                      </span>
                    </td>
                    <td className="crm-dash-table-name">{row.ownerName}</td>
                    <td>{row.leads}</td>
                    <td>{row.agendamentos}</td>
                    <td>{row.comparecimentos}</td>
                    <td>{row.fechamentos}</td>
                    <td><span className={`crm-dash-badge ${row.conversao >= 20 ? 'is-good' : ''}`}>{row.conversao}%</span></td>
                    <td>{formatCurrencyBRL(row.receita)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="crm-dash-two-col">
        {/* SEÇÃO 8 — Tempo de Resposta */}
        <section className="crm-dash-section crm-dash-section--card">
          <SectionHeader icon={Clock} title="Tempo de Resposta" subtitle="Estamos rápidos?" />
          <ul className="crm-mgr-time-list">
            <li>
              <span>Lead → Primeiro contato</span>
              <strong>{formatDurationHours(dashboard.conversionTimes.leadParaPrimeiroContato)}</strong>
            </li>
            <li>
              <span>Primeiro contato → Avaliação</span>
              <strong>{formatDurationHours(dashboard.conversionTimes.contatoParaAvaliacao)}</strong>
            </li>
            <li>
              <span>Avaliação → Orçamento</span>
              <strong>{formatDurationHours(dashboard.conversionTimes.avaliacaoParaOrcamento)}</strong>
            </li>
            <li>
              <span>Orçamento → Fechamento</span>
              <strong>{formatDurationHours(dashboard.conversionTimes.orcamentoParaFechamento)}</strong>
            </li>
          </ul>
        </section>

        {/* SEÇÃO 9 — Motivos de Perda */}
        <section className="crm-dash-section crm-dash-section--card">
          <SectionHeader title="Motivos de Perda" subtitle="Por que perdemos?" />
          {dashboard.lossReasons.length === 0 ? (
            <p className="crm-dash-empty">Nenhum lead perdido no período.</p>
          ) : (
            <>
              <div className="crm-dash-chart" style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={lossBarData} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => [`${v}%`, 'Participação']} />
                    <Bar dataKey="percent" radius={[0, 4, 4, 0]}>
                      {lossBarData.map((e) => <Cell key={e.name} fill={e.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="crm-mgr-loss-list">
                {dashboard.lossReasons.map((r) => (
                  <li key={r.motivo}>
                    <span>{r.motivo}</span>
                    <strong>{r.percent}%</strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* SEÇÃO 10 — Metas */}
      <section className="crm-dash-section crm-dash-section--card crm-mgr-goals-section">
        <SectionHeader icon={Target} title="Metas" subtitle="Estamos chegando lá?" />
        {goalsEdit ? (
          <div className="crm-dash-goals-edit crm-mgr-goals-edit">
            <div className="crm-mgr-goals-edit-grid">
              <div className="form-field">
                <label htmlFor="goal-leads">Meta de leads</label>
                <input id="goal-leads" type="number" min="0" value={goalsEdit.leadsGoal} onChange={(e) => setGoalsEdit((g) => ({ ...g, leadsGoal: Number(e.target.value) }))} />
              </div>
              <div className="form-field">
                <label htmlFor="goal-revenue">Meta financeira (R$)</label>
                <input id="goal-revenue" type="number" min="0" step="1000" value={goalsEdit.revenueGoal} onChange={(e) => setGoalsEdit((g) => ({ ...g, revenueGoal: Number(e.target.value) }))} />
              </div>
              <div className="form-field">
                <label htmlFor="goal-closings">Meta de fechamentos</label>
                <input id="goal-closings" type="number" min="0" value={goalsEdit.closingsGoal} onChange={(e) => setGoalsEdit((g) => ({ ...g, closingsGoal: Number(e.target.value) }))} />
              </div>
              <div className="form-field">
                <label htmlFor="goal-conversion">Meta de conversão (%)</label>
                <input id="goal-conversion" type="number" min="0" max="100" value={goalsEdit.conversionGoal} onChange={(e) => setGoalsEdit((g) => ({ ...g, conversionGoal: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="crm-dash-goals-edit-actions">
              <Button type="button" variant="primary" size="sm" onClick={saveGoals}>Salvar metas</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setGoalsEdit(null)}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <>
            <GoalProgress
              label="Meta de leads"
              current={dashboard.goals.leadsAtual}
              goal={dashboard.goals.leadsGoal}
              percent={dashboard.goals.leadsPercent}
            />
            <GoalProgress
              label="Meta financeira"
              current={dashboard.goals.receitaAtual}
              goal={dashboard.goals.revenueGoal}
              percent={dashboard.goals.receitaPercent}
              format="currency"
            />
            <GoalProgress
              label="Meta de fechamentos"
              current={dashboard.goals.fechamentosAtual}
              goal={dashboard.goals.closingsGoal}
              percent={dashboard.goals.closingsPercent}
            />
            <GoalProgress
              label="Meta de conversão"
              current={dashboard.goals.conversaoAtual}
              goal={dashboard.goals.conversionGoal}
              percent={dashboard.goals.conversionPercent}
              format="percent"
            />
            <Button type="button" variant="ghost" size="sm" onClick={startGoalsEdit}>Editar metas</Button>
          </>
        )}
      </section>
    </div>
  );
}
