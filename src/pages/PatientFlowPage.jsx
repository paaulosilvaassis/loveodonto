import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Clock,
  DollarSign,
  Minus,
  RefreshCw,
  Search,
  Stethoscope,
  Timer,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';
import { useAuth } from '../auth/useAuth.js';
import PatientFlowKanban from '../components/flow/PatientFlowKanban.jsx';
import CheckInModal from '../components/flow/CheckInModal.jsx';
import CancelOrRescheduleModal from '../components/flow/CancelOrRescheduleModal.jsx';
import {
  ModalRoot,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalTitle,
} from '../components/ui/Modal.jsx';
import {
  fetchAppointmentsByDate,
  moveToFlowColumn,
  FLOW_COLUMN,
  FLOW_COLUMN_META,
} from '../services/patientFlowService.js';
import { getPatientFlowDashboard } from '../services/patientFlowDashboardService.js';
import {
  confirmArrival,
  finishAppointment,
  markNoShow,
  sendToConsultingRoom,
} from '../services/journeyEntryService.js';
import { formatCurrencyBRL } from '../utils/currency.js';

const TODAY = () => new Date().toISOString().slice(0, 10);
const REFRESH_MS = 30000;

const SUMMARY_KPI_CONFIG = [
  { key: 'agendadosHoje', label: 'Agendados Hoje', icon: Calendar, tone: 'primary', emoji: '📅' },
  { key: 'presentesNaClinica', label: 'Presentes na Clínica', icon: Users, tone: 'info', emoji: '🏥' },
  { key: 'emEspera', label: 'Em Espera', icon: Clock, tone: 'warning', emoji: '⏳' },
  { key: 'emAtendimento', label: 'Em Atendimento', icon: Stethoscope, tone: 'orange', emoji: '🦷' },
  { key: 'emAvaliacaoComercial', label: 'Em Avaliação Comercial', icon: Activity, tone: 'accent', emoji: '💰' },
  { key: 'finalizados', label: 'Finalizados', icon: UserCheck, tone: 'success', emoji: '✅' },
  { key: 'faltas', label: 'Faltas', icon: UserX, tone: 'danger', emoji: '❌' },
  { key: 'retornos', label: 'Retornos', icon: RefreshCw, tone: 'neutral', emoji: '🔄' },
];

function TrendBadge({ delta, direction }) {
  if (direction === 'flat' || delta === 0) {
    return <span className="pf-trend pf-trend--flat"><Minus size={12} /> 0%</span>;
  }
  const label = `${delta > 0 ? '+' : ''}${delta}%`;
  return direction === 'up' ? (
    <span className="pf-trend pf-trend--up"><ArrowUpRight size={12} /> {label}</span>
  ) : (
    <span className="pf-trend pf-trend--down"><ArrowDownRight size={12} /> {label}</span>
  );
}

function SummaryKpiCard({ kpi, config }) {
  const Icon = config.icon;
  return (
    <div className={`pf-kpi pf-kpi--${config.tone}`}>
      <div className="pf-kpi-head">
        <span className="pf-kpi-emoji" aria-hidden="true">{config.emoji}</span>
        <span className="pf-kpi-icon"><Icon size={16} /></span>
        <TrendBadge delta={kpi.delta} direction={kpi.direction} />
      </div>
      <strong className="pf-kpi-value">{kpi.value}</strong>
      <span className="pf-kpi-label">{config.label}</span>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="pf-section-head">
      <h2 className="pf-section-title">
        {Icon && <Icon size={18} />}
        {title}
      </h2>
      {subtitle && <p className="pf-section-sub">{subtitle}</p>}
    </div>
  );
}

