import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CrmLayout } from '../../crm/ui/CrmLayout.jsx';
import { SectionCard } from '../../components/SectionCard.jsx';
import {
  getCrmKpis,
  getCrmFunnel,
  getCrmSpeedMetrics,
  getCrmFollowupMetrics,
  getCrmOwnerPerformance,
  getCrmLossMetrics,
} from '../../services/crmReportsService.js';
import { CrmFunnelChart } from '../../crm/ui/CrmFunnelChart.jsx';
import { listUsers } from '../../services/teamService.js';
import { getProfessionalOptions } from '../../services/collaboratorService.js';
import { LEAD_SOURCE_LABELS } from '../../services/crmService.js';
import { formatDurationHours } from '../../utils/formatDuration.js';

const formatNumber = (n) =>
  typeof n === 'number' && !Number.isNaN(n) ? new Intl.NumberFormat('pt-BR').format(n) : '—';
import { PieChart, Pie, Legend, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import {
  Users,
  UserCheck,
  Calendar,
  FileText,
  TrendingUp,
  Clock,
  AlertCircle,
  Target,
  Zap,
} from 'lucide-react';

const RANGE_OPTIONS = [
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'current_month', label: 'Mês atual' },
  { value: 'custom', label: 'Personalizado' },
];

function getAssignableOptions() {
  const users = listUsers().filter((u) => u.active !== false);
  const pros = getProfessionalOptions();
  const seen = new Set();
  const options = [{ id: '', name: 'Todos' }];
  users.forEach((u) => {
    if (!seen.has(u.id)) {
      seen.add(u.id);
      options.push({ id: u.id, name: u.name || 'Usuário' });
    }
  });
  pros.forEach((p) => {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      options.push({ id: p.id, name: p.name || 'Profissional' });
    }
  });
  return options;
}

const CHANNEL_OPTIONS = [
  { value: '', label: 'Todos os canais' },
  ...Object.entries(LEAD_SOURCE_LABELS).map(([k, v]) => ({ value: k, label: v })),
];

function KpiCard({ icon: Icon, value, label, sublabel, variant, onClick }) {
  const isClickable = typeof onClick === 'function';
  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      className={`crm-report-kpi-card crm-report-kpi-${variant || 'default'} ${isClickable ? 'crm-report-kpi-clickable' : ''}`}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={isClickable ? (e) => e.key === 'Enter' && onClick(e) : undefined}
    >
      <div className="crm-report-kpi-header">
        {Icon && <Icon size={20} className="crm-report-kpi-icon" aria-hidden />}
      </div>
      <div className="crm-report-kpi-value">{value}</div>
      <div className="crm-report-kpi-label">{label}</div>
      {sublabel && <div className="crm-report-kpi-sublabel">{sublabel}</div>}
    </div>
  );
}

