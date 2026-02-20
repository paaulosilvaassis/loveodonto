import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { suggestPatients } from '../../services/patientService.js';
import { normalizeText } from '../../services/helpers.js';
import { onlyDigits } from '../../utils/validators.js';

export const AppointmentStep1PatientSearchModal = ({ open, slot, onClose, onContinue, selectedProfessionalId }) => {
  const navigate = useNavigate();
  const [patientQuery, setPatientQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientSuggestions, setPatientSuggestions] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [activeSuggestIndex, setActiveSuggestIndex] = useState(-1);
  const suggestWrapRef = useRef(null);
  const debouncedQuery = useDebouncedValue(patientQuery, 400);

  useEffect(() => {
    if (!open) {
      setPatientQuery('');
      setSelectedPatient(null);
      setPatientSuggestions([]);
      setSuggestOpen(false);
      return;
    }
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!suggestWrapRef.current || suggestWrapRef.current.contains(event.target)) return;
      setSuggestOpen(false);
      setActiveSuggestIndex(-1);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/components/agenda/AppointmentStep1PatientSearchModal.jsx:57',message:'search effect triggered',data:{debouncedQuery,patientQuery,open},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    const type = detectSearchType(debouncedQuery);
    const normalized = normalizeSuggestQuery(debouncedQuery, type);
    const minChars = suggestMinChars(type);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/components/agenda/AppointmentStep1PatientSearchModal.jsx:62',message:'search params calculated',data:{type,normalized,normalizedLength:normalized?.length,minChars},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion

    if (!normalized || normalized.length < minChars) {
      setPatientSuggestions([]);
      setSuggestOpen(false);
      setSuggestLoading(false);
      setActiveSuggestIndex(-1);
      return;
    }

    setSuggestLoading(true);
    setSuggestOpen(true);
    setActiveSuggestIndex(-1);

    try {
      const { results } = suggestPatients(type, normalized, 10);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/components/agenda/AppointmentStep1PatientSearchModal.jsx:75',message:'suggestPatients result',data:{resultsCount:results?.length,firstResult:results?.[0]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      setPatientSuggestions(results);
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/components/agenda/AppointmentStep1PatientSearchModal.jsx:78',message:'suggestPatients error',data:{error:err?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      setPatientSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  }, [debouncedQuery]);

  const handlePatientQueryChange = (value) => {
    setPatientQuery(value);
    setSelectedPatient(null);
  };

  const handleSelectPatient = (patient) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/components/agenda/AppointmentStep1PatientSearchModal.jsx:89',message:'patient selected',data:{patientId:patient?.id,patientName:patient?.name || patient?.full_name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    setSelectedPatient(patient);
    setPatientQuery(patient.name || patient.full_name || patient.nickname || patient.social_name || '');
    setSuggestOpen(false);
    setActiveSuggestIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (!suggestOpen || patientSuggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestIndex((prev) => (prev < patientSuggestions.length - 1 ? prev + 1 : prev));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (event.key === 'Enter' && activeSuggestIndex >= 0) {
      event.preventDefault();
      handleSelectPatient(patientSuggestions[activeSuggestIndex]);
    } else if (event.key === 'Escape') {
      setSuggestOpen(false);
      setActiveSuggestIndex(-1);
    }
  };

  const handleContinue = () => {
    if (!selectedPatient) return;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/components/agenda/AppointmentStep1PatientSearchModal.jsx:113',message:'handleContinue called',data:{hasSelectedPatient:!!selectedPatient,patientId:selectedPatient?.id,patientKeys:Object.keys(selectedPatient || {})},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    onContinue({
      appointmentType: 'consulta',
      patient: selectedPatient,
      slot,
    });
  };

  const formatSlotHeader = () => {
    if (!slot?.date || !slot?.time) return '';
    const date = new Date(`${slot.date}T00:00:00`);
    const weekday = date.toLocaleDateString('pt-BR', { weekday: 'long' });
    const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = slot.time;
    return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${dateStr} (${timeStr})`;
  };

  if (!open) return null;

  const canContinue = selectedPatient !== null;

  return (
    <div className="appointment-step1-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="appointment-step1-modal" onClick={(e) => e.stopPropagation()}>
        <div className="appointment-step1-header">
          <div>
            <div className="appointment-step1-slot">{formatSlotHeader()}</div>
            <strong>Novo Agendamento</strong>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="appointment-step1-body">
          <div className="appointment-step1-search" ref={suggestWrapRef}>
            <label>
              Nome do Paciente
              <input
                type="text"
                className="search-input"
                placeholder="Digite o nome do paciente"
                value={patientQuery}
                onChange={(event) => handlePatientQueryChange(event.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (patientSuggestions.length > 0) setSuggestOpen(true);
                }}
              />
              {suggestOpen && (
                <div className="search-suggest-list" role="listbox">
                  {suggestLoading ? <div className="search-suggest-empty">Buscando...</div> : null}
                  {!suggestLoading && patientSuggestions.length === 0 && debouncedQuery.length >= 3 ? (
                    <div className="search-suggest-empty-container">
                      <div className="search-suggest-empty">Nenhum paciente encontrado</div>
                      <button
                        type="button"
                        className="button button-primary search-suggest-create-patient"
                        onClick={() => {
                          const params = new URLSearchParams({
                            prefillName: patientQuery,
                            returnTo: 'agenda',
                            slotDate: slot?.date || '',
                            startTime: slot?.time || '',
                            professionalId: selectedProfessionalId || '',
                          });
                          navigate(`/pacientes/cadastro?${params.toString()}`);
                          onClose();
                        }}
                      >
                        Cadastrar novo paciente
                      </button>
                    </div>
                  ) : null}
                  {!suggestLoading && patientSuggestions.length === 0 && debouncedQuery.length < 3 ? (
                    <div className="search-suggest-empty">Digite pelo menos 3 caracteres para buscar</div>
                  ) : null}
                  {!suggestLoading &&
                    patientSuggestions.map((item, index) => {
                      // #region agent log
                      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/components/agenda/AppointmentStep1PatientSearchModal.jsx:196',message:'rendering suggestion item',data:{index,itemKeys:Object.keys(item),hasName:!!item.name,hasFullName:!!item.full_name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
                      // #endregion
                      const patientName = item.name || item.full_name || item.nickname || item.social_name || 'Paciente';
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`search-suggest-item ${index === activeSuggestIndex ? 'active' : ''}`}
                          onClick={() => handleSelectPatient(item)}
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
          </div>
        </div>

        <div className="appointment-step1-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Fechar
          </button>
          <button type="button" className="button primary" onClick={handleContinue} disabled={!canContinue}>
            Prosseguir
          </button>
        </div>
      </div>
    </div>
  );
};
