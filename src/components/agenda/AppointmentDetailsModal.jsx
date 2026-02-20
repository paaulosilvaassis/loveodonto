import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAppointmentDetails, updateAppointment, checkInAppointment, APPOINTMENT_STATUS } from '../../services/appointmentService.js';
import { AGENDA_CONFIG } from '../../utils/agendaConfig.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { suggestPatients } from '../../services/patientService.js';
import { getLeadById } from '../../services/crmService.js';
import { RegisterPatientFromLeadModal } from './RegisterPatientFromLeadModal.jsx';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { normalizeText } from '../../services/helpers.js';
import { onlyDigits } from '../../utils/validators.js';
import { loadDb } from '../../db/index.js';

export const AppointmentDetailsModal = ({ open, appointmentId, onClose, onReschedule, onUpdate }) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AppointmentDetailsModal.jsx:mount',message:'modal render',data:{open,appointmentId,hasAppointmentId:!!appointmentId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H6'})}).catch(()=>{});
  // #endregion
  const { user } = useAuth();
  const navigate = useNavigate();
  const [details, setDetails] = useState(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [showChangePatient, setShowChangePatient] = useState(false);
  const [patientQuery, setPatientQuery] = useState('');
  const [patientSuggestions, setPatientSuggestions] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [showRegisterFromLead, setShowRegisterFromLead] = useState(false);
  const suggestWrapRef = useRef(null);
  const debouncedQuery = useDebouncedValue(patientQuery, 400);

  useEffect(() => {
    if (open && appointmentId) {
      const data = getAppointmentDetails(appointmentId);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AppointmentDetailsModal.jsx:useEffect',message:'getAppointmentDetails result',data:{appointmentId,hasData:!!data,hasAppointment:!!data?.appointment,leadId:data?.appointment?.leadId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H6'})}).catch(()=>{});
      // #endregion
      setDetails(data);
      setShowReschedule(false);
      setIsEditing(false);
      setShowChangePatient(false);
      setPatientQuery('');
      setPatientSuggestions([]);
      setSuggestOpen(false);
      setShowRegisterFromLead(false);
      if (data?.appointment) {
        setDraft({
          status: data.appointment.status,
          patientId: data.appointment.patientId,
        });
      }
    }
  }, [open, appointmentId]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!suggestWrapRef.current || suggestWrapRef.current.contains(event.target)) return;
      setSuggestOpen(false);
    };
    if (showChangePatient) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showChangePatient]);

  const detectSearchType = (value) => {
    const digits = onlyDigits(value);
    if (digits.length >= 11) return 'cpf';
    if (digits.length >= 4) return 'phone';
    return 'name';
  };

  const suggestMinChars = (type) => {
    if (type === 'cpf') return 11;
    if (type === 'phone') return 4;
    return 2;
  };

  const normalizeSuggestQuery = (value, type) => {
    if (type === 'cpf' || type === 'phone') return onlyDigits(value);
    return normalizeText(value);
  };

  useEffect(() => {
    if (!showChangePatient) return;
    const type = detectSearchType(debouncedQuery);
    const normalized = normalizeSuggestQuery(debouncedQuery, type);
    const minChars = suggestMinChars(type);

    if (!normalized || normalized.length < minChars) {
      setPatientSuggestions([]);
      setSuggestOpen(false);
      setSuggestLoading(false);
      return;
    }

    setSuggestLoading(true);
    setSuggestOpen(true);

    try {
      const { results } = suggestPatients(type, normalized, 10);
      setPatientSuggestions(results);
    } catch {
      setPatientSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  }, [debouncedQuery, showChangePatient]);

  if (!open || !details) return null;

  const { appointment, patient, professional, room, phone, recordNumber, email } = details;
  const currentStatus = isEditing ? draft.status : appointment.status;
  const statusConfig = AGENDA_CONFIG.status[currentStatus] || AGENDA_CONFIG.status.agendado;
  
  // Determinar paciente atual (pode ter sido trocado no draft)
  const currentPatientId = isEditing && draft.patientId ? draft.patientId : appointment.patientId;
  let currentPatient = null;
  if (currentPatientId === appointment.patientId) {
    currentPatient = patient;
  } else if (isEditing && draft.patientId) {
    // Buscar novo paciente se foi trocado
    const db = loadDb();
    currentPatient = db.patients.find((p) => p.id === draft.patientId) || null;
  }

  const statusOptions = [
    { value: APPOINTMENT_STATUS.AGENDADO, label: 'Agendado' },
    { value: APPOINTMENT_STATUS.CONFIRMADO, label: 'Confirmado' },
    { value: APPOINTMENT_STATUS.EM_CONFIRMACAO, label: 'Em Confirmação' },
    { value: APPOINTMENT_STATUS.REAGENDAR, label: 'Reagendar' },
    { value: APPOINTMENT_STATUS.CANCELADO, label: 'Desmarcou' },
    { value: APPOINTMENT_STATUS.FALTOU, label: 'Falta' },
    { value: APPOINTMENT_STATUS.ATENDIDO, label: 'Concluído' },
  ];

  const handleStatusChange = (newStatus) => {
    if (newStatus === APPOINTMENT_STATUS.REAGENDAR) {
      // Se selecionar "Reagendar", atualizar draft e mostrar prompt
      setDraft((prev) => ({ ...prev, status: newStatus }));
      setShowReschedule(true);
      return;
    }
    setDraft((prev) => ({ ...prev, status: newStatus }));
  };

  const handleSave = () => {
    try {
      const updatePayload = {};
      if (draft.status && draft.status !== appointment.status) {
        // Se o status for "reagendar", não salvar diretamente - apenas abrir prompt
        if (draft.status === APPOINTMENT_STATUS.REAGENDAR) {
          setShowReschedule(true);
          return;
        }
        updatePayload.status = draft.status;
      }
      if (draft.patientId && draft.patientId !== appointment.patientId) {
        updatePayload.patientId = draft.patientId;
      }
      
      if (Object.keys(updatePayload).length > 0) {
        updateAppointment(user, appointment.id, updatePayload);
        if (onUpdate) {
          onUpdate();
        }
        // Recarregar detalhes após salvar
        const updatedData = getAppointmentDetails(appointmentId);
        if (updatedData) {
          setDetails(updatedData);
          setDraft({
            status: updatedData.appointment.status,
            patientId: updatedData.appointment.patientId,
          });
        }
      }
      setIsEditing(false);
      setShowChangePatient(false);
    } catch (err) {
      console.error('Erro ao salvar agendamento:', err);
    }
  };

  const handleSelectNewPatient = (newPatient) => {
    setDraft((prev) => ({ ...prev, patientId: newPatient.id }));
    setPatientQuery(newPatient.name || newPatient.full_name || '');
    setSuggestOpen(false);
    setShowChangePatient(false);
    // Buscar novo paciente para atualizar visualização imediata
    const db = loadDb();
    const newPatientData = db.patients.find((p) => p.id === newPatient.id);
    const newPatientPhones = db.patientPhones.filter((p) => p.patient_id === newPatient.id);
    const newPrimaryPhone = newPatientPhones.find((p) => p.is_primary) || newPatientPhones[0];
    const newPatientRecord = db.patientRecords.find((r) => r.patient_id === newPatient.id);
    
    if (newPatientData) {
      setDetails((prev) => ({
        ...prev,
        patient: newPatientData,
        phone: newPrimaryPhone || null,
        recordNumber: newPatientRecord?.record_number || null,
        email: newPatientData.email || null,
      }));
    }
  };

  const formatDateTime = () => {
    const date = new Date(`${appointment.date}T00:00:00`);
    const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${dateStr} às ${appointment.startTime}`;
  };

  const formatPhone = () => {
    if (!phone) return '—';
    return `(${phone.ddd}) ${phone.number}`;
  };

  const handleOpenChart = () => {
    navigate(`/prontuario/${appointment.patientId}`);
    onClose();
  };

  const handleCheckIn = () => {
    try {
      checkInAppointment(user, appointment.id);
      setToast({ message: 'Chegada confirmada. Paciente enviado para Jornada do Paciente.', type: 'success' });
      setTimeout(() => setToast(null), 3000);
      if (onUpdate) {
        onUpdate();
      }
      // Recarregar detalhes após check-in
      const updatedData = getAppointmentDetails(appointmentId);
      if (updatedData) {
        setDetails(updatedData);
        setDraft({
          status: updatedData.appointment.status,
          patientId: updatedData.appointment.patientId,
        });
      }
      // Navegar para Jornada do Paciente após 1 segundo
      setTimeout(() => {
        navigate(`/gestao-comercial/jornada-do-paciente?focus=${appointment.id}&toast=checkin`);
        onClose();
      }, 1000);
    } catch (err) {
      setToast({ message: err.message || 'Erro ao confirmar chegada.', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  const canCheckIn = [APPOINTMENT_STATUS.AGENDADO, APPOINTMENT_STATUS.CONFIRMADO].includes(appointment.status);
  const hasCheckedIn = appointment.checkInAt !== null && appointment.checkInAt !== undefined;

  const isLeadWithoutPatient = Boolean(appointment.leadId && !appointment.patientId);

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AppointmentDetailsModal.jsx:leadCheck',message:'lead state for Cadastrar paciente',data:{appointmentId:appointment?.id,leadId:appointment?.leadId,patientId:appointment?.patientId,isLeadWithoutPatient},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
  // #endregion

  const handleRescheduleYes = () => {
    setShowReschedule(false);
    // Atualizar status para "reagendar" antes de reagendar
    try {
      updateAppointment(user, appointment.id, { status: APPOINTMENT_STATUS.REAGENDAR });
      if (onUpdate) {
        onUpdate();
      }
      // Atualizar draft e detalhes
      setDraft((prev) => ({ ...prev, status: APPOINTMENT_STATUS.REAGENDAR }));
      const updatedData = getAppointmentDetails(appointmentId);
      if (updatedData) {
        setDetails(updatedData);
      }
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
    }
    if (onReschedule) {
      onReschedule({
        patientId: appointment.patientId,
        professionalId: appointment.professionalId,
        procedureName: appointment.procedureName,
        date: appointment.date,
        startTime: appointment.startTime,
      });
    }
    onClose();
  };

  const handleRescheduleNo = () => {
    setShowReschedule(false);
    // Reverter status para o anterior se estava editando
    if (isEditing) {
      setDraft((prev) => ({ ...prev, status: appointment.status }));
    }
  };

  const leadForRegister = appointment?.leadId ? getLeadById(appointment.leadId) : null;

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AppointmentDetailsModal.jsx:leadForRegister',message:'leadForRegister computed',data:{hasLeadForRegister:!!leadForRegister,leadId:appointment?.leadId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
  // #endregion

  const handleRegisterFromLeadSuccess = () => {
    const updatedData = getAppointmentDetails(appointmentId);
    if (updatedData) {
      setDetails(updatedData);
      setDraft({
        status: updatedData.appointment.status,
        patientId: updatedData.appointment.patientId,
      });
    }
    if (onUpdate) onUpdate();
  };

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AppointmentDetailsModal.jsx:render',message:'render with showRegisterFromLead',data:{showRegisterFromLead},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
  // #endregion

  return (
    <>
    <div className="appointment-details-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      {toast ? (
        <div className={`toast ${toast.type}`} role="status" style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000 }}>
          {toast.message}
        </div>
      ) : null}
      <div className="appointment-details-modal" onClick={(e) => e.stopPropagation()}>
        <div className="appointment-details-header">
          <div>
            <strong>Dados do Atendimento</strong>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="appointment-details-body">
          {isLeadWithoutPatient && (
            <div
              className="appointment-details-alert-lead"
              role="alert"
              style={{
                marginBottom: '1rem',
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                backgroundColor: '#fef3c7',
                border: '1px solid #f59e0b',
                color: '#92400e',
                fontSize: '0.875rem',
                lineHeight: 1.4,
              }}
            >
              <strong>Paciente não cadastrado.</strong>
              <br />
              Este paciente veio do Pipeline (CRM) e ainda não está vinculado ao cadastro. Cadastre o paciente abaixo para liberar edição do agendamento e confirmação de chegada.
            </div>
          )}
          {isLeadWithoutPatient && leadForRegister && (
            <div className="appointment-details-lead-actions" style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                className="button primary"
                onClick={(e) => {
                  e.stopPropagation();
                  // #region agent log
                  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AppointmentDetailsModal.jsx:buttonClick',message:'Cadastrar paciente clicked',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
                  // #endregion
                  setShowRegisterFromLead(true);
                }}
              >
                Cadastrar paciente
              </button>
            </div>
          )}
          <div className="appointment-details-list">
            <div className="appointment-detail-row">
              <span className="appointment-detail-label">Paciente</span>
              <div className="appointment-detail-value-group">
                {currentPatient ? (
                  <>
                    <div className="appointment-detail-patient-info">
                      {currentPatient.photo_url && (
                        <img
                          src={currentPatient.photo_url}
                          alt={currentPatient.full_name || currentPatient.nickname || currentPatient.social_name}
                          className="appointment-detail-patient-avatar"
                        />
                      )}
                      <span>
                        {currentPatient.full_name || currentPatient.nickname || currentPatient.social_name || 'Paciente'}
                      </span>
                    </div>
                    {isEditing && (
                      <button
                        type="button"
                        className="button-link"
                        onClick={() => {
                          setShowChangePatient(true);
                          setPatientQuery(currentPatient.full_name || currentPatient.nickname || currentPatient.social_name || '');
                        }}
                      >
                        Trocar paciente
                      </button>
                    )}
                  </>
                ) : appointment.patientId ? (
                  <>
                    <span className="appointment-detail-value">Paciente ID: {appointment.patientId}</span>
                    {isEditing && (
                      <button
                        type="button"
                        className="button-link"
                        onClick={() => setShowChangePatient(true)}
                      >
                        Trocar paciente
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="appointment-detail-value">Sem paciente vinculado</span>
                    {isEditing && (
                      <button
                        type="button"
                        className="button-link"
                        onClick={() => setShowChangePatient(true)}
                      >
                        Vincular paciente
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {showChangePatient && (
              <div className="appointment-change-patient" ref={suggestWrapRef}>
                <label>
                  Buscar paciente
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Digite o nome do paciente"
                    value={patientQuery}
                    onChange={(e) => setPatientQuery(e.target.value)}
                    onFocus={() => {
                      if (patientSuggestions.length > 0) setSuggestOpen(true);
                    }}
                  />
                  {suggestOpen && (
                    <div className="search-suggest-list" role="listbox">
                      {suggestLoading ? <div className="search-suggest-empty">Buscando...</div> : null}
                      {!suggestLoading && patientSuggestions.length === 0 ? (
                        <div className="search-suggest-empty">Nenhum paciente encontrado</div>
                      ) : null}
                      {!suggestLoading &&
                        patientSuggestions.map((item) => {
                          const patientName = item.name || item.full_name || item.nickname || item.social_name || 'Paciente';
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className="search-suggest-item"
                              onClick={() => handleSelectNewPatient(item)}
                            >
                              <div className="search-suggest-title">{patientName}</div>
                              {item.cpfMasked || item.cpf ? (
                                <div className="search-suggest-meta">CPF: {item.cpfMasked || item.cpf}</div>
                              ) : null}
                            </button>
                          );
                        })}
                    </div>
                  )}
                </label>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setShowChangePatient(false);
                    setPatientQuery('');
                    setSuggestOpen(false);
                  }}
                >
                  Cancelar
                </button>
              </div>
            )}

            <div className="appointment-detail-row">
              <span className="appointment-detail-label">Profissional</span>
              <span className="appointment-detail-value">
                {professional?.nomeCompleto || professional?.name || '—'}
              </span>
            </div>

            <div className="appointment-detail-row">
              <span className="appointment-detail-label">Atendimento / Procedimento</span>
              <span className="appointment-detail-value">{appointment.procedureName || '—'}</span>
            </div>

            <div className="appointment-detail-row">
              <span className="appointment-detail-label">Prontuário</span>
              <span className="appointment-detail-value">{recordNumber || '—'}</span>
            </div>

            <div className="appointment-detail-row">
              <span className="appointment-detail-label">E-mail</span>
              <span className="appointment-detail-value">{email || '—'}</span>
            </div>

            <div className="appointment-detail-row">
              <span className="appointment-detail-label">Telefone</span>
              <span className="appointment-detail-value">{formatPhone()}</span>
            </div>

            <div className="appointment-detail-row">
              <span className="appointment-detail-label">Convênio</span>
              <span className="appointment-detail-value">{appointment.insurance || '—'}</span>
            </div>

            <div className="appointment-detail-row">
              <span className="appointment-detail-label">Sala / Consultório</span>
              <span className="appointment-detail-value">{room?.name || '—'}</span>
            </div>

            <div className="appointment-detail-row">
              <span className="appointment-detail-label">Data e Hora</span>
              <span className="appointment-detail-value">{formatDateTime()}</span>
            </div>

            <div className="appointment-detail-row">
              <span className="appointment-detail-label">Status</span>
              {isEditing ? (
                <select
                  value={draft.status || appointment.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="appointment-detail-status-select"
                >
                  {statusOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={`appointment-detail-status appointment-detail-status--${statusConfig.badgeVariant || 'neutral'}`}>
                  {statusConfig.label || appointment.status}
                </span>
              )}
            </div>
          </div>

          {showReschedule ? (
            <div className="appointment-reschedule-prompt">
              <p className="appointment-reschedule-question">Deseja REAGENDAR uma próxima consulta?</p>
              <div className="appointment-reschedule-actions">
                <button type="button" className="button secondary" onClick={handleRescheduleNo}>
                  Não
                </button>
                <button type="button" className="button primary" onClick={handleRescheduleYes}>
                  Sim
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="appointment-details-footer">
          {isEditing ? (
            <>
              <button type="button" className="button secondary" onClick={() => {
                setIsEditing(false);
                setShowChangePatient(false);
                setDraft({ status: appointment.status, patientId: appointment.patientId });
              }}>
                Cancelar
              </button>
              <button type="button" className="button primary" onClick={handleSave}>
                Salvar
              </button>
            </>
          ) : (
            <>
              {canCheckIn && !hasCheckedIn ? (
                <button
                  type="button"
                  className="button primary"
                  onClick={handleCheckIn}
                  disabled={isLeadWithoutPatient}
                  title={isLeadWithoutPatient ? 'Cadastre o paciente antes de confirmar a chegada.' : undefined}
                >
                  ✔ Confirmar Chegada
                </button>
              ) : hasCheckedIn ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#047857', fontSize: '0.875rem' }}>
                  <span>✔</span>
                  <span>Chegada registrada às {appointment.checkInAt ? new Date(appointment.checkInAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : ''}</span>
                </div>
              ) : null}
              <button
                type="button"
                className="button secondary"
                onClick={() => setIsEditing(true)}
                disabled={isLeadWithoutPatient}
                title={isLeadWithoutPatient ? 'Cadastre o paciente antes de editar o agendamento.' : undefined}
              >
                Editar
              </button>
              {patient && (
                <button type="button" className="button secondary" onClick={handleOpenChart}>
                  Abrir Prontuário
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
      <RegisterPatientFromLeadModal
        open={showRegisterFromLead}
        onClose={() => setShowRegisterFromLead(false)}
        lead={leadForRegister}
        appointmentId={appointment?.id}
        user={user}
        onSuccess={handleRegisterFromLeadSuccess}
      />
    </>
  );
};
