import { useEffect, useState, useMemo, useRef, Component } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { loadDb } from '../db/index.js';
import { createId } from '../services/helpers.js';
import { getAppointmentDetails, APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { 
  saveClinicalEvolution, 
  addProcedure, 
  addPlannedProcedure,
  updatePlannedProcedure,
  removePlannedProcedure,
  getClinicalData, 
  logClinicalEvent,
  getClinicalEvents,
  listClinicalEvolutions,
  updateClinicalEvolution,
  saveBudget,
  getBudget,
  updateBudgetStatus,
  BUDGET_STATUS
} from '../services/clinicalService.js';
import { createBudget, listBudgets, updateBudgetTotal } from '../services/budgetsService.js';
import { createBudgetItems, listBudgetItemsByBudgetIds } from '../services/budgetItemsService.js';
import { supabase } from '../lib/supabaseClient.ts';
import { SectionCard } from '../components/SectionCard.jsx';
import { 
  FileText, 
  ClipboardList, 
  Calendar, 
  DollarSign, 
  FileCheck, 
  CreditCard,
  Stethoscope,
  Activity,
  X,
  Save,
  Plus,
  Download,
  Send,
  CheckCircle2,
  ArrowLeft,
  Edit,
  Trash2,
  FileText as FileTextIcon,
  Clock,
  History,
  FileSignature
} from 'lucide-react';
import ProcedureSelectorModal from '../components/ProcedureSelectorModal.jsx';
import DocumentsSection from '../components/clinical/DocumentsSection.jsx';
import { getLeadById } from '../services/crmService.js';
import { RegisterPatientFromLeadModal } from '../components/agenda/RegisterPatientFromLeadModal.jsx';
import { listProcedures, getPriceTableForPatient, getDefaultPriceTable, PROCEDURE_STATUS } from '../services/priceBaseService.js';
import { getPatient, PENDING_FIELDS_MAP } from '../services/patientService.js';

function ClinicalAppointmentPageContent() {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:ClinicalAppointmentPageContent',message:'Component render started',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('desenvolvimento');
  const [appointment, setAppointment] = useState(null);
  const [patient, setPatient] = useState(null);
  const [professional, setProfessional] = useState(null);
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRegisterFromLead, setShowRegisterFromLead] = useState(false);
  const [sectionToast, setSectionToast] = useState(null);

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:useEffect',message:'useEffect started',data:{appointmentId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    try {
      if (appointmentId) {
        loadAppointmentData();
      } else {
        setError('ID do atendimento não fornecido');
        setLoading(false);
      }
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:useEffect catch',message:'Error in useEffect',data:{error:err.message,stack:err.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      console.error('Erro no useEffect:', err);
      setError(err.message || 'Erro ao inicializar página');
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId]);

  const loadAppointmentData = () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:loadAppointmentData',message:'loadAppointmentData started',data:{appointmentId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    try {
      const db = loadDb();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:loadAppointmentData',message:'DB loaded',data:{hasDb:!!db,hasPatients:!!db?.patients,hasTeam:!!db?.team,hasRooms:!!db?.rooms},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      if (!db) {
        throw new Error('Banco de dados não disponível');
      }

      const details = getAppointmentDetails(appointmentId);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:loadAppointmentData',message:'Appointment details fetched',data:{hasDetails:!!details,hasAppointment:!!details?.appointment,status:details?.appointment?.status,patientId:details?.appointment?.patientId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      if (!details || !details.appointment) {
        setError('Atendimento não encontrado');
        setLoading(false);
        setTimeout(() => {
          navigate('/gestao-comercial/jornada-do-paciente');
        }, 2000);
        return;
      }

      const apt = details.appointment;

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:loadAppointmentData',message:'Checking appointment status',data:{appointmentStatus:apt.status,expectedStatus:APPOINTMENT_STATUS.EM_ATENDIMENTO,statusMatch:apt.status === APPOINTMENT_STATUS.EM_ATENDIMENTO},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      if (apt.status !== APPOINTMENT_STATUS.EM_ATENDIMENTO) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:loadAppointmentData',message:'Status check failed',data:{appointmentStatus:apt.status,expectedStatus:APPOINTMENT_STATUS.EM_ATENDIMENTO},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        setError('Atendimento não está em andamento');
        setLoading(false);
        setTimeout(() => {
          navigate('/gestao-comercial/jornada-do-paciente');
        }, 2000);
        return;
      }

      setAppointment(apt);
      
      // Usar dados já retornados por getAppointmentDetails
      const patientData = details.patient || null;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:loadAppointmentData',message:'Patient data found',data:{hasPatient:!!patientData,patientId:apt.patientId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      setPatient(patientData);

      const professionalData = details.professional || null;
      setProfessional(professionalData);

      const roomData = details.room || null;
      setRoom(roomData);

      setLoading(false);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:loadAppointmentData',message:'loadAppointmentData completed',data:{hasAppointment:!!apt,hasPatient:!!patientData,hasProfessional:!!professionalData,hasRoom:!!roomData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:loadAppointmentData catch',message:'Error in loadAppointmentData',data:{error:err.message,stack:err.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      console.error('Erro ao carregar dados do atendimento:', err);
      setError(err.message || 'Erro ao carregar dados do atendimento');
      setLoading(false);
      // Navegar após um pequeno delay para evitar problemas de renderização
      setTimeout(() => {
        navigate('/gestao-comercial/jornada-do-paciente');
      }, 2000);
    }
  };

  const menuItems = useMemo(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:menuItems',message:'menuItems useMemo executing',data:{hasPatient:!!patient,patientInsurance:patient?.insurance_provider},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    const items = [
      { id: 'desenvolvimento', label: 'Observações do Orçamento', icon: FileText },
      { id: 'procedimentos', label: 'Procedimentos a Realizar', icon: ClipboardList },
      { id: 'planejamento', label: 'Planejamento', icon: Calendar },
      { id: 'orcamento', label: 'Orçamento', icon: DollarSign },
      { id: 'contratos', label: 'Contratos', icon: FileCheck },
      { id: 'documentos', label: 'Documentos', icon: FileSignature },
    ];

    // Adicionar Convênios apenas se paciente tiver convênio
    if (patient?.insurance_provider) {
      items.push({ id: 'convenios', label: 'Convênios', icon: CreditCard });
    }

    items.push({ id: 'dados-clinicos', label: 'Dados Clínicos', icon: Stethoscope });

    return items;
  }, [patient]);

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:render check',message:'Render state check',data:{loading,error:!!error,hasAppointment:!!appointment,hasPatient:!!patient},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Carregando...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: '2rem' }}>
        <div style={{ color: 'var(--color-error)', marginBottom: '1rem' }}>Erro: {error}</div>
        <button 
          type="button" 
          className="button primary"
          onClick={() => navigate('/gestao-comercial/jornada-do-paciente')}
        >
          Voltar para Jornada do Paciente
        </button>
      </div>
    );
  }

  if (!appointment) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Carregando dados do atendimento...</div>
      </div>
    );
  }

  const isLeadWithoutPatient = Boolean(appointment.leadId && !appointment.patientId);
  const leadForRegister = appointment.leadId ? getLeadById(appointment.leadId) : null;

  if (!patient && isLeadWithoutPatient && leadForRegister) {
    return (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '2rem', maxWidth: 480, margin: '0 auto' }}>
          <div
            role="alert"
            style={{
              marginBottom: '1.5rem',
              padding: '1rem 1.25rem',
              borderRadius: '0.5rem',
              backgroundColor: '#fef3c7',
              border: '1px solid #f59e0b',
              color: '#92400e',
              fontSize: '0.9375rem',
              lineHeight: 1.5,
              width: '100%',
            }}
          >
            <strong>Paciente não cadastrado</strong>
            <br />
            Este atendimento veio do Pipeline (CRM) e o lead ainda não está vinculado ao cadastro. Cadastre o paciente para continuar o atendimento.
          </div>
          <button
            type="button"
            className="button primary"
            onClick={() => setShowRegisterFromLead(true)}
            style={{ marginBottom: '1rem' }}
          >
            Cadastrar paciente
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => navigate('/gestao-comercial/jornada-do-paciente')}
          >
            Voltar para Jornada do Paciente
          </button>
        </div>
        <RegisterPatientFromLeadModal
          open={showRegisterFromLead}
          onClose={() => setShowRegisterFromLead(false)}
          lead={leadForRegister}
          appointmentId={appointment.id}
          user={user}
          onSuccess={() => {
            setShowRegisterFromLead(false);
            loadAppointmentData();
          }}
        />
      </>
    );
  }

  if (!patient) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Carregando dados do atendimento...</div>
      </div>
    );
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Data não disponível';
    try {
      const date = new Date(dateStr + 'T00:00:00');
      if (isNaN(date.getTime())) return 'Data inválida';
      return date.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch (err) {
      return 'Data inválida';
    }
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return 'Horário não disponível';
    try {
      return timeStr.slice(0, 5);
    } catch (err) {
      return 'Horário inválido';
    }
  };

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:render',message:'Starting main render',data:{hasAppointment:!!appointment,hasPatient:!!patient,patientId:patient?.id,menuItemsCount:menuItems.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  
  // Renderização simplificada para debug
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:render return',message:'About to return JSX',data:{hasAppointment:!!appointment,hasPatient:!!patient},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  
  // Agrupar itens do menu
  const atendimentoItems = menuItems.filter(item => 
    ['desenvolvimento', 'procedimentos', 'planejamento', 'orcamento', 'contratos', 'documentos'].includes(item.id)
  );
  const dadosClinicosItems = menuItems.filter(item => 
    ['convenios', 'dados-clinicos'].includes(item.id)
  );

  return (
    <div className="clinical-appointment-page">
      {/* Header Fixo */}
      <header className="clinical-appointment-header">
        <div className="clinical-appointment-header-content">
          <button 
            type="button" 
            className="clinical-appointment-back-btn"
            onClick={() => navigate('/gestao-comercial/jornada-do-paciente')}
            aria-label="Voltar"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="clinical-appointment-header-info">
            <h1 className="clinical-appointment-header-title">
              {patient?.full_name || patient?.nickname || patient?.social_name || 'Paciente'}
            </h1>
            <div className="clinical-appointment-header-meta">
              <span>Dr(a). {professional?.nomeCompleto || professional?.name || 'Profissional'}</span>
              <span className="clinical-appointment-header-meta-sep">•</span>
              <span>{appointment?.date ? formatDate(appointment.date) : 'Data não disponível'}</span>
              <span className="clinical-appointment-header-meta-sep">•</span>
              <span>{appointment?.startTime ? formatTime(appointment.startTime) : 'Horário não disponível'}</span>
              {room && (
                <>
                  <span className="clinical-appointment-header-meta-sep">•</span>
                  <span>{room.name}</span>
                </>
              )}
            </div>
          </div>
          <div className="clinical-appointment-header-status-badge">
            <Activity size={16} />
            <span>Em Atendimento</span>
          </div>
        </div>
      </header>

      {/* Container Principal */}
      <div className="clinical-appointment-container">
        {/* Sidebar Clínica */}
        <aside className="clinical-appointment-sidebar-card">
          <nav className="clinical-appointment-nav">
            {/* Grupo: Atendimento */}
            <div className="clinical-appointment-nav-group">
              <h3 className="clinical-appointment-nav-group-title">Atendimento</h3>
              <div className="clinical-appointment-nav-items">
                {atendimentoItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`clinical-appointment-nav-item ${activeSection === item.id ? 'active' : ''}`}
                      onClick={() => setActiveSection(item.id)}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Grupo: Dados Clínicos */}
            <div className="clinical-appointment-nav-group">
              <h3 className="clinical-appointment-nav-group-title">Dados Clínicos</h3>
              <div className="clinical-appointment-nav-items">
                {dadosClinicosItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`clinical-appointment-nav-item ${activeSection === item.id ? 'active' : ''}`}
                      onClick={() => setActiveSection(item.id)}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>
        </aside>

        {/* Área de Conteúdo */}
        <main className="clinical-appointment-main">
          {sectionToast && (
            <div
              className={`toast ${sectionToast.type}`}
              role="status"
              style={{ position: 'sticky', top: '1rem', zIndex: 10, marginBottom: '1rem' }}
            >
              {sectionToast.message}
            </div>
          )}
          {activeSection === 'desenvolvimento' && (
            <DesenvolvimentoClinicoSection appointmentId={appointmentId} user={user} patient={patient} />
          )}
          {activeSection === 'procedimentos' && (
            <ProcedimentosSection appointmentId={appointmentId} user={user} appointment={appointment} patient={patient} />
          )}
          {activeSection === 'planejamento' && (
            <PlanejamentoSection
              appointmentId={appointmentId}
              user={user}
              appointment={appointment}
              patient={patient}
              onNavigateToOrcamento={() => setActiveSection('orcamento')}
              onShowToast={(message) => {
                setSectionToast({ message, type: 'success' });
                setTimeout(() => setSectionToast(null), 3000);
              }}
            />
          )}
          {activeSection === 'orcamento' && (
            <OrcamentoSection appointmentId={appointmentId} user={user} appointment={appointment} patient={patient} />
          )}
          {activeSection === 'contratos' && (
            <ContratosSection appointmentId={appointmentId} patientId={patient?.id} />
          )}
          {activeSection === 'convenios' && patient && (
            <ConveniosSection patient={patient} />
          )}
          {activeSection === 'dados-clinicos' && patient && (
            <DadosClinicosSection appointmentId={appointmentId} patientId={patient.id} />
          )}
          {activeSection === 'documentos' && patient && (
            <DocumentsSection 
              appointmentId={appointmentId} 
              patient={patient} 
              appointment={appointment}
              professional={professional}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// Seção: Observações do Orçamento (observações clínicas e administrativas vinculadas ao orçamento)
function DesenvolvimentoClinicoSection({ appointmentId, user, patient }) {
  const [evolution, setEvolution] = useState('');
  const [saving, setSaving] = useState(false);
  const [evolutions, setEvolutions] = useState([]);
  const [loadingEvolutions, setLoadingEvolutions] = useState(true);
  const [showAllEvolutions, setShowAllEvolutions] = useState(false);
  const [editingEvolutionId, setEditingEvolutionId] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadEvolutions();
  }, [appointmentId, patient]);

  const loadEvolutions = () => {
    setLoadingEvolutions(true);
    try {
      const patientId = patient?.id || null;
      const allEvolutions = listClinicalEvolutions(patientId, appointmentId);
      setEvolutions(allEvolutions);
    } catch (error) {
      console.error('Erro ao carregar observações:', error);
      setEvolutions([]);
    } finally {
      setLoadingEvolutions(false);
    }
  };

  const handleSave = async () => {
    const trimmed = (evolution || '').trim();
    if (!user || !trimmed) return;
    setSaving(true);
    try {
      const patientId = patient?.id || null;
      const budget = getBudget(appointmentId);
      const budgetId = budget?.id || null;
      saveClinicalEvolution(user, appointmentId, trimmed, patientId, budgetId);
      logClinicalEvent(appointmentId, 'evolution_saved', { budgetId: budgetId || undefined }, user.id);
      setEvolution('');
      loadEvolutions();
    } catch (error) {
      console.error('Erro ao salvar observação:', error);
    } finally {
      setSaving(false);
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getProfessionalName = (professionalId) => {
    if (!professionalId) return 'Profissional não identificado';
    try {
      const db = loadDb();
      const professional = db.collaborators?.find((c) => c.id === professionalId);
      return professional?.nomeCompleto || professional?.name || 'Profissional não identificado';
    } catch {
      return 'Profissional não identificado';
    }
  };

  const handleStartEdit = (evo) => {
    if (!isAdmin) return;
    setEditingEvolutionId(evo.id);
    setEditingContent(evo.content);
  };

  const handleCancelEdit = () => {
    setEditingEvolutionId(null);
    setEditingContent('');
  };

  const handleSaveEdit = async () => {
    if (!isAdmin || !editingEvolutionId) return;
    setSavingEdit(true);
    try {
      updateClinicalEvolution(user, editingEvolutionId, editingContent);
      logClinicalEvent(appointmentId, 'evolution_edited', { evolutionId: editingEvolutionId }, user.id);
      setEditingEvolutionId(null);
      setEditingContent('');
      loadEvolutions(); // Recarregar histórico
      setSavingEdit(false);
    } catch (error) {
      console.error('Erro ao editar evolução:', error);
      alert(error.message || 'Erro ao editar evolução');
      setSavingEdit(false);
    }
  };

  const displayedEvolutions = showAllEvolutions ? evolutions : evolutions.slice(0, 5);
  const hasMoreEvolutions = evolutions.length > 5;

  return (
    <SectionCard
      title="Observações do Orçamento"
      description="Registre observações clínicas e administrativas relacionadas a este orçamento"
      actions={
        <button
          type="button"
          className="button primary"
          onClick={handleSave}
          disabled={saving || !(evolution || '').trim()}
        >
          <Save size={16} />
          {saving ? 'Salvando...' : 'Salvar observações'}
        </button>
      }
    >
      <textarea
        className="clinical-evolution-textarea"
        placeholder="Descreva observações clínicas, cuidados, condições ou orientações relacionadas a este orçamento..."
        value={evolution}
        onChange={(e) => setEvolution(e.target.value)}
        rows={12}
      />

      {/* Histórico de observações (mais recente primeiro) */}
      <div className="clinical-evolutions-history">
        <h3 className="clinical-evolutions-history-title">Histórico de observações</h3>

        {loadingEvolutions ? (
          <div className="clinical-evolutions-loading">Carregando histórico...</div>
        ) : evolutions.length === 0 ? (
          <div className="clinical-evolutions-empty">
            Nenhuma observação registrada ainda.
          </div>
        ) : (
          <>
            <div className="clinical-evolutions-list">
              {displayedEvolutions.map((evo) => (
                <div key={evo.id} className="clinical-evolution-item">
                  <div className="clinical-evolution-header">
                    <div className="clinical-evolution-header-left">
                      <span className="clinical-evolution-date">
                        {formatDateTime(evo.createdAt)}
                      </span>
                      {evo.updatedAt && (
                        <span className="clinical-evolution-edited">
                          (Editado em {formatDateTime(evo.updatedAt)})
                        </span>
                      )}
                      <span className="clinical-evolution-professional" title="Usuário que registrou">
                        {getProfessionalName(evo.professionalId)}
                      </span>
                    </div>
                    {isAdmin && editingEvolutionId !== evo.id && (
                      <button
                        type="button"
                        className="button-icon clinical-evolution-edit-btn"
                        onClick={() => handleStartEdit(evo)}
                        title="Editar observação"
                      >
                        <Edit size={16} />
                      </button>
                    )}
                  </div>
                  {editingEvolutionId === evo.id ? (
                    <div className="clinical-evolution-edit-mode">
                      <textarea
                        className="clinical-evolution-edit-textarea"
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        rows={6}
                      />
                      <div className="clinical-evolution-edit-actions">
                        <button
                          type="button"
                          className="button secondary"
                          onClick={handleCancelEdit}
                          disabled={savingEdit}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="button primary"
                          onClick={handleSaveEdit}
                          disabled={savingEdit || !editingContent.trim()}
                        >
                          <Save size={16} />
                          {savingEdit ? 'Salvando...' : 'Salvar'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="clinical-evolution-content">
                      {evo.content.split('\n').map((line, idx) => (
                        <div key={idx}>{line || '\u00A0'}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {hasMoreEvolutions && (
              <button
                type="button"
                className="button secondary clinical-evolutions-show-more"
                onClick={() => setShowAllEvolutions(!showAllEvolutions)}
              >
                {showAllEvolutions ? 'Ver menos' : `Ver mais (${evolutions.length - 5} anteriores)`}
              </button>
            )}
          </>
        )}
      </div>
    </SectionCard>
  );
}

// Seção: Procedimentos a Realizar
function ProcedimentosSection({ appointmentId, user, appointment, patient }) {
  const [procedures, setProcedures] = useState([]);
  const [showProcedureSelector, setShowProcedureSelector] = useState(false);

  useEffect(() => {
    const run = async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      const blockedStatuses = new Set(['CANCELADO', 'SUSPENSO', 'REPROVADO', 'EXPIRADO']);

      try {
        const budgets = await listBudgets();
        const filteredBudgets = budgets.filter((budget) => {
          const status = budget?.status || '';
          if (blockedStatuses.has(status)) return false;
          if (status === 'AGUARDANDO_INICIO' || status === 'EM_ANDAMENTO') return true;
          if (status === 'CONCLUIDO') {
            const finishedAt = budget?.finished_at || budget?.updated_at || '';
            if (!finishedAt) return false;
            return new Date(finishedAt) >= cutoffDate;
          }
          return false;
        });

        const budgetIds = filteredBudgets.map((budget) => budget.id);
        const items = await listBudgetItemsByBudgetIds(budgetIds);

        const mappedProcedures = items.map((item) => ({
          id: item.id || createId('budget_item'),
          name: item.name || item.procedure_name || item.title || 'Procedimento',
          tooth: item.tooth || item.dente || '',
          region: item.region || item.regiao || '',
          value: Number(item.unit_price ?? item.value ?? item.price ?? 0),
          quantity: Number(item.quantity ?? 1),
          observations: item.notes || item.observations || '',
          status: item.status || 'pending',
        }));

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:ProcedimentosSection',message:'supabase filter snapshot',data:{appointmentId,budgetsCount:budgets.length,filteredBudgetsCount:filteredBudgets.length,itemsCount:items.length,cutoffDate:cutoffDate.toISOString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:ProcedimentosSection',message:'procedures mapped snapshot',data:{mappedProceduresCount:mappedProcedures.length,exampleKeys:mappedProcedures[0] ? Object.keys(mappedProcedures[0]) : []},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion

        setProcedures(mappedProcedures);
      } catch (error) {
        console.error('Erro ao carregar procedimentos do orçamento:', error);
        setProcedures([]);
      }
    };

    run();
  }, [appointmentId]);

  const handleSelectProcedure = (procedureData) => {
    if (!user) return;
    // Adaptar estrutura para o formato esperado pelo serviço
    const adaptedProcedure = {
      name: procedureData.title,
      tooth: procedureData.tooth,
      region: procedureData.region,
      value: procedureData.unitValue,
      quantity: procedureData.quantity,
      observations: procedureData.observations,
      procedureCatalogId: procedureData.procedureCatalogId,
      source: 'price_base',
    };
    addProcedure(user, appointmentId, adaptedProcedure);
    setProcedures([...procedures, adaptedProcedure]);
    setShowProcedureSelector(false);
  };

  return (
    <>
      <SectionCard
        title="Procedimentos a Realizar"
        description="Gerencie os procedimentos realizados durante o atendimento"
        actions={
          <button 
            type="button" 
            className="button primary"
            onClick={() => setShowProcedureSelector(true)}
          >
            <Plus size={16} />
            Adicionar Procedimento
          </button>
        }
      >
        <div className="clinical-section-filter-label">
          Exibindo: aguardando início, em andamento e concluídos (últimos 30 dias)
        </div>
        {procedures.length === 0 ? (
          <div className="clinical-empty-state">
            <ClipboardList size={48} />
            <p>Nenhum procedimento encontrado para o filtro atual.</p>
            <p className="clinical-empty-hint">São exibidos apenas contratos aguardando início, em andamento ou concluídos nos últimos 30 dias.</p>
          </div>
        ) : (
          <div className="clinical-procedures-list">
            {procedures.map((proc, index) => (
              <div key={index} className="clinical-procedure-card">
                <div className="clinical-procedure-info">
                  <h3>{proc.name}</h3>
                  <p>{proc.tooth || proc.region}</p>
                  <span className="clinical-procedure-value">R$ {proc.value?.toFixed(2) || '0,00'}</span>
                </div>
                <span className={`clinical-procedure-status clinical-procedure-status--${proc.status || 'pending'}`}>
                  {proc.status === 'completed' ? 'Concluído' : 'Pendente'}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      {showProcedureSelector && (
        <ProcedureSelectorModal
          open={showProcedureSelector}
          onClose={() => setShowProcedureSelector(false)}
          onSelect={handleSelectProcedure}
          patient={patient}
          appointmentId={appointmentId}
        />
      )}
    </>
  );
}

// Seção: Planejamento (estrutura clínica; sem valores; precificação na aba Orçamento)
function PlanejamentoSection({ appointmentId, user, appointment, patient, onNavigateToOrcamento, onShowToast }) {
  const [plannedProcedures, setPlannedProcedures] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState('');
  const [addToothOrRegion, setAddToothOrRegion] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editToothOrRegion, setEditToothOrRegion] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [procedureOptions, setProcedureOptions] = useState([]);
  const [procedureDropdownOpen, setProcedureDropdownOpen] = useState(false);
  const [editProcedureDropdownOpen, setEditProcedureDropdownOpen] = useState(false);
  const procedureDropdownRef = useRef(null);
  const editProcedureDropdownRef = useRef(null);

  const loadPlanned = () => {
    const clinicalData = getClinicalData(appointmentId);
    const list = clinicalData?.plannedProcedures || [];
    const sorted = [...list].sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
    setPlannedProcedures(sorted);
  };

  useEffect(() => {
    loadPlanned();
  }, [appointmentId]);

  // Carregar procedimentos cadastrados (Base de Preço) quando o form de adicionar ou edição estiver ativo
  useEffect(() => {
    if (!showAddForm && !editingId) return;
    const priceTable = patient ? getPriceTableForPatient(patient) : getDefaultPriceTable();
    const priceTableId = priceTable?.id || null;
    if (!priceTableId) {
      setProcedureOptions([]);
      return;
    }
    const list = listProcedures({
      priceTableId,
      status: PROCEDURE_STATUS.ATIVO,
      sortBy: 'name',
    });
    setProcedureOptions(list.map((p) => ({ id: p.id, title: p.title || p.name || '' })).filter((p) => p.title));
  }, [showAddForm, editingId, patient]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e) => {
      const addEl = procedureDropdownRef.current;
      const editEl = editProcedureDropdownRef.current;
      if (addEl && !addEl.contains(e.target) && (!editEl || !editEl.contains(e.target))) {
        setProcedureDropdownOpen(false);
      }
      if (editEl && !editEl.contains(e.target) && (!addEl || !addEl.contains(e.target))) {
        setEditProcedureDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddProcedure = () => {
    setError('');
    const name = (addName || '').trim();
    const toothRegion = (addToothOrRegion || '').trim();
    if (!name) {
      setError('Procedimento é obrigatório.');
      return;
    }
    if (!toothRegion) {
      setError('Dente / Região é obrigatório.');
      return;
    }
    setSaving(true);
    try {
      addPlannedProcedure(user, appointmentId, {
        name,
        tooth: toothRegion,
        region: toothRegion,
        notes: (addNotes || '').trim(),
      });
      loadPlanned();
      setAddName('');
      setAddToothOrRegion('');
      setAddNotes('');
      setShowAddForm(false);
    } catch (err) {
      setError(err?.message || 'Erro ao salvar no planejamento.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (proc) => {
    setEditingId(proc.id);
    setEditName(proc.name || '');
    setEditToothOrRegion(proc.tooth || proc.region || '');
    setEditNotes(proc.notes || '');
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditToothOrRegion('');
    setEditNotes('');
  };

  const handleSaveEdit = () => {
    const name = (editName || '').trim();
    const toothRegion = (editToothOrRegion || '').trim();
    if (!name || !toothRegion) {
      setError('Procedimento e Dente/Região são obrigatórios.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      updatePlannedProcedure(user, appointmentId, editingId, {
        name,
        tooth: toothRegion,
        region: toothRegion,
        notes: (editNotes || '').trim(),
      });
      loadPlanned();
      cancelEdit();
    } catch (err) {
      setError(err?.message || 'Erro ao atualizar.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = (plannedId) => {
    if (!window.confirm('Remover este item do planejamento?')) return;
    setSaving(true);
    setError('');
    try {
      removePlannedProcedure(user, appointmentId, plannedId);
      loadPlanned();
      if (editingId === plannedId) cancelEdit();
    } catch (err) {
      setError(err?.message || 'Erro ao remover.');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateBudgetFromPlan = () => {
    if (!user || plannedProcedures.length === 0) return;
    setError('');
    try {
      const procedures = plannedProcedures.map((proc) => ({
        id: proc.id || createId('proc'),
        name: proc.name,
        tooth: proc.tooth || '',
        region: proc.region || '',
        quantity: 1,
        unitValue: 0,
        totalValue: 0,
        observations: proc.notes || '',
      }));
      saveBudget(user, appointmentId, {
        status: BUDGET_STATUS.RASCUNHO,
        planName: '',
        procedures,
        paymentType: 'a_vista',
        downPayment: 0,
        installments: 1,
        installmentValue: 0,
        paymentMethod: 'dinheiro',
        discount: 0,
        interest: 0,
        validityDate: '',
        professionalId: appointment?.professionalId || null,
        createdAt: new Date().toISOString(),
        createdBy: user.id,
      });
      logClinicalEvent(appointmentId, 'budget_generated', {
        plannedProceduresCount: plannedProcedures.length,
      }, user.id);
      if (onNavigateToOrcamento) onNavigateToOrcamento();
      if (onShowToast) onShowToast('Orçamento gerado a partir do planejamento.');
    } catch (err) {
      setError(err?.message || 'Erro ao gerar orçamento.');
    }
  };

  return (
    <SectionCard
      title="Planejamento do Tratamento"
      description="Defina as etapas e procedimentos do tratamento"
      actions={
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button secondary"
            onClick={() => { setShowAddForm((v) => !v); setError(''); cancelEdit(); }}
          >
            <Plus size={16} />
            {showAddForm ? 'Cancelar' : 'Adicionar procedimento'}
          </button>
          {plannedProcedures.length > 0 && (
            <button
              type="button"
              className="button primary"
              onClick={handleGenerateBudgetFromPlan}
            >
              <DollarSign size={16} />
              Gerar Orçamento a partir do Planejamento
            </button>
          )}
        </div>
      }
    >
      {error ? (
        <div className="clinical-planned-error" style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '0.5rem', background: '#fef2f2', color: '#991b1b', fontSize: '0.875rem' }}>
          {error}
        </div>
      ) : null}
      {showAddForm && (
        <div className="clinical-planned-add-form" style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
            <span>Procedimento</span>
            <div ref={procedureDropdownRef} style={{ position: 'relative' }}>
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onFocus={() => setProcedureDropdownOpen(true)}
                placeholder="Clique para ver procedimentos cadastrados"
                style={{ padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem', width: '100%', boxSizing: 'border-box' }}
              />
              {procedureDropdownOpen && procedureOptions.length > 0 && (
                <ul
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    margin: 0,
                    padding: 0,
                    listStyle: 'none',
                    maxHeight: '12rem',
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    background: '#fff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    zIndex: 10,
                  }}
                >
                  {procedureOptions
                    .filter((p) => !addName.trim() || p.title.toLowerCase().includes(addName.toLowerCase()))
                    .map((p) => (
                      <li
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && (setAddName(p.title), setProcedureDropdownOpen(false))}
                        onClick={() => { setAddName(p.title); setProcedureDropdownOpen(false); }}
                        style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem', borderBottom: '1px solid #f1f5f9' }}
                      >
                        {p.title}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
            <span>Dente / Região</span>
            <input
              type="text"
              value={addToothOrRegion}
              onChange={(e) => setAddToothOrRegion(e.target.value)}
              placeholder="Ex.: 18, superior direita"
              style={{ padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
            <span>Observações clínicas (opcional)</span>
            <textarea
              value={addNotes}
              onChange={(e) => setAddNotes(e.target.value)}
              placeholder="Observações"
              rows={2}
              style={{ padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem', resize: 'vertical' }}
            />
          </label>
          <button
            type="button"
            className="button primary"
            disabled={saving || !addName.trim() || !addToothOrRegion.trim()}
            onClick={handleAddProcedure}
          >
            {saving ? 'Salvando…' : 'Salvar no Planejamento'}
          </button>
        </div>
      )}
      {plannedProcedures.length === 0 && !showAddForm ? (
        <div className="clinical-empty-state">
          <Calendar size={48} />
          <p>Nenhum procedimento planejado ainda.</p>
          <button
            type="button"
            className="button primary"
            onClick={() => setShowAddForm(true)}
            style={{ marginTop: '1rem' }}
          >
            <Plus size={16} />
            Adicionar procedimento
          </button>
        </div>
      ) : (
        <div className="clinical-planned-list">
          {plannedProcedures.map((proc) => (
            <div key={proc.id} className="clinical-planned-item" style={{ border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1rem', marginBottom: '0.75rem' }}>
              {editingId === proc.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div ref={editProcedureDropdownRef} style={{ position: 'relative' }}>
                    <label style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem', display: 'block' }}>Procedimento</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onFocus={() => setEditProcedureDropdownOpen(true)}
                      placeholder="Clique para ver procedimentos cadastrados"
                      style={{ padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem', width: '100%', boxSizing: 'border-box' }}
                    />
                    {editProcedureDropdownOpen && procedureOptions.length > 0 && (
                      <ul
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          margin: 0,
                          padding: 0,
                          listStyle: 'none',
                          maxHeight: '12rem',
                          overflowY: 'auto',
                          border: '1px solid #e2e8f0',
                          borderRadius: '0.5rem',
                          background: '#fff',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                          zIndex: 10,
                        }}
                      >
                        {procedureOptions
                          .filter((p) => !editName.trim() || p.title.toLowerCase().includes(editName.toLowerCase()))
                          .map((p) => (
                            <li
                              key={p.id}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => e.key === 'Enter' && (setEditName(p.title), setEditProcedureDropdownOpen(false))}
                              onClick={() => { setEditName(p.title); setEditProcedureDropdownOpen(false); }}
                              style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem', borderBottom: '1px solid #f1f5f9' }}
                            >
                              {p.title}
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                  <input
                    type="text"
                    value={editToothOrRegion}
                    onChange={(e) => setEditToothOrRegion(e.target.value)}
                    placeholder="Dente / Região"
                    style={{ padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}
                  />
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Observações"
                    rows={2}
                    style={{ padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="button primary" disabled={saving} onClick={handleSaveEdit}>
                      Salvar
                    </button>
                    <button type="button" className="button secondary" onClick={cancelEdit}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>{proc.name}</h3>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>
                      {proc.tooth || proc.region || '—'}
                    </p>
                    {proc.notes ? (
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: '#475569' }}>{proc.notes}</p>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button type="button" className="button-link" onClick={() => startEdit(proc)}>
                      Editar
                    </button>
                    <button type="button" className="button-link" style={{ color: '#dc2626' }} onClick={() => handleRemove(proc.id)}>
                      Remover
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// Seção: Orçamento
function OrcamentoSection({ appointmentId, user, appointment: appointmentProp, patient: patientProp }) {
  const [activeTab, setActiveTab] = useState('geral');
  const [budget, setBudget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const db = loadDb();
  const appointmentFromDb = db.appointments?.find(a => a.id === appointmentId);
  const appointment = appointmentProp ?? appointmentFromDb;
  const patientFromDb = appointmentFromDb?.patientId ? db.patients?.find(p => p.id === appointmentFromDb.patientId) : null;
  const patient = patientProp ?? patientFromDb;
  const professional = appointment?.professionalId ? db.collaborators?.find(c => c.id === appointment.professionalId) : null;
  const isDev = import.meta.env.DEV;

  useEffect(() => {
    const budgetData = getBudget(appointmentId);
    if (budgetData) {
      setBudget(budgetData);
    } else {
      // Inicializar com dados padrão
      const clinicalData = getClinicalData(appointmentId);
      const plannedProcedures = clinicalData?.plannedProcedures || [];
      
      setBudget({
        status: BUDGET_STATUS.RASCUNHO,
        planName: '',
        procedures: plannedProcedures.map(proc => ({
          id: proc.id || createId('proc'),
          name: proc.name,
          tooth: proc.tooth || '',
          region: proc.region || '',
          quantity: 1,
          unitValue: 0,
          totalValue: 0,
          observations: proc.notes || '',
        })),
        paymentType: 'a_vista',
        downPayment: 0,
        installments: 1,
        installmentValue: 0,
        paymentMethod: 'dinheiro',
        discount: 0,
        interest: 0,
        validityDate: '',
        professionalId: appointment?.professionalId || null,
        createdAt: new Date().toISOString(),
        createdBy: user?.id || null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId]);

  const handleSave = async () => {
    if (!user || !budget) return;
    setSaving(true);
    try {
      saveBudget(user, appointmentId, budget);
      await persistBudgetToSupabase(budget);
      setSaving(false);
      setToast({ message: 'Orçamento salvo com sucesso!', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      console.error('Erro ao salvar orçamento:', error);
      setSaving(false);
      setToast({ message: `Erro ao salvar orçamento: ${error.message}`, type: 'error' });
      setTimeout(() => setToast(null), 5000);
    }
  };

  const handleSendBudget = () => {
    if (!budget || !user) return;
    try {
      // Primeiro salvar o orçamento atual
      saveBudget(user, appointmentId, budget);
      // Depois atualizar o status para enviado
      updateBudgetStatus(user, appointmentId, BUDGET_STATUS.ENVIADO);
      setBudget({ ...budget, status: BUDGET_STATUS.ENVIADO });
      
      // Mostrar feedback de sucesso
      setToast({ message: 'Orçamento enviado com sucesso!', type: 'success' });
      setTimeout(() => setToast(null), 3000);
      
      // Registrar evento
      logClinicalEvent(appointmentId, 'budget_sent', {
        budgetId: budget.id,
        totalValue: budget.procedures?.reduce((sum, proc) => sum + (parseFloat(proc.quantity || 1) * parseFloat(proc.unitValue || 0)), 0) || 0,
      }, user.id);
      
      // TODO: Implementar envio por WhatsApp/PDF
    } catch (error) {
      console.error('Erro ao enviar orçamento:', error);
      setToast({ message: `Erro ao enviar orçamento: ${error.message}`, type: 'error' });
      setTimeout(() => setToast(null), 5000);
    }
  };

  const persistBudgetToSupabase = async (budgetData) => {
    const patientId = patient?.id || appointment?.patientId || null;
    if (!patientId) {
      throw new Error('Paciente não identificado para persistir orçamento.');
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:persistBudgetToSupabase',message:'persist start',data:{appointmentId,hasSupabaseId:!!budgetData.supabaseBudgetId,proceduresCount:budgetData?.procedures?.length || 0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    const total = (budgetData.procedures || []).reduce((sum, proc) => {
      return sum + (Number(proc.quantity || 1) * Number(proc.unitValue || 0));
    }, 0);

    let supabaseBudgetId = budgetData.supabaseBudgetId;
    if (!supabaseBudgetId) {
      const created = await createBudget({
        patient_id: patientId,
        price_table_id: budgetData.priceTableId || null,
        status: budgetData.status || 'AGUARDANDO_INICIO',
      });
      supabaseBudgetId = created.id;
    }

    const itemsPayload = (budgetData.procedures || []).map((proc) => ({
      name: proc.title || proc.name || 'Procedimento',
      quantity: Number(proc.quantity || 1),
      unit_price: Number(proc.unitValue || 0),
      tooth: proc.tooth || null,
      region: proc.region || null,
      notes: proc.observations || null,
    }));

    await createBudgetItems(supabaseBudgetId, itemsPayload);
    await updateBudgetTotal(supabaseBudgetId, total);

    const { data: budgetsCount } = await supabase
      .from('budgets')
      .select('*', { count: 'exact', head: true });
    const { data: budgetItemsCount } = await supabase
      .from('budget_items')
      .select('*', { count: 'exact', head: true });

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:persistBudgetToSupabase',message:'persist done',data:{supabaseBudgetId,budgetsCount:budgetsCount?.count || null,budgetItemsCount:budgetItemsCount?.count || null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

    setBudget((prev) => ({ ...prev, supabaseBudgetId }));
  };

  const handleSeedBudget = async () => {
    if (!isDev) return;
    try {
      const patientId = patient?.id || appointment?.patientId || null;
      if (!patientId) {
        throw new Error('Paciente não identificado para seed.');
      }
      const created = await createBudget({
        patient_id: patientId,
        price_table_id: budget?.priceTableId || null,
        status: 'AGUARDANDO_INICIO',
      });
      const items = [
        { name: 'Avaliação clínica', quantity: 1, unit_price: 150 },
        { name: 'Profilaxia', quantity: 1, unit_price: 200 },
      ];
      await createBudgetItems(created.id, items);
      await updateBudgetTotal(created.id, 350);
      const { data: budgetsCount } = await supabase
        .from('budgets')
        .select('*', { count: 'exact', head: true });
      const { data: budgetItemsCount } = await supabase
        .from('budget_items')
        .select('*', { count: 'exact', head: true });

      setToast({ message: `Seed criado. Budgets: ${budgetsCount?.count || 0} | Itens: ${budgetItemsCount?.count || 0}`, type: 'success' });
      setTimeout(() => setToast(null), 4000);
    } catch (error) {
      setToast({ message: `Erro no seed: ${error.message}`, type: 'error' });
      setTimeout(() => setToast(null), 5000);
    }
  };

  const handleApproveBudget = () => {
    if (!budget || !user) return;
    try {
      // Primeiro salvar o orçamento atual
      saveBudget(user, appointmentId, budget);
      // Depois atualizar o status para aprovado
      updateBudgetStatus(user, appointmentId, BUDGET_STATUS.APROVADO);
      setBudget({ ...budget, status: BUDGET_STATUS.APROVADO });
      
      // Mostrar feedback de sucesso
      setToast({ message: 'Orçamento aprovado com sucesso!', type: 'success' });
      setTimeout(() => setToast(null), 3000);
      
      // Registrar evento
      logClinicalEvent(appointmentId, 'budget_approved', {
        budgetId: budget.id,
        totalValue: budget.procedures?.reduce((sum, proc) => sum + (parseFloat(proc.quantity || 1) * parseFloat(proc.unitValue || 0)), 0) || 0,
      }, user.id);
    } catch (error) {
      console.error('Erro ao aprovar orçamento:', error);
      setToast({ message: `Erro ao aprovar orçamento: ${error.message}`, type: 'error' });
      setTimeout(() => setToast(null), 5000);
    }
  };

  const handleGeneratePDF = () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:handleGeneratePDF',message:'handleGeneratePDF iniciado',data:{hasBudget:!!budget,hasPatient:!!patient,hasUser:!!user,appointmentId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    if (!budget || !patient) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:handleGeneratePDF',message:'Dados não disponíveis',data:{hasBudget:!!budget,hasPatient:!!patient},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      setToast({ message: 'Dados do orçamento ou paciente não disponíveis', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:handleGeneratePDF',message:'Iniciando geração de PDF',data:{budgetProceduresCount:budget.procedures?.length || 0,patientName:patient.full_name || patient.nickname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      // Salvar o orçamento antes de gerar PDF
      saveBudget(user, appointmentId, budget);
      persistBudgetToSupabase(budget).catch((error) => {
        console.error('Erro ao persistir orçamento no Supabase:', error);
      });

      // Criar conteúdo HTML do orçamento
      const formatCurrency = (value) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
      };

      const formatDate = (dateStr) => {
        if (!dateStr) return 'Não informada';
        try {
          return new Date(dateStr).toLocaleDateString('pt-BR');
        } catch {
          return dateStr;
        }
      };

      const clinic = db.clinicProfile || {};
      const clinicDocs = db.clinicDocumentation || {};
      const clinicPhones = db.clinicPhones || [];
      const clinicAddresses = db.clinicAddresses || [];
      const clinicName = clinic.nomeClinica || clinic.nomeFantasia || clinic.razaoSocial || 'Clínica Odontológica';
      const clinicLogo = clinic.logoUrl || '';
      const patientName = patient.full_name || patient.nickname || patient.social_name || 'Paciente';
      const patientPhone = patient.phone || patient.telefone || patient.legacy_phone || patient.legacyPhone || 'Não informado';
      const professionalName = professional?.nomeCompleto || professional?.name || 'Profissional';
      const professionalCro = professional?.cro || professional?.croNumber || professional?.registroCRO || professional?.conselhoNumero || professional?.councilNumber || 'Não informado';
      const professionalSpecialty = professional?.especialidade || professional?.specialty || professional?.especialidadeClinica || 'Não informado';
      const clinicalData = getClinicalData(appointmentId) || {};
      const observationsList = listClinicalEvolutions(patient?.id, appointmentId, null, budget?.id || null);
      const clinicalNotes = observationsList.length > 0
        ? observationsList.map((obs) => {
            const dateStr = obs.createdAt ? new Date(obs.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            return (dateStr ? `[${dateStr}] ` : '') + (obs.content || '').trim();
          }).join('\n\n').trim()
        : (clinicalData.evolution || '');
      const planName = budget.planName || '';
      const budgetNumber = budget.id || appointmentId || '—';
      const issueDate = budget.createdAt || new Date().toISOString();
      const treatmentStartDate = appointment?.date || budget.startDate || '';
      const validityDate = budget.validityDate || '';
      const generatedAt = new Date().toLocaleString('pt-BR');
      const origin = typeof window !== 'undefined' ? window.location.origin : '';

      const clinicPhoneMain = clinicPhones.find((item) => item.principal) || clinicPhones[0];
      const clinicPhone = clinicPhoneMain ? `${clinicPhoneMain.ddd || ''} ${clinicPhoneMain.numero || ''}`.trim() : '';
      const clinicAddressMain = clinicAddresses.find((item) => item.principal) || clinicAddresses[0];
      const clinicAddressText = clinicAddressMain ? [
        clinicAddressMain.logradouro,
        clinicAddressMain.numero,
        clinicAddressMain.complemento,
        clinicAddressMain.bairro,
        clinicAddressMain.cidade ? `${clinicAddressMain.cidade}${clinicAddressMain.uf ? `/${clinicAddressMain.uf}` : ''}` : '',
        clinicAddressMain.cep ? `CEP ${clinicAddressMain.cep}` : '',
      ].filter(Boolean).join(', ') : '';

      const clinicSettings = db.clinicSettings || {
        clinicName,
        clinicAddress: clinicAddressText,
        clinicPhone,
      };

      const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      const toMultilineHtml = (value) => escapeHtml(value).replace(/\n/g, '<br />');

      const statusLabel = budget.status === BUDGET_STATUS.APROVADO
        ? 'Aprovado'
        : budget.status === BUDGET_STATUS.ENVIADO
          ? 'Enviado'
          : budget.status === BUDGET_STATUS.REPROVADO
            ? 'Reprovado'
            : 'Rascunho';

      const paymentTypeLabel = budget.paymentType === 'parcelado'
        ? 'Parcelado'
        : budget.paymentType === 'convenio'
          ? 'Convênio'
          : budget.paymentType === 'a_vista'
            ? 'À vista'
            : 'Não informado';

      const paymentMethodLabel = budget.paymentMethod === 'dinheiro'
        ? 'Dinheiro'
        : budget.paymentMethod === 'pix'
          ? 'PIX'
          : budget.paymentMethod === 'cartao_debito'
            ? 'Cartão de Débito'
            : budget.paymentMethod === 'cartao_credito'
              ? 'Cartão de Crédito'
              : budget.paymentMethod === 'convenio'
                ? 'Convênio'
                : budget.paymentMethod === 'transferencia'
                  ? 'Transferência Bancária'
                  : budget.paymentMethod || 'Não informado';

      // Calcular valores ANTES de usar no template HTML
      const calcTotalValue = (budget.procedures || []).reduce((sum, proc) => {
        return sum + (parseFloat(proc.quantity || 1) * parseFloat(proc.unitValue || 0));
      }, 0);
      const calcFinalValue = calcTotalValue - (budget.discount || 0) + (budget.interest || 0);
      const calcInstallmentValue = budget.installments > 0
        ? (calcFinalValue - (budget.downPayment || 0)) / budget.installments
        : 0;

      const proceduresTable = (budget.procedures || []).map((proc, index) => {
        const quantity = parseFloat(proc.quantity || 1);
        const unitValue = parseFloat(proc.unitValue || 0);
        const computedTotal = parseFloat(proc.totalValue || (quantity * unitValue));

        return {
          step: index + 1,
          name: proc.title || proc.name || 'Procedimento',
          region: proc.tooth || proc.region || '',
          quantity,
          unitValue: formatCurrency(unitValue),
          totalValue: formatCurrency(computedTotal),
          notes: proc.observations || proc.notes || '',
        };
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Orçamento Odontológico - ${escapeHtml(patientName)}</title>
          <style>
            :root { color-scheme: light; }
            body {
              font-family: "Inter", "Segoe UI", Arial, sans-serif;
              padding: 24px;
              color: #1f2933;
              background: #f5f7fb;
            }
            .page {
              max-width: 900px;
              margin: 0 auto;
              background: #fff;
              border-radius: 16px;
              box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
              padding: 32px;
            }
            .doc-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 20px;
              padding-bottom: 20px;
              border-bottom: 1px solid #e5e7eb;
              margin-bottom: 24px;
            }
            .brand {
              display: flex;
              align-items: center;
              gap: 16px;
            }
            .logo {
              width: 64px;
              height: 64px;
              object-fit: contain;
              border-radius: 12px;
              border: 1px solid #e5e7eb;
              background: #fff;
            }
            .logo-fallback {
              width: 64px;
              height: 64px;
              border-radius: 12px;
              border: 1px dashed #cbd5f5;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 11px;
              color: #64748b;
              background: #f8fafc;
              text-align: center;
              padding: 6px;
            }
            .clinic-name {
              font-size: 18px;
              font-weight: 600;
              margin: 0;
            }
            .clinic-doc {
              font-size: 12px;
              color: #64748b;
              margin-top: 4px;
            }
            .doc-title {
              font-size: 18px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin: 0;
              color: #0f172a;
            }
            .doc-meta {
              text-align: right;
              font-size: 12px;
              color: #475569;
            }
            .meta-row { margin-top: 4px; }
            .status-badge {
              display: inline-flex;
              align-items: center;
              padding: 4px 10px;
              border-radius: 999px;
              font-weight: 600;
              font-size: 11px;
              background: #eef2ff;
              color: #3730a3;
              margin-left: 8px;
            }
            .section {
              margin: 24px 0;
              padding: 20px;
              border: 1px solid #e5e7eb;
              border-radius: 12px;
              background: #fff;
            }
            .section h2 {
              font-size: 15px;
              margin: 0 0 14px 0;
              color: #0f172a;
            }
            .info-grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 12px 16px;
            }
            .info-item {
              background: #f8fafc;
              border-radius: 10px;
              padding: 10px 12px;
              border: 1px solid #e2e8f0;
            }
            .info-label {
              font-weight: 600;
              color: #64748b;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.4px;
            }
            .info-value {
              font-size: 13px;
              margin-top: 6px;
              color: #0f172a;
            }
            .summary-text {
              background: #eef2ff;
              border-radius: 12px;
              padding: 14px 16px;
              color: #3730a3;
              font-size: 13px;
              margin-bottom: 16px;
              border: 1px solid #c7d2fe;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 12px;
              font-size: 12px;
            }
            table th {
              text-align: left;
              padding: 10px;
              background: #f1f5f9;
              border: 1px solid #e2e8f0;
              font-weight: 600;
              color: #475569;
            }
            table td {
              padding: 10px;
              border: 1px solid #e2e8f0;
              vertical-align: top;
              color: #0f172a;
            }
            .proc-notes {
              display: block;
              font-size: 11px;
              color: #64748b;
              margin-top: 6px;
            }
            .financial-summary {
              display: grid;
              gap: 8px;
            }
            .total-row {
              display: flex;
              justify-content: space-between;
              font-size: 13px;
              color: #1f2933;
            }
            .total-highlight {
              margin-top: 10px;
              padding: 12px 16px;
              border-radius: 12px;
              background: #0f172a;
              color: #fff;
              display: flex;
              justify-content: space-between;
              font-size: 16px;
              font-weight: 700;
            }
            .important-notes {
              font-size: 12px;
              color: #475569;
              line-height: 1.5;
            }
            .acceptance {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 24px;
              margin-top: 12px;
            }
            .signature-box {
              border-top: 1px solid #94a3b8;
              padding-top: 8px;
              font-size: 12px;
              color: #475569;
            }
            .footer {
              margin-top: 28px;
              padding-top: 16px;
              border-top: 1px solid #e2e8f0;
              font-size: 11px;
              color: #64748b;
              text-align: center;
            }
            .footer-address {
              margin-top: 8px;
              font-size: 11px;
              color: #94a3b8;
            }
            .audit-card {
              margin-top: 20px;
              padding: 14px 16px;
              border-radius: 12px;
              border: 1px solid #e2e8f0;
              background: #f8fafc;
              font-size: 12px;
              color: #64748b;
              display: grid;
              gap: 6px;
            }
            @media print {
              body { background: #fff; padding: 0; }
              .page { box-shadow: none; border-radius: 0; padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <header class="doc-header">
              <div class="brand">
                ${clinicLogo
                  ? `<img class="logo" src="${escapeHtml(clinicLogo)}" alt="Logo da clínica" />`
                  : `<div class="logo-fallback">Logo da clínica</div>`}
                <div>
                  <p class="clinic-name">${escapeHtml(clinicName)}</p>
                  <p class="clinic-doc">${clinicDocs.cnpj ? `CNPJ: ${escapeHtml(clinicDocs.cnpj)}` : 'Documento não informado'}</p>
                </div>
              </div>
              <div class="doc-meta">
                <p class="doc-title">Orçamento Odontológico</p>
                <div class="meta-row">Nº ${escapeHtml(budgetNumber)}</div>
                <div class="meta-row">Data de emissão: ${formatDate(issueDate)}</div>
                <div class="meta-row">
                  Status:<span class="status-badge">${escapeHtml(statusLabel)}</span>
                </div>
              </div>
            </header>

            <section class="section">
              <h2>Dados do Paciente e Profissional</h2>
              <div class="info-grid">
                <div class="info-item">
                  <div class="info-label">Paciente</div>
                  <div class="info-value">${escapeHtml(patientName)}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Telefone</div>
                  <div class="info-value">${escapeHtml(patientPhone)}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Dentista responsável</div>
                  <div class="info-value">${escapeHtml(professionalName)}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">CRO</div>
                  <div class="info-value">${escapeHtml(professionalCro)}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Especialidade</div>
                  <div class="info-value">${escapeHtml(professionalSpecialty)}</div>
                </div>
              </div>
            </section>

            <section class="section">
              <h2>Resumo do Tratamento</h2>
              <div class="summary-text">
                Este orçamento refere-se ao plano de tratamento odontológico elaborado após avaliação clínica, visando restabelecer a saúde bucal, função mastigatória e estética.
              </div>
              <div class="info-grid">
                <div class="info-item">
                  <div class="info-label">Plano/Tratamento</div>
                  <div class="info-value">${planName ? escapeHtml(planName) : 'Não informado'}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Data prevista de início</div>
                  <div class="info-value">${treatmentStartDate ? formatDate(treatmentStartDate) : 'Não informada'}</div>
                </div>
                <div class="info-item" style="grid-column: span 2;">
                  <div class="info-label">Observações clínicas gerais</div>
                  <div class="info-value">${clinicalNotes ? toMultilineHtml(clinicalNotes) : 'Não informadas'}</div>
                </div>
              </div>
            </section>

            <section class="section">
              <h2>Procedimentos</h2>
              <table>
                <thead>
                  <tr>
                    <th>Etapa/Fase</th>
                    <th>Procedimento</th>
                    <th>Região/Dente</th>
                    <th>Qtd</th>
                    <th>Valor unitário</th>
                    <th>Valor total</th>
                  </tr>
                </thead>
                <tbody>
                  ${proceduresTable.map((row) => `
                    <tr>
                      <td>${row.step}</td>
                      <td>
                        ${escapeHtml(row.name)}
                        ${row.notes ? `<span class="proc-notes">${toMultilineHtml(row.notes)}</span>` : ''}
                      </td>
                      <td>${row.region ? escapeHtml(row.region) : '-'}</td>
                      <td>${row.quantity}</td>
                      <td>${row.unitValue}</td>
                      <td>${row.totalValue}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </section>

            <section class="section">
              <h2>Resumo Financeiro</h2>
              <div class="financial-summary">
                <div class="total-row">
                  <span>Subtotal</span>
                  <span>${formatCurrency(calcTotalValue)}</span>
                </div>
                <div class="total-row">
                  <span>Descontos</span>
                  <span>${formatCurrency(budget.discount || 0)}</span>
                </div>
                <div class="total-row">
                  <span>Acréscimos</span>
                  <span>${formatCurrency(budget.interest || 0)}</span>
                </div>
                <div class="total-highlight">
                  <span>TOTAL DO TRATAMENTO</span>
                  <span>${formatCurrency(calcFinalValue)}</span>
                </div>
              </div>
            </section>

            <section class="section">
              <h2>Condições de Pagamento</h2>
              <div class="info-grid">
                <div class="info-item">
                  <div class="info-label">Forma de pagamento</div>
                  <div class="info-value">${escapeHtml(paymentMethodLabel)}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Tipo</div>
                  <div class="info-value">${escapeHtml(paymentTypeLabel)}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Parcelamento</div>
                  <div class="info-value">${budget.installments > 1 ? `${budget.installments}x de ${formatCurrency(calcInstallmentValue)}` : 'À vista'}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Entrada</div>
                  <div class="info-value">${formatCurrency(budget.downPayment || 0)}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Datas</div>
                  <div class="info-value">${budget.paymentDates || budget.paymentDate ? escapeHtml(budget.paymentDates || budget.paymentDate) : 'Não informadas'}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Observações</div>
                  <div class="info-value">${budget.paymentNotes || budget.paymentObservations ? toMultilineHtml(budget.paymentNotes || budget.paymentObservations) : 'Sem observações'}</div>
                </div>
              </div>
            </section>

            <section class="section">
              <h2>Observações Importantes</h2>
              <div class="important-notes">
                <p>- Validade do orçamento: ${validityDate ? formatDate(validityDate) : 'Não informada'}.</p>
                <p>- Alterações clínicas podem impactar valores e procedimentos previstos.</p>
                <p>- O paciente é responsável por informar qualquer condição de saúde relevante.</p>
              </div>
            </section>

            <section class="section">
              <h2>Aceite</h2>
              <div class="acceptance">
                <div>
                  <div class="info-label">Nome do paciente</div>
                  <div class="info-value">${escapeHtml(patientName)}</div>
                  <div class="signature-box">Assinatura do paciente</div>
                </div>
                <div>
                  <div class="info-label">Data</div>
                  <div class="info-value">${formatDate(issueDate)}</div>
                  <div class="signature-box">Assinatura do responsável técnico</div>
                </div>
              </div>
            </section>

            <section class="section">
              <h2>Assinatura do Sistema</h2>
              <div class="audit-card">
                <div>Gerado por: ${escapeHtml(user?.name || 'Usuário do sistema')}</div>
                <div>Data/Hora: ${escapeHtml(generatedAt)}</div>
                <div>Origem: ${escapeHtml(origin || 'Não informada')}</div>
              </div>
            </section>

            <div class="footer">
              <p>Gerado em ${escapeHtml(generatedAt)} • ${escapeHtml(clinicSettings.clinicName || clinicName)}</p>
              <p>Status final: ${escapeHtml(statusLabel)}</p>
              ${clinicSettings.clinicAddress ? `<div class="footer-address">${escapeHtml(clinicSettings.clinicAddress)}</div>` : ''}
              ${clinicSettings.clinicPhone ? `<div class="footer-address">Telefone: ${escapeHtml(clinicSettings.clinicPhone)}</div>` : ''}
            </div>
          </div>
        </body>
        </html>
      `;

      const fileName = `orcamento-${patientName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.html`;

      // Criar blob e fazer download
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const documentEntry = {
        id: createId('budget_doc'),
        type: 'pdf',
        format: 'html',
        fileName,
        htmlContent,
        createdAt: new Date().toISOString(),
        createdBy: user?.id || null,
        createdByName: user?.name || 'Usuário do sistema',
        origin: typeof window !== 'undefined' ? window.location.origin : '',
      };

      const nextDocuments = [...(budget.documents || []), documentEntry];
      const nextBudget = { ...budget, documents: nextDocuments };
      saveBudget(user, appointmentId, nextBudget);
      setBudget(nextBudget);

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:handleGeneratePDF',message:'HTML criado, tentando abrir janela',data:{htmlLength:htmlContent.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion

      // Tentar abrir em nova janela para impressão
      let printWindow = null;
      try {
        printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(htmlContent);
          printWindow.document.close();
          // Aguardar um pouco mais para garantir que o conteúdo foi carregado
          setTimeout(() => {
            try {
              printWindow.print();
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:handleGeneratePDF',message:'print() chamado com sucesso',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
            } catch (printError) {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:handleGeneratePDF',message:'Erro ao chamar print()',data:{errorMessage:printError.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
              // #endregion
              console.warn('Erro ao chamar print():', printError);
              // Se print() falhar, pelo menos o HTML foi baixado
            }
          }, 500);
        } else {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:handleGeneratePDF',message:'Popup bloqueado',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
          // #endregion
          // Se popup foi bloqueado, apenas mostrar mensagem
          setToast({ message: 'Popup bloqueado. O arquivo HTML foi baixado. Abra-o e use Ctrl+P para imprimir como PDF.', type: 'success' });
          setTimeout(() => setToast(null), 7000);
        }
      } catch (windowError) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:handleGeneratePDF',message:'Erro ao abrir janela',data:{errorMessage:windowError.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        console.warn('Erro ao abrir janela de impressão:', windowError);
        // Mesmo se a janela falhar, o download do HTML já foi feito
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:handleGeneratePDF',message:'PDF gerado com sucesso',data:{hasPrintWindow:!!printWindow},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      setToast({ message: 'PDF gerado com sucesso! Use Ctrl+P para salvar como PDF.', type: 'success' });
      setTimeout(() => setToast(null), 5000);

      // Registrar evento
      logClinicalEvent(appointmentId, 'budget_pdf_generated', {
        budgetId: budget.id,
        totalValue: calcFinalValue,
        documentId: documentEntry.id,
        fileName: documentEntry.fileName,
        origin: documentEntry.origin,
      }, user.id);
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:handleGeneratePDF',message:'Erro ao gerar PDF',data:{errorMessage:error.message,errorStack:error.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      console.error('Erro ao gerar PDF:', error);
      setToast({ message: `Erro ao gerar PDF: ${error.message}`, type: 'error' });
      setTimeout(() => setToast(null), 5000);
    }
  };


  const totalValue = budget?.procedures?.reduce((sum, proc) => {
    return sum + (parseFloat(proc.quantity || 1) * parseFloat(proc.unitValue || 0));
  }, 0) || 0;

  const finalValue = totalValue - (budget?.discount || 0) + (budget?.interest || 0);
  const installmentValue = budget?.installments > 0 ? (finalValue - (budget?.downPayment || 0)) / budget.installments : 0;

  return (
    <>
    <SectionCard
      title="Orçamento"
      description="Gerencie orçamentos profissionais e integrados ao atendimento"
      actions={
        <div className="clinical-section-actions">
          {isDev && (
            <button
              type="button"
              className="button secondary"
              onClick={handleSeedBudget}
            >
              Criar orçamento de teste
            </button>
          )}
          <button 
            type="button" 
            className="button secondary"
            onClick={handleSave}
            disabled={saving}
          >
            <Save size={16} />
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button 
            type="button" 
            className="button secondary"
            onClick={handleSendBudget}
            disabled={!budget || budget.status === BUDGET_STATUS.APROVADO}
          >
            <Send size={16} />
            Enviar
          </button>
          <button 
            type="button" 
            className="button secondary"
            onClick={handleGeneratePDF}
            disabled={!budget}
          >
            <Download size={16} />
            Gerar PDF
          </button>
          <button 
            type="button" 
            className="button primary"
            onClick={handleApproveBudget}
            disabled={!budget || budget.status === BUDGET_STATUS.APROVADO}
          >
            <CheckCircle2 size={16} />
            Aprovar
          </button>
        </div>
      }
    >
      {/* Tabs Internas */}
      <div className="clinical-budget-tabs">
        <button
          type="button"
          className={`clinical-budget-tab ${activeTab === 'geral' ? 'active' : ''}`}
          onClick={() => setActiveTab('geral')}
        >
          <FileTextIcon size={16} />
          Geral
        </button>
        <button
          type="button"
          className={`clinical-budget-tab ${activeTab === 'procedimentos' ? 'active' : ''}`}
          onClick={() => setActiveTab('procedimentos')}
        >
          <ClipboardList size={16} />
          Procedimentos
        </button>
        <button
          type="button"
          className={`clinical-budget-tab ${activeTab === 'pagamento' ? 'active' : ''}`}
          onClick={() => setActiveTab('pagamento')}
        >
          <CreditCard size={16} />
          Pagamento
        </button>
        <button
          type="button"
          className={`clinical-budget-tab ${activeTab === 'documentos' ? 'active' : ''}`}
          onClick={() => setActiveTab('documentos')}
        >
          <FileText size={16} />
          Documentos
        </button>
        <button
          type="button"
          className={`clinical-budget-tab ${activeTab === 'historico' ? 'active' : ''}`}
          onClick={() => setActiveTab('historico')}
        >
          <History size={16} />
          Histórico
        </button>
      </div>

      {/* Conteúdo das Tabs */}
      <div className="clinical-budget-content">
        {activeTab === 'geral' && (
          <OrcamentoGeralTab 
            budget={budget} 
            setBudget={setBudget}
            totalValue={totalValue}
            appointment={appointment}
            patient={patient}
            professional={professional}
            appointmentId={appointmentId}
          />
        )}
        {activeTab === 'procedimentos' && (
          <OrcamentoProcedimentosTab 
            budget={budget} 
            setBudget={setBudget}
            totalValue={totalValue}
            appointment={appointment}
            patient={patient}
            appointmentId={appointmentId}
          />
        )}
        {activeTab === 'pagamento' && (
          <OrcamentoPagamentoTab 
            budget={budget} 
            setBudget={setBudget}
            totalValue={totalValue}
            finalValue={finalValue}
            installmentValue={installmentValue}
          />
        )}
        {activeTab === 'documentos' && (
          <OrcamentoDocumentosTab 
            appointmentId={appointmentId}
            budget={budget}
            onGeneratePDF={handleGeneratePDF}
          />
        )}
        {activeTab === 'historico' && (
          <OrcamentoHistoricoTab appointmentId={appointmentId} />
        )}
      </div>
      </SectionCard>
      
      {toast && (
        <div
          className={`toast ${toast.type}`}
          role="status"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 10000,
            padding: '12px 24px',
            borderRadius: '8px',
            backgroundColor: toast.type === 'success' ? '#10b981' : '#ef4444',
            color: 'white',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}

// Tab: Geral
function OrcamentoGeralTab({ budget, setBudget, totalValue, appointment, patient, professional, appointmentId }) {
  if (!budget) return null;

  const budgetObservations = listClinicalEvolutions(patient?.id, appointmentId, null, budget?.id);

  return (
    <div className="clinical-budget-tab-content">
      <div className="clinical-budget-form-grid">
        <div className="form-field">
          <label>Status do Orçamento</label>
          <select
            value={budget.status || BUDGET_STATUS.RASCUNHO}
            onChange={(e) => setBudget({ ...budget, status: e.target.value })}
          >
            <option value={BUDGET_STATUS.RASCUNHO}>Rascunho</option>
            <option value={BUDGET_STATUS.ENVIADO}>Enviado</option>
            <option value={BUDGET_STATUS.APROVADO}>Aprovado</option>
            <option value={BUDGET_STATUS.REPROVADO}>Reprovado</option>
          </select>
        </div>

        <div className="form-field">
          <label>Nome do Plano/Tratamento</label>
          <input
            type="text"
            value={budget.planName || ''}
            onChange={(e) => setBudget({ ...budget, planName: e.target.value })}
            placeholder="Ex: Tratamento Ortodôntico Completo"
          />
        </div>

        <div className="form-field">
          <label>Valor Total</label>
          <input
            type="text"
            value={`R$ ${totalValue.toFixed(2)}`}
            disabled
            className="clinical-budget-total-display"
          />
        </div>

        <div className="form-field">
          <label>Forma de Pagamento Principal</label>
          <select
            value={budget.paymentMethod || 'dinheiro'}
            onChange={(e) => setBudget({ ...budget, paymentMethod: e.target.value })}
          >
            <option value="dinheiro">Dinheiro</option>
            <option value="pix">PIX</option>
            <option value="cartao_debito">Cartão de Débito</option>
            <option value="cartao_credito">Cartão de Crédito</option>
            <option value="convenio">Convênio</option>
            <option value="transferencia">Transferência Bancária</option>
          </select>
        </div>

        <div className="form-field">
          <label>Validade do Orçamento</label>
          <input
            type="date"
            value={budget.validityDate || ''}
            onChange={(e) => setBudget({ ...budget, validityDate: e.target.value })}
          />
        </div>

        <div className="form-field">
          <label>Profissional Responsável</label>
          <input
            type="text"
            value={professional?.nomeCompleto || professional?.name || 'Não definido'}
            disabled
          />
        </div>

        <div className="form-field">
          <label>Data de Criação</label>
          <input
            type="text"
            value={budget.createdAt ? new Date(budget.createdAt).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR')}
            disabled
          />
        </div>
      </div>

      {budgetObservations.length > 0 && (
        <div className="clinical-budget-observations-block" style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: '0.5rem', background: 'var(--color-bg-secondary, #f8fafc)' }}>
          <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9375rem' }}>Observações do orçamento</h4>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--color-text, #334155)' }}>
            {budgetObservations.map((obs) => (
              <li key={obs.id} style={{ marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--color-text-secondary, #64748b)', marginRight: '0.5rem' }}>
                  {obs.createdAt ? new Date(obs.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
                {(obs.content || '').trim().split('\n').map((line, idx) => (
                  <span key={idx}>{line || '\u00A0'}<br /></span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Tab: Procedimentos
function OrcamentoProcedimentosTab({ budget, setBudget, totalValue, appointment, patient, appointmentId }) {
  if (!budget) return null;

  const [showProcedureSelector, setShowProcedureSelector] = useState(false);


  const handleAddProcedure = () => {
    setShowProcedureSelector(true);
  };

  const handleSelectProcedure = (procedureData) => {
    // Garantir compatibilidade: o modal retorna 'title', mas o código também usa 'name'
    const adaptedProcedure = {
      ...procedureData,
      name: procedureData.title || procedureData.name || '',
      // Garantir que totalValue seja calculado corretamente
      totalValue: (procedureData.quantity || 1) * (procedureData.unitValue || 0),
    };
    
    setBudget({
      ...budget,
      procedures: [...(budget.procedures || []), adaptedProcedure],
    });
    setShowProcedureSelector(false);
  };

  const handleUpdateProcedure = (id, field, value) => {
    const updatedProcedures = (budget.procedures || []).map(proc => {
      if (proc.id === id) {
        // Validar restrições de preço
        if (field === 'unitValue') {
          const numValue = parseFloat(value) || 0;
          if (proc.restriction === 'FIXO') {
            alert('Este procedimento tem preço fixo pela Base de Preço. Não é possível alterar.');
            return proc;
          }
          if (proc.restriction === 'BLOQUEAR') {
            if (proc.minPrice && numValue < proc.minPrice) {
              alert(`Preço mínimo permitido: R$ ${proc.minPrice.toFixed(2)}`);
              return proc;
            }
            if (proc.maxPrice && numValue > proc.maxPrice) {
              alert(`Preço máximo permitido: R$ ${proc.maxPrice.toFixed(2)}`);
              return proc;
            }
          }
          if (proc.restriction === 'AVISAR') {
            if (
              (proc.minPrice && numValue < proc.minPrice) ||
              (proc.maxPrice && numValue > proc.maxPrice)
            ) {
              const confirmMsg = `Preço fora do recomendado (R$ ${proc.minPrice || '—'} - R$ ${proc.maxPrice || '—'}). Deseja continuar?`;
              if (!confirm(confirmMsg)) {
                return proc;
              }
            }
          }
        }

        const updated = { ...proc, [field]: value };
        // Se atualizar 'name', também atualizar 'title' para manter compatibilidade
        if (field === 'name') {
          updated.title = value;
        }
        if (field === 'quantity' || field === 'unitValue') {
          updated.totalValue = parseFloat(updated.quantity || 1) * parseFloat(updated.unitValue || 0);
        }
        return updated;
      }
      return proc;
    });
    setBudget({ ...budget, procedures: updatedProcedures });
  };

  const handleRemoveProcedure = (id) => {
    setBudget({
      ...budget,
      procedures: (budget.procedures || []).filter(proc => proc.id !== id),
    });
  };

  return (
    <>
      <div className="clinical-budget-tab-content">
        <div className="clinical-budget-procedures-header">
          <h3>Procedimentos do Orçamento</h3>
          <button type="button" className="button primary" onClick={handleAddProcedure}>
            <Plus size={16} />
            Adicionar Procedimento
          </button>
        </div>

      {(!budget.procedures || budget.procedures.length === 0) ? (
        <div className="clinical-empty-state">
          <ClipboardList size={48} />
          <p>Nenhum procedimento adicionado.</p>
        </div>
      ) : (
        <>
          <div className="clinical-budget-procedures-list">
            {budget.procedures.map((proc) => (
              <div key={proc.id} className="clinical-budget-procedure-item">
                <div className="clinical-budget-procedure-fields">
                  <div className="clinical-budget-procedure-field clinical-budget-procedure-name">
                    <label>Procedimento</label>
                    <input
                      type="text"
                      value={proc.title || proc.name || ''}
                      onChange={(e) => handleUpdateProcedure(proc.id, 'name', e.target.value)}
                      disabled={!!proc.procedureCatalogId}
                    />
                  </div>
                  <div className="clinical-budget-procedure-field clinical-budget-procedure-tooth">
                    <label>Dente</label>
                    <input
                      type="text"
                      placeholder="Ex.: 18"
                      value={proc.tooth ?? ''}
                      onChange={(e) => handleUpdateProcedure(proc.id, 'tooth', e.target.value)}
                    />
                  </div>
                  <div className="clinical-budget-procedure-field clinical-budget-procedure-region">
                    <label>Região</label>
                    <input
                      type="text"
                      placeholder="Ex.: superior direita"
                      value={proc.region ?? ''}
                      onChange={(e) => handleUpdateProcedure(proc.id, 'region', e.target.value)}
                    />
                  </div>
                  <div className="clinical-budget-procedure-field clinical-budget-procedure-quantity">
                    <label>Quantidade</label>
                    <input
                      type="number"
                      value={proc.quantity ?? 1}
                      onChange={(e) => handleUpdateProcedure(proc.id, 'quantity', parseInt(e.target.value) || 1)}
                      min={1}
                    />
                  </div>
                  <div className="clinical-budget-procedure-field clinical-budget-procedure-unit-value">
                    <label>Valor unit. (R$)</label>
                    <input
                      type="number"
                      value={proc.unitValue ?? ''}
                      onChange={(e) => handleUpdateProcedure(proc.id, 'unitValue', parseFloat(e.target.value) || 0)}
                      step="0.01"
                      min={0}
                      disabled={proc.restriction === 'FIXO'}
                      title={proc.restriction === 'FIXO' ? 'Preço fixo pela Base de Preço' : ''}
                    />
                    {proc.restriction === 'FIXO' && (
                      <span className="price-base-restriction-warning" style={{ fontSize: '11px', marginTop: '2px', display: 'block' }}>
                        Preço fixo
                      </span>
                    )}
                  </div>
                  <div className="clinical-budget-procedure-field clinical-budget-procedure-total">
                    <label>Total (R$)</label>
                    <input
                      type="text"
                      value={`R$ ${(proc.totalValue || 0).toFixed(2)}`}
                      readOnly
                      disabled
                    />
                  </div>
                  <div className="clinical-budget-procedure-field clinical-budget-procedure-remove">
                    <label>&nbsp;</label>
                    <button
                      type="button"
                      className="clinical-budget-procedure-remove-btn"
                      onClick={() => handleRemoveProcedure(proc.id)}
                      title="Remover procedimento"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="clinical-budget-procedure-field clinical-budget-procedure-observations-wrap">
                  <label>Observações</label>
                  <textarea
                    placeholder="Observações sobre este procedimento..."
                    value={proc.observations || ''}
                    onChange={(e) => handleUpdateProcedure(proc.id, 'observations', e.target.value)}
                    className="clinical-budget-procedure-observations"
                    rows={2}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="clinical-budget-total-summary">
            <strong>Total: R$ {totalValue.toFixed(2)}</strong>
          </div>
        </>
      )}
      </div>

      {showProcedureSelector && (
        <ProcedureSelectorModal
          open={showProcedureSelector}
          onClose={() => setShowProcedureSelector(false)}
          onSelect={handleSelectProcedure}
          patient={patient}
          appointmentId={appointmentId}
        />
      )}
    </>
  );
}

// Tab: Pagamento
function OrcamentoPagamentoTab({ budget, setBudget, totalValue, finalValue, installmentValue }) {
  if (!budget) return null;

  const handlePaymentTypeChange = (value) => {
    const updates = { paymentType: value };
    if (value === 'a_vista') {
      updates.installments = 1;
      updates.downPayment = finalValue;
    }
    setBudget({ ...budget, ...updates });
  };

  const handleDownPaymentChange = (value) => {
    const downPayment = parseFloat(value) || 0;
    setBudget({ ...budget, downPayment });
  };

  const handleInstallmentsChange = (value) => {
    const installments = parseInt(value) || 1;
    setBudget({ ...budget, installments });
  };

  const handleDiscountChange = (value) => {
    const discount = parseFloat(value) || 0;
    setBudget({ ...budget, discount });
  };

  const handleInterestChange = (value) => {
    const interest = parseFloat(value) || 0;
    setBudget({ ...budget, interest });
  };

  return (
    <div className="clinical-budget-tab-content">
      <div className="clinical-budget-payment-form">
        <div className="form-field">
          <label>Tipo de Pagamento</label>
          <select
            value={budget.paymentType || 'a_vista'}
            onChange={(e) => handlePaymentTypeChange(e.target.value)}
          >
            <option value="a_vista">À Vista</option>
            <option value="parcelado">Parcelado</option>
            <option value="convenio">Convênio</option>
          </select>
        </div>

        {budget.paymentType === 'parcelado' && (
          <>
            <div className="form-field">
              <label>Entrada</label>
              <input
                type="number"
                value={budget.downPayment || 0}
                onChange={(e) => handleDownPaymentChange(e.target.value)}
                step="0.01"
                min="0"
                max={finalValue}
              />
            </div>

            <div className="form-field">
              <label>Número de Parcelas</label>
              <input
                type="number"
                value={budget.installments || 1}
                onChange={(e) => handleInstallmentsChange(e.target.value)}
                min="1"
                max="24"
              />
            </div>

            <div className="form-field">
              <label>Valor da Parcela</label>
              <input
                type="text"
                value={`R$ ${installmentValue.toFixed(2)}`}
                disabled
                className="clinical-budget-installment-display"
              />
            </div>
          </>
        )}

        <div className="form-field">
          <label>Meio de Pagamento</label>
          <select
            value={budget.paymentMethod || 'dinheiro'}
            onChange={(e) => setBudget({ ...budget, paymentMethod: e.target.value })}
          >
            <option value="dinheiro">Dinheiro</option>
            <option value="pix">PIX</option>
            <option value="cartao_debito">Cartão de Débito</option>
            <option value="cartao_credito">Cartão de Crédito</option>
            <option value="transferencia">Transferência Bancária</option>
          </select>
        </div>

        <div className="form-field">
          <label>Desconto (R$)</label>
          <input
            type="number"
            value={budget.discount || 0}
            onChange={(e) => handleDiscountChange(e.target.value)}
            step="0.01"
            min="0"
            max={totalValue}
          />
        </div>

        <div className="form-field">
          <label>Juros (R$)</label>
          <input
            type="number"
            value={budget.interest || 0}
            onChange={(e) => handleInterestChange(e.target.value)}
            step="0.01"
            min="0"
          />
        </div>
      </div>

      {/* Resumo de Pagamento */}
      <div className="clinical-budget-payment-summary">
        <div className="clinical-budget-summary-row">
          <span>Subtotal:</span>
          <span>R$ {totalValue.toFixed(2)}</span>
        </div>
        {budget.discount > 0 && (
          <div className="clinical-budget-summary-row clinical-budget-summary-discount">
            <span>Desconto:</span>
            <span>- R$ {budget.discount.toFixed(2)}</span>
          </div>
        )}
        {budget.interest > 0 && (
          <div className="clinical-budget-summary-row clinical-budget-summary-interest">
            <span>Juros:</span>
            <span>+ R$ {budget.interest.toFixed(2)}</span>
          </div>
        )}
        <div className="clinical-budget-summary-row clinical-budget-summary-total">
          <strong>Total:</strong>
          <strong>R$ {finalValue.toFixed(2)}</strong>
        </div>
        {budget.paymentType === 'parcelado' && budget.installments > 1 && (
          <div className="clinical-budget-summary-row">
            <span>Entrada:</span>
            <span>R$ {budget.downPayment.toFixed(2)}</span>
          </div>
        )}
        {budget.paymentType === 'parcelado' && budget.installments > 1 && (
          <div className="clinical-budget-summary-row">
            <span>{budget.installments}x de:</span>
            <span>R$ {installmentValue.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Tab: Documentos
function OrcamentoDocumentosTab({ appointmentId, budget, onGeneratePDF }) {
  const db = loadDb();

  const getUserName = (userId) => {
    if (!userId) return 'Usuário do sistema';
    const user = db.users?.find((item) => item.id === userId);
    return user?.name || 'Usuário do sistema';
  };

  const documents = Array.isArray(budget?.documents) ? budget.documents : [];
  const events = getClinicalEvents(appointmentId) || [];
  const pdfEvents = events.filter((event) => event.type === 'budget_pdf_generated');
  const fallbackDocuments = pdfEvents.map((event) => ({
    id: event.id,
    fileName: event.data?.fileName || 'Orçamento gerado',
    createdAt: event.timestamp,
    createdByName: getUserName(event.userId),
    origin: event.data?.origin || '',
    htmlContent: null,
  }));

  const visibleDocuments = documents.length > 0 ? documents : fallbackDocuments;

  const handleViewDocument = (doc) => {
    if (!doc?.htmlContent) {
      alert('Documento sem conteúdo para visualização. Gere novamente o PDF.');
      return;
    }

    try {
      const viewWindow = window.open('', '_blank');
      if (viewWindow) {
        viewWindow.document.write(doc.htmlContent);
        viewWindow.document.close();
      }
    } catch (error) {
      alert('Não foi possível abrir o documento. Verifique o bloqueio de pop-ups.');
    }
  };


  return (
    <div className="clinical-budget-tab-content">
      <div className="clinical-budget-documents-header">
        <h3>Documentos do Orçamento</h3>
        <button 
          type="button" 
          className="button primary"
          onClick={onGeneratePDF}
        >
          <Download size={16} />
          Gerar PDF
        </button>
      </div>
      {visibleDocuments.length === 0 ? (
        <div className="clinical-empty-state">
          <FileText size={48} />
          <p>Nenhum documento gerado ainda.</p>
          <p className="clinical-empty-hint">Clique em "Gerar PDF" para criar o documento do orçamento.</p>
        </div>
      ) : (
        <div className="clinical-budget-documents-list">
          {visibleDocuments.map((doc) => (
            <div key={doc.id} className="clinical-budget-document-item">
              <div className="clinical-budget-document-info">
                <div className="clinical-budget-document-title">{doc.fileName}</div>
                <div className="clinical-budget-document-meta">
                  Gerado por {doc.createdByName || 'Usuário do sistema'}
                  {doc.createdAt && ` • ${new Date(doc.createdAt).toLocaleString('pt-BR')}`}
                  {doc.origin && ` • ${doc.origin}`}
                </div>
              </div>
              <div className="clinical-budget-document-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => handleViewDocument(doc)}
                  disabled={!doc.htmlContent}
                  title={!doc.htmlContent ? 'Gere novamente para visualizar' : 'Visualizar documento'}
                >
                  Visualizar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Tab: Histórico
function OrcamentoHistoricoTab({ appointmentId }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const clinicalEvents = getClinicalEvents(appointmentId);
    const budgetEvents = clinicalEvents.filter(e => 
      e.type.includes('budget') || e.type.includes('orçamento')
    );
    setEvents(budgetEvents);
  }, [appointmentId]);

  const getEventTypeLabel = (type) => {
    const labels = {
      'budget_created': 'Orçamento Criado',
      'budget_updated': 'Orçamento Atualizado',
      'budget_status_changed': 'Status Alterado',
      'budget_sent': 'Orçamento Enviado',
      'budget_approved': 'Orçamento Aprovado',
      'budget_rejected': 'Orçamento Reprovado',
    };
    return labels[type] || type;
  };

  return (
    <div className="clinical-budget-tab-content">
      <h3>Histórico de Alterações</h3>
      {events.length === 0 ? (
        <div className="clinical-empty-state">
          <History size={48} />
          <p>Nenhum evento registrado ainda.</p>
        </div>
      ) : (
        <div className="clinical-events-list">
          {events.map((event) => (
            <div key={event.id} className="clinical-event-item">
              <div className="clinical-event-time">
                {new Date(event.timestamp).toLocaleString('pt-BR')}
              </div>
              <div className="clinical-event-content">
                <strong>{getEventTypeLabel(event.type)}</strong>
                {event.data && Object.keys(event.data).length > 0 && (
                  <p>
                    {event.data.status && `Status: ${event.data.status}`}
                    {event.data.totalValue && ` | Valor: R$ ${event.data.totalValue.toFixed(2)}`}
                    {event.data.notes && ` | ${event.data.notes}`}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Seção: Contratos (bloqueia gerar/vincular contrato se cadastro com campos críticos pendentes)
function ContratosSection({ appointmentId, patientId }) {
  const navigate = useNavigate();
  const fullPatient = patientId ? getPatient(patientId) : null;
  const pendingCriticalFields = fullPatient?.profile?.pendingCriticalFields || [];
  const hasBlockingPending = pendingCriticalFields.length > 0;
  const [showBlockModal, setShowBlockModal] = useState(false);

  const handleContractAction = () => {
    if (hasBlockingPending) {
      setShowBlockModal(true);
      return;
    }
    // Futuro: abrir fluxo de vincular/gerar contrato
  };

  return (
    <>
      <SectionCard
        title="Contratos"
        description="Vincule contratos relacionados a este atendimento"
        actions={
          <button
            type="button"
            className="button primary"
            disabled={hasBlockingPending}
            title={hasBlockingPending ? 'Preencha os campos críticos do cadastro do paciente para habilitar.' : undefined}
            onClick={handleContractAction}
          >
            <Plus size={16} />
            Vincular Contrato
          </button>
        }
      >
        <div className="clinical-empty-state">
          <FileCheck size={48} />
          <p>Nenhum contrato vinculado ainda.</p>
        </div>
      </SectionCard>
      {showBlockModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contract-block-modal-title"
          onClick={(e) => e.target === e.currentTarget && setShowBlockModal(false)}
        >
          <div className="modal-content" style={{ maxWidth: '28rem' }}>
            <h3 id="contract-block-modal-title">Não é possível gerar contrato</h3>
            <p style={{ marginBottom: '1rem' }}>
              Não é possível gerar contrato enquanto faltarem informações importantes do cadastro.
            </p>
            <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Campos críticos faltando:</p>
            <ul style={{ margin: '0 0 1rem 1rem', padding: 0, fontSize: '0.875rem' }}>
              {pendingCriticalFields.map((key) => (
                <li key={key}>{PENDING_FIELDS_MAP[key] || key}</li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="button secondary" onClick={() => setShowBlockModal(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  setShowBlockModal(false);
                  if (patientId) navigate(`/pacientes/cadastro/${patientId}?highlight=pending`);
                }}
              >
                Preencher agora
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Seção: Convênios
function ConveniosSection({ patient }) {
  if (!patient) {
    return (
      <SectionCard
        title="Convênios"
        description="Informações sobre o convênio do paciente"
      >
        <div className="clinical-empty-state">
          <Activity size={48} />
          <p>Dados do paciente não disponíveis.</p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Convênios"
      description="Informações sobre o convênio do paciente"
    >
      {patient.insurance_provider ? (
        <div className="clinical-insurance-info">
          <h3>{patient.insurance_provider}</h3>
          {patient.insurance_number && <p>Número: {patient.insurance_number}</p>}
          {patient.insurance_plan && <p>Plano: {patient.insurance_plan}</p>}
        </div>
      ) : (
        <div className="clinical-empty-state">
          <CreditCard size={48} />
          <p>Paciente não possui convênio cadastrado.</p>
        </div>
      )}
    </SectionCard>
  );
}

// Seção: Dados Clínicos
function DadosClinicosSection({ appointmentId, patientId }) {
  const [activeSubmenu, setActiveSubmenu] = useState('odontograma');
  const navigate = useNavigate();

  const submenuItems = [
    { id: 'odontograma', label: 'Odontograma' },
    { id: 'situacao-bucal', label: 'Situação Bucal' },
    { id: 'situacao-facial', label: 'Situação Facial' },
    { id: 'situacao-fisica', label: 'Situação Física' },
    { id: 'historico-eventos', label: 'Histórico de Eventos' },
  ];

  return (
    <SectionCard
      title="Dados Clínicos"
      description="Acesse odontograma, histórico e informações clínicas do paciente"
    >
      <div className="clinical-submenu">
        {submenuItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`clinical-submenu-item ${activeSubmenu === item.id ? 'active' : ''}`}
            onClick={() => {
              setActiveSubmenu(item.id);
              if (item.id === 'odontograma') {
                navigate(`/pacientes/${patientId}/odontograma`);
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="clinical-submenu-content">
        {activeSubmenu === 'historico-eventos' && (
          <HistoricoEventos appointmentId={appointmentId} />
        )}
        {activeSubmenu !== 'historico-eventos' && (
          <div className="clinical-empty-state">
            <Activity size={48} />
            <p>Conteúdo em desenvolvimento.</p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// Componente: Histórico de Eventos
function HistoricoEventos({ appointmentId }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    // Carregar histórico de eventos
    const clinicalEvents = getClinicalEvents(appointmentId);
    setEvents(clinicalEvents);
  }, [appointmentId]);

  const getEventTypeLabel = (type) => {
    const labels = {
      'clinical_appointment_opened': 'Atendimento Clínico Aberto',
      'evolution_saved': 'Observação do Orçamento salva',
      'evolution_edited': 'Observação do Orçamento editada',
      'procedure_added': 'Procedimento Adicionado',
      'procedure_planned': 'Procedimento Planejado',
      'budget_generated': 'Orçamento Gerado',
      'budget_approved': 'Orçamento Aprovado',
      'appointment_finished': 'Atendimento Finalizado',
    };
    return labels[type] || type;
  };

  return (
    <div className="clinical-events-list">
      {events.length === 0 ? (
        <div className="clinical-empty-state">
          <Activity size={48} />
          <p>Nenhum evento registrado ainda.</p>
        </div>
      ) : (
        events.map((event) => (
          <div key={event.id} className="clinical-event-item">
            <div className="clinical-event-time">
              {new Date(event.timestamp).toLocaleString('pt-BR')}
            </div>
            <div className="clinical-event-content">
              <strong>{getEventTypeLabel(event.type)}</strong>
              {event.data && Object.keys(event.data).length > 0 && (
                <p>
                  {event.data.procedureName && `Procedimento: ${event.data.procedureName}`}
                  {event.data.plannedProceduresCount && `Procedimentos planejados: ${event.data.plannedProceduresCount}`}
                  {event.data.totalValue && `Valor total: R$ ${event.data.totalValue.toFixed(2)}`}
                </p>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// Modal: Adicionar Procedimento
function AddProcedureModal({ onClose, onAdd }) {
  const [name, setName] = useState('');
  const [tooth, setTooth] = useState('');
  const [region, setRegion] = useState('');
  const [value, setValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd({
      name,
      tooth: tooth || null,
      region: region || null,
      value: parseFloat(value) || 0,
      status: 'pending',
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Adicionar Procedimento</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>Nome do Procedimento</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Dente</label>
            <input
              type="text"
              value={tooth}
              onChange={(e) => setTooth(e.target.value)}
              placeholder="Ex: 16, 21, etc."
            />
          </div>
          <div className="form-group">
            <label>Região</label>
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Ex: Superior direito, etc."
            />
          </div>
          <div className="form-group">
            <label>Valor</label>
            <input
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="button secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="button primary">
              Adicionar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Error Boundary Component
class ClinicalAppointmentErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:getDerivedStateFromError',message:'Error Boundary caught error',data:{error:error.message,stack:error.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:componentDidCatch',message:'Error Boundary componentDidCatch',data:{error:error.message,stack:error.stack,errorInfo},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    console.error('Erro capturado pelo Error Boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: '2rem' }}>
          <div style={{ color: 'var(--color-error)', marginBottom: '1rem' }}>
            Erro ao carregar página: {this.state.error?.message || 'Erro desconhecido'}
          </div>
          <button 
            type="button" 
            className="button primary"
            onClick={() => window.location.href = '/gestao-comercial/jornada-do-paciente'}
          >
            Voltar para Jornada do Paciente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Export direto - renderização normal sem portal
export default function ClinicalAppointmentPage() {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ClinicalAppointmentPage.jsx:export default',message:'Wrapper component started',data:{pathname:window.location.pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  
  return <ClinicalAppointmentPageContent />;
}
