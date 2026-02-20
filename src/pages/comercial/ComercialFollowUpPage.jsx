import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { SectionCard } from '../../components/SectionCard.jsx';
import { loadDb } from '../../db/index.js';
import { getLeadById } from '../../services/crmService.js';
import {
  listTasks,
  getTaskSummary,
  completeTask,
  linkAppointmentAndComplete,
  TASK_TYPE,
  TASK_TYPE_LABELS,
} from '../../services/crmTaskService.js';
import { listUsers } from '../../services/teamService.js';
import { getProfessionalOptions } from '../../services/collaboratorService.js';
import { ScheduleFromLeadModal } from '../../crm/ui/ScheduleFromLeadModal.jsx';
import { ScheduleFromPatientModal } from './ScheduleFromPatientModal.jsx';
import { Calendar, AlertCircle, Clock, FileText, Check, CalendarPlus } from 'lucide-react';

const ORIGIN_LABELS = { crm: 'CRM', agenda: 'Agenda', orcamento: 'Orçamento', manual: 'Manual' };

function getAssignableUsersMap() {
  const users = listUsers().filter((u) => u.active !== false);
  const pros = getProfessionalOptions();
  const m = {};
  users.forEach((u) => { m[u.id] = u.name || 'Usuário'; });
  pros.forEach((p) => { m[p.id] = m[p.id] || p.name || 'Profissional'; });
  return m;
}
const PRIORITY_LABELS = { low: 'Baixa', medium: 'Média', high: 'Alta' };

