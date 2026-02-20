import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CrmLayout } from '../crm/ui/CrmLayout.jsx';
import { SectionCard } from '../components/SectionCard.jsx';
import {
  getDayKpis,
  getDayFlow,
  getAppointmentTypeLabel,
  getAppointmentStatusLabel,
  getPacientesAcompanhamento,
  getAlertasOperacionais,
  PRIORITY,
} from '../services/gestaoAtendimentoService.js';
import { updateAppointmentStatus } from '../services/patientFlowService.js';
import { markNoShow } from '../services/journeyEntryService.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  Users,
  UserCheck,
  UserX,
  Stethoscope,
  Scissors,
  RotateCcw,
  Calendar,
  FileText,
  ExternalLink,
  MoreVertical,
  Clock,
  Eye,
  MessageSquare,
} from 'lucide-react';

const TODAY = () => new Date().toISOString().slice(0, 10);

function KpiCard({ icon: Icon, value, label, variant }) {
  return (
    <div
      className={`crm-report-kpi-card crm-report-kpi-${variant || 'default'}`}
    >
      <div className="crm-report-kpi-header">
        {Icon && <Icon size={20} className="crm-report-kpi-icon" aria-hidden />}
      </div>
      <div className="crm-report-kpi-value">{value}</div>
      <div className="crm-report-kpi-label">{label}</div>
    </div>
  );
}

function PriorityDot({ priority }) {
  const p = priority || PRIORITY.NORMAL;
  return (
    <span
      className={`gestao-priority-dot gestao-priority-${p}`}
      title={p === PRIORITY.ATRASADO ? 'Atrasado' : p === PRIORITY.ATENCAO ? 'Atenção' : 'Normal'}
      aria-hidden
    />
  );
}

