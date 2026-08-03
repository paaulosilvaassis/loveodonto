import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Clock,
  DollarSign,
  Filter,
  Minus,
  Phone,
  RefreshCw,
  Scissors,
  Stethoscope,
  UserCheck,
  Users,
  UserX,
  MessageCircle,
  Activity,
  TrendingUp,
} from 'lucide-react';
import Button from '../components/Button.jsx';
import { getOperationalDashboard } from '../services/gestaoAtendimentoService.js';
import { updateAppointmentStatus } from '../services/patientFlowService.js';
import { markNoShow } from '../services/journeyEntryService.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { buildWhatsAppLink } from '../services/crmService.js';
import { useAuth } from '../auth/useAuth.js';
import { formatCurrencyBRL } from '../utils/currency.js';

const TODAY = () => new Date().toISOString().slice(0, 10);
const REFRESH_MS = 30000;

const EXEC_KPI_CONFIG = [
  { key: 'pacientesAgendados', label: 'Pacientes agendados', icon: Users, tone: 'primary' },
  { key: 'confirmados', label: 'Confirmados', icon: UserCheck, tone: 'success' },
  { key: 'aguardandoConfirmacao', label: 'Aguardando confirmação', icon: Clock, tone: 'warning' },
  { key: 'faltas', label: 'Faltas', icon: UserX, tone: 'danger' },
  { key: 'primeirasConsultas', label: 'Primeiras consultas', icon: Stethoscope, tone: 'accent' },
  { key: 'retornos', label: 'Retornos', icon: RefreshCw, tone: 'neutral' },
  { key: 'cirurgias', label: 'Cirurgias', icon: Scissors, tone: 'purple' },
  { key: 'orcamentosPrevistos', label: 'Orçamentos previstos', icon: DollarSign, tone: 'revenue' },
];

function TrendBadge({ delta, direction }) {
  if (direction === 'flat' || delta === 0) {
    return <span className="op-trend op-trend--flat"><Minus size={12} /> 0%</span>;
  }
  const label = `${delta > 0 ? '+' : ''}${delta}%`;
  return direction === 'up' ? (
    <span className="op-trend op-trend--up"><ArrowUpRight size={12} /> {label}</span>
  ) : (
    <span className="op-trend op-trend--down"><ArrowDownRight size={12} /> {label}</span>
  );
}

function ExecutiveKpiCard({ kpi, config }) {
  const Icon = config.icon;
  return (
    <div className={`op-kpi op-kpi--${config.tone}`}>
      <div className="op-kpi-head">
        <span className="op-kpi-icon"><Icon size={18} /></span>
        <TrendBadge delta={kpi.delta} direction={kpi.direction} />
      </div>
      <strong className="op-kpi-value">{kpi.value}</strong>
      <span className="op-kpi-label">{config.label}</span>
    </div>
  );
}

function StatusBadge({ displayStatus }) {
  return (
    <span className={`op-status op-status--${displayStatus.tone}`}>
      {displayStatus.emoji} {displayStatus.label}
    </span>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="op-section-head">
      <h2 className="op-section-title">
        {Icon && <Icon size={18} />}
        {title}
      </h2>
      {subtitle && <p className="op-section-sub">{subtitle}</p>}
    </div>
  );
}