export default function PatientFlowPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tenantId = user?.tenantId || user?.tenant_id || '';

  const [selectedDate, setSelectedDate] = useState(() => searchParams.get('date') || TODAY());
  const [filters, setFilters] = useState({ professionalId: '', search: '' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [toast, setToast] = useState(null);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [moveModal, setMoveModal] = useState({ open: false, appointmentId: '', targetColumn: FLOW_COLUMN.SALA_ESPERA });
  const [cancelModal, setCancelModal] = useState({ open: false, appointment: null });

  const dashboard = useMemo(
    () => getPatientFlowDashboard(selectedDate, { tenantId, filters }),
    [selectedDate, tenantId, filters, refreshKey]
  );

  const appointments = useMemo(
    () => fetchAppointmentsByDate(selectedDate, { tenantId }),
    [selectedDate, tenantId, refreshKey]
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

  const handleMoveColumn = async (appointmentId, targetColumn) => {
    try {
      moveToFlowColumn(user, appointmentId, targetColumn);
      showToast('Paciente movido com sucesso');
      refresh();
    } catch (e) {
      showToast(e?.message || 'Erro ao mover paciente', 'error');
    }
  };

  const handleQuickMove = async (targetColumn) => {
    const apt = appointments.find((a) =>
      [FLOW_COLUMN.RECEPCAO, FLOW_COLUMN.SALA_ESPERA].includes(a.flowColumn)
    );
    if (!apt) {
      showToast('Nenhum paciente em espera para mover', 'error');
      return;
    }
    await handleMoveColumn(apt.id, targetColumn);
  };

  const handleCheckIn = async (appointmentId) => {
    try {
      await confirmArrival(user, appointmentId);
      moveToFlowColumn(user, appointmentId, FLOW_COLUMN.RECEPCAO);
      showToast('Chegada registrada');
      refresh();
    } catch (e) {
      showToast(e?.message || 'Erro ao registrar chegada', 'error');
    }
  };

  const handleStartService = async () => {
    const apt = appointments.find((a) =>
      [FLOW_COLUMN.RECEPCAO, FLOW_COLUMN.SALA_ESPERA].includes(a.flowColumn)
    );
    if (!apt) {
      showToast('Nenhum paciente aguardando', 'error');
      return;
    }
    try {
      await sendToConsultingRoom(user, apt.id, apt.consultorioId || apt.roomId || null);
      moveToFlowColumn(user, apt.id, FLOW_COLUMN.CONSULTORIO);
      showToast('Atendimento iniciado');
      refresh();
    } catch (e) {
      showToast(e?.message || 'Erro ao iniciar atendimento', 'error');
    }
  };

  const handleFinish = async () => {
    const apt = appointments.find((a) =>
      [FLOW_COLUMN.CONSULTORIO, FLOW_COLUMN.AVALIACAO_COMERCIAL, FLOW_COLUMN.FINANCEIRO].includes(a.flowColumn)
    );
    if (!apt) {
      showToast('Nenhum atendimento em andamento', 'error');
      return;
    }
    try {
      if (apt.flowColumn === FLOW_COLUMN.CONSULTORIO) {
        await finishAppointment(user, apt.id);
      } else {
        moveToFlowColumn(user, apt.id, FLOW_COLUMN.FINALIZADO);
      }
      showToast('Atendimento finalizado');
      refresh();
    } catch (e) {
      showToast(e?.message || 'Erro ao finalizar', 'error');
    }
  };

  const handleNoShow = async () => {
    const apt = appointments.find((a) => a.flowColumn === FLOW_COLUMN.AGENDADOS);
    if (!apt) {
      showToast('Selecione um agendamento via mover paciente', 'error');
      return;
    }
    try {
      await markNoShow(user, apt.id);
      moveToFlowColumn(user, apt.id, FLOW_COLUMN.FALTA_CANCELADO);
      showToast('Falta registrada');
      refresh();
    } catch (e) {
      showToast(e?.message || 'Erro ao registrar falta', 'error');
    }
  };

  const handleOpenPatient = (card) => {
    if (card?.patientId) navigate(`/prontuario/${card.patientId}`);
    else if (card?.appointmentId) navigate(`/gestao/agenda?appointmentId=${card.appointmentId}`);
  };

  const formatDateLabel = (dateStr) => {
    try {
      return new Date(`${dateStr}T12:00:00`).toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const movableAppointments = appointments.filter((a) =>
    a.flowColumn !== FLOW_COLUMN.FALTA_CANCELADO
  );

  return (
    <div className="pf-central-page">
      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          {toast.message}
        </div>
      )}

      <header className="pf-central-header">
        <div className="pf-central-header-text">
          <span className="pf-central-badge"><Activity size={12} /> Tempo real</span>
          <h1>Fluxo do Paciente</h1>
          <p>Central operacional da jornada — {formatDateLabel(selectedDate)}</p>
          <p className="pf-last-update">
            Atualizado às {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="pf-central-header-actions">
          <input
            type="date"
            className="pf-date-picker"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setSearchParams({ date: e.target.value });
            }}
          />
          <button type="button" className="pf-btn pf-btn--ghost" onClick={refresh}>
            <RefreshCw size={16} /> Atualizar
          </button>
        </div>
      </header>

      {/* Seção 11 — Ações rápidas */}
      <div className="pf-quick-actions">
        <button type="button" className="pf-btn pf-btn--primary" onClick={() => setCheckInOpen(true)}>
          Registrar chegada
        </button>
        <button
          type="button"
          className="pf-btn"
          onClick={() => setMoveModal({ open: true, appointmentId: '', targetColumn: FLOW_COLUMN.SALA_ESPERA })}
        >
          Mover paciente
        </button>
        <button type="button" className="pf-btn" onClick={handleStartService}>
          Iniciar atendimento
        </button>
        <button type="button" className="pf-btn" onClick={handleFinish}>
          Encerrar atendimento
        </button>
        <button type="button" className="pf-btn" onClick={() => handleQuickMove(FLOW_COLUMN.AVALIACAO_COMERCIAL)}>
          Enviar p/ avaliação comercial
        </button>
        <button type="button" className="pf-btn" onClick={() => handleQuickMove(FLOW_COLUMN.FINANCEIRO)}>
          Enviar p/ financeiro
        </button>
        <button type="button" className="pf-btn pf-btn--success" onClick={() => handleQuickMove(FLOW_COLUMN.FINALIZADO)}>
          Finalizar atendimento
        </button>
        <button type="button" className="pf-btn pf-btn--danger" onClick={handleNoShow}>
          Registrar falta
        </button>
      </div>

      <div className="pf-filters">
        <div className="pf-filters-grid">
          <label className="pf-filter-field">
            <Search size={14} />
            <input
              type="search"
              placeholder="Buscar paciente..."
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
          </label>
          <label className="pf-filter-field">
            Profissional
            <select
              value={filters.professionalId}
              onChange={(e) => setFilters((f) => ({ ...f, professionalId: e.target.value }))}
            >
              <option value="">Todos</option>
              {dashboard.filterOptions.professionals.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Seção 10 — Alertas */}
      {dashboard.alerts.length > 0 && (
        <div className="pf-alerts-banner" role="status">
          {dashboard.alerts.map((alert) => (
            <span key={alert.id} className={`pf-alert-chip pf-alert-chip--${alert.type}`}>
              <AlertTriangle size={14} />
              {alert.message}
            </span>
          ))}
        </div>
      )}

      {/* Seção 1 — Resumo operacional */}
      <section className="pf-section">
        <SectionTitle title="Resumo operacional do dia" subtitle="Comparação com o dia anterior" />
        <div className="pf-kpi-grid">
          {SUMMARY_KPI_CONFIG.map((cfg) => (
            <SummaryKpiCard key={cfg.key} kpi={dashboard.summary[cfg.key]} config={cfg} />
          ))}
        </div>
      </section>

      {/* Seção 2 — Kanban */}
      <section className="pf-section pf-section--kanban">
        <SectionTitle
          icon={Activity}
          title="Jornada visual do paciente"
          subtitle="Arraste os cards entre colunas para atualizar o fluxo"
        />
        <PatientFlowKanban
          kanban={dashboard.kanban}
          onMoveCard={handleMoveColumn}
          onOpenPatient={handleOpenPatient}
        />
      </section>

      <div className="pf-panels-grid">
        {/* Seção 3 — Aguardando */}
        <section className="pf-panel pf-panel--alert">
          <SectionTitle icon={AlertTriangle} title="Pacientes aguardando" />
          {dashboard.waiting.length === 0 ? (
            <p className="pf-empty">Nenhum paciente aguardando.</p>
          ) : (
            <ul className="pf-wait-list">
              {dashboard.waiting.map((w) => (
                <li key={w.appointmentId} className={w.isAlert ? 'is-alert' : ''}>
                  <strong>⚠ {w.patientName}</strong>
                  <span>{w.waitLabel} aguardando</span>
                  <span className="pf-muted">{w.professionalName}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Seção 4 — Em andamento */}
        <section className="pf-panel">
          <SectionTitle icon={Stethoscope} title="Atendimentos em andamento" />
          {dashboard.inProgress.length === 0 ? (
            <p className="pf-empty">Nenhum atendimento em andamento.</p>
          ) : (
            <ul className="pf-progress-list">
              {dashboard.inProgress.map((item) => (
                <li key={item.appointmentId}>
                  <strong>{item.patientName}</strong>
                  <span>{item.roomName}</span>
                  <span>{item.procedureName}</span>
                  <span className="pf-time-badge">{item.minutesInService} minutos</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Seção 5 — Próximos */}
        <section className="pf-panel">
          <SectionTitle icon={Clock} title="Próximos pacientes" subtitle="Próximas 2 horas" />
          {dashboard.upcoming.length === 0 ? (
            <p className="pf-empty">Nenhum agendamento nas próximas 2 horas.</p>
          ) : (
            <ul className="pf-upcoming-list">
              {dashboard.upcoming.map((u) => (
                <li key={u.appointmentId}>
                  <span className="pf-upcoming-time">{u.startTime}</span>
                  <span>{u.patientName}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="pf-panels-grid pf-panels-grid--wide">
        {/* Seção 6 — Faltas */}
        <section className="pf-panel">
          <SectionTitle icon={UserX} title="Faltas e cancelamentos" />
          {dashboard.losses.length === 0 ? (
            <p className="pf-empty">Nenhuma falta ou cancelamento hoje.</p>
          ) : (
            <div className="pf-table-wrap">
              <table className="pf-table">
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>Horário</th>
                    <th>Procedimento</th>
                    <th>Profissional</th>
                    <th>Motivo</th>
                    <th>Valor perdido</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.losses.map((row) => (
                    <tr key={row.appointmentId}>
                      <td>{row.patientName}</td>
                      <td>{row.startTime}</td>
                      <td>{row.procedureName}</td>
                      <td>{row.professionalName}</td>
                      <td>{row.reason}</td>
                      <td>{formatCurrencyBRL(row.estimatedValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Seção 7 — Produção */}
        <section className="pf-panel">
          <SectionTitle icon={DollarSign} title="Produção do dia" />
          <div className="pf-production-grid">
            <div className="pf-stat"><strong>{dashboard.production.consultasRealizadas}</strong><span>Consultas realizadas</span></div>
            <div className="pf-stat"><strong>{dashboard.production.avaliacoesRealizadas}</strong><span>Avaliações realizadas</span></div>
            <div className="pf-stat"><strong>{dashboard.production.orcamentosApresentados}</strong><span>Orçamentos apresentados</span></div>
            <div className="pf-stat"><strong>{dashboard.production.tratamentosFechados}</strong><span>Tratamentos fechados</span></div>
            <div className="pf-stat pf-stat--wide">
              <strong>{formatCurrencyBRL(dashboard.production.receitaPrevista)}</strong>
              <span>Receita prevista</span>
            </div>
            <div className="pf-stat pf-stat--wide">
              <strong>{formatCurrencyBRL(dashboard.production.receitaFechada)}</strong>
              <span>Receita fechada</span>
            </div>
          </div>
        </section>
      </div>

      <div className="pf-panels-grid">
        {/* Seção 8 — Tempos médios */}
        <section className="pf-panel">
          <SectionTitle icon={Timer} title="Tempo médio de espera" />
          <div className="pf-avg-grid">
            <div className="pf-avg-item">
              <strong>{dashboard.averageWait.recepcao} min</strong>
              <span>Recepção</span>
            </div>
            <div className="pf-avg-item">
              <strong>{dashboard.averageWait.salaEspera} min</strong>
              <span>Sala de espera</span>
            </div>
            <div className="pf-avg-item">
              <strong>{dashboard.averageWait.atendimento} min</strong>
              <span>Em atendimento</span>
            </div>
            <div className="pf-avg-item">
              <strong>{dashboard.averageWait.permanenciaTotal} min</strong>
              <span>Permanência total</span>
            </div>
          </div>
        </section>

        {/* Seção 9 — Ocupação */}
        <section className="pf-panel">
          <SectionTitle icon={Users} title="Ocupação dos profissionais" />
          {dashboard.occupancy.length === 0 ? (
            <p className="pf-empty">Sem dados de ocupação.</p>
          ) : (
            <ul className="pf-occupancy-list">
              {dashboard.occupancy.map((o) => (
                <li key={o.professionalId}>
                  <div className="pf-occ-head">
                    <span>{o.name}</span>
                    <strong>{o.percent}%</strong>
                  </div>
                  <div className="pf-occ-bar">
                    <div className="pf-occ-fill" style={{ width: `${o.percent}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <CheckInModal
        open={checkInOpen}
        onClose={() => setCheckInOpen(false)}
        appointments={appointments.filter((a) => a.flowColumn === FLOW_COLUMN.AGENDADOS)}
        onCheckIn={handleCheckIn}
      />

      <CancelOrRescheduleModal
        open={cancelModal.open}
        onClose={() => setCancelModal({ open: false, appointment: null })}
        appointment={cancelModal.appointment}
        onCancel={() => {}}
        onReschedule={() => {}}
        user={user}
      />

      <ModalRoot
        open={moveModal.open}
        onOpenChange={(next) => { if (!next) setMoveModal((m) => ({ ...m, open: false })); }}
      >
        <ModalContent size="md">
          <ModalHeader>
            <ModalTitle>Mover paciente</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <form id="pf-move-form" className="pf-move-form" onSubmit={(e) => {
              e.preventDefault();
              if (!moveModal.appointmentId) return;
              handleMoveColumn(moveModal.appointmentId, moveModal.targetColumn);
              setMoveModal((m) => ({ ...m, open: false }));
            }}>
              <label className="pf-form-field">
                Paciente
                <select
                  required
                  value={moveModal.appointmentId}
                  onChange={(e) => setMoveModal((m) => ({ ...m, appointmentId: e.target.value }))}
                >
                  <option value="">Selecione...</option>
                  {movableAppointments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.patientName || 'Paciente'} — {a.startTime}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pf-form-field">
                Destino
                <select
                  value={moveModal.targetColumn}
                  onChange={(e) => setMoveModal((m) => ({ ...m, targetColumn: e.target.value }))}
                >
                  {FLOW_COLUMN_META.map((col) => (
                    <option key={col.id} value={col.id}>{col.emoji} {col.label}</option>
                  ))}
                </select>
              </label>
            </form>
          </ModalBody>
          <ModalFooter>
            <button type="button" className="pf-btn pf-btn--ghost" onClick={() => setMoveModal((m) => ({ ...m, open: false }))}>
              Cancelar
            </button>
            <button type="submit" form="pf-move-form" className="pf-btn pf-btn--primary">
              Mover
            </button>
          </ModalFooter>
        </ModalContent>
      </ModalRoot>
    </div>
  );
}