function AcompanhamentoCard({ title, count, children, emptyMessage = 'Nenhum' }) {
  return (
    <div className="gestao-acompanhamento-card">
      <div className="gestao-acompanhamento-card-header">
        <h4 className="gestao-acompanhamento-card-title">{title}</h4>
        <span className="gestao-acompanhamento-card-badge">{count}</span>
      </div>
      <div className="gestao-acompanhamento-card-list">
        {count === 0 ? (
          <p className="gestao-acompanhamento-empty muted">{emptyMessage}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function AcompanhamentoRow({
  name,
  subinfo,
  priority,
  onProntuario,
  onAgenda,
  onCrm,
  hasPatient = true,
  isLead = false,
}) {
  return (
    <div className="gestao-acompanhamento-row">
      <div className="gestao-acompanhamento-row-main">
        <PriorityDot priority={priority} />
        <div className="gestao-acompanhamento-row-text">
          <span className="gestao-acompanhamento-row-name">{name}</span>
          {subinfo && <span className="gestao-acompanhamento-row-subinfo">{subinfo}</span>}
        </div>
      </div>
      <div className="gestao-acompanhamento-row-actions">
        {hasPatient && onProntuario && (
          <button
            type="button"
            className="gestao-acompanhamento-row-btn"
            onClick={onProntuario}
            title="Abrir prontuário"
          >
            <Eye size={14} />
          </button>
        )}
        {hasPatient && onAgenda && (
          <button
            type="button"
            className="gestao-acompanhamento-row-btn"
            onClick={onAgenda}
            title="Abrir agenda"
          >
            <Calendar size={14} />
          </button>
        )}
        {(onCrm || isLead) && (
          <button
            type="button"
            className="gestao-acompanhamento-row-btn"
            onClick={onCrm}
            title="Abrir CRM"
          >
            <MessageSquare size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function FlowRowActions({
  appointment,
  onConfirm,
  onMarkNoShow,
  onReschedule,
  onOpenChart,
  onOpenCrm,
}) {
  const [open, setOpen] = useState(false);
  const isConfirmed = [APPOINTMENT_STATUS.CONFIRMADO, APPOINTMENT_STATUS.CHEGOU, APPOINTMENT_STATUS.EM_ESPERA, APPOINTMENT_STATUS.EM_ATENDIMENTO, APPOINTMENT_STATUS.FINALIZADO, APPOINTMENT_STATUS.ATENDIDO].includes(appointment?.status);
  const isFalta = appointment?.status === APPOINTMENT_STATUS.FALTOU || appointment?.status === 'faltou';

  return (
    <div className="gestao-flow-actions-wrap">
      <button
        type="button"
        className="gestao-flow-actions-trigger"
        onClick={() => setOpen((p) => !p)}
        title="Ações"
        aria-expanded={open}
      >
        <MoreVertical size={18} />
      </button>
      {open && (
        <>
          <div className="gestao-flow-actions-backdrop" onClick={() => setOpen(false)} aria-hidden />
          <div className="gestao-flow-actions-dropdown">
            {!isConfirmed && !isFalta && (
              <button type="button" className="gestao-flow-action-item" onClick={() => { onConfirm(appointment.id); setOpen(false); }}>
                <UserCheck size={14} />
                Confirmar
              </button>
            )}
            {!isFalta && (
              <button type="button" className="gestao-flow-action-item" onClick={() => { onMarkNoShow(appointment.id); setOpen(false); }}>
                <UserX size={14} />
                Marcar falta
              </button>
            )}
            <button type="button" className="gestao-flow-action-item" onClick={() => { onReschedule(appointment.id); setOpen(false); }}>
              <Calendar size={14} />
              Reagendar
            </button>
            {appointment.patientId && (
              <button type="button" className="gestao-flow-action-item" onClick={() => { onOpenChart(appointment.patientId); setOpen(false); }}>
                <FileText size={14} />
                Abrir prontuário
              </button>
            )}
            <button type="button" className="gestao-flow-action-item" onClick={() => { onOpenCrm(appointment); setOpen(false); }}>
              <ExternalLink size={14} />
              Abrir CRM
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function GestaoAtendimentoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [toast, setToast] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const dateForQuery = selectedDate || TODAY();

  const kpis = useMemo(() => getDayKpis(dateForQuery), [dateForQuery, refreshKey]);
  const dayFlow = useMemo(() => getDayFlow(dateForQuery), [dateForQuery, refreshKey]);
  const acompanhamento = useMemo(() => getPacientesAcompanhamento(), [refreshKey]);
  const alertas = useMemo(() => getAlertasOperacionais(), [refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const handleConfirm = async (appointmentId) => {
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

  const handleReschedule = (appointmentId) => {
    navigate(`/gestao/agenda?appointmentId=${appointmentId}`);
  };

  const handleOpenChart = (patientId) => {
    if (patientId) navigate(`/prontuario/${patientId}`);
  };

  const handleOpenCrm = (appointment) => {
    if (appointment?.leadId) {
      navigate(`/crm/leads/${appointment.leadId}`);
    } else if (appointment?.patientId) {
      navigate(`/crm/leads`, { state: { filterPatientId: appointment.patientId } });
    } else {
      navigate('/crm/leads');
    }
  };

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  const formatCurrency = (n) =>
    typeof n === 'number' && !Number.isNaN(n)
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
      : '—';

  const formatDateShort = (str) => {
    if (!str) return '—';
    try {
      return new Date(str + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch {
      return str;
    }
  };

  return (
    <>
      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          {toast.message}
        </div>
      )}

      <CrmLayout
        title="Gestão de Atendimento"
        description="Central de comando do dia: visão do dia, fluxo, acompanhamento e alertas."
        actions={
          <input
            type="date"
            value={dateForQuery}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="gestao-date-picker"
            aria-label="Data"
          />
        }
      >
        {/* Seção 1 – Visão do dia (KPIs) */}
        <section className="crm-report-section">
          <h3 className="crm-report-section-title">Visão do dia</h3>
          <div className="crm-report-kpis">
            <KpiCard icon={Users} value={kpis.pacientesHoje} label="Pacientes hoje" />
            <KpiCard icon={UserCheck} value={kpis.confirmados} label="Confirmados" variant="success" />
            <KpiCard icon={Clock} value={kpis.naoConfirmados} label="Não confirmados" variant="default" />
            <KpiCard icon={UserX} value={kpis.faltas} label="Faltas" variant="danger" />
            <KpiCard icon={Stethoscope} value={kpis.primeirasConsultas} label="Primeiras consultas" />
            <KpiCard icon={Scissors} value={kpis.cirurgias} label="Cirurgias" />
            <KpiCard icon={RotateCcw} value={kpis.retornos} label="Retornos" />
          </div>
        </section>

        {/* Seção 2 – Fluxo do dia (Tabela) */}
        <section className="crm-report-section">
          <h3 className="crm-report-section-title">Fluxo do dia</h3>
          <SectionCard>
            <div className="crm-leads-table-wrap">
              <table className="crm-leads-table gestao-flow-table">
                <thead>
                  <tr>
                    <th>Horário</th>
                    <th>Paciente</th>
                    <th>Tipo</th>
                    <th>Status</th>
                    <th>Profissional</th>
                    <th style={{ width: '80px' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {dayFlow.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="crm-leads-empty">
                        Nenhum agendamento para esta data.
                      </td>
                    </tr>
                  ) : (
                    dayFlow.map((apt) => (
                      <tr key={apt.id}>
                        <td>{apt.startTime || '—'}</td>
                        <td>{apt.patientName || apt.leadDisplayName || '—'}</td>
                        <td>{getAppointmentTypeLabel(apt)}</td>
                        <td>
                          <span className={`gestao-status-badge gestao-status-${getAppointmentStatusLabel(apt).toLowerCase().replace(' ', '-')}`}>
                            {getAppointmentStatusLabel(apt)}
                          </span>
                        </td>
                        <td>{apt.professionalName || '—'}</td>
                        <td>
                          <FlowRowActions
                            appointment={apt}
                            onConfirm={handleConfirm}
                            onMarkNoShow={handleMarkNoShow}
                            onReschedule={handleReschedule}
                            onOpenChart={handleOpenChart}
                            onOpenCrm={handleOpenCrm}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </section>

        {/* Seção 3 – Pacientes em acompanhamento */}
        <section className="crm-report-section">
          <h3 className="crm-report-section-title">Pacientes em acompanhamento</h3>
          <div className="gestao-acompanhamento-grid gestao-acompanhamento-grid-cols2">
            <AcompanhamentoCard
              title="Pós-operatório ativo"
              count={acompanhamento.posOperatorioAtivo.length}
            >
              {acompanhamento.posOperatorioAtivo.map((p) => (
                <AcompanhamentoRow
                  key={p.patientId}
                  name={p.name}
                  subinfo={p.subinfo}
                  priority={p.priority}
                  hasPatient
                  onProntuario={() => handleOpenChart(p.patientId)}
                  onAgenda={() => navigate('/gestao/agenda')}
                  onCrm={() => navigate('/crm/leads', { state: { filterPatientId: p.patientId } })}
                />
              ))}
            </AcompanhamentoCard>
            <AcompanhamentoCard
              title="Em tratamento"
              count={acompanhamento.emTratamento.length}
            >
              {acompanhamento.emTratamento.map((p) => (
                <AcompanhamentoRow
                  key={p.patientId}
                  name={p.name}
                  subinfo={p.subinfo}
                  priority={p.priority}
                  hasPatient
                  onProntuario={() => handleOpenChart(p.patientId)}
                  onAgenda={() => navigate('/gestao/agenda')}
                  onCrm={() => navigate('/crm/leads', { state: { filterPatientId: p.patientId } })}
                />
              ))}
            </AcompanhamentoCard>
            <AcompanhamentoCard
              title="Aguardando retorno"
              count={acompanhamento.aguardandoRetorno.length}
            >
              {acompanhamento.aguardandoRetorno.map((p) => (
                <AcompanhamentoRow
                  key={p.patientId}
                  name={p.name}
                  subinfo={p.subinfo}
                  priority={p.priority}
                  hasPatient
                  onProntuario={() => handleOpenChart(p.patientId)}
                  onAgenda={() => navigate('/gestao/agenda')}
                  onCrm={() => navigate('/crm/leads', { state: { filterPatientId: p.patientId } })}
                />
              ))}
            </AcompanhamentoCard>
            <AcompanhamentoCard
              title="Aguardando orçamento"
              count={acompanhamento.aguardandoOrcamento.length}
            >
              {acompanhamento.aguardandoOrcamento.map((item) => (
                <AcompanhamentoRow
                  key={item.leadId}
                  name={item.name}
                  subinfo={item.subinfo}
                  priority={item.priority}
                  hasPatient={Boolean(item.patientId)}
                  isLead
                  onProntuario={item.patientId ? () => handleOpenChart(item.patientId) : undefined}
                  onAgenda={item.patientId ? () => navigate('/gestao/agenda') : undefined}
                  onCrm={() => navigate(`/crm/leads/${item.leadId}`)}
                />
              ))}
            </AcompanhamentoCard>
          </div>
        </section>

        {/* Seção 4 – Alertas operacionais */}
        <section className="crm-report-section">
          <h3 className="crm-report-section-title">Alertas operacionais</h3>
          <div className="gestao-alertas-grid">
            <SectionCard title="Pacientes não confirmados para amanhã">
              {alertas.pacientesNaoConfirmadosAmanha.length === 0 ? (
                <p className="muted">Nenhum</p>
              ) : (
                <ul className="simple-list gestao-list">
                  {alertas.pacientesNaoConfirmadosAmanha.map((a) => (
                    <li key={a.appointmentId}>
                      <span>{a.patientName}</span>
                      <span className="gestao-alerta-meta">{a.startTime} · {a.professionalName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard title="Orçamentos aguardando resposta">
              {alertas.orcamentosAguardandoResposta.length === 0 ? (
                <p className="muted">Nenhum</p>
              ) : (
                <ul className="simple-list gestao-list">
                  {alertas.orcamentosAguardandoResposta.map((b) => (
                    <li key={b.budgetId}>
                      <button
                        type="button"
                        className="gestao-list-link"
                        onClick={() => navigate(`/crm/leads/${b.leadId}`)}
                      >
                        {b.leadName}
                      </button>
                      <span className="gestao-alerta-meta">{b.title} · {formatCurrency(b.totalValue)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard title="Follow-ups atrasados">
              {alertas.followUpsAtrasados.length === 0 ? (
                <p className="muted">Nenhum</p>
              ) : (
                <ul className="simple-list gestao-list">
                  {alertas.followUpsAtrasados.slice(0, 8).map((t) => (
                    <li key={t.taskId}>
                      <button
                        type="button"
                        className="gestao-list-link"
                        onClick={() => t.leadId && navigate(`/crm/leads/${t.leadId}`)}
                      >
                        {t.title}
                      </button>
                      <span className="gestao-alerta-meta">{formatDateShort(t.dueAt?.slice(0, 10))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard title="Parcelas vencidas">
              {alertas.parcelasVencidas.length === 0 ? (
                <p className="muted">Nenhuma</p>
              ) : (
                <ul className="simple-list gestao-list">
                  {alertas.parcelasVencidas.slice(0, 8).map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="gestao-list-link"
                        onClick={() => p.patientId && navigate(`/prontuario/${p.patientId}`)}
                      >
                        {formatCurrency(p.amount)}
                      </button>
                      <span className="gestao-alerta-meta">Venc. {formatDateShort(p.dueDate)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </section>
      </CrmLayout>
    </>
  );
}
