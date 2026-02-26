import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { loadDb } from '../db/index.js';
import {
  APPOINTMENT_STATUS,
  callPatient,
  finishAppointment,
  returnToWaiting,
  checkInAppointment,
} from '../services/appointmentService.js';
import { JOURNEY_STAGE, listJourneyEntriesByDate } from '../services/journeyEntryService.js';
import { listRooms } from '../services/teamService.js';
import { useNowTick } from '../hooks/useNowTick.js';
import {
  getWaitTimeSeconds,
  formatWaitTime,
  getWaitTimeColor,
  formatPatientName,
  formatPhoneDisplay,
  calculateAverageWaitTime,
  getLongestWaitTime,
} from '../utils/journeyUtils.js';
import { Bell, CheckCircle2, Clock, Users, Activity, Search, User, Building2, Clipboard, Calendar } from 'lucide-react';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const REFRESH_INTERVAL_MS = 5000;

export default function PatientJourneyPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusAppointmentId = searchParams.get('focus');
  const now = useNowTick(1000);
  const today = todayIso();

  const [selectedDate, setSelectedDate] = useState(today);
  const [appointments, setAppointments] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [activeTab, setActiveTab] = useState('waiting');
  const [filterDentist, setFilterDentist] = useState('');
  const [filterRoom, setFilterRoom] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState(null);
  const [callRoomModal, setCallRoomModal] = useState({ open: false, appointmentId: null });
  const [customRoomName, setCustomRoomName] = useState('');
  const toastTimeoutRef = useRef(null);

  const db = loadDb();

  useEffect(() => {
    refreshData();
    const toastType = searchParams.get('toast');
    if (toastType === 'checkin') {
      showToast('Chegada confirmada. Paciente enviado para Jornada do Paciente.');
    }
  }, [selectedDate]);

  useEffect(() => {
    if (!focusAppointmentId) return;
    const apt = appointments.find((a) => a.id === focusAppointmentId);
    if (!apt) return;
    if (getJourneyStage(apt) === JOURNEY_STAGE.SALA_ESPERA) setActiveTab('waiting');
    else if (getJourneyStage(apt) === JOURNEY_STAGE.CONSULTORIO) setActiveTab('in_progress');
    else if (getJourneyStage(apt) === JOURNEY_STAGE.FINALIZADO) setActiveTab('finished');
  }, [appointments, focusAppointmentId]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshData();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const refreshData = useCallback(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PatientJourneyPage.jsx:refreshData',message:'refreshData called',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    const journeyEntries = listJourneyEntriesByDate(selectedDate);
    setAppointments(journeyEntries);
    setRooms(listRooms());
  }, [selectedDate]);

  const getJourneyStage = (appointment) => {
    const raw = appointment?.journeyStage ?? appointment?.status;
    if (!raw) return JOURNEY_STAGE.AGENDADOS;
    const s = String(raw).toLowerCase().replace(/\s+/g, '_');
    if (s === 'sala_espera' || s === 'em_espera' || s === 'chegou') return JOURNEY_STAGE.SALA_ESPERA;
    if (s === 'consultorio' || s === 'em_atendimento') return JOURNEY_STAGE.CONSULTORIO;
    if (s === 'finalizado' || s === 'atendido') return JOURNEY_STAGE.FINALIZADO;
    return JOURNEY_STAGE.AGENDADOS;
  };

  /** Atualiza o status da jornada no banco e refaz a lista. */
  const updateJourneyStatus = useCallback(async (appointmentId, newStatus, options = {}) => {
    const appointment = appointments.find((a) => a.id === appointmentId);
    if (!appointment) {
      showToast('Agendamento não encontrado.', 'error');
      return;
    }
    const effectiveStage = getJourneyStage(appointment);
    try {
      if (newStatus === 'EM_ESPERA') {
        if (![APPOINTMENT_STATUS.AGENDADO, APPOINTMENT_STATUS.CONFIRMADO, APPOINTMENT_STATUS.EM_CONFIRMACAO, APPOINTMENT_STATUS.ATRASADO].includes(appointment.status)) {
          showToast('Paciente já está na sala de espera ou em outro estágio.', 'error');
          return;
        }
        checkInAppointment(user, appointmentId);
        showToast('Paciente enviado para a sala de espera.');
      } else if (newStatus === 'EM_ATENDIMENTO') {
        const roomId = options.consultorioId ?? appointment.consultorioId ?? appointment.roomId;
        if (!roomId) {
          setCallRoomModal({ open: true, appointmentId });
          return;
        }
        callPatient(user, appointmentId, roomId);
        showToast('Paciente chamado para o consultório.');
      } else if (newStatus === 'FINALIZADO') {
        finishAppointment(user, appointmentId);
        showToast('Atendimento finalizado.');
      } else {
        showToast('Status inválido.', 'error');
        return;
      }
      refreshData();
      setTimeout(() => refreshData(), 200);
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
      showToast(err.message || 'Erro ao atualizar status.', 'error');
    }
  }, [appointments, user, refreshData, showToast]);

  const showToast = (message, type = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3200);
  };

  // Filtrar e ordenar agendamentos
  const filteredAppointments = useMemo(() => {
    let filtered = appointments;

    // Filtrar por tab
    if (activeTab === 'waiting') {
      filtered = filtered.filter((apt) => getJourneyStage(apt) === JOURNEY_STAGE.SALA_ESPERA);
    } else if (activeTab === 'in_progress') {
      filtered = filtered.filter((apt) => getJourneyStage(apt) === JOURNEY_STAGE.CONSULTORIO);
    } else if (activeTab === 'finished') {
      filtered = filtered.filter((apt) => getJourneyStage(apt) === JOURNEY_STAGE.FINALIZADO && apt.date === selectedDate);
    }

    // Filtrar por dentista
    if (filterDentist) {
      filtered = filtered.filter((apt) => apt.professionalId === filterDentist);
    }

    // Filtrar por consultório
    if (filterRoom) {
      filtered = filtered.filter((apt) => apt.consultorioId === filterRoom || apt.roomId === filterRoom);
    }

    // Busca por nome/telefone
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((apt) => {
        const nameMatch = apt.patientName.toLowerCase().includes(query);
        const phoneMatch = apt.phone && formatPhoneDisplay(apt.phone).includes(query);
        return nameMatch || phoneMatch;
      });
    }

    // Ordenar
    if (activeTab === 'waiting') {
      // Maior tempo de espera primeiro (check-in mais antigo)
      filtered.sort((a, b) => {
        const aCheck = a.journeyCheckedInAt || a.checkInAt || '';
        const bCheck = b.journeyCheckedInAt || b.checkInAt || '';
        return aCheck.localeCompare(bCheck);
      });
    } else if (activeTab === 'in_progress') {
      // Horário de início mais antigo primeiro
      filtered.sort((a, b) => {
        const aStart = a.journeyStartedAt || a.startedAt || a.journeyCalledAt || a.calledAt || '';
        const bStart = b.journeyStartedAt || b.startedAt || b.journeyCalledAt || b.calledAt || '';
        return aStart.localeCompare(bStart);
      });
    } else if (activeTab === 'finished') {
      // Mais recente primeiro
      filtered.sort((a, b) => {
        const aFinish = a.journeyFinishedAt || a.finishedAt || '';
        const bFinish = b.journeyFinishedAt || b.finishedAt || '';
        return bFinish.localeCompare(aFinish);
      });
    }

    return filtered;
  }, [appointments, activeTab, filterDentist, filterRoom, searchQuery, selectedDate]);

  // KPIs
  const kpis = useMemo(() => {
    const waiting = appointments.filter((apt) => getJourneyStage(apt) === JOURNEY_STAGE.SALA_ESPERA);
    const inProgress = appointments.filter((apt) => getJourneyStage(apt) === JOURNEY_STAGE.CONSULTORIO);
    const longestWait = getLongestWaitTime(waiting, now);
    const avgWait = calculateAverageWaitTime(appointments);
    const occupiedRooms = new Set(inProgress.map((apt) => apt.consultorioId || apt.roomId).filter(Boolean));
    const totalRooms = rooms.filter((r) => r.active).length;

    return {
      waitingCount: waiting.length,
      inProgressCount: inProgress.length,
    longestWait: longestWait ? { time: longestWait.seconds, name: longestWait.name } : null,
    avgWaitMinutes: avgWait,
    occupiedRooms: occupiedRooms.size,
    totalRooms,
    };
  }, [appointments, now, rooms]);

  const formattedSelectedDate = selectedDate ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

  const handleCallPatient = async (appointmentId) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PatientJourneyPage.jsx:handleCallPatient',message:'handleCallPatient CALLED',data:{appointmentId,appointmentsLength:appointments.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    const appointment = appointments.find((a) => a.id === appointmentId);
    if (!appointment) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PatientJourneyPage.jsx:handleCallPatient',message:'handleCallPatient - appointment not found',data:{appointmentId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return;
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PatientJourneyPage.jsx:handleCallPatient',message:'Before callPatient',data:{appointmentId,currentStatus:appointment.status,consultorioId:appointment.consultorioId,roomId:appointment.roomId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    // Se já tem consultório definido, chamar direto
    if (appointment.consultorioId || appointment.roomId) {
      try {
        const result = callPatient(user, appointmentId, appointment.consultorioId || appointment.roomId);
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PatientJourneyPage.jsx:handleCallPatient',message:'After callPatient - result',data:{appointmentId,resultStatus:result?.status,resultCalledAt:result?.calledAt},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
        // Verificar se o resultado tem o status correto
        if (result && result.status !== APPOINTMENT_STATUS.EM_ATENDIMENTO) {
          console.error('Erro: callPatient retornou status incorreto:', result.status);
          showToast('Erro ao atualizar status do paciente.', 'error');
          return;
        }
        
        showToast('Paciente chamado para o consultório.');
        
        // Refresh imediato + após pequeno delay para garantir persistência
        refreshData();
        setTimeout(() => {
          refreshData();
        }, 200);
      } catch (err) {
        console.error('Erro ao chamar paciente:', err);
        showToast(err.message || 'Erro ao chamar paciente.', 'error');
      }
    } else {
      // Abrir modal para escolher consultório
      setCallRoomModal({ open: true, appointmentId });
    }
  };

  const handleCallWithRoom = (roomId) => {
    if (!callRoomModal.appointmentId) return;
    try {
      const result = callPatient(user, callRoomModal.appointmentId, roomId);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PatientJourneyPage.jsx:handleCallWithRoom',message:'After callPatient - result',data:{appointmentId:callRoomModal.appointmentId,roomId,resultStatus:result?.status,resultCalledAt:result?.calledAt},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // Verificar se o resultado tem o status correto
      if (result && result.status !== APPOINTMENT_STATUS.EM_ATENDIMENTO) {
        console.error('Erro: callPatient retornou status incorreto:', result.status);
        showToast('Erro ao atualizar status do paciente.', 'error');
        return;
      }
      
      showToast('Paciente chamado para o consultório.');
      setCallRoomModal({ open: false, appointmentId: null });
      setCustomRoomName('');
      
      // Refresh imediato + após pequeno delay para garantir persistência
      refreshData();
      setTimeout(() => {
        refreshData();
      }, 200);
    } catch (err) {
      console.error('Erro ao chamar paciente:', err);
      showToast(err.message || 'Erro ao chamar paciente.', 'error');
    }
  };

  const handleFinish = (appointmentId) => {
    try {
      finishAppointment(user, appointmentId);
      showToast('Atendimento finalizado.');
      refreshData();
    } catch (err) {
      showToast(err.message || 'Erro ao finalizar atendimento.', 'error');
    }
  };

  const handleReturnToWaiting = (appointmentId) => {
    if (!confirm('Deseja realmente voltar este paciente para a sala de espera?')) return;
    try {
      returnToWaiting(user, appointmentId);
      showToast('Paciente retornou para a sala de espera.');
      refreshData();
    } catch (err) {
      showToast(err.message || 'Erro ao retornar para espera.', 'error');
    }
  };

  const canCallPatient = user?.role === 'admin' || user?.role === 'gerente' || user?.role === 'profissional';
  const canFinishPatient = canCallPatient;
  const canReturnToWaiting = user?.role === 'admin' || user?.role === 'gerente';

  const dentists = useMemo(() => {
    const dentistIds = new Set(appointments.map((apt) => apt.professionalId).filter(Boolean));
    return Array.from(dentistIds)
      .map((id) => {
        const collab = db.collaborators.find((c) => c.id === id);
        return collab ? { id, name: collab.nomeCompleto || collab.name } : null;
      })
      .filter(Boolean);
  }, [appointments, db]);

  // Contadores devem usar appointments (total) e não filteredAppointments (já filtrado)
  const waitingCount = appointments.filter((a) => getJourneyStage(a) === JOURNEY_STAGE.SALA_ESPERA).length;
  const inProgressCount = appointments.filter((a) => getJourneyStage(a) === JOURNEY_STAGE.CONSULTORIO).length;
  const finishedCount = appointments.filter((a) => getJourneyStage(a) === JOURNEY_STAGE.FINALIZADO && a.date === selectedDate).length;

  return (
    <div className="patient-journey-page">
      {toast ? (
        <div className={`toast ${toast.type}`} role="status">
          {toast.message}
        </div>
      ) : null}

      {/* Header Premium */}
      <div className="patient-journey-header-premium">
        <div className="patient-journey-header-content">
          <h1 className="patient-journey-title-premium">Jornada do Paciente</h1>
          <p className="patient-journey-subtitle-premium">Gestão em tempo real da sala de espera e atendimentos</p>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="patient-journey-kpis-grid">
        <div className="patient-journey-kpi-card-premium">
          <div className="patient-journey-kpi-icon-premium patient-journey-kpi-icon-waiting">
            <Clock size={24} />
          </div>
          <div className="patient-journey-kpi-content">
            <div className="patient-journey-kpi-value-premium">{kpis.waitingCount}</div>
            <div className="patient-journey-kpi-label-premium">Em espera</div>
          </div>
        </div>
        <div className="patient-journey-kpi-card-premium">
          <div className="patient-journey-kpi-icon-premium patient-journey-kpi-icon-progress">
            <Activity size={24} />
          </div>
          <div className="patient-journey-kpi-content">
            <div className="patient-journey-kpi-value-premium">{kpis.inProgressCount}</div>
            <div className="patient-journey-kpi-label-premium">Em atendimento</div>
          </div>
        </div>
        <div className="patient-journey-kpi-card-premium">
          <div className="patient-journey-kpi-icon-premium patient-journey-kpi-icon-longest">
            <Users size={24} />
          </div>
          <div className="patient-journey-kpi-content">
            <div className="patient-journey-kpi-value-premium">
              {kpis.longestWait ? formatWaitTime(kpis.longestWait.time) : '00:00'}
            </div>
            <div className="patient-journey-kpi-label-premium">
              {kpis.longestWait ? formatPatientName(kpis.longestWait.name) : 'Maior espera'}
            </div>
          </div>
        </div>
        <div className="patient-journey-kpi-card-premium">
          <div className="patient-journey-kpi-icon-premium patient-journey-kpi-icon-avg">
            <Clock size={24} />
          </div>
          <div className="patient-journey-kpi-content">
            <div className="patient-journey-kpi-value-premium">{kpis.avgWaitMinutes} min</div>
            <div className="patient-journey-kpi-label-premium">Atraso médio hoje</div>
          </div>
        </div>
        {kpis.totalRooms > 0 && (
          <div className="patient-journey-kpi-card-premium">
            <div className="patient-journey-kpi-icon-premium patient-journey-kpi-icon-rooms">
              <Building2 size={24} />
            </div>
            <div className="patient-journey-kpi-content">
              <div className="patient-journey-kpi-value-premium">
                {kpis.occupiedRooms}/{kpis.totalRooms}
              </div>
              <div className="patient-journey-kpi-label-premium">Consultórios ocupados</div>
            </div>
          </div>
        )}
      </div>

      {/* Control Bar Premium */}
      <div className="patient-journey-control-bar">
        <div className="patient-journey-filter-wrapper patient-journey-date-wrapper">
          <Calendar size={18} className="patient-journey-filter-icon" />
          <input
            type="date"
            className="patient-journey-date-input"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value || today)}
            title={`Data do atendimento (${formattedSelectedDate || 'hoje'})`}
          />
          {selectedDate !== today && (
            <button
              type="button"
              className="patient-journey-date-today-btn"
              onClick={() => setSelectedDate(today)}
              title="Ver atendimentos de hoje"
            >
              Hoje
            </button>
          )}
        </div>
        <div className="patient-journey-search-wrapper">
          <Search size={18} className="patient-journey-search-icon" />
          <input
            type="text"
            className="patient-journey-search-input"
            placeholder="Buscar por nome ou telefone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {dentists.length > 0 && (
          <div className="patient-journey-filter-wrapper">
            <User size={18} className="patient-journey-filter-icon" />
            <select
              className="patient-journey-filter-select"
              value={filterDentist}
              onChange={(e) => setFilterDentist(e.target.value)}
            >
              <option value="">Todos os dentistas</option>
              {dentists.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {rooms.length > 0 && (
          <div className="patient-journey-filter-wrapper">
            <Building2 size={18} className="patient-journey-filter-icon" />
            <select
              className="patient-journey-filter-select"
              value={filterRoom}
              onChange={(e) => setFilterRoom(e.target.value)}
            >
              <option value="">Todos os consultórios</option>
              {rooms.filter((r) => r.active).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tabs Premium */}
      <div className="patient-journey-tabs-premium">
        <button
          type="button"
          className={`patient-journey-tab-premium ${activeTab === 'waiting' ? 'active' : ''}`}
          onClick={() => setActiveTab('waiting')}
        >
          <span>Sala de Espera</span>
          <span className="patient-journey-tab-badge">{waitingCount}</span>
        </button>
        <button
          type="button"
          className={`patient-journey-tab-premium ${activeTab === 'in_progress' ? 'active' : ''}`}
          onClick={() => setActiveTab('in_progress')}
        >
          <span>Em Atendimento</span>
          <span className="patient-journey-tab-badge">{inProgressCount}</span>
        </button>
        <button
          type="button"
          className={`patient-journey-tab-premium ${activeTab === 'finished' ? 'active' : ''}`}
          onClick={() => setActiveTab('finished')}
        >
          <span>{selectedDate === today ? 'Finalizados (Hoje)' : `Finalizados (${formattedSelectedDate})`}</span>
          <span className="patient-journey-tab-badge">{finishedCount}</span>
        </button>
      </div>

      {/* Lista de Pacientes - Card Based */}
      <div className="patient-journey-list-premium">
        {filteredAppointments.length === 0 ? (
          <div className="patient-journey-empty-premium">
            <Activity size={48} className="patient-journey-empty-icon" />
            <p className="patient-journey-empty-text">Nenhum paciente encontrado nesta seção.</p>
          </div>
        ) : (
          filteredAppointments.map((apt) => (
            <PatientJourneyCard
              key={apt.id}
              appointment={apt}
              now={now}
              activeTab={activeTab}
              getJourneyStage={getJourneyStage}
              updateJourneyStatus={updateJourneyStatus}
              canCall={canCallPatient}
              canFinish={canFinishPatient}
              canReturnToWaiting={canReturnToWaiting}
              onCall={() => handleCallPatient(apt.id)}
              onFinish={() => handleFinish(apt.id)}
              onReturnToWaiting={() => handleReturnToWaiting(apt.id)}
            />
          ))
        )}
      </div>

      {/* Modal de escolha de consultório */}
      {callRoomModal.open && (
        <div className="modal-backdrop" onClick={() => {
          setCallRoomModal({ open: false, appointmentId: null });
          setCustomRoomName('');
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Escolha o consultório</h3>
            <div className="modal-room-list">
              {rooms.filter((r) => r.active).length > 0 ? (
                rooms.filter((r) => r.active).map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    className="button primary"
                    onClick={() => handleCallWithRoom(room.id)}
                  >
                    {room.name}
                  </button>
                ))
              ) : (
                <div className="modal-room-custom">
                  <label>
                    Digite o nome da sala
                    <input
                      type="text"
                      className="search-input"
                      placeholder="Ex: Sala 01"
                      value={customRoomName}
                      onChange={(e) => setCustomRoomName(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => handleCallWithRoom(customRoomName.trim())}
                    disabled={!customRoomName.trim()}
                  >
                    Usar sala
                  </button>
                </div>
              )}
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setCallRoomModal({ open: false, appointmentId: null });
                  setCustomRoomName('');
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const PatientJourneyCard = memo(function PatientJourneyCard({
  appointment,
  now,
  activeTab,
  getJourneyStage,
  updateJourneyStatus,
  canCall,
  canFinish,
  canReturnToWaiting,
  onCall,
  onFinish,
  onReturnToWaiting,
}) {
  const navigate = useNavigate();
  const stage = getJourneyStage(appointment);
  const checkInAt = appointment.journeyCheckedInAt || appointment.checkInAt;
  const waitSeconds = getWaitTimeSeconds(checkInAt, now);
  const waitColor = getWaitTimeColor(waitSeconds);
  const waitTimeFormatted = checkInAt ? formatWaitTime(waitSeconds) : '—';
  const startedAt = appointment.journeyStartedAt || appointment.startedAt || appointment.journeyCalledAt || appointment.calledAt;
  const careSeconds = getWaitTimeSeconds(startedAt, now);
  const careTimeFormatted = startedAt ? formatWaitTime(careSeconds) : '—';

  const getStatusConfig = () => {
    if (stage === JOURNEY_STAGE.SALA_ESPERA) {
      if (waitColor === 'green') return { dot: '#10b981', badge: 'waiting-green' };
      if (waitColor === 'yellow') return { dot: '#f59e0b', badge: 'waiting-yellow' };
      return { dot: '#ef4444', badge: 'waiting-red', pulse: waitSeconds > 900 };
    }
    if (stage === JOURNEY_STAGE.CONSULTORIO) {
      return { dot: '#2563eb', badge: 'in-progress' };
    }
    if (stage === JOURNEY_STAGE.FINALIZADO) {
      return { dot: '#10b981', badge: 'finished' };
    }
    return { dot: '#94a3b8', badge: 'neutral' };
  };

  const statusConfig = getStatusConfig();
  const formatTime = (timeStr) => {
    if (!timeStr) return '—';
    try {
      const date = new Date(timeStr);
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    } catch {
      return '—';
    }
  };

  const getInitials = (name) => {
    if (!name) return 'P';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const patientInitials = getInitials(appointment.patientName);

  return (
    <div className={`patient-journey-card-premium ${statusConfig.pulse ? 'patient-journey-card-pulse' : ''}`}>
      {/* Avatar + Status Dot */}
      <div className="patient-journey-card-left">
        <div className="patient-journey-card-avatar">
          {patientInitials}
        </div>
        <div className="patient-journey-card-status-dot" style={{ background: statusConfig.dot }} />
      </div>

      {/* Content */}
      <div className="patient-journey-card-center">
        <div className="patient-journey-card-name-row">
          <h3 className="patient-journey-card-name-premium">{formatPatientName(appointment.patientName)}</h3>
          <span className={`patient-journey-card-badge patient-journey-card-badge--${statusConfig.badge}`}>
            {stage === JOURNEY_STAGE.SALA_ESPERA && 'Em Espera'}
            {stage === JOURNEY_STAGE.CONSULTORIO && 'Em Atendimento'}
            {stage === JOURNEY_STAGE.FINALIZADO && 'Finalizado'}
          </span>
        </div>
        <div className="patient-journey-card-meta">
          <span className="patient-journey-card-meta-item">
            <User size={14} />
            {appointment.professionalName}
          </span>
          <span className="patient-journey-card-meta-item">
            <Building2 size={14} />
            {appointment.consultorioName}
          </span>
          {appointment.phone && (
            <span className="patient-journey-card-meta-item">
              {formatPhoneDisplay(appointment.phone)}
            </span>
          )}
        </div>
        <div className="patient-journey-card-details">
          <span className="patient-journey-card-detail">{appointment.procedureName || 'Consulta'}</span>
          <span className="patient-journey-card-detail-sep">•</span>
          <span className="patient-journey-card-detail">
            {appointment.date} às {appointment.startTime}
          </span>
        </div>
      </div>

      {/* Timer + Ações sempre visíveis (lado direito) */}
      <div className="patient-journey-card-right patient-journey-card-actions-zone">
        {activeTab === 'waiting' && (
          <>
            <div className="patient-journey-card-timer-wrapper">
              <div className={`patient-journey-card-timer patient-journey-card-timer--${waitColor}`}>
                {waitTimeFormatted}
              </div>
            </div>
            <div className="patient-journey-card-actions">
              {stage === JOURNEY_STAGE.AGENDADOS && canCall && (
                <button
                  type="button"
                  className="patient-journey-card-action-btn patient-journey-card-action-btn--call"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateJourneyStatus(appointment.id, 'EM_ESPERA'); }}
                >
                  <Users size={18} />
                  Chamar p/ Sala de Espera
                </button>
              )}
              {stage === JOURNEY_STAGE.SALA_ESPERA && canCall && (
                <button
                  type="button"
                  className="patient-journey-card-action-btn patient-journey-card-action-btn--call"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCall?.(); }}
                >
                  <Bell size={18} />
                  Chamar p/ Consultório
                </button>
              )}
            </div>
          </>
        )}
        {activeTab === 'in_progress' && (
          <>
            <div className="patient-journey-card-timer-wrapper">
              <div className="patient-journey-card-timer patient-journey-card-timer--info">
                {careTimeFormatted}
              </div>
            </div>
            <div className="patient-journey-card-actions">
              <button
                type="button"
                className="patient-journey-card-action-btn patient-journey-card-action-btn--primary"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (appointment?.id) navigate(`/atendimento-clinico/${appointment.id}`);
                }}
              >
                <Clipboard size={18} />
                Atender Paciente
              </button>
              {canFinish && (
                <button
                  type="button"
                  className="patient-journey-card-action-btn patient-journey-card-action-btn--finish"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onFinish?.(); }}
                >
                  <CheckCircle2 size={18} />
                  Finalizar
                </button>
              )}
              {canReturnToWaiting && (
                <button
                  type="button"
                  className="patient-journey-card-action-btn patient-journey-card-action-btn--return"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReturnToWaiting?.(); }}
                >
                  Voltar para espera
                </button>
              )}
            </div>
          </>
        )}
        {activeTab === 'finished' && (
          <div className="patient-journey-card-timer-wrapper">
            <div className="patient-journey-card-time-label">Finalizado às</div>
            <div className="patient-journey-card-time-value">
              {formatTime(appointment.journeyFinishedAt || appointment.finishedAt)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}, function areEqual(prevProps, nextProps) {
  if (prevProps.activeTab !== nextProps.activeTab) return false;
  if (prevProps.getJourneyStage !== nextProps.getJourneyStage) return false;
  if (prevProps.updateJourneyStatus !== nextProps.updateJourneyStatus) return false;
  if (prevProps.canCall !== nextProps.canCall) return false;
  if (prevProps.canFinish !== nextProps.canFinish) return false;
  if (prevProps.canReturnToWaiting !== nextProps.canReturnToWaiting) return false;
  const prev = prevProps.appointment;
  const next = nextProps.appointment;
  if (!prev || !next) return false;
  if (prev.id !== next.id) return false;
  if (prev.status !== next.status) return false;
  if (prev.journeyStage !== next.journeyStage) return false;
  if (prev.journeyCheckedInAt !== next.journeyCheckedInAt) return false;
  if (prev.journeyCalledAt !== next.journeyCalledAt) return false;
  if (prev.journeyStartedAt !== next.journeyStartedAt) return false;
  if (prev.journeyFinishedAt !== next.journeyFinishedAt) return false;
  if (prev.checkInAt !== next.checkInAt) return false;
  if (prev.calledAt !== next.calledAt) return false;
  if (prev.startedAt !== next.startedAt) return false;
  if (prev.finishedAt !== next.finishedAt) return false;
  if (prev.consultorioId !== next.consultorioId) return false;
  if (prevProps.activeTab === 'waiting' || prevProps.activeTab === 'in_progress') {
    if (prevProps.now.getTime() === nextProps.now.getTime()) return true;
    return false;
  }
  return true;
});