export default function GestaoAtendimentoPage() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [filters, setFilters] = useState({ professionalId: '', roomId: '', specialty: '', status: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const dashboard = useMemo(
    () => getOperationalDashboard(selectedDate, filters),
    [selectedDate, filters, refreshKey]
  );

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setLastUpdate(new Date());
  }, []);

  useEffect(() => {
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const handleConfirm = (appointmentId) => {
    try {
      updateAppointmentStatus(user, appointmentId, APPOINTMENT_STATUS.CONFIRMADO);
      showToast('Agendamento confirmado');
      refresh();
    } catch (e) {
      showToast(e?.message || 'Erro ao confirmar', 'error');
    }
  };

  const handleMarkNoShow = async (appointmentId) => {
    try {
      await markNoShow(user, appointmentId);
      showToast('Falta registrada');
      refresh();
    } catch (e) {
      showToast(e?.message || 'Erro ao marcar falta', 'error');
    }
  };

  const handleWhatsApp = (phone, name) => {
    if (!phone) {
      showToast('Telefone não cadastrado', 'error');
      return;
    }
    const link = buildWhatsAppLink(phone, `Olá ${name || ''}, confirmamos seu horário na clínica.`);
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  const handleCall = (phone) => {
    if (!phone) {
      showToast('Telefone não cadastrado', 'error');
      return;
    }
    window.open(`tel:+55${phone}`, '_self');
  };

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const clearFilters = () => setFilters({ professionalId: '', roomId: '', specialty: '', status: '' });
  const hasFilters = Object.values(filters).some(Boolean);

  const isToday = selectedDate === TODAY();

  return (
    <div className="op-central-page">
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}

      <header className="op-central-header">
        <div className="op-central-header-text">
          <span className="op-central-badge"><Activity size={14} /> Central Operacional</span>
          <h1>Gestão de Atendimento</h1>
          <p>Visão completa da operação do dia — agenda, fila, produção e alertas em tempo real.</p>
        </div>
        <div className="op-central-header-actions">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="op-date-picker"
            aria-label="Data"
          />
          <Button type="button" variant="ghost" icon={Filter} onClick={() => setShowFilters((v) => !v)}>
            Filtros{hasFilters ? ' •' : ''}
          </Button>
          <Button type="button" variant="ghost" icon={RefreshCw} onClick={refresh}>
            Atualizar
          </Button>
        </div>
      </header>

      <p className="op-last-update">
        Última atualização: {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        {isToday && ' · atualização automática a cada 30s'}
      </p>

      {showFilters && (
        <div className="op-filters">
          <div className="op-filters-grid">
            <div className="form-field">
              <label htmlFor="op-prof">Profissional</label>
              <select id="op-prof" value={filters.professionalId} onChange={(e) => setFilter('professionalId', e.target.value)}>
                <option value="">Todos</option>
                {dashboard.filterOptions.professionals.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="op-room">Sala</label>
              <select id="op-room" value={filters.roomId} onChange={(e) => setFilter('roomId', e.target.value)}>
                <option value="">Todas</option>
                {dashboard.filterOptions.rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="op-spec">Especialidade</label>
              <select id="op-spec" value={filters.specialty} onChange={(e) => setFilter('specialty', e.target.value)}>
                <option value="">Todas</option>
                {dashboard.filterOptions.specialties.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="op-status">Status</label>
              <select id="op-status" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
                <option value="">Todos</option>
                {dashboard.filterOptions.statuses.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          {hasFilters && (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>Limpar filtros</Button>
          )}
        </div>
      )}

      {/* SEÇÃO 10 — Alertas (destaque no topo quando existem) */}
      {dashboard.alerts.length > 0 && (
        <section className="op-alerts-banner">
          {dashboard.alerts.map((a) => (
            <div key={a.id} className={`op-alert-chip op-alert-chip--${a.type}`}>
              <AlertTriangle size={14} />
              <span>{a.message}</span>
            </div>
          ))}
        </section>
      )}

      {/* SEÇÃO 1 — Painel Executivo */}
      <section className="op-section">
        <SectionTitle icon={TrendingUp} title="Painel Executivo do Dia" subtitle="Como está meu dia?" />
        <div className="op-kpi-grid">
          {EXEC_KPI_CONFIG.map((cfg) => (
            <ExecutiveKpiCard key={cfg.key} kpi={dashboard.executive[cfg.key]} config={cfg} />
          ))}
        </div>
      </section>

      <div className="op-main-grid">
        <div className="op-main-col">
          {/* SEÇÃO 2 — Agenda Timeline */}
          <section className="op-section op-panel">
            <SectionTitle icon={Calendar} title="Agenda Operacional" subtitle={`${dashboard.totalAppointments} atendimentos`} />
            {dashboard.timeline.length === 0 ? (
              <p className="op-empty">Nenhum agendamento para esta data.</p>
            ) : (
              <ul className="op-timeline">
                {dashboard.timeline.map((item) => (
                  <li key={item.id} className="op-timeline-item">
                    <div className="op-timeline-time">{item.startTime || '—'}</div>
                    <div className="op-timeline-body">
                      <div className="op-timeline-top">
                        <strong>{item.patientName}</strong>
                        <StatusBadge displayStatus={item.displayStatus} />
                      </div>
                      <div className="op-timeline-meta">
                        <span>{item.professionalName}</span>
                        <span>·</span>
                        <span>{item.procedureName}</span>
                        {item.roomName !== '—' && <><span>·</span><span>{item.roomName}</span></>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="op-two-col">
            {/* SEÇÃO 6 — Confirmações pendentes */}
            <section className="op-section op-panel">
              <SectionTitle title="Confirmações Pendentes" subtitle={`⚠ ${dashboard.pendingConfirmations.length} sem confirmação`} />
              {dashboard.pendingConfirmations.length === 0 ? (
                <p className="op-empty">Todos confirmados.</p>
              ) : (
                <ul className="op-quick-list">
                  {dashboard.pendingConfirmations.map((p) => (
                    <li key={p.appointmentId} className="op-quick-item">
                      <div>
                        <strong>{p.patientName}</strong>
                        <span className="op-quick-meta">{p.startTime} · {p.professionalName}</span>
                      </div>
                      <div className="op-quick-actions">
                        <button type="button" className="op-icon-btn" title="WhatsApp" onClick={() => handleWhatsApp(p.phone, p.patientName)}>
                          <MessageCircle size={15} />
                        </button>
                        <button type="button" className="op-icon-btn" title="Ligar" onClick={() => handleCall(p.phone)}>
                          <Phone size={15} />
                        </button>
                        <button type="button" className="op-mini-btn" onClick={() => handleConfirm(p.appointmentId)}>Confirmar</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* SEÇÃO 7 — Faltas */}
            <section className="op-section op-panel">
              <SectionTitle title="Faltas do Dia" subtitle="Controle de perdas por ausência" />
              {dashboard.noShows.length === 0 ? (
                <p className="op-empty">Nenhuma falta registrada.</p>
              ) : (
                <ul className="op-quick-list">
                  {dashboard.noShows.map((n) => (
                    <li key={n.appointmentId} className="op-quick-item">
                      <div>
                        <strong>{n.patientName}</strong>
                        <span className="op-quick-meta">{n.procedureName} · {n.professionalName}</span>
                        <span className="op-quick-meta">{formatCurrencyBRL(n.estimatedValue)} · {n.reason}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="op-two-col">
            {/* SEÇÃO 8 — Produção */}
            <section className="op-section op-panel">
              <SectionTitle title="Produção do Dia" />
              <div className="op-prod-grid">
                <div className="op-prod-item"><span>Consultas realizadas</span><strong>{dashboard.production.consultasRealizadas}</strong></div>
                <div className="op-prod-item"><span>Avaliações realizadas</span><strong>{dashboard.production.avaliacoesRealizadas}</strong></div>
                <div className="op-prod-item"><span>Orçamentos apresentados</span><strong>{dashboard.production.orcamentosApresentados}</strong></div>
                <div className="op-prod-item"><span>Tratamentos fechados</span><strong>{dashboard.production.tratamentosFechados}</strong></div>
                <div className="op-prod-item op-prod-item--wide"><span>Receita prevista</span><strong>{formatCurrencyBRL(dashboard.production.receitaPrevista)}</strong></div>
                <div className="op-prod-item op-prod-item--wide"><span>Receita confirmada</span><strong>{formatCurrencyBRL(dashboard.production.receitaConfirmada)}</strong></div>
              </div>
            </section>

            {/* SEÇÃO 9 — Ocupação */}
            <section className="op-section op-panel">
              <SectionTitle title="Ocupação dos Profissionais" />
              {dashboard.occupancy.length === 0 ? (
                <p className="op-empty">Sem dados de ocupação.</p>
              ) : (
                <ul className="op-occupancy-list">
                  {dashboard.occupancy.map((o) => (
                    <li key={o.professionalId} className="op-occupancy-row">
                      <div className="op-occupancy-head">
                        <strong>{o.name}</strong>
                        <span>{o.percent}%</span>
                      </div>
                      <div className="op-occupancy-bar">
                        <div className="op-occupancy-fill" style={{ width: `${o.percent}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* SEÇÃO 11 — Financeiro */}
          <section className="op-section op-panel">
            <SectionTitle icon={DollarSign} title="Resumo Financeiro do Dia" />
            <div className="op-fin-grid">
              <div className="op-fin-card"><span>Receita prevista</span><strong>{formatCurrencyBRL(dashboard.financial.receitaPrevista)}</strong></div>
              <div className="op-fin-card op-fin-card--success"><span>Receita recebida</span><strong>{formatCurrencyBRL(dashboard.financial.receitaRecebida)}</strong></div>
              <div className="op-fin-card"><span>Orçamentos emitidos</span><strong>{formatCurrencyBRL(dashboard.financial.orcamentosEmitidos)}</strong></div>
              <div className="op-fin-card"><span>Em negociação</span><strong>{formatCurrencyBRL(dashboard.financial.valorNegociacao)}</strong></div>
              <div className="op-fin-card op-fin-card--accent"><span>Fechamentos do dia</span><strong>{formatCurrencyBRL(dashboard.financial.fechamentosDia)}</strong></div>
            </div>
          </section>

          {/* SEÇÃO 12 — Jornada */}
          <section className="op-section">
            <SectionTitle title="Jornada do Paciente" subtitle="Onde estão os pacientes agora?" />
            <div className="op-journey-grid">
              {dashboard.journey.map((j) => (
                <div key={j.key} className={`op-journey-card op-journey-card--${j.tone}`}>
                  <strong className="op-journey-count">{j.count}</strong>
                  <span className="op-journey-label">{j.label}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="op-sidebar">
          {/* SEÇÃO 3 — Aguardando */}
          <section className="op-section op-panel op-panel--highlight">
            <SectionTitle title="Pacientes Aguardando" subtitle={`${dashboard.waiting.length} na fila`} />
            {dashboard.waiting.length === 0 ? (
              <p className="op-empty">Ninguém aguardando.</p>
            ) : (
              <ul className="op-wait-list">
                {dashboard.waiting.map((w) => (
                  <li key={w.appointmentId} className={`op-wait-item ${w.isLongWait ? 'is-long' : ''}`}>
                    <strong>{w.patientName}</strong>
                    <span className={w.isLongWait ? 'op-wait-time is-danger' : 'op-wait-time'}>
                      {w.waitLabel} aguardando
                    </span>
                    <span className="op-quick-meta">Chegada {w.arrivalTime} · {w.professionalName}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* SEÇÃO 4 — Em andamento */}
          <section className="op-section op-panel">
            <SectionTitle title="Em Atendimento" subtitle={`${dashboard.inProgress.length} agora`} />
            {dashboard.inProgress.length === 0 ? (
              <p className="op-empty">Nenhum atendimento em curso.</p>
            ) : (
              <ul className="op-progress-list">
                {dashboard.inProgress.map((p) => (
                  <li key={p.appointmentId} className="op-progress-item">
                    <span className="op-progress-room">{p.roomName}</span>
                    <strong>{p.patientName}</strong>
                    <span className="op-quick-meta">{p.professionalName} · {p.procedureName}</span>
                    <span className="op-progress-time">{p.minutesInService} min em atendimento</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* SEÇÃO 5 — Próximos */}
          <section className="op-section op-panel">
            <SectionTitle title="Próximos Atendimentos" />
            {dashboard.upcoming.length === 0 ? (
              <p className="op-empty">Sem próximos agendamentos.</p>
            ) : (
              <ul className="op-upcoming-list">
                {dashboard.upcoming.map((u) => (
                  <li key={u.appointmentId} className="op-upcoming-item">
                    <span className="op-upcoming-time">{u.startTime}</span>
                    <div>
                      <strong>{u.patientName}</strong>
                      <span className="op-quick-meta">{u.procedureName}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
