import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Calendar, Search, Filter } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { SectionCard } from '../components/SectionCard.jsx';
import FlowPatientList from '../components/flow/FlowPatientList.jsx';
import FlowSidebar from '../components/flow/FlowSidebar.jsx';
import FlowTopSummaryChips from '../components/flow/FlowTopSummaryChips.jsx';
import WhatsAppModal from '../components/flow/WhatsAppModal.jsx';
import CancelOrRescheduleModal from '../components/flow/CancelOrRescheduleModal.jsx';
import {
  fetchAppointmentsByDate,
  updateAppointmentStatus,
  logWhatsAppMessage,
  groupAppointmentsByCategory,
  computeSidebarCounts,
  getAppointmentCategory,
} from '../services/patientFlowService.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import {
  JOURNEY_STAGE,
  confirmArrival,
  sendToConsultingRoom,
  finishAppointment,
  cancelAppointment,
  markNoShow,
  getJourneyStageFromStatus,
} from '../services/journeyEntryService.js';
import { loadDb } from '../db/index.js';
import { queueMessage } from '../services/communicationService.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function PatientFlowPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [selectedDate, setSelectedDate] = useState(() => {
    return searchParams.get('date') || todayIso();
  });
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [filterProfessional, setFilterProfessional] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('agendados');
  const [activeSidebarFilter, setActiveSidebarFilter] = useState('all');
  const [whatsAppModal, setWhatsAppModal] = useState({ open: false, appointment: null });
  const [cancelModal, setCancelModal] = useState({ open: false, appointment: null });
  const [checkInModal, setCheckInModal] = useState({ open: false, query: '' });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadAppointments();
  }, [selectedDate]);


  useEffect(() => {
    const dateParam = searchParams.get('date');
    if (dateParam && dateParam !== selectedDate) {
      setSelectedDate(dateParam);
    }
  }, [searchParams]);

  const loadAppointments = () => {
    setLoading(true);
    try {
      const data = fetchAppointmentsByDate(selectedDate);
      setAppointments(data);
    } catch (error) {
      console.error('Erro ao carregar agendamentos:', error);
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  };

  const getStage = (appointment) => {
    return appointment?.journeyStage || getJourneyStageFromStatus(appointment?.status);
  };

  const filteredAppointments = useMemo(() => {
    let filtered = [...appointments];

    // Filtro por categoria
    if (selectedCategory) {
      const categories = groupAppointmentsByCategory(filtered);
      const category = categories.find((c) => c.key === selectedCategory);
      if (category) {
        filtered = category.appointments;
      }
    }

    // Filtro por tab
    if (activeTab === 'agendados') {
      filtered = filtered.filter((apt) => getStage(apt) === JOURNEY_STAGE.AGENDADOS);
    } else if (activeTab === 'espera') {
      filtered = filtered.filter((apt) => getStage(apt) === JOURNEY_STAGE.SALA_ESPERA);
    } else if (activeTab === 'consultorios') {
      filtered = filtered.filter((apt) => getStage(apt) === JOURNEY_STAGE.CONSULTORIO);
    } else if (activeTab === 'finalizados') {
      filtered = filtered.filter((apt) => getStage(apt) === JOURNEY_STAGE.FINALIZADO);
    } else if (activeTab === 'cancelados') {
      filtered = filtered.filter((apt) =>
        [JOURNEY_STAGE.CANCELADOS, JOURNEY_STAGE.FALTAS].includes(getStage(apt))
      );
    }

    // Filtro por sidebar
    if (activeSidebarFilter.startsWith('category:')) {
      const label = activeSidebarFilter.replace('category:', '');
      filtered = filtered.filter((apt) => getAppointmentCategory(apt) === label);
    } else if (activeSidebarFilter === 'desmarcados') {
      filtered = filtered.filter((apt) =>
        [APPOINTMENT_STATUS.CANCELADO, APPOINTMENT_STATUS.DESMARCOU].includes(apt.status)
      );
    } else if (activeSidebarFilter === 'pendencias') {
      filtered = filtered.filter((apt) => apt.pendingTitlesCount || apt.alertSummary);
    }

    // Filtro por profissional
    if (filterProfessional) {
      filtered = filtered.filter((apt) => apt.professionalId === filterProfessional);
    }

    // Filtro por status
    if (filterStatus) {
      filtered = filtered.filter((apt) => apt.status === filterStatus);
    }

    // Busca por nome/telefone
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((apt) => {
        const patientName = (apt.patient?.full_name || apt.patient?.nickname || '').toLowerCase();
        const phone = apt.phone ? `${apt.phone.ddd}${apt.phone.number}` : '';
        return patientName.includes(query) || phone.includes(query);
      });
    }

    // Ordenar por horário
    filtered.sort((a, b) => {
      const timeA = a.startTime || '';
      const timeB = b.startTime || '';
      return timeA.localeCompare(timeB);
    });

    return filtered;
  }, [
    appointments,
    selectedCategory,
    filterProfessional,
    filterStatus,
    searchQuery,
    activeTab,
    activeSidebarFilter,
  ]);

  const professionals = useMemo(() => {
    const db = loadDb();
    const professionalIds = new Set(appointments.map((a) => a.professionalId).filter(Boolean));
    return Array.from(professionalIds)
      .map((id) => {
        const collab = db.collaborators.find((c) => c.id === id);
        return collab ? { id, name: collab.nomeCompleto || collab.name } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [appointments]);

  const sidebarCounts = useMemo(() => computeSidebarCounts(appointments), [appointments]);

  const handleCheckIn = async (appointmentId) => {
    try {
      await confirmArrival(user, appointmentId);
      showToast('Chegada confirmada com sucesso');
      loadAppointments();
    } catch (error) {
      console.error('Erro ao confirmar chegada:', error);
      showToast(error.message || 'Erro ao confirmar chegada', 'error');
    }
  };

  const handleSendToConsultingRoom = async (appointmentId) => {
    try {
      const appointment = appointments.find((apt) => apt.id === appointmentId);
      if (!appointment) {
        throw new Error('Agendamento não encontrado');
      }
      await sendToConsultingRoom(user, appointmentId, appointment?.consultorioId || appointment?.roomId || null);
      showToast('Paciente enviado para o consultório');
      loadAppointments();
    } catch (error) {
      console.error('Erro ao enviar para consultório:', error);
      showToast(error.message || 'Erro ao enviar para consultório', 'error');
    }
  };

  const handleWhatsAppReminder = (appointment) => {
    setWhatsAppModal({ open: true, appointment });
  };

  const handleSendWhatsApp = async ({ appointmentId, patientId, templateId, messageContent }) => {
    try {
      // Registrar no log do CRM
      await logWhatsAppMessage(user, patientId, appointmentId, templateId, messageContent);
      
      // Enfileirar mensagem
      if (templateId) {
        await queueMessage(user, {
          patientId,
          appointmentId,
          templateId,
          channel: 'whatsapp',
        });
      }

      showToast('Mensagem WhatsApp enviada com sucesso');
    } catch (error) {
      console.error('Erro ao enviar WhatsApp:', error);
      throw error;
    }
  };

  const handleConfirm = async (appointmentId) => {
    try {
      await updateAppointmentStatus(user, appointmentId, APPOINTMENT_STATUS.CONFIRMADO);
      showToast('Agendamento confirmado');
      loadAppointments();
    } catch (error) {
      console.error('Erro ao confirmar:', error);
      showToast(error.message || 'Erro ao confirmar agendamento', 'error');
    }
  };

  const handleOpenChart = (patientId) => {
    if (patientId) {
      navigate(`/prontuario/${patientId}`);
    }
  };

  const handleCancel = async ({ appointmentId, reason, rescheduleNow }) => {
    try {
      await cancelAppointment(user, appointmentId, reason, rescheduleNow);
      showToast('Agendamento cancelado');
      loadAppointments();
    } catch (error) {
      console.error('Erro ao cancelar:', error);
      throw error;
    }
  };

  const handleOpenWhatsApp = (patientId) => {
    // Navegar para página de comunicação/CRM com thread do paciente
    navigate(`/comercial/chats?patientId=${patientId}`);
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleFinish = async (appointmentId) => {
    try {
      await finishAppointment(user, appointmentId);
      showToast('Atendimento finalizado');
      loadAppointments();
    } catch (error) {
      console.error('Erro ao finalizar:', error);
      showToast(error.message || 'Erro ao finalizar atendimento', 'error');
    }
  };

  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString('pt-BR', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch {
      return dateStr;
    }
  };

  const handleMarkNoShow = async (appointmentId) => {
    try {
      await markNoShow(user, appointmentId);
      showToast('Falta registrada');
      loadAppointments();
    } catch (error) {
      console.error('Erro ao marcar falta:', error);
      showToast(error.message || 'Erro ao marcar falta', 'error');
    }
  };

  const handleViewDetails = (appointmentId) => {
    navigate(`/gestao/agenda?appointmentId=${appointmentId}`);
  };

  const checkInCandidates = useMemo(() => {
    const base = appointments.filter((apt) =>
      [APPOINTMENT_STATUS.AGENDADO, APPOINTMENT_STATUS.EM_CONFIRMACAO, APPOINTMENT_STATUS.CONFIRMADO].includes(apt.status)
    );
    if (!checkInModal.query.trim()) return base;
    const q = checkInModal.query.toLowerCase();
    return base.filter((apt) => {
      const patientName = (apt.patient?.full_name || apt.patient?.nickname || '').toLowerCase();
      const phone = apt.phone ? `${apt.phone.ddd}${apt.phone.number}` : '';
      return patientName.includes(q) || phone.includes(q);
    });
  }, [appointments, checkInModal.query]);

  return (
    <div className="patient-flow-page">
      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          {toast.message}
        </div>
      )}

      <SectionCard>
        <div className="flow-compact-container">
          <div className="flow-compact-header">
            <div>
              <h1 className="flow-compact-title">Fluxo do Paciente</h1>
              <p className="flow-compact-subtitle">Painel operacional do dia para recepção.</p>
            </div>
            <div className="flow-compact-actions">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSearchParams({ date: e.target.value });
                }}
                className="flow-compact-date"
              />
              <button
                type="button"
                className="flow-compact-cta"
                onClick={() => setCheckInModal({ open: true, query: '' })}
              >
                Registrar Chegada
              </button>
            </div>
          </div>

          <div className="flow-compact-tabs">
            <button
              type="button"
              className={`flow-compact-tab ${activeTab === 'agendados' ? 'active' : ''}`}
              onClick={() => setActiveTab('agendados')}
            >
              Agendados Para Hoje
            </button>
            <button
              type="button"
              className={`flow-compact-tab ${activeTab === 'espera' ? 'active' : ''}`}
              onClick={() => setActiveTab('espera')}
            >
              Na Sala de Espera
            </button>
            <button
              type="button"
              className={`flow-compact-tab ${activeTab === 'consultorios' ? 'active' : ''}`}
              onClick={() => setActiveTab('consultorios')}
            >
              Nos Consultórios
            </button>
            <button
              type="button"
              className={`flow-compact-tab ${activeTab === 'finalizados' ? 'active' : ''}`}
              onClick={() => setActiveTab('finalizados')}
            >
              Finalizados
            </button>
            <button
              type="button"
              className={`flow-compact-tab ${activeTab === 'cancelados' ? 'active' : ''}`}
              onClick={() => setActiveTab('cancelados')}
            >
              Cancelados/Faltas
            </button>
          </div>

          <div className="flow-compact-filters">
            <div className="flow-filter-group flow-filter-search">
              <label className="flow-filter-label">
                <Search size={16} />
                Buscar
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nome ou telefone..."
                className="flow-filter-input"
              />
            </div>
            <div className="flow-filter-group">
              <label className="flow-filter-label">
                <Filter size={16} />
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="flow-filter-select"
              >
                <option value="">Todos</option>
                <option value={APPOINTMENT_STATUS.AGENDADO}>Agendado</option>
                <option value={APPOINTMENT_STATUS.CONFIRMADO}>Confirmado</option>
                <option value={APPOINTMENT_STATUS.CHEGOU}>Chegou</option>
                <option value={APPOINTMENT_STATUS.EM_ESPERA}>Em Espera</option>
                <option value={APPOINTMENT_STATUS.EM_ATENDIMENTO}>Em Atendimento</option>
                <option value={APPOINTMENT_STATUS.FINALIZADO}>Finalizado</option>
              </select>
            </div>
          </div>

          <FlowTopSummaryChips
            appointments={appointments}
            selectedCategory={selectedCategory}
            onSelect={setSelectedCategory}
          />

          <div className="flow-compact-body">
            <FlowSidebar
              counts={sidebarCounts}
              activeFilter={activeSidebarFilter}
              onFilterChange={setActiveSidebarFilter}
            />

            <div className="flow-compact-list">
              <div className="flow-list-header-compact">
                <h3>Agendamentos — {formatDate(selectedDate)}</h3>
                <span>{filteredAppointments.length} pacientes</span>
              </div>

              {loading ? (
                <div className="flow-loading">Carregando agendamentos...</div>
              ) : (
                <FlowPatientList
                  appointments={filteredAppointments}
                  onCheckIn={handleCheckIn}
                  onSendToConsultingRoom={handleSendToConsultingRoom}
                  onReminder={handleWhatsAppReminder}
                  onConfirm={handleConfirm}
                  onOpenChart={handleOpenChart}
                  onCancel={(appointment) => setCancelModal({ open: true, appointment })}
                  onOpenWhatsApp={handleOpenWhatsApp}
                  onFinish={handleFinish}
                  onReschedule={(appointment) => setCancelModal({ open: true, appointment })}
                  onNoShow={(appointment) => handleMarkNoShow(appointment.id)}
                  onViewDetails={(appointment) => handleViewDetails(appointment.id)}
                  user={user}
                />
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Modais */}
      <WhatsAppModal
        open={whatsAppModal.open}
        onClose={() => setWhatsAppModal({ open: false, appointment: null })}
        appointment={whatsAppModal.appointment}
        onSend={handleSendWhatsApp}
        user={user}
      />

      <CancelOrRescheduleModal
        open={cancelModal.open}
        onClose={() => setCancelModal({ open: false, appointment: null })}
        appointment={cancelModal.appointment}
        onCancel={handleCancel}
        onReschedule={() => {}}
        user={user}
      />

      {checkInModal.open ? (
        <div className="modal-backdrop" onClick={() => setCheckInModal({ open: false, query: '' })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Registrar Chegada</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setCheckInModal({ open: false, query: '' })}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label>Buscar paciente</label>
                <input
                  type="text"
                  value={checkInModal.query}
                  onChange={(e) => setCheckInModal((prev) => ({ ...prev, query: e.target.value }))}
                  placeholder="Nome ou telefone..."
                />
              </div>
              <div className="flow-checkin-list">
                {checkInCandidates.length === 0 ? (
                  <div className="flow-checkin-empty">Nenhum agendamento elegível.</div>
                ) : (
                  checkInCandidates.map((apt) => (
                    <button
                      key={apt.id}
                      type="button"
                      className="flow-checkin-item"
                      onClick={async () => {
                        await handleCheckIn(apt.id);
                        setCheckInModal({ open: false, query: '' });
                      }}
                    >
                      <span>{apt.patient?.full_name || apt.patient?.nickname || 'Paciente'}</span>
                      <span>{apt.startTime}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => setCheckInModal({ open: false, query: '' })}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
