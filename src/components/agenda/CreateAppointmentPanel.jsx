import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addMinutesToTime, normalizeSlotCapacity } from '../../utils/agendaUtils.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { createPatientQuick, searchPatients, suggestPatients, resolveUserTenantId } from '../../services/patientService.js';
import { normalizeText } from '../../services/helpers.js';
import { formatCpf, isCpfValid, onlyDigits } from '../../utils/validators.js';
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

const buildDraft = (data) => ({
  patientId: '',
  professionalId: '',
  roomId: '',
  date: '',
  startTime: '',
  durationMinutes: 30,
  status: 'agendado',
  procedureName: '',
  insurance: '',
  channel: 'whatsapp',
  notes: '',
  ...data,
  slotCapacity: normalizeSlotCapacity(data?.slotCapacity),
});

export const CreateAppointmentPanel = ({
  open,
  mode,
  appointment,
  patientDirectory,
  professionals,
  rooms,
  durationOptions,
  statusOptions,
  channels,
  user,
  onPatientCreated,
  onClose,
  onSubmit,
  error,
}) => {
  const [draft, setDraft] = useState(buildDraft(appointment));
  const [patientQuery, setPatientQuery] = useState('');
  const navigate = useNavigate();
  const [patientSuggestions, setPatientSuggestions] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState('');
  const [activeSuggestIndex, setActiveSuggestIndex] = useState(-1);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickError, setQuickError] = useState('');
  const [cpfDuplicate, setCpfDuplicate] = useState(null);
  const [quickForm, setQuickForm] = useState({
    full_name: '',
    sex: '',
    social_name: '',
    birth_date: '',
    cpf: '',
  });
  const suggestWrapRef = useRef(null);
  const tenantId = resolveUserTenantId(user);

  useEffect(() => {
    setDraft(buildDraft(appointment));
    const selected = appointment?.patientId ? patientDirectory?.[appointment.patientId] : null;
    setPatientQuery(selected?.name || '');
    setPatientSuggestions([]);
    setSuggestOpen(false);
    setActiveSuggestIndex(-1);
    setSuggestError('');
    setShowQuickCreate(false);
    setQuickError('');
    setCpfDuplicate(null);
  }, [appointment, open, patientDirectory]);

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

  const debouncedQuery = useDebouncedValue(patientQuery, 300);
  const searchType = useMemo(() => detectSearchType(patientQuery), [patientQuery]);
  const normalizedQuery = useMemo(
    () => normalizeSuggestQuery(patientQuery, searchType),
    [patientQuery, searchType]
  );
  const noResults =
    !suggestLoading && patientSuggestions.length === 0 && normalizedQuery.length >= suggestMinChars(searchType);

  useEffect(() => {
    const type = detectSearchType(debouncedQuery);
    const normalized = normalizeSuggestQuery(debouncedQuery, type);
    const minChars = suggestMinChars(type);
    if (!normalized || normalized.length < minChars) {
      setPatientSuggestions([]);
      setSuggestOpen(false);
      setSuggestLoading(false);
      setSuggestError('');
      setActiveSuggestIndex(-1);
      return;
    }
    setSuggestLoading(true);
    setSuggestOpen(true);
    setSuggestError('');
    setActiveSuggestIndex(-1);
    try {
      const { results } = suggestPatients(type, normalized, 10, tenantId);
      setPatientSuggestions(results);
    } catch {
      setSuggestError('Falha ao buscar pacientes');
      setPatientSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  }, [debouncedQuery, tenantId]);

  const handleChange = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handlePatientQueryChange = (value) => {
    setPatientQuery(value);
    setDraft((prev) => ({ ...prev, patientId: '' }));
    setShowQuickCreate(false);
    setQuickError('');
    setCpfDuplicate(null);
  };

  const handleSelectPatient = (patient) => {
    const patientId = getPatientSuggestId(patient);
    if (!patientId) {
      setSuggestError('Paciente inválido. Selecione outro resultado da lista.');
      return;
    }
    setDraft((prev) => ({ ...prev, patientId }));
    setPatientQuery(getPatientSuggestLabel(patient));
    setSuggestOpen(false);
    setActiveSuggestIndex(-1);
    setSuggestError('');
  };

  const handlePatientKeyDown = (event) => {
    if (!suggestOpen || patientSuggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestIndex((prev) => (prev + 1 >= patientSuggestions.length ? 0 : prev + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestIndex((prev) => (prev - 1 < 0 ? patientSuggestions.length - 1 : prev - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = patientSuggestions[activeSuggestIndex] || patientSuggestions[0];
      if (target) handleSelectPatient(target);
    }
  };

  const handleOpenQuickCreate = () => {
    const type = detectSearchType(patientQuery);
    const prefillName = type === 'name' ? normalizeText(patientQuery) : '';
    setQuickForm((prev) => ({
      ...prev,
      full_name: prefillName || prev.full_name,
    }));
    setShowQuickCreate(true);
    setQuickError('');
    setCpfDuplicate(null);
  };

  const handleQuickChange = (field, value) => {
    setQuickForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleQuickCreate = () => {
    setQuickError('');
    setCpfDuplicate(null);
    const payload = {
      full_name: normalizeText(quickForm.full_name),
      sex: normalizeText(quickForm.sex),
      social_name: normalizeText(quickForm.social_name),
      birth_date: normalizeText(quickForm.birth_date),
      cpf: normalizeText(quickForm.cpf),
    };
    if (!payload.cpf) {
      setQuickError('CPF é obrigatório.');
      return;
    }
    if (!isCpfValid(payload.cpf)) {
      setQuickError('CPF inválido.');
      return;
    }
    const { exactMatch } = searchPatients('cpf', payload.cpf, tenantId);
    if (exactMatch) {
      setCpfDuplicate(exactMatch);
      setQuickError('⚠ Paciente já cadastrado');
      return;
    }
    try {
      const created = createPatientQuick(user, payload);
      const patientId = created.patientId || created.profile?.id;
      if (!patientId) throw new Error('ID do paciente inválido.');
      onPatientCreated?.();
      setDraft((prev) => ({ ...prev, patientId }));
      setPatientQuery(created.profile?.full_name || payload.full_name);
      setShowQuickCreate(false);
    } catch (err) {
      if (String(err?.message).includes('CPF já cadastrado')) {
        const { exactMatch: existing } = searchPatients('cpf', payload.cpf, tenantId);
        if (existing) {
          setCpfDuplicate(existing);
          setQuickError('⚠ Paciente já cadastrado');
          return;
        }
      }
      setQuickError(err.message || 'Falha ao cadastrar paciente.');
    }
  };

  const handleDurationChange = (value) => {
    const durationMinutes = Number(value);
    setDraft((prev) => ({
      ...prev,
      durationMinutes,
      endTime: prev.startTime ? addMinutesToTime(prev.startTime, durationMinutes) : prev.endTime,
    }));
  };

  const handleSave = (confirmAfter) => {
    if (!draft.patientId) {
      setSuggestError('Selecione um paciente para continuar.');
      return;
    }
    if (!draft.professionalId) {
      setSuggestError('Selecione um profissional para continuar.');
      return;
    }
    if (!draft.roomId) {
      setSuggestError('Selecione uma sala para continuar.');
      return;
    }
    if (!draft.date) {
      setSuggestError('Selecione uma data para continuar.');
      return;
    }
    if (!draft.startTime) {
      setSuggestError('Selecione um horário de início para continuar.');
      return;
    }
    setSuggestError('');
    onSubmit?.({ ...draft, confirmAfter });
  };

  const handleOpenChange = (next) => {
    if (!next) onClose();
  };

  return (
    <ModalRoot open={open} onOpenChange={handleOpenChange}>
      <ModalContent
        size="lg"
        className="agenda-panel"
        onInteractOutside={(event) => handleModalInteractOutside(event, null, true)}
        onPointerDownOutside={(event) => handleModalInteractOutside(event, null, true)}
      >
        <ModalHeader className="agenda-panel-header">
          <div>
            <ModalTitle>{mode === 'edit' ? 'Editar agendamento' : 'Novo agendamento'}</ModalTitle>
            <ModalDescription>Cadastro rápido, sem sair da agenda.</ModalDescription>
          </div>
        </ModalHeader>
        <ModalBody className="agenda-panel-body">
          {(error || suggestError) && (
            <div className="alert error" style={{ marginBottom: '1rem' }}>
              {error || suggestError}
            </div>
          )}
          <div className="agenda-panel-grid">
            <label className="search-suggest-wrap" ref={suggestWrapRef}>
              Paciente
              <input
                className="search-input"
                placeholder="Buscar por nome, CPF ou telefone"
                value={patientQuery}
                onChange={(event) => handlePatientQueryChange(event.target.value)}
                onKeyDown={handlePatientKeyDown}
                onFocus={() => {
                  if (patientSuggestions.length > 0) setSuggestOpen(true);
                }}
              />
              {suggestOpen ? (
                <div className="search-suggest-list" role="listbox">
                  {suggestLoading ? <div className="search-suggest-empty">Buscando...</div> : null}
                  {suggestError ? <div className="search-suggest-empty">{suggestError}</div> : null}
                  {!suggestLoading && !suggestError && patientSuggestions.length === 0 ? (
                    <div className="search-suggest-empty">Nenhum paciente encontrado</div>
                  ) : null}
                  {!suggestLoading && !suggestError
                    ? patientSuggestions.map((item, index) => (
                        <button
                          key={getPatientSuggestId(item) || `suggest-${index}`}
                          type="button"
                          className={`search-suggest-item ${index === activeSuggestIndex ? 'active' : ''}`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleSelectPatient(item);
                          }}
                        >
                          <div className="search-suggest-title">{getPatientSuggestLabel(item)}</div>
                          <div className="search-suggest-meta">
                            {item.phoneLabel || 'Telefone não informado'}
                            <span>•</span>
                            {item.cpfMasked || 'CPF não informado'}
                          </div>
                        </button>
                      ))
                    : null}
                  {noResults ? (
                    <button type="button" className="search-suggest-item" onClick={handleOpenQuickCreate}>
                      <div className="search-suggest-title">+ Cadastrar novo paciente</div>
                      <div className="search-suggest-meta">Cadastro rápido sem sair da agenda</div>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </label>
            <label>
              Profissional <span style={{ color: '#ef4444' }}>*</span>
              <select
                value={draft.professionalId}
                onChange={(event) => handleChange('professionalId', event.target.value)}
                required
              >
                <option value="">Selecione um profissional</option>
                {professionals.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} {item.specialty ? `- ${item.specialty}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sala
              <select value={draft.roomId} onChange={(event) => handleChange('roomId', event.target.value)}>
                <option value="">Selecione</option>
                {rooms.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data
              <input type="date" value={draft.date} onChange={(event) => handleChange('date', event.target.value)} />
            </label>
            <label>
              Início
              <input
                type="time"
                value={draft.startTime}
                onChange={(event) => handleChange('startTime', event.target.value)}
              />
            </label>
            <label>
              Duração
              <select value={draft.durationMinutes} onChange={(event) => handleDurationChange(event.target.value)}>
                {durationOptions.map((option) => (
                  <option key={option} value={option}>
                    {option} min
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={draft.status} onChange={(event) => handleChange('status', event.target.value)}>
                {statusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
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
            <label>
              Procedimento
              <input
                value={draft.procedureName}
                onChange={(event) => handleChange('procedureName', event.target.value)}
                placeholder="Ex: Avaliação, Implante"
              />
            </label>
            <label>
              Convênio
              <input
                value={draft.insurance}
                onChange={(event) => handleChange('insurance', event.target.value)}
                placeholder="Ex: Unimed, Particular"
              />
            </label>
            <label>
              Canal
              <select value={draft.channel} onChange={(event) => handleChange('channel', event.target.value)}>
                {channels.map((channel) => (
                  <option key={channel.value} value={channel.value}>
                    {channel.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="agenda-panel-notes">
              Observações
              <textarea value={draft.notes} onChange={(event) => handleChange('notes', event.target.value)} />
            </label>
          </div>
          {error ? <div className="error">{error}</div> : null}
          {showQuickCreate ? (
            <div className="agenda-quick-create">
              <div className="agenda-quick-header">
                <strong>Cadastro rápido de paciente</strong>
                <span className="muted">Complete os dados mínimos para agendar.</span>
              </div>
              {quickError ? <div className="alert warning">{quickError}</div> : null}
              {cpfDuplicate ? (
                <div className="agenda-quick-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => handleSelectPatient({
                      id: cpfDuplicate.id,
                      name: cpfDuplicate.full_name,
                      full_name: cpfDuplicate.full_name,
                    })}
                  >
                    Selecionar paciente existente
                  </button>
                </div>
              ) : null}
              <div className="agenda-quick-grid">
                <label>
                  Nome completo
                  <input
                    value={quickForm.full_name}
                    onChange={(event) => handleQuickChange('full_name', event.target.value)}
                  />
                </label>
                <label>
                  Sexo
                  <select value={quickForm.sex} onChange={(event) => handleQuickChange('sex', event.target.value)}>
                    <option value="">Selecione</option>
                    <option value="Feminino">Feminino</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Outro">Outro</option>
                  </select>
                </label>
                <label>
                  Nome social
                  <input
                    value={quickForm.social_name}
                    onChange={(event) => handleQuickChange('social_name', event.target.value)}
                  />
                </label>
                <label>
                  Data de nascimento
                  <input
                    type="date"
                    value={quickForm.birth_date}
                    onChange={(event) => handleQuickChange('birth_date', event.target.value)}
                  />
                </label>
                <label>
                  CPF
                  <input
                    value={formatCpf(quickForm.cpf)}
                    onChange={(event) => handleQuickChange('cpf', event.target.value)}
                  />
                </label>
              </div>
              <div className="agenda-quick-actions">
                <button type="button" className="button secondary" onClick={() => setShowQuickCreate(false)}>
                  Cancelar
                </button>
                <button type="button" className="button primary" onClick={handleQuickCreate}>
                  Salvar paciente
                </button>
              </div>
            </div>
          ) : null}
        </ModalBody>
        <ModalFooter className="agenda-panel-footer">
          {draft.patientId ? (
            <button type="button" className="button secondary" onClick={() => navigate(`/prontuario/${draft.patientId}`)}>
              Acessar prontuário
            </button>
          ) : null}
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="button secondary" onClick={() => handleSave(false)}>
            Salvar
          </button>
          <button type="button" className="button primary" onClick={() => handleSave(true)}>
            Salvar e confirmar
          </button>
        </ModalFooter>
      </ModalContent>
    </ModalRoot>
  );
};
