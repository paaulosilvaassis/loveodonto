import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, FileText, ClipboardList, Edit } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { Section } from '../components/Section.jsx';
import { Tabs } from '../components/Tabs.jsx';
import { FormRow } from '../components/FormRow.jsx';
import { SectionCard } from '../components/SectionCard.jsx';
import { SectionHeaderActions } from '../components/SectionHeaderActions.jsx';
import SearchInputWithSelect from '../components/SearchInputWithSelect.jsx';
import ActionCard from '../components/ActionCard.jsx';
import GradientButton from '../components/GradientButton.jsx';
import { loadDb } from '../db/index.js';
import { can } from '../permissions/permissions.js';
import { canManageAccess } from '../services/accessService.js';
import ImportExportButtons from '../components/ImportExportButtons.jsx';
import {
  addPatientAddress,
  addPatientInsurance,
  addPatientPhone,
  getPatient,
  mergePatientActivity,
  removePatientAddress,
  removePatientInsurance,
  removePatientPhone,
  searchPatients,
  suggestPatients,
  updatePatientPhone,
  updatePatientAccess,
  updatePatientBirth,
  updatePatientDocuments,
  updatePatientEducation,
  updatePatientProfile,
  updatePatientRelationships,
  updatePatientStatus,
  uploadPatientPhoto,
} from '../services/patientService.js';
import { useCepAutofill } from '../hooks/useCepAutofill.js';
import { formatCep, formatCpf, formatPhone, onlyDigits, validateFileMeta } from '../utils/validators.js';

const normalizeText = (value) => (value || '').trim();
const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
const phoneTypeLabels = {
  whatsapp: 'WhatsApp',
  celular: 'Celular',
  residencial: 'Residencial',
  comercial: 'Comercial',
  outro: 'Outro',
};

const cadastroSections = [
  'Dados Principais',
  'Documentações',
  'Naturalidade',
  'Formação',
  'Telefones',
  'Endereços',
  'Relacionamentos',
  'Convênios',
  'Dados de Acesso',
  'Situação do Cadastro',
];

const searchOptions = [
  { value: 'name', label: 'Nome' },
  { value: 'cpf', label: 'CPF' },
  { value: 'phone', label: 'Telefone' },
];

const defaultDraft = {
  profile: {},
  documents: {},
  birth: {},
  education: {},
  phones: [],
  addresses: [],
  relationships: {},
  insurances: [],
  access: {},
  activity: {},
  newPhone: { type: '', ddd: '', number: '', is_whatsapp: false, is_primary: false },
  newAddress: { type: '', cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '', is_primary: false },
  newInsurance: { insurance_name: '', plan_name: '', membership_number: '', validity: '', is_holder: true, company_partner: '', extra_data: '' },
};


const emptyPhoneForm = () => ({
  id: '',
  type: '',
  ddd: '',
  number: '',
  is_whatsapp: false,
  is_primary: false,
});

