import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, UserPlus, User, Phone, CreditCard, Loader2 } from 'lucide-react';
import { searchPatients } from '../services/patientService.js';
import { loadDb } from '../db/index.js';
import Button from './Button.jsx';

export default function PatientQuickCreateModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [searchType, setSearchType] = useState('name');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape' && isOpen) {
        // Se há resultados ou busca ativa, limpar primeiro
        if (hasSearched || results.length > 0 || searchQuery) {
          setSearchQuery('');
          setResults([]);
          setHasSearched(false);
          event.preventDefault();
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, hasSearched, results.length, searchQuery]);

  // Busca automática ao digitar
  useEffect(() => {
    // Limpar timeout anterior
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const normalized = normalizeText(searchQuery);
    
    // Se campo vazio, limpar resultados imediatamente
    if (!normalized) {
      setResults([]);
      setHasSearched(false);
      setIsLoading(false);
      return;
    }

    // Validação mínima antes de buscar
    if (searchType === 'name' && normalized.length < 3) {
      setResults([]);
      setHasSearched(false);
      setIsLoading(false);
      return;
    }
    if (searchType === 'cpf') {
      const digits = normalizeCpf(normalized);
      if (digits.length !== 11) {
        setResults([]);
        setHasSearched(false);
        setIsLoading(false);
        return;
      }
    }
    if (searchType === 'phone') {
      const digits = normalizePhoneDigits(normalized);
      if (digits.length < 10) {
        setResults([]);
        setHasSearched(false);
        setIsLoading(false);
        return;
      }
    }

    // Busca automática com debounce
    setIsLoading(true);
    setHasSearched(true);
    
    searchTimeoutRef.current = setTimeout(() => {
      try {
        const { results: searchResults } = searchPatients(searchType, normalized);
        setResults(searchResults.slice(0, 10)); // Limitar a 10 resultados
      } catch (err) {
        console.error('Erro ao buscar pacientes:', err);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 400);

    // Cleanup
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, searchType]);

  const formatSearchValue = (value) => {
    if (searchType === 'cpf') {
      const digits = value.replace(/\D/g, '');
      if (digits.length <= 3) return digits;
      if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
      if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
    }
    if (searchType === 'phone') {
      const digits = value.replace(/\D/g, '');
      if (digits.length <= 2) return digits;
      if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
    }
    return value;
  };

  const normalizeText = (value) => {
    if (!value) return '';
    return String(value).trim();
  };

  const onlyDigits = (value) => {
    return String(value || '').replace(/\D/g, '');
  };

  const normalizeCpf = (value) => onlyDigits(value);
  const normalizePhoneDigits = (value) => onlyDigits(value);

  const getPatientPhone = (patientId) => {
    const db = loadDb();
    const phones = db.patientPhones.filter((item) => item.patient_id === patientId);
    const primaryPhone = phones.find((item) => item.is_primary) || phones[0];
    return primaryPhone ? `(${primaryPhone.ddd}) ${primaryPhone.number}` : '';
  };

  const maskCpf = (value) => {
    const digits = normalizeCpf(value);
    if (digits.length !== 11) return value || '';
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  };


  const handleKeyDown = (event) => {
    // Permitir navegação por teclado nos resultados
    if (event.key === 'Escape') {
      setSearchQuery('');
      setResults([]);
      setHasSearched(false);
    }
  };

  const handleOpenPatient = (patientId) => {
    onClose();
    navigate(`/pacientes/cadastro/${patientId}`);
  };

  const handleCreateNew = () => {
    onClose();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/components/PatientQuickCreateModal.jsx:168',message:'quick create new click',data:{route:'/pacientes/cadastro'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    navigate('/pacientes/cadastro');
  };

  const searchPlaceholder = () => {
    if (searchType === 'cpf') return '000.000.000-00';
    if (searchType === 'phone') return '(00) 00000-0000';
    return 'Digite o nome do paciente';
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content patient-quick-create-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="patient-quick-create-header">
          <div className="patient-quick-create-header-icon">
            <UserPlus size={24} />
          </div>
          <div className="patient-quick-create-header-text">
            <h2 className="patient-quick-create-title">Pesquisar Cadastro</h2>
            <p className="patient-quick-create-subtitle">
              Antes de cadastrar, pesquise para evitar duplicidades
            </p>
          </div>
          <button
            type="button"
            className="modal-close-button"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Instrução */}
        <div className="patient-quick-create-instruction">
          <p>Escolha um Filtro</p>
        </div>

        {/* Filtros Radio */}
        <div className="patient-quick-create-filters">
          <label className="patient-quick-create-radio">
            <input
              type="radio"
              name="searchType"
              value="name"
              checked={searchType === 'name'}
              onChange={(e) => {
                setSearchType(e.target.value);
                setSearchQuery('');
                setResults([]);
                setHasSearched(false);
                setIsLoading(false);
                if (searchTimeoutRef.current) {
                  clearTimeout(searchTimeoutRef.current);
                }
              }}
            />
            <span>Nome</span>
          </label>
          <label className="patient-quick-create-radio">
            <input
              type="radio"
              name="searchType"
              value="cpf"
              checked={searchType === 'cpf'}
              onChange={(e) => {
                setSearchType(e.target.value);
                setSearchQuery('');
                setResults([]);
                setHasSearched(false);
                setIsLoading(false);
                if (searchTimeoutRef.current) {
                  clearTimeout(searchTimeoutRef.current);
                }
              }}
            />
            <span>CPF</span>
          </label>
          <label className="patient-quick-create-radio">
            <input
              type="radio"
              name="searchType"
              value="phone"
              checked={searchType === 'phone'}
              onChange={(e) => {
                setSearchType(e.target.value);
                setSearchQuery('');
                setResults([]);
                setHasSearched(false);
                setIsLoading(false);
                if (searchTimeoutRef.current) {
                  clearTimeout(searchTimeoutRef.current);
                }
              }}
            />
            <span>Telefone</span>
          </label>
        </div>

        {/* Campo de Busca */}
        <div className="patient-quick-create-search">
          <div className="patient-quick-create-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              className="patient-quick-create-input-field"
              value={formatSearchValue(searchQuery)}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder()}
            />
          </div>
        </div>

        {/* Resultados - Mostrar enquanto digita ou após busca */}
        {(isLoading || hasSearched || results.length > 0 || (searchQuery && normalizeText(searchQuery).length >= 3)) && (
          <>
            {isLoading ? (
              <div className="patient-quick-create-loading">
                <Loader2 size={24} className="animate-spin" />
                <p>Carregando...</p>
              </div>
            ) : hasSearched && results.length === 0 ? (
              <div className="patient-quick-create-empty">
                <User size={48} />
                <p>Nenhum paciente encontrado</p>
                <Button
                  variant="secondary"
                  onClick={handleCreateNew}
                  className="patient-quick-create-new-button"
                >
                  Cadastrar novo paciente
                </Button>
              </div>
            ) : results.length > 0 ? (
              <div className="patient-quick-create-results">
                <p className="patient-quick-create-results-label">Paciente localizado</p>
                <div className="patient-quick-create-results-list">
                  {results.map((patient) => {
                    const phone = getPatientPhone(patient.id);
                    const cpf = patient.cpf ? maskCpf(patient.cpf) : '';
                    return (
                      <div
                        key={patient.id}
                        className="patient-quick-create-result-item"
                        onClick={() => handleOpenPatient(patient.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleOpenPatient(patient.id);
                          }
                        }}
                      >
                        <div className="patient-quick-create-result-info">
                          <div className="patient-quick-create-result-name">
                            {patient.full_name || patient.nickname || 'Sem nome'}
                          </div>
                          <div className="patient-quick-create-result-details">
                            {phone && (
                              <span className="patient-quick-create-result-detail">
                                <Phone size={14} />
                                {phone}
                              </span>
                            )}
                            {cpf && (
                              <span className="patient-quick-create-result-detail">
                                <CreditCard size={14} />
                                {cpf}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {results.length === 10 && (
                  <p className="patient-quick-create-results-limit">
                    Mostrando os primeiros 10 resultados
                  </p>
                )}
              </div>
            ) : null}
          </>
        )}

        {/* Botão CTA Secundário */}
        {hasSearched && results.length > 0 && (
          <div className="patient-quick-create-cta">
            <Button
              variant="secondary"
              onClick={handleCreateNew}
              className="patient-quick-create-new-button-full"
            >
              Cadastrar novo paciente
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
