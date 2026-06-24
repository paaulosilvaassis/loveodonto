import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { suggestPatients, resolveUserTenantId } from '../../services/patientService.js';
import { normalizeText } from '../../services/helpers.js';
import { onlyDigits } from '../../utils/validators.js';
import {
  getPatientSuggestId,
  getPatientSuggestLabel,
  handleModalInteractOutside,
} from '../../utils/patientSuggestHelpers.js';
import {
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalRoot,
  ModalTitle,
  ModalDescription,
} from '../ui/Modal.jsx';

const PROCEED_ERROR = 'Selecione um paciente cadastrado na lista antes de prosseguir.';

export const AppointmentStep1PatientSearchModal = ({ open, slot, onClose, onContinue, selectedProfessionalId }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantId = resolveUserTenantId(user);
  const [patientQuery, setPatientQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientSuggestions, setPatientSuggestions] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [activeSuggestIndex, setActiveSuggestIndex] = useState(-1);
  const [searchError, setSearchError] = useState('');
  const suggestWrapRef = useRef(null);
  const debouncedQuery = useDebouncedValue(patientQuery, 300);

  useEffect(() => {
    if (!open) {
      setPatientQuery('');
      setSelectedPatient(null);
      setPatientSuggestions([]);
      setSuggestOpen(false);
      setSearchError('');
      setActiveSuggestIndex(-1);
    }
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!suggestWrapRef.current?.contains(event.target)) {
        setSuggestOpen(false);
        setActiveSuggestIndex(-1);
      }
    };
    if (!open) return undefined;
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

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

  const searchType = detectSearchType(patientQuery);
  const minChars = suggestMinChars(searchType);
  const queryReady = normalizeSuggestQuery(patientQuery, searchType).length >= minChars;

  useEffect(() => {
    if (!open) return;

    const type = detectSearchType(debouncedQuery);
    const normalized = normalizeSuggestQuery(debouncedQuery, type);
    const min = suggestMinChars(type);

    if (!normalized || normalized.length < min) {
      setPatientSuggestions([]);
      if (!selectedPatient) setSuggestOpen(false);
      setSuggestLoading(false);
      setActiveSuggestIndex(-1);
      return;
    }

    setSuggestLoading(true);
    setSuggestOpen(true);
    setActiveSuggestIndex(-1);

    try {
      const { results } = suggestPatients(type, normalized, 10, tenantId);
      setPatientSuggestions(results);
      setSearchError('');
    } catch {
      setPatientSuggestions([]);
      setSearchError('Não foi possível buscar pacientes. Tente novamente.');
    } finally {
      setSuggestLoading(false);
    }
  }, [debouncedQuery, tenantId, open, selectedPatient]);

  const handlePatientQueryChange = (value) => {
    setPatientQuery(value);
    setSelectedPatient(null);
    setSearchError('');
    const type = detectSearchType(value);
    const normalized = normalizeSuggestQuery(value, type);
    if (normalized.length >= suggestMinChars(type)) {
      setSuggestOpen(true);
    }
  };

  const handleSelectPatient = (patient) => {
    const patientId = getPatientSuggestId(patient);
    if (!patientId) {
      setSearchError('Paciente inválido. Selecione outro resultado da lista.');
      return;
    }
    const label = getPatientSuggestLabel(patient);
    setSelectedPatient({
      ...patient,
      id: patientId,
      name: label,
      full_name: patient.full_name || label,
    });
    setPatientQuery(label);
    setSuggestOpen(false);
    setActiveSuggestIndex(-1);
    setSearchError('');
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (suggestOpen && activeSuggestIndex >= 0 && patientSuggestions[activeSuggestIndex]) {
        handleSelectPatient(patientSuggestions[activeSuggestIndex]);
        return;
      }
      if (selectedPatient && getPatientSuggestId(selectedPatient)) {
        handleContinue();
      } else {
        setSearchError(PROCEED_ERROR);
      }
      return;
    }
    if (!suggestOpen || patientSuggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestIndex((prev) => (prev < patientSuggestions.length - 1 ? prev + 1 : prev));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (event.key === 'Escape') {
      setSuggestOpen(false);
      setActiveSuggestIndex(-1);
    }
  };

  const handleContinue = () => {
    const patientId = getPatientSuggestId(selectedPatient);
    if (!patientId) {
      setSearchError(PROCEED_ERROR);
      return;
    }
    setSearchError('');
    onContinue({
      appointmentType: 'consulta',
      patient: { ...selectedPatient, id: patientId },
      slot,
    });
  };

  const formatSlotHeader = () => {
    if (!slot?.date || !slot?.time) return '';
    const date = new Date(`${slot.date}T00:00:00`);
    const weekday = date.toLocaleDateString('pt-BR', { weekday: 'long' });
    const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${dateStr} (${slot.time})`;
  };

  const handleOpenChange = (next) => {
    if (!next) onClose();
  };

  const showDropdown = open && suggestOpen && queryReady;
  const noResults = !suggestLoading && patientSuggestions.length === 0 && queryReady;

  return (
    <ModalRoot open={open} onOpenChange={handleOpenChange}>
      <ModalContent
        size="md"
        className="appointment-step1-modal"
        onInteractOutside={(event) => handleModalInteractOutside(event, null, true)}
        onPointerDownOutside={(event) => handleModalInteractOutside(event, null, true)}
      >
        <ModalHeader className="appointment-step1-header">
          <div>
            <ModalDescription className="appointment-step1-slot">{formatSlotHeader()}</ModalDescription>
            <ModalTitle>Novo Agendamento</ModalTitle>
          </div>
        </ModalHeader>

        <ModalBody className="appointment-step1-body">
          {searchError ? (
            <div className="alert error" role="alert" style={{ marginBottom: '0.75rem' }}>
              {searchError}
            </div>
          ) : null}

          <div className="appointment-step1-search search-suggest-wrap" ref={suggestWrapRef}>
            <label>
              Nome do Paciente
              <input
                type="text"
                className="search-input"
                placeholder="Buscar por nome, telefone ou CPF"
                value={patientQuery}
                onChange={(event) => handlePatientQueryChange(event.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (queryReady) setSuggestOpen(true);
                }}
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={showDropdown}
                aria-controls="appointment-step1-suggest-list"
              />
            </label>

            {selectedPatient && getPatientSuggestId(selectedPatient) ? (
              <p className="appointment-step1-selected" role="status">
                Paciente selecionado: <strong>{getPatientSuggestLabel(selectedPatient)}</strong>
              </p>
            ) : (
              <p className="appointment-step1-hint muted">
                Digite pelo menos 2 letras e clique no paciente na lista.
              </p>
            )}

            {showDropdown ? (
              <div
                id="appointment-step1-suggest-list"
                className="search-suggest-list"
                role="listbox"
              >
                {suggestLoading ? (
                  <div className="search-suggest-empty">Buscando...</div>
                ) : null}

                {!suggestLoading && noResults ? (
                  <div className="search-suggest-empty-container">
                    <div className="search-suggest-empty">Nenhum paciente encontrado</div>
                    <button
                      type="button"
                      className="button button-primary search-suggest-create-patient"
                      onMouseDown={(event) => event.preventDefault()}
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
                      + Cadastrar novo paciente
                    </button>
                  </div>
                ) : null}

                {!suggestLoading
                  ? patientSuggestions.map((item, index) => {
                    const patientName = getPatientSuggestLabel(item);
                    const patientKey = getPatientSuggestId(item) || `suggest-${index}`;
                    const isSelected = getPatientSuggestId(selectedPatient) === getPatientSuggestId(item);
                    return (
                      <button
                        key={patientKey}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={`search-suggest-item ${index === activeSuggestIndex ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleSelectPatient(item);
                        }}
                      >
                        <div className="search-suggest-title">{patientName}</div>
                        <div className="search-suggest-meta">
                          {item.phoneLabel ? <span>{item.phoneLabel}</span> : null}
                          {item.phoneLabel && (item.cpfMasked || item.cpf) ? <span> • </span> : null}
                          {item.cpfMasked || item.cpf ? (
                            <span>CPF: {item.cpfMasked || item.cpf}</span>
                          ) : (
                            !item.phoneLabel ? <span>Sem telefone/CPF cadastrado</span> : null
                          )}
                        </div>
                      </button>
                    );
                  })
                  : null}
              </div>
            ) : null}
          </div>
        </ModalBody>

        <ModalFooter className="appointment-step1-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Fechar
          </button>
          <button type="button" className="button primary" onClick={handleContinue}>
            Prosseguir
          </button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
};
