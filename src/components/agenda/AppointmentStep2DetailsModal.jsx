import { useEffect, useState } from 'react';
import { getPatient } from '../../services/patientService.js';
import { getProfessionalOptions } from '../../services/collaboratorService.js';
import { loadDb } from '../../db/index.js';
import { addMinutesToTime } from '../../utils/agendaUtils.js';

export const AppointmentStep2DetailsModal = ({
  open,
  step1Data,
  selectedProfessionalId,
  onClose,
  onSubmit,
  error,
}) => {
  const [draft, setDraft] = useState({
    patientId: '',
    professionalId: selectedProfessionalId || '',
    roomId: '',
    date: '',
    startTime: '',
    endTime: '',
    durationMinutes: 30,
    procedureName: '',
    notes: '',
    insurance: '',
    slotCapacity: 1,
  });
  const [patientData, setPatientData] = useState(null);
  const [professionals, setProfessionals] = useState([]);
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    if (!open || !step1Data) return;

    const db = loadDb();
    const professionalsList = getProfessionalOptions();
    setProfessionals(professionalsList);
    setRooms(db.rooms || []);

    const slot = step1Data.slot;
    const endTime = slot?.endTime || (slot?.time ? addMinutesToTime(slot.time, 30) : '');

    const initialDraft = {
      patientId: step1Data.patient?.id || '',
      professionalId: selectedProfessionalId || professionalsList[0]?.id || '',
      roomId: db.rooms?.[0]?.id || '',
      date: slot?.date || '',
      startTime: slot?.time || '',
      endTime,
      durationMinutes: 30,
      procedureName: '',
      notes: '',
      insurance: '',
      slotCapacity: 1,
    };

    setDraft(initialDraft);

    if (step1Data.patient?.id) {
      const patient = getPatient(step1Data.patient.id);
      setPatientData(patient);
      if (patient?.insurances?.[0]) {
        setDraft((prev) => ({ ...prev, insurance: patient.insurances[0].name || '' }));
      }
      // Garantir que o patientId está no draft
      setDraft((prev) => ({ ...prev, patientId: step1Data.patient.id }));
    } else {
      setPatientData(null);
    }
  }, [open, step1Data, selectedProfessionalId]);

  const handleChange = (field, value) => {
    setDraft((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === 'startTime' || field === 'durationMinutes') {
        const start = field === 'startTime' ? value : updated.startTime;
        const duration = field === 'durationMinutes' ? Number(value) : updated.durationMinutes;
        updated.endTime = addMinutesToTime(start, duration);
      }
      return updated;
    });
  };

  const handleSubmit = () => {
    if (!draft.professionalId) {
      return;
    }
    if (step1Data.appointmentType === 'consulta' && !draft.patientId) {
      return;
    }
    onSubmit(draft);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(`${dateStr}T00:00:00`);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatBirthDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const primaryPhone = patientData?.phones?.find((p) => p.is_primary) || patientData?.phones?.[0];

  if (!open || !step1Data) return null;

  return (
    <div className="appointment-step2-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="appointment-step2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="appointment-step2-header">
          <div>
            <strong>Novo Agendamento</strong>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="appointment-step2-body">
          {error && <div className="alert error" style={{ marginBottom: '1rem' }}>{error}</div>}

          {step1Data.appointmentType === 'consulta' && patientData && (
            <div className="appointment-step2-section">
              <div className="appointment-step2-section-title">Paciente</div>
              <div className="appointment-step2-patient-card">
                <div className="appointment-step2-patient-avatar">
                  {patientData.profile?.photo_url ? (
                    <img src={patientData.profile.photo_url} alt={patientData.profile.full_name} />
                  ) : (
                    <span>
                      {(patientData.profile?.full_name || patientData.profile?.nickname || 'P')
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="appointment-step2-patient-info">
                  <div className="appointment-step2-patient-name">
                    {patientData.profile?.full_name ||
                      patientData.profile?.nickname ||
                      patientData.profile?.social_name ||
                      'Paciente'}
                  </div>
                  {patientData.profile?.email && (
                    <div className="appointment-step2-patient-email">{patientData.profile.email}</div>
                  )}
                  {patientData.birth?.birth_date && (
                    <div className="appointment-step2-patient-birth">
                      Nascimento: {formatBirthDate(patientData.birth.birth_date)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {step1Data.appointmentType === 'consulta' && patientData && primaryPhone && (
            <div className="appointment-step2-section">
              <div className="appointment-step2-section-title">Telefones</div>
              <div className="appointment-step2-phone">
                ({primaryPhone.ddd}) {primaryPhone.number}
                {primaryPhone.is_primary && <span className="appointment-step2-phone-primary">Principal</span>}
              </div>
            </div>
          )}

          <div className="appointment-step2-section">
            <div className="appointment-step2-section-title">Data e Horário</div>
            <div className="appointment-step2-grid">
              <label>
                Data
                <input type="date" value={draft.date} onChange={(e) => handleChange('date', e.target.value)} />
              </label>
              <label>
                Início
                <input
                  type="time"
                  value={draft.startTime}
                  onChange={(e) => handleChange('startTime', e.target.value)}
                />
              </label>
              <label>
                Fim
                <input type="time" value={draft.endTime} onChange={(e) => handleChange('endTime', e.target.value)} />
              </label>
              <label>
                Duração
                <select
                  value={draft.durationMinutes}
                  onChange={(e) => handleChange('durationMinutes', Number(e.target.value))}
                >
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min</option>
                  <option value={90}>90 min</option>
                  <option value={120}>120 min</option>
                </select>
              </label>
              <label className="agenda-panel-toggle">
                <input
                  type="checkbox"
                  checked={Number(draft.slotCapacity) === 2}
                  onChange={(event) => handleChange('slotCapacity', event.target.checked ? 2 : 1)}
                />
                Permitir encaixe (até 2 no mesmo horário)
                <span
                  className="agenda-panel-toggle-hint"
                  title="Permite até 2 atendimentos no mesmo horário para este profissional/sala."
                >
                  ⓘ
                </span>
              </label>
            </div>
          </div>

          <div className="appointment-step2-section">
            <div className="appointment-step2-section-title">Tipo de Atendimento</div>
            <label>
              <select value={draft.procedureName} onChange={(e) => handleChange('procedureName', e.target.value)}>
                <option value="">Selecione</option>
                <option value="Consulta">Consulta</option>
                <option value="Avaliação">Avaliação</option>
                <option value="Tratamento">Tratamento</option>
                <option value="Retorno">Retorno</option>
                <option value="Emergência">Emergência</option>
                <option value="Outro">Outro</option>
              </select>
            </label>
          </div>

          <div className="appointment-step2-section">
            <div className="appointment-step2-section-title">Dentista / Profissional</div>
            <label>
              <select
                value={draft.professionalId}
                onChange={(e) => handleChange('professionalId', e.target.value)}
                required
              >
                <option value="">Selecione</option>
                {professionals.map((prof) => (
                  <option key={prof.id} value={prof.id}>
                    {prof.name} {prof.specialty ? `- ${prof.specialty}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {rooms.length > 0 && (
            <div className="appointment-step2-section">
              <div className="appointment-step2-section-title">Sala / Consultório</div>
              <label>
                <select value={draft.roomId} onChange={(e) => handleChange('roomId', e.target.value)}>
                  <option value="">Selecione</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {step1Data.appointmentType === 'consulta' && (
            <div className="appointment-step2-section">
              <div className="appointment-step2-section-title">Convênio</div>
              <label>
                <input
                  type="text"
                  value={draft.insurance}
                  onChange={(e) => handleChange('insurance', e.target.value)}
                  placeholder="Ex: Unimed, Particular"
                />
              </label>
            </div>
          )}

          <div className="appointment-step2-section">
            <div className="appointment-step2-section-title">Descrição Complementar</div>
            <label>
              <textarea
                value={draft.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Observações adicionais sobre o agendamento"
                rows={4}
              />
            </label>
          </div>
        </div>

        <div className="appointment-step2-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Fechar
          </button>
          <button
            type="button"
            className="button primary"
            onClick={handleSubmit}
            disabled={!draft.professionalId || (step1Data.appointmentType === 'consulta' && !draft.patientId)}
          >
            Salvar Agendamento
          </button>
        </div>
      </div>
    </div>
  );
};