export default function CrmRelatoriosPage() {
  const navigate = useNavigate();
  const [range, setRange] = useState('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [channel, setChannel] = useState('');
  const [ownerId, setOwnerId] = useState('');

  const opts = useMemo(
    () => ({
      range,
      customStart: range === 'custom' ? customStart : undefined,
      customEnd: range === 'custom' ? customEnd : undefined,
      channel: channel || undefined,
      ownerId: ownerId || undefined,
    }),
    [range, customStart, customEnd, channel, ownerId]
  );

  const kpis = useMemo(() => getCrmKpis(opts), [opts]);
  const funnel = useMemo(() => getCrmFunnel(opts), [opts]);
  const speed = useMemo(() => getCrmSpeedMetrics(opts), [opts]);
  const followup = useMemo(() => getCrmFollowupMetrics(opts), [opts]);
  const ownerPerf = useMemo(() => getCrmOwnerPerformance(opts), [opts]);
  const loss = useMemo(() => getCrmLossMetrics(opts), [opts]);

  const assignableOptions = useMemo(() => getAssignableOptions(), []);

  const lossPieData = useMemo(
    () =>
      loss.porMotivo?.map((m) => ({
        name: m.motivo,
        value: m.count,
      })) || [],
    [loss.porMotivo]
  );

  const handleStageClick = useCallback(
    (stageKey) => {
      navigate('/crm/leads', { state: { filterStageKey: stageKey } });
    },
    [navigate]
  );

  const handleLeadClick = useCallback(
    (id) => {
      navigate(`/crm/leads/${id}`);
    },
    [navigate]
  );

  return (
    <CrmLayout
      title="Relatórios & Métricas"
      description="Dashboard Comercial/CRM: KPIs, funil, conversões e performance."
    >
      <div className="crm-report-filters">
        <div className="crm-report-filter-group">
          <label>Período</label>
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            {RANGE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        {range === 'custom' && (
          <>
            <div className="crm-report-filter-group">
              <label>Início</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </div>
            <div className="crm-report-filter-group">
              <label>Fim</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
          </>
        )}
        <div className="crm-report-filter-group">
          <label>Canal</label>
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNEL_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="crm-report-filter-group">
          <label>Responsável</label>
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            {assignableOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="crm-report-section">
        <h3 className="crm-report-section-title">KPIs</h3>
        <div className="crm-report-kpis">
          <KpiCard
            icon={Users}
            value={formatNumber(kpis.leadsNoPeriodo)}
            label="Leads no período"
            onClick={() => navigate('/crm/leads')}
          />
          <KpiCard
            icon={Target}
            value={formatNumber(kpis.leadsAtivos)}
            label="Leads ativos"
            onClick={() => navigate('/crm/leads')}
          />
          <KpiCard
            icon={Calendar}
            value={formatNumber(kpis.avaliacoesAgendadas)}
            label="Avaliações agendadas"
            onClick={() => navigate('/crm/leads', { state: { filterStageKey: 'avaliacao_agendada' } })}
          />
          <KpiCard
            icon={UserCheck}
            value={formatNumber(kpis.avaliacoesRealizadas)}
            label="Avaliações realizadas"
            onClick={() => navigate('/crm/leads', { state: { filterStageKey: 'avaliacao_realizada' } })}
          />
          <KpiCard
            icon={FileText}
            value={formatNumber(kpis.orcamentosEnviados)}
            label="Orçamentos enviados"
            onClick={() => navigate('/crm/leads', { state: { filterStageKey: 'orcamento_apresentado' } })}
          />
          <KpiCard
            icon={TrendingUp}
            value={formatNumber(kpis.fechadosGanhos)}
            label="Fechados / Ganhos"
            variant="success"
            onClick={() => navigate('/crm/leads', { state: { filterStageKey: 'aprovado' } })}
          />
          <KpiCard
            icon={Zap}
            value={`${kpis.taxaConversaoGeral}%`}
            label="Taxa de conversão"
            variant="success"
          />
          <KpiCard
            icon={Clock}
            value={kpis.hasTempoMedioPrimeiroContatoData ? formatDurationHours(kpis.tempoMedioPrimeiroContato) : '—'}
            label="Tempo médio 1º contato"
            sublabel={kpis.hasTempoMedioPrimeiroContatoData ? undefined : 'Sem dados no período'}
          />
          <KpiCard
            icon={AlertCircle}
            value={formatNumber(kpis.followUpsAtrasados)}
            label="Follow-ups atrasados"
            variant="danger"
            onClick={() => navigate('/comercial/follow-up')}
          />
        </div>
      </section>

      <section className="crm-report-section">
        <h3 className="crm-report-section-title">Funil por estágio</h3>
        <SectionCard>
          <CrmFunnelChart
            funnelSteps={funnel.funnelSteps}
            maiorQuedaIndex={funnel.maiorQuedaIndex}
            maiorQuedaStage={funnel.maiorQuedaStage}
            onStageClick={handleStageClick}
          />
        </SectionCard>
      </section>

      <section className="crm-report-section">
        <h3 className="crm-report-section-title">Conversão entre etapas</h3>
        <SectionCard>
          {funnel.conversionMatrix?.length === 0 ? (
            <p className="muted" style={{ padding: '2rem', textAlign: 'center' }}>
              Dados insuficientes para calcular conversões.
            </p>
          ) : (
            <div className="table-wrapper crm-conversion-table-wrapper">
              <table className="crm-conversion-table">
                <thead>
                  <tr>
                    <th style={{ width: '20%' }}>De</th>
                    <th style={{ width: '20%' }}>Para</th>
                    <th style={{ width: '15%' }}>Origem</th>
                    <th style={{ width: '15%' }}>Destino</th>
                    <th style={{ width: '15%' }}>Taxa</th>
                  </tr>
                </thead>
                <tbody>
                  {funnel.conversionMatrix?.map((row, i) => {
                    const rate = row.rate;
                    const rateClass =
                      rate > 100
                        ? 'crm-conversion-rate-high'
                        : rate === 100
                          ? 'crm-conversion-rate-full'
                          : rate === 0
                            ? 'crm-conversion-rate-zero'
                            : '';
                    return (
                      <tr key={i}>
                        <td className="crm-conversion-col-de">{row.fromLabel}</td>
                        <td className="crm-conversion-col-para">{row.toLabel}</td>
                        <td>{row.fromCount}</td>
                        <td>{row.toCount}</td>
                        <td className={rateClass}>{rate}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </section>

      <section className="crm-report-section">
        <h3 className="crm-report-section-title">Velocidade do funil</h3>
        <SectionCard>
          <div className="crm-speed-kpi-card">
            <span className="crm-speed-kpi-label">Tempo médio até 1º contato</span>
            <span className="crm-speed-kpi-value">
              {speed.hasTempoMedioPrimeiroContatoData
                ? formatDurationHours(speed.tempoMedioPrimeiroContato)
                : '—'}
            </span>
            <span className="crm-speed-kpi-sub">
              {speed.hasTempoMedioPrimeiroContatoData ? 'no período selecionado' : 'Sem dados suficientes'}
            </span>
          </div>

          {(() => {
            const rows = speed.tempoMedioPorEtapa || [];
            const gargalo = rows.reduce(
              (acc, r, i) => (r.mediaHoras > (acc?.mediaHoras ?? 0) ? { ...r, index: i } : acc),
              null
            );
            return (
              <>
                {gargalo && gargalo.mediaHoras > 0 && (
                  <div className="crm-speed-gargalo-alert" role="status">
                    Maior tempo médio: <strong>{gargalo.label}</strong> ({formatDurationHours(gargalo.mediaHoras)})
                  </div>
                )}
                <div className="table-wrapper crm-speed-table-wrapper">
                  <table className="crm-speed-table">
                    <thead>
                      <tr>
                        <th style={{ width: '45%' }}>Etapa</th>
                        <th style={{ width: '30%' }}>Média</th>
                        <th style={{ width: '25%' }}>Leads</th>
                        <th style={{ width: '80px' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr
                          key={row.stageKey || i}
                          className={gargalo?.index === i && gargalo.mediaHoras > 0 ? 'crm-speed-row-gargalo' : ''}
                        >
                          <td className="crm-speed-col-etapa">{row.label}</td>
                          <td>{formatDurationHours(row.mediaHoras)}</td>
                          <td>{row.count}</td>
                          <td className="crm-speed-badge-cell">
                            {gargalo?.index === i && gargalo.mediaHoras > 0 ? (
                              <span className="crm-speed-badge-gargalo">Gargalo</span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
          <h4 style={{ marginBottom: '0.75rem', fontSize: '0.95rem' }}>Leads parados (sem atualização)</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <strong>3 dias:</strong> {speed.leadsParados?.[3]?.length || 0}
              {speed.leadsParados?.[3]?.length > 0 && (
                <ul style={{ marginTop: '0.25rem', paddingLeft: '1.25rem', fontSize: '0.875rem' }}>
                  {speed.leadsParados[3].slice(0, 5).map((l) => (
                    <li key={l.id}>
                      <button type="button" className="button-link" onClick={() => handleLeadClick(l.id)}>
                        {l.name || l.id}
                      </button>
                    </li>
                  ))}
                  {speed.leadsParados[3].length > 5 && <li>... e mais {speed.leadsParados[3].length - 5}</li>}
                </ul>
              )}
            </div>
            <div>
              <strong>7 dias:</strong> {speed.leadsParados?.[7]?.length || 0}
            </div>
            <div>
              <strong>14 dias:</strong> {speed.leadsParados?.[14]?.length || 0}
            </div>
          </div>
        </SectionCard>
      </section>

      <section className="crm-report-section">
        <h3 className="crm-report-section-title">Follow-up</h3>
        <SectionCard>
          <div className="crm-report-followup-cards">
            <div className="crm-report-followup-card atrasados">
              <span className="crm-report-followup-value">{followup.atrasados}</span>
              <span className="crm-report-followup-label">Atrasados</span>
            </div>
            <div className="crm-report-followup-card hoje">
              <span className="crm-report-followup-value">{followup.hoje}</span>
              <span className="crm-report-followup-label">Hoje</span>
            </div>
            <div className="crm-report-followup-card proximos">
              <span className="crm-report-followup-value">{followup.proximos7}</span>
              <span className="crm-report-followup-label">Próximos 7 dias</span>
            </div>
          </div>
          <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
            <strong>Leads sem follow-up:</strong> {followup.leadsSemFollowUp?.length || 0}
            {followup.leadsSemFollowUp?.length > 0 && (
              <span style={{ marginLeft: '0.5rem' }}>
                ({followup.leadsSemFollowUp.slice(0, 3).map((l) => l.name).join(', ')}
                {followup.leadsSemFollowUp.length > 3 && ` e mais ${followup.leadsSemFollowUp.length - 3}`})
              </span>
            )}
          </p>
        </SectionCard>
      </section>

      <section className="crm-report-section">
        <h3 className="crm-report-section-title">Performance por responsável</h3>
        <SectionCard>
          {ownerPerf.length === 0 ? (
            <div className="crm-owner-empty">
              <p className="crm-owner-empty-text">Sem dados de performance no período selecionado.</p>
            </div>
          ) : (
            <div className="table-wrapper crm-owner-table-wrapper">
              <table className="crm-owner-table">
                <thead>
                  <tr>
                    <th style={{ width: '30%' }}>Responsável</th>
                    <th style={{ width: '10%' }}>Leads</th>
                    <th style={{ width: '10%' }}>Ganhos</th>
                    <th style={{ width: '12%' }}>Taxa</th>
                    <th style={{ width: '18%' }}>Tempo 1º contato</th>
                    <th style={{ width: '20%' }}>Follow-ups atrasados</th>
                  </tr>
                </thead>
                <tbody>
                  {ownerPerf.map((row, i) => {
                    const taxa = row.taxaConversao;
                    const taxaBadgeClass =
                      taxa >= 70 ? 'crm-owner-taxa-positive' : taxa >= 40 ? 'crm-owner-taxa-neutral' : 'crm-owner-taxa-alert';
                    const followUpClass = row.followUpsAtrasados > 0 ? 'crm-owner-followup-alert' : 'crm-owner-followup-ok';
                    return (
                      <tr key={row.ownerId || i}>
                        <td className="crm-owner-col-name">
                          <span className="crm-owner-rank">#{i + 1}</span>
                          {row.ownerName}
                        </td>
                        <td>{row.leadsAtribuidos}</td>
                        <td>{row.ganhos}</td>
                        <td>
                          <span className={`crm-owner-taxa-badge ${taxaBadgeClass}`}>{taxa}%</span>
                        </td>
                        <td>
                          {row.hasTempoMedioData
                            ? formatDurationHours(row.tempoMedioPrimeiroContato)
                            : '—'}
                        </td>
                        <td>
                          <span className={`crm-owner-followup-badge ${followUpClass}`}>
                            {row.followUpsAtrasados}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </section>

      <section className="crm-report-section">
        <h3 className="crm-report-section-title">Perdas</h3>
        <SectionCard>
          {loss.totalPerdidos === 0 ? (
            <p className="muted" style={{ padding: '2rem', textAlign: 'center' }}>
              Nenhum lead perdido no período.
            </p>
          ) : (
            <>
              <p style={{ marginBottom: '1rem' }}>
                <strong>Total perdidos:</strong> {loss.totalPerdidos}
              </p>
              {lossPieData.length > 0 && (
                <div style={{ height: 260, marginBottom: '1rem' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={lossPieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={(e) => `${e.name}: ${e.value}`}
                      >
                        {lossPieData.map((_, i) => (
                          <Cell key={i} fill={['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'][i % 5]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </SectionCard>
      </section>
    </CrmLayout>
  );
}