export default function ComercialFollowUpPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scheduleLead, setScheduleLead] = useState(null);
  const [schedulePatient, setSchedulePatient] = useState(null);
  const [followUpToComplete, setFollowUpToComplete] = useState(null);
  const [refresh, setRefresh] = useState(0);

  const summary = useMemo(() => getTaskSummary(), [refresh]);
  const allPending = useMemo(() => listTasks({ status: 'pending' }), [refresh]);
  const assignableMap = useMemo(() => getAssignableUsersMap(), []);
  const db = loadDb();
  const patientsMap = useMemo(() => {
    const m = {};
    (db.patients || []).forEach((p) => { m[p.id] = p; });
    return m;
  }, [db.patients]);

  const resolveDisplay = useCallback((row) => {
    if (row.patientId) {
      const p = patientsMap[row.patientId];
      return p?.full_name || p?.nickname || row.patientId;
    }
    if (row.leadId) {
      const lead = getLeadById(row.leadId);
      return lead?.name || row.leadId;
    }
    return '—';
  }, [patientsMap]);

  const handleAgendar = (row) => {
    if (row.leadId) {
      const lead = getLeadById(row.leadId);
      if (lead) {
        setFollowUpToComplete(row.id);
        setScheduleLead(lead);
      }
    } else if (row.patientId && (row.type === 'retorno' || row.type === 'clinico')) {
      const p = patientsMap[row.patientId];
      setFollowUpToComplete(row.id);
      setSchedulePatient({ patientId: row.patientId, patientName: p?.full_name || p?.nickname || 'Paciente' });
    } else {
      navigate('/gestao/agenda', { state: { highlightPatientId: row.patientId } });
    }
  };

  const handleScheduleSuccess = useCallback((appointment) => {
    if (followUpToComplete && appointment?.id && user) {
      try {
        linkAppointmentAndComplete(user, followUpToComplete, appointment.id);
      } catch {
        completeTask(user, followUpToComplete);
      }
      setFollowUpToComplete(null);
    } else if (followUpToComplete) {
      completeTask(user, followUpToComplete);
      setFollowUpToComplete(null);
    }
    setScheduleLead(null);
    setSchedulePatient(null);
    setRefresh((r) => r + 1);
  }, [user, followUpToComplete]);

  const handleComplete = (id) => {
    completeTask(user, id);
    setRefresh((r) => r + 1);
  };

  const canAgendar = (row) =>
    (row.type === TASK_TYPE.POST_CONSULT || row.type === TASK_TYPE.CUSTOM) && (row.leadId || row.patientId);

  return (
    <div className="comercial-follow-up-page stack">
      <div className="page-section">
        <h1 className="page-title">Follow-up</h1>
        <p className="page-subtitle">
          Lembretes de retorno, tarefas comerciais e integração com Agenda e CRM.
        </p>
      </div>

      <div className="follow-up-cards grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="follow-up-card atrasados" style={{ padding: '1rem', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca' }}>
          <AlertCircle size={24} style={{ color: '#dc2626', marginBottom: '0.5rem' }} />
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626' }}>{summary.atrasados}</div>
          <div style={{ fontSize: '0.875rem', color: '#991b1b' }}>Atrasados</div>
        </div>
        <div className="follow-up-card hoje" style={{ padding: '1rem', borderRadius: '12px', background: '#fefce8', border: '1px solid #fde047' }}>
          <Clock size={24} style={{ color: '#ca8a04', marginBottom: '0.5rem' }} />
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#a16207' }}>{summary.hoje}</div>
          <div style={{ fontSize: '0.875rem', color: '#854d0e' }}>Hoje</div>
        </div>
        <div className="follow-up-card proximos" style={{ padding: '1rem', borderRadius: '12px', background: '#f0f9ff', border: '1px solid #bae6fd' }}>
          <Calendar size={24} style={{ color: '#0284c7', marginBottom: '0.5rem' }} />
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0369a1' }}>{summary.proximos7}</div>
          <div style={{ fontSize: '0.875rem', color: '#075985' }}>Próximos 7 dias</div>
        </div>
        <div className="follow-up-card orcamentos" style={{ padding: '1rem', borderRadius: '12px', background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
          <FileText size={24} style={{ color: '#7c3aed', marginBottom: '0.5rem' }} />
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#6d28d9' }}>{summary.orcamentosPendentes}</div>
          <div style={{ fontSize: '0.875rem', color: '#5b21b6' }}>Orç. pendentes</div>
        </div>
      </div>

      <SectionCard
        title="Lista de follow-ups"
        description="Paciente, origem, tipo, responsável, data limite e ações."
      >
        {allPending.length === 0 ? (
          <div className="muted" style={{ padding: '2rem', textAlign: 'center' }}>
            Nenhum follow-up pendente. Crie lembretes a partir do CRM ou da Agenda.
          </div>
        ) : (
          <div className="table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Origem</th>
                  <th>Tipo</th>
                  <th>Responsável</th>
                  <th>Data limite</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {allPending.map((row) => {
                  const due = row.dueAt ? new Date(row.dueAt) : null;
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const dueStart = due ? new Date(due) : null;
                  if (dueStart) dueStart.setHours(0, 0, 0, 0);
                  const isOverdue = dueStart && dueStart < today;
                  const isToday = dueStart && dueStart.getTime() === today.getTime();
                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: '1px solid #e2e8f0',
                        backgroundColor: isOverdue ? '#fef2f2' : isToday ? '#fefce8' : undefined,
                      }}
                    >
                      <td>{resolveDisplay(row)}</td>
                      <td>{ORIGIN_LABELS[row.leadId ? 'crm' : row.patientId ? 'agenda' : 'manual'] || '—'}</td>
                      <td>{TASK_TYPE_LABELS[row.type] || row.type}</td>
                      <td>{row.assignedTo ? (assignableMap[row.assignedTo] || row.assignedTo) : '—'}</td>
                      <td>{row.dueAt ? new Date(row.dueAt).toLocaleDateString('pt-BR') : '—'}</td>
                      <td>
                        <span className="badge" style={{ background: row.priority === 'high' ? '#fef2f2' : '#f1f5f9', color: '#475569' }}>
                          {PRIORITY_LABELS[row.priority] || row.priority}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {canAgendar(row) && (
                            <button
                              type="button"
                              className="button secondary"
                              onClick={() => handleAgendar(row)}
                              title="Agendar na Agenda"
                            >
                              <CalendarPlus size={14} />
                              Agendar
                            </button>
                          )}
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() => handleComplete(row.id)}
                            title="Marcar como resolvido"
                          >
                            <Check size={14} />
                            Resolver
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <ScheduleFromLeadModal
        open={!!scheduleLead}
        onClose={() => { setScheduleLead(null); setFollowUpToComplete(null); }}
        lead={scheduleLead || undefined}
        user={user}
        taskId={followUpToComplete}
        onSuccess={handleScheduleSuccess}
      />

      {schedulePatient && (
        <ScheduleFromPatientModal
          open={!!schedulePatient}
          onClose={() => { setSchedulePatient(null); setFollowUpToComplete(null); }}
          patientId={schedulePatient.patientId}
          patientName={schedulePatient.patientName}
          user={user}
          onSuccess={handleScheduleSuccess}
        />
      )}
    </div>
  );
}