export default function PatientsPage() {
  const { user } = useAuth();
  const location = useLocation();
  const [dbSnapshot, setDbSnapshot] = useState(() => loadDb());
  const [searchType, setSearchType] = useState('name');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSummary, setSearchSummary] = useState([]);
  const [exactMatch, setExactMatch] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [activeSuggestIndex, setActiveSuggestIndex] = useState(-1);

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientsPage.jsx:108',message:'PatientsPage mount',data:{pathname:location.pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
  }, [location.pathname]);
  const [selectedId, setSelectedId] = useState('');
  const [activeSection, setActiveSection] = useState('Dados Principais');
  const [editingSection, setEditingSection] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [toast, setToast] = useState(null);
  const [draft, setDraft] = useState(defaultDraft);
  const [dependentsText, setDependentsText] = useState('');
  const [phoneForm, setPhoneForm] = useState(emptyPhoneForm());
  const searchInputRef = useRef(null);
  const suggestWrapRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const suggestTimeoutRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const autoSearchTimeoutRef = useRef(null);
  const photoInputRef = useRef(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/56ea22fe-9ec4-4d67-9a0f-1f3b37662bbd',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PatientsPage.jsx:112',message:'render',data:{section:activeSection || ''},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
  // #endregion

  const navigate = useNavigate();
  const canEdit = can(user, 'patients:write');
  const canAccess = can(user, 'patients:access');
  const canStatus = can(user, 'patients:status');
  const updateNewAddress = (updater) =>
    setDraft((prev) => ({
      ...prev,
      newAddress: typeof updater === 'function' ? updater(prev.newAddress) : updater,
    }));
  const {
    loading: cepLoading,
    cepError,
    handleCepChange,
    handleCepBlur,
    handleFieldChange: handleAddressFieldChange,
    isAutoFilled,
  } = useCepAutofill({
    enabled: canEdit && editingSection === 'Endereços',
    getAddress: () => draft.newAddress,
    setAddress: updateNewAddress,
    fields: {
      cep: 'cep',
      street: 'street',
      neighborhood: 'neighborhood',
      city: 'city',
      state: 'state',
    },
  });
  const canEditSection = (section) => {
    if (section === 'Dados de Acesso') return canAccess;
    if (section === 'Situação do Cadastro') return canStatus;
    return canEdit;
  };

  const tabs = useMemo(() => cadastroSections.map((label) => ({ value: label, label })), []);

  const refreshDb = () => {
    setDbSnapshot(loadDb());
  };

  const buildSummary = (patients) => {
    const db = loadDb();
    return patients.map((patient) => {
      const phones = db.patientPhones.filter((item) => item.patient_id === patient.id);
      const primaryPhone = phones.find((item) => item.is_primary) || phones[0];
      const phoneLabel = primaryPhone ? `(${primaryPhone.ddd}) ${primaryPhone.number}` : 'Sem telefone';
      return {
        id: patient.id,
        name: patient.full_name,
        cpf: patient.cpf,
        status: patient.status,
        phoneLabel,
        phones,
      };
    });
  };

  const refreshSelected = (id = selectedId) => {
    if (!id) return;
    if (isDev) console.debug('[patients] fetch', { id });
    const data = getPatient(id);
    if (!data) return;
    setDraft((prev) => ({
      ...prev,
      ...data,
      newPhone: prev.newPhone,
      newAddress: prev.newAddress,
      newInsurance: prev.newInsurance,
    }));
    setDependentsText((data.relationships?.dependents || []).join('\n'));
    setPhotoPreview(null); // Limpar preview ao carregar paciente
    refreshDb();
  };

  const showToast = (type, message) => {
    if (!message) return;
    setToast({ type, message });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3200);
  };


  useEffect(() => {
    if (selectedId) refreshSelected(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchType]);

  // Limpar timeout ao desmontar componente
  useEffect(() => {
    return () => {
      if (autoSearchTimeoutRef.current) {
        clearTimeout(autoSearchTimeoutRef.current);
      }
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!suggestWrapRef.current || suggestWrapRef.current.contains(event.target)) return;
      setSuggestOpen(false);
      setActiveSuggestIndex(-1);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const normalized = normalizeSuggestQuery(searchQuery);
    const minChars = suggestMinChars(searchType);
    if (suggestTimeoutRef.current) clearTimeout(suggestTimeoutRef.current);
    if (!normalized || normalized.length < minChars) {
      setSuggestions([]);
      setSuggestOpen(false);
      setSuggestLoading(false);
      setActiveSuggestIndex(-1);
      return;
    }
    setSuggestLoading(true);
    setSuggestOpen(true);
    setActiveSuggestIndex(-1);
    suggestTimeoutRef.current = setTimeout(() => {
      const { results } = suggestPatients(searchType, normalized, 10);
      setSuggestions(results);
      setSuggestLoading(false);
    }, 320);
  }, [searchQuery, searchType]);

  useEffect(() => {
    if (error) showToast('error', error);
  }, [error]);

  useEffect(() => {
    if (success) showToast('success', success);
  }, [success]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (suggestTimeoutRef.current) clearTimeout(suggestTimeoutRef.current);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const formatSearchValue = (value) => {
    if (searchType === 'cpf') return formatCpf(value);
    if (searchType === 'phone') return formatPhone(value);
    return value;
  };

  const suggestMinChars = (type) => {
    if (type === 'cpf') return 11;
    if (type === 'phone') return 3;
    return 2;
  };

  const normalizeSuggestQuery = (value) => {
    if (searchType === 'cpf' || searchType === 'phone') return onlyDigits(value);
    return normalizeText(value);
  };

  const searchPlaceholder = () => {
    if (searchType === 'cpf') return '000.000.000-00';
    if (searchType === 'phone') return '(00) 00000-0000';
    return 'Digite o nome do paciente';
  };

  const renderHighlight = (text, query) => {
    if (!query) return text;
    const lower = text.toLowerCase();
    const needle = query.toLowerCase();
    const index = lower.indexOf(needle);
    if (index === -1) return text;
    const before = text.slice(0, index);
    const match = text.slice(index, index + needle.length);
    const after = text.slice(index + needle.length);
    return (
      <>
        {before}
        <mark className="search-highlight">{match}</mark>
        {after}
      </>
    );
  };

  const performSearch = (query) => {
    if (!query || query.length < 2) {
      setSearchError('');
      setExactMatch(null);
      setSearchSummary([]);
      setSearchLoading(false);
      return;
    }
    setSearchError('');
    setExactMatch(null);
    setSearchSummary([]);
    setSearchLoading(true);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      try {
        const { results, exactMatch: exact } = searchPatients(searchType, query);
        setExactMatch(exact);
        setSearchSummary(buildSummary(results));
      } catch (err) {
        setSearchError(err.message || 'Erro ao buscar pacientes.');
      } finally {
        setSearchLoading(false);
      }
    }, 260);
  };

  const handleSearch = () => {
    const query = normalizeText(searchQuery);
    performSearch(query);
  };

  const clearSearch = () => {
    // Limpar timeouts pendentes
    if (autoSearchTimeoutRef.current) {
      clearTimeout(autoSearchTimeoutRef.current);
      autoSearchTimeoutRef.current = null;
    }
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    // Resetar todos os estados
    setSearchQuery('');
    setSearchSummary([]);
    setExactMatch(null);
    setSearchError('');
    setSearchLoading(false);
    setSuggestions([]);
    setSuggestOpen(false);
    setSuggestLoading(false);
    setActiveSuggestIndex(-1);
  };

  const openPatient = (patientId, section) => {
    if (editingSection && !window.confirm('Existem alterações não salvas. Deseja sair?')) return;
    setSelectedId(patientId);
    setActiveSection(section);
    setEditingSection('');
    setSuccess('');
    setError('');
  };

  const handleSuggestionSelect = (item) => {
    const data = getPatient(item.id);
    const profile = data?.profile;
    if (!profile) return;
    setExactMatch(profile);
    setSearchSummary([]);
    setSearchError('');
    setSearchQuery(item.name || profile.full_name || '');
    setSuggestOpen(false);
    setSuggestions([]);
    setActiveSuggestIndex(-1);
  };

  const handleSearchKeyDown = (event) => {
    if (!suggestOpen || (suggestions.length === 0 && !suggestLoading)) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestIndex((prev) => {
        const next = prev + 1;
        return next >= suggestions.length ? 0 : next;
      });
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestIndex((prev) => {
        const next = prev - 1;
        return next < 0 ? suggestions.length - 1 : next;
      });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const target = suggestions[activeSuggestIndex] || suggestions[0];
      if (target) handleSuggestionSelect(target);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setSuggestOpen(false);
      setActiveSuggestIndex(-1);
    }
  };


  const startEdit = (section) => {
    if (!canEditSection(section)) return;
    if (editingSection && editingSection !== section) {
      if (!window.confirm('Existem alterações não salvas. Deseja sair?')) return;
    }
    setEditingSection(section);
    setError('');
    setSuccess('');
  };

  const cancelEdit = () => {
    setEditingSection('');
    refreshSelected();
  };

  const saveSection = (section) => {
    setError('');
    setSuccess('');
    try {
      if (!selectedId) throw new Error('ID do paciente inválido.');
      if (isDev) console.debug('[patients] update', { id: selectedId, section });
      if (section === 'Dados Principais') updatePatientProfile(user, selectedId, draft.profile);
      if (section === 'Documentações') {
        updatePatientDocuments(user, selectedId, draft.documents);
        updatePatientRelationships(user, selectedId, { ...draft.relationships, marital_status: draft.documents.marital_status });
      }
      if (section === 'Naturalidade') updatePatientBirth(user, selectedId, { ...draft.birth, birth_date: draft.profile.birth_date });
      if (section === 'Formação') updatePatientEducation(user, selectedId, draft.education);
      if (section === 'Relacionamentos') {
        updatePatientRelationships(user, selectedId, {
          ...draft.relationships,
          dependents: dependentsText.split('\n').map((item) => item.trim()).filter(Boolean),
        });
        updatePatientDocuments(user, selectedId, { ...draft.documents, marital_status: draft.relationships.marital_status });
      }
      if (section === 'Dados de Acesso') updatePatientAccess(user, selectedId, draft.access);
      if (section === 'Situação do Cadastro') updatePatientStatus(user, selectedId, draft.profile);
      setEditingSection('');
      refreshSelected();
      setSuccess('Dados salvos com sucesso.');
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePhotoUpload = (event) => {
    const file = event.target.files?.[0];
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientsPage.jsx:473',message:'photo input change',data:{hasFile:!!file,type:file?.type || null,size:file?.size || null,selectedId:selectedId || null,canEdit},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    if (!file) {
      setPhotoPreview(null);
      return;
    }
    
    // Validar tipo de arquivo
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Tipo de arquivo inválido. Use apenas imagens PNG, JPG, JPEG ou WEBP.');
      setPhotoPreview(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
      return;
    }
    
    // Validar tamanho (5MB)
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
      setError('Arquivo muito grande. O tamanho máximo é 5MB.');
      setPhotoPreview(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
      return;
    }
    
    // Preview imediato
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setPhotoPreview(dataUrl);
      setError('');
      
      // Se já tem paciente selecionado, salvar automaticamente
      if (selectedId) {
        try {
          uploadPatientPhoto(user, selectedId, { type: file.type, size: file.size, dataUrl });
          refreshSelected();
          setSuccess('Foto atualizada com sucesso.');
        } catch (err) {
          setError(err.message || 'Erro ao salvar a foto. Tente novamente.');
        }
      }
      // Se não tem paciente selecionado, o preview fica no state para salvar depois
    };
    reader.onerror = () => {
      setError('Erro ao ler o arquivo. Tente novamente.');
      setPhotoPreview(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarClick = () => {
    if (photoInputRef.current && canEdit) {
      photoInputRef.current.click();
    }
  };

  const handleAvatarKeyDown = (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && canEdit) {
      event.preventDefault();
      handleAvatarClick();
    }
  };

  const handleSectionChange = (section) => {
    if (editingSection && !window.confirm('Existem alterações não salvas. Deseja sair?')) return;
    setActiveSection(section);
    setEditingSection('');
  };

  const handleMoveActivity = () => {
    if (!selectedId) return;
    const sourceId = window.prompt('Informe o ID do cadastro duplicado para transportar movimentação.');
    if (!sourceId) return;
    try {
      mergePatientActivity(user, sourceId, selectedId);
      refreshSelected();
      setSuccess('Movimentação transportada.');
    } catch (err) {
      setError(err.message);
    }
  };

  const primaryPhone = draft.phones.find((item) => item.is_primary) || draft.phones[0];
  const phoneLabel = primaryPhone ? `(${primaryPhone.ddd}) ${primaryPhone.number}` : 'Sem telefone';
  const preferredInsurance = draft.insurances.find((item) => item.is_primary) || draft.insurances[0];
  const statusLabel = draft.profile.blocked ? 'Bloqueado' : draft.profile.status === 'inactive' ? 'Inativo' : 'Ativo';
  const sectionTitle = activeSection === 'Documentações' ? 'Documentação' : activeSection;
  const sectionHeader = (
    <SectionHeaderActions
      title={sectionTitle}
      isEditing={editingSection === activeSection}
      onEdit={canEditSection(activeSection) ? () => startEdit(activeSection) : null}
      onSave={() => saveSection(activeSection)}
      onCancel={cancelEdit}
      loading={false}
    />
  );

  const formatPhoneLabel = (phone) => {
    const digits = `${phone.ddd || ''}${phone.number || ''}`;
    return digits ? formatPhone(digits) : 'Sem número';
  };

  const startPhoneForm = (phone) => {
    if (!canEdit || editingSection !== 'Telefones') return;
    if (phone) {
      setPhoneForm({
        id: phone.id,
        type: phone.type || '',
        ddd: phone.ddd || '',
        number: phone.number || '',
        is_whatsapp: Boolean(phone.is_whatsapp),
        is_primary: Boolean(phone.is_primary),
      });
      return;
    }
    setPhoneForm(emptyPhoneForm());
  };

  const resetPhoneForm = () => setPhoneForm(emptyPhoneForm());

  const handlePhoneSubmit = (event) => {
    event.preventDefault();
    if (!selectedId) return;
    setError('');
    try {
      if (phoneForm.id) {
        updatePatientPhone(user, phoneForm.id, phoneForm);
      } else {
        addPatientPhone(user, selectedId, phoneForm);
      }
      resetPhoneForm();
      refreshSelected();
      setSuccess('Telefone salvo com sucesso.');
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePhoneAction = (action, phone) => {
    if (!selectedId) return;
    setError('');
    try {
      if (action === 'remove') removePatientPhone(user, phone.id);
      if (action === 'primary') updatePatientPhone(user, phone.id, { is_primary: true });
      if (action === 'whatsapp') updatePatientPhone(user, phone.id, { is_whatsapp: !phone.is_whatsapp });
      refreshSelected();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="stack patient-page">
      {toast ? (
        <div className={`toast ${toast.type}`} role="status">
          {toast.message}
        </div>
      ) : null}

      {/* Layout em 2 Blocos - Busca e Ações */}
      <div className="patients-page-layout">
        {/* BLOCO ESQUERDO - BUSCA RÁPIDA */}
        <div className="patients-search-block">
          <div className="patients-search-card">
            <div className="patients-search-card-header">
              <div className="patients-search-card-icon">
                <Search size={24} />
              </div>
              <div>
                <h2 className="patients-search-card-title">Buscar paciente</h2>
                <p className="patients-search-card-subtitle">
                  Localize um paciente pelo nome, CPF ou telefone
                </p>
              </div>
            </div>

            <div className="patients-search-card-body">
              <div className="patients-search-form-wrapper" ref={suggestWrapRef}>
                <SearchInputWithSelect
                  ref={searchInputRef}
                  selectValue={searchType}
                  onSelectChange={(event) => {
                    setSearchType(event.target.value);
                    // Se já houver busca, refazer com novo tipo
                    if (normalizeText(searchQuery).length >= 2) {
                      if (autoSearchTimeoutRef.current) clearTimeout(autoSearchTimeoutRef.current);
                      autoSearchTimeoutRef.current = setTimeout(() => {
                        performSearch(normalizeText(searchQuery));
                      }, 400);
                    }
                  }}
                  selectOptions={searchOptions}
                  inputValue={formatSearchValue(searchQuery)}
                  onInputChange={(event) => {
                    const newValue = event.target.value;
                    setSearchQuery(newValue);
                    const normalized = normalizeText(newValue);
                    
                    // Limpar timeout anterior
                    if (autoSearchTimeoutRef.current) {
                      clearTimeout(autoSearchTimeoutRef.current);
                    }
                    
                    // Se campo vazio, limpar resultados imediatamente
                    if (!normalized) {
                      clearSearch();
                      return;
                    }
                    
                    // Busca automática com debounce (400ms)
                    if (normalized.length >= 2) {
                      autoSearchTimeoutRef.current = setTimeout(() => {
                        performSearch(normalized);
                      }, 400);
                    } else {
                      // Se menos de 2 caracteres, limpar resultados
                      setSearchSummary([]);
                      setExactMatch(null);
                      setSearchError('');
                      setSearchLoading(false);
                    }
                  }}
                  onKeyDown={handleSearchKeyDown}
                  onFocus={() => {
                    if (suggestions.length > 0) setSuggestOpen(true);
                  }}
                  placeholder={searchPlaceholder()}
                  aria-autocomplete="list"
                  aria-expanded={suggestOpen}
                />
                
                {suggestOpen ? (
                  <div className="search-suggest-list" role="listbox">
                    {suggestLoading ? <div className="search-suggest-empty">Buscando...</div> : null}
                    {!suggestLoading && suggestions.length === 0 ? (
                      <div className="search-suggest-empty">Nenhum paciente encontrado</div>
                    ) : null}
                    {!suggestLoading
                      ? suggestions.map((item, index) => (
                          <button
                            key={item.id}
                            type="button"
                            className={`search-suggest-item ${index === activeSuggestIndex ? 'active' : ''}`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleSuggestionSelect(item)}
                          >
                            <div className="search-suggest-title">
                              {searchType === 'name'
                                ? renderHighlight(item.name, normalizeSuggestQuery(searchQuery))
                                : item.name}
                            </div>
                            <div className="search-suggest-meta">
                              {item.phoneLabel ? <span>{item.phoneLabel}</span> : <span>Sem telefone</span>}
                              {item.cpfMasked ? <span>CPF: {item.cpfMasked}</span> : null}
                              {item.birthDate ? <span>Nasc.: {item.birthDate}</span> : null}
                            </div>
                          </button>
                        ))
                      : null}
                  </div>
                ) : null}
              </div>

              <div className="patients-search-actions">
                {searchQuery && (
                  <button 
                    className="patients-clear-button" 
                    type="button" 
                    onClick={clearSearch}
                    aria-label="Limpar busca"
                  >
                    Limpar
                  </button>
                )}
              </div>

              {searchError && (
                <div className="patients-search-error">
                  {searchError}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BLOCO DIREITO - CADASTRAR */}
        <div className="patients-actions-block">
          <div className="patients-actions-card">
            <h3 className="patients-actions-card-title">Cadastrar Paciente</h3>
            <p className="patients-actions-card-subtitle">Acesse o cadastro completo</p>
            
            <div className="patients-actions-list">
              <ActionCard
                icon={ClipboardList}
                title="Cadastro de Paciente Completo"
                subtitle="Cadastro completo com todas as informações do paciente"
                onClick={() => {
                  // #region agent log
                  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientsPage.jsx:774',message:'patients action card click',data:{route:'/pacientes/cadastro'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
                  // #endregion
                  navigate('/pacientes/cadastro');
                }}
                disabled={!canEdit}
                gradient="linear-gradient(135deg, #EC4899 0%, #6A00FF 100%)"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Botões discretos Importar/Exportar (rodapé ou flutuante em mobile) */}
      <ImportExportButtons
        patientId={selectedId || null}
        user={user}
        canUse={canManageAccess(user)}
      />

      {searchLoading ? (
        <Section title="Resultados">
          <div className="skeleton-grid">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        </Section>
      ) : null}

      {exactMatch ? (
        <Section title="Paciente encontrado">
          <div className="patients-result-card">
            <div className="patients-result-content">
              <div className="patients-result-info">
                <h3 className="patients-result-name">{exactMatch.full_name}</h3>
                <div className="patients-result-meta">
                  <span>CPF: {formatCpf(exactMatch.cpf || '')}</span>
                  <span className="patients-result-status">
                    {exactMatch.status === 'active' ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </div>
              <div className="patients-result-actions">
                <GradientButton
                  variant="primary"
                  icon={ClipboardList}
                  onClick={() => navigate(`/prontuario/${exactMatch.id}`)}
                  ariaLabel="Acessar prontuário do paciente"
                  className="patients-result-primary-button"
                >
                  Prontuário
                </GradientButton>
                <button 
                  className="patients-result-secondary-button" 
                  type="button" 
                  onClick={() => navigate(`/pacientes/cadastro/${exactMatch.id}`)}
                  aria-label="Acessar cadastro do paciente"
                >
                  <Edit size={18} />
                  Acessar cadastro
                </button>
              </div>
            </div>
          </div>
        </Section>
      ) : null}

      {searchSummary.length > 0 ? (
        <Section title="Pacientes encontrados">
          <div className="patients-results-grid">
            {searchSummary.map((item) => (
              <div key={item.id} className="patients-result-card">
                <div className="patients-result-content">
                  <div className="patients-result-info">
                    <h3 className="patients-result-name">{item.name}</h3>
                    <div className="patients-result-meta">
                      <span>CPF: {formatCpf(item.cpf || '')}</span>
                      <span>{item.phoneLabel}</span>
                    </div>
                  </div>
                  <div className="patients-result-actions">
                    <GradientButton
                      variant="primary"
                      icon={ClipboardList}
                      onClick={() => navigate(`/prontuario/${item.id}`)}
                      ariaLabel={`Acessar prontuário de ${item.name}`}
                      className="patients-result-primary-button"
                    >
                      Prontuário
                    </GradientButton>
                    <button 
                      className="patients-result-secondary-button" 
                      type="button" 
                      onClick={() => navigate(`/pacientes/cadastro/${item.id}`)}
                      aria-label={`Acessar cadastro de ${item.name}`}
                    >
                      <Edit size={18} />
                      Acessar cadastro
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}


      {selectedId ? (
        <Section title="Cadastro do Paciente">
          <div className="patient-header">
            <div className="patient-header-main">
              <label
                htmlFor={canEdit ? "patientPhotoInput" : undefined}
                className="patient-avatar-wrapper"
                onKeyDown={handleAvatarKeyDown}
                tabIndex={canEdit ? 0 : -1}
                role={canEdit ? 'button' : undefined}
                aria-label={canEdit ? 'Enviar foto do paciente' : 'Foto do paciente'}
                style={{ cursor: canEdit ? 'pointer' : 'default' }}
              >
                {photoPreview ? (
                  <img className="patient-avatar" src={photoPreview} alt="Preview da foto do paciente" />
                ) : draft.profile.photo_url ? (
                  <img className="patient-avatar" src={draft.profile.photo_url} alt="Foto do paciente" />
                ) : (
                  <div className="patient-avatar placeholder">👤</div>
                )}
                {canEdit && (
                  <div className="patient-avatar-overlay">
                    <span className="patient-avatar-overlay-text">Alterar</span>
                  </div>
                )}
              </label>
              <input
                ref={photoInputRef}
                id="patientPhotoInput"
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handlePhotoUpload}
                style={{ display: 'none' }}
                aria-label="Enviar foto do paciente"
              />
              <div>
                <div className="patient-name">{draft.profile.full_name || 'Paciente'}</div>
                <div className="patient-meta">
                  <span>ID: {draft.profile.id || selectedId}</span>
                  <span className={`status-pill ${draft.profile.blocked ? 'blocked' : 'active'}`}>{statusLabel}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="patient-chart-access">
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientsPage.jsx:872',message:'patients selected action',data:{action:'prontuario',selectedId:selectedId || null},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H6'})}).catch(()=>{});
                // #endregion
                navigate(`/prontuario/${selectedId}`);
              }}
            >
              Prontuário
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/PatientsPage.jsx:879',message:'patients selected action',data:{action:'cadastro-completo',selectedId:selectedId || null},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H6'})}).catch(()=>{});
                // #endregion
                navigate(`/pacientes/cadastro/${selectedId}`);
              }}
            >
              Cadastro Completo
            </button>
          </div>
          <div className="patient-indicators">
            <div className="indicator">
              <span>Telefone principal</span>
              <strong>{phoneLabel}</strong>
            </div>
            <div className="indicator">
              <span>Convênio</span>
              <strong>{preferredInsurance ? preferredInsurance.insurance_name : '—'}</strong>
            </div>
          </div>

          <Tabs tabs={tabs} active={activeSection} onChange={handleSectionChange} />

          {error ? <div className="alert error">{error}</div> : null}
          {success ? <div className="alert success">{success}</div> : null}

          <SectionCard header={sectionHeader}>
            {activeSection === 'Dados Principais' ? (
              <div className="patient-form-grid">
                <FormRow label="Nome completo">
                  <input
                    value={draft.profile.full_name || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, full_name: event.target.value } }))}
                    disabled={editingSection !== 'Dados Principais'}
                  />
                </FormRow>
                <FormRow label="Apelido" optional>
                  <input
                    value={draft.profile.nickname || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, nickname: event.target.value } }))}
                    disabled={editingSection !== 'Dados Principais'}
                  />
                </FormRow>
                <FormRow label="Sexo">
                  <select
                    value={draft.profile.sex || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, sex: event.target.value } }))}
                    disabled={editingSection !== 'Dados Principais'}
                  >
                    <option value="">Selecione</option>
                    <option value="F">Feminino</option>
                    <option value="M">Masculino</option>
                    <option value="Outro">Outro</option>
            </select>
                </FormRow>
                <FormRow label="Nome social" optional>
                  <input
                    value={draft.profile.social_name || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, social_name: event.target.value } }))}
                    disabled={editingSection !== 'Dados Principais'}
                  />
                </FormRow>
                <FormRow label="Tags do paciente" optional>
                  <input
                    value={(draft.profile.tags || []).join(', ')}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        profile: { ...prev.profile, tags: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) },
                      }))
                    }
                    placeholder="Implante, Orto, VIP"
                    disabled={editingSection !== 'Dados Principais'}
                  />
                </FormRow>
                <FormRow label="Origem do lead" optional>
                  <input
                    value={draft.profile.lead_source || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, lead_source: event.target.value } }))}
                    placeholder="Instagram, Indicação, Google"
                    disabled={editingSection !== 'Dados Principais'}
                  />
                </FormRow>
                <FormRow label="Foto do paciente" optional>
                  <div className="upload-inline">
                    {draft.profile.photo_url ? <img className="patient-photo" src={draft.profile.photo_url} alt="Foto do paciente" /> : null}
                    <input type="file" accept="image/png,image/jpeg" onChange={handlePhotoUpload} disabled={editingSection !== 'Dados Principais'} />
                  </div>
                </FormRow>
              </div>
            ) : null}

            {activeSection === 'Documentações' ? (
              <div className="patient-form-grid">
                <FormRow label="CPF">
                  <input
                    value={formatCpf(draft.profile.cpf || '')}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, cpf: event.target.value }, documents: { ...prev.documents, cpf: event.target.value } }))}
                    disabled={editingSection !== 'Documentações'}
                  />
                </FormRow>
                <FormRow label="RG" optional>
                  <input
                    value={draft.documents.rg || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, rg: event.target.value } }))}
                    disabled={editingSection !== 'Documentações'}
                  />
                </FormRow>
                <FormRow label="PIS" optional>
                  <input
                    value={draft.documents.pis || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, pis: event.target.value } }))}
                    disabled={editingSection !== 'Documentações'}
                  />
                </FormRow>
                <FormRow label="Inscrição Municipal" optional>
                  <input
                    value={draft.documents.municipal_registration || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, municipal_registration: event.target.value } }))}
                    disabled={editingSection !== 'Documentações'}
                  />
                </FormRow>
                <FormRow label="E-mail pessoal" optional>
                  <input
                    type="email"
                    value={draft.documents.personal_email || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, personal_email: event.target.value } }))}
                    disabled={editingSection !== 'Documentações'}
                  />
                </FormRow>
                <FormRow label="Estado civil" optional>
                  <input
                    value={draft.documents.marital_status || ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDraft((prev) => ({
                        ...prev,
                        documents: { ...prev.documents, marital_status: value },
                        relationships: { ...prev.relationships, marital_status: value },
                      }));
                    }}
                    disabled={editingSection !== 'Documentações'}
                  />
                </FormRow>
                <FormRow label="Responsável" optional>
                  <input
                    value={draft.documents.responsible_name || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, responsible_name: event.target.value } }))}
                    disabled={editingSection !== 'Documentações'}
                  />
                </FormRow>
                <FormRow label="Parentesco" optional>
                  <input
                    value={draft.documents.responsible_relation || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, responsible_relation: event.target.value } }))}
                    disabled={editingSection !== 'Documentações'}
                  />
                </FormRow>
                <FormRow label="Telefone responsável" optional>
                  <input
                    value={formatPhone(draft.documents.responsible_phone || '')}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, responsible_phone: event.target.value } }))}
                    disabled={editingSection !== 'Documentações'}
                  />
                </FormRow>
                <FormRow label="Filiação (mãe)" optional>
                  <input
                    value={draft.documents.mother_name || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, mother_name: event.target.value } }))}
                    disabled={editingSection !== 'Documentações'}
                  />
                </FormRow>
                <FormRow label="Filiação (pai)" optional>
                  <input
                    value={draft.documents.father_name || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, documents: { ...prev.documents, father_name: event.target.value } }))}
                    disabled={editingSection !== 'Documentações'}
                  />
                </FormRow>
              </div>
            ) : null}

            {activeSection === 'Naturalidade' ? (
              <div className="patient-form-grid">
                <FormRow label="Data de nascimento">
                  <input
                    type="date"
                    value={draft.profile.birth_date || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, birth_date: event.target.value } }))}
                    disabled={editingSection !== 'Naturalidade'}
                  />
                </FormRow>
                <FormRow label="Nacionalidade" optional>
                  <input
                    value={draft.birth.nationality || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, birth: { ...prev.birth, nationality: event.target.value } }))}
                    disabled={editingSection !== 'Naturalidade'}
                  />
                </FormRow>
                <FormRow label="Local de nascimento (Cidade)" optional>
                  <input
                    value={draft.birth.birth_city || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, birth: { ...prev.birth, birth_city: event.target.value } }))}
                    disabled={editingSection !== 'Naturalidade'}
                  />
                </FormRow>
                <FormRow label="UF" optional>
                  <input
                    value={draft.birth.birth_state || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, birth: { ...prev.birth, birth_state: event.target.value } }))}
                    disabled={editingSection !== 'Naturalidade'}
                  />
                </FormRow>
              </div>
            ) : null}

            {activeSection === 'Formação' ? (
              <div className="patient-form-grid">
                <FormRow label="Escolaridade" optional>
                  <input
                    value={draft.education.education_level || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, education: { ...prev.education, education_level: event.target.value } }))}
                    disabled={editingSection !== 'Formação'}
                  />
                </FormRow>
                <FormRow label="Profissão" optional>
                  <input
                    value={draft.education.profession || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, education: { ...prev.education, profession: event.target.value } }))}
                    disabled={editingSection !== 'Formação'}
                  />
                </FormRow>
                <FormRow label="Outra" optional>
            <input
                    value={draft.education.other_profession || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, education: { ...prev.education, other_profession: event.target.value } }))}
                    disabled={editingSection !== 'Formação'}
                  />
                </FormRow>
            </div>
          ) : null}

            {activeSection === 'Telefones' ? (
              <div className="stack phone-section">
                <div className="phone-header">
                  <div>
                    <h4>Telefones</h4>
                    <p className="muted">Principal: {primaryPhone ? formatPhoneLabel(primaryPhone) : 'Não definido'}</p>
                  </div>
                  {canEdit && editingSection === 'Telefones' ? (
                    <button className="button primary" type="button" onClick={() => startPhoneForm()}>
                      + Adicionar telefone
                    </button>
                  ) : null}
                </div>

                {canEdit && editingSection === 'Telefones' ? (
                  <SectionCard title={phoneForm.id ? 'Editar telefone' : 'Novo telefone'}>
                    <form className="phone-form" onSubmit={handlePhoneSubmit}>
                      <FormRow label="Tipo">
                        <select
                          value={phoneForm.type}
                          onChange={(event) => setPhoneForm((prev) => ({ ...prev, type: event.target.value }))}
                          required
                        >
                          <option value="">Selecione</option>
                          <option value="whatsapp">WhatsApp</option>
                          <option value="celular">Celular</option>
                          <option value="residencial">Residencial</option>
                          <option value="comercial">Comercial</option>
                          <option value="outro">Outro</option>
                        </select>
                      </FormRow>
                      <FormRow label="DDD">
                        <input
                          value={phoneForm.ddd}
                          onChange={(event) => setPhoneForm((prev) => ({ ...prev, ddd: event.target.value }))}
                          required
                        />
                      </FormRow>
                      <FormRow label="Número">
                        <input
                          value={formatPhone(phoneForm.number)}
                          onChange={(event) => setPhoneForm((prev) => ({ ...prev, number: event.target.value }))}
                          required
                        />
                      </FormRow>
                      <FormRow label="É WhatsApp" optional>
                        <input
                          type="checkbox"
                          checked={phoneForm.is_whatsapp}
                          onChange={(event) => setPhoneForm((prev) => ({ ...prev, is_whatsapp: event.target.checked }))}
                        />
                      </FormRow>
                      <FormRow label="Definir como principal" optional>
                        <input
                          type="checkbox"
                          checked={phoneForm.is_primary}
                          onChange={(event) => setPhoneForm((prev) => ({ ...prev, is_primary: event.target.checked }))}
                        />
                      </FormRow>
                      <div className="form-actions">
                        {phoneForm.id ? (
                          <button className="button secondary" type="button" onClick={resetPhoneForm}>
                            Cancelar edição
                          </button>
                        ) : null}
          <button className="button primary" type="submit">
                          Salvar telefone
                        </button>
                      </div>
                    </form>
                  </SectionCard>
                ) : null}

                <div className="phone-list">
                  {draft.phones.length === 0 ? (
                    <div className="empty-state">Nenhum telefone cadastrado.</div>
                  ) : (
                    draft.phones.map((item) => (
                      <div key={item.id} className="phone-card">
                        <div className="phone-main">
                          <div className="phone-type">{phoneTypeLabels[item.type] || 'Telefone'}</div>
                          <div className="phone-number">{formatPhoneLabel(item)}</div>
                          <div className="phone-badges">
                            {item.is_primary ? <span className="badge primary">Principal</span> : null}
                            {item.is_whatsapp ? <span className="badge success">WhatsApp</span> : null}
                          </div>
                        </div>
                        {canEdit && editingSection === 'Telefones' ? (
                          <div className="phone-actions">
                            <button className="icon-action" type="button" onClick={() => startPhoneForm(item)}>
                              ✏ Editar
                            </button>
                            {!item.is_primary ? (
                              <button className="icon-action" type="button" onClick={() => handlePhoneAction('primary', item)}>
                                ⭐ Definir principal
                              </button>
                            ) : null}
                            <button className="icon-action" type="button" onClick={() => handlePhoneAction('whatsapp', item)}>
                              ✅ {item.is_whatsapp ? 'Remover WhatsApp' : 'Marcar WhatsApp'}
                            </button>
                            <button className="icon-action danger" type="button" onClick={() => handlePhoneAction('remove', item)}>
                              🗑 Remover
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            {activeSection === 'Endereços' ? (
              <div className="stack">
                <form
                  className="patient-form-grid"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!selectedId) return;
                    addPatientAddress(user, selectedId, draft.newAddress);
                    setDraft((prev) => ({
                      ...prev,
                      newAddress: { type: '', cep: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '', is_primary: false },
                    }));
                    refreshSelected();
                  }}
                >
                  <FormRow label="Tipo">
                    <select
                      value={draft.newAddress.type}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, type: event.target.value } }))}
                      disabled={!canEdit || editingSection !== 'Endereços'}
                    >
                      <option value="">Selecione</option>
                      <option value="residencial">Residencial</option>
                      <option value="cobranca">Cobrança</option>
                      <option value="correspondencia">Correspondência</option>
                    </select>
                  </FormRow>
                  <FormRow label="CEP" optional error={cepError}>
                    <div className={`cep-input-wrapper ${cepLoading ? 'is-loading' : ''}`}>
                      <input
                        value={formatCep(draft.newAddress.cep)}
                        onChange={(event) => handleCepChange(event.target.value)}
                        onBlur={handleCepBlur}
                        disabled={!canEdit || editingSection !== 'Endereços'}
                      />
                      <span className="cep-spinner" aria-hidden="true" />
                    </div>
                  </FormRow>
                  <FormRow label="Logradouro">
                    <input
                      value={draft.newAddress.street}
                      onChange={(event) => handleAddressFieldChange('street', event.target.value)}
                      className={isAutoFilled('street') ? 'input-autofilled' : ''}
                      disabled={!canEdit || editingSection !== 'Endereços'}
                    />
                  </FormRow>
                  <FormRow label="Número">
                    <input
                      value={draft.newAddress.number}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, number: event.target.value } }))}
                      disabled={!canEdit || editingSection !== 'Endereços'}
                    />
                  </FormRow>
                  <FormRow label="Complemento" optional>
                    <input
                      value={draft.newAddress.complement}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, complement: event.target.value } }))}
                      disabled={!canEdit || editingSection !== 'Endereços'}
                    />
                  </FormRow>
                  <FormRow label="Bairro" optional>
                    <input
                      value={draft.newAddress.neighborhood}
                      onChange={(event) => handleAddressFieldChange('neighborhood', event.target.value)}
                      className={isAutoFilled('neighborhood') ? 'input-autofilled' : ''}
                      disabled={!canEdit || editingSection !== 'Endereços'}
                    />
                  </FormRow>
                  <FormRow label="Cidade">
                    <input
                      value={draft.newAddress.city}
                      onChange={(event) => handleAddressFieldChange('city', event.target.value)}
                      className={isAutoFilled('city') ? 'input-autofilled' : ''}
                      disabled={!canEdit || editingSection !== 'Endereços'}
                    />
                  </FormRow>
                  <FormRow label="UF">
                    <input
                      value={draft.newAddress.state}
                      onChange={(event) => handleAddressFieldChange('state', event.target.value)}
                      className={isAutoFilled('state') ? 'input-autofilled' : ''}
                      disabled={!canEdit || editingSection !== 'Endereços'}
                    />
                  </FormRow>
                  <FormRow label="Principal">
                    <input
                      type="checkbox"
                      checked={draft.newAddress.is_primary}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newAddress: { ...prev.newAddress, is_primary: event.target.checked } }))}
                      disabled={!canEdit || editingSection !== 'Endereços'}
                    />
                  </FormRow>
                  <div className="form-actions">
                    <button className="button primary" type="submit" disabled={!canEdit || editingSection !== 'Endereços'}>
                      Adicionar endereço
          </button>
                  </div>
        </form>
                <div className="card-list">
                  {draft.addresses.length === 0 ? (
                    <div className="muted">Nenhum endereço cadastrado.</div>
                  ) : (
                    draft.addresses.map((item) => (
                      <div key={item.id} className="list-row">
                        <div>
                          {item.type} · {item.street}, {item.number} · {item.city}-{item.state} {item.is_primary ? '★' : ''}
                        </div>
                        {canEdit ? (
                          <button className="button secondary" type="button" onClick={() => removePatientAddress(user, item.id)}>
                            Remover
                          </button>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            {activeSection === 'Relacionamentos' ? (
              <div className="patient-form-grid">
                <FormRow label="Estado civil" optional>
                  <input
                    value={draft.relationships.marital_status || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, relationships: { ...prev.relationships, marital_status: event.target.value } }))}
                    disabled={editingSection !== 'Relacionamentos'}
                  />
                </FormRow>
                <FormRow label="Contato de emergência" optional>
                  <input
                    value={draft.relationships.emergency_contact_name || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, relationships: { ...prev.relationships, emergency_contact_name: event.target.value } }))}
                    disabled={editingSection !== 'Relacionamentos'}
                  />
                </FormRow>
                <FormRow label="Telefone emergência" optional>
                  <input
                    value={formatPhone(draft.relationships.emergency_contact_phone || '')}
                    onChange={(event) => setDraft((prev) => ({ ...prev, relationships: { ...prev.relationships, emergency_contact_phone: event.target.value } }))}
                    disabled={editingSection !== 'Relacionamentos'}
                  />
                </FormRow>
                <FormRow label="Preferência de contato" optional>
                  <select
                    value={draft.relationships.preferred_contact_channel || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, relationships: { ...prev.relationships, preferred_contact_channel: event.target.value } }))}
                    disabled={editingSection !== 'Relacionamentos'}
                  >
                    <option value="">Selecione</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="telefone">Telefone</option>
                    <option value="email">E-mail</option>
                  </select>
                </FormRow>
                <FormRow label="Preferência de horário" optional>
                  <select
                    value={draft.relationships.preferred_contact_period || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, relationships: { ...prev.relationships, preferred_contact_period: event.target.value } }))}
                    disabled={editingSection !== 'Relacionamentos'}
                  >
                    <option value="">Selecione</option>
                    <option value="manha">Manhã</option>
                    <option value="tarde">Tarde</option>
                    <option value="noite">Noite</option>
                  </select>
                </FormRow>
                <FormRow label="Autorização LGPD para WhatsApp" optional>
                  <input
                    type="checkbox"
                    checked={Boolean(draft.relationships.lgpd_whatsapp_opt_in)}
                    onChange={(event) => setDraft((prev) => ({ ...prev, relationships: { ...prev.relationships, lgpd_whatsapp_opt_in: event.target.checked } }))}
                    disabled={editingSection !== 'Relacionamentos'}
                  />
                </FormRow>
                <FormRow label="Dependentes (um por linha)" optional>
                  <textarea value={dependentsText} onChange={(event) => setDependentsText(event.target.value)} disabled={editingSection !== 'Relacionamentos'} />
                </FormRow>
                <FormRow label="Observações" optional>
                  <textarea
                    value={draft.relationships.notes || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, relationships: { ...prev.relationships, notes: event.target.value } }))}
                    disabled={editingSection !== 'Relacionamentos'}
                  />
                </FormRow>
              </div>
            ) : null}

            {activeSection === 'Convênios' ? (
              <div className="stack">
                <form
                  className="patient-form-grid"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!selectedId) return;
                    addPatientInsurance(user, selectedId, draft.newInsurance);
                    setDraft((prev) => ({
                      ...prev,
                      newInsurance: { insurance_name: '', plan_name: '', membership_number: '', validity: '', is_holder: true, company_partner: '', extra_data: '' },
                    }));
                    refreshSelected();
                  }}
                >
                  <FormRow label="Convênio">
                    <input
                      value={draft.newInsurance.insurance_name}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newInsurance: { ...prev.newInsurance, insurance_name: event.target.value } }))}
                      disabled={!canEdit || editingSection !== 'Convênios'}
                    />
                  </FormRow>
                  <FormRow label="Plano" optional>
                    <input
                      value={draft.newInsurance.plan_name}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newInsurance: { ...prev.newInsurance, plan_name: event.target.value } }))}
                      disabled={!canEdit || editingSection !== 'Convênios'}
                    />
                  </FormRow>
                  <FormRow label="Nº carteirinha" optional>
                    <input
                      value={draft.newInsurance.membership_number}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newInsurance: { ...prev.newInsurance, membership_number: event.target.value } }))}
                      disabled={!canEdit || editingSection !== 'Convênios'}
                    />
                  </FormRow>
                  <FormRow label="Validade" optional>
                    <input
                      type="date"
                      value={draft.newInsurance.validity}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newInsurance: { ...prev.newInsurance, validity: event.target.value } }))}
                      disabled={!canEdit || editingSection !== 'Convênios'}
                    />
                  </FormRow>
                  <FormRow label="Titular" optional>
                    <input
                      type="checkbox"
                      checked={draft.newInsurance.is_holder}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newInsurance: { ...prev.newInsurance, is_holder: event.target.checked } }))}
                      disabled={!canEdit || editingSection !== 'Convênios'}
                    />
                  </FormRow>
                  <FormRow label="Empresa conveniada" optional>
                    <input
                      value={draft.newInsurance.company_partner}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newInsurance: { ...prev.newInsurance, company_partner: event.target.value } }))}
                      disabled={!canEdit || editingSection !== 'Convênios'}
                    />
                  </FormRow>
                  <FormRow label="Dados adicionais" optional>
                    <input
                      value={draft.newInsurance.extra_data}
                      onChange={(event) => setDraft((prev) => ({ ...prev, newInsurance: { ...prev.newInsurance, extra_data: event.target.value } }))}
                      disabled={!canEdit || editingSection !== 'Convênios'}
                    />
                  </FormRow>
                  <div className="form-actions">
                    <button className="button primary" type="submit" disabled={!canEdit || editingSection !== 'Convênios'}>
                      Adicionar convênio
                    </button>
                  </div>
                </form>
                <div className="card-list">
                  {draft.insurances.length === 0 ? (
                    <div className="muted">Nenhum convênio cadastrado.</div>
                  ) : (
                    draft.insurances.map((item) => (
                      <div key={item.id} className="list-row">
                        <div>
                          {item.insurance_name} · {item.plan_name || 'Sem plano'} · {item.validity || 'Sem validade'}
                        </div>
                        {canEdit ? (
                          <button className="button secondary" type="button" onClick={() => removePatientInsurance(user, item.id)}>
                            Remover
                          </button>
                  ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            {activeSection === 'Dados de Acesso' ? (
              <div className="patient-form-grid">
                <FormRow label="Usuário vinculado" optional>
                  <select
                    value={draft.access.user_id || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, access: { ...prev.access, user_id: event.target.value } }))}
                    disabled={!canAccess || editingSection !== 'Dados de Acesso'}
                  >
                    <option value="">Selecione</option>
                    {dbSnapshot.users.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </FormRow>
                <FormRow label="Email de acesso" optional>
                  <input
                    value={draft.access.access_email || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, access: { ...prev.access, access_email: event.target.value } }))}
                    disabled={!canAccess || editingSection !== 'Dados de Acesso'}
                  />
                </FormRow>
                <FormRow label="Telefone de acesso" optional>
                  <input
                    value={formatPhone(draft.access.access_phone || '')}
                    onChange={(event) => setDraft((prev) => ({ ...prev, access: { ...prev.access, access_phone: event.target.value } }))}
                    disabled={!canAccess || editingSection !== 'Dados de Acesso'}
                  />
                </FormRow>
                <FormRow label="Status de acesso" optional>
                  <select
                    value={draft.access.access_status || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, access: { ...prev.access, access_status: event.target.value } }))}
                    disabled={!canAccess || editingSection !== 'Dados de Acesso'}
                  >
                    <option value="">Selecione</option>
                    <option value="active">Ativo</option>
                    <option value="blocked">Bloqueado</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </FormRow>
                <FormRow label="Último login" optional>
                  <input
                    type="datetime-local"
                    value={draft.access.last_login_at || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, access: { ...prev.access, last_login_at: event.target.value } }))}
                    disabled={!canAccess || editingSection !== 'Dados de Acesso'}
                  />
                </FormRow>
                <FormRow label="Convite enviado em" optional>
                  <input
                    type="datetime-local"
                    value={draft.access.invite_sent_at || ''}
                    onChange={(event) => setDraft((prev) => ({ ...prev, access: { ...prev.access, invite_sent_at: event.target.value } }))}
                    disabled={!canAccess || editingSection !== 'Dados de Acesso'}
                  />
                </FormRow>
              </div>
            ) : null}

            {activeSection === 'Situação do Cadastro' ? (
              <div className="stack">
                <div className="patient-form-grid">
                  <FormRow label="Situação">
                    <select
                      value={draft.profile.status || 'active'}
                      onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, status: event.target.value } }))}
                      disabled={!canStatus || editingSection !== 'Situação do Cadastro'}
                    >
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                    </select>
                  </FormRow>
                  <FormRow label="Bloqueio" optional>
                    <select
                      value={draft.profile.blocked ? 'blocked' : 'none'}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          profile: { ...prev.profile, blocked: event.target.value === 'blocked' },
                        }))
                      }
                      disabled={!canStatus || editingSection !== 'Situação do Cadastro'}
                    >
                      <option value="none">Nenhum</option>
                      <option value="blocked">Bloqueado</option>
                    </select>
                  </FormRow>
                  <FormRow label="Motivo do bloqueio" optional>
                    <input
                      value={draft.profile.block_reason || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, block_reason: event.target.value } }))}
                      disabled={!canStatus || editingSection !== 'Situação do Cadastro'}
                    />
                  </FormRow>
                  <FormRow label="Data do bloqueio" optional>
                    <input
                      type="datetime-local"
                      value={draft.profile.block_at || ''}
                      onChange={(event) => setDraft((prev) => ({ ...prev, profile: { ...prev.profile, block_at: event.target.value } }))}
                      disabled={!canStatus || editingSection !== 'Situação do Cadastro'}
                    />
                  </FormRow>
                </div>
                <div className="summary-grid">
                  <SectionCard title="Movimentação">
                    <p>{draft.activity.total_appointments ? `${draft.activity.total_appointments} atendimentos` : 'Paciente sem movimentação'}</p>
                    <p className="muted">Última movimentação: {draft.activity.last_appointment_at || '—'}</p>
                    <button className="button secondary" type="button" onClick={handleMoveActivity} disabled={!canEdit}>
                      Transportar Movimentação
                    </button>
                  </SectionCard>
                  <SectionCard title="Auditoria">
                    <p>Cadastramento: {draft.profile.created_at || '—'}</p>
                    <p>Por: {draft.profile.created_by_user_id || '—'}</p>
                    <p>Pessoa GUID: {draft.profile.guid || '—'}</p>
                  </SectionCard>
                </div>
        </div>
            ) : null}
          </SectionCard>
      </Section>
      ) : null}
    </div>
  );
}
